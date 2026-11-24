const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const HALO_SERVICE_UUID =
  '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401';

const HALO_NOTIFY_UUID =
  '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402';

function fixture(options = {}) {
  const storage = options.storage || new Map();
  const events = {};
  const calls = { nativeImports: 0, connects: 0, disconnects: 0, scans: 0, notifications: [], emitted: [] };
  const native = {
    start: async () => {}, checkState: async () => options.bluetoothOff ? 'off' : 'on',
    scan: async scan => { calls.scans++; assert.equal(scan.seconds, 15); assert.equal(scan.serviceUUIDs.length, 0); },
    stopScan: async () => events.stop?.({ status: 0 }),
    connect: async () => { calls.connects++; if (options.connectPromise) await options.connectPromise; if (options.failConnect) throw new Error('Board unreachable'); },
    retrieveServices: async () => ({ name: 'Halo-TinyS3', services: options.noServices ? [] : [{ uuid: 'test-service' }], characteristics: options.characteristics ?? [] }),
    startNotification: async (...args) => { calls.notifications.push(args); if (options.failNotify) throw new Error('Subscription failed'); },
    onDidUpdateValueForCharacteristic: cb => { events.value = cb; return { remove() {} }; },
    disconnect: async id => { calls.disconnects++; events.disconnect?.({ peripheral: id }); },
    onDiscoverPeripheral: cb => { events.discover = cb; return { remove() {} }; },
    onStopScan: cb => { events.stop = cb; return { remove() {} }; },
    onDisconnectPeripheral: cb => { events.disconnect = cb; return { remove() {} }; },
    onDidUpdateState: cb => { events.state = cb; return { remove() {} }; },
  };
  const mocks = {
    'expo-constants': { __esModule: true, default: { executionEnvironment: options.expoGo ? 'storeClient' : 'bare' } },
    'expo-device': { isDevice: !options.emulator },
    'expo-secure-store': { getItemAsync: async key => storage.get(key) ?? null, setItemAsync: async (key, value) => storage.set(key, value) },
    'react-native': {
      DeviceEventEmitter: { emit: (...args) => calls.emitted.push(args) },
      Platform: { OS: 'android', Version: options.androidVersion || 35 },
      PermissionsAndroid: {
        PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect', ACCESS_FINE_LOCATION: 'location' }, RESULTS: { GRANTED: 'granted' },
        requestMultiple: async permissions => Object.fromEntries(permissions.map(p => [p, options.denied ? 'denied' : 'granted'])),
      },
    },
  };
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, console,
      setTimeout: (callback, ms) => setTimeout(callback, options.fastTimeout && ms === 20_000 ? 1 : ms), clearTimeout,
      require: name => {
        if (name === 'react-native-ble-manager') { calls.nativeImports++; return { default: native }; }
        if (name in mocks) return mocks[name];
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
        throw new Error(`Unexpected import ${name}`);
      },
    }, { filename: file });
    return module.exports;
  }
  return { service: load('src/lib/wearable.ts'), settings: load('src/lib/wearableStorage.ts'), events, calls, storage };
}
const board = { id: 'AA:BB:CC:DD:EE:FF', name: 'Halo-TinyS3' };

test('first run is shown until explicitly skipped; skip survives app restart', async () => {
  const f = fixture();
  assert.equal((await f.settings.loadWearableSetup()).completed, false);
  await f.service.skipWearableSetup();
  const nextLaunch = fixture({ storage: f.storage });
  assert.equal((await nextLaunch.settings.loadWearableSetup()).completed, true);
  assert.equal(nextLaunch.calls.nativeImports, 0);
});
test('Expo Go and emulator never import the unavailable native module', async () => {
  for (const options of [{ expoGo: true }, { emulator: true }]) {
    const f = fixture(options);
    await f.service.scanForWearables();
    assert.equal(f.calls.nativeImports, 0);
    assert.equal(f.service.getWearableSnapshot().phase, 'error');
    await f.service.skipWearableSetup();
  }
});
test('permission denial and Bluetooth off fail clearly', async () => {
  for (const options of [{ denied: true }, { bluetoothOff: true }]) {
    const f = fixture(options);
    await f.service.scanForWearables();
    assert.equal(f.calls.scans, 0);
    assert.equal(f.service.getWearableSnapshot().phase, 'error');
    assert.ok(f.service.getWearableSnapshot().error);
  }
});
test('scan deduplicates devices and successful discovery confirms connection', async () => {
  const f = fixture();
  await f.service.scanForWearables();
  f.events.discover({ ...board, rssi: -60, advertising: {} });
  f.events.discover({ ...board, rssi: -55, advertising: {} });
  assert.equal(f.service.getWearableSnapshot().devices.length, 1);
  await f.service.connectWearable(board);
  assert.equal(f.service.getWearableSnapshot().phase, 'connected');
  assert.equal((await f.settings.loadWearableSetup()).device.id, board.id);
  const restarted = fixture({ storage: f.storage });
  await restarted.service.refreshRememberedWearable();
  assert.equal(restarted.service.getWearableSnapshot().remembered.id, board.id);
  assert.equal(restarted.service.getWearableSnapshot().connected, null);
  f.events.disconnect({ peripheral: board.id });
  assert.equal(f.service.getWearableSnapshot().phase, 'disconnected');
  assert.equal(f.service.getWearableSnapshot().connected, null);
});
test('failed connection or missing services never completes first-run setup', async () => {
  for (const options of [{ failConnect: true }, { noServices: true }]) {
    const f = fixture(options);
    await f.service.connectWearable(board);
    assert.equal(f.service.getWearableSnapshot().connected, null);
    assert.equal(f.service.getWearableSnapshot().phase, 'error');
    assert.equal((await f.settings.loadWearableSetup()).completed, false);
  }
});
test('duplicate connect attempts are ignored; timed-out late connection is disconnected', async () => {
  let resolve;
  const connectPromise = new Promise(r => { resolve = r; });
  const f = fixture({ connectPromise, fastTimeout: true });
  const first = f.service.connectWearable(board);
  await f.service.connectWearable(board);
  await first;
  assert.equal(f.calls.connects, 1);
  assert.equal(f.service.getWearableSnapshot().connected, null);
  assert.match(f.service.getWearableSnapshot().error, /timed out/);
  resolve();
  await new Promise(r => setTimeout(r, 5));
  assert.ok(f.calls.disconnects >= 2);
  assert.equal((await f.settings.loadWearableSetup()).completed, false);
});
test('forget clears saved device without repeating first-run setup', async () => {
  const f = fixture();
  await f.service.connectWearable(board);
  await f.service.disconnectWearable(true);
  const saved = await f.settings.loadWearableSetup();
  assert.equal(saved.device, null);
  assert.equal(saved.completed, true);
});
test('Bluetooth turning off clears live connection', async () => {
  const f = fixture();
  await f.service.connectWearable(board);
  f.events.state({ state: 'off' });
  assert.equal(f.service.getWearableSnapshot().connected, null);
  assert.equal(f.service.getWearableSnapshot().phase, 'disconnected');
});

const messageCharacteristic = {
  service: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401',
  characteristic: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402',
  properties: { Notify: 'Notify' },
};
const notification = text => ({
  peripheral: board.id,
  service: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401',
  characteristic: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402',
  value: [...Buffer.from(text)],
});


test('subscribes to notifications and receives distress text only from the selected board and characteristic', async () => {
  const f = fixture({ characteristics: [messageCharacteristic] });

  await f.service.connectWearable(board);

  // Expect the real HALO notification UUIDs.
  assert.deepEqual(f.calls.notifications, [
    [
      board.id,
      '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401',
      '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402',
    ],
  ]);

  f.events.value({
    ...notification('wrong board'),
    peripheral: 'OTHER',
  });

  f.events.value({
    ...notification('wrong characteristic'),
    characteristic: 'other',
  });

  assert.equal(f.service.getWearableSnapshot().message, null);

  f.events.value(notification('CONFIRMEDDISTRESS\0'));

  assert.equal(
    f.service.getWearableSnapshot().message.text,
    'CONFIRMEDDISTRESS'
  );

  assert.ok(
    f.service.getWearableSnapshot().message.receivedAt > 0
  );
  assert.equal(f.calls.emitted.length, 1);
  assert.equal(f.calls.emitted[0][0], 'sahey.distress.confirmed');
  assert.equal(f.calls.emitted[0][1].deviceId, board.id);
  assert.equal(f.calls.emitted[0][1].receivedAt, f.service.getWearableSnapshot().message.receivedAt);

  f.events.disconnect({ peripheral: board.id });

  f.events.value(notification('late message'));

  assert.equal(
    f.service.getWearableSnapshot().message.text,
    'CONFIRMEDDISTRESS'
  );

  await f.service.connectWearable(board);

  assert.equal(f.service.getWearableSnapshot().message, null);
  assert.equal(f.calls.notifications.length, 2);
});

test('only complete confirmed distress messages emit email events', async () => {
  const f = fixture({ characteristics: [messageCharacteristic] });
  await f.service.connectWearable(board);
  for (const text of ['distress', 'UNCONFIRMEDDISTRESS', 'NOT CONFIRMED DISTRESS', 'TAP 1', 'PATTERN SAVED']) {
    f.events.value(notification(text));
  }
  f.events.value({ ...notification('CONFIRMEDDISTRESS'), peripheral: 'OTHER' });
  f.events.value({ ...notification('CONFIRMEDDISTRESS'), characteristic: 'OTHER' });
  assert.equal(f.calls.emitted.filter(event => event[0] === 'sahey.distress.confirmed').length, 0);
  for (const text of ['CONFIRMEDDISTRESS', 'Confirmed distress\0', 'CONFIRMED_DISTRESS', 'confirmed-distress']) {
    f.events.value(notification(text));
  }
  assert.equal(f.calls.emitted.filter(event => event[0] === 'sahey.distress.confirmed').length, 4);
  f.events.disconnect({ peripheral: board.id });
  f.events.value(notification('CONFIRMEDDISTRESS'));
  assert.equal(f.calls.emitted.filter(event => event[0] === 'sahey.distress.confirmed').length, 4);
});


test('missing or failed notifications keep connection but explain message availability', async () => {
  for (const options of [{}, { characteristics: [messageCharacteristic], failNotify: true }]) {
    const f = fixture(options);
    await f.service.connectWearable(board);
    assert.equal(f.service.getWearableSnapshot().phase, 'connected');
    assert.match(f.service.getWearableSnapshot().messageStatus, /No message notifications|Could not enable messages/);
    f.events.value(notification('CONFIRMEDDISTRESS'));
    assert.equal(f.service.getWearableSnapshot().message, null);
  }
});
