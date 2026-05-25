const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLeaderboardTextIntent } = require('./leaderboard-text');

test('parseLeaderboardTextIntent recognizes final command list with or without bang prefix', () => {
  assert.deepEqual(parseLeaderboardTextIntent('daily'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('!daily'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent(' leaderboard '), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('!lb extra junk'), { cmd: 'blitz', timeframe: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('weekly'), { cmd: 'blitz', timeframe: 'weekly' });
  assert.deepEqual(parseLeaderboardTextIntent('alltime'), { cmd: 'blitz', timeframe: 'alltime' });
  assert.deepEqual(parseLeaderboardTextIntent('master daily'), { cmd: 'master', period: 'daily' });
  assert.deepEqual(parseLeaderboardTextIntent('!master  weekly'), { cmd: 'master', period: 'weekly' });
  assert.deepEqual(parseLeaderboardTextIntent('master alltime'), { cmd: 'master', period: 'alltime' });
  assert.deepEqual(parseLeaderboardTextIntent('master leaderboard'), { cmd: 'master', period: 'alltime' });
});

test('parseLeaderboardTextIntent rejects unsupported duplicate commands', () => {
  for (const raw of [
    '!master today',
    'master today',
    '!master week',
    '!master all time',
    '!master lb',
    '!all time',
    '!week',
    '!today',
    '!daily leaderboard',
    '!weekly leaderboard',
  ]) {
    assert.equal(parseLeaderboardTextIntent(raw), null, raw);
  }
});

test('parseLeaderboardTextIntent ignores speed shorthand', () => {
  assert.equal(parseLeaderboardTextIntent('!1gig'), null);
  assert.equal(parseLeaderboardTextIntent('500'), null);
  assert.equal(parseLeaderboardTextIntent('2x 1g'), null);
});
