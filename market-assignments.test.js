const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the data dir BEFORE requiring anything that resolves paths at module load.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-assign-'));
process.env.PULSE_DATA_DIR = dir;

const CFG = path.join(dir, 'approved-blitz-channels.json');
const ROLE = { ashtabula: 'r-ash', inman: 'r-inm', kannapolis: 'r-kan' };

function seed() {
  fs.writeFileSync(CFG, JSON.stringify({
    channels: [], disabledChannelIds: [],
    markets: ['ashtabula', 'inman', 'kannapolis'].map((id) => ({
      marketId: id, marketName: id[0].toUpperCase() + id.slice(1), active: true,
      channelIds: [`c-${id}`], roleId: ROLE[id], repUserIds: [], managerUserIds: [],
    })),
  }, null, 2));
}
seed();

const A = require('./market-assignments');
const { authorizeMarketCommand } = require('./command-policy');

test.beforeEach(() => { seed(); });

// --- Rep: exactly one market -----------------------------------------------------------------

test('moving a Rep from A to B removes A', () => {
  A.assignRepMarket('rep1', 'ashtabula');
  assert.deepEqual(A.getRepMarkets('rep1'), ['ashtabula']);
  const r = A.assignRepMarket('rep1', 'inman');
  assert.deepEqual(A.getRepMarkets('rep1'), ['inman'], 'rep must not keep the old market');
  assert.deepEqual(r.removedFrom, ['ashtabula']);
});

test('a Rep never accumulates stale markets across several moves', () => {
  for (const m of ['ashtabula', 'inman', 'kannapolis', 'ashtabula']) A.assignRepMarket('rep2', m);
  assert.deepEqual(A.getRepMarkets('rep2'), ['ashtabula']);
});

// --- Manager: zero-to-many -------------------------------------------------------------------

test('a Manager can hold A, B and C at once', () => {
  for (const m of ['ashtabula', 'inman', 'kannapolis']) A.addManagerMarketAssignment('mgr1', m);
  assert.deepEqual(A.getManagerMarkets('mgr1').sort(), ['ashtabula', 'inman', 'kannapolis']);
});

test('removing Manager market B preserves A and C', () => {
  for (const m of ['ashtabula', 'inman', 'kannapolis']) A.addManagerMarketAssignment('mgr2', m);
  A.removeManagerMarketAssignment('mgr2', 'inman');
  assert.deepEqual(A.getManagerMarkets('mgr2').sort(), ['ashtabula', 'kannapolis']);
});

test('rep and manager assignment are independent', () => {
  A.assignRepMarket('dual', 'ashtabula');
  A.addManagerMarketAssignment('dual', 'inman');
  assert.deepEqual(A.getRepMarkets('dual'), ['ashtabula']);
  assert.deepEqual(A.getManagerMarkets('dual'), ['inman']);
  // Moving them as a rep must not disturb their manager assignment.
  A.assignRepMarket('dual', 'kannapolis');
  assert.deepEqual(A.getManagerMarkets('dual'), ['inman']);
});

// --- Reconciliation: the record wins ---------------------------------------------------------

function fakeGuild(memberRoleIds) {
  const held = new Set(memberRoleIds);
  const member = {
    roles: {
      cache: { keys: () => held.values(), has: (r) => held.has(r) },
      add: async (r) => held.add(r),
      remove: async (r) => held.delete(r),
    },
    _held: held,
  };
  return { guild: { members: { fetch: async () => member } }, member, held };
}

test('a role added by hand with no assignment is REMOVED', async () => {
  const { guild, held } = fakeGuild([ROLE.inman]);
  const plan = await A.reconcileMemberMarketRoles(guild, 'ghost');
  assert.deepEqual(plan.remove.map((r) => r.roleId), [ROLE.inman]);
  assert.equal(held.has(ROLE.inman), false, 'Discord must be corrected toward the record');
});

test('an assignment with no role is RESTORED', async () => {
  A.assignRepMarket('rep3', 'kannapolis');
  const { guild, held } = fakeGuild([]);
  const plan = await A.reconcileMemberMarketRoles(guild, 'rep3');
  assert.deepEqual(plan.add.map((r) => r.roleId), [ROLE.kannapolis]);
  assert.equal(held.has(ROLE.kannapolis), true);
});

test('conflicting state resolves in favour of the database', async () => {
  A.assignRepMarket('rep4', 'ashtabula');
  const { guild, held } = fakeGuild([ROLE.inman, ROLE.kannapolis]); // both wrong
  await A.reconcileMemberMarketRoles(guild, 'rep4');
  assert.deepEqual(Array.from(held), [ROLE.ashtabula]);
});

test('dry run reports the plan and changes nothing', async () => {
  A.assignRepMarket('rep5', 'inman');
  const { guild, held } = fakeGuild([ROLE.ashtabula]);
  const plan = await A.reconcileMemberMarketRoles(guild, 'rep5', { dryRun: true });
  assert.equal(plan.applied, false);
  assert.equal(plan.add.length, 1);
  assert.equal(plan.remove.length, 1);
  assert.deepEqual(Array.from(held), [ROLE.ashtabula], 'dry run must not mutate Discord');
});

// --- Authorization ---------------------------------------------------------------------------

const owner = (sub, marketId) => authorizeMarketCommand({ userId: 'o', isOwner: true, isManagerTier: true, subcommand: sub, marketId });
const mgr = (uid, sub, marketId) => authorizeMarketCommand({ userId: uid, isOwner: false, isManagerTier: true, subcommand: sub, marketId });
const rep = (sub, marketId) => authorizeMarketCommand({ userId: 'plainrep', isOwner: false, isManagerTier: false, subcommand: sub, marketId });

test('Owner/Admin is global for every subcommand', () => {
  for (const s of ['create', 'cleanup', 'rename', 'sync', 'add', 'remove', 'list', 'status']) {
    assert.equal(owner(s, 'inman').ok, true, s);
  }
});

test('a Manager cannot create or clean up a market', () => {
  A.addManagerMarketAssignment('mgr3', 'inman');
  for (const s of ['create', 'cleanup', 'rename', 'sync']) {
    const r = mgr('mgr3', s, 'inman');
    assert.equal(r.ok, false, s);
    assert.match(r.reason, /Owner\/Admin only/);
  }
});

test('a Manager may act only inside an assigned market', () => {
  A.addManagerMarketAssignment('mgr4', 'inman');
  assert.equal(mgr('mgr4', 'add', 'inman').ok, true);
  const other = mgr('mgr4', 'add', 'kannapolis');
  assert.equal(other.ok, false);
  assert.match(other.reason, /not that market/);
});

test('a Manager cannot affect a Rep in an unassigned market', () => {
  A.addManagerMarketAssignment('mgr5', 'ashtabula');
  assert.equal(mgr('mgr5', 'remove', 'kannapolis').ok, false);
});

test('a Manager with NO assignments on record can act on nothing', () => {
  const r = mgr('unassigned-mgr', 'add', 'inman');
  assert.equal(r.ok, false);
  assert.match(r.reason, /no market assignments on record/);
});

test('an unlinked / non-manager account cannot run manager commands', () => {
  const r = rep('add', 'inman');
  assert.equal(r.ok, false);
  assert.match(r.reason, /Manager role/);
});

test('a Manager cannot self-assign to another market — that is Owner-only', () => {
  A.addManagerMarketAssignment('mgr6', 'inman');
  // Manager authority itself is granted by /market create + admin action, both OWNER tier.
  assert.equal(mgr('mgr6', 'create', 'kannapolis').ok, false);
  // And they still cannot reach the market operationally.
  assert.equal(mgr('mgr6', 'add', 'kannapolis').ok, false);
});

test('Discord roles are NOT the authority — a held role grants nothing without a record', () => {
  // mgr7 holds every market role in Discord but has no assignment recorded.
  const r = mgr('mgr7', 'add', 'inman');
  assert.equal(r.ok, false, 'authorisation must read the record, not Discord roles');
});

test('an unknown subcommand denies by default', () => {
  assert.equal(mgr('mgr8', 'nuke-everything', 'inman').ok, false);
});
