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
function buildChannelOverwrites(guild, market, botUserId, opts = {}) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botUserId,
      allow: BOT_VIEW,
    },
  ];

  if (opts.managerRoleId && guild.roles.cache.has(opts.managerRoleId)) {
    overwrites.push({
      id: opts.managerRoleId,
      allow: REP_VIEW,
    });
  }

  if (market.roleId && guild.roles.cache.has(market.roleId)) {
    overwrites.push({
      id: market.roleId,
      allow: REP_VIEW,
    });
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

  for (const otherRoleId of allMarketRoleIds()) {
    if (otherRoleId !== roleId && member.roles.cache.has(otherRoleId)) {
      await member.roles.remove(otherRoleId, 'Pulse: rep assigned to another market');
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
