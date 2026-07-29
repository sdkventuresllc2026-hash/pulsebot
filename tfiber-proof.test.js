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
} = require('./tfiber-proof');

function attachmentMap(items) {
  return new Map(items.map((item) => [item.id, item]));
}

test('normalizes and extracts TMO order ids', () => {
  assert.equal(normalizeTmoOrderId(' tmo-20260725 ak6oi '), 'TMO20260725AK6OI');
  assert.equal(extractTmoOrderId('order is TMO20260725AK6OI thanks'), 'TMO20260725AK6OI');
  assert.equal(normalizeTmoOrderId('abc123'), null);
});

test('requires proof only for 1G logs in T-Fiber contexts', () => {
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketName: 'Charlotte T-Fiber Blitz' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], channelName: '🛜wilmington' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], channelName: '🛜jacksonville' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketId: 'wilmington-nc' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['2gig'], marketName: 'Charlotte T-Fiber Blitz' }), false);
  assert.equal(requiresTfiberProof({ speeds: ['2gig'], channelName: '🛜jacksonville' }), false);
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
});

test('proof clock is 48 hours', () => {
  const now = new Date('2026-07-29T12:00:00Z');
  assert.equal(TFIBER_PROOF_EXPIRATION_HOURS, 48);
  assert.equal(proofExpiresAt(now).toISOString(), '2026-07-31T12:00:00.000Z');
});
