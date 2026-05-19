const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  APPROVED_CHANNELS_PATH,
  addMarket,
  listMarkets,
  connectChannelToMarket,
  removeChannelFromMarket,
  marketForChannelId,
  inferMarketForLog,
} = require('./deal-channels');
const { filterToday, filterByWeekId } = require('./stats');

function withChannelConfigFixture(fn) {
  const existed = fs.existsSync(APPROVED_CHANNELS_PATH);
  const original = existed ? fs.readFileSync(APPROVED_CHANNELS_PATH, 'utf8') : null;
  fs.writeFileSync(
    APPROVED_CHANNELS_PATH,
    JSON.stringify({ channels: [], disabledChannelIds: [], markets: [] }, null, 2),
    'utf8',
  );
  try {
    return fn();
  } finally {
    if (existed) fs.writeFileSync(APPROVED_CHANNELS_PATH, original, 'utf8');
    else fs.unlinkSync(APPROVED_CHANNELS_PATH);
  }
}

test('channel to market mapping connect/remove works', () =>
  withChannelConfigFixture(() => {
    const created = addMarket({ marketName: 'New Haven CT', createdBy: 'admin-1' });
    assert.equal(created.market.marketId, 'new-haven-ct');
    assert.equal(listMarkets().length, 1);

    connectChannelToMarket({
      channel: { id: 'channel-1', name: 'new-haven-deals' },
      marketId: 'new-haven-ct',
      connectedBy: 'admin-1',
    });
    assert.equal(marketForChannelId('channel-1')?.marketName, 'New Haven CT');

    const removed = removeChannelFromMarket('channel-1');
    assert.equal(removed.removed, true);
    assert.equal(marketForChannelId('channel-1'), null);
  }));

test('infer market uses explicit log fields first', () =>
  withChannelConfigFixture(() => {
    const inferred = inferMarketForLog({
      channelId: 'ch-x',
      marketId: 'west-virginia',
      marketName: 'West Virginia',
    });
    assert.equal(inferred.marketId, 'west-virginia');
    assert.equal(inferred.marketName, 'West Virginia');
  }));

test('infer market falls back from channel map and supports unassigned', () =>
  withChannelConfigFixture(() => {
    addMarket({ marketName: 'Kinetic Tulsa', createdBy: 'admin-1' });
    connectChannelToMarket({
      channel: { id: 'channel-kinetic', name: 'kinetic-tulsa' },
      marketId: 'kinetic-tulsa',
      connectedBy: 'admin-1',
    });

    const mapped = inferMarketForLog({ channelId: 'channel-kinetic' });
    assert.equal(mapped.marketId, 'kinetic-tulsa');
    assert.equal(mapped.marketName, 'Kinetic Tulsa');

    const unassigned = inferMarketForLog({ channelId: 'unknown-channel' });
    assert.equal(unassigned.marketId, null);
    assert.equal(unassigned.marketName, 'Unassigned');
  }));

test('daily and weekly market views can be derived from market tags', () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const logs = [
    { userId: 'u1', date: today, weekId: 9, marketId: 'new-haven-ct', marketName: 'New Haven CT' },
    { userId: 'u2', date: today, weekId: 9, marketId: 'new-haven-ct', marketName: 'New Haven CT' },
    { userId: 'u3', date: today, weekId: 9, marketId: 'west-virginia', marketName: 'West Virginia' },
    { userId: 'u4', date: today, weekId: 8, marketId: 'west-virginia', marketName: 'West Virginia' },
  ];

  const dailyInMarket = filterToday(logs, 'America/New_York').filter((l) => l.marketId === 'new-haven-ct');
  const weeklyInMarket = filterByWeekId(logs, 9).filter((l) => l.marketId === 'new-haven-ct');
  const masterWeekly = filterByWeekId(logs, 9);

  assert.equal(dailyInMarket.length, 2);
  assert.equal(weeklyInMarket.length, 2);
  assert.equal(masterWeekly.length, 3);
});
