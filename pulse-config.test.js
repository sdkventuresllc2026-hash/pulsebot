const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('./pulse-config');

const GUILD = '1504331970916909106';
const MANAGER = '1504351060674740255';

// Must AWAIT fn before restoring. A synchronous finally put the real environment back while the
// async assertions were still running, so every awaiting test read the wrong values — the tests
// failed for a reason that had nothing to do with the code under test.
async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

/** Minimal guild stub. roles is a Map keyed by id. */
function fakeGuild({ id = GUILD, name = 'FiberSales HQ', roles = [], botPosition = 22 } = {}) {
  const cache = new Map(roles.map((r) => [r.id, r]));
  return {
    id, name,
    roles: { cache, fetch: async () => cache },
    members: { me: { roles: { highest: { position: botPosition } } } },
  };
}

// --- shape validation ---------------------------------------------------------------------

test('missing MANAGER_ROLE_ID is an ERROR, never a silent skip', () => {
  withEnv({ DISCORD_TOKEN: 'x', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: undefined }, () => {
    const { errors } = cfg.validateShape();
    assert.ok(errors.some((e) => e.includes('MANAGER_ROLE_ID')), 'must be an error');
  });
});

test('a non-snowflake id is rejected before any network call', () => {
  withEnv({ DISCORD_TOKEN: 'x', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: 'Manager' }, () => {
    const { errors } = cfg.validateShape();
    assert.ok(errors.some((e) => e.includes('MANAGER_ROLE_ID') && e.includes('not a Discord id')));
  });
});

test('missing required ids are all reported, not just the first', () => {
  withEnv({ DISCORD_TOKEN: undefined, CLIENT_ID: undefined, GUILD_ID: undefined, MANAGER_ROLE_ID: undefined }, () => {
    const { errors } = cfg.validateShape();
    assert.ok(errors.length >= 4, `expected >=4 errors, got ${errors.length}`);
  });
});

// --- guild validation ---------------------------------------------------------------------

test('valid config against the real guild is healthy', async () => {
  await withEnv({ DISCORD_TOKEN: 'x', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: MANAGER }, async () => {
    const g = fakeGuild({ roles: [{ id: MANAGER, name: 'Manager', position: 23 }] });
    const r = await cfg.validateAgainstGuild(g);
    assert.equal(r.ok, true, r.errors.join('; '));
    assert.equal(r.resolved.MANAGER_ROLE_ID.name, 'Manager');
    // Above the bot -> operational warning, not a failure.
    assert.ok(r.warnings.some((w) => w.includes('above')));
  });
});

test('a DELETED role id fails validation', async () => {
  await withEnv({ DISCORD_TOKEN: 'x', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: MANAGER }, async () => {
    const r = await cfg.validateAgainstGuild(fakeGuild({ roles: [] }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('does not exist in guild')));
  });
});

test('an id from the WRONG guild fails validation', async () => {
  await withEnv({ DISCORD_TOKEN: 'x', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: MANAGER }, async () => {
    const r = await cfg.validateAgainstGuild(fakeGuild({ id: '9'.repeat(18), roles: [{ id: MANAGER, name: 'Manager', position: 5 }] }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('GUILD_ID mismatch')));
  });
});

test('an unreachable guild fails rather than defaulting', async () => {
  await withEnv({ DISCORD_TOKEN: 'x', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: MANAGER }, async () => {
    const r = await cfg.validateAgainstGuild(null);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('not resolvable')));
  });
});

test('the report never contains the token', async () => {
  await withEnv({ DISCORD_TOKEN: 'super-secret-token-value', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: MANAGER }, async () => {
    const r = await cfg.validateAgainstGuild(fakeGuild({ roles: [{ id: MANAGER, name: 'Manager', position: 23 }] }));
    assert.ok(!cfg.formatReport(r).includes('super-secret-token-value'));
  });
});

test('health latches to the last report', async () => {
  await withEnv({ DISCORD_TOKEN: 'x', CLIENT_ID: '1'.repeat(18), GUILD_ID: GUILD, MANAGER_ROLE_ID: MANAGER }, async () => {
    cfg.markHealth(await cfg.validateAgainstGuild(fakeGuild({ roles: [] })));
    assert.equal(cfg.isHealthy(), false);
    cfg.markHealth(await cfg.validateAgainstGuild(fakeGuild({ roles: [{ id: MANAGER, name: 'Manager', position: 23 }] })));
    assert.equal(cfg.isHealthy(), true);
  });
});
