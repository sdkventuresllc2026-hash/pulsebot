/**
 * Per-market Discord roles + channel visibility (reps only see their market channels).
 */

const { PermissionFlagsBits } = require('discord.js');
const {
  listMarkets,
  resolveMarket,
  formatMarketNotFoundMessage,
  ensureDefaultMarkets,
  updateMarket,
  readApprovedChannelsData,
} = require('./deal-channels');

const REP_VIEW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseApplicationCommands,
];

const BOT_VIEW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
];

function marketRoleName(market) {
  return `Pulse · ${market.marketName}`.slice(0, 100);
}

function allMarketRoleIds() {
  return listMarkets().map((m) => m.roleId).filter(Boolean);
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {{ marketId: string, marketName: string, roleId?: string | null }} market
 */
async function ensureMarketRole(guild, market) {
  if (!guild?.roles) throw new Error('Guild roles unavailable');
  if (market.roleId && guild.roles.cache.has(market.roleId)) {
    return market.roleId;
  }

  const name = marketRoleName(market);
  const existing = guild.roles.cache.find((r) => r.name === name);
  const role =
    existing ||
    (await guild.roles.create({
      name,
      mentionable: true,
      reason: `Pulse market role: ${market.marketName}`,
    }));

  updateMarket(market.marketId, { roleId: role.id });
  return role.id;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {{ roleId?: string | null }} market
 * @param {string} botUserId
 * @param {{ managerRoleId?: string, adminRoleIds?: string[] }} opts
 */
/**
 * Build the COMPLETE desired overwrite set for one market channel.
 *
 * Access is ASSIGNMENT-BASED (owner decision 2026-07-28). Market visibility comes only from an
 * explicit assignment to that market — never from a generic tier. Concretely:
 *
 *   · assigned reps AND assigned managers hold that market's role  -> role overwrite
 *   · Owner/Admin see everything via the Administrator permission  -> needs no overwrite
 *   · Pulse needs technical access                                 -> member overwrite
 *   · everyone else is denied
 *
 * The generic Manager role is deliberately NOT granted here. A manager overseeing three markets
 * holds three market roles; a manager overseeing none sees none. That is what makes "one manager,
 * many markets" work without inventing a Regional Manager tier.
 *
 * `set()` (desired state) is kept on purpose — the earlier outage came from computing an
 * INCOMPLETE desired state from unvalidated config, not from replacement semantics. To make that
 * failure impossible rather than unlikely, this throws instead of silently dropping a tier.
 *
 * @param {import('discord.js').Guild} guild
 * @param {{ marketId: string, marketName: string, roleId?: string|null }} market
 * @param {string} botUserId
 * @param {{ strict?: boolean }} [opts]
 */
function buildChannelOverwrites(guild, market, botUserId, opts = {}) {
  if (!guild?.roles) throw new Error('buildChannelOverwrites: guild unavailable');
  if (!botUserId) throw new Error('buildChannelOverwrites: botUserId is required — refusing to build a set Pulse cannot use');

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: botUserId, allow: BOT_VIEW },
  ];

  // The market role IS the assignment. Missing it means the desired state cannot express who
  // should see this channel, so writing it would lock everyone out — refuse loudly instead.
  if (!market.roleId || !guild.roles.cache.has(market.roleId)) {
    const err = new Error(
      `buildChannelOverwrites: market "${market.marketName}" (${market.marketId}) has no resolvable roleId. ` +
      `Writing this desired state would remove all rep access. Run ensureMarketRole first.`,
    );
    err.code = 'MARKET_ROLE_MISSING';
    throw err;
  }
  overwrites.push({ id: market.roleId, allow: REP_VIEW });

  // Per-market manager assignment by user id, for managers not carried on the market role itself.
  for (const userId of Array.isArray(market.managerUserIds) ? market.managerUserIds : []) {
    if (!overwrites.some((o) => o.id === userId)) overwrites.push({ id: userId, allow: REP_VIEW });
  }

  return overwrites;
}

/**
 * Lock a text channel to a market role (+ managers/admins via role/env).
 */
async function applyMarketChannelLock(channel, market, guild, botUserId, opts = {}) {
  if (!channel?.isTextBased?.() || !guild) return { ok: false, reason: 'invalid_channel' };
  const roleId = await ensureMarketRole(guild, market);
  const marketWithRole = { ...market, roleId };
  const overwrites = buildChannelOverwrites(guild, marketWithRole, botUserId, opts);
  await channel.permissionOverwrites.set(overwrites);
  return { ok: true, roleId };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {string} marketId
 */
async function assignRepToMarket(guild, userId, marketId, opts = {}) {
  ensureDefaultMarkets('assign-rep');
  const resolved = resolveMarket(marketId);
  if (!resolved) {
    const err = new Error(formatMarketNotFoundMessage(marketId));
    err.code = 'MARKET_NOT_FOUND';
    throw err;
  }
  const market = resolved.market;

  const roleId = await ensureMarketRole(guild, market);
  const member = await guild.members.fetch(userId);

  // Reps belong to exactly one market; managers can oversee several. Previously this stripped
  // every other market role unconditionally, which made "one manager, many markets" impossible —
  // assigning a manager to their second market silently removed the first.
  const managerRoleId = opts.managerRoleId ?? null;
  const isManager = Boolean(managerRoleId && member.roles.cache.has(managerRoleId));
  const exclusive = opts.exclusive ?? !isManager;

  if (exclusive) {
    for (const otherRoleId of allMarketRoleIds()) {
      if (otherRoleId !== roleId && member.roles.cache.has(otherRoleId)) {
        await member.roles.remove(otherRoleId, 'Pulse: rep assigned to another market');
      }
    }
  }

  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId, `Pulse: assigned to ${market.marketName}`);
  }

  const reps = new Set(Array.isArray(market.repUserIds) ? market.repUserIds : []);
  reps.add(userId);
  updateMarket(market.marketId, { roleId, repUserIds: [...reps] });

  return { market, roleId, member };
}

/**
 * Remove all Pulse market roles from a rep.
 */
async function unassignRepFromMarkets(guild, userId) {
  const member = await guild.members.fetch(userId);
  const removed = [];
  for (const roleId of allMarketRoleIds()) {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Pulse: unassigned from market');
      removed.push(roleId);
    }
  }

  const data = readApprovedChannelsData();
  for (const market of data.markets) {
    if (!Array.isArray(market.repUserIds)) continue;
    const before = market.repUserIds.length;
    market.repUserIds = market.repUserIds.filter((id) => id !== userId);
    if (market.repUserIds.length !== before) {
      updateMarket(market.marketId, { repUserIds: market.repUserIds });
    }
  }

  return { removed };
}

/**
 * Re-apply locks on every channel mapped to a market.
 */
async function syncAllMarketChannelPermissions(guild, botUserId, opts = {}) {
  const results = { ok: 0, failed: [] };
  const markets = listMarkets();

  for (const market of markets) {
    const roleId = await ensureMarketRole(guild, market).catch((err) => {
      results.failed.push({ marketId: market.marketId, error: err.message });
      return null;
    });
    if (!roleId) continue;

    const channelIds = Array.isArray(market.channelIds) ? market.channelIds : [];
    for (const channelId of channelIds) {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel?.isTextBased?.()) continue;
        await applyMarketChannelLock(channel, { ...market, roleId }, guild, botUserId, opts);
        results.ok += 1;
      } catch (err) {
        results.failed.push({ marketId: market.marketId, channelId, error: err.message || String(err) });
      }
    }
  }

  return results;
}

/**
 * Delete a Discord market role if it exists (best-effort).
 */
async function deleteMarketRole(guild, market) {
  if (!guild?.roles || !market?.roleId) return false;
  const role = guild.roles.cache.get(market.roleId);
  if (!role) return false;
  await role.delete(`Pulse: deleted market ${market.marketName}`);
  return true;
}

module.exports = {
  marketRoleName,
  ensureMarketRole,
  applyMarketChannelLock,
  assignRepToMarket,
  unassignRepFromMarkets,
  syncAllMarketChannelPermissions,
  buildChannelOverwrites,
  deleteMarketRole,
};
