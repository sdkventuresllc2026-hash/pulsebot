const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLeaderboardTextIntent } = require('./leaderboard-text');

test('parseLeaderboardTextIntent recognizes market commands', () => {
  assert.deepEqual(parseLeaderboardTextIntent('daily'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('!daily'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('!lb'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('leaderboard'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('yesterday'), { cmd: 'blitz', timeframe: 'yesterday' });
  assert.deepEqual(parseLeaderboardTextIntent('weekly'), { cmd: 'blitz', timeframe: 'weekly' });
  assert.deepEqual(parseLeaderboardTextIntent('weekly last'), { cmd: 'blitz', timeframe: 'lastweek' });
  assert.deepEqual(parseLeaderboardTextIntent('last week'), { cmd: 'blitz', timeframe: 'lastweek' });
  assert.deepEqual(parseLeaderboardTextIntent('monthly'), { cmd: 'blitz', timeframe: 'monthly' });
  assert.deepEqual(parseLeaderboardTextIntent('monthly last'), { cmd: 'blitz', timeframe: 'lastmonth' });
  assert.deepEqual(parseLeaderboardTextIntent('last month'), { cmd: 'blitz', timeframe: 'lastmonth' });
  assert.deepEqual(parseLeaderboardTextIntent('alltime'), { cmd: 'blitz', timeframe: 'alltime' });
});

test('parseLeaderboardTextIntent recognizes master commands (bare master => daily)', () => {
  assert.deepEqual(parseLeaderboardTextIntent('master'), { cmd: 'master', period: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent(' MASTER '), { cmd: 'master', period: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('master daily'), { cmd: 'master', period: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('master yesterday'), { cmd: 'master', period: 'yesterday' });
  assert.deepEqual(parseLeaderboardTextIntent('master week'), { cmd: 'master', period: 'weekly' });
  assert.deepEqual(parseLeaderboardTextIntent('master weekly'), { cmd: 'master', period: 'weekly' });
  assert.deepEqual(parseLeaderboardTextIntent('master week last'), { cmd: 'master', period: 'lastweek' });
  assert.deepEqual(parseLeaderboardTextIntent('master last week'), { cmd: 'master', period: 'lastweek' });
  assert.deepEqual(parseLeaderboardTextIntent('master month'), { cmd: 'master', period: 'monthly' });
  assert.deepEqual(parseLeaderboardTextIntent('master monthly'), { cmd: 'master', period: 'monthly' });
  assert.deepEqual(parseLeaderboardTextIntent('master last month'), { cmd: 'master', period: 'lastmonth' });
  assert.deepEqual(parseLeaderboardTextIntent('master alltime'), { cmd: 'master', period: 'alltime' });
});

test('parseLeaderboardTextIntent rejects unrelated text', () => {
  for (const raw of ['', '   ', 'master gibberish', 'banana', '1gig', '500', '2x 1g', 'lbs']) {
    assert.equal(parseLeaderboardTextIntent(raw), null, JSON.stringify(raw));
  }
});
