const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLeaderboardTextIntent } = require('./leaderboard-text');

test('parseLeaderboardTextIntent recognizes board keywords', () => {
  assert.deepEqual(parseLeaderboardTextIntent('lb'), { cmd: 'blitz', timeframe: 'alltime' });
  assert.deepEqual(parseLeaderboardTextIntent('leaderboard'), { cmd: 'blitz', timeframe: 'alltime' });
  assert.deepEqual(parseLeaderboardTextIntent('daily'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('weekly'), { cmd: 'blitz', timeframe: 'weekly' });
  assert.deepEqual(parseLeaderboardTextIntent('master week'), { cmd: 'master', period: 'week' });
  assert.deepEqual(parseLeaderboardTextIntent('master month'), { cmd: 'master', period: 'month' });
  assert.deepEqual(parseLeaderboardTextIntent('master leaderboard'), { cmd: 'master', period: 'alltime' });
  assert.deepEqual(parseLeaderboardTextIntent('show master'), { cmd: 'master', period: 'alltime' });
  assert.deepEqual(parseLeaderboardTextIntent('lb!'), { cmd: 'blitz', timeframe: 'alltime' });
  assert.deepEqual(parseLeaderboardTextIntent('quarter'), { cmd: 'quarter' });
  assert.deepEqual(parseLeaderboardTextIntent('mydeals'), { cmd: 'mydeals' });
  assert.deepEqual(parseLeaderboardTextIntent('markets'), { cmd: 'markets' });
});

test('parseLeaderboardTextIntent ignores speed shorthand', () => {
  assert.equal(parseLeaderboardTextIntent('1gig'), null);
  assert.equal(parseLeaderboardTextIntent('500'), null);
  assert.equal(parseLeaderboardTextIntent('2x 1g'), null);
});
