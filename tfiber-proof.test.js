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
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], channelName: '🛜ohio' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketId: 'wilmington-nc' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketName: 'Goldsboro' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['1gig'], marketId: 'dayton' }), true);
  assert.equal(requiresTfiberProof({ speeds: ['2gig'], marketName: 'Ohio' }), true);
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
