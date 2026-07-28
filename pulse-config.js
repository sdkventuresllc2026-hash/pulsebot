/**
 * ONE validated configuration layer.
 *
 * Why this exists: MANAGER_ROLE_ID was read directly from process.env in two unrelated places —
 * `buildChannelOverwrites` (channel visibility) and `canUseAdminCommands` (command authorisation).
 * It was set only in the git-ignored .env, so on Railway it was undefined. Both call sites treated
 * "undefined" as "this tier does not exist" and carried on silently: managers lost every blitz
 * channel AND every /market command, and `permissionOverwrites.set()` re-applied that incomplete
 * desired state on every restart, erasing manual fixes.
 *
 * The bug was not `set()` — a desired-state write is correct. The bug was computing an incomplete
 * desired state from unvalidated config and never saying so.
 *
 * Contract:
 *   - Every required id is validated against the LIVE guild at startup.
 *   - A missing or invalid required id makes the process UNHEALTHY. It never degrades quietly.
 *   - Resolved names are logged; ids are logged, secrets never are.
 *   - Callers read from here, never from process.env.
 */

const REQUIRED = /** @type {const} */ ([
  { key: 'DISCORD_TOKEN', kind: 'secret' },
  { key: 'CLIENT_ID', kind: 'id' },
  { key: 'GUILD_ID', kind: 'guild' },
]);

const OPTIONAL_BUT_LOAD_BEARING = /** @type {const} */ ([
  {
    key: 'MANAGER_ROLE_ID',
    kind: 'role',
    // Not optional in effect: without it managers lose leadership commands. Treated as required
    // for health so it can never silently vanish again.
    requiredForHealth: true,
    usedBy: ['canUseAdminCommands (manager command tier)', 'leadership channel access'],
  },
]);

/** @typedef {{ ok: boolean, errors: string[], warnings: string[], resolved: Record<string, {id: string, name: string}> }} ConfigReport */

function raw(key) {
  return String(process.env[key] ?? '').trim();
}

/**
 * Shape-only validation. Runs before any network call so a typo fails fast and cheaply.
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateShape() {
  const errors = [];
  const warnings = [];
  const isSnowflake = (v) => /^\d{17,20}$/.test(v);

  for (const { key, kind } of REQUIRED) {
    const v = raw(key);
    if (!v) { errors.push(`${key} is missing.`); continue; }
    if (kind !== 'secret' && !isSnowflake(v)) errors.push(`${key} is not a Discord id (got ${v.length} chars).`);
  }
  for (const { key, requiredForHealth, usedBy } of OPTIONAL_BUT_LOAD_BEARING) {
    const v = raw(key);
    if (!v) {
      const msg = `${key} is not set. Used by: ${usedBy.join('; ')}.`;
      if (requiredForHealth) errors.push(msg); else warnings.push(msg);
      continue;
    }
    if (!isSnowflake(v)) errors.push(`${key} is not a Discord id (got "${v}").`);
  }
  return { errors, warnings };
}

/**
 * Verify every id actually exists **in this guild**. Catches the failure modes a shape check
 * cannot: a deleted role, an id copied from another server, or two ids pointing at one role.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<ConfigReport>}
 */
async function validateAgainstGuild(guild) {
  const { errors, warnings } = validateShape();
  /** @type {Record<string, {id: string, name: string}>} */
  const resolved = {};

  if (!guild) {
    errors.push('Guild was not resolvable — GUILD_ID may point at a server the bot is not in.');
    return { ok: false, errors, warnings, resolved };
  }
  if (raw('GUILD_ID') && guild.id !== raw('GUILD_ID')) {
    errors.push(`GUILD_ID mismatch: configured ${raw('GUILD_ID')} but connected to ${guild.id}.`);
  }
  resolved.GUILD = { id: guild.id, name: guild.name };

  await guild.roles.fetch().catch(() => null);
  const seenIds = new Map();
  for (const { key, requiredForHealth } of OPTIONAL_BUT_LOAD_BEARING) {
    const id = raw(key);
    if (!id) continue;
    const role = guild.roles.cache.get(id);
    if (!role) {
      const msg = `${key}=${id} does not exist in guild "${guild.name}" (${guild.id}). Deleted, or copied from another server.`;
      if (requiredForHealth) errors.push(msg); else warnings.push(msg);
      continue;
    }
    if (seenIds.has(id)) errors.push(`${key} duplicates ${seenIds.get(id)} — both point at role "${role.name}".`);
    seenIds.set(id, key);
    resolved[key] = { id: role.id, name: role.name };

    // A tier the bot cannot act on is a real operational limit worth surfacing, not an error.
    const me = guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      warnings.push(`Role "${role.name}" (${key}) sits at or above Pulse's highest role — Pulse cannot assign it or rename its holders.`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, resolved };
}

/** Human-readable startup block. Ids and names only — never a token. */
function formatReport(report) {
  const lines = ['--- Pulse configuration ---'];
  for (const [key, v] of Object.entries(report.resolved)) lines.push(`  ${key.padEnd(16)} ${v.id}  "${v.name}"`);
  for (const w of report.warnings) lines.push(`  ⚠ ${w}`);
  for (const e of report.errors) lines.push(`  ✗ ${e}`);
  lines.push(report.ok ? '  ✓ configuration valid' : '  ✗ CONFIGURATION INVALID');
  lines.push('---------------------------');
  return lines.join('\n');
}

// --- Runtime accessors. Everything downstream reads these, never process.env. -----------------

let healthy = false;
let lastReport = /** @type {ConfigReport|null} */ (null);

function markHealth(report) { healthy = report.ok; lastReport = report; }
function isHealthy() { return healthy; }
function getReport() { return lastReport; }

/**
 * The manager role id, or null. Callers MUST treat null as "refuse", never as "skip the tier" —
 * skipping is exactly what erased manager access from every market channel.
 */
function managerRoleId() {
  const v = raw('MANAGER_ROLE_ID');
  return v || null;
}

/**
 * Stage A / Stage B switch.
 *
 * The backfill script only exists on Railway once the commit containing it is deployed, so the
 * code must ship BEFORE assignments exist. Shipping scoped enforcement at the same moment would
 * deny all nine managers. Stage A installs the capability with enforcement held; Stage B turns it
 * on after the backfill and readiness check pass.
 *
 * Defaults to FALSE — safe-hold. Managers are told the system is being configured; they are never
 * silently granted global access as a fallback, and no partial assignment state can become
 * authoritative by accident.
 */
function managerScopingEnabled() {
  return /^(1|true|yes|on)$/i.test(raw('MANAGER_SCOPING_ENABLED'));
}

module.exports = {
  REQUIRED,
  OPTIONAL_BUT_LOAD_BEARING,
  validateShape,
  validateAgainstGuild,
  formatReport,
  markHealth,
  isHealthy,
  getReport,
  managerRoleId,
  managerScopingEnabled,
};
