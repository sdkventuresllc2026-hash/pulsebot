const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTmoOrderId,
  extractTmoOrderId,
  requiresTfiberProof,
  hasScreenshotAttachment,
  buildTfiberProofPayload,
  proofExpiresAt,
  TFIBER_PROOF_EXPIRATION_HOURS,
  formatTfiberProofLine,
} = require('./tfiber-proof');

function attachmentMap(items) {
  return new Map(items.map((item) => [item.id, item]));
}

test('normalizes and extracts TMO order ids', () => {
  assert.equal(normalizeTmoOrderId(' tmo-20260725 ak6oi '), 'TMO20260725AK6OI');
  assert.equal(normalizeTmoOrderId(' tmo-20260730 04w0t '), 'TMO2026073004W0T');
  assert.equal(extractTmoOrderId('order is TMO20260725AK6OI thanks'), 'TMO20260725AK6OI');
  assert.equal(extractTmoOrderId('Order number: TMO20260731MRT34'), 'TMO20260731MRT34');
  assert.equal(normalizeTmoOrderId('abc123'), null);
  assert.equal(normalizeTmoOrderId('TMO02026073004W0T'), null);
  assert.equal(normalizeTmoOrderId('TMO2026603004W0T'), null);
});

test('requires proof for all T-Fiber speed logs in T-Fiber contexts', () => {
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketName: 'Charlotte T-Fiber Blitz' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], channelName: 'wilmington' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], channelName: 'jacksonville' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], channelName: 'goldsboro' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['2gig'], channelName: 'dayton' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], channelName: '🛜ohio' }), false); // Ohio sells Kinetic — no TMO proof
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketId: 'wilmington-nc' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketName: 'Goldsboro' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketId: 'dayton' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['2gig'], marketName: 'Ohio' }), false);
  assert.equal(requiresTfiberProof({ speeds: ['2gig'], marketName: 'Charlotte T-Fiber Blitz' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['2gig'], channelName: 'jacksonville' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketName: 'Greenville Kinetic' }), false);
});

test('detects image attachments as screenshots', () => {
  const message = {
    attachments: attachmentMap([
      { id: '1', name: 'order.png', contentType: 'image/png', url: 'https://cdn.example/order.png' },
    ]),
  };
  assert.equal(hasScreenshotAttachment(message), true);
});

test('builds OS proof payload from a logged T-Fiber deal', () => {
  const now = new Date('2026-07-29T12:00:00Z');
  const payload = buildTfiberProofPayload({
    message: {
      id: 'msg-1',
      content: '1g TMO20260725AK6OI',
      attachments: attachmentMap([{ id: 'a1', name: 'order.png', contentType: 'image/png', url: 'https://cdn.example/order.png' }]),
      guild: { id: 'guild-1' },
      channel: { id: 'chan-1' },
      author: { id: 'user-1', username: 'alex' },
      member: { displayName: 'Alex Rep' },
    },
    logEntry: {
      id: 'log-1',
      displayName: 'Alex Rep',
      timestamp: now.toISOString(),
      channelId: 'chan-1',
    },
    speed: '1gig',
    blitzName: 'Charlotte T-Fiber Blitz',
    marketIdentity: { marketId: 'charlotte', marketName: 'Charlotte T-Fiber Blitz' },
    hasScreenshot: true,
    now,
  });

  assert.equal(payload.idempotencyKey, 'pulse-log:log-1:tfiber-proof');
  assert.equal(payload.discordUserId, 'user-1');
  assert.equal(payload.tmoOrderId, 'TMO20260725AK6OI');
  assert.equal(payload.hasScreenshot, true);
  assert.equal(payload.marketName, 'Charlotte T-Fiber Blitz');
  assert.equal(payload.plan, 'T-Fiber 1 Gig');
});

test('builds the right T-Fiber plan label for 2 Gig logs', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  const payload = buildTfiberProofPayload({
    message: {
      id: 'msg-2',
      content: '2 gig TMO202607303GAAD',
      attachments: attachmentMap([{ id: 'a2', name: 'order.png', contentType: 'image/png', url: 'https://cdn.example/order.png' }]),
      guild: { id: 'guild-1' },
      channel: { id: 'chan-1' },
      author: { id: 'user-1', username: 'alex' },
      member: { displayName: 'Alex Rep' },
    },
    logEntry: {
      id: 'log-2',
      displayName: 'Alex Rep',
      timestamp: now.toISOString(),
      channelId: 'chan-1',
    },
    speed: '2gig',
    blitzName: 'Jacksonville',
    marketIdentity: { marketId: 'jacksonville', marketName: 'Jacksonville' },
    hasScreenshot: true,
    now,
  });

  assert.equal(payload.plan, 'T-Fiber 2 Gig');
});

test('proof clock is 48 hours', () => {
  const now = new Date('2026-07-29T12:00:00Z');
  assert.equal(TFIBER_PROOF_EXPIRATION_HOURS, 48);
  assert.equal(proofExpiresAt(now).toISOString(), '2026-07-31T12:00:00.000Z');
});

test('proof line is simple but calls out missing contact or install details', () => {
  assert.equal(
    formatTfiberProofLine({ status: 'ORDER_CREATED', missingFields: [] }),
    'T-Fiber proof received. Synced to FiberSales OS with customer details.',
  );
  assert.equal(
    formatTfiberProofLine({ status: 'PROOF_ATTACHED', missingFields: ['customerPhone'] }),
    'T-Fiber proof received. Matched in FiberSales OS. Customer contact details still needed.',
  );
  assert.equal(
    formatTfiberProofLine({ status: 'ORDER_CREATED', missingFields: ['installationDate', 'installationTimeWindow'] }),
    'T-Fiber proof received. Synced to FiberSales OS. Install details still needed.',
  );
});

const { describePendingProof, formatTfiberReminderDm, formatOpenProofsForAdmin } = require('./tfiber-proof');

const pendingFixture = (over = {}) => ({
  logId: 'log-1', userId: 'u1', displayName: 'Ben Edwards', guildId: 'g', channelId: 'c1', messageId: 'm1',
  speed: '2gig', plan: 'T-Fiber 2 Gig', timestamp: '2026-08-24T21:57:00.000Z', createdAt: '2026-08-24T21:57:00.000Z',
  expiresAt: '2026-08-26T21:57:00.000Z', proofStatus: 'NEEDS_SCREENSHOT', tmoOrderId: null, reminders: {}, ...over,
});

test('reminder names the deal: plan, channel, ET time, jump link, what is needed', () => {
  const text = formatTfiberReminderDm('end_of_day', [pendingFixture()], { tz: 'America/New_York' });
  assert.match(text, /T-Fiber 2 Gig · <#c1> · posted Mon, 8\/24, 5:57 PM → https:\/\/discord\.com\/channels\/g\/c1\/m1/);
  assert.match(text, /needs the order confirmation screenshot/);
  assert.match(text, /expires Wed, 8\/26, 5:57 PM/);
  assert.match(text, /Reply here with the screenshot AND the T-Mobile order number/);
  assert.doesNotMatch(text, /^1\)/m); // single deal: no numbering
});

test('one DM lists every open deal, numbered, and NEEDS_REVIEW asks for the TMO number', () => {
  const a = pendingFixture();
  const b = pendingFixture({ logId: 'log-2', messageId: 'm2', speed: '1gig', plan: 'T-Fiber 1 Gig', proofStatus: 'NEEDS_REVIEW', timestamp: '2026-08-24T22:38:00.000Z', createdAt: '2026-08-24T22:38:00.000Z' });
  const text = formatTfiberReminderDm('final', [a, b], { tz: 'America/New_York' });
  assert.match(text, /these 2 T-Fiber deals expire/);
  assert.match(text, /^1\) T-Fiber 2 Gig/m);
  assert.match(text, /^2\) T-Fiber 1 Gig .* — needs the T-Mobile order number \(TMO…\)/m);
});

test('expired message identifies the deal instead of a generic 1G blurb', () => {
  const text = formatTfiberReminderDm('expired', [pendingFixture({ tmoOrderId: 'TMO20260824FPOLS' })], { tz: 'America/New_York' });
  assert.match(text, /expired — T-Fiber 2 Gig · <#c1> · posted Mon, 8\/24, 5:57 PM · order TMO20260824FPOLS/);
});

test('describePendingProof degrades without a message id (no link) or channel (market name)', () => {
  const text = describePendingProof(pendingFixture({ messageId: null, channelId: null, marketName: 'Durham T-Fiber' }), { tz: 'America/New_York' });
  assert.equal(text, 'T-Fiber 2 Gig · Durham T-Fiber · posted Mon, 8/24, 5:57 PM');
});

test('admin view groups open requests by rep, oldest first, skips expired, shows hours left', () => {
  const now = new Date('2026-08-25T21:57:00.000Z');
  const list = [
    pendingFixture({ logId: 'l1' }),
    pendingFixture({ logId: 'l2', displayName: 'Henry Sells', userId: 'u2', reminders: { expiredAt: '2026-08-25T00:00:00Z' } }),
    pendingFixture({ logId: 'l3', displayName: 'Henry Sells', userId: 'u2', messageId: 'm3', createdAt: '2026-08-24T21:27:00.000Z' }),
    pendingFixture({ logId: 'l4', displayName: 'Henry Sells', userId: 'u2', messageId: 'm4', createdAt: '2026-08-24T23:00:00.000Z' }),
  ];
  const text = formatOpenProofsForAdmin(list, { tz: 'America/New_York', now });
  assert.match(text, /^Open T-Fiber proof requests: 3 across 2 reps/);
  assert.ok(text.indexOf('**Henry Sells** — 2') < text.indexOf('**Ben Edwards** — 1'));
  assert.ok(text.indexOf('/m3') < text.indexOf('/m4'));
  assert.match(text, /24h left/);
  assert.equal(formatOpenProofsForAdmin([], { tz: 'America/New_York', now }), 'No open T-Fiber proof requests.');
});
