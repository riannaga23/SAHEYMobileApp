const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture(options = {}) {
  const slots = [], effects = [], shares = [], maps = [], cache = new Map();
  let cursor = 0, captures = 0, tree;
  const appState = { currentState: 'active' };
  const location = { latitude: 40.712876, longitude: -74.006123, acquiredAt: new Date().toISOString(), accuracyMeters: 75 };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, value => { slots[index].value = value; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect(callback) { const index = cursor++; if (!slots[index]) { slots[index] = {}; effects.push(() => { slots[index].cleanup = callback(); }); } },
  };
  const element = (type, props) => ({ type, props: props || {} });
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, console, Date, encodeURIComponent,
      require: name => {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element };
        if (name === 'expo-location') return { getForegroundPermissionsAsync: async () => ({ granted: true }), hasServicesEnabledAsync: async () => true };
        if (name === 'react-native') return {
          AppState: appState, ScrollView: 'ScrollView', Text: 'Text', View: 'View',
          Linking: { openURL: async url => maps.push(url), openSettings: async () => {} },
          Share: { share: async content => { shares.push(content); if (options.shareError) throw new Error('Share unavailable'); return { action: 'dismissedAction' }; } },
        };
        if (name === '../components/ui/app-layout') return { AppButton: 'AppButton', ui: {} };
        if (name === '../lib/distressLocation') return { getDistressLocation: async config => {
          assert.equal(config.purpose, 'sharing');
          captures++;
          return options.capture ? options.capture(captures) : { location: { ...location, latitude: location.latitude + (captures - 1) * 0.01 } };
        } };
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
        throw new Error(`Unexpected import ${name}`);
      },
    }, { filename: file });
    return module.exports;
  }
  const screen = load('src/app/location-sharing.tsx').default;
  function render() { cursor = 0; tree = screen(); while (effects.length) effects.shift()(); }
  function all(node) {
    if (node == null || typeof node === 'boolean') return [];
    if (Array.isArray(node)) return node.flatMap(item => all(item));
    if (typeof node !== 'object') return [node];
    return [node, ...all(node.props.children)];
  }
  function press(title) {
    render();
    const button = all(tree).find(node => node?.type === 'AppButton' && node.props.title === title);
    assert.ok(button, `Missing button ${title}`);
    button.props.onPress();
  }
  async function settle() { await new Promise(resolve => setImmediate(resolve)); render(); }
  render();
  return { shares, maps, location, appState, load, press, settle, captures: () => captures,
    text: () => { render(); return all(tree).filter(node => typeof node === 'string').join(' '); },
    unmount: () => slots.forEach(slot => slot.cleanup?.()) };
}

test('manual location sharing happens only on press and obtains a new fix on each share', async () => {
  const f = fixture();
  await f.settle();
  assert.equal(f.captures(), 0);
  assert.equal(f.shares.length, 0);
  f.press('Share my location'); await f.settle();
  assert.equal(f.captures(), 1);
  assert.equal(f.shares.length, 1);
  const message = f.shares[0].message;
  assert.match(message, /Approximate coordinates: 40.713, -74.006/);
  const link = message.match(/https:\/\/\S+/)[0];
  assert.equal(new URL(link).searchParams.get('query'), '40.713,-74.006');
  assert.doesNotMatch(message, /40.712876|-74.006123/);
  assert.match(message, /Captured:/);
  assert.match(message, /about 75 meters/);
  assert.match(message, /not live tracking/);
  f.press('Open Google Maps'); await f.settle();
  assert.equal(f.maps[0], link);
  f.press('Share my location'); await f.settle();
  assert.equal(f.captures(), 2);
  assert.notEqual(f.shares[1].message, message);
  assert.doesNotMatch(f.text(), /location shared|location sent/i);
});

test('location failure clears the previous preview and never shares an old fix', async () => {
  let succeed = true;
  const f = fixture({ capture: async () => succeed ? { location: { latitude: 1, longitude: 2, acquiredAt: new Date().toISOString(), accuracyMeters: null } }
    : { location: null, locationUnavailableReason: 'permission-denied' } });
  f.press('Share my location'); await f.settle();
  assert.equal(f.shares.length, 1);
  succeed = false;
  f.press('Share my location'); await f.settle();
  assert.equal(f.shares.length, 1);
  assert.match(f.text(), /Location access was not allowed/);
  assert.doesNotMatch(f.text(), /Approximate coordinates: 1.000/);
});

test('concurrent presses share once and leaving the screen prevents a late share sheet', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ capture: () => pending });
  f.press('Share my location');
  f.press('Finding your location...');
  assert.equal(f.captures(), 1);
  f.unmount();
  release({ location: f.location }); await f.settle();
  assert.equal(f.shares.length, 0);
});

test('backgrounding during capture does not open a late share sheet', async () => {
  let release;
  const f = fixture({ capture: () => new Promise(resolve => { release = resolve; }) });
  f.press('Share my location');
  f.appState.currentState = 'background';
  release({ location: f.location }); await f.settle();
  assert.equal(f.shares.length, 0);
  assert.match(f.text(), /Return to Halo/);
});

test('share sheet failures recover and do not claim delivery', async () => {
  const f = fixture({ shareError: true });
  f.press('Share my location'); await f.settle();
  assert.match(f.text(), /Unable to open sharing/);
  f.press('Share my location'); await f.settle();
  assert.equal(f.captures(), 2);
  assert.doesNotMatch(f.text(), /location shared|location sent/i);
});

test('approximate sharing labels recent positions, low accuracy, zero coordinates and unknown accuracy', () => {
  const f = fixture();
  const format = f.load('src/lib/locationSharing.ts').locationShareContent;
  const recent = format({ ...f.location, source: 'recent', accuracyMeters: 2000 });
  assert.match(recent.message, /recent Halo location \(last known position\)/);
  assert.equal(recent.coordinates, '40.71, -74.01');
  assert.equal(new URL(recent.mapsUrl).searchParams.get('query'), '40.71,-74.01');
  const zero = format({ ...f.location, latitude: 0, longitude: 0, accuracyMeters: null });
  assert.equal(zero.coordinates, '0.000, 0.000');
  assert.match(zero.message, /accuracy is unknown/);
});
