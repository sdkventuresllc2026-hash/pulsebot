/**
 * Discord follows the blitz board (owner 2026-10-15): no /market add for managers to learn.
 * A linked person on an active blitz on fibersales.co gets that blitz's chat. Blitz name = chat
 * (market) name, exact match only. Reps get exactly one chat (a blitz move moves them); managers
 * ADD the chat to the ones they have. Nobody on no blitz is touched; nothing here ever un-seats.
 *
 * planSeat() is pure (unit-tested); seatAll() applies plans after each access-sync pass.
 */
const { resolveMarket } = require('./deal-channels');
const marketAssignments = require('./market-assignments');
const { assignRepToMarket } = require('./market-access');

/** discordUserId → blitz name. A selling manager has two records; whichever carries a blitz wins. */
function blitzByDiscordId(roster) {
  const out = new Map();
  for (const p of roster.active || []) if (p.discordUserId && p.blitz) out.set(p.discordUserId, p.blitz);
  return out;
}

/**
 * m = { isBot, isOwner, isManager, repMarkets: string[], managerMarkets: string[] }
 * market = { marketId } | null (no chat with that exact name)
 */
function planSeat(m, blitz, market) {
  if (!blitz || m.isBot || m.isOwner) return { action: 'none' };
  if (!market) return { action: 'no_chat', blitz };
  if (m.isManager) return m.managerMarkets.includes(market.marketId) || m.repMarkets.includes(market.marketId) ? { action: 'none' } : { action: 'manager', marketId: market.marketId };
  return m.repMarkets.length === 1 && m.repMarkets[0] === market.marketId ? { action: 'none' } : { action: 'rep', marketId: market.marketId };
}

function exactMarket(name) {
  const r = resolveMarket(name);
  return r && r.matchedBy !== 'fuzzy' ? r.market : null;
}

async function seatAll(guild, roster, { managerRoleId, log = console.log } = {}) {
  const seats = blitzByDiscordId(roster);
  const out = { seated: 0, lines: [], missingChats: new Set() };
  for (const [userId, blitz] of seats) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue; // not in the server yet; picked up on a later pass
    const roleNames = [...member.roles.cache.values()].map((r) => r.name);
    const plan = planSeat({
      isBot: member.user.bot,
      isOwner: roleNames.includes('Owner'),
      isManager: Boolean(managerRoleId && member.roles.cache.has(managerRoleId)),
      repMarkets: marketAssignments.getRepMarkets(userId),
      managerMarkets: marketAssignments.getManagerMarkets(userId),
    }, blitz, exactMarket(blitz));
    if (plan.action === 'no_chat') { out.missingChats.add(blitz); continue; }
    if (plan.action === 'none') continue;
    try {
      if (plan.action === 'manager') marketAssignments.addManagerMarketAssignment(userId, plan.marketId);
      else {
        marketAssignments.assignRepMarket(userId, plan.marketId);
        await assignRepToMarket(guild, userId, plan.marketId, { managerRoleId });
      }
      await marketAssignments.reconcileMemberMarketRoles(guild, userId);
      out.seated++;
      out.lines.push(`💬 ${member.displayName} → #${blitz} channel (on the ${blitz} blitz)`);
    } catch (err) {
      log(`[seat] ${member.displayName} → ${blitz}: ${err?.message || err}`);
    }
  }
  return out;
}

module.exports = { planSeat, blitzByDiscordId, seatAll };
