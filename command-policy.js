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
  status:  { tier: 'MANAGER_ANY', scoped: false, destructive: false, why: 'read-only diagnostic' },
  list:    { tier: 'MANAGER_ANY', scoped: false, destructive: false, why: 'read-only' },
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

  if (req.isOwner) return { ok: true, reason: 'owner', policy };

  if (policy.tier === 'OWNER') {
    return deny(`\`/market ${req.subcommand}\` is Owner/Admin only — ${policy.why}.`);
  }
  if (!req.isManagerTier) {
    return deny('You need the Manager role to use this.');
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

module.exports = { POLICY, policyFor, authorizeMarketCommand, auditLine };
