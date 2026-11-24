const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/wearable-fixture.cjs');

const board = { id: 'AA:BB:CC:DD:EE:FF', name: 'Halo-TinyS3' };

test('saved tap patterns migrate to Halo storage on Android and web without overwriting newer values', async () => {
  for (const os of ['android', 'web']) {
    const storage = new Map([['sahey.tapping-pattern-count', '4']]);
    const f = fixture({ os, storage });
    const patterns = f.load('src/lib/tappingPattern.ts');
    assert.equal(await patterns.loadTapCount(), 4);
    assert.equal(storage.get('halo.tapping-pattern-count'), '4');
    await patterns.saveTapCount(6);
    assert.equal(await patterns.loadTapCount(), 6);
    assert.equal(storage.get('sahey.tapping-pattern-count'), '4');
  }
});

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
  assert.equal(f.calls.emitted[0][0], 'halo.distress.confirmed');
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
  assert.equal(f.calls.emitted.filter(event => event[0] === 'halo.distress.confirmed').length, 0);
  for (const text of ['CONFIRMEDDISTRESS', 'Confirmed distress\0', 'CONFIRMED_DISTRESS', 'confirmed-distress']) {
    f.events.value(notification(text));
  }
  assert.equal(f.calls.emitted.filter(event => event[0] === 'halo.distress.confirmed').length, 4);
  f.events.disconnect({ peripheral: board.id });
  f.events.value(notification('CONFIRMEDDISTRESS'));
  assert.equal(f.calls.emitted.filter(event => event[0] === 'halo.distress.confirmed').length, 4);
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

test('idle tap and setup-result notifications never update backend state or emit UI events', async () => {
  const f = fixture({ characteristics: [messageCharacteristic] });
  await f.service.connectWearable(board);
  const original = f.service.getWearableSnapshot();
  for (const text of ['TAP 1', 'TAP 8', 'TAP -1', 'TOO FEW TAPS', 'PATTERN SAVED']) f.events.value(notification(text));
  assert.equal(f.service.getWearableSnapshot(), original);
  assert.deepEqual(f.calls.emitted, []);
  assert.equal(f.service.isWearableSetupRecording(), false);
  f.events.value(notification('CONFIRMEDDISTRESS'));
  assert.equal(f.calls.emitted[0][0], 'halo.distress.confirmed');
});

test('only a successful Begin command opens the backend tap gate and cancellation closes it', async () => {
  const f = fixture({ characteristics: [messageCharacteristic] });
  await f.service.connectWearable(board);
  await f.service.sendWearableCommand('BEGIN SET UP');
  assert.equal(Buffer.from(f.calls.writes[0][3]).toString(), 'BEGIN SET UP');
  assert.equal(f.calls.writes[0][2], '7d31d9c0-54fa-4b79-9e15-68ddc5fb7403');
  assert.equal(f.service.isWearableSetupRecording(), true);
  f.events.value(notification('TAP 2'));
  assert.equal(f.service.getWearableSnapshot().message.text, 'TAP 2');
  assert.deepEqual(f.calls.emitted, [['halo.bracelet.tap', 2]]);
  f.service.cancelWearableSetupSession();
  assert.equal(f.service.getWearableSnapshot().message, null);
  const original = f.service.getWearableSnapshot();
  f.events.value(notification('TAP 3'));
  assert.equal(f.service.getWearableSnapshot(), original);
  assert.equal(f.calls.emitted.length, 1);
  await f.service.sendWearableCommand('BEGIN SET UP');
  f.events.value(notification('TAP 1'));
  assert.equal(f.calls.emitted.at(-1)[1], 1);
});

test('notifications received during a command write are published only on success', async () => {
  for (const failWrite of [false, true]) {
    let release;
    const f = fixture({ characteristics: [messageCharacteristic], failWrite,
      writePromise: new Promise(resolve => { release = resolve; }) });
    await f.service.connectWearable(board);
    const command = f.service.sendWearableCommand('BEGIN SET UP');
    const rejected = failWrite ? assert.rejects(command, /Command write failed/) : null;
    await new Promise(resolve => setImmediate(resolve));
    f.events.value(notification('TAP 1'));
    f.events.value(notification('TAP 3'));
    assert.equal(f.service.isWearableSetupRecording(), false);
    assert.equal(f.service.getWearableSnapshot().message, null);
    assert.equal(f.calls.emitted.length, 0);
    release();
    if (rejected) await rejected; else await command;
    assert.equal(f.service.isWearableSetupRecording(), !failWrite);
    assert.equal(f.service.getWearableSnapshot().message?.text ?? null, failWrite ? null : 'TAP 3');
    assert.equal(f.calls.emitted.length, failWrite ? 0 : 1);
  }
});

test('cancelling a pending Begin cannot write or reopen a setup session afterward', async () => {
  for (const stage of ['permission', 'write']) {
    const options = { characteristics: [messageCharacteristic] };
    const f = fixture(options);
    await f.service.connectWearable(board);
    let release;
    options[stage === 'permission' ? 'permissionPromise' : 'writePromise'] = new Promise(resolve => { release = resolve; });
    const command = f.service.sendWearableCommand('BEGIN SET UP');
    const rejected = assert.rejects(command, /cancelled/);
    await new Promise(resolve => setImmediate(resolve));
    f.events.value(notification('TAP 2'));
    f.service.cancelWearableSetupSession();
    release(); await rejected;
    f.events.value(notification('TAP 9'));
    assert.equal(f.service.isWearableSetupRecording(), false);
    assert.equal(f.service.getWearableSnapshot().message, null);
    assert.equal(f.calls.emitted.length, 0);
    assert.equal(f.calls.writes.length, stage === 'permission' ? 0 : 1);
  }
});

test('firmware completion, detection mode and Bluetooth loss all require a new Begin', async () => {
  for (const ending of ['PATTERN SAVED', 'TOO FEW TAPS', 'DETECTION MODE', 'disconnect', 'bluetooth-off']) {
    const f = fixture({ characteristics: [messageCharacteristic] });
    await f.service.connectWearable(board);
    await f.service.sendWearableCommand('BEGIN SET UP');
    f.events.value(notification('TAP 3'));
    if (ending === 'disconnect') f.events.disconnect({ peripheral: board.id });
    else if (ending === 'bluetooth-off') f.events.state({ state: 'off' });
    else if (ending === 'DETECTION MODE') await f.service.sendWearableCommand(ending);
    else f.events.value(notification(ending));
    const original = f.service.getWearableSnapshot();
    const count = f.calls.emitted.length;
    f.events.value(notification('TAP 4'));
    assert.equal(f.service.getWearableSnapshot(), original);
    assert.equal(f.calls.emitted.length, count);
    assert.equal(f.service.isWearableSetupRecording(), false);
    if (ending === 'disconnect' || ending === 'bluetooth-off') {
      await f.service.connectWearable(board);
      f.events.value(notification('TAP 7'));
      assert.equal(f.service.getWearableSnapshot().message, null);
      assert.equal(f.calls.emitted.length, count);
    }
  }
});

test('an immediate completed pattern during the Begin write is buffered and emitted once', async () => {
  const f = fixture({ characteristics: [messageCharacteristic], onWrite: events => {
    events.value(notification('TAP 3'));
    events.value(notification('PATTERN SAVED'));
    events.value(notification('TAP 4'));
  } });
  await f.service.connectWearable(board);
  await f.service.sendWearableCommand('BEGIN SET UP');
  assert.deepEqual(f.calls.emitted, [['halo.bracelet.tap', 3], ['halo.bracelet.pattern-saved']]);
  assert.equal(f.service.getWearableSnapshot().message.text, 'PATTERN SAVED');
  assert.equal(f.service.isWearableSetupRecording(), false);
});
