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

test('selectRecentTfiberProofLog never glues a 2nd screenshot onto a deal logged from its own screenshot (Alex Lile 10/20)', () => {
  const result = selectRecentTfiberProofLog([
    { id: 'log-from-shot', userId: 'rep-1', speed: '2gig', channelId: 'chan-1', timestamp: '2026-10-20T15:56:25.000Z', tfiberFromScreenshot: true, tfiberProofStatus: 'PROOF_ATTACHED' },
  ], { userId: 'rep-1', channelId: 'chan-1', messageTimestamp: Date.parse('2026-10-20T15:56:52.000Z'), windowMs: 2 * 60 * 1000 });
  assert.equal(result.pending, null);
  assert.equal(result.reason, 'none');
});

const { selectAdoptablePending, recentScreenshotDeal } = require('./tfiber-proof-store');
const SHIFT = 6 * 3600e3;
const stamped = (over, extra) => ({ ...pending(over), timestamp: over.createdAt, ...extra });

test('selectAdoptablePending never hands a new screenshot to last night\'s request or to one that already got a screenshot (Caleb Head 10/29)', () => {
  const nowMs = Date.parse('2026-10-29T15:22:05.000Z');
  const lastNightReview = stamped({ logId: 'last-night', createdAt: '2026-10-28T22:37:22.000Z' }, { proofStatus: 'NEEDS_REVIEW' });
  assert.equal(selectAdoptablePending([lastNightReview], { nowMs, maxAgeMs: SHIFT }).pending, null);
  const lastNightNoShot = stamped({ logId: 'old', createdAt: '2026-10-28T22:37:22.000Z' }, { proofStatus: 'NEEDS_SCREENSHOT' });
  assert.equal(selectAdoptablePending([lastNightNoShot], { nowMs, maxAgeMs: SHIFT }).pending, null);
  const todayReview = stamped({ logId: 'today-review', createdAt: '2026-10-29T15:10:00.000Z' }, { proofStatus: 'NEEDS_REVIEW' });
  assert.equal(selectAdoptablePending([todayReview], { nowMs, maxAgeMs: SHIFT }).pending, null);
});

test('selectAdoptablePending takes the one request from this shift still waiting on its first screenshot', () => {
  const nowMs = Date.parse('2026-10-29T15:22:05.000Z');
  const fresh = stamped({ logId: 'fresh', createdAt: '2026-10-29T15:10:00.000Z' }, { proofStatus: 'NEEDS_SCREENSHOT' });
  const stale = stamped({ logId: 'stale', createdAt: '2026-10-28T22:37:22.000Z' }, { proofStatus: 'NEEDS_REVIEW' });
  const picked = selectAdoptablePending([stale, fresh], { nowMs, maxAgeMs: SHIFT });
  assert.equal(picked.pending.logId, 'fresh');
  assert.equal(picked.reason, 'single_fresh_pending');
  assert.equal(selectAdoptablePending([fresh, { ...fresh, logId: 'fresh-2' }], { nowMs, maxAgeMs: SHIFT }).reason, 'ambiguous_fresh_pending');
});

test('selectAdoptablePending: a reply to the deal post wins, however old the request', () => {
  const nowMs = Date.parse('2026-10-29T15:22:05.000Z');
  const stale = stamped({ logId: 'stale', createdAt: '2026-10-28T22:37:22.000Z' }, { proofStatus: 'NEEDS_REVIEW', messageId: 'm-1g' });
  const picked = selectAdoptablePending([stale], { nowMs, maxAgeMs: SHIFT, replyToMessageId: 'm-1g' });
  assert.equal(picked.pending.logId, 'stale');
  assert.equal(picked.reason, 'replied_to_deal');
});

test('recentScreenshotDeal: a speed typed seconds after the screenshot already logged the deal confirms it, once', () => {
  const shot = { id: 'shot', userId: 'rep-1', channelId: 'ch-1', speed: '1gig', timestamp: '2026-10-29T15:22:05.000Z', tfiberFromScreenshot: true };
  const at = Date.parse('2026-10-29T15:22:11.000Z');
  const q = (logs, over = {}) => recentScreenshotDeal(logs, { userId: 'rep-1', channelId: 'ch-1', nowMs: at, windowMs: 120e3, ...over });
  assert.equal(q([shot]).id, 'shot');
  assert.equal(q([shot], { userId: 'rep-2' }), null);
  assert.equal(q([shot], { channelId: 'ch-2' }), null);
  assert.equal(q([{ ...shot, tfiberTypedConfirmMessageId: 'm' }]), null);
  assert.equal(q([shot], { nowMs: at + 10 * 60e3 }), null);
  assert.equal(q([{ ...shot, tfiberFromScreenshot: undefined }]), null);
});
