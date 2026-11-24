
const http = require('node:http');
const { Readable } = require('node:stream');
const { configuration, createDistressEmailHandler } = require('../src/server/distress-email.cjs');

function createServer(options = {}) {
  const handle = createDistressEmailHandler(options);
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ service: 'halo-distress-email', locationReportingVersion: 1 }));
    }
    if (req.url !== '/distress' && req.url !== '/api/distress') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    try {
      const request = new Request('http://localhost/distress', {
        method: req.method,
        headers: req.headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
      });
      const response = await handle(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email service unavailable', retryable: true }));
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

if (require.main === module) {
  const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' };
  try {
    if (env.NODE_ENV !== 'development') throw new Error('This email server is for local development only.');
    configuration(env);
    const port = Number(env.HALO_EMAIL_PORT || 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('HALO_EMAIL_PORT must be between 1 and 65535.');
    const host = env.HALO_EMAIL_HOST || '127.0.0.1';
    const server = createServer({ env });
    server.on('error', error => { console.error(`[HALO] Cannot start email server: ${error.message}`); process.exitCode = 1; });
    server.listen(port, host, () => console.log(`[HALO] Test email server listening on ${host}:${port}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createServer };
