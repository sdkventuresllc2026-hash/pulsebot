const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits: P } = require('discord.js');
const { buildChannelOverwrites } = require('./market-access');

const EVERYONE = '1504331970916909106';
const BOT = '1504345789952954418';

const ROLES = {
  ashtabula: '1508611000000000001',
  inman: '1508611000000000002',
  kannapolis: '1508611000000000003',
  jacksonville: '1508611000000000004',
  manager: '1504351060674740255',
};

function guild(extra = []) {
  const cache = new Map([[EVERYONE, { id: EVERYONE }], ...Object.values(ROLES).map((id) => [id, { id }]), ...extra]);
  return { roles: { everyone: { id: EVERYONE }, cache } };
}
const market = (name, roleId, managerUserIds) => ({ marketId: name.toLowerCase(), marketName: name, roleId, managerUserIds });
const idsAllowedToView = (ow) => ow.filter((o) => (o.allow || []).includes(P.ViewChannel)).map((o) => o.id);

// Access is ASSIGNMENT-BASED. The generic Manager role must never appear on a market channel —
// that is what "a manager sees only their assigned markets" means in practice.

test('a market channel grants exactly: its own role, Pulse, and nobody else', () => {
  const ow = buildChannelOverwrites(guild(), market('Ashtabula', ROLES.ashtabula), BOT);
  assert.deepEqual(idsAllowedToView(ow).sort(), [BOT, ROLES.ashtabula].sort());
  const everyone = ow.find((o) => o.id === EVERYONE);
  assert.ok(everyone.deny.includes(P.ViewChannel), '@everyone must be denied ViewChannel');
});

test('the generic Manager role is NEVER granted market access', () => {
  const ow = buildChannelOverwrites(guild(), market('Inman', ROLES.inman), BOT, { managerRoleId: ROLES.manager });
  assert.ok(!ow.some((o) => o.id === ROLES.manager),
    'generic Manager role must not appear — market access comes from assignment only');
});

test('a rep assigned to one market sees exactly that market', () => {
  const rep = ROLES.kannapolis;
  const sees = ['Ashtabula', 'Inman', 'Kannapolis', 'Jacksonville']
    .filter((n) => idsAllowedToView(buildChannelOverwrites(guild(), market(n, ROLES[n.toLowerCase()]), BOT)).includes(rep));
  assert.deepEqual(sees, ['Kannapolis']);
});

test('a manager assigned to three markets sees exactly those three', () => {
  const held = [ROLES.kannapolis, ROLES.jacksonville, ROLES.inman];
  const sees = ['Ashtabula', 'Inman', 'Kannapolis', 'Jacksonville'].filter((n) => {
    const ow = buildChannelOverwrites(guild(), market(n, ROLES[n.toLowerCase()]), BOT, { managerRoleId: ROLES.manager });
    return idsAllowedToView(ow).some((id) => held.includes(id));
  });
  assert.deepEqual(sees.sort(), ['Inman', 'Jacksonville', 'Kannapolis']);
});

test('an unassigned manager or rep sees no market channels', () => {
  const nobody = '9'.repeat(18);
  for (const n of ['Ashtabula', 'Inman', 'Kannapolis', 'Jacksonville']) {
    const ow = buildChannelOverwrites(guild(), market(n, ROLES[n.toLowerCase()]), BOT, { managerRoleId: ROLES.manager });
    assert.ok(!idsAllowedToView(ow).includes(nobody), `${n} must not be visible to an unassigned user`);
  }
});

test('a per-market manager assignment by user id is honoured', () => {
  const mgr = '1'.repeat(18);
  const ow = buildChannelOverwrites(guild(), market('Jacksonville', ROLES.jacksonville, [mgr]), BOT);
  assert.ok(idsAllowedToView(ow).includes(mgr));
  // and only for that market
  const other = buildChannelOverwrites(guild(), market('Inman', ROLES.inman), BOT);
  assert.ok(!idsAllowedToView(other).includes(mgr));
});

test('no cross-market leakage: every market grants a DISTINCT role', () => {
  const granted = ['Ashtabula', 'Inman', 'Kannapolis', 'Jacksonville'].map((n) =>
    idsAllowedToView(buildChannelOverwrites(guild(), market(n, ROLES[n.toLowerCase()]), BOT)).filter((id) => id !== BOT));
  const flat = granted.flat();
  assert.equal(new Set(flat).size, flat.length, 'a role granted on two markets would leak access');
});

// The outage: an incomplete desired state written by set() removed everyone's access.

test('a market with no resolvable role THROWS instead of writing a lockout', () => {
  assert.throws(() => buildChannelOverwrites(guild(), market('Ghost', null), BOT), /MARKET_ROLE_MISSING|no resolvable roleId/);
  assert.throws(() => buildChannelOverwrites(guild(), market('Ghost', '404'.repeat(6)), BOT), /no resolvable roleId/);
});

test('a missing bot id THROWS rather than building a set Pulse cannot use', () => {
  assert.throws(() => buildChannelOverwrites(guild(), market('Ashtabula', ROLES.ashtabula), null), /botUserId is required/);
});

test('restarting cannot broaden or narrow access — the desired state is deterministic', () => {
  const a = buildChannelOverwrites(guild(), market('Ashtabula', ROLES.ashtabula), BOT, { managerRoleId: ROLES.manager });
  const b = buildChannelOverwrites(guild(), market('Ashtabula', ROLES.ashtabula), BOT, { managerRoleId: ROLES.manager });
  // Permission flags are BigInt, which JSON.stringify refuses — compare via a BigInt-safe form.
  const norm = (ow) => ow.map((o) => [o.id, (o.allow||[]).map(String).sort().join(), (o.deny||[]).map(String).sort().join()]);
  assert.deepEqual(norm(a), norm(b));
});

test('Pulse always keeps its technical access', () => {
  const ow = buildChannelOverwrites(guild(), market('Inman', ROLES.inman), BOT);
  const bot = ow.find((o) => o.id === BOT);
  for (const p of [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels, P.ManageRoles]) {
    assert.ok(bot.allow.includes(p), 'Pulse must retain its technical permissions');
  }
});
