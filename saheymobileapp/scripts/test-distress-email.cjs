const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createDistressEmailHandler, configuration } = require('../src/server/distress-email.cjs');
const { createServer } = require('./distress-email-server.cjs');

const NOW = Date.now();
const ENV = { NODE_ENV: 'development', RESEND_API_KEY: 'test-key', SAHEY_FROM_EMAIL: 'Halo <alerts@example.com>', SAHEY_TEST_RECIPIENTS: 'one@recipient.test' };
const payload = (overrides = {}) => ({ type: 'CONFIRMED_DISTRESS', eventId: 'distress-event-123', occurredAt: new Date(NOW).toISOString(), to: ['one@recipient.test'], ...overrides });
const request = (value = payload(), headers = {}) => new Request('http://localhost/api/distress', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value),
});
function serverFixture(options = {}) {
  const calls = [];
  const handle = createDistressEmailHandler({
    env: { ...ENV }, now: () => NOW,
    fetch: async (url, init) => { calls.push({ url, ...init }); return Response.json({ id: 'email-123' }); },
    ...options,
  });
  return { handle, calls };
}

test('server requires sender credentials and ignores obsolete configured recipient lists', () => {
  assert.deepEqual(configuration(ENV), { key: ENV.RESEND_API_KEY, from: ENV.SAHEY_FROM_EMAIL });
  assert.equal(configuration({ RESEND_API_KEY: 'key' }).from, 'SAHEY Demo <onboarding@resend.dev>');
  assert.equal(configuration({ ...ENV, SAHEY_TEST_RECIPIENTS: 'invalid', SAHEY_TEST_EMAIL: 'your-address@example.com' }).key, ENV.RESEND_API_KEY);
  for (const env of [{}, { ...ENV, RESEND_API_KEY: '' }, { ...ENV, SAHEY_FROM_EMAIL: 'not an address' }]) {
    assert.throws(() => configuration(env), /Configure/);
  }
});

test('placeholder recipients are rejected locally before calling Resend', async () => {
  for (const email of ['your-address@example.com', 'test@example.net', 'test@example.org', 'test@sub.example.com']) {
    const f = serverFixture();
    const response = await f.handle(request(payload({ to: [email] })));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /placeholder/);
    assert.equal(f.calls.length, 0);
  }
});

test('production requests and missing configuration never contact the provider', async () => {
  for (const [env, status] of [[{ ...ENV, NODE_ENV: 'production' }, 403], [{ NODE_ENV: 'development' }, 503]]) {
    const f = serverFixture({ env });
    assert.equal((await f.handle(request())).status, status);
    assert.equal(f.calls.length, 0);
  }
});

test('requires a recent confirmed signal and valid JSON before sending', async () => {
  const f = serverFixture();
  for (const value of [null, [], {}, payload({ type: 'TAP' }), payload({ eventId: '../bad' }),
    payload({ occurredAt: 'invalid' }), payload({ occurredAt: new Date(NOW - 300001).toISOString() }),
    payload({ occurredAt: new Date(NOW + 10001).toISOString() })]) {
    assert.equal((await f.handle(request(value))).status, 400);
  }
  assert.equal((await f.handle(new Request('http://localhost/api/distress'))).status, 405);
  assert.equal((await f.handle(request(payload(), { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await f.handle(new Request('http://localhost/api/distress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await f.handle(request({ padding: 'x'.repeat(5000) }))).status, 413);
  assert.equal(f.calls.length, 0);
});

test('uses saved contact recipients from the app and only confirms a provider email ID', async () => {
  const f = serverFixture();
  const response = await f.handle(request(payload({ to: ['saved-contact@recipient.test'] })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { success: true, ids: ['email-123'], accepted: 1 });
  const body = JSON.parse(f.calls[0].body);
  assert.deepEqual(body.to, ['saved-contact@recipient.test']);
  assert.equal(body.from, ENV.SAHEY_FROM_EMAIL);
  assert.match(body.text, /development test/);
  assert.match(body.text, new RegExp(payload().occurredAt.replace(/[.]/g, '\\.')));
  assert.equal(f.calls[0].headers['Idempotency-Key'], 'sahey-distress/distress-event-123');
});

test('multiple recipients get private messages in a single batch', async () => {
  let sent;
  const f = serverFixture({
    env: { ...ENV, SAHEY_TEST_RECIPIENTS: 'obsolete@example.com' },
    fetch: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return Response.json({ data: [{ id: 'one' }, { id: 'two' }] }); },
  });
  assert.equal((await f.handle(request(payload({ to: ['one@recipient.test', 'two@recipient.test'] })))).status, 200);
  assert.equal(sent.url, 'https://api.resend.com/emails/batch');
  assert.deepEqual(sent.body.map(message => message.to), [['one@recipient.test'], ['two@recipient.test']]);
});

test('missing, invalid, duplicate and oversized saved contact lists never send to an environment fallback', async () => {
  const f = serverFixture();
  for (const to of [undefined, null, [], 'one@recipient.test', ['invalid'], [1], ['one@recipient.test', ' ONE@recipient.test '],
    Array.from({ length: 11 }, (_, n) => `${n}@recipient.test`)]) {
    assert.equal((await f.handle(request(payload({ to })))).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('recipient changes cannot reuse an accepted incident but reordering is idempotent', async () => {
  let count = 0;
  const f = serverFixture({ fetch: async () => { count++; return Response.json({ data: [{ id: 'one' }, { id: 'two' }] }); } });
  assert.equal((await f.handle(request(payload({ to: ['one@recipient.test', 'two@recipient.test'] })))).status, 200);
  assert.equal((await f.handle(request(payload({ to: [' TWO@recipient.test ', 'one@recipient.test'] })))).status, 200);
  assert.equal((await f.handle(request(payload({ to: ['three@recipient.test'] })))).status, 409);
  assert.equal(count, 1);
});

test('concurrent duplicates share one operation and later duplicates return cached acceptance', async () => {
  let release;
  let count = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const f = serverFixture({ fetch: async () => { count++; await gate; return Response.json({ id: 'shared-id' }); } });
  const first = f.handle(request());
  const second = f.handle(request());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(count, 1);
  release();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  const duplicate = await f.handle(request());
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(count, 1);
  assert.equal((await f.handle(request(payload({ occurredAt: new Date(NOW - 1000).toISOString() })))).status, 409);
});

test('provider failures release the cooldown and retries keep exactly the same provider payload', async () => {
  let count = 0;
  const calls = [];
  const f = serverFixture({ fetch: async (_url, init) => {
    calls.push(init); count++;
    if (count === 1) throw new Error('Lost response');
    return Response.json({ id: 'retried-id' });
  } });
  const first = await f.handle(request());
  assert.equal(first.status, 502);
  assert.equal((await first.json()).retryable, true);
  assert.equal((await f.handle(request())).status, 200);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  // Recovery also starts the cooldown; distinct requests are not reported as sent.
  assert.equal((await f.handle(request(payload({ eventId: 'different-event' })))).status, 429);
  assert.equal((await f.handle(request(payload({ eventId: 'another-event' })))).status, 429);
});

test('a rejected provider request does not block a subsequent new signal', async () => {
  let count = 0;
  const f = serverFixture({ fetch: async () => ++count === 1
    ? Response.json({ message: 'Unavailable' }, { status: 503 })
    : Response.json({ id: 'recovered' }) });
  assert.equal((await f.handle(request())).status, 502);
  assert.equal((await f.handle(request(payload({ eventId: 'different-event' })))).status, 200);
});

test('a new signal can send after the cooldown expires', async () => {
  let time = NOW;
  const f = serverFixture({ now: () => time });
  assert.equal((await f.handle(request())).status, 200);
  assert.equal((await f.handle(request(payload({ eventId: 'different-event' })))).status, 429);
  time += 60_001;
  assert.equal((await f.handle(request(payload({ eventId: 'different-event', occurredAt: new Date(time).toISOString() })))).status, 200);
  assert.equal(f.calls.length, 2);
});

test('provider errors, malformed responses and missing IDs never report success', async () => {
  for (const [factory, retryable] of [
    [() => Response.json({ message: 'Invalid key' }, { status: 401 }), false],
    [() => Response.json({ message: 'Rate limited' }, { status: 429 }), true],
    [() => Response.json({ name: 'concurrent_idempotent_requests' }, { status: 409 }), true],
    [() => Response.json({ name: 'invalid_idempotent_request' }, { status: 409 }), false],
    [() => Response.json({}), true], [() => Response.json(null), true],
    [() => new Response('Not JSON', { status: 503 }), true],
  ]) {
    const f = serverFixture({ fetch: async () => factory() });
    const response = await f.handle(request());
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.retryable, retryable);
    assert.equal(body.success, undefined);
  }
  const f = serverFixture({ fetch: async () => Response.json({ message: 'You can only send testing emails to your own email address. Verify a domain.' }, { status: 403 }) });
  assert.match((await (await f.handle(request())).json()).error, /verified Resend domain/);
});

test('HTTP 422 returns the specific provider validation reason without retrying or exposing a key', async () => {
  for (const nested of [false, true]) {
    const detail = { name: 'validation_error', message: 'Invalid `from` field. Use email@example.com or Name <email@example.com>.' };
    const server = serverFixture({ fetch: async () => Response.json(nested ? { error: detail } : detail, { status: 422 }) });
    const f = clientFixture({ fetch: async (url, init) => server.handle(new Request(url, init)) });
    await f.service.sendConfirmedDistressEmail(f.signal());
    assert.equal(f.calls.length, 1);
    assert.equal(f.alerts[0][0], 'Distress email rejected');
    assert.match(f.alerts[0][1], /HTTP 422, validation_error/);
    assert.match(f.alerts[0][1], /Invalid `from` field/);
    assert.doesNotMatch(f.alerts[0][1], /Check the server and connection/);
  }
  const f = serverFixture({ fetch: async () => Response.json({ name: 'validation_error', message: `Invalid value: ${ENV.RESEND_API_KEY} or re_secret123` }, { status: 422 }) });
  const body = await (await f.handle(request())).json();
  assert.equal(body.providerStatus, 422);
  assert.equal(body.providerCode, 'validation_error');
  assert.equal(body.delivery, 'rejected');
  assert.equal(body.retryable, false);
  assert.doesNotMatch(body.error, /test-key|re_secret123/);
});

test('provider errors without details point to API logs instead of guessing the cause', async () => {
  const f = serverFixture({ fetch: async () => new Response('Bad upstream response', { status: 422 }) });
  const body = await (await f.handle(request())).json();
  assert.match(body.error, /Resend API logs/);
  assert.equal(body.providerStatus, 422);
  assert.equal(body.retryable, false);
});

test('provider timeouts abort the request and permit recovery', async () => {
  let aborted = false;
  const f = serverFixture({ timeoutMs: 5, fetch: async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('Aborted')); });
  }) });
  assert.equal((await f.handle(request())).status, 502);
  assert.equal(aborted, true);
});

test('standalone adapter serves the same validated flow without a real email', async t => {
  const server = createServer({ env: ENV, now: () => NOW, fetch: async () => Response.json({ id: 'adapter-id' }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/distress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ids[0], 'adapter-id');
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(`${base}/distress`)).status, 405);
});

function clientFixture(options = {}) {
  const calls = [];
  const alerts = [];
  const cache = new Map();
  const storage = options.storage || new Map([['sahey.emergency-contacts-email', JSON.stringify(options.contacts ?? [{ name: 'One', email: 'one@recipient.test' }])]]);
  let currentTime = NOW;
  class Clock extends Date { static now() { return currentTime; } }
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, console, URL, AbortController, Date: Clock,
      process: { env: options.env ?? { EXPO_PUBLIC_API_URL: 'http://dev-host:8083/' } },
      setTimeout: (callback, ms) => setTimeout(callback, ms === 15_000 ? (options.timeoutMs ?? ms) : 0), clearTimeout,
      fetch: async (...args) => { calls.push(args); return options.fetch ? options.fetch(...args) : Response.json({ success: true, ids: JSON.parse(args[1].body).to.map((_, n) => `client-email-id-${n}`) }); },
      require: name => {
        if (name === 'react-native') return { Alert: { alert: (...args) => alerts.push(args) }, DeviceEventEmitter: options.emitter };
        if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: { hostUri: options.hostUri } } };
        if (name === 'expo-device') return { isDevice: options.isDevice ?? true };
        if (name === 'expo-secure-store') return {
          getItemAsync: async key => { if (options.failStorage) throw new Error('Could not read emergency contacts.'); return storage.get(key) ?? null; },
          setItemAsync: async (key, value) => storage.set(key, value),
        };
        if (name === 'react') return { useEffect: effect => { options.cleanup = effect(); } };
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
        throw new Error(`Unexpected import ${name}`);
      },
    }, { filename: file });
    return module.exports;
  }
  const service = load('src/lib/distressEmail.ts');
  return { service, calls, alerts, load, options, storage, advance(ms) { currentTime += ms; }, signal: () => ({ deviceId: 'BOARD', receivedAt: currentTime }) };
}

test('app sends to the configured API and suppresses concurrent and recent duplicate signals', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = clientFixture({ fetch: async () => { await gate; return Response.json({ success: true, ids: ['accepted'] }); } });
  const first = f.service.sendConfirmedDistressEmail(f.signal());
  const duplicate = f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(first, duplicate);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1);
  assert.equal(f.service.getDistressEmailStatus().phase, 'sending');
  release(); await first;
  assert.equal(f.calls[0][0], 'http://dev-host:8083/api/distress');
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 1);
  assert.equal(f.alerts.length, 1);
  assert.equal(f.service.getDistressEmailStatus().phase, 'accepted');
  f.advance(60_001);
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 2);
  assert.notEqual(JSON.parse(f.calls[0][1].body).eventId, JSON.parse(f.calls[1][1].body).eventId);
});

test('network retries and later repeated signals reuse the incident after failure', async () => {
  let fail = true;
  const f = clientFixture({ fetch: async () => { if (fail) throw new Error('Offline'); return Response.json({ success: true, ids: ['accepted'] }); } });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 3);
  assert.equal(f.service.getDistressEmailStatus().phase, 'failed');
  fail = false;
  f.advance(1000);
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 4);
  assert.equal(new Set(f.calls.map(call => call[1].body)).size, 1);
  assert.equal(f.service.getDistressEmailStatus().phase, 'accepted');
});

test('app never treats invalid or unsuccessful server responses as accepted', async () => {
  for (const response of [() => Response.json({ error: 'Verify sender', retryable: false }, { status: 502 }), () => Response.json({ success: true }), () => Response.json(null)]) {
    const f = clientFixture({ fetch: async () => response() });
    await f.service.sendConfirmedDistressEmail(f.signal());
    assert.equal(f.service.getDistressEmailStatus().phase, 'failed');
    assert.equal(f.alerts.length, 1);
    assert.equal(f.alerts[0][0], 'Distress email not confirmed');
  }
});

test('app request timeouts abort and release the sending state', async () => {
  let count = 0;
  const f = clientFixture({ timeoutMs: 2, fetch: async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { count++; reject(new Error('Timed out')); });
  }) });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(count, 3);
  assert.equal(f.service.getDistressEmailStatus().phase, 'failed');
});

test('missing URLs and invalid signal payloads do not submit email requests', async () => {
  const f = clientFixture({ env: {} });
  for (const signal of [undefined, {}, { deviceId: '', receivedAt: NOW }, { deviceId: 'BOARD', receivedAt: Infinity }, { deviceId: 'BOARD', receivedAt: NOW + 20_000 }]) {
    await f.service.sendConfirmedDistressEmail(signal);
  }
  assert.equal(f.alerts.length, 0);
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 0);
  assert.equal(f.service.getDistressEmailStatus().phase, 'failed');
  assert.match(f.alerts[0][1], /EXPO_PUBLIC_API_URL/);
});

test('explicit standalone URL is honored and emulator URLs use the Expo host on physical phones', async () => {
  const f = clientFixture({ env: { EXPO_PUBLIC_DISTRESS_EMAIL_URL: 'http://dev-host:8787/distress' } });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls[0][0], 'http://dev-host:8787/distress');
  const physical = clientFixture({ env: { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:8083' }, hostUri: '192.168.1.10:8083' });
  await physical.service.sendConfirmedDistressEmail(physical.signal());
  assert.equal(physical.calls[0][0], 'http://192.168.1.10:8083/api/distress');
  const emulator = clientFixture({ isDevice: false, env: { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:8083' } });
  await emulator.service.sendConfirmedDistressEmail(emulator.signal());
  assert.equal(emulator.calls[0][0], 'http://10.0.2.2:8083/api/distress');
  const unreachable = clientFixture({ env: { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:8083' } });
  await unreachable.service.sendConfirmedDistressEmail(unreachable.signal());
  assert.equal(unreachable.calls.length, 0);
  assert.match(unreachable.alerts[0][1], /LAN address/);
});

test('root listener forwards validated events and removes its subscription', async () => {
  let callback;
  let removed = false;
  const f = clientFixture({ emitter: { addListener: (name, cb) => {
    assert.equal(name, 'sahey.distress.confirmed'); callback = cb;
    return { remove: () => { removed = true; } };
  } } });
  const Listener = f.load('src/components/distress-email-listener.tsx').default;
  Listener();
  await callback(f.signal());
  assert.equal(f.calls.length, 1);
  f.options.cleanup();
  assert.equal(removed, true);
  // Inspect JSX structure so the original unmounted-listener regression is covered.
  const root = ts.createSourceFile('layout.tsx', fs.readFileSync(path.join(__dirname, '../src/app/_layout.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let mounted = false;
  function visit(node) { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(root) === 'DistressEmailListener') mounted = true; ts.forEachChild(node, visit); }
  visit(root);
  assert.equal(mounted, true);
});

test('app-to-handler integration recovers from a lost acknowledgement with one provider operation', async () => {
  const server = serverFixture();
  let count = 0;
  const f = clientFixture({ fetch: async (url, init) => {
    const response = await server.handle(new Request(url, init));
    if (++count === 1) throw new Error('Acknowledgement lost after provider acceptance');
    return response;
  } });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 2);
  assert.equal(server.calls.length, 1);
  assert.equal(f.service.getDistressEmailStatus().phase, 'accepted');
});

test('confirmed distress emails every saved contact privately without an environment recipient list', async () => {
  let messages;
  const server = serverFixture({
    env: { NODE_ENV: 'development', RESEND_API_KEY: 'key', SAHEY_FROM_EMAIL: ENV.SAHEY_FROM_EMAIL },
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.resend.com/emails/batch');
      messages = JSON.parse(init.body);
      return Response.json({ data: messages.map((_, n) => ({ id: `email-${n}` })) });
    },
  });
  const f = clientFixture({
    contacts: [{ name: 'Two', email: ' TWO@recipient.test ' }, { name: 'One', email: 'one@recipient.test' }, { name: 'Duplicate', email: 'ONE@recipient.test' }],
    fetch: async (url, init) => server.handle(new Request(url, init)),
  });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.deepEqual(messages.map(message => message.to), [['one@recipient.test'], ['two@recipient.test']]);
  assert.equal(f.service.getDistressEmailStatus().phase, 'accepted');
  assert.match(f.alerts[0][1], /all 2 saved emergency contact/);
});

test('missing or invalid contacts and storage errors never send a distress request', async () => {
  for (const options of [
    { contacts: [] }, { contacts: [{ name: 'Invalid', email: 'not-an-email' }] },
    { contacts: [{ name: 'Placeholder', email: 'you@example.com' }] },
    { contacts: Array.from({ length: 11 }, (_, n) => ({ name: `${n}`, email: `${n}@recipient.test` })) },
    { failStorage: true },
  ]) {
    const f = clientFixture(options);
    await f.service.sendConfirmedDistressEmail(f.signal());
    assert.equal(f.calls.length, 0);
    assert.equal(f.service.getDistressEmailStatus().phase, 'failed');
    assert.match(f.alerts[0][1], /contact/i);
  }
});

test('retries retain the original contacts while a later incident uses newly saved contacts', async () => {
  const key = 'sahey.emergency-contacts-email';
  const storage = new Map([[key, JSON.stringify([{ name: 'Original', email: 'original@recipient.test' }])]]);
  let first = true;
  const f = clientFixture({ storage, fetch: async (_url, init) => {
    if (first) {
      first = false;
      storage.set(key, JSON.stringify([{ name: 'New', email: 'new@recipient.test' }]));
      throw new Error('Response lost');
    }
    return Response.json({ success: true, ids: ['accepted'] });
  } });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][1].body, f.calls[1][1].body);
  assert.deepEqual(JSON.parse(f.calls[1][1].body).to, ['original@recipient.test']);
  f.advance(60_001);
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.deepEqual(JSON.parse(f.calls[2][1].body).to, ['new@recipient.test']);
});

test('the legacy saved emergency contact is used by automatic distress emails', async () => {
  const f = clientFixture({ storage: new Map([['sahey.emergency-contact-email', JSON.stringify({ name: 'Legacy', email: 'legacy@recipient.test' })]]) });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.deepEqual(JSON.parse(f.calls[0][1].body).to, ['legacy@recipient.test']);
});

test('acceptance for only some saved contacts is never reported as success', async () => {
  const f = clientFixture({
    contacts: [{ name: 'One', email: 'one@recipient.test' }, { name: 'Two', email: 'two@recipient.test' }],
    fetch: async () => Response.json({ success: true, ids: ['only-one'] }),
  });
  await f.service.sendConfirmedDistressEmail(f.signal());
  assert.equal(f.calls.length, 3);
  assert.equal(f.service.getDistressEmailStatus().phase, 'failed');
});
