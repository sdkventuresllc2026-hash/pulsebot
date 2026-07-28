/**
 * Per-subcommand authorization policy for /market.
 *
 * One tier for the whole command was wrong: `/market list` is a harmless read while
 * `/market cleanup` deletes market records and `/market create` creates Discord channels and roles.
 * Owner decision 2026-07-28 — anything that creates or destroys Discord objects, deletes or
 * archives a market, changes manager authority, or could affect historical deal reporting is
 * Owner/Admin only. Managers keep day-to-day rep movement, scoped to markets they are recorded as
 * managing.
 *
 * Authority is the ASSIGNMENT RECORD, never the Discord roles the caller happens to hold — roles
 * are a mutable cache that can be edited by hand, lost, or left stale.
 */

const { isManagerOfMarket, getManagerMarkets } = require('./market-assignments');
const { isStoreCorrupt } = require('./deal-channels');

/** @typedef {'OWNER'|'MANAGER_SCOPED'|'MANAGER_ANY'|'PUBLIC'} Tier */

/**
 * tier            who may run it
 * scoped          true => the target market must be one they manage
 * destructive     true => requires explicit confirmation + an impact preview
 * why             the reason it sits at this tier, so the next person does not "simplify" it back
 */
const POLICY = {
  create:  { tier: 'OWNER', scoped: false, destructive: true,  why: 'creates a Discord channel and role; adding a market is an organisational decision' },
  cleanup: { tier: 'OWNER', scoped: false, destructive: true,  why: 'deletes market records and can affect historical reporting' },
  rename:  { tier: 'OWNER', scoped: false, destructive: false, why: 'global display-name change visible on every leaderboard' },
  sync:    { tier: 'OWNER', scoped: false, destructive: true,  why: 'rewrites channel overwrites server-wide; a bad desired state locks everyone out' },
  add:     { tier: 'MANAGER_SCOPED', scoped: true,  destructive: false, why: 'day-to-day rep movement inside a market they manage' },
  remove:  { tier: 'MANAGER_SCOPED', scoped: true,  destructive: false, why: 'day-to-day rep movement inside a market they manage' },
  // Read-only, but still SCOPED: operational detail about a market a manager does not run is
  // cross-market information they have no business seeing. `list` filters rather than denies.
  status:  { tier: 'MANAGER_SCOPED', scoped: true,  destructive: false, why: 'exposes operational detail for one market' },
  list:    { tier: 'MANAGER_FILTERED', scoped: false, destructive: false, why: 'read-only; results filtered to assigned markets' },
  // Granting or revoking manager authority is an organisational act, never a manager action —
  // otherwise any manager could widen their own scope.
  'manager-add':     { tier: 'OWNER', scoped: false, destructive: false, why: 'grants market authority to another person' },
  'manager-remove':  { tier: 'OWNER', scoped: false, destructive: false, why: 'revokes market authority' },
  'manager-list':    { tier: 'OWNER', scoped: false, destructive: false, why: 'shows who holds authority over a market' },
  'manager-markets': { tier: 'OWNER', scoped: false, destructive: false, why: 'shows one person’s full authority' },
};

function policyFor(subcommand) {
  return POLICY[subcommand] ?? { tier: 'OWNER', scoped: false, destructive: true, why: 'unknown subcommand — deny by default' };
}

/**
 * Decide whether this caller may run this subcommand against this market.
 *
 * @param {{ userId: string, isOwner: boolean, isManagerTier: boolean, subcommand: string, marketId?: string|null }} req
 * @returns {{ ok: boolean, reason: string, policy: object }}
 */
function authorizeMarketCommand(req) {
  const policy = policyFor(req.subcommand);
  const deny = (reason) => ({ ok: false, reason, policy });

  // An unreadable authority store must never read as "nobody is assigned". That silently denies
  // every manager and looks identical to a permissions bug. Owner keeps access so the problem can
  // be fixed; everyone else is told exactly what is wrong.
  const corrupt = isStoreCorrupt();
  if (corrupt && !req.isOwner) {
    return deny(`Market assignment records are unreadable, so scope cannot be verified. This is a configuration fault, not a permission you are missing — an admin needs to restore the assignment file. (${corrupt})`);
  }

  if (req.isOwner) return { ok: true, reason: 'owner', policy };

  if (policy.tier === 'OWNER') {
    return deny(`\`/market ${req.subcommand}\` is Owner/Admin only — ${policy.why}.`);
  }
  if (!req.isManagerTier) {
    return deny('You need the Manager role to use this.');
  }

  // `list` never denies — it filters. The handler must call scopedMarketsFor() and show only those.
  if (policy.tier === 'MANAGER_FILTERED') {
    const managed = getManagerMarkets(req.userId);
    if (managed.length === 0) {
      return deny('You have no market assignments on record yet, so there is nothing to list. An admin assigns markets with `/market manager-add`.');
    }
    return { ok: true, reason: 'manager-filtered', policy, filterTo: managed };
  }

  // Manager tier confirmed. Scoped subcommands additionally require a recorded assignment.
  if (policy.scoped) {
    if (!req.marketId) return deny('No market specified, so scope cannot be checked. Denied.');
    const managed = getManagerMarkets(req.userId);
    if (managed.length === 0) {
      return deny('You have no market assignments on record, so there is nothing you can act on. Ask an admin to assign you a market.');
    }
    if (!isManagerOfMarket(req.userId, req.marketId)) {
      return deny(`You manage ${managed.join(', ')} — not that market.`);
    }
  }
  return { ok: true, reason: 'manager', policy };
}

/**
 * Structured audit line for every manager-tier action. Written to stdout so Railway retains it.
 * Ids only — never names or entered text.
 */
function auditLine({ actorId, action, marketId, targetUserId, result, detail }) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    kind: 'pulse.audit',
    actorId: String(actorId ?? ''),
    action,
    marketId: marketId ?? null,
    targetUserId: targetUserId ? String(targetUserId) : null,
    result,
    detail: detail ?? null,
  });
}

/**
 * Deployment safety gate. Scoped manager commands are worse than useless if no assignments exist:
 * every manager is denied, and the denial looks like a bug. This reports whether the assignment
 * layer is fit to enforce scope, so the Owner sees a configuration problem rather than nine people
 * quietly losing access.
 *
 * @param {{ guildMembers: Map<string,{bot:boolean, hasManagerRole:boolean}>, markets: Array, managerRoleIdValid: boolean, allowNoAssignments?: boolean }} ctx
 */
function assessScopeReadiness(ctx) {
  const errors = [];
  const warnings = [];

  if (isStoreCorrupt()) errors.push(`Assignment store unreadable: ${isStoreCorrupt()}`);
  if (!ctx.managerRoleIdValid) errors.push('MANAGER_ROLE_ID is missing or invalid — the manager tier cannot be identified.');

  const active = (ctx.markets || []).filter((m) => m.active !== false);
  if (active.length === 0) errors.push('No active markets.');

  const assigned = active.filter((m) => Array.isArray(m.managerUserIds) && m.managerUserIds.length);
  if (assigned.length === 0 && !ctx.allowNoAssignments) {
    errors.push('No active market has a manager assignment. Enabling scoped commands now would deny every manager. Run the backfill, or pass an explicit Owner override.');
  }

  for (const m of active) {
    for (const uid of m.managerUserIds || []) {
      const member = ctx.guildMembers?.get?.(uid);
      if (!member) { errors.push(`${m.marketId}: assigned user ${uid} is no longer in the guild.`); continue; }
      if (member.bot) errors.push(`${m.marketId}: assigned user ${uid} is a bot.`);
      if (!member.hasManagerRole) warnings.push(`${m.marketId}: assigned user ${uid} no longer holds the Manager role.`);
    }
  }
  return { ready: errors.length === 0, errors, warnings, assignedMarkets: assigned.length, activeMarkets: active.length };
}

module.exports = { POLICY, policyFor, authorizeMarketCommand, auditLine, assessScopeReadiness };
