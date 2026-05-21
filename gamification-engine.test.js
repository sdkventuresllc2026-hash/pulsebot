const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureGamificationState,
  rememberLineId,
  markMilestoneOnce,
  deriveLeaderboardMovement,
  buildLeaderboardContext,
} = require('./gamification-engine');
const { selectHypeLine } = require('./premium-confirmation');

test('ensure gamification state is backward compatible', () => {
  const data = { gamification: { dailyMilestones: {} } };
  const game = ensureGamificationState(data);
  assert.ok(game.dailyMilestones);
  assert.ok(game.weeklyMilestones);
  assert.ok(game.allTimeMilestones);
  assert.ok(game.teamMilestones);
  assert.ok(Array.isArray(game.recentLineIds));
});

test('line repeat protection prefers not recently used IDs', () => {
  const picked = selectHypeLine({
    event: 'fallback',
    recentLineIds: ['recognition_1'],
    values: { rep: 'Test Rep' },
  });
  assert.ok(picked);
  assert.notEqual(picked.id, 'recognition_1');
});

test('milestone dedupe marks only once', () => {
  const data = {};
  const game = ensureGamificationState(data);
  const key = '2026-05-19:rep.daily:u1:5';
  assert.equal(markMilestoneOnce(game.dailyMilestones, key), true);
  assert.equal(markMilestoneOnce(game.dailyMilestones, key), false);
});

test('derive leaderboard movement detects first/top3/pass/one-away', () => {
  const beforeRows = [
    { userId: 'a', displayName: 'A', total: 5 },
    { userId: 'b', displayName: 'B', total: 4 },
    { userId: 'c', displayName: 'C', total: 3 },
    { userId: 'u', displayName: 'U', total: 2 },
  ];
  const afterRows = [
    { userId: 'u', displayName: 'U', total: 6 },
    { userId: 'a', displayName: 'A', total: 5 },
    { userId: 'b', displayName: 'B', total: 4 },
  ];
  const movement = deriveLeaderboardMovement({ beforeRows, afterRows, userId: 'u' });
  assert.equal(movement.tookFirst, true);
  assert.equal(movement.enteredTop3, true);
});

test('leaderboard context generates clean race lines', () => {
  const rows = [
    { userId: 'a', displayName: 'Alpha', total: 10 },
    { userId: 'b', displayName: 'Bravo', total: 9 },
    { userId: 'c', displayName: 'Charlie', total: 8 },
  ];
  const line = buildLeaderboardContext(rows);
  assert.match(line, /deal from|Top 3|within|#\d/i);
});

test('rememberLineId keeps only latest window', () => {
  const data = {};
  const game = ensureGamificationState(data);
  for (let i = 0; i < 50; i += 1) rememberLineId(game, `line_${i}`, 40);
  assert.equal(game.recentLineIds.length, 40);
  assert.equal(game.recentLineIds[0], 'line_10');
});
