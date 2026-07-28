const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the store BEFORE requiring anything that resolves paths at module load.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-store-'));
process.env.PULSE_DATA_DIR = dir;
const STORE = path.join(dir, 'approved-blitz-channels.json');

const DC = require('./deal-channels');
const A = require('./market-assignments');
const { authorizeMarketCommand, assessScopeReadiness } = require('./command-policy');

const good = () => ({
  schemaVersion: 1, channels: [], disabledChannelIds: [],
  markets: [{ marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c1'], roleId: 'r1', repUserIds: [], managerUserIds: [] }],
});
function seed(data = good()) { fs.writeFileSync(STORE, JSON.stringify(data, null, 2)); DC.readApprovedChannelsData(); }

test.beforeEach(() => seed());

// --- schema + durability ---------------------------------------------------------------------

test('the store stamps a schema version', () => {
  A.addManagerMarketAssignment('m1', 'inman');
  const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  assert.equal(raw.schemaVersion, DC.ASSIGNMENT_SCHEMA_VERSION);
});

test('assignments survive a re-read (restart equivalent)', () => {
  A.addManagerMarketAssignment('m2', 'inman');
  A.assignRepMarket('rep1', 'inman');
  // Simulate a restart: nothing cached, read straight off disk.
  const reread = DC.readApprovedChannelsData();
  const m = reread.markets.find((x) => x.marketId === 'inman');
  assert.deepEqual(m.managerUserIds, ['m2']);
  assert.deepEqual(m.repUserIds, ['rep1']);
});

test('a write leaves a timestamped backup behind', () => {
  A.addManagerMarketAssignment('m3', 'inman');
  A.addManagerMarketAssignment('m4', 'inman');
  const backups = fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.startsWith('approved-blitz-channels.'));
  assert.ok(backups.length >= 1, 'expected at least one backup');
});

test('rollback from a backup restores the prior assignments', () => {
  A.addManagerMarketAssignment('keep', 'inman');
  const snapshot = fs.readFileSync(STORE, 'utf8');
  A.addManagerMarketAssignment('oops', 'inman');
  assert.deepEqual(A.getManagerMarkets('oops'), ['inman']);
  fs.writeFileSync(STORE, snapshot);           // the rollback
  DC.readApprovedChannelsData();
  assert.deepEqual(A.getManagerMarkets('oops'), []);
  assert.deepEqual(A.getManagerMarkets('keep'), ['inman']);
});

// --- corruption ------------------------------------------------------------------------------

test('a malformed store is flagged, NOT silently treated as empty', () => {
  fs.writeFileSync(STORE, '{"markets":[{"marketId":"inman"');   // truncated mid-write
  DC.readApprovedChannelsData();
  assert.ok(DC.isStoreCorrupt(), 'corruption must be visible to callers');
});

test('a corrupt store is never overwritten', () => {
  const garbage = '{"markets":[{"marketId":"inman"';
  fs.writeFileSync(STORE, garbage);
  DC.readApprovedChannelsData();
  assert.throws(() => A.addManagerMarketAssignment('m5', 'inman'), /ASSIGNMENT_STORE_CORRUPT|unreadable/);
  assert.equal(fs.readFileSync(STORE, 'utf8'), garbage, 'the recoverable file must be left untouched');
});

test('corrupt data blocks manager authorization with a CONFIGURATION message, not a permission one', () => {
  fs.writeFileSync(STORE, 'not json at all');
  DC.readApprovedChannelsData();
  const r = authorizeMarketCommand({ userId: 'm6', isOwner: false, isManagerTier: true, subcommand: 'add', marketId: 'inman' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /configuration fault/, 'a manager must not be told they lack permission when the file is broken');
  // Owner keeps access so the fault can actually be fixed.
  assert.equal(authorizeMarketCommand({ userId: 'o', isOwner: true, isManagerTier: true, subcommand: 'add', marketId: 'inman' }).ok, true);
});

test('a missing store is a fresh start, not corruption', () => {
  fs.rmSync(STORE, { force: true });
  const d = DC.readApprovedChannelsData();
  assert.equal(DC.isStoreCorrupt(), null);
  assert.deepEqual(d.markets, []);
});

// --- lockout prevention ----------------------------------------------------------------------

const members = new Map([['m1', { bot: false, hasManagerRole: true }]]);

test('empty assignments BLOCK scoped commands rather than granting global access', () => {
  const r = assessScopeReadiness({ guildMembers: members, markets: good().markets, managerRoleIdValid: true });
  assert.equal(r.ready, false);
  assert.match(r.errors.join(' '), /would deny every manager/);
  // and crucially, empty never means "allow everything"
  const auth = authorizeMarketCommand({ userId: 'm1', isOwner: false, isManagerTier: true, subcommand: 'add', marketId: 'inman' });
  assert.equal(auth.ok, false);
});

test('an explicit Owner override allows deploying with no assignments', () => {
  const r = assessScopeReadiness({ guildMembers: members, markets: good().markets, managerRoleIdValid: true, allowNoAssignments: true });
  assert.equal(r.ready, true);
});

test('an invalid MANAGER_ROLE_ID blocks readiness', () => {
  const m = good().markets; m[0].managerUserIds = ['m1'];
  assert.equal(assessScopeReadiness({ guildMembers: members, markets: m, managerRoleIdValid: false }).ready, false);
});

test('an assigned user who left the guild blocks readiness', () => {
  const m = good().markets; m[0].managerUserIds = ['ghost'];
  const r = assessScopeReadiness({ guildMembers: members, markets: m, managerRoleIdValid: true });
  assert.equal(r.ready, false);
  assert.match(r.errors.join(' '), /no longer in the guild/);
});

test('a bot assigned as manager blocks readiness', () => {
  const m = good().markets; m[0].managerUserIds = ['b1'];
  const r = assessScopeReadiness({ guildMembers: new Map([['b1', { bot: true, hasManagerRole: true }]]), markets: m, managerRoleIdValid: true });
  assert.equal(r.ready, false);
  assert.match(r.errors.join(' '), /is a bot/);
});

test('an assigned user who lost the Manager role warns but does not block', () => {
  const m = good().markets; m[0].managerUserIds = ['m1'];
  const r = assessScopeReadiness({ guildMembers: new Map([['m1', { bot: false, hasManagerRole: false }]]), markets: m, managerRoleIdValid: true });
  assert.equal(r.ready, true);
  assert.match(r.warnings.join(' '), /no longer holds the Manager role/);
});

// --- scoped list / status --------------------------------------------------------------------

test('a Manager lists only assigned markets; an unassigned one gets a clear message', () => {
  seed({ ...good(), markets: [
    { marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c1'], roleId: 'r1', managerUserIds: ['mgr'] },
    { marketId: 'kannapolis', marketName: 'Kannapolis', active: true, channelIds: ['c2'], roleId: 'r2', managerUserIds: ['mgr'] },
    { marketId: 'jacksonville', marketName: 'Jacksonville', active: true, channelIds: ['c3'], roleId: 'r3', managerUserIds: [] },
  ] });
  const r = authorizeMarketCommand({ userId: 'mgr', isOwner: false, isManagerTier: true, subcommand: 'list' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filterTo.sort(), ['inman', 'kannapolis']);

  const none = authorizeMarketCommand({ userId: 'nobody', isOwner: false, isManagerTier: true, subcommand: 'list' });
  assert.equal(none.ok, false);
  assert.match(none.reason, /no market assignments on record/);

  // status is scoped, not merely filtered
  assert.equal(authorizeMarketCommand({ userId: 'mgr', isOwner: false, isManagerTier: true, subcommand: 'status', marketId: 'jacksonville' }).ok, false);
  assert.equal(authorizeMarketCommand({ userId: 'mgr', isOwner: false, isManagerTier: true, subcommand: 'status', marketId: 'inman' }).ok, true);
  // owner sees everything
  assert.equal(authorizeMarketCommand({ userId: 'o', isOwner: true, isManagerTier: true, subcommand: 'status', marketId: 'jacksonville' }).ok, true);
});

test('manager authority commands are Owner-only', () => {
  for (const sub of ['manager-add', 'manager-remove', 'manager-list', 'manager-markets']) {
    assert.equal(authorizeMarketCommand({ userId: 'mgr', isOwner: false, isManagerTier: true, subcommand: sub, marketId: 'inman' }).ok, false, sub);
    assert.equal(authorizeMarketCommand({ userId: 'o', isOwner: true, isManagerTier: true, subcommand: sub, marketId: 'inman' }).ok, true, sub);
  }
});

test('duplicate manager assignment is idempotent', () => {
  A.addManagerMarketAssignment('dup', 'inman');
  A.addManagerMarketAssignment('dup', 'inman');
  const m = DC.readApprovedChannelsData().markets.find((x) => x.marketId === 'inman');
  assert.deepEqual(m.managerUserIds, ['dup']);
});

test('an unknown market fails safely', () => {
  assert.throws(() => A.addManagerMarketAssignment('x', 'atlantis'), /MARKET_NOT_FOUND|not found|No market/i);
});

// --- Stage A safe-hold + post-activation attrition ------------------------------------------

test('Stage A: scoped commands are HELD, never silently global', () => {
  seed({ ...good(), markets: [{ marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c1'], roleId: 'r1', managerUserIds: ['mgr'] }] });
  const held = authorizeMarketCommand({ userId: 'mgr', isOwner: false, isManagerTier: true, subcommand: 'add', marketId: 'inman', scopingEnabled: false });
  assert.equal(held.ok, false);
  assert.match(held.reason, /temporarily on hold/);
  // Owner is unaffected during Stage A.
  assert.equal(authorizeMarketCommand({ userId: 'o', isOwner: true, isManagerTier: true, subcommand: 'add', marketId: 'inman', scopingEnabled: false }).ok, true);
  // And enabling it restores normal scoped behaviour.
  assert.equal(authorizeMarketCommand({ userId: 'mgr', isOwner: false, isManagerTier: true, subcommand: 'add', marketId: 'inman', scopingEnabled: true }).ok, true);
});

test('Stage A hold applies to list and status too', () => {
  seed({ ...good(), markets: [{ marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c1'], roleId: 'r1', managerUserIds: ['mgr'] }] });
  for (const sub of ['list', 'status']) {
    assert.equal(authorizeMarketCommand({ userId: 'mgr', isOwner: false, isManagerTier: true, subcommand: sub, marketId: 'inman', scopingEnabled: false }).ok, false, sub);
  }
});

test('a Manager leaving AFTER activation does not break the others', () => {
  const markets = [{ marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c1'], roleId: 'r1', managerUserIds: ['stays', 'left'] }];
  const members = new Map([['stays', { bot: false, hasManagerRole: true }]]); // 'left' is gone

  // Before activation this is blocking — the reviewed backfill no longer matches reality.
  const pre = assessScopeReadiness({ guildMembers: members, markets, managerRoleIdValid: true });
  assert.equal(pre.ready, false);

  // After activation it is a flag, not an outage for the other eight.
  const post = assessScopeReadiness({ guildMembers: members, markets, managerRoleIdValid: true, activated: true });
  assert.equal(post.ready, true, 'one departure must not disable scoped commands for everyone');
  assert.equal(post.stale.length, 1);
  assert.equal(post.stale[0].userId, 'left');
  assert.match(post.remediation.join(' '), /manager-remove user:left/);

  // The remaining manager keeps working; the departed one is inert on the record.
  seed({ ...good(), markets });
  assert.equal(authorizeMarketCommand({ userId: 'stays', isOwner: false, isManagerTier: true, subcommand: 'add', marketId: 'inman', scopingEnabled: true }).ok, true);
});

test('a bot assignee is an error even after activation', () => {
  const markets = [{ marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c1'], roleId: 'r1', managerUserIds: ['b'] }];
  const r = assessScopeReadiness({ guildMembers: new Map([['b', { bot: true, hasManagerRole: true }]]), markets, managerRoleIdValid: true, activated: true });
  assert.equal(r.ready, false, 'a bot holding authority is a data fault, not attrition');
});

test('removing a departed manager preserves every other assignment', () => {
  seed({ ...good(), markets: [
    { marketId: 'inman', marketName: 'Inman', active: true, channelIds: ['c1'], roleId: 'r1', managerUserIds: ['gone', 'keep'] },
    { marketId: 'kannapolis', marketName: 'Kannapolis', active: true, channelIds: ['c2'], roleId: 'r2', managerUserIds: ['gone'] },
  ] });
  A.removeManagerMarketAssignment('gone', 'inman');
  assert.deepEqual(A.getManagerMarkets('gone'), ['kannapolis'], 'only the named market is removed');
  assert.deepEqual(A.getManagerMarkets('keep'), ['inman'], 'other managers untouched');
});
