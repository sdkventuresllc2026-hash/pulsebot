/**
 * Pulse â€” discord.js v14 bot (slash commands, local JSON DB)
 */

require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionsBitField,
} = require('discord.js');

const { SPEEDS, SPEED_LABELS, COLORS } = require('./constants');
const { readLeaderboard, mutate, appendSingleDealLog, appendMessageLogsBatch } = require('./storage');
const { startDashboard } = require('./dashboard-server');
const { parseDealMessage } = require('./deal-parser');
const {
  isApprovedDealChannel,
  approveDealChannel,
  unapproveDealChannel,
  listApprovedDealChannels,
  approvedBlitzNameForChannel,
} = require('./deal-channels');
const { buildPremiumDealConfirmation, buildPhase4HypeLine } = require('./premium-confirmation');
const {
  getTimeZone,
  filterToday,
  filterByWeekId,
  blitzFromChannelName,
  aggregateUsers,
  primaryBlitz,
  formatSpeedBreakdown,
  currentStreakDays,
  bestDayEver,
  rankUser,
  aggregateTeamWeekly,
  fmtDateInTz,
  getWeekWindow,
} = require('./stats');

const token = process.env.DISCORD_TOKEN;
const adminIds = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const managerRoleId = (process.env.MANAGER_ROLE_ID || '').trim();

function isAdmin(userId) {
  return adminIds.includes(userId);
}

function canUseAdminCommands(interaction) {
  if (isAdmin(interaction.user.id)) return true;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  if (managerRoleId && interaction.member?.roles?.cache?.has(managerRoleId)) return true;
  return false;
}

function canUseAdminMember(userId, member) {
  if (isAdmin(userId)) return true;
  if (member?.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  if (managerRoleId && member?.roles?.cache?.has(managerRoleId)) return true;
  return false;
}

async function denyAdmin(interaction) {
  await interaction.reply({ content: 'Permission denied. Administrators only.', ephemeral: true });
}

function leaderboardEmbed({ title, rows, timeframeLabel, blitzFilter }) {
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(title).setTimestamp(new Date());

  if (blitzFilter) embed.setFooter({ text: `Filter: ${blitzFilter}` });

  if (!rows.length) {
    embed.setDescription('No deals yet for this view.');
    return embed;
  }

  const lines = rows.slice(0, 25).map((r, i) => {
    const medal = i === 0 ? 'ðŸ¥‡' : i === 1 ? 'ðŸ¥ˆ' : i === 2 ? 'ðŸ¥‰' : `**#${i + 1}**`;
    const streak = r.streakDays > 1 ? ` â€¢ ðŸ”¥ ${r.streakDays}d streak` : '';
    const block = [`${medal} **${r.displayName}** â€” **${r.total}** deals`, formatSpeedBreakdown(r.speeds)].join('\n');
    return `${block}${streak}`;
  });

  embed.setDescription(lines.join('\n\n'));
  embed.addFields({ name: 'Timeframe', value: timeframeLabel, inline: true });
  return embed;
}

function buildRowsForLogs(logs, allLogsForStreak) {
  const aggs = aggregateUsers(logs);
  return aggs.map((u) => ({
    ...u,
    streakDays: currentStreakDays(allLogsForStreak, u.userId),
    blitz: primaryBlitz(u),
  }));
}

function applyBlitzFilter(rows, blitzFilter) {
  if (!blitzFilter) return rows;
  const q = blitzFilter.toLowerCase();
  return rows.filter((r) => r.blitz.toLowerCase().includes(q));
}

function logsForTimeframe(data, timeframe) {
  const logs = activeDealLogs(data);
  if (timeframe === 'today') return filterToday(logs, getTimeZone());
  if (timeframe === 'weekly') return filterByWeekId(logs, data.metadata.weekId);
  return logs;
}

const PHASE3_OUTSIDE_CHANNEL_MSG = 'This channel is not connected to a blitz leaderboard.';
const PHASE3_SPEED_ORDER = ['1gig', '2gig', '500mb', '300mb', '200mb'];
const PHASE3_SPEED_LABELS = {
  '1gig': '1 Gig',
  '2gig': '2 Gig',
  '500mb': '500 Mbps',
  '300mb': '300 Mbps',
  '200mb': '200 Mbps',
};

function activeDealLogs(data) {
  return (data.logs || [])
    .filter((l) => l && !l.removed && !l.removedAt && !l.deletedAt && !l.voidedAt)
    .map((l) => ({ ...l, speed: l.correctedSpeed || l.speed }))
    .filter((l) => SPEEDS.includes(l.speed));
}

function approvedDealLogs(logs) {
  return logs.filter((l) =>
    isApprovedDealChannel({
      id: l.channelId || '',
      name: l.channelName || l.blitzName || '',
    }),
  );
}

function titleCaseBlitzName(name) {
  const cleaned = String(name || 'Unknown Blitz')
    .replace(/[^\w\s-]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Unknown Blitz';
  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function currentBlitzName(interaction) {
  return approvedBlitzNameForChannel(interaction.channel) || blitzFromChannelName(interaction.channel?.name);
}

function isPhase3ApprovedChannel(interaction) {
  return isApprovedDealChannel(interaction.channel);
}

async function replyOutsideBlitz(interaction) {
  await interaction.reply({ content: PHASE3_OUTSIDE_CHANNEL_MSG, ephemeral: true });
}

function logMatchesCurrentBlitz(log, interaction) {
  const channel = interaction.channel;
  const blitzName = currentBlitzName(interaction);
  if (log.channelId && channel?.id && log.channelId === channel.id) return true;
  return titleCaseBlitzName(log.blitzName || log.channelName) === titleCaseBlitzName(blitzName);
}

function filterPhase3Timeframe(logs, timeframe, data) {
  if (timeframe === 'daily') return filterToday(logs, getTimeZone());
  if (timeframe === 'weekly') return filterByWeekId(logs, data.metadata.weekId);
  return logs;
}

function speedCountsForLogs(logs) {
  const speeds = {};
  for (const log of logs) {
    speeds[log.speed] = (speeds[log.speed] || 0) + 1;
  }
  return speeds;
}

function formatPhase3SpeedBreakdown(speeds) {
  const parts = PHASE3_SPEED_ORDER
    .map((speed) => [speed, speeds[speed] || 0])
    .filter(([, count]) => count > 0)
    .map(([speed, count]) => `${count}x ${PHASE3_SPEED_LABELS[speed] || speed}`);

  return parts.length ? parts.join(' | ') : 'â€”';
}

function phase3Rows(logs) {
  const byUser = new Map();

  for (const log of logs) {
    if (!byUser.has(log.userId)) {
      byUser.set(log.userId, {
        userId: log.userId,
        displayName: log.displayName || log.username || 'Unknown',
        total: 0,
        speeds: {},
        blitzCounts: {},
      });
    }

    const row = byUser.get(log.userId);
    row.total += 1;
    row.speeds[log.speed] = (row.speeds[log.speed] || 0) + 1;

    const blitzName = titleCaseBlitzName(log.blitzName || log.channelName);
    row.blitzCounts[blitzName] = (row.blitzCounts[blitzName] || 0) + 1;
    row.displayName = log.displayName || row.displayName;
  }

  return [...byUser.values()].sort(
    (a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName),
  );
}

function withCompetitionRanks(rows) {
  let previousTotal = null;
  let previousRank = 0;
  return rows.map((row, idx) => {
    const rank = row.total === previousTotal ? previousRank : idx + 1;
    previousTotal = row.total;
    previousRank = rank;
    return { ...row, rank };
  });
}

function formatPhase3Leaderboard({ title, rows, totalDeals }) {
  if (!rows.length) return 'No deals logged yet.';

  const lines = [`ðŸ† ${title}`, ''];
  for (const row of withCompetitionRanks(rows).slice(0, 10)) {
    lines.push(`${row.rank}. ${row.displayName} â€” ${row.total} deals`);
    lines.push(`   ${formatPhase3SpeedBreakdown(row.speeds)}`);
    lines.push('');
  }
  lines.push(`Total Deals: ${totalDeals}`);
  return lines.join('\n').trim();
}

function formatPhase3Master(rows, totalDeals) {
  if (!rows.length) return 'No deals logged yet.';

  const lines = ['ðŸ† Master Leaderboard', ''];
  for (const row of withCompetitionRanks(rows).slice(0, 10)) {
    const blitzLine = Object.entries(row.blitzCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name}: ${count}`)
      .join(' | ');

    lines.push(`${row.rank}. ${row.displayName} â€” ${row.total} deals`);
    lines.push(`   ${blitzLine}`);
    lines.push(`   ${formatPhase3SpeedBreakdown(row.speeds)}`);
    lines.push('');
  }
  lines.push(`Total Deals: ${totalDeals}`);
  return lines.join('\n').trim();
}

function competitionRankForUser(rows, userId) {
  return withCompetitionRanks(rows).find((row) => row.userId === userId)?.rank || null;
}

async function handlePhase3Leaderboard(interaction, { timeframe, label }) {
  if (!isPhase3ApprovedChannel(interaction)) {
    await replyOutsideBlitz(interaction);
    return;
  }

  await interaction.deferReply();
  const data = await readLeaderboard();
  const allLogs = approvedDealLogs(activeDealLogs(data));
  const blitzLogs = allLogs.filter((log) => logMatchesCurrentBlitz(log, interaction));
  const logs = filterPhase3Timeframe(blitzLogs, timeframe, data);
  const blitzName = titleCaseBlitzName(currentBlitzName(interaction));

  await interaction.editReply({
    content: formatPhase3Leaderboard({
      title: `${blitzName} ${label} Leaderboard`,
      rows: phase3Rows(logs),
      totalDeals: logs.length,
    }),
    embeds: [],
  });
}

async function handlePhase3Master(interaction) {
  if (!isPhase3ApprovedChannel(interaction)) {
    await replyOutsideBlitz(interaction);
    return;
  }

  await interaction.deferReply();
  const data = await readLeaderboard();
  const logs = approvedDealLogs(activeDealLogs(data));

  await interaction.editReply({
    content: formatPhase3Master(phase3Rows(logs), logs.length),
    embeds: [],
  });
}

async function handlePhase3MyDeals(interaction) {
  if (!isPhase3ApprovedChannel(interaction)) {
    await replyOutsideBlitz(interaction);
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const data = await readLeaderboard();
  const userId = interaction.user.id;
  const allLogs = approvedDealLogs(activeDealLogs(data));
  const userLogs = allLogs.filter((log) => log.userId === userId);
  const blitzLogs = allLogs.filter((log) => logMatchesCurrentBlitz(log, interaction));
  const userBlitzLogs = blitzLogs.filter((log) => log.userId === userId);
  const todayUserLogs = filterPhase3Timeframe(userLogs, 'daily', data);
  const weekUserLogs = filterPhase3Timeframe(userLogs, 'weekly', data);
  const blitzRank = competitionRankForUser(phase3Rows(blitzLogs), userId);
  const overallRank = competitionRankForUser(phase3Rows(allLogs), userId);
  const blitzName = titleCaseBlitzName(currentBlitzName(interaction));

  await interaction.editReply({
    content: [
      'Your Deals',
      '',
      `Today: ${todayUserLogs.length}`,
      `This Week: ${weekUserLogs.length}`,
      `This Blitz: ${userBlitzLogs.length}`,
      `All-Time: ${userLogs.length}`,
      '',
      'Speed Breakdown:',
      formatPhase3SpeedBreakdown(speedCountsForLogs(userBlitzLogs)),
      '',
      'Current Rank:',
      blitzRank ? `#${blitzRank} in ${blitzName}` : `â€” in ${blitzName}`,
      overallRank ? `#${overallRank} overall` : 'â€” overall',
    ].join('\n'),
    embeds: [],
  });
}

function optSlashString(interaction, name, maxLen) {
  const raw = interaction.options.getString(name);
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

function buildLogConfirmationCtx({
  userId,
  displayName,
  blitzName,
  speeds,
  dataAfter,
  dataBefore,
  tz,
  hasCustomerOnFile,
}) {
  const todayAfter = filterToday(activeDealLogs(dataAfter), tz);
  const todayBefore = filterToday(activeDealLogs(dataBefore), tz);
  const dealsTodayAfter = todayAfter.filter((l) => l.userId === userId).length;
  const dealsTodayBefore = todayBefore.filter((l) => l.userId === userId).length;
  const rowsTodayAfter = buildRowsForLogs(todayAfter, dataAfter.logs);
  const rowsTodayBefore = buildRowsForLogs(todayBefore, dataBefore.logs);
  return {
    displayName,
    blitzName,
    speeds,
    userId,
    dealsTodayAfter,
    dealsTodayBefore,
    rankTodayAfter: rankUser(rowsTodayAfter, userId),
    rankTodayBefore: rankUser(rowsTodayBefore, userId),
    rowsTodayAfter,
    hasCustomerOnFile: !!hasCustomerOnFile,
  };
}

const REP_DAILY_MILESTONES = [
  { count: 1, bankCount: 'first' },
  { count: 3, bankCount: 3 },
  { count: 5, bankCount: 5 },
  { count: 8, bankCount: 8 },
  { count: 10, bankCount: 10 },
  { count: 15, bankCount: 15 },
  { count: 20, bankCount: 20 },
];
const BLITZ_DAILY_MILESTONES = [10, 25, 50, 75, 100];

function ensureGamificationState(data) {
  data.gamification = data.gamification && typeof data.gamification === 'object' ? data.gamification : {};
  data.gamification.dailyMilestones =
    data.gamification.dailyMilestones && typeof data.gamification.dailyMilestones === 'object'
      ? data.gamification.dailyMilestones
      : {};
  return data.gamification;
}

function localHour(date, timeZone) {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date).find((p) => p.type === 'hour')?.value;
  return Number(hour);
}

function logDate(log) {
  return log.date || log.timestamp?.slice(0, 10);
}

function logMatchesBlitzContext(log, { channelId, blitzName }) {
  if (log.channelId && channelId && log.channelId === channelId) return true;
  return titleCaseBlitzName(log.blitzName || log.channelName) === titleCaseBlitzName(blitzName);
}

function dailyBlitzLogs(data, date, blitzCtx) {
  return activeDealLogs(data).filter((log) => logDate(log) === date && logMatchesBlitzContext(log, blitzCtx));
}

function dailyUserCount(data, date, userId) {
  return activeDealLogs(data).filter((log) => logDate(log) === date && log.userId === userId).length;
}

function milestoneKey(date, scope, id, count) {
  return `${date}:${scope}:${id}:${count}`;
}

function leadStatus(rows, userId) {
  const userRow = rows.find((row) => row.userId === userId);
  const userTotal = userRow?.total || 0;
  const topTotal = rows[0]?.total || 0;
  const leaders = rows.filter((row) => row.total === topTotal && topTotal > 0);
  return {
    userTotal,
    topTotal,
    isSoleLeader: leaders.length === 1 && leaders[0]?.userId === userId,
    isTiedLeader: leaders.length > 1 && leaders.some((row) => row.userId === userId),
  };
}

function phase4LeadMessages({ dataBefore, dataAfter, date, userId, displayName, blitzCtx }) {
  const beforeRows = phase3Rows(dailyBlitzLogs(dataBefore, date, blitzCtx));
  const afterRows = phase3Rows(dailyBlitzLogs(dataAfter, date, blitzCtx));
  const before = leadStatus(beforeRows, userId);
  const after = leadStatus(afterRows, userId);

  if (after.topTotal <= 1) return [];
  if (after.isSoleLeader && !before.isSoleLeader && before.topTotal > 0) {
    return [buildPhase4HypeLine('newLeader', { rep: displayName, count: after.userTotal })];
  }
  if (after.isTiedLeader && !before.isTiedLeader) {
    return [buildPhase4HypeLine('tied', { rep: displayName, count: after.userTotal })];
  }
  if (!after.isSoleLeader && !after.isTiedLeader && after.userTotal === after.topTotal - 1) {
    return [buildPhase4HypeLine('oneAway', { rep: displayName })];
  }
  return [];
}

async function buildPhase4Messages({
  dataBefore,
  dataAfter,
  userId,
  displayName,
  blitzName,
  channelId,
  speeds,
  now,
  tz,
  suppressPersonalHype = false,
}) {
  const date = fmtDateInTz(now, tz);
  const blitz = titleCaseBlitzName(blitzName);
  const blitzCtx = { channelId, blitzName };
  const messages = [];
  const userBefore = dailyUserCount(dataBefore, date, userId);
  const userAfter = dailyUserCount(dataAfter, date, userId);
  const blitzBefore = dailyBlitzLogs(dataBefore, date, blitzCtx).length;
  const blitzAfter = dailyBlitzLogs(dataAfter, date, blitzCtx).length;
  const repCandidates = REP_DAILY_MILESTONES.filter(
    (milestone) => userBefore < milestone.count && userAfter >= milestone.count,
  );
  const blitzCandidates = BLITZ_DAILY_MILESTONES.filter((count) => blitzBefore < count && blitzAfter >= count);

  if (repCandidates.length || blitzCandidates.length) {
    await mutate(async (data) => {
      const game = ensureGamificationState(data);

      for (const milestone of repCandidates) {
        const key = milestoneKey(date, 'rep', userId, milestone.bankCount);
        if (game.dailyMilestones[key]) continue;
        game.dailyMilestones[key] = new Date().toISOString();
        if (!suppressPersonalHype) {
          messages.push(buildPhase4HypeLine('repDaily', { rep: displayName, count: milestone.bankCount }));
        }
      }

      for (const count of blitzCandidates) {
        const key = milestoneKey(date, 'blitz', channelId || blitz, count);
        if (game.dailyMilestones[key]) continue;
        game.dailyMilestones[key] = new Date().toISOString();
        messages.push(buildPhase4HypeLine('blitzDaily', { blitz, count }));
      }

      return data;
    });
  }

  if (localHour(now, tz) >= 19) {
    for (let i = 0; i < speeds.length; i += 1) {
      messages.push(buildPhase4HypeLine('lateClock', { rep: displayName }));
    }
  }

  if (!suppressPersonalHype) {
    messages.push(...phase4LeadMessages({ dataBefore, dataAfter, date, userId, displayName, blitzCtx }));
  }
  return messages.filter(Boolean);
}

async function postPhase4Messages(channel, messages) {
  if (!channel || typeof channel.send !== 'function') return;
  for (const message of messages) {
    await channel.send({ content: message, allowedMentions: { parse: [] } }).catch((err) => {
      console.error('Phase 4 gamification send failed:', err.message || err);
    });
  }
}

async function postPhase4Gamification(channel, ctx) {
  const messages = await buildPhase4Messages(ctx);
  await postPhase4Messages(channel, messages);
}

function parseTextAdminCommand(content) {
  const text = String(content || '').trim();
  const approve = text.match(/^(?:pulse\s+)?(?:approve|add)\s+(?:blitz|channel)(?:\s+(.+))?$/i);
  if (approve) return { action: 'approve', blitzName: approve[1]?.trim() || null };

  const remove = text.match(/^(?:pulse\s+)?(?:remove|delete|unapprove)\s+(?:blitz|channel)$/i);
  if (remove) return { action: 'remove' };

  const list = text.match(/^(?:pulse\s+)?(?:list|show)\s+(?:blitzes|channels|deal channels)$/i);
  if (list) return { action: 'list' };

  return null;
}

async function handleTextAdminCommand(message) {
  const parsed = parseTextAdminCommand(message.content);
  if (!parsed) return false;

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!canUseAdminMember(message.author.id, member)) {
    await message.reply({ content: 'Permission denied. Administrators only.', allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  }

  if (!message.channel || !('name' in message.channel) || !message.channel.name) {
    await message.reply({ content: 'Use this inside a server text channel.', allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  }

  if (parsed.action === 'approve') {
    const blitzName = channelBlitzName(message.channel, parsed.blitzName);
    const result = approveDealChannel(message.channel, message.author.id, blitzName);
    await message.reply({
      content: [
        result.alreadyApproved ? 'Blitz channel already approved.' : 'Blitz channel approved.',
        `Channel: <#${result.channel.id}>`,
        `Blitz: ${result.channel.blitzName}`,
      ].join('\n'),
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }

  if (parsed.action === 'remove') {
    unapproveDealChannel(message.channel.id);
    await message.reply({
      content: `Removed <#${message.channel.id}> from approved deal channels.`,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }

  if (parsed.action === 'list') {
    const channels = approvedChannelsForGuild(message.guild);
    await message.reply({
      content: channels.length
        ? ['Approved deal channels:', ...channels.map((c) => `• <#${c.id}> — ${c.blitzName}`)].join('\n')
        : 'No approved deal channels yet. Type `approve blitz Your Blitz Name` in a deal channel.',
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }

  return false;
}

function duplicatePromptComponents(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dup_new:${id}`)
        .setLabel('New Deal')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`dup_ignore:${id}`)
        .setLabel('Duplicate')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function canResolveDuplicate(buttonInteraction, userId) {
  if (buttonInteraction.user.id === userId) return true;
  if (isAdmin(buttonInteraction.user.id)) return true;
  return !!buttonInteraction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

async function confirmSingleDealLog({
  appendResult,
  channel,
  userId,
  displayName,
  blitzName,
  speeds,
  now,
  tz,
  hasCustomerOnFile,
  editConfirmation,
}) {
  if (!appendResult?.ok) return false;
  const ctx = buildLogConfirmationCtx({
    userId,
    displayName,
    blitzName,
    speeds,
    dataAfter: appendResult.data,
    dataBefore: appendResult.dataBefore,
    tz,
    hasCustomerOnFile,
  });

  await editConfirmation({
    content: buildPremiumDealConfirmation(ctx),
    embeds: [],
    components: [],
  });
  await postPhase4Gamification(channel, {
    dataBefore: appendResult.dataBefore,
    dataAfter: appendResult.data,
    userId,
    displayName,
    blitzName,
    channelId: channel?.id || null,
    speeds,
    now,
    tz,
    suppressPersonalHype: true,
  });
  return true;
}

async function handleDuplicatePrompt({ promptMessage, userId, onNewDeal }) {
  let processed = false;
  try {
    const button = await promptMessage.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30000,
      filter: async (i) => {
        const matches = i.customId.startsWith('dup_new:') || i.customId.startsWith('dup_ignore:');
        if (!matches) return false;
        if (canResolveDuplicate(i, userId)) return true;
        await i.reply({ content: 'Only the rep or an Administrator can answer this.', ephemeral: true }).catch(() => {});
        return false;
      },
    });

    if (processed) return;
    processed = true;

    if (button.customId.startsWith('dup_ignore:')) {
      await button.update({ content: 'Duplicate ignored.', components: [], embeds: [] }).catch(() => {});
      return;
    }

    await button.deferUpdate().catch(() => {});
    await onNewDeal().catch(async (err) => {
      console.error('Duplicate prompt New Deal failed:', err.message || err);
      await promptMessage.edit({ content: 'Pulse hit an error.', components: [], embeds: [] }).catch(() => {});
    });
  } catch {
    if (!processed) {
      processed = true;
      await promptMessage.edit({ content: 'Duplicate check expired.', components: [], embeds: [] }).catch(() => {});
    }
  }
}

async function handleLog(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Pulse commands only work in a server.', ephemeral: true });
    return;
  }

  if (!isApprovedDealChannel(interaction.channel)) {
    await interaction.reply({ content: PHASE3_OUTSIDE_CHANNEL_MSG, ephemeral: true });
    return;
  }

  const speed = interaction.options.getString('speed', true);
  if (!SPEEDS.includes(speed)) {
    await interaction.reply({ content: 'Invalid speed.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const tz = getTimeZone();
  const now = new Date();
  const channel = interaction.channel;
  const blitzName = approvedBlitzNameForChannel(channel) || blitzFromChannelName(channel?.name);

  const member = interaction.member;
  const displayName = member?.displayName || interaction.user.globalName || interaction.user.username;

  const customerName = optSlashString(interaction, 'customer_name', 100);
  const customerPhone = optSlashString(interaction, 'customer_phone', 40);
  const customerAddress = optSlashString(interaction, 'customer_address', 300);

  const userId = interaction.user.id;

  const buildLogEntry = (data) => ({
    id: `${now.getTime()}_${userId}_${Math.random().toString(16).slice(2)}`,
    userId,
    displayName,
    username: interaction.user.username,
    speed,
    timestamp: now.toISOString(),
    date: fmtDateInTz(now, tz),
    channelId: channel?.id || null,
    channelName: channel?.name || null,
    blitzName,
    weekId: data.metadata.weekId,
    ...(customerName && { customerName }),
    ...(customerPhone && { customerPhone }),
    ...(customerAddress && { customerAddress }),
  });

  const hasCustomerOnFile = !!(customerName || customerPhone || customerAddress);
  const appendResult = await appendSingleDealLog({
    userId,
    speed,
    channelId: channel?.id || null,
    buildLogEntry,
    skipDuplicateCheck: !isApprovedDealChannel(channel),
    nowMs: now.getTime(),
  });

  if (appendResult.possibleDuplicate) {
    const promptId = `${interaction.id}:${Date.now()}`;
    await interaction.editReply({
      content: 'Possible duplicate. Log it?',
      embeds: [],
      components: duplicatePromptComponents(promptId),
    });
    const promptMessage = await interaction.fetchReply();
    await handleDuplicatePrompt({
      promptMessage,
      userId,
      onNewDeal: async () => {
        const newDealResult = await appendSingleDealLog({
          userId,
          speed,
          channelId: channel?.id || null,
          buildLogEntry,
          skipDuplicateCheck: true,
          nowMs: now.getTime(),
        });
        await confirmSingleDealLog({
          appendResult: newDealResult,
          channel,
          userId,
          displayName,
          blitzName,
          speeds: [speed],
          now,
          tz,
          hasCustomerOnFile,
          editConfirmation: (payload) => promptMessage.edit(payload),
        });
      },
    });
    return;
  }

  const { dataBefore: snapshotBefore, data } = appendResult;

  const ctx = buildLogConfirmationCtx({
    userId,
    displayName,
    blitzName,
    speeds: [speed],
    dataAfter: data,
    dataBefore: snapshotBefore,
    tz,
    hasCustomerOnFile,
  });

  const content = buildPremiumDealConfirmation(ctx);
  await interaction.editReply({ content, embeds: [] });
  await postPhase4Gamification(channel, {
    dataBefore: snapshotBefore,
    dataAfter: data,
    userId,
    displayName,
    blitzName,
    channelId: channel?.id || null,
    speeds: [speed],
    now,
    tz,
    suppressPersonalHype: true,
  });
}

async function handleLeaderboard(interaction, { timeframe, blitz }) {
  await interaction.deferReply();
  const data = await readLeaderboard();
  const logs = logsForTimeframe(data, timeframe);
  const rows = applyBlitzFilter(buildRowsForLogs(logs, data.logs), blitz);

  const labels = { today: 'Today', weekly: 'This week', alltime: 'All-time' };
  const embed = leaderboardEmbed({
    title: `ðŸ† ${labels[timeframe]} Leaderboard`,
    rows,
    timeframeLabel: labels[timeframe],
    blitzFilter: blitz || null,
  });
  await interaction.editReply({ embeds: [embed] });
}

async function handleMyStats(interaction) {
  await interaction.deferReply();
  const data = await readLeaderboard();
  const tz = getTimeZone();
  const uid = interaction.user.id;
  const logs = activeDealLogs(data);

  const todayLogs = filterToday(logs, tz);
  const weekLogs = filterByWeekId(logs, data.metadata.weekId);
  const userLogs = logs.filter((l) => l.userId === uid);

  const speedsToday = aggregateUsers(todayLogs.filter((l) => l.userId === uid))[0]?.speeds || {};
  const speedsWeek = aggregateUsers(weekLogs.filter((l) => l.userId === uid))[0]?.speeds || {};
  const speedsAll = aggregateUsers(userLogs)[0]?.speeds || {};

  const dealsToday = todayLogs.filter((l) => l.userId === uid).length;
  const dealsWeek = weekLogs.filter((l) => l.userId === uid).length;
  const dealsAll = userLogs.length;

  const streak = currentStreakDays(logs, uid);
  const best = bestDayEver(userLogs, uid);

  const rowsToday = buildRowsForLogs(todayLogs, logs);
  const rowsWeek = buildRowsForLogs(weekLogs, logs);

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`ðŸ“Š ${interaction.member?.displayName || interaction.user.username} â€” My Stats`)
    .addFields(
      { name: 'Today', value: `${dealsToday} deals`, inline: true },
      { name: 'This week', value: `${dealsWeek} deals`, inline: true },
      { name: 'All-time', value: `${dealsAll} deals`, inline: true },
      {
        name: 'Speed breakdown',
        value: [
          `**Today**\n${formatSpeedBreakdown(speedsToday)}`,
          `**Week**\n${formatSpeedBreakdown(speedsWeek)}`,
          `**All-time**\n${formatSpeedBreakdown(speedsAll)}`,
        ].join('\n\n'),
        inline: false,
      },
      { name: 'Current streak', value: `${streak} day(s)`, inline: true },
      { name: 'Best day ever', value: `${best} deals`, inline: true },
      {
        name: 'Rank',
        value: `Today: ${rankUser(rowsToday, uid) ? `#${rankUser(rowsToday, uid)}` : 'â€”'}\nWeek: ${
          rankUser(rowsWeek, uid) ? `#${rankUser(rowsWeek, uid)}` : 'â€”'
        }`,
        inline: false,
      },
    )
    .setTimestamp(new Date());

  await interaction.editReply({ embeds: [embed] });
}

async function handleShare(interaction) {
  await interaction.deferReply();
  const data = await readLeaderboard();
  const uid = interaction.user.id;
  const logs = activeDealLogs(data);
  const weekLogs = filterByWeekId(logs, data.metadata.weekId).filter((l) => l.userId === uid);
  const agg = aggregateUsers(weekLogs)[0];

  const displayName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const total = agg?.total || 0;
  const speeds = agg?.speeds || {};
  const rowsWeek = buildRowsForLogs(filterByWeekId(logs, data.metadata.weekId), logs);
  const r = rankUser(rowsWeek, uid);

  const team = agg ? primaryBlitz(agg) : 'â€”';

  const embed = new EmbedBuilder()
    .setColor(0x111111)
    .setTitle('ðŸ”¥ WEEKLY PRODUCTION')
    .setDescription(
      [
        `**${displayName}**`,
        `**${total} Fiber Deals Closed**`,
        '',
        '**Speed Breakdown**',
        formatSpeedBreakdown(speeds),
        '',
        `**Rank:** ${r ? `#${r} This Week` : 'â€”'}`,
        `**Team:** ${team}`,
        '',
        '*Built different.*',
      ].join('\n'),
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleUndo(interaction) {
  await interaction.deferReply();
  const uid = interaction.user.id;

  let removedLog = null;
  await mutate(async (d) => {
    for (let i = d.logs.length - 1; i >= 0; i--) {
      if (d.logs[i].userId === uid) {
        removedLog = d.logs[i];
        d.logs.splice(i, 1);
        break;
      }
    }
    return d;
  });

  if (!removedLog) {
    await interaction.deleteReply().catch(() => {});
    await interaction.followUp({ content: 'Nothing to undo.', ephemeral: true });
    return;
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('Undid last log')
        .setDescription(
          `Removed: **${SPEED_LABELS[removedLog.speed] || removedLog.speed}** at ${removedLog.timestamp}`,
        ),
    ],
  });
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function optionChannelOrCurrent(interaction) {
  return interaction.options.getChannel('channel') || interaction.channel;
}

function channelBlitzName(channel, fallback) {
  return approvedBlitzNameForChannel(channel) || String(fallback || '').trim() || titleCaseBlitzName(blitzFromChannelName(channel?.name));
}

function approvedChannelsForGuild(guild) {
  const byId = new Map();
  for (const channel of guild?.channels?.cache?.values?.() || []) {
    if (channel && typeof channel.name === 'string' && isApprovedDealChannel(channel)) {
      byId.set(channel.id, {
        id: channel.id,
        name: channel.name,
        blitzName: channelBlitzName(channel),
        active: true,
      });
    }
  }
  for (const channel of listApprovedDealChannels()) {
    if (!byId.has(channel.id)) {
      byId.set(channel.id, {
        id: channel.id,
        name: channel.name,
        blitzName: channel.blitzName || titleCaseBlitzName(channel.name),
        active: false,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function adminCsvAttachment(data) {
  const header = ['timestamp', 'rep name', 'discord user ID', 'speed tier', 'blitz name', 'channel name'].join(',');
  const lines = activeDealLogs(data).map((l) =>
    [
      l.timestamp,
      csvEscape(l.displayName || l.username || 'Unknown'),
      l.userId,
      l.speed,
      csvEscape(l.blitzName || l.channelName || ''),
      csvEscape(l.channelName || ''),
    ].join(','),
  );
  const csv = [header, ...lines].join('\n');
  return new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `pulse_deals_${Date.now()}.csv` });
}

async function handleAdminAddChannel(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const channel = optionChannelOrCurrent(interaction);
  if (!channel || !channel.id || typeof channel.name !== 'string') {
    await interaction.editReply({ content: 'Pick a text channel or run this inside one.' });
    return;
  }

  const blitzName = channelBlitzName(channel, interaction.options.getString('blitz_name'));
  const result = approveDealChannel(channel, interaction.user.id, blitzName);

  await interaction.editReply({
    content: [
      result.alreadyApproved ? 'Deal channel already approved.' : 'Deal channel approved.',
      `Channel: <#${result.channel.id}>`,
      `Blitz: ${result.channel.blitzName}`,
    ].join('\n'),
  });
}

async function handleCorrection(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const uid = interaction.user.id;
  const speed = interaction.options.getString('speed', true);
  if (!SPEEDS.includes(speed)) {
    await interaction.editReply({ content: 'Invalid speed.' });
    return;
  }

  let correctedLog = null;
  await mutate(async (d) => {
    for (let i = d.logs.length - 1; i >= 0; i -= 1) {
      const log = d.logs[i];
      if (log.userId !== uid) continue;
      if (log.removed || log.removedAt || log.deletedAt || log.voidedAt) continue;
      correctedLog = { ...log, previousSpeed: log.correctedSpeed || log.speed };
      d.logs[i] = {
        ...log,
        originalSpeed: log.originalSpeed || log.speed,
        correctedSpeed: speed,
        speed,
        correctedAt: new Date().toISOString(),
        correctedBy: uid,
      };
      break;
    }
    return d;
  });

  if (!correctedLog) {
    await interaction.editReply({ content: 'No deal found to correct.' });
    return;
  }

  await interaction.editReply({
    content: `Corrected last deal: ${SPEED_LABELS[correctedLog.previousSpeed] || correctedLog.previousSpeed} → ${SPEED_LABELS[speed] || speed}.`,
  });
}

async function handleAdminRemoveChannel(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }

  const channel = optionChannelOrCurrent(interaction);
  if (!channel || !channel.id || typeof channel.name !== 'string') {
    await interaction.reply({ content: 'Pick a text channel or run this inside one.', ephemeral: true });
    return;
  }

  const promptId = `admin_remove:${channel.id}:${Date.now()}`;
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${promptId}:yes`).setLabel('Remove').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${promptId}:no`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    ),
  ];

  await interaction.reply({
    content: `Remove <#${channel.id}> from approved deal channels?`,
    components,
    ephemeral: true,
  });

  const promptMessage = await interaction.fetchReply();
  let processed = false;
  try {
    const button = await promptMessage.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30000,
      filter: async (i) => {
        if (!i.customId.startsWith(promptId)) return false;
        if (canUseAdminCommands(i)) return true;
        await i.reply({ content: 'Permission denied. Administrators only.', ephemeral: true }).catch(() => {});
        return false;
      },
    });
    if (processed) return;
    processed = true;

    if (button.customId.endsWith(':no')) {
      await button.update({ content: 'Remove cancelled.', components: [] }).catch(() => {});
      return;
    }

    await button.deferUpdate().catch(() => {});
    const removed = unapproveDealChannel(channel.id);
    await interaction.editReply({
      content: removed
        ? `Removed <#${channel.id}> from approved deal channels.`
        : `<#${channel.id}> was not approved.`,
      components: [],
    }).catch(() => {});
  } catch {
    if (!processed) {
      await promptMessage.edit({ content: 'Remove confirmation expired.', components: [] }).catch(() => {});
    }
  }
}

async function handleAdminListChannels(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const channels = approvedChannelsForGuild(interaction.guild);
  await interaction.editReply({
    content: channels.length
      ? ['Approved deal channels:', ...channels.map((c) => `• <#${c.id}> — ${c.blitzName}`)].join('\n')
      : 'No approved deal channels found. Use /admin add-channel.',
  });
}

async function handleAdminStats(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const data = await readLeaderboard();
  const logs = approvedDealLogs(activeDealLogs(data));
  const todayLogs = filterToday(logs, getTimeZone());
  const weekLogs = filterByWeekId(logs, data.metadata.weekId);
  const topRep = phase3Rows(todayLogs)[0];
  const blitzCounts = new Map();
  for (const log of todayLogs) {
    const blitz = titleCaseBlitzName(log.blitzName || log.channelName);
    blitzCounts.set(blitz, (blitzCounts.get(blitz) || 0) + 1);
  }
  const topBlitz = [...blitzCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  await interaction.editReply({
    content: [
      'Admin Stats',
      '',
      `Total deals today: ${todayLogs.length}`,
      `Total deals this week: ${weekLogs.length}`,
      `Total all-time deals: ${logs.length}`,
      `Active approved channels: ${approvedChannelsForGuild(interaction.guild).filter((c) => c.active).length}`,
      `Top rep today: ${topRep ? `${topRep.displayName} (${topRep.total})` : 'None'}`,
      `Top blitz today: ${topBlitz ? `${topBlitz[0]} (${topBlitz[1]})` : 'None'}`,
    ].join('\n'),
  });
}

async function handleAdminExportCsv(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const data = await readLeaderboard();
  await interaction.editReply({
    content: 'CSV export attached.',
    files: [adminCsvAttachment(data)],
  });
}

async function handleAdmin(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'add-channel') return handleAdminAddChannel(interaction);
  if (subcommand === 'remove-channel') return handleAdminRemoveChannel(interaction);
  if (subcommand === 'list-channels') return handleAdminListChannels(interaction);
  if (subcommand === 'stats') return handleAdminStats(interaction);
  if (subcommand === 'export-csv') return handleAdminExportCsv(interaction);
  return interaction.reply({ content: 'Unknown admin command.', ephemeral: true });
}

async function handleExport(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }

  await interaction.deferReply();
  const data = await readLeaderboard();

  await interaction.editReply({
    content: 'CSV export attached.',
    files: [adminCsvAttachment(data)],
  });
}

async function handleApproveBlitz(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.channel || !('name' in interaction.channel) || !interaction.channel.name) {
    await interaction.editReply({ content: 'Run this inside the blitz deal channel you want to approve.' });
    return;
  }

  const blitzName = titleCaseBlitzName(blitzFromChannelName(interaction.channel.name));
  const result = approveDealChannel(interaction.channel, interaction.user.id, blitzName);

  await interaction.editReply({
    content: [
      result.alreadyApproved ? 'Already approved.' : 'Blitz channel approved.',
      `Channel: <#${result.channel.id}>`,
      `Leaderboard: ${blitzName}`,
      '',
      'Reps can log deals here now. Leaderboards will use this channel automatically.',
    ].join('\n'),
  });
}

async function handleUnapproveBlitz(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const removed = unapproveDealChannel(interaction.channelId);
  await interaction.editReply({
    content: removed
      ? 'This channel is no longer an approved blitz channel.'
      : 'This channel was not approved.',
  });
}

async function handleBlitzChannels(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const channels = approvedChannelsForGuild(interaction.guild);
  await interaction.editReply({
    content: channels.length
      ? ['Approved blitz channels:', ...channels.map((c) => `• <#${c.id}> — ${c.blitzName}`)].join('\n')
      : 'No approved blitz channels yet. Run /admin add-channel inside a deal channel.',
  });
}

async function handleResetWeekly(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }

  await interaction.deferReply();
  const archivePath = path.join(__dirname, 'leaderboard_archive.json');
  const tz = getTimeZone();

  let archiveEntry = null;

  await mutate(async (d) => {
    const currentWeekId = d.metadata.weekId;
    const weekLogs = filterByWeekId(activeDealLogs(d), currentWeekId);
    const { startYmd, endYmdExclusive } = getWeekWindow(new Date(), tz);

    archiveEntry = {
      archivedAt: new Date().toISOString(),
      weekId: currentWeekId,
      calendarWeek: { startYmd, endYmdExclusive, timeZone: tz },
      totalsByUser: aggregateUsers(weekLogs).map((u) => ({
        userId: u.userId,
        displayName: u.displayName,
        username: u.username,
        total: u.total,
        speeds: u.speeds,
        primaryBlitz: primaryBlitz(u),
      })),
      totalsByTeam: Object.fromEntries([...aggregateTeamWeekly(weekLogs).entries()].sort((a, b) => b[1] - a[1])),
    };

    let existing = [];
    try {
      const raw = await fs.readFile(archivePath, 'utf8');
      const parsed = JSON.parse(raw);
      existing = Array.isArray(parsed) ? parsed : [];
    } catch {
      existing = [];
    }

    existing.push(archiveEntry);
    await fs.writeFile(archivePath, JSON.stringify(existing, null, 2), 'utf8');

    d.metadata.weekId = currentWeekId + 1;
    d.weeklyArchive = Array.isArray(d.weeklyArchive) ? d.weeklyArchive : [];
    d.weeklyArchive.push({ weekId: currentWeekId, archivedAt: archiveEntry.archivedAt });

    return d;
  });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('Weekly board reset')
        .setDescription(
          [
            `Archived **week id ${archiveEntry.weekId}** to \`leaderboard_archive.json\`.`,
            `New active **week id ${archiveEntry.weekId + 1}** â€” weekly leaderboards now start from this id.`,
            '',
            '_All-time logs stay in `leaderboard.json`. Weekly views filter by `weekId`._',
          ].join('\n'),
        ),
    ],
  });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Pulse online as ${client.user.tag}`);
  try {
    startDashboard();
  } catch (err) {
    console.error('Pulse dashboard failed to start:', err.message || err);
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.webhookId) return;
    if (typeof message.content !== 'string' || !message.content.trim()) return;
    if (!message.channel || !('name' in message.channel) || !message.channel.name) return;
    if (await handleTextAdminCommand(message)) return;
    if (!isApprovedDealChannel(message.channel)) return;

    const parsed = parseDealMessage(message.content);
    if (!parsed.ok || !parsed.speeds.length) return;

    const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

    const tz = getTimeZone();
    const now = new Date();
    const channel = message.channel;
    const blitzName = approvedBlitzNameForChannel(channel) || blitzFromChannelName(channel.name);
    const displayName = member.displayName || message.author.globalName || message.author.username;
    const userId = message.author.id;
    const baseTime = now.getTime();

    const buildLogEntry = (data, speed, idx) => ({
      id: `${baseTime}_${userId}_${idx}_${Math.random().toString(16).slice(2)}`,
      userId,
      displayName,
      username: message.author.username,
      speed,
      timestamp: now.toISOString(),
      date: fmtDateInTz(now, tz),
      channelId: channel.id,
      channelName: channel.name,
      blitzName,
      weekId: data.metadata.weekId,
    });

    if (parsed.speeds.length === 1) {
      const speed = parsed.speeds[0];
      const appendResult = await appendSingleDealLog({
        userId,
        speed,
        channelId: channel.id,
        sourceMessageId: message.id,
        buildLogEntry: (data) => buildLogEntry(data, speed, 0),
        nowMs: now.getTime(),
      });

      if (appendResult.duplicateMessage) return;

      if (appendResult.possibleDuplicate) {
        const promptId = `${message.id}:${Date.now()}`;
        const promptMessage = await message.reply({
          content: 'Possible duplicate. Log it?',
          components: duplicatePromptComponents(promptId),
          allowedMentions: { parse: [] },
        });
        await handleDuplicatePrompt({
          promptMessage,
          userId,
          onNewDeal: async () => {
            const newDealResult = await appendSingleDealLog({
              userId,
              speed,
              channelId: channel.id,
              sourceMessageId: message.id,
              buildLogEntry: (data) => buildLogEntry(data, speed, 0),
              skipDuplicateCheck: true,
              nowMs: now.getTime(),
            });
            await confirmSingleDealLog({
              appendResult: newDealResult,
              channel,
              userId,
              displayName,
              blitzName,
              speeds: [speed],
              now,
              tz,
              hasCustomerOnFile: false,
              editConfirmation: (payload) => promptMessage.edit(payload),
            });
          },
        });
        return;
      }

      await confirmSingleDealLog({
        appendResult,
        channel,
        userId,
        displayName,
        blitzName,
        speeds: [speed],
        now,
        tz,
        hasCustomerOnFile: false,
        editConfirmation: (payload) =>
          message.reply({ content: payload.content, embeds: payload.embeds, allowedMentions: { parse: [] } }),
      });
      return;
    }

    const result = await appendMessageLogsBatch({
      messageId: message.id,
      userId,
      speeds: parsed.speeds,
      buildLogEntry,
    });

    if (result.duplicateMessage) return;

    const ctx = buildLogConfirmationCtx({
      userId,
      displayName,
      blitzName,
      speeds: parsed.speeds,
      dataAfter: result.data,
      dataBefore: result.dataBefore,
      tz,
      hasCustomerOnFile: false,
    });
    const content = buildPremiumDealConfirmation(ctx);
    await message.reply({ content, allowedMentions: { parse: [] } }).catch((err) => {
      console.error('Natural log reply failed:', err.message || err);
    });
    await postPhase4Gamification(channel, {
      dataBefore: result.dataBefore,
      dataAfter: result.data,
      userId,
      displayName,
      blitzName,
      channelId: channel.id,
      speeds: parsed.speeds,
      now,
      tz,
      suppressPersonalHype: true,
    });
  } catch (e) {
    console.error(e);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Pulse commands only work in a server.', ephemeral: true });
      return;
    }

    switch (interaction.commandName) {
      case 'log':
        await handleLog(interaction);
        break;
      case 'admin':
        await handleAdmin(interaction);
        break;
      case 'lb':
      case 'leaderboard':
      case 'blitz':
        await handlePhase3Leaderboard(interaction, { timeframe: 'alltime', label: 'Blitz' });
        break;
      case 'daily':
        await handlePhase3Leaderboard(interaction, { timeframe: 'daily', label: 'Daily' });
        break;
      case 'weekly':
        await handlePhase3Leaderboard(interaction, { timeframe: 'weekly', label: 'Weekly' });
        break;
      case 'master':
        await handlePhase3Master(interaction);
        break;
      case 'mydeals':
        await handlePhase3MyDeals(interaction);
        break;
      case 'share':
        await handleShare(interaction);
        break;
      case 'remove-last':
        await handleUndo(interaction);
        break;
      case 'correction':
        await handleCorrection(interaction);
        break;
      case 'reset-weekly':
        await handleResetWeekly(interaction);
        break;
      default:
        break;
    }
  } catch (e) {
    console.error(e);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: 'Pulse hit an error.', embeds: [] }).catch(async () => {
          await interaction.followUp({ content: 'Pulse hit an error.', ephemeral: true }).catch(() => {});
        });
      } else if (interaction.replied) {
        await interaction.followUp({ content: 'Pulse hit an error.', ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: 'Pulse hit an error.', ephemeral: true }).catch(() => {});
      }
    } catch (_) {
      /* ignore */
    }
  }
});

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

client.login(token);
