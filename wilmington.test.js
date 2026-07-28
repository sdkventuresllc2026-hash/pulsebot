const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-wilm-'));
process.env.PULSE_DATA_DIR = dir;
const STORE = path.join(dir, 'approved-blitz-channels.json');

const DC = require('./deal-channels');
const A = require('./market-assignments');
const { authorizeMarketCommand } = require('./command-policy');
const { buildChannelOverwrites } = require('./market-access');
const { PermissionFlagsBits: P } = require('discord.js');

const CALEB = '373653162042720266', BEN = '949541784126648330', JONAH = '699672451344236645';
const TRIPP = '1296303439084650552', MALAKAI = '459667932914515969';
const OUTSIDER = '111111111111111111';
const ALEX = '1464879769756893270', JACOB = '1234228856555045015';
const R = { wilm: 'r-wilm', jax: 'r-jax', kan: 'r-kan', inm: 'r-inm' };

function seed() {
  fs.writeFileSync(STORE, JSON.stringify({
    schemaVersion: 1, channels: [], disabledChannelIds: [],
    markets: [
      { marketId: 'wilmington-nc', marketName: 'Wilmington', city: 'Wilmington', state: 'NC', isp: 'T-Fiber', active: true, channelIds: ['c-wilm'], roleId: R.wilm, repUserIds: [], managerUserIds: [] },
      { marketId: 'jacksonville', marketName: 'Jacksonville', active: true, channelIds: ['c-jax'], roleId: R.jax, repUserIds: [TRIPP, MALAKAI], managerUserIds: [JACOB] },
      { marketId: 'kannapolis', marketName: 'Kannapolis', active: true, channelIds: ['c-kan'], roleId: R.kan, repUserIds: [], managerUserIds: [OUTSIDER] },
      { marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c-inm'], roleId: R.inm, repUserIds: [], managerUserIds: [] },
    ],
  }, null, 2));
  DC.readApprovedChannelsData();
}
test.beforeEach(() => seed());

const guild = () => ({ roles: { everyone: { id: 'everyone' }, cache: new Map([['everyone', {}], [R.wilm, {}], [R.jax, {}], [R.kan, {}], [R.inm, {}]]) } });
const mkt = (id, name, roleId, mgrs) => ({ marketId: id, marketName: name, roleId, managerUserIds: mgrs });
const viewers = (ow) => ow.filter((o) => (o.allow || []).includes(P.ViewChannel)).map((o) => o.id);
const can = (uid, sub, marketId, owner) => authorizeMarketCommand({
  userId: uid, isOwner: Boolean(owner), isManagerTier: true, subcommand: sub, marketId, scopingEnabled: true,
}).ok;

test('creating or cleaning Wilmington is Owner/Admin only', () => {
  for (const sub of ['create', 'cleanup', 'rename', 'sync']) {
    assert.equal(can(CALEB, sub, 'wilmington-nc'), false, `manager must not ${sub}`);
    assert.equal(can('owner', sub, 'wilmington-nc', true), true, `owner must ${sub}`);
  }
});

test('Wilmington has a stable immutable id derived from a CONFIRMED state', () => {
  const m = DC.readApprovedChannelsData().markets.find((x) => x.marketName === 'Wilmington');
  assert.equal(m.marketId, 'wilmington-nc');
  assert.equal(m.state, 'NC');
  assert.equal(m.isp, 'T-Fiber');
  // Must not repeat the Ashtabula mistake of baking the wrong place into a permanent id.
  assert.ok(!/new-york|newark|somerset/.test(m.marketId));
});

test('duplicate Wilmington assignment is idempotent and never doubles the market', () => {
  assert.equal(DC.readApprovedChannelsData().markets.filter((m) => m.marketName === 'Wilmington').length, 1);
  A.addManagerMarketAssignment(CALEB, 'wilmington-nc');
  A.addManagerMarketAssignment(CALEB, 'wilmington-nc');
  assert.equal(DC.readApprovedChannelsData().markets.filter((m) => m.marketName === 'Wilmington').length, 1);
  assert.deepEqual(A.getManagerMarkets(CALEB), ['wilmington-nc']);
});

test('all three Wilmington managers manage it, and nothing else', () => {
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  for (const uid of [CALEB, BEN, JONAH]) {
    assert.deepEqual(A.getManagerMarkets(uid), ['wilmington-nc']);
    assert.equal(can(uid, 'add', 'wilmington-nc'), true);
    assert.equal(can(uid, 'add', 'jacksonville'), false, 'old market is not retained by default');
    assert.equal(can(uid, 'status', 'kannapolis'), false);
  }
});

test('removing one Wilmington manager leaves the other two intact', () => {
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  A.removeManagerMarketAssignment(BEN, 'wilmington-nc');
  assert.deepEqual(A.getManagerMarkets(BEN), []);
  assert.deepEqual(A.getManagerMarkets(CALEB), ['wilmington-nc']);
  assert.deepEqual(A.getManagerMarkets(JONAH), ['wilmington-nc']);
  assert.equal(can(BEN, 'add', 'wilmington-nc'), false);
  assert.equal(can(CALEB, 'add', 'wilmington-nc'), true);
});

test('moving Tripp and Malakai to Wilmington REMOVES their Jacksonville assignment', () => {
  assert.deepEqual(A.getRepMarkets(TRIPP), ['jacksonville']);
  assert.deepEqual(A.getRepMarkets(MALAKAI), ['jacksonville']);
  A.assignRepMarket(TRIPP, 'wilmington-nc');
  A.assignRepMarket(MALAKAI, 'wilmington-nc');
  assert.deepEqual(A.getRepMarkets(TRIPP), ['wilmington-nc'], 'a rep holds exactly one market');
  assert.deepEqual(A.getRepMarkets(MALAKAI), ['wilmington-nc']);
  const jax = DC.readApprovedChannelsData().markets.find((m) => m.marketId === 'jacksonville');
  assert.deepEqual(jax.repUserIds, [], 'stale Jacksonville membership must be cleared');
});

test('unrelated managers and reps cannot see Wilmington', () => {
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  assert.equal(can(OUTSIDER, 'add', 'wilmington-nc'), false, 'a Kannapolis manager must not reach Wilmington');
  const ow = buildChannelOverwrites(guild(), mkt('wilmington-nc', 'Wilmington', R.wilm, [CALEB, BEN, JONAH]), 'bot');
  assert.ok(!viewers(ow).includes(OUTSIDER));
  assert.ok(!viewers(ow).includes('some-random-rep'));
  const everyone = ow.find((o) => o.id === 'everyone');
  assert.ok(everyone.deny.includes(P.ViewChannel), 'unrelated members are denied via @everyone');
});

test('Owner/Admin sees and manages Wilmington globally', () => {
  for (const sub of ['add', 'remove', 'status', 'create', 'cleanup']) {
    assert.equal(can('owner', sub, 'wilmington-nc', true), true, sub);
  }
});

test('the Wilmington channel grants no invite permission and only its own role', () => {
  const ow = buildChannelOverwrites(guild(), mkt('wilmington-nc', 'Wilmington', R.wilm), 'bot');
  assert.deepEqual(viewers(ow).sort(), ['bot', R.wilm].sort());
  for (const o of ow) assert.ok(!(o.allow || []).includes(P.CreateInstantInvite), 'invite creation must not be granted');
});

test('Wilmington survives repeated reloads (restart equivalent)', () => {
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  A.assignRepMarket(TRIPP, 'wilmington-nc');
  for (let i = 0; i < 3; i++) {
    const w = DC.readApprovedChannelsData().markets.find((m) => m.marketId === 'wilmington-nc');
    assert.ok(w, `Wilmington missing after reload ${i + 1}`);
    assert.equal(w.active, true);
    assert.deepEqual(w.managerUserIds.slice().sort(), [CALEB, BEN, JONAH].sort());
    assert.deepEqual(w.repUserIds, [TRIPP]);
  }
});

test('the desired overwrite set for Wilmington is deterministic across restarts', () => {
  const a = buildChannelOverwrites(guild(), mkt('wilmington-nc', 'Wilmington', R.wilm, [CALEB]), 'bot');
  const b = buildChannelOverwrites(guild(), mkt('wilmington-nc', 'Wilmington', R.wilm, [CALEB]), 'bot');
  const norm = (ow) => ow.map((o) => [o.id, (o.allow || []).map(String).sort().join(), (o.deny || []).map(String).sort().join()]);
  assert.deepEqual(norm(a), norm(b));
});

// --- Scope boundary: Pulse operational market, not a FiberSales.co record --------------------

test('Wilmington is a PULSE operational market tagged T-Fiber via Palmetto', () => {
  const m = DC.readApprovedChannelsData().markets.find((x) => x.marketId === 'wilmington-nc');
  assert.equal(m.isp, 'T-Fiber');
  assert.equal(m.state, 'NC');
  // A readable operational slug, deliberately NOT a FiberSales.co Prisma cuid (25 chars, c-prefixed).
  assert.ok(!/^c[a-z0-9]{24}$/.test(m.marketId), 'must not masquerade as a FiberSales.co Market cuid');
  assert.equal(m.marketId, 'wilmington-nc');
});

// --- Jacksonville after the move -------------------------------------------------------------

test('Jacob keeps Jacksonville while the three movers lose it', () => {
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  assert.deepEqual(A.getManagerMarkets(JACOB), ['jacksonville'], 'unrelated Jacksonville assignment untouched');
  assert.equal(can(JACOB, 'add', 'jacksonville'), true);
  for (const uid of [CALEB, BEN, JONAH]) {
    assert.equal(can(uid, 'add', 'jacksonville'), false, 'no default retention of the old market');
  }
});

test('Alex manages Jacksonville once assigned, and nothing else', () => {
  A.addManagerMarketAssignment(ALEX, 'jacksonville');
  assert.deepEqual(A.getManagerMarkets(ALEX), ['jacksonville']);
  assert.equal(can(ALEX, 'add', 'jacksonville'), true);
  assert.equal(can(ALEX, 'add', 'wilmington-nc'), false, 'Jacksonville only unless separately approved');
  assert.equal(can(ALEX, 'status', 'kannapolis'), false);
});

test('an assignment record alone does not bypass the Manager tier', () => {
  A.addManagerMarketAssignment(ALEX, 'jacksonville');
  // Alex does not hold the Discord Manager role today. isManagerTier=false models that.
  const denied = authorizeMarketCommand({
    userId: ALEX, isOwner: false, isManagerTier: false, subcommand: 'add', marketId: 'jacksonville', scopingEnabled: true,
  });
  assert.equal(denied.ok, false, 'the record is inert until the Owner grants the Manager role');
  assert.match(denied.reason, /Manager role/);
});

test('assignment records survive drift: reconciliation restores the approved state', async () => {
  A.addManagerMarketAssignment(CALEB, 'wilmington-nc');
  const held = new Set([R.jax]);                       // hand-added drift, no record backing it
  const member = { roles: { cache: { keys: () => held.values(), has: (r) => held.has(r) }, add: async (r) => held.add(r), remove: async (r) => held.delete(r) } };
  const plan = await A.reconcileMemberMarketRoles({ members: { fetch: async () => member } }, CALEB);
  assert.deepEqual(Array.from(held), [R.wilm], 'Discord drift reconciles back to the record');
  assert.equal(plan.remove.length, 1);
  assert.equal(plan.add.length, 1);
});

test('historical Pulse logs are untouched by an assignment change', () => {
  const before = JSON.parse(JSON.stringify(DC.readApprovedChannelsData().channels));
  A.assignRepMarket(TRIPP, 'wilmington-nc');
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  assert.deepEqual(DC.readApprovedChannelsData().channels, before, 'channel/log records must not be rewritten');
});

// --- Final owner decisions, 2026-07-28 -------------------------------------------------------
// Jacksonville managers: Jacob Arnold, Alex Minter, Henry Sells.
// Wilmington managers:   Caleb Head, Ben Edwards, Jonah McKinnon.

const HENRY = '1504984792758751423';

test('the three Jacksonville managers manage Jacksonville and nothing else', () => {
  for (const uid of [JACOB, ALEX, HENRY]) A.addManagerMarketAssignment(uid, 'jacksonville');
  for (const uid of [JACOB, ALEX, HENRY]) {
    assert.deepEqual(A.getManagerMarkets(uid), ['jacksonville']);
    assert.equal(can(uid, 'add', 'jacksonville'), true);
    assert.equal(can(uid, 'add', 'wilmington-nc'), false, 'Jacksonville managers must not reach Wilmington');
    assert.equal(can(uid, 'status', 'kannapolis'), false);
  }
});

test('Henry keeps all THREE approved markets', () => {
  for (const m of ['jacksonville', 'inman', 'kannapolis']) A.addManagerMarketAssignment(HENRY, m);
  assert.deepEqual(A.getManagerMarkets(HENRY).sort(), ['inman', 'jacksonville', 'kannapolis']);
  for (const m of ['jacksonville', 'inman', 'kannapolis']) assert.equal(can(HENRY, 'add', m), true, m);
  assert.equal(can(HENRY, 'add', 'wilmington-nc'), false, 'Wilmington is not his');
});

test('reconciliation KEEPS all three approved Henry roles', async () => {
  for (const m of ['jacksonville', 'inman', 'kannapolis']) A.addManagerMarketAssignment(HENRY, m);
  const held = new Set([R.jax, R.inm, R.kan]);
  const member = { roles: { cache: { keys: () => held.values(), has: (r) => held.has(r) }, add: async (r) => held.add(r), remove: async (r) => held.delete(r) } };
  const plan = await A.reconcileMemberMarketRoles({ members: { fetch: async () => member } }, HENRY);
  assert.deepEqual(Array.from(held).sort(), [R.jax, R.inm, R.kan].sort(), 'all three approved roles survive');
  assert.equal(plan.remove.length, 0, 'nothing is stripped from an approved multi-market manager');
});

test('the two manager groups are mutually exclusive', () => {
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  for (const uid of [JACOB, ALEX, HENRY]) A.addManagerMarketAssignment(uid, 'jacksonville');
  for (const uid of [CALEB, BEN, JONAH]) assert.equal(can(uid, 'add', 'jacksonville'), false);
  for (const uid of [JACOB, ALEX, HENRY]) assert.equal(can(uid, 'add', 'wilmington-nc'), false);
});

test('the movers keep NO Jacksonville access — clean cut, no unbacked roles', async () => {
  // Owner FINAL: no temporary access. A role with no assignment record is drift, and
  // reconciliation removes it — which is exactly the intended outcome here.
  for (const uid of [CALEB, BEN, JONAH]) A.addManagerMarketAssignment(uid, 'wilmington-nc');
  A.assignRepMarket(TRIPP, 'wilmington-nc');
  A.assignRepMarket(MALAKAI, 'wilmington-nc');
  const jax = DC.readApprovedChannelsData().markets.find((m) => m.marketId === 'jacksonville');
  for (const uid of [CALEB, BEN, JONAH]) assert.ok(!(jax.managerUserIds || []).includes(uid));
  for (const uid of [TRIPP, MALAKAI]) assert.ok(!(jax.repUserIds || []).includes(uid));
  // And a leftover Discord role reconciles away rather than lingering.
  const held = new Set([R.jax]);
  const member = { roles: { cache: { keys: () => held.values(), has: (r) => held.has(r) }, add: async (r) => held.add(r), remove: async (r) => held.delete(r) } };
  await A.reconcileMemberMarketRoles({ members: { fetch: async () => member } }, CALEB);
  assert.deepEqual(Array.from(held), [R.wilm], 'stale Jacksonville role removed, Wilmington granted');
});
