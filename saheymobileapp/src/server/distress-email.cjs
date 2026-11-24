// Server-only shared implementation for Expo and the optional standalone adapter.
const MAX_BODY_BYTES = 4096;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function configuration(env) {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.SAHEY_FROM_EMAIL?.trim() || 'SAHEY Demo <onboarding@resend.dev>';
  const sender = /^(?:[^<>\r\n]+<([^<>]+)>|([^<>]+))$/.exec(from);
  if (!key || !sender || !EMAIL.test((sender[1] || sender[2]).trim())) {
    throw new Error('Configure RESEND_API_KEY and a valid SAHEY_FROM_EMAIL, then restart the server.');
  }
  return { key, from };
}

function providerFailure(response, result, config) {
  const detail = result?.error && typeof result.error === 'object' ? result.error : result;
  const code = typeof detail?.name === 'string' && /^[a-z0-9_]{1,80}$/i.test(detail.name) ? detail.name : undefined;
  let message = typeof detail?.message === 'string' ? detail.message : '';
  // Provider validation messages can echo request fields. Never expose the key.
  message = message.split(config.key).join('[redacted]').replace(/\bre_[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
  const retryable = response.status === 429 || response.status >= 500
    || (response.status === 409 && code === 'concurrent_idempotent_requests');
  let error = `Resend rejected the email request (HTTP ${response.status}${code ? `, ${code}` : ''}).`;
  error += message ? ` ${message}` : ' Open the failed request in Resend API logs to see the validation details.';
  if (/only send testing|verify a domain|domain.*not verified/i.test(message)) {
    error += ' Set SAHEY_FROM_EMAIL to an address on your verified Resend domain, or use onboarding@resend.dev with your Resend account email as the test recipient.';
  }
  return {
    error, retryable, delivery: retryable ? 'unconfirmed' : 'rejected',
    providerStatus: response.status, ...(code ? { providerCode: code } : {}),
  };
}

async function readPayload(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return { error: 'Use application/json.', status: 415 };
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return { error: 'Request body is too large.', status: 413 };
  }
  const reader = request.body?.getReader();
  if (!reader) return { error: 'Invalid JSON request.', status: 400 };
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return { error: 'Request body is too large.', status: 413 };
      }
      chunks.push(value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return { payload: JSON.parse(new TextDecoder().decode(data)) };
  } catch {
    return { error: 'Invalid JSON request.', status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function createDistressEmailHandler({ env = process.env, fetch: send = globalThis.fetch, now = Date.now, timeoutMs = 10_000 } = {}) {
  const incidents = new Map();
  let lastIncident = null;
  const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

  async function deliver(record, config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const batch = record.messages.length > 1;
      const response = await send(`https://api.resend.com/emails${batch ? '/batch' : ''}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `sahey-distress/${record.eventId}`,
        },
        body: JSON.stringify(batch ? record.messages : record.messages[0]),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        return { status: 502, body: providerFailure(response, result, config) };
      }
      const ids = batch ? result?.data?.map(item => item?.id) : [result?.id];
      if (!Array.isArray(ids) || ids.length !== record.messages.length
        || !ids.every(id => typeof id === 'string' && id.length > 0) || new Set(ids).size !== ids.length) {
        return { status: 502, body: { error: 'The email provider did not confirm every email. Delivery is unconfirmed.', retryable: true } };
      }
      record.result = { success: true, ids, accepted: ids.length };
      return { status: 200, body: record.result };
    } catch {
      return { status: 502, body: { error: 'The email provider connection timed out or failed. Delivery is unconfirmed.', retryable: true } };
    } finally {
      clearTimeout(timer);
    }
  }

  return async function handle(request) {
    // Saved contacts come from the phone; this route remains development-only.
    if (env.NODE_ENV !== 'development') {
      return reply(403, { error: 'Distress test emails are available during local development only.', retryable: false });
    }
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.', retryable: false });
    const parsed = await readPayload(request);
    if (parsed.error) return reply(parsed.status, { error: parsed.error, retryable: false });
    const payload = parsed.payload;
    const occurredAt = typeof payload?.occurredAt === 'string' ? Date.parse(payload.occurredAt) : NaN;
    if (payload?.type !== 'CONFIRMED_DISTRESS' || typeof payload.eventId !== 'string'
      || !/^[A-Za-z0-9_-]{8,128}$/.test(payload.eventId) || !Number.isFinite(occurredAt)
      || occurredAt > now() + 10_000 || occurredAt < now() - 5 * 60_000) {
      return reply(400, { error: 'A recent confirmed distress signal, eventId, and occurredAt timestamp are required.', retryable: false });
    }
    if (!Array.isArray(payload.to) || !payload.to.length || payload.to.length > 10
      || !payload.to.every(email => typeof email === 'string' && email.trim().length <= 254 && EMAIL.test(email.trim()))) {
      return reply(400, { error: 'Save between 1 and 10 emergency contacts with valid email addresses.', retryable: false });
    }
    const recipients = payload.to.map(email => email.trim().toLowerCase()).sort();
    if (new Set(recipients).size !== recipients.length) {
      return reply(400, { error: 'Emergency contact email addresses must be unique.', retryable: false });
    }
    if (recipients.some(email => /@(?:[^@]+\.)?example\.(?:com|net|org)$/i.test(email))) {
      return reply(400, { error: 'Replace placeholder email addresses in Emergency Contacts with real recipient addresses.', retryable: false });
    }
    let config;
    try { config = configuration(env); }
    catch (error) { return reply(503, { error: error.message, retryable: false }); }

    const fingerprint = JSON.stringify({ occurredAt: new Date(occurredAt).toISOString(), recipients });
    for (const [id, record] of incidents) {
      if (!record.task && now() - record.createdAt >= RETENTION_MS) incidents.delete(id);
    }
    let record = incidents.get(payload.eventId);
    if (record && record.fingerprint !== fingerprint) {
      return reply(409, { error: 'This eventId was already used for another signal.', retryable: false });
    }
    if (record?.result) return reply(200, { ...record.result, duplicate: true });
    if (!record) {
      if (lastIncident && now() - lastIncident.lastAttemptAt < 60_000) {
        return reply(429, { error: 'Another distress email was recently submitted. Check its result before retrying.', retryable: false });
      }
      if (incidents.size >= 2048) return reply(503, { error: 'The email service is busy. Try again later.', retryable: false });
      record = {
        eventId: payload.eventId, fingerprint, createdAt: now(),
        // Keep the payload identical for every provider retry, including the time.
        messages: recipients.map(email => ({
          from: config.from, to: [email], subject: '[TEST] SAHEY Distress Detected',
          text: 'SAHEY received a CONFIRMED DISTRESS signal from the connected wearable.\n\n'
            + `Time: ${new Date(occurredAt).toISOString()}\n\n`
            + 'This is a development test, not a real emergency.',
        })),
      };
      incidents.set(payload.eventId, record);
    }
    // Concurrent requests for one event share the provider operation.
    if (!record.task) {
      const current = record;
      current.lastAttemptAt = now();
      lastIncident = current;
      current.task = deliver(current, config).finally(() => {
        current.task = null;
        if (!current.result && lastIncident === current) lastIncident = null;
      });
    }
    const result = await record.task;
    return reply(result.status, result.body);
  };
}

module.exports = { createDistressEmailHandler, configuration };
