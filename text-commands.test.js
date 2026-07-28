const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLeaderboardTextIntent, parseTextCommandIntent } = require('./leaderboard-text');

// Owner requirement 2026-07-28: reps log by typing "1g" and never open the slash menu, so
// everything they need mid-shift must work as plain text too.
test('leaderboard timeframes already work as plain text', () => {
  assert.deepEqual(parseLeaderboardTextIntent('daily'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('weekly'), { cmd: 'blitz', timeframe: 'weekly' });
  assert.deepEqual(parseLeaderboardTextIntent('last week'), { cmd: 'blitz', timeframe: 'lastweek' });
  assert.deepEqual(parseLeaderboardTextIntent('monthly'), { cmd: 'blitz', timeframe: 'monthly' });
  assert.deepEqual(parseLeaderboardTextIntent('master week'), { cmd: 'master', period: 'weekly' });
});

test('mydeals and undo now work as plain text', () => {
  for (const w of ['mydeals', 'my deals', 'me', 'mine', 'stats']) {
    assert.deepEqual(parseTextCommandIntent(w), { cmd: 'mydeals' }, w);
  }
  for (const w of ['undo', 'remove last', 'remove-last', 'oops']) {
    assert.deepEqual(parseTextCommandIntent(w), { cmd: 'undo' }, w);
  }
  assert.deepEqual(parseTextCommandIntent('markets'), { cmd: 'markets' });
  assert.deepEqual(parseTextCommandIntent('quarter'), { cmd: 'quarter' });
});

test('case and a leading slash or bang are tolerated', () => {
  assert.deepEqual(parseTextCommandIntent('UNDO'), { cmd: 'undo' });
  assert.deepEqual(parseTextCommandIntent('/mydeals'), { cmd: 'mydeals' });
  assert.deepEqual(parseTextCommandIntent('!undo'), { cmd: 'undo' });
});

test('a deal log is never swallowed as a text command', () => {
  // These must fall through to the deal parser, or logging breaks.
  for (const w of ['1g', '2g', '2x 1g', '500', 'gg', '']) {
    assert.equal(parseTextCommandIntent(w), null, w);
    assert.equal(parseLeaderboardTextIntent(w), null, w);
  }
});
