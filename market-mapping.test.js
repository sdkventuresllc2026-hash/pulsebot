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
  resolveMarket,
  ensureDefaultMarkets,
  deleteMarket,
  getMarketById,
  isApprovedDealChannel,
  ensureDealChannelRegistered,
  readApprovedChannelsData,
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

test('virginia market allows channel names like virginia without -deals suffix', () =>
  withChannelConfigFixture(() => {
    ensureDefaultMarkets('test');
    assert.equal(isApprovedDealChannel({ id: 'ch-va', name: '🛜virginia' }), true);
    assert.equal(isApprovedDealChannel({ id: 'ch-va2', name: 'virginia-deals' }), true);
    assert.equal(isApprovedDealChannel({ id: 'ch-x', name: 'random-chat' }), false);
  }));

test('ensureDealChannelRegistered persists greenville channel id', () =>
  withChannelConfigFixture(() => {
    ensureDefaultMarkets('test');
    const ch = { id: '999-greenville', name: '🛜greenville' };
    const reg = ensureDealChannelRegistered(ch, 'admin-1');
    assert.equal(reg.ok, true);
    assert.equal(reg.market.marketId, 'greenville');
    const data = readApprovedChannelsData();
    assert.ok(data.channels.some((c) => c.id === '999-greenville'));
    assert.ok(data.markets.find((m) => m.marketId === 'greenville')?.channelIds?.includes('999-greenville'));
    assert.equal(isApprovedDealChannel(ch), true);
  }));

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

test('infer market uses channel map before legacy log fields', () =>
  withChannelConfigFixture(() => {
    addMarket({ marketName: 'Mapped Market', marketId: 'mapped' });
    connectChannelToMarket({
      channel: { id: 'ch-mapped', name: 'mapped-deals' },
      marketId: 'mapped',
    });
    const inferred = inferMarketForLog({
      channelId: 'ch-mapped',
      marketId: 'west-virginia',
      marketName: 'West Virginia',
    });
    assert.equal(inferred.marketId, 'mapped');
    assert.equal(inferred.marketName, 'Mapped Market');
  }));

test('infer market from *-deals channel name when not mapped', () =>
  withChannelConfigFixture(() => {
    ensureDefaultMarkets('test');
    const inferred = inferMarketForLog({
      channelId: 'legacy-ch',
      channelName: 'virginia-deals',
      blitzName: 'virginia-deals',
    });
    assert.equal(inferred.marketId, 'virginia');
    assert.equal(inferred.marketName, 'Virginia');
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

test('resolveMarket matches id, display name, and bootstraps virginia-deals', () =>
  withChannelConfigFixture(() => {
    const boot = ensureDefaultMarkets('test');
    assert.ok(boot.some((m) => m.marketId === 'virginia') || getMarketById('virginia'));

    const byName = resolveMarket('Virginia');
    assert.equal(byName?.market.marketId, 'virginia');
    assert.ok(['id', 'name', 'fuzzy'].includes(byName.matchedBy));

    const byId = resolveMarket('virginia');
    assert.equal(byId.market.marketId, 'virginia');
  }));

test('deleteMarket removes registry entry', () =>
  withChannelConfigFixture(() => {
    addMarket({ marketName: 'Virginia', marketId: 'virginia' });
    assert.equal(listMarkets().length, 1);
    const { market } = deleteMarket('Virginia');
    assert.equal(market.marketId, 'virginia');
    assert.equal(listMarkets().length, 0);
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
