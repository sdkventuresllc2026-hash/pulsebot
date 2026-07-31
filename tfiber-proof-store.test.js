const test = require('node:test');
const assert = require('node:assert/strict');

const { selectPendingTfiberProof, selectRecentTfiberProofLog } = require('./tfiber-proof-store');

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
    pending({ logId: 'old', createdAt: '2026-07-29T12:00:00.000Z', tmoOrderId: 'TMO20260729111AA' }),
    pending({ logId: 'new', createdAt: '2026-07-29T13:00:00.000Z', tmoOrderId: 'TMO20260729222BB' }),
  ]);

  assert.equal(result.pending, null);
  assert.equal(result.reason, 'ambiguous');
  assert.equal(result.pendingCount, 2);
});

test('selectPendingTfiberProof matches the pending deal by TMO id instead of latest-created order', () => {
  const result = selectPendingTfiberProof([
    pending({ logId: 'old', createdAt: '2026-07-29T12:00:00.000Z', tmoOrderId: 'TMO20260729111AA' }),
    pending({ logId: 'new', createdAt: '2026-07-29T13:00:00.000Z', tmoOrderId: 'TMO20260729222BB' }),
  ], { tmoOrderId: 'tmo-20260729-111aa' });

  assert.equal(result.pending.logId, 'old');
  assert.equal(result.reason, 'matched_tmo');
});

test('selectPendingTfiberProof refuses a TMO id that does not match any open request', () => {
  const result = selectPendingTfiberProof([
    pending({ logId: 'old', createdAt: '2026-07-29T12:00:00.000Z', tmoOrderId: 'TMO20260729111AA' }),
    pending({ logId: 'new', createdAt: '2026-07-29T13:00:00.000Z', tmoOrderId: 'TMO20260729222BB' }),
  ], { tmoOrderId: 'TMO20260729333CC' });

  assert.equal(result.pending, null);
  assert.equal(result.reason, 'tmo_not_matched');
});

test('selectPendingTfiberProof allows one open request when the rep provides the TMO id later', () => {
  const result = selectPendingTfiberProof([
    pending({ logId: 'only', createdAt: '2026-07-29T12:00:00.000Z' }),
  ], { tmoOrderId: 'TMO20260729333CC' });

  assert.equal(result.pending.logId, 'only');
  assert.equal(result.reason, 'single_pending_with_tmo');
});

test('selectRecentTfiberProofLog recovers one recent proof-missing channel log', () => {
  const result = selectRecentTfiberProofLog([
    {
      id: 'log-1',
      userId: 'rep-1',
      displayName: 'Rep One',
      speed: '1gig',
      channelId: 'chan-1',
      timestamp: '2026-07-30T17:47:55.896Z',
      tfiberProofStatus: 'NEEDS_SCREENSHOT',
    },
  ], {
    userId: 'rep-1',
    channelId: 'chan-1',
    messageTimestamp: Date.parse('2026-07-30T17:48:01.688Z'),
    windowMs: 2 * 60 * 1000,
    guildId: 'guild-1',
    marketIdentity: { marketId: 'wilmington', marketName: 'Wilmington' },
    blitzName: 'Wilmington',
  });

  assert.equal(result.reason, 'single_recent_log');
  assert.equal(result.pending.logId, 'log-1');
  assert.equal(result.pending.marketName, 'Wilmington');
});

test('selectRecentTfiberProofLog recovers 2 Gig proof-missing channel logs too', () => {
  const result = selectRecentTfiberProofLog([
    {
      id: 'log-2g',
      userId: 'rep-1',
      displayName: 'Rep One',
      speed: '2gig',
      channelId: 'chan-1',
      timestamp: '2026-07-30T17:47:55.896Z',
      tfiberProofStatus: 'NEEDS_SCREENSHOT',
    },
  ], {
    userId: 'rep-1',
    channelId: 'chan-1',
    messageTimestamp: Date.parse('2026-07-30T17:48:01.688Z'),
    windowMs: 2 * 60 * 1000,
  });

  assert.equal(result.reason, 'single_recent_log');
  assert.equal(result.pending.logId, 'log-2g');
  assert.equal(result.pending.plan, 'T-Fiber 2 Gig');
});

test('selectRecentTfiberProofLog refuses multiple recent proof-missing logs', () => {
  const logs = ['old', 'new'].map((id, index) => ({
    id,
    userId: 'rep-1',
    displayName: 'Rep One',
    speed: '1gig',
    channelId: 'chan-1',
    timestamp: `2026-07-30T17:4${index}:55.896Z`,
    tfiberProofStatus: 'NEEDS_SCREENSHOT',
  }));
  const result = selectRecentTfiberProofLog(logs, {
    userId: 'rep-1',
    channelId: 'chan-1',
    messageTimestamp: Date.parse('2026-07-30T17:42:01.688Z'),
    windowMs: 2 * 60 * 1000,
  });

  assert.equal(result.pending, null);
  assert.equal(result.reason, 'ambiguous_recent_logs');
});
