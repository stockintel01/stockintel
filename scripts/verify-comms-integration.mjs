/**
 * Drives the real /api/comms/* routes against stub Supabase and Meta servers, so the
 * worker, webhook and repository run end to end without a database or a WhatsApp
 * account. Asserts on the requests each side received.
 *
 * Run on demand with: npm run test:comms-integration
 * It starts a dev server on port 3126 and stubs on 4701/4702, so it is kept out of
 * npm run verify, which stays hermetic.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const PROJECT = process.argv[2] ?? process.cwd();
const SUPABASE_PORT = 4701;
const GRAPH_PORT = 4702;
const APP_PORT = 3126;
const APP_SECRET = 'test-app-secret';
const CRON_SECRET = 'test-cron-secret';
const PHONE_NUMBER_ID = 'PN-1';
const WABA_ID = 'WABA-1';

const CONNECTION = {
  id: 'conn-1',
  organization_id: null,
  channel: 'whatsapp',
  provider: 'meta_cloud',
  ownership: 'platform',
  display_name: 'StockIntel Agri',
  display_phone_number: '+233200000000',
  provider_account_id: WABA_ID,
  provider_sender_id: PHONE_NUMBER_ID,
  secret_ref: 'env:WHATSAPP_ACCESS_TOKEN',
  status: 'active',
};

const TEMPLATE_MESSAGE = {
  id: 'msg-1',
  organization_id: '11111111-1111-4111-8111-111111111111',
  event_id: 'event-1',
  connection_id: 'conn-1',
  contact_channel_id: 'contact-1',
  template_id: 'tmpl-1',
  message_kind: 'template',
  recipient_address: '+233241234567',
  content: { templateName: 'stockintel_low_stock_alert', languageCode: 'en', bodyParameters: ['Kade Farms', '2 items', 'Urea 0 kg (min 50 kg)'] },
  attempts: 1,
};

// Mutable per-scenario state.
let scenario = 'idle';
const supabaseCalls = [];
const graphCalls = [];

function reset(next) {
  scenario = next;
  supabaseCalls.length = 0;
  graphCalls.length = 0;
}

function json(response, body, extraHeaders = {}) {
  response.writeHead(200, { 'Content-Type': 'application/json', ...extraHeaders });
  response.end(body === undefined ? '' : JSON.stringify(body));
}

function wantsSingleObject(request) {
  return String(request.headers.accept ?? '').includes('vnd.pgrst.object');
}

function readBody(request) {
  return new Promise(resolve => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(raw ? JSON.parse(raw) : null);
    });
  });
}

// ── Stub Supabase (PostgREST + RPC) ─────────────────────────────────────────
const supabaseServer = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const body = await readBody(request);
  supabaseCalls.push({ method: request.method, path: url.pathname, query: url.search, body });

  // RPCs
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.slice('/rest/v1/rpc/'.length);
    switch (fn) {
      case 'claim_notification_events':
        return json(response, []);
      case 'claim_message_outbox':
        if (scenario === 'send' || scenario === 'permanent' || scenario === 'rate_limited' || scenario === 'revoked') {
          return json(response, [TEMPLATE_MESSAGE]);
        }
        return json(response, []);
      case 'comms_record_audit_event':
        return json(response, null);
      case 'comms_set_keyword_consent':
        return json(response, { changed: 1, organizationNames: ['Kade Farms'] });
      case 'comms_link_contact_channel':
        return json(response, { outcome: 'linked', organizationId: '11111111-1111-4111-8111-111111111111', organizationName: 'Kade Farms', contactChannelId: 'contact-1' });
      case 'comms_record_delivery_status':
        return json(response, 'recorded');
      case 'comms_organization_context':
        return json(response, { organizationId: '11111111-1111-4111-8111-111111111111', name: 'Kade Farms', legacyFirebaseId: 'org1', timezone: 'Africa/Accra', features: { whatsapp_notifications: true, whatsapp_messages: true } });
      default:
        return json(response, null);
    }
  }

  // Tables
  const table = url.pathname.replace('/rest/v1/', '');
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (request.method === 'HEAD') {
      return response.writeHead(200, { 'Content-Range': '0-0/0', 'Content-Type': 'application/json' }).end();
    }
    if (table === 'channel_connections') {
      return json(response, wantsSingleObject(request) ? CONNECTION : [CONNECTION]);
    }
    if (table === 'contact_channels') {
      const row = scenario === 'revoked' ? null : { id: 'contact-1' };
      return json(response, wantsSingleObject(request) ? row : row ? [row] : []);
    }
    if (table === 'communication_consents') {
      const row = scenario === 'revoked' ? null : { id: 'consent-1' };
      return json(response, wantsSingleObject(request) ? row : row ? [row] : []);
    }
    return json(response, wantsSingleObject(request) ? null : []);
  }

  // Writes
  return json(response, Array.isArray(body) ? body.map((row, index) => ({ ...row, id: `${table}-${index}` })) : []);
});

// ── Stub Meta Graph API ─────────────────────────────────────────────────────
const graphServer = createServer(async (request, response) => {
  const body = await readBody(request);
  graphCalls.push({ url: request.url, body, auth: request.headers.authorization });

  if (scenario === 'permanent') {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    return response.end(JSON.stringify({ error: { code: 131030, message: 'Recipient not in allowed list', error_data: { details: 'Recipient phone number not in allowed list' } } }));
  }
  if (scenario === 'rate_limited') {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    return response.end(JSON.stringify({ error: { code: 130429, message: 'Rate limit hit' } }));
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.sent-1' }] }));
});

function listen(server, port) {
  return new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
}

function signature(payload) {
  return `sha256=${createHmac('sha256', APP_SECRET).update(Buffer.from(payload)).digest('hex')}`;
}

async function call(path, init = {}) {
  const response = await fetch(`http://127.0.0.1:${APP_PORT}${path}`, init);
  const text = await response.text();
  return { status: response.status, body: text };
}

function outboxPatch(status) {
  return supabaseCalls.find(entry => entry.method === 'PATCH' && entry.path.endsWith('message_outbox') && entry.body?.status === status);
}

await listen(supabaseServer, SUPABASE_PORT);
await listen(graphServer, GRAPH_PORT);

const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(APP_PORT)], {
  cwd: PROJECT,
  env: {
    ...process.env,
    NEXT_PUBLIC_DATA_BACKEND: 'supabase',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPABASE_PORT}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'stub',
    SUPABASE_SECRET_KEY: 'stub-secret',
    WHATSAPP_ACCESS_TOKEN: 'stub-token',
    WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: WABA_ID,
    WHATSAPP_DISPLAY_PHONE_NUMBER: '+233200000000',
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-me',
    WHATSAPP_GRAPH_BASE_URL: `http://127.0.0.1:${GRAPH_PORT}`,
    CRON_SECRET,
    COMMS_QUOTA_MODE: 'observe',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
app.stdout.on('data', () => {});
app.stderr.on('data', chunk => process.stderr.write(chunk));

async function waitForApp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const probe = await fetch(`http://127.0.0.1:${APP_PORT}/api/comms/cron/dispatch`);
      if (probe.status) return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('the app did not start');
}

const failures = [];
function check(name, run) {
  return run().then(
    () => console.log(`  ok   ${name}`),
    error => { failures.push(`${name}: ${error.message}`); console.log(`  FAIL ${name}`); },
  );
}

try {
  await waitForApp();
  console.log('\nComms integration scenarios:');

  await check('cron route rejects a request with no bearer token', async () => {
    reset('idle');
    const result = await call('/api/comms/cron/dispatch');
    assert.equal(result.status, 401);
    assert.equal(graphCalls.length, 0);
  });

  await check('cron route accepts the scheduler secret', async () => {
    reset('idle');
    const result = await call('/api/comms/cron/dispatch', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(result.status, 200);
  });

  await check('a queued template message reaches Meta and is marked sent', async () => {
    reset('send');
    const result = await call('/api/comms/cron/dispatch', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(result.status, 200);
    assert.equal(graphCalls.length, 1, 'expected exactly one Graph call');
    assert.equal(graphCalls[0].auth, 'Bearer stub-token');
    assert.equal(graphCalls[0].body.type, 'template');
    assert.equal(graphCalls[0].body.to, '233241234567', 'the recipient is sent as digits');
    assert.equal(graphCalls[0].body.template.name, 'stockintel_low_stock_alert');
    assert.deepEqual(
      graphCalls[0].body.template.components[0].parameters.map(parameter => parameter.text),
      ['Kade Farms', '2 items', 'Urea 0 kg (min 50 kg)'],
    );
    assert.ok(outboxPatch('sent'), 'the message should be marked sent');
    assert.equal(outboxPatch('sent').body.provider_message_id, 'wamid.sent-1');
  });

  await check('a permanent Meta error fails the message instead of retrying', async () => {
    reset('permanent');
    await call('/api/comms/cron/dispatch', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(graphCalls.length, 1);
    assert.ok(outboxPatch('failed'), 'expected the message to be marked failed');
    assert.equal(outboxPatch('failed').body.last_error_code, '131030');
    assert.equal(outboxPatch('queued'), undefined, 'a permanent failure must not be retried');
  });

  await check('a rate limit schedules a retry rather than failing', async () => {
    reset('rate_limited');
    await call('/api/comms/cron/dispatch', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const retry = outboxPatch('queued');
    assert.ok(retry, 'expected the message to be requeued');
    assert.ok(retry.body.next_attempt_at, 'a retry needs a next attempt time');
    assert.ok(new Date(retry.body.next_attempt_at).getTime() > Date.now(), 'the retry is scheduled in the future');
    assert.equal(outboxPatch('failed'), undefined);
  });

  await check('consent withdrawn after queueing suppresses the message before Meta is called', async () => {
    reset('revoked');
    await call('/api/comms/cron/dispatch', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(graphCalls.length, 0, 'nothing may be sent to a contact that withdrew consent');
    const suppressed = supabaseCalls.find(entry => entry.method === 'PATCH' && entry.body?.status === 'suppressed');
    assert.ok(suppressed, 'expected the message to be suppressed');
    assert.equal(suppressed.body.status_reason, 'consent_revoked');
  });

  await check('a webhook with a bad signature is rejected', async () => {
    reset('idle');
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const result = await call('/api/comms/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) },
      body: payload,
    });
    assert.equal(result.status, 401);
    assert.equal(supabaseCalls.length, 0, 'an unverified payload must not reach the database');
  });

  await check('STOP withdraws consent', async () => {
    reset('idle');
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: WABA_ID, changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: PHONE_NUMBER_ID },
        messages: [{ from: '233241234567', id: 'wamid.in-stop', timestamp: '1789560000', type: 'text', text: { body: 'STOP' } }],
      } }] }],
    });
    const result = await call('/api/comms/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature(payload) },
      body: payload,
    });
    assert.equal(result.status, 200);
    const consent = supabaseCalls.find(entry => entry.path.endsWith('rpc/comms_set_keyword_consent'));
    assert.ok(consent, 'expected the keyword consent function to be called');
    assert.equal(consent.body.p_granted, false);
    assert.equal(consent.body.p_address, '+233241234567');
  });

  await check('JOIN links the number that sent the code', async () => {
    reset('idle');
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: WABA_ID, changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: PHONE_NUMBER_ID },
        messages: [{ from: '233241234567', id: 'wamid.in-join', timestamp: '1789560000', type: 'text', text: { body: 'JOIN K7P2QX4M' } }],
      } }] }],
    });
    const result = await call('/api/comms/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature(payload) },
      body: payload,
    });
    assert.equal(result.status, 200);
    const link = supabaseCalls.find(entry => entry.path.endsWith('rpc/comms_link_contact_channel'));
    assert.ok(link, 'expected the link function to be called');
    assert.match(link.body.p_code_hash, /^[0-9a-f]{64}$/, 'the raw code must never be sent to the database');
    assert.equal(link.body.p_address, '+233241234567');
  });

  await check('a webhook for an unknown sender is ignored', async () => {
    reset('idle');
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA-OTHER', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: 'PN-OTHER' },
        messages: [{ from: '233241234567', id: 'wamid.in-x', timestamp: '1789560000', type: 'text', text: { body: 'STOP' } }],
      } }] }],
    });
    const result = await call('/api/comms/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature(payload) },
      body: payload,
    });
    assert.equal(result.status, 200);
    assert.equal(supabaseCalls.find(entry => entry.path.includes('comms_set_keyword_consent')), undefined,
      'a payload naming an unknown sender must not change any consent');
  });
} finally {
  app.kill();
  supabaseServer.close();
  graphServer.close();
}

console.log('');
if (failures.length) {
  console.log(`${failures.length} scenario(s) failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('All comms integration scenarios passed.');
}
