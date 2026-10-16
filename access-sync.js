/**
 * Discord access follows the org chart (owner 2026-10-15). No manager step.
 *
 * The Member role is the key to every channel but #welcome (access gate, 2026-10-15). This module
 * keeps that role in step with FiberSales OS:
 *   active person (matched by Discord id, or by exact real name after "Set My Name") → has Member
 *   inactive person (matched by Discord id)                                        → loses Member + market roles
 *   anyone the OS does not know                                                     → untouched (stays in #welcome)
 * Owner/Manager/bot role holders are never touched; neither is anyone whose top role outranks Pulse.
 *
 * planMember() is pure (unit-tested); reconcileAccess() applies plans; runs every 15 min + on events.
 */
const { fetchAccessRoster, postDiscordLink } = require('./fiberSalesOsClient');

const MEMBER_ROLE = 'Member';
const PROTECTED_ROLES = new Set(['Owner', 'Manager', 'Pulse', 'Bot', 'Sapphire']);
const KEEP_ROLES = new Set(['@everyone', 'Owner', 'Manager', 'Pulse', 'Bot', 'Sapphire', 'Pro', 'Vet', 'Rookie']);

const squash = (s) => String(s ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]/g, '');

/** Index the OS roster once per run. */
function indexRoster(roster) {
  const activeById = new Map();
  const inactiveById = new Map();
  // squashed name → 1 when it is one human (a Rep record, a Manager record, or both for a selling
  // manager), 2 when two different humans share it (two Rep records). Ambiguous names never link.
  const activeByName = new Map();
  const perKind = new Map();
  for (const p of roster.active || []) {
    if (p.discordUserId) activeById.set(p.discordUserId, p);
    const key = squash(p.name);
    if (!key) continue;
    const k = `${key}|${p.kind}`;
    perKind.set(k, (perKind.get(k) || 0) + 1);
    activeByName.set(key, Math.max(activeByName.get(key) || 1, perKind.get(k)));
  }
  for (const p of roster.inactive || []) if (p.discordUserId && !activeById.has(p.discordUserId)) inactiveById.set(p.discordUserId, p);
  const unlinkedActiveNames = new Map();
  for (const p of roster.active || []) if (!p.discordUserId) unlinkedActiveNames.set(squash(p.name), p);
  return { activeById, inactiveById, activeByName, unlinkedActiveNames };
}

/**
 * Decide what to do with one member. `m` is a plain shape so tests need no discord.js:
 * { id, username, displayName, isBot, roleNames: string[], outranksBot: boolean, hasMember: boolean }
 * Returns { action: 'grant' | 'strip' | 'link_and_grant' | 'none', reason, person? }
 */
function planMember(m, idx) {
  if (m.isBot) return { action: 'none', reason: 'bot' };
  if (m.outranksBot || m.roleNames.some((r) => PROTECTED_ROLES.has(r))) return { action: 'none', reason: 'protected' };
  const active = idx.activeById.get(m.id);
  if (active) return m.hasMember ? { action: 'none', reason: 'active, has Member', person: active } : { action: 'grant', reason: 'active on the org chart', person: active };
  const inactive = idx.inactiveById.get(m.id);
  if (inactive) return m.hasMember || m.roleNames.some((r) => !KEEP_ROLES.has(r)) ? { action: 'strip', reason: 'inactive in FiberSales OS', person: inactive } : { action: 'none', reason: 'inactive, nothing to remove', person: inactive };
  // Name match: only an exact, unique real name against an active person with no link yet.
  for (const candidate of [m.displayName, m.username]) {
    const key = squash(candidate);
    const person = key ? idx.unlinkedActiveNames.get(key) : null;
    if (person && idx.activeByName.get(key) === 1) return { action: 'link_and_grant', reason: `name matches ${person.name}`, person };
  }
  return { action: 'none', reason: 'unknown to the OS' };
}

function shapeOf(member, botTopPosition, memberRoleId) {
  return {
    id: member.id, username: member.user.username, displayName: member.displayName, isBot: member.user.bot,
    roleNames: [...member.roles.cache.values()].map((r) => r.name),
    outranksBot: member.roles.highest.position >= botTopPosition,
    hasMember: Boolean(memberRoleId) && member.roles.cache.has(memberRoleId),
  };
}

async function applyPlan(guild, member, plan, memberRole, { apply = true, log = console.log, fetchImpl } = {}) {
  const botTop = guild.members.me.roles.highest.position;
  if (plan.action === 'grant' || plan.action === 'link_and_grant') {
    if (plan.action === 'link_and_grant') {
      const linked = apply ? await postDiscordLink({ discordUserId: member.id, name: plan.person.name }, fetchImpl) : { ok: true, linked: true };
      if (!linked.ok || !linked.linked) { log(`[access] ${member.displayName}: name matched ${plan.person.name} but OS did not link (${linked.reason || linked.message || 'unknown'}), no role change`); return false; }
    }
    log(`[access] ${apply ? 'grant' : 'would grant'} Member → ${member.displayName} (${plan.reason})`);
    if (apply) await member.roles.add(memberRole, `Access sync: ${plan.reason}`);
    return true;
  }
  if (plan.action === 'strip') {
    const strip = [...member.roles.cache.values()].filter((r) => !KEEP_ROLES.has(r.name) && r.position < botTop);
    log(`[access] ${apply ? 'strip' : 'would strip'} ${strip.map((r) => r.name).join(', ') || 'nothing'} ← ${member.displayName} (${plan.reason})`);
    if (apply && strip.length) await member.roles.remove(strip, `Access sync: ${plan.reason}`);
    return strip.length > 0;
  }
  return false;
}

/** Whole-server pass. Returns { granted, stripped, linked, skipped } or null when the OS is unreachable. */
async function reconcileAccess(guild, opts = {}) {
  const roster = await fetchAccessRoster(opts.fetchImpl);
  if (!roster.ok) { (opts.log || console.log)(`[access] OS roster unavailable: ${roster.message || roster.status}`); return null; }
  const idx = indexRoster(roster);
  const memberRole = guild.roles.cache.find((r) => r.name === MEMBER_ROLE);
  if (!memberRole) { (opts.log || console.log)('[access] Member role not found, nothing done'); return null; }
  const members = await guild.members.fetch();
  const botTop = guild.members.me.roles.highest.position;
  const out = { granted: 0, stripped: 0, linked: 0, skipped: 0, lines: [] };
  for (const member of members.values()) {
    const plan = planMember(shapeOf(member, botTop, memberRole.id), idx);
    if (plan.action === 'none') { out.skipped++; continue; }
    try {
      const changed = await applyPlan(guild, member, plan, memberRole, opts);
      if (!changed) continue;
      if (plan.action === 'strip') out.stripped++; else out.granted++;
      if (plan.action === 'link_and_grant') out.linked++;
      out.lines.push(`${plan.action === 'strip' ? '➖' : '➕'} ${member.displayName} — ${plan.reason}`);
    } catch (err) {
      (opts.log || console.log)(`[access] ${member.displayName}: ${err?.message || err}`);
    }
  }
  return out;
}

/** One person, right after "Set My Name" or /market add. */
async function reconcileOne(guild, userId, opts = {}) {
  const roster = await fetchAccessRoster(opts.fetchImpl);
  if (!roster.ok) return null;
  const memberRole = guild.roles.cache.find((r) => r.name === MEMBER_ROLE);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!memberRole || !member) return null;
  const plan = planMember(shapeOf(member, guild.members.me.roles.highest.position, memberRole.id), indexRoster(roster));
  if (plan.action === 'none') return plan;
  await applyPlan(guild, member, plan, memberRole, opts);
  return plan;
}

module.exports = { planMember, indexRoster, reconcileAccess, reconcileOne, squash };
