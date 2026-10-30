// Isolated local backend for email_verification_browser.py; never sends mail or calls a model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCommercialServer, writeStore } from '../server/commercial-server.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-email-browser-'));
const file = path.join(directory, 'store.json');
writeStore({ users: [], subscriptions: [], invoices: [] }, file);
const mails = [];
const used = new Set();
const server = createCommercialServer({ storeFile: file, env: {
  APP_ORIGIN: 'http://localhost:5173', RESEND_API_KEY: 'synthetic-key',
  VERIFICATION_FROM_EMAIL: 'verify@example.test', TURNSTILE_SITE_KEY: 'synthetic-site', TURNSTILE_SECRET_KEY: 'synthetic-secret',
}, fetch: async (url, options) => {
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    const token = JSON.parse(options.body).response;
    const success = !used.has(token) && /^(register|verify-email):/.test(token);
    used.add(token);
    return Response.json({ success, hostname: 'localhost', action: token.split(':')[0] });
  }
  if (url === 'https://api.resend.com/emails') {
    mails.push(JSON.parse(options.body));
    return Response.json({ id: 'synthetic-mail-' + mails.length });
  }
  throw new Error('Browser fixture must never call an external model');
} });
const handler = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (request, response) => {
  if (request.url === '/__test/mail') { response.writeHead(200, { 'Content-Type': 'application/json' }); return response.end(JSON.stringify(mails)); }
  return handler(request, response);
});
server.listen(3001, '127.0.0.1', () => console.log('Isolated email browser backend ready'));
process.on('SIGTERM', () => server.close(() => { fs.rmSync(directory, { recursive: true, force: true }); process.exit(0); }));
