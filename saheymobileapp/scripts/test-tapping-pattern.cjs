const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Render the screen's handlers with small React/native adapters, without a phone.
function fixture(options = {}) {
  const slots = [];
  const pending = [];
  const events = new Map();
  const connections = new Set();
  const commands = [];
  const saves = [];
  let cursor = 0;
  let focused = true;
  let tree;
  let appStateChanged;
  let backPressed;
  let exits = 0;
  let connection = { phase: 'connected' };
  let recording = false;
  let setupVersion = 0;
  const backend = options.realBackend ? require('./helpers/wearable-fixture.cjs').fixture({
    characteristics: [{ service: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401', characteristic: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402', properties: { Notify: 'Notify' } }],
    writePromise: options.commandPromise,
    emit: (name, value) => events.get(name)?.forEach(callback => callback(value)),
  }) : null;
  const router = { canGoBack: () => true, back: () => { exits++; }, replace: () => { exits++; } };
  const appState = { currentState: 'active', addEventListener: (_name, callback) => { appStateChanged = callback; return { remove() {} }; } };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(callback, deps) { effect('normal', callback, deps); },
  };
  function effect(kind, callback, deps) {
    const index = cursor++;
    const previous = slots[index];
    if (kind === 'focus' && !focused) return;
    if (previous && sameDeps(previous.deps, deps)) return;
    const slot = slots[index] = { kind, deps, cleanup: previous?.cleanup };
    pending.push(() => { slot.cleanup?.(); slot.cleanup = callback(); });
  }
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const module = { exports: {} };
  const file = path.join(__dirname, '../src/app/tapping-pattern.tsx');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Error, setTimeout, clearTimeout,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' };
      if (name === 'expo-router') return { Stack: { Screen: 'Screen' }, useRouter: () => router, useFocusEffect: callback => effect('focus', callback, [callback]) };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name === 'react-native') return {
        ActivityIndicator: 'ActivityIndicator', AppState: appState,
        BackHandler: { addEventListener: (_name, callback) => { backPressed = callback; return { remove() {} }; } },
        DeviceEventEmitter: { addListener: (name, callback) => {
          if (!events.has(name)) events.set(name, new Set());
          events.get(name).add(callback);
          return { remove: () => events.get(name).delete(callback) };
        } },
        Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
        StyleSheet: { create: value => value },
      };
      if (name === '../lib/tappingPattern') return {
        loadTapCount: async () => options.savedCount ?? null,
        saveTapCount: async count => { saves.push(count); },
      };
      if (name === '../lib/wearable') return backend?.service || {
        cancelWearableSetupSession: () => { setupVersion++; recording = false; },
        isWearableSetupRecording: () => recording,
        getWearableSnapshot: () => connection,
        subscribeWearable: callback => { connections.add(callback); return () => connections.delete(callback); },
        sendWearableCommand: async command => {
          const version = ++setupVersion;
          recording = false;
          commands.push(command);
          if (options.commandPromise) await options.commandPromise;
          if (options.failCommand) throw new Error('Command failed');
          if (version !== setupVersion) throw new Error('Setup cancelled');
          recording = command === 'BEGIN SET UP';
        },
      };
      throw new Error(`Unexpected import ${name}`);
    },
  }, { filename: file });
  function render() {
    cursor = 0;
    tree = module.exports.default();
    while (pending.length) pending.shift()();
    return tree;
  }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!node || typeof node !== 'object') return [];
    if (node.type === 'Modal' && !node.props.visible) return [];
    return [node, ...nodes(node.props.children)];
  }
  async function settle() {
    await new Promise(resolve => setImmediate(resolve)); render();
    await new Promise(resolve => setImmediate(resolve)); render();
  }
  render();
  return {
    commands, saves, settle, backend, recording: () => backend ? backend.service.isWearableSetupRecording() : recording,
    countLabel: () => { render(); return nodes(tree).find(node => node.props.testID === 'tap-count')?.props.accessibilityLabel; },
    press(label) {
      render();
      const button = nodes(tree).find(node => node.props.label === label);
      assert.ok(button, `Button not found: ${label}`);
      if (!button.props.disabled) button.props.onPress();
      render();
    },
    emit(name, value) { events.get(name)?.forEach(callback => callback(value)); render(); },
    background() { appState.currentState = 'background'; appStateChanged('background'); render(); },
    foreground() { appState.currentState = 'active'; appStateChanged('active'); render(); },
    blur() { focused = false; slots.filter(slot => slot.kind === 'focus').forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined; slot.deps = undefined; }); },
    focus() { focused = true; render(); },
    disconnect() { connection = { phase: 'disconnected' }; connections.forEach(callback => callback()); render(); },
    back() { backPressed(); render(); },
    exits: () => exits,
  };
}

test('opening the screen ignores taps and firmware save events until Begin is pressed', async () => {
  const f = fixture(); await f.settle();
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin wearable setup to start/);
  f.emit('halo.bracelet.tap', 5);
  f.emit('halo.bracelet.pattern-saved');
  f.emit('halo.bracelet.too-few');
  await f.settle();
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
  assert.deepEqual(f.commands, []);
  assert.deepEqual(f.saves, []);
});

test('Begin sends the command once, accepts taps, and saves only on firmware confirmation', async () => {
  const f = fixture(); await f.settle();
  f.press('Begin wearable setup');
  f.press('Begin wearable setup');
  await f.settle();
  assert.deepEqual(f.commands, ['BEGIN SET UP']);
  f.emit('halo.bracelet.tap', 3);
  assert.match(f.countLabel(), /Taps received: 3\. Recording from bracelet/);
  assert.deepEqual(f.saves, []);
  f.emit('halo.bracelet.pattern-saved');
  await f.settle();
  assert.deepEqual(f.saves, [3]);
  assert.deepEqual(f.commands, ['BEGIN SET UP', 'DETECTION MODE']);
  assert.match(f.countLabel(), /Pattern saved/);
});

test('confirming reset prepares an idle pattern and requires pressing Begin again', async () => {
  const f = fixture(); await f.settle();
  f.press('Begin wearable setup'); await f.settle();
  f.emit('halo.bracelet.tap', 2);
  f.press('Reset pattern');
  f.press('Set new pattern');
  assert.equal(f.recording(), false);
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
  f.emit('halo.bracelet.tap', 8);
  f.emit('halo.bracelet.pattern-saved');
  assert.deepEqual(f.commands, ['BEGIN SET UP']);
  assert.deepEqual(f.saves, []);
  f.press('Begin wearable setup'); await f.settle();
  f.emit('halo.bracelet.tap', 1);
  assert.deepEqual(f.commands, ['BEGIN SET UP', 'BEGIN SET UP']);
  assert.match(f.countLabel(), /Taps received: 1\. Recording/);
});

test('returning from the background or another screen requires pressing Begin again', async () => {
  for (const lifecycle of ['background', 'blur']) {
    const f = fixture(); await f.settle();
    f.press('Begin wearable setup'); await f.settle();
    f.emit('halo.bracelet.tap', 2);
    f[lifecycle]();
    f.emit('halo.bracelet.tap', 7);
    f.emit('halo.bracelet.pattern-saved');
    if (lifecycle === 'background') f.foreground(); else f.focus();
    await f.settle();
    assert.equal(f.recording(), false);
    assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
    assert.deepEqual(f.saves, []);
    f.press('Begin wearable setup'); await f.settle();
    f.emit('halo.bracelet.tap', 1);
    assert.match(f.countLabel(), /Taps received: 1\. Recording/);
  }
});

test('failed setup commands and disconnects disarm the tap counter', async () => {
  for (const failCommand of [true, false]) {
    const f = fixture({ failCommand }); await f.settle();
    f.press('Begin wearable setup'); await f.settle();
    if (!failCommand) f.disconnect();
    f.emit('halo.bracelet.tap', 4);
    f.emit('halo.bracelet.pattern-saved');
    await f.settle();
    assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
    assert.deepEqual(f.saves, []);
  }
});

test('a saved count is displayed without arming recording and legacy short counts remain idle', async () => {
  for (const savedCount of [2, 4]) {
    const f = fixture({ savedCount }); await f.settle();
    f.emit('halo.bracelet.tap', 9);
    assert.match(f.countLabel(), savedCount === 4 ? /Taps received: 4\. Pattern saved/ : /Taps received: 0\. Press Begin/);
    assert.deepEqual(f.commands, []);
    f.back();
    assert.equal(f.exits(), 1);
  }
});

test('cancelling the leave dialog preserves the session explicitly started with Begin', async () => {
  const f = fixture(); await f.settle();
  f.press('Begin wearable setup'); await f.settle();
  f.emit('halo.bracelet.tap', 1);
  f.back(); f.press('Keep editing');
  f.emit('halo.bracelet.tap', 2);
  assert.match(f.countLabel(), /Taps received: 2\. Recording/);
});

test('the real Bluetooth service and screen both ignore taps before Begin and after reset or exit', async () => {
  const f = fixture({ realBackend: true }); await f.settle();
  const board = { id: 'AA:BB:CC:DD:EE:FF', name: 'HALO-wearable' };
  const notify = text => f.backend.events.value({
    peripheral: board.id, service: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401',
    characteristic: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402', value: [...Buffer.from(text)],
  });
  await f.backend.service.connectWearable(board);
  notify('TAP 6');
  assert.equal(f.backend.service.getWearableSnapshot().message, null);
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
  f.press('Begin wearable setup'); await f.settle();
  notify('TAP 2');
  assert.equal(f.backend.service.getWearableSnapshot().message.text, 'TAP 2');
  assert.match(f.countLabel(), /Taps received: 2\. Recording/);
  f.press('Reset pattern'); f.press('Set new pattern');
  notify('TAP 9'); notify('PATTERN SAVED');
  assert.equal(f.backend.service.getWearableSnapshot().message, null);
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
  assert.deepEqual(f.saves, []);
  f.press('Begin wearable setup'); await f.settle();
  notify('TAP 1');
  assert.match(f.countLabel(), /Taps received: 1\. Recording/);
  f.blur(); notify('TAP 7'); f.focus(); await f.settle();
  assert.equal(f.backend.service.getWearableSnapshot().message, null);
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
  f.press('Begin wearable setup'); await f.settle();
  notify('TAP 1');
  f.background(); notify('TAP 8'); f.foreground(); await f.settle();
  assert.equal(f.backend.service.getWearableSnapshot().message, null);
  assert.equal(f.recording(), false);
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
  f.press('Begin wearable setup'); await f.settle();
  notify('TAP 3'); notify('PATTERN SAVED'); await f.settle();
  assert.deepEqual(f.saves, [3]);
  assert.equal(f.recording(), false);
  assert.match(f.countLabel(), /Pattern saved/);
  const savedMessage = f.backend.service.getWearableSnapshot().message;
  notify('TAP 10');
  assert.equal(f.backend.service.getWearableSnapshot().message, savedMessage);
  assert.match(f.countLabel(), /Taps received: 3\. Pattern saved/);
});

test('cancelling the screen during an actual pending BLE write cannot restart either tap counter', async () => {
  let release;
  const f = fixture({ realBackend: true, commandPromise: new Promise(resolve => { release = resolve; }) });
  await f.settle();
  await f.backend.service.connectWearable({ id: 'BOARD', name: 'HALO-wearable' });
  f.press('Begin wearable setup'); await f.settle();
  const notify = text => f.backend.events.value({
    peripheral: 'BOARD', service: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401',
    characteristic: '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402', value: [...Buffer.from(text)],
  });
  notify('TAP 3');
  assert.equal(f.backend.service.getWearableSnapshot().message, null);
  assert.match(f.countLabel(), /Taps received: 0\./);
  f.press('Reset pattern'); f.press('Set new pattern');
  release(); await f.settle(); notify('TAP 9');
  assert.equal(f.recording(), false);
  assert.equal(f.backend.service.getWearableSnapshot().message, null);
  assert.match(f.countLabel(), /Taps received: 0\. Press Begin/);
  assert.deepEqual(f.saves, []);
});
