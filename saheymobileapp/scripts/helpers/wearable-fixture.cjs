const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture(options = {}) {
  const storage = options.storage || new Map();
  const events = {};
  const calls = { nativeImports: 0, connects: 0, disconnects: 0, scans: 0, notifications: [], emitted: [], writes: [] };
  const native = {
    start: async () => {}, checkState: async () => options.bluetoothOff ? 'off' : 'on',
    scan: async scan => { calls.scans++; assert.equal(scan.seconds, 15); assert.equal(scan.serviceUUIDs.length, 0); },
    stopScan: async () => events.stop?.({ status: 0 }),
    connect: async () => { calls.connects++; if (options.connectPromise) await options.connectPromise; if (options.failConnect) throw new Error('Board unreachable'); },
    retrieveServices: async () => ({ name: 'Halo-TinyS3', services: options.noServices ? [] : [{ uuid: 'test-service' }], characteristics: options.characteristics ?? [] }),
    startNotification: async (...args) => { calls.notifications.push(args); if (options.failNotify) throw new Error('Subscription failed'); },
    write: async (...args) => {
      calls.writes.push(args);
      options.onWrite?.(events);
      if (options.writePromise) await options.writePromise;
      if (options.failWrite) throw new Error('Command write failed');
    },
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
      DeviceEventEmitter: { emit: (...args) => { calls.emitted.push(args); options.emit?.(...args); } },
      Platform: { OS: options.os || 'android', Version: options.androidVersion || 35 },
      PermissionsAndroid: {
        PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect', ACCESS_FINE_LOCATION: 'location' }, RESULTS: { GRANTED: 'granted' },
        requestMultiple: async permissions => {
          if (options.permissionPromise) await options.permissionPromise;
          return Object.fromEntries(permissions.map(p => [p, options.denied ? 'denied' : 'granted']));
        },
      },
    },
  };
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '../..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, console, TextEncoder,
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
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
  return { service: load('src/lib/wearable.ts'), settings: load('src/lib/wearableStorage.ts'), events, calls, storage, load };
}
module.exports = { fixture };
