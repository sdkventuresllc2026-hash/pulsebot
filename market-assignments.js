/**
 * Market assignment model — the DATABASE is the authority, Discord roles are an output.
 *
 * WHY: Discord roles can be added by hand, removed by hand, lost when a role is recreated, or go
 * stale after a failed sync. Authorising a manager on "roles they currently hold" therefore
 * authorises on a mutable, forgeable cache. Every decision here reads the persisted market record;
 * `reconcileMemberMarketRoles` then makes Discord match it, and conflicts always resolve toward
 * the record.
 *
 * WHERE THE DATABASE IS: `approved-blitz-channels.json` on Railway's /data volume — Pulse's own
 * persistent store. Each market record carries:
 *
 *     repUserIds:     string[]   reps assigned to this market      (a rep belongs to exactly one)
 *     managerUserIds: string[]   managers who oversee this market  (a manager may oversee many)
 *
 * NOT the FiberSales OS Postgres. No `Rep` row carries a Discord user id today — `discordAt` on
 * OnboardingCandidate is only a timestamp — so there is no link to resolve. The migration that
 * would make Postgres the authority is specified in docs/discord-assignment-model.md; until it
 * exists, this file is the source of truth and is deliberately the only place that decides.
 */

const { listMarkets, resolveMarket, updateMarket, formatMarketNotFoundMessage } = require('./deal-channels');

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
const repsOf = (m) => asArray(m.repUserIds);
const managersOf = (m) => asArray(m.managerUserIds);

function mustResolve(marketId) {
  const resolved = resolveMarket(marketId);
  if (!resolved) {
    const err = new Error(formatMarketNotFoundMessage(marketId));
    err.code = 'MARKET_NOT_FOUND';
    throw err;
  }
  return resolved.market;
}

// ---------------------------------------------------------------------------------------------
// Authority lookups. These are what command authorisation must call — never `member.roles`.
// ---------------------------------------------------------------------------------------------

/** Market ids this user is a recorded MANAGER of. */
function getManagerMarkets(userId) {
  const id = String(userId);
  return listMarkets().filter((m) => managersOf(m).includes(id)).map((m) => m.marketId);
}

/** Market ids this user is a recorded REP of. Normally 0 or 1. */
function getRepMarkets(userId) {
  const id = String(userId);
  return listMarkets().filter((m) => repsOf(m).includes(id)).map((m) => m.marketId);
}

/** Does the record say this user manages this market? The authorisation predicate. */
function isManagerOfMarket(userId, marketId) {
  const resolved = resolveMarket(marketId);
  if (!resolved) return false;
  return managersOf(resolved.market).includes(String(userId));
}

/** Every market id whose role this user should hold, from the record alone. */
function assignedMarketIds(userId) {
  return Array.from(new Set([...getRepMarkets(userId), ...getManagerMarkets(userId)]));
}

// ---------------------------------------------------------------------------------------------
// Writers. Rep and manager assignment are deliberately SEPARATE functions with different rules —
// one ambiguous `assignRepToMarket` handling both is how multi-market managers silently lost their
// other markets, and how reps could accumulate stale ones.
// ---------------------------------------------------------------------------------------------

/**
 * Assign a REP to exactly one market. EXCLUSIVE by design: a rep belongs to one market, so this
 * removes them from every other market record. A rep in two markets must be represented
 * deliberately in the record, never as a side effect of being moved.
 */
function assignRepMarket(userId, marketId) {
  const id = String(userId);
  const target = mustResolve(marketId);
  const removedFrom = [];

  for (const m of listMarkets()) {
    if (m.marketId === target.marketId) continue;
    if (repsOf(m).includes(id)) {
      updateMarket(m.marketId, { repUserIds: repsOf(m).filter((u) => u !== id) });
      removedFrom.push(m.marketId);
    }
  }
  const next = Array.from(new Set([...repsOf(target), id]));
  updateMarket(target.marketId, { repUserIds: next });
  return { marketId: target.marketId, marketName: target.marketName, removedFrom };
}

/** Give a MANAGER one more market. ADDITIVE — never touches their other assignments. */
function addManagerMarketAssignment(userId, marketId) {
  const id = String(userId);
  const target = mustResolve(marketId);
  const next = Array.from(new Set([...managersOf(target), id]));
  updateMarket(target.marketId, { managerUserIds: next });
  return { marketId: target.marketId, marketName: target.marketName, markets: getManagerMarkets(id) };
}

/** Remove a MANAGER from ONE market. Their other markets are untouched. */
function removeManagerMarketAssignment(userId, marketId) {
  const id = String(userId);
  const target = mustResolve(marketId);
  updateMarket(target.marketId, { managerUserIds: managersOf(target).filter((u) => u !== id) });
  return { marketId: target.marketId, marketName: target.marketName, remaining: getManagerMarkets(id) };
}

/** Remove a user from every market record, rep and manager alike. */
function removeAllAssignments(userId) {
  const id = String(userId);
  const cleared = [];
  for (const m of listMarkets()) {
    const patch = {};
    if (repsOf(m).includes(id)) patch.repUserIds = repsOf(m).filter((u) => u !== id);
    if (managersOf(m).includes(id)) patch.managerUserIds = managersOf(m).filter((u) => u !== id);
    if (Object.keys(patch).length) { updateMarket(m.marketId, patch); cleared.push(m.marketId); }
  }
  return { cleared };
}

// ---------------------------------------------------------------------------------------------
// Reconciliation — make Discord match the record. The record always wins.
// ---------------------------------------------------------------------------------------------

/**
 * Bring one member's Discord market roles in line with their recorded assignments.
 *
 *   · a role held with no assignment  -> REMOVED (someone added it by hand)
 *   · an assignment with no role      -> ADDED   (role recreated, or a failed earlier sync)
 *   · disagreement                    -> the record wins, always
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {{ dryRun?: boolean }} [opts]
 */
async function reconcileMemberMarketRoles(guild, userId, opts = {}) {
  const id = String(userId);
  const member = await guild.members.fetch(id);
  const markets = listMarkets();
  const byRoleId = new Map(markets.filter((m) => m.roleId).map((m) => [m.roleId, m]));

  const shouldHave = new Set(
    assignedMarketIds(id)
      .map((mid) => markets.find((m) => m.marketId === mid)?.roleId)
      .filter(Boolean),
  );
  const has = new Set(Array.from(member.roles.cache.keys()).filter((rid) => byRoleId.has(rid)));

  const toAdd = Array.from(shouldHave).filter((rid) => !has.has(rid));
  const toRemove = Array.from(has).filter((rid) => !shouldHave.has(rid));

  const plan = {
    userId: id,
    add: toAdd.map((rid) => ({ roleId: rid, market: byRoleId.get(rid)?.marketName ?? '(unknown)' })),
    remove: toRemove.map((rid) => ({ roleId: rid, market: byRoleId.get(rid)?.marketName ?? '(unknown)' })),
    applied: false,
  };
  if (opts.dryRun) return plan;

  for (const rid of toAdd) await member.roles.add(rid, 'Pulse reconcile: role restored from assignment record');
  for (const rid of toRemove) await member.roles.remove(rid, 'Pulse reconcile: no assignment record for this market');
  plan.applied = true;
  return plan;
}

module.exports = {
  getManagerMarkets,
  getRepMarkets,
  isManagerOfMarket,
  assignedMarketIds,
  assignRepMarket,
  addManagerMarketAssignment,
  removeManagerMarketAssignment,
  removeAllAssignments,
  reconcileMemberMarketRoles,
};
