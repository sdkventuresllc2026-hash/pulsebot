const test = require('node:test');
const assert = require('node:assert/strict');

const { selectPendingTfiberProof } = require('./tfiber-proof-store');

function pending(overrides) {
  return {
    logId: overrides.logId,
    userId: 'rep-1',
    createdAt: overrides.createdAt,
    tmoOrderId: overrides.tmoOrderId || null,
    reminders: {},
  };
}

test('selectPendingTfiberProof does not guess when multiple proof requests are open without a TMO id', () => {
  const result = selectPendingTfiberProof([
    pending({ logId: 'old', createdAt: '2026-07-29T12:00:00.000Z', tmoOrderId: 'TMO111111AA' }),
    pending({ logId: 'new', createdAt: '2026-07-29T13:00:00.000Z', tmoOrderId: 'TMO222222BB' }),
  ]);

  assert.equal(result.pending, null);
  assert.equal(result.reason, 'ambiguous');
  assert.equal(result.pendingCount, 2);
});

test('selectPendingTfiberProof matches the pending deal by TMO id instead of latest-created order', () => {
  const result = selectPendingTfiberProof([
    pending({ logId: 'old', createdAt: '2026-07-29T12:00:00.000Z', tmoOrderId: 'TMO111111AA' }),
    pending({ logId: 'new', createdAt: '2026-07-29T13:00:00.000Z', tmoOrderId: 'TMO222222BB' }),
  ], { tmoOrderId: 'tmo-111111-aa' });

  assert.equal(result.pending.logId, 'old');
  assert.equal(result.reason, 'matched_tmo');
});

test('selectPendingTfiberProof refuses a TMO id that does not match any open request', () => {
  const result = selectPendingTfiberProof([
    pending({ logId: 'old', createdAt: '2026-07-29T12:00:00.000Z', tmoOrderId: 'TMO111111AA' }),
    pending({ logId: 'new', createdAt: '2026-07-29T13:00:00.000Z', tmoOrderId: 'TMO222222BB' }),
  ], { tmoOrderId: 'TMO333333CC' });

  assert.equal(result.pending, null);
  assert.equal(result.reason, 'tmo_not_matched');
});

test('selectPendingTfiberProof allows one open request when the rep provides the TMO id later', () => {
  const result = selectPendingTfiberProof([
    pending({ logId: 'only', createdAt: '2026-07-29T12:00:00.000Z' }),
  ], { tmoOrderId: 'TMO333333CC' });

  assert.equal(result.pending.logId, 'only');
  assert.equal(result.reason, 'single_pending_with_tmo');
});
