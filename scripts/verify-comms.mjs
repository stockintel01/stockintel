import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  fromWhatsAppId,
  maskPhoneNumber,
  normalizePhoneNumber,
  toWhatsAppRecipient,
} from '../lib/comms/phone.ts';
import {
  buildTemplateMessage,
  buildTextMessage,
  classifyMetaFailure,
  extractSentMessageId,
  parseMetaError,
  parseMetaWebhook,
  retryDelaySeconds,
  sanitizeTemplateParameter,
  verifyMetaSignature,
} from '../lib/comms/meta.ts';
import {
  buildWhatsAppLinkUrl,
  generateLinkCode,
  hashLinkCode,
  linkReplyText,
  normalizeLinkCode,
  parseInboundCommand,
  startReplyText,
  stopReplyText,
} from '../lib/comms/inbound.ts';
import {
  NOTIFICATION_EVENTS,
  contactBelongsToMember,
  isNotificationEventType,
  resolveAudience,
  selectAudience,
} from '../lib/comms/events.ts';
import {
  diffLowStockEpisodes,
  findLowStockItems,
  formatQuantity,
  lowStockAlertKey,
  lowStockEventKey,
  parseLowStockPayload,
  renderLowStockTemplateParameters,
  scanWindowStart,
  summarizeLowStockItems,
} from '../lib/comms/low-stock.ts';

// ── Phone numbers ────────────────────────────────────────────────────────────
assert.equal(normalizePhoneNumber('+233 24 123 4567'), '+233241234567');
assert.equal(normalizePhoneNumber('00233241234567'), '+233241234567');
assert.equal(normalizePhoneNumber('0241234567', '233'), '+233241234567');
assert.equal(normalizePhoneNumber('0241234567'), null, 'a national number needs a default country');
assert.equal(normalizePhoneNumber('+12'), null);
assert.equal(normalizePhoneNumber('   '), null);
assert.equal(fromWhatsAppId('233241234567'), '+233241234567');
assert.equal(toWhatsAppRecipient('+233241234567'), '233241234567');
assert.equal(maskPhoneNumber('+233241234567'), '+233 •••• 4567');

// ── Webhook signatures ───────────────────────────────────────────────────────
const secret = 'app-secret';
const body = new TextEncoder().encode('{"object":"whatsapp_business_account","entry":[]}');
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
assert.equal(verifyMetaSignature(body, signature, secret), true);
assert.equal(verifyMetaSignature(body, signature.toUpperCase().replace('SHA256=', 'sha256='), secret), true);
assert.equal(verifyMetaSignature(new TextEncoder().encode('{"object":"tampered"}'), signature, secret), false);
assert.equal(verifyMetaSignature(body, signature, 'wrong-secret'), false);
assert.equal(verifyMetaSignature(body, signature.replace('sha256=', 'sha1='), secret), false);
assert.equal(verifyMetaSignature(body, null, secret), false);
assert.equal(verifyMetaSignature(body, signature, ''), false);

// ── Webhook parsing ──────────────────────────────────────────────────────────
const webhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '233200000000', phone_number_id: 'PN-1' },
            messages: [
              { from: '233241234567', id: 'wamid.in1', timestamp: '1789560000', type: 'text', text: { body: 'JOIN K7P2QX4M' } },
              { from: '233241234567', id: 'wamid.in2', timestamp: '1789560060', type: 'button', button: { text: 'STOP', payload: 'x' } },
              { from: '233241234567', id: 'wamid.in3', timestamp: '1789560090', type: 'image', image: { id: 'media' } },
              { from: '233241234567', timestamp: '1789560120', type: 'text', text: { body: 'no id' } },
            ],
            statuses: [
              { id: 'wamid.out1', status: 'delivered', timestamp: '1789560100', recipient_id: '233241234567', pricing: { billable: true, category: 'utility' } },
              { id: 'wamid.out2', status: 'failed', timestamp: '1789560200', errors: [{ code: 131026, title: 'Message undeliverable' }] },
              { id: 'wamid.out3', status: 'deleted', timestamp: '1789560300' },
            ],
          },
        },
        { field: 'message_template_status_update', value: {} },
      ],
    },
    { changes: [] },
  ],
};
const changes = parseMetaWebhook(webhook);
assert.equal(changes.length, 1);
assert.equal(changes[0].accountId, 'WABA-1');
assert.equal(changes[0].phoneNumberId, 'PN-1');
assert.deepEqual(changes[0].messages.map(message => [message.providerMessageId, message.text]), [
  ['wamid.in1', 'JOIN K7P2QX4M'],
  ['wamid.in2', 'STOP'],
  ['wamid.in3', null],
]);
assert.equal(changes[0].messages[0].timestamp.toISOString(), new Date(1789560000 * 1000).toISOString());
assert.equal(changes[0].statuses.length, 2, 'unsupported statuses are dropped');
assert.deepEqual(
  { ...changes[0].statuses[0], timestamp: undefined },
  { providerMessageId: 'wamid.out1', status: 'delivered', timestamp: undefined, errorCode: null, errorTitle: null, pricingCategory: 'utility', billable: true },
);
assert.equal(changes[0].statuses[1].errorCode, '131026');
assert.equal(changes[0].statuses[1].errorTitle, 'Message undeliverable');
assert.deepEqual(parseMetaWebhook({ object: 'page', entry: webhook.entry }), []);
assert.deepEqual(parseMetaWebhook(null), []);
assert.deepEqual(parseMetaWebhook('not json'), []);

// ── Outbound payloads ────────────────────────────────────────────────────────
assert.equal(sanitizeTemplateParameter('Tilt\n250EC\t2 L      left'), 'Tilt 250EC 2 L left');
assert.equal(sanitizeTemplateParameter('   '), '-');
const truncated = sanitizeTemplateParameter('x'.repeat(50), 10);
assert.equal(truncated.length, 10);
assert.ok(truncated.endsWith('…'));

assert.deepEqual(buildTemplateMessage({
  to: '233241234567',
  templateName: 'stockintel_low_stock_alert',
  languageCode: 'en',
  bodyParameters: ['Kade\nFarms', '2 items', 'Tilt 2 L (min 5 L)'],
}), {
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: '233241234567',
  type: 'template',
  template: {
    name: 'stockintel_low_stock_alert',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Kade Farms' },
        { type: 'text', text: '2 items' },
        { type: 'text', text: 'Tilt 2 L (min 5 L)' },
      ],
    }],
  },
});
const textMessage = buildTextMessage({ to: '233241234567', body: 'y'.repeat(5000) });
assert.equal(textMessage.type, 'text');
assert.equal(textMessage.text.body.length, 4096);
assert.equal(textMessage.text.preview_url, false);

assert.equal(extractSentMessageId({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.sent' }] }), 'wamid.sent');
assert.equal(extractSentMessageId({ messages: [] }), null);
assert.equal(extractSentMessageId(undefined), null);
assert.deepEqual(
  parseMetaError({ error: { code: 131030, message: '(#131030) Recipient phone number not in allowed list', error_data: { details: 'Recipient phone number not in allowed list' } } }),
  { code: '131030', title: 'Recipient phone number not in allowed list' },
);
assert.deepEqual(parseMetaError('gateway timeout'), { code: null, title: 'WhatsApp request failed' });

// ── Failure handling ─────────────────────────────────────────────────────────
assert.equal(classifyMetaFailure(400, '131030'), 'permanent');
assert.equal(classifyMetaFailure(400, '132001'), 'permanent');
assert.equal(classifyMetaFailure(400, '130429'), 'rate_limited');
assert.equal(classifyMetaFailure(400, '131056'), 'rate_limited');
assert.equal(classifyMetaFailure(429, null), 'rate_limited');
assert.equal(classifyMetaFailure(503, null), 'transient');
assert.equal(classifyMetaFailure(null, null), 'transient', 'network failures are retried');
assert.equal(classifyMetaFailure(500, '131000'), 'transient');
assert.equal(classifyMetaFailure(400, '2'), 'transient');
assert.equal(classifyMetaFailure(401, '190'), 'auth');
assert.equal(classifyMetaFailure(403, '200'), 'auth');

assert.equal(retryDelaySeconds(1, 'transient', () => 0.5), 30);
assert.equal(retryDelaySeconds(3, 'transient', () => 0.5), 120);
assert.equal(retryDelaySeconds(1, 'rate_limited', () => 0.5), 60);
assert.equal(retryDelaySeconds(30, 'transient', () => 0.5), 1800, 'transient delay is capped');
assert.equal(retryDelaySeconds(30, 'rate_limited', () => 0.5), 3600, 'rate-limit delay is capped');
assert.equal(retryDelaySeconds(1, 'transient', () => 0), 24);
assert.equal(retryDelaySeconds(1, 'transient', () => 1), 36);

// ── Inbound commands and link codes ──────────────────────────────────────────
assert.deepEqual(parseInboundCommand('JOIN K7P2QX4M'), { kind: 'link', code: 'K7P2QX4M' });
assert.deepEqual(parseInboundCommand('  join   k7p2-qx4m '), { kind: 'link', code: 'K7P2QX4M' });
assert.deepEqual(parseInboundCommand('JOIN K7P2QX4M please'), { kind: 'none' });
assert.deepEqual(parseInboundCommand('JOIN K7P2QX40'), { kind: 'none' }, 'zero is not in the code alphabet');
assert.deepEqual(parseInboundCommand('stop'), { kind: 'stop' });
assert.deepEqual(parseInboundCommand('Stop all'), { kind: 'stop' });
assert.deepEqual(parseInboundCommand('Please stop sending these'), { kind: 'none' }, 'only a bare keyword opts out');
assert.deepEqual(parseInboundCommand('START'), { kind: 'start' });
assert.deepEqual(parseInboundCommand('help'), { kind: 'help' });
assert.deepEqual(parseInboundCommand('ok thanks'), { kind: 'none' });
assert.deepEqual(parseInboundCommand(null), { kind: 'none' });

assert.equal(normalizeLinkCode('k7p2 qx4m'), 'K7P2QX4M');
assert.equal(normalizeLinkCode('K7P2QX4'), null);
assert.equal(normalizeLinkCode('K7P2QX4O'), null);

const scripted = [248, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
assert.equal(generateLinkCode(size => Uint8Array.from(scripted.slice(0, size))), '23456789', 'bytes at or above 248 are rejected');
for (let index = 0; index < 200; index += 1) {
  const code = generateLinkCode();
  assert.equal(normalizeLinkCode(code), code);
}
assert.match(hashLinkCode('K7P2QX4M'), /^[0-9a-f]{64}$/);
assert.equal(hashLinkCode('K7P2QX4M'), hashLinkCode('K7P2QX4M'));
assert.notEqual(hashLinkCode('K7P2QX4M'), hashLinkCode('K7P2QX4N'));
assert.equal(buildWhatsAppLinkUrl('+233 20 000 0000', 'K7P2QX4M'), 'https://wa.me/233200000000?text=JOIN%20K7P2QX4M');

assert.ok(linkReplyText('linked', 'Kade Farms').includes('Kade Farms'));
assert.equal(linkReplyText('unknown_connection'), null);
assert.equal(stopReplyText(['Kade Farms', 'Asuom Estate', 'Kade Farms']), 'Alerts paused for Kade Farms and Asuom Estate. Reply START to turn them back on.');
assert.equal(startReplyText(['A', 'B', 'C']), 'Alerts are back on for A, B and C. Reply STOP at any time to pause them.');
assert.ok(stopReplyText([]).includes('not receiving'));

// ── Events and audiences ─────────────────────────────────────────────────────
assert.equal(isNotificationEventType('inventory.low_stock'), true);
assert.equal(isNotificationEventType('toString'), false);
const lowStockAudience = NOTIFICATION_EVENTS['inventory.low_stock'].defaultAudience;
assert.equal(resolveAudience(lowStockAudience, null), lowStockAudience);
assert.deepEqual(resolveAudience(lowStockAudience, { roles: ['manager', 'superuser'] }), { roles: ['manager'], permissions: ['agricStock'] });
assert.deepEqual(resolveAudience(lowStockAudience, { permissions: ['agricPacking', 'drop table'] }), { roles: ['owner'], permissions: ['agricPacking'] });
assert.equal(resolveAudience(lowStockAudience, { roles: [], permissions: [] }), lowStockAudience, 'an empty override falls back');
assert.equal(resolveAudience(lowStockAudience, ['owner']), lowStockAudience);

const members = [
  { profileId: null, firebaseUid: 'owner', role: 'owner', permissions: [], displayName: 'Owner' },
  { profileId: null, firebaseUid: 'keeper', role: 'worker', permissions: ['dashboard', 'agricStock'], displayName: 'Keeper' },
  { profileId: null, firebaseUid: 'packer', role: 'worker', permissions: ['dashboard', 'agricPacking'], displayName: 'Packer' },
  { profileId: 'p-manager', firebaseUid: null, role: 'manager', permissions: ['team'], displayName: 'Manager' },
];
assert.deepEqual(selectAudience(members, lowStockAudience).map(member => member.displayName), ['Owner', 'Keeper']);
assert.equal(contactBelongsToMember({ profileId: null, firebaseUid: 'keeper' }, members[1]), true);
assert.equal(contactBelongsToMember({ profileId: 'p-manager', firebaseUid: 'legacy' }, members[3]), true);
assert.equal(contactBelongsToMember({ profileId: null, firebaseUid: null }, { ...members[3], profileId: null }), false);

// ── Low stock ────────────────────────────────────────────────────────────────
const levels = [
  { itemId: 'tilt', name: 'Tilt 250EC', quantity: 2, minimum: 5, unit: 'L' },
  { itemId: 'mancozeb', name: 'Mancozeb', quantity: 25, minimum: 25, unit: 'kg' },
  { itemId: 'urea', name: 'Urea', quantity: 0, minimum: 50, unit: 'kg' },
  { itemId: 'bags', name: 'Packing bags', quantity: 3, minimum: 0, unit: 'bag' },
  { itemId: 'gloves', name: 'Gloves', quantity: 40, minimum: 10, unit: null },
  { itemId: 'broken', name: 'Broken', quantity: Number.NaN, minimum: 5, unit: null },
];
const low = findLowStockItems(levels);
assert.deepEqual(low.map(item => [item.itemId, item.severity]), [
  ['urea', 'critical'],
  ['tilt', 'critical'],
  ['mancozeb', 'warning'],
]);

const diff = diffLowStockEpisodes(low, [
  { alertKey: lowStockAlertKey('tilt'), episodeStartedAt: '2026-09-15T08:00:00.000Z' },
  { alertKey: lowStockAlertKey('gloves'), episodeStartedAt: '2026-09-14T08:00:00.000Z' },
  { alertKey: 'sigatoka.threshold:plot-7', episodeStartedAt: '2026-09-14T08:00:00.000Z' },
]);
assert.deepEqual(diff.started.map(item => item.itemId), ['urea', 'mancozeb']);
assert.deepEqual(diff.continuing.map(entry => [entry.item.itemId, entry.episodeStartedAt]), [['tilt', '2026-09-15T08:00:00.000Z']]);
assert.deepEqual(diff.resolvedKeys, [lowStockAlertKey('gloves')], 'other alert types are left alone');

assert.equal(formatQuantity(2), '2');
assert.equal(formatQuantity(2.5), '2.5');
assert.equal(formatQuantity(2.3456), '2.35');

assert.deepEqual(summarizeLowStockItems(low.slice(0, 1)), { itemCount: '1 item', summary: 'Urea 0 kg (min 50 kg)' });
assert.deepEqual(summarizeLowStockItems(low), {
  itemCount: '3 items',
  summary: 'Urea 0 kg (min 50 kg); Tilt 250EC 2 L (min 5 L); Mancozeb 25 kg (min 25 kg)',
});
const tight = summarizeLowStockItems(low, 50);
assert.equal(tight.summary, 'Urea 0 kg (min 50 kg); +2 more');
const longName = [{ itemId: 'long', name: 'N'.repeat(400), quantity: 1, minimum: 5, unit: 'L', severity: 'critical' }, ...low];
const clipped = summarizeLowStockItems(longName, 120);
assert.ok(clipped.summary.length <= 120, `summary is ${clipped.summary.length} characters`);
assert.ok(clipped.summary.endsWith('; +3 more'));
assert.deepEqual(renderLowStockTemplateParameters('Kade Farms', low.slice(0, 1)), ['Kade Farms', '1 item', 'Urea 0 kg (min 50 kg)']);

assert.deepEqual(parseLowStockPayload({ items: [...low, { itemId: 7 }, null, 'x'] }), low);
assert.deepEqual(parseLowStockPayload({}), []);
assert.deepEqual(parseLowStockPayload(null), []);

const windowStart = scanWindowStart(new Date('2026-09-16T10:37:12.000Z'));
assert.equal(windowStart.toISOString(), '2026-09-16T10:30:00.000Z');
const eventKey = lowStockEventKey(low, windowStart);
assert.equal(eventKey, lowStockEventKey([...low].reverse(), windowStart), 'item order does not change the key');
assert.notEqual(eventKey, lowStockEventKey(low, scanWindowStart(new Date('2026-09-16T10:45:00.000Z'))));
assert.notEqual(eventKey, lowStockEventKey(low.slice(1), windowStart));
assert.ok(eventKey.length <= 300);

console.log('Communication layer logic verified (phone numbers, webhooks, payloads, retries, commands, audiences, low stock).');
