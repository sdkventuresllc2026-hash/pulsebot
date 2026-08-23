/**
 * Pulse — discord.js v14 bot (slash commands, local JSON DB)
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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require('discord.js');

const { SPEEDS, SPEED_LABELS, COLORS, GAMIFICATION_CONFIG, SLASH_HINTS, PULSE_BUILD } = require('./constants');

/** customId for the self-service real-name button + modal (see the interaction handler). */
const SET_NAME_ID = 'pulse:setname';

// Channel names are looked up by name in a few places. Centralised so a rename is one edit, and
// so the reliability audit has a single place to point at (R3). Overridable per deployment.
const WELCOME_CHANNEL = (process.env.WELCOME_CHANNEL || 'welcome').trim();
const MANAGEMENT_CHANNEL = (process.env.MANAGEMENT_CHANNEL || 'management').trim();

/** The Set-My-Name button, attached directly to whatever message needs it. */
function setNameRow() {
  const { ActionRowBuilder: Row, ButtonBuilder: Btn, ButtonStyle: Style } = require('discord.js');
  return new Row().addComponents(
    new Btn().setCustomId(SET_NAME_ID).setLabel('Set My Name').setEmoji('✍️').setStyle(Style.Primary),
  );
}

/** Post to the manager review queue. Never throws — a failed notice must not break onboarding. */
async function notifyManagement(guild, content) {
  try {
    const ch = guild?.channels?.cache?.find((c) => c.name === MANAGEMENT_CHANNEL && c.isTextBased?.());
    if (!ch) return false;
    await ch.send({ content, allowedMentions: { parse: [] } });
    return true;
  } catch (err) {
    console.error('[Pulse] notifyManagement failed:', err.message || err);
    return false;
  }
}
const {
  DATA_PATH,
  readLeaderboard,
  CORRUPT_CODE,
  mutate,
  appendSingleDealLog,
  appendMessageLogsBatch,
  backfillLogMarketTags,
} = require('./storage');
const { parseDealMessage, detectTextLogIntent, isQuickNaturalLog } = require('./deal-parser');
const { parseLeaderboardTextIntent, parseTextCommandIntent } = require('./leaderboard-text');
const {
  isApprovedDealChannel,
  resolveDealChannel,
  ensureDealChannelRegistered,
  isApprovedDealChannelId,
  channelNameMatchesDealRules,
  getApprovedChannelRules,
  listApprovedDealChannels,
  approveDealChannel,
  unapproveDealChannel,
  addMarket,
  updateMarket,
  listMarkets,
  marketForChannel,
  connectChannelToMarket,
  removeChannelFromMarket,
  inferMarketForLog,
  approvedBlitzNameForChannel,
  channelApprovalDiagnostics,
  normalizeMarketId,
  isStoreCorrupt,
  ensureDefaultMarkets,
  deleteMarket,
  renameMarket,
  APPROVED_CHANNELS_PATH,
} = require('./deal-channels');
const { buildMarketAutocompleteChoices } = require('./market-autocomplete');
const {
  buildChannelAutocompleteChoices,
  resolveGuildTextChannel,
} = require('./channel-picker');
const { acquireProcessLock } = require('./process-lock');
const {
  buildPremiumDealConfirmation,
  SPEED_DISPLAY,
  buildDealHypeLine,
  selectHypeLine,
  PERSONAL_EVENTS,
  hypeTextsSimilar,
} = require('./premium-confirmation');
const {
  formatQuarterHeader,
  formatQuarterStatus,
  getSalesQuarter,
} = require('./day-quarters');
const {
  applyMarketChannelLock,
  assignRepToMarket,
  unassignRepFromMarkets,
  syncAllMarketChannelPermissions,
  ensureMarketRole,
  deleteMarketRole,
} = require('./market-access');
const {
  formatPhase3SpeedBreakdown,
  formatPhase3Leaderboard,
  formatPhase3Master,
  formatLeaderboard,
  resolveDateContext,
} = require('./leaderboard-format');
const { compactJoin } = require('./message-format');
const {
  ensureGamificationState,
  rememberLineId,
  markMilestoneOnce,
  deriveLeaderboardMovement,
  buildLeaderboardContext,
} = require('./gamification-engine');
const { postTfiberDiscordProof } = require('./fiberSalesOsClient');
const {
  requiresTfiberProof,
  extractDiscordAttachments,
  hasScreenshotAttachment,
  buildTfiberProofPayload,
  buildTfiberDmPayload,
  formatTfiberProofLine,
  extractTmoOrderId,
} = require('./tfiber-proof');
const {
  DEFAULT_WINDOW_MS: TFIBER_CHANNEL_PROOF_WINDOW_MS,
  createTfiberProofBuffer,
  messageWithBufferedProof,
} = require('./tfiber-proof-buffer');
const {
  enrichTfiberProofPayload,
} = require('./tfiber-proof-extraction');
const {
  recordTfiberProofAttempt,
  markTfiberProofResolved,
  selectPendingForUser,
  selectRecentTfiberProofLog,
  collectDueTfiberProofActions,
} = require('./tfiber-proof-store');
const {
  createTimestampedBackup,
  appendActionLog,
  collectStartupHealth,
  formatHealthReport,
  buildAdminStatusSnapshot,
  runStartupMaintenance,
} = require('./ops-safety');
const {
  getTimeZone,
  filterToday,
  filterByWeekId,
  filterWeeklyByCalendarWeek,
  filterByCalendarMonth,
  filterYesterday,
  filterPreviousWeek,
  filterPreviousMonth,
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

/** Prevent double replies (messageCreate twice, slash + text, or second bot token). */
const recentLogReplies = new Set();
const logReplyClaims = new Set();

/** Only dedupe the same Discord message/interaction — not repeat speeds (reps catch up in bursts). */
function logReplyKeys({ messageId, interactionId }) {
  const keys = [];
  if (messageId) keys.push(`msg:${messageId}`);
  if (interactionId) keys.push(`int:${interactionId}`);
  return keys;
}

function tryClaimLogReply(keys) {
  if (!keys.length) return true;
  if (keys.some((k) => logReplyClaims.has(k))) return false;
  for (const k of keys) {
    logReplyClaims.add(k);
    setTimeout(() => logReplyClaims.delete(k), 180_000);
  }
  return true;
}

const tfiberChannelProofBuffer = createTfiberProofBuffer();

function channelNeedsTfiberProofContext(channel, marketIdentity = null, blitzName = null) {
  const identity = marketIdentity || marketIdentityForChannel(channel);
  return requiresTfiberProof({
    speeds: ['1gig'],
    channelName: channel?.name,
    blitzName,
    marketName: identity?.marketName,
    marketId: identity?.marketId,
  });
}

function rememberTfiberChannelScreenshot(message, channel) {
  const attachments = extractDiscordAttachments(message).filter((att) => att.isScreenshot);
  if (!attachments.length) return null;
  return tfiberChannelProofBuffer.remember({
    messageId: message.id,
    userId: message.author.id,
    channelId: channel.id,
    createdTimestamp: message.createdTimestamp,
    content: message.content || '',
    attachments,
  });
}

function proofMessageForTfiberLog(message, channel) {
  if (hasScreenshotAttachment(message)) return message;
  const selection = tfiberChannelProofBuffer.consume({
    userId: message.author.id,
    channelId: channel.id,
    nowMs: message.createdTimestamp || Date.now(),
    excludeMessageId: message.id,
  });
  if (!selection.entry) return message;
  return messageWithBufferedProof(message, selection.entry);
}
const adminIds = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Read through the validated config layer, never process.env directly. A null here means
// 'refuse', never 'skip the tier' — skipping is what erased manager access from every market.
const pulseConfig = require('./pulse-config');
const { authorizeMarketCommand, auditLine, assessScopeReadiness } = require('./command-policy');
const marketAssignments = require('./market-assignments');

function isAdmin(userId) {
  return adminIds.includes(userId);
}

function canUseAdminCommands(interaction) {
  if (isAdmin(interaction.user.id)) return true;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  const mgrRole = pulseConfig.managerRoleId();
  if (mgrRole && interaction.member?.roles?.cache?.has(mgrRole)) return true;
  return false;
}

/**
 * Owner tier — deliberately does NOT accept the manager role.
 *
 * Everything a manager needs day to day (markets, channels, rep assignment) goes through
 * canUseAdminCommands. These two are different in kind: /reset-weekly archives the competition
 * week for EVERY market at once, and the CSV export dumps every rep's full deal history. Owner
 * decision 2026-07-28: managers get the day-to-day commands, not these.
 */
function canUseOwnerCommands(interaction) {
  if (isAdmin(interaction.user.id)) return true;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  return false;
}

function marketAccessOpts() {
  return { managerRoleId: pulseConfig.managerRoleId() || undefined };
}

function canUseAdminMember(userId, member) {
  if (isAdmin(userId)) return true;
  if (member?.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  const mgrRole2 = pulseConfig.managerRoleId();
  if (mgrRole2 && member?.roles?.cache?.has(mgrRole2)) return true;
  return false;
}

async function denyAdmin(interaction) {
  if (interaction.deferred || interaction.replied) return;
  await interaction.reply({ content: 'Permission denied. Administrators only.', ephemeral: true });
}

async function safeDeferEphemeral(interaction) {
  if (interaction.deferred || interaction.replied) return false;
  await interaction.deferReply({ ephemeral: true });
  return true;
}

async function safeAppendActionLog(entry) {
  try {
    await appendActionLog(entry);
  } catch (err) {
    console.error('[Pulse][ActionLogError]', err.message || err);
  }
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

function dealChannelHint(guild) {
  const channels = listApprovedDealChannels();
  const listed = channels
    .slice(0, 6)
    .map((c) => (guild?.channels?.cache?.has(c.id) ? `<#${c.id}>` : `#${c.name}`))
    .join(', ');
  const markets = listMarkets();
  if (markets.length) {
    return markets.map((m) => `**${m.marketName}** (\`#${m.marketId}\` or \`#${m.marketId}-deals\`)`).join(' · ');
  }
  return '**virginia** / **greenville** (or `virginia-deals`, `greenville-deals`)';
}

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

function marketIdentityForChannel(channel) {
  const market = marketForChannel(channel);
  if (market) {
    return {
      marketId: market.marketId,
      marketName: market.marketName,
      assigned: true,
    };
  }
  return {
    marketId: null,
    marketName: 'Unassigned',
    assigned: false,
  };
}

function inferMarketIdentityForLog(log) {
  return inferMarketForLog(log);
}

function logsForCurrentMarketChannel(logs, channel) {
  const market = marketForChannel(channel);
  if (market) {
    return logs.filter((log) => inferMarketIdentityForLog(log).marketId === market.marketId);
  }
  const blitzName = approvedBlitzNameForChannel(channel) || blitzFromChannelName(channel?.name);
  return logs.filter((log) => {
    if (log.channelId && channel?.id && log.channelId === channel.id) return true;
    return titleCaseBlitzName(log.blitzName || log.channelName) === titleCaseBlitzName(blitzName);
  });
}

function logsForCurrentMarket(logs, interaction) {
  return logsForCurrentMarketChannel(logs, interaction.channel);
}

function aggregateMarkets(logs) {
  const byMarket = new Map();
  for (const log of logs) {
    const market = inferMarketIdentityForLog(log);
    const key = market.marketId || 'unassigned';
    if (!byMarket.has(key)) {
      byMarket.set(key, {
        marketId: market.marketId,
        marketName: market.marketName,
        total: 0,
      });
    }
    byMarket.get(key).total += 1;
  }
  return [...byMarket.values()].sort((a, b) => b.total - a.total || a.marketName.localeCompare(b.marketName));
}

function isPhase3ApprovedChannel(interaction) {
  return isApprovedDealChannel(interaction.channel);
}

async function replyOutsideBlitz(interaction) {
  const chName = interaction.channel?.name || 'this channel';
  await interaction.reply({
    content: compactJoin([
      `**#${chName}** is not a deal-log channel.`,
      `Use leaderboard commands in ${dealChannelHint(interaction.guild)}.`,
    ]),
    ephemeral: true,
  });
}

function logChannelRejectionDiagnostics(source, channel, actorId) {
  const diag = channelApprovalDiagnostics(channel);
  console.warn(
    '[Pulse][ChannelRejected]',
    JSON.stringify({
      source,
      actorId,
      channelId: diag.channelId,
      channelName: diag.channelName,
      idApproved: diag.idApproved,
      idDisabled: diag.idDisabled,
      matchedByName: diag.matchedByName,
      nameSubstringFallbackEnabled: diag.nameSubstringFallbackEnabled,
      matchedNameSubstrings: diag.matchedNameSubstrings,
      approvedChannels: diag.approvedChannels,
      envControls: diag.envControls,
      controlFiles: {
        dataPath: DATA_PATH,
        approvedChannelsPath: APPROVED_CHANNELS_PATH,
      },
    }),
  );
}

async function backupAndLogAction({
  action,
  actorId,
  actorName,
  targetFilePath,
  details = {},
}) {
  let backup = {
    ok: false,
    reason: 'backup_not_attempted',
    sourcePath: targetFilePath,
    backupPath: null,
  };
  try {
    backup = await createTimestampedBackup(targetFilePath, action);
  } catch (err) {
    backup = {
      ok: false,
      reason: 'backup_error',
      sourcePath: targetFilePath,
      backupPath: null,
    };
    console.error(`[Pulse][BackupError] ${action}:`, err.message || err);
  }
  await safeAppendActionLog({
    action,
    actorId,
    actorName: actorName || 'Unknown',
    backup: backup.ok ? backup.backupPath : null,
    backupStatus: backup.ok ? 'created' : backup.reason,
    details,
  });
  if (!backup.ok) {
    console.warn(`[Pulse][BackupWarning] ${action} backup skipped: ${backup.reason}`);
  }
  return backup;
}

function logMatchesCurrentBlitz(log, interaction) {
  const channel = interaction.channel;
  const blitzName = currentBlitzName(interaction);
  if (log.channelId && channel?.id && log.channelId === channel.id) return true;
  return titleCaseBlitzName(log.blitzName || log.channelName) === titleCaseBlitzName(blitzName);
}

function filterPhase3Timeframe(logs, timeframe, data) {
  if (timeframe === 'daily') return filterToday(logs, getTimeZone());
  if (timeframe === 'yesterday') return filterYesterday(logs, getTimeZone());
  if (timeframe === 'weekly') return filterWeeklyByCalendarWeek(logs, getTimeZone());
  if (timeframe === 'lastweek') return filterPreviousWeek(logs, getTimeZone());
  if (timeframe === 'monthly') return filterByCalendarMonth(logs, getTimeZone());
  if (timeframe === 'lastmonth') return filterPreviousMonth(logs, getTimeZone());
  return logs;
}

const LEADERBOARD_PERIOD_LABELS = {
  daily: 'Today',
  yesterday: 'Yesterday',
  weekly: 'This Week',
  lastweek: 'Last Week',
  monthly: 'This Month',
  lastmonth: 'Last Month',
  alltime: 'All-Time',
};

function phase3PeriodLabel(timeframe) {
  return LEADERBOARD_PERIOD_LABELS[timeframe] || 'All-Time';
}

function speedCountsForLogs(logs) {
  const speeds = {};
  for (const log of logs) {
    speeds[log.speed] = (speeds[log.speed] || 0) + 1;
  }
  return speeds;
}

function phase3Rows(logs) {
  const byUser = new Map();

  for (const log of logs) {
    if (!byUser.has(log.userId)) {
      byUser.set(log.userId, {
        userId: log.userId,
        displayName: log.displayName || log.username || 'Unknown Rep',
        username: log.username || '',
        total: 0,
        firstLoggedAt: log.timestamp || '',
        speeds: {},
        blitzCounts: {},
        marketCounts: {},
      });
    }

    const row = byUser.get(log.userId);
    row.total += 1;
    row.speeds[log.speed] = (row.speeds[log.speed] || 0) + 1;
    if (!row.firstLoggedAt || String(log.timestamp || '').localeCompare(String(row.firstLoggedAt)) < 0) {
      row.firstLoggedAt = log.timestamp || row.firstLoggedAt;
    }

    const blitzName = titleCaseBlitzName(log.blitzName || log.channelName);
    row.blitzCounts[blitzName] = (row.blitzCounts[blitzName] || 0) + 1;
    const marketName = inferMarketIdentityForLog(log).marketName || 'Unassigned';
    row.marketCounts[marketName] = (row.marketCounts[marketName] || 0) + 1;
    row.market = Object.entries(row.marketCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || marketName;
    row.displayName = log.displayName || row.displayName;
    row.username = log.username || row.username;
  }

  return [...byUser.values()].sort(
    (a, b) =>
      b.total - a.total ||
      String(a.firstLoggedAt || '').localeCompare(String(b.firstLoggedAt || '')) ||
      String(a.displayName || '').localeCompare(String(b.displayName || ''), undefined, { sensitivity: 'base' }),
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

function competitionRankForUser(rows, userId) {
  return withCompetitionRanks(rows).find((row) => row.userId === userId)?.rank || null;
}

async function handlePhase3Leaderboard(interaction, { timeframe, label }) {
  if (!isPhase3ApprovedChannel(interaction)) {
    logChannelRejectionDiagnostics(`/${interaction.commandName}`, interaction.channel, interaction.user.id);
    await replyOutsideBlitz(interaction);
    return;
  }

  await interaction.deferReply();
  const data = await readLeaderboard();
  const allLogs = approvedDealLogs(activeDealLogs(data));
  const scopedLogs = logsForCurrentMarket(allLogs, interaction);
  const logs = filterPhase3Timeframe(scopedLogs, timeframe, data);
  const market = marketForChannel(interaction.channel);
  const heading = market?.marketName || titleCaseBlitzName(currentBlitzName(interaction));
  const hour = localHour(new Date(), getTimeZone());
  const showQuarter = timeframe === 'daily';

  await interaction.editReply({
    content: formatPhase3Leaderboard({
      title: `${heading} · ${label}`,
      rows: phase3Rows(logs),
      totalDeals: logs.length,
      dateHeader: resolveDateContext(timeframe, new Date(), getTimeZone()),
      quarterHeader: showQuarter ? formatQuarterHeader(hour) : null,
    }),
    embeds: [],
  });
}

async function handlePhase3Master(interaction, period = 'alltime') {
  if (!isPhase3ApprovedChannel(interaction)) {
    logChannelRejectionDiagnostics(`/${interaction.commandName}`, interaction.channel, interaction.user.id);
    await replyOutsideBlitz(interaction);
    return;
  }

  const periodMap = {
    week: 'weekly', weekly: 'weekly',
    month: 'monthly', monthly: 'monthly',
    'last-week': 'lastweek', lastweek: 'lastweek',
    'last-month': 'lastmonth', lastmonth: 'lastmonth',
    daily: 'daily', today: 'daily',
    yesterday: 'yesterday',
    alltime: 'alltime',
  };
  const timeframe = periodMap[period] || period || 'alltime';

  await interaction.deferReply();
  const data = await readLeaderboard();
  const allLogs = approvedDealLogs(activeDealLogs(data));
  const logs = filterPhase3Timeframe(allLogs, timeframe, data);
  const hour = localHour(new Date(), getTimeZone());
  const showQuarter = timeframe === 'daily';

  await interaction.editReply({
    content: formatPhase3Master(
      phase3Rows(logs),
      logs.length,
      phase3PeriodLabel(timeframe),
      showQuarter ? formatQuarterHeader(hour) : null,
      resolveDateContext(timeframe, new Date(), getTimeZone()),
    ),
    embeds: [],
  });
}

async function handleQuarter(interaction) {
  await interaction.deferReply();
  const hour = localHour(new Date(), getTimeZone());
  await interaction.editReply({
    content: formatQuarterStatus(hour),
    embeds: [],
  });
}

function buildMarketsBoardContent(data) {
  const logs = approvedDealLogs(activeDealLogs(data));
  const today = filterToday(logs, getTimeZone());
  const week = filterByWeekId(logs, data.metadata.weekId);
  const todayRows = aggregateMarkets(today);
  const weekRows = aggregateMarkets(week);
  const weekMap = new Map(weekRows.map((r) => [r.marketId || `name:${r.marketName}`, r]));
  const todayMap = new Map(todayRows.map((r) => [r.marketId || `name:${r.marketName}`, r]));
  const keys = new Set([...weekMap.keys(), ...todayMap.keys()]);
  const rows = [...keys]
    .map((k) => {
      const w = weekMap.get(k);
      const t = todayMap.get(k);
      return {
        marketName: w?.marketName || t?.marketName || 'Unassigned',
        week: w?.total || 0,
        today: t?.total || 0,
      };
    })
    .sort((a, b) => b.week - a.week || b.today - a.today || a.marketName.localeCompare(b.marketName));

  const lines = ['🗺️ **Market Board**'];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
    lines.push(`${medal} **${r.marketName}** · **${r.week}** week · **${r.today}** today`);
  }
  if (!rows.length) lines.push('_No deals logged this week yet._');
  lines.push(`**Company-wide** · **${week.length}** week · **${today.length}** today`);
  return compactJoin(lines);
}

function buildMyDealsContent(channel, userId, data, displayName) {
  const allLogs = approvedDealLogs(activeDealLogs(data));
  const userLogs = allLogs.filter((log) => log.userId === userId);
  const marketLogs = logsForCurrentMarketChannel(allLogs, channel);
  const userMarketLogs = marketLogs.filter((log) => log.userId === userId);
  const todayUserLogs = filterPhase3Timeframe(userLogs, 'daily', data);
  const weekUserLogs = filterPhase3Timeframe(userLogs, 'weekly', data);
  const marketRank = competitionRankForUser(phase3Rows(marketLogs), userId);
  const overallRank = competitionRankForUser(phase3Rows(allLogs), userId);
  const market = marketForChannel(channel);
  const marketName = market?.marketName || titleCaseBlitzName(approvedBlitzNameForChannel(channel) || blitzFromChannelName(channel?.name));
  const speedMix = formatPhase3SpeedBreakdown(speedCountsForLogs(userMarketLogs));

  return compactJoin([
    `📊 **Your Deals**${displayName ? ` — ${displayName}` : ''}`,
    `Today **${todayUserLogs.length}** · Week **${weekUserLogs.length}** · ${marketName} **${userMarketLogs.length}** · All-time **${userLogs.length}**`,
    speedMix === '-' ? null : `Mix · ${speedMix}`,
    marketRank
      ? `🏅 **#${marketRank}** in ${marketName}${overallRank ? ` · **#${overallRank}** overall` : ''}`
      : `_No rank in ${marketName} yet — log a deal to get on the board._`,
  ]);
}

async function buildTextLeaderboardContent(channel, intent, data) {
  if (intent.cmd === 'master') {
    const period = intent.period || 'alltime';
    const timeframe = period === 'week' ? 'weekly' : period;
    const allLogs = approvedDealLogs(activeDealLogs(data));
    const logs = filterPhase3Timeframe(allLogs, timeframe, data);
    return formatLeaderboard({
      scope: 'master',
      period: timeframe,
      rows: phase3Rows(logs),
      total: logs.length,
      dateContext: resolveDateContext(timeframe, new Date(), getTimeZone()),
      quarterLine: timeframe === 'daily' ? formatQuarterHeader(localHour(new Date(), getTimeZone())) : null,
    });
  }

  if (intent.cmd === 'blitz') {
    const timeframe = intent.timeframe || 'daily';
    const allLogs = approvedDealLogs(activeDealLogs(data));
    const dealCh = resolveDealChannel(channel) || channel;
    const scopedLogs = logsForCurrentMarketChannel(allLogs, dealCh);
    const logs = filterPhase3Timeframe(scopedLogs, timeframe, data);
    const market = marketForChannel(dealCh);
    const heading =
      market?.marketName ||
      titleCaseBlitzName(approvedBlitzNameForChannel(dealCh) || blitzFromChannelName(dealCh?.name));
    return formatLeaderboard({
      scope: 'market',
      period: timeframe,
      rows: phase3Rows(logs),
      total: logs.length,
      market: heading,
      dateContext: resolveDateContext(timeframe, new Date(), getTimeZone()),
      quarterLine: timeframe === 'daily' ? formatQuarterHeader(localHour(new Date(), getTimeZone())) : null,
    });
  }

  return null;
}

async function resolveDealChannelForMessage(message) {
  let ch = message.channel;
  if (!ch) return null;
  if (ch.partial) {
    ch = await ch.fetch().catch(() => ch);
  }
  if (typeof ch.isThread === 'function' && ch.isThread()) {
    if (ch.parent) return ch.parent;
    if (ch.parentId && message.guild) {
      const cached = message.guild.channels.cache.get(ch.parentId);
      if (cached) return cached;
      const fetched = await message.guild.channels.fetch(ch.parentId).catch(() => null);
      if (fetched) return fetched;
    }
  }
  return resolveDealChannel(ch) || ch;
}

function messageChannelIsDealApproved(message, dealChannel) {
  const reg = ensureDealChannelRegistered(dealChannel || message.channel, message.author.id);
  if (reg.ok) return true;
  if (isApprovedDealChannel(dealChannel || message.channel)) return true;
  if (isApprovedDealChannelId(message.channel?.id)) return true;
  if (isApprovedDealChannelId(message.channel?.parentId)) return true;
  if (isApprovedDealChannelId(dealChannel?.id)) return true;
  return false;
}

/** Plain-text twins of /mydeals, /remove-last, /markets and /quarter. */
async function handleTextCommand(message, intent) {
  const reply = (content) => message.reply({ content, allowedMentions: { parse: [] } }).catch(() => {});
  try {
    if (intent.cmd === 'mydeals') {
      const data = await readLeaderboard();
      return reply(buildMyDealsContent(message.channel, message.author.id, data, message.member?.displayName || message.author.username));
    }
    if (intent.cmd === 'markets') {
      const data = await readLeaderboard();
      return reply(buildMarketsBoardContent(data));
    }
    if (intent.cmd === 'quarter') {
      return reply(formatQuarterStatus(localHour(new Date(), getTimeZone())));
    }
    if (intent.cmd === 'undo') {
      const removed = await removeLastDealForUser(
        message.author.id,
        message.member?.displayName || message.author.username,
        'text:undo',
      );
      if (!removed) return reply('Nothing to undo.');
      await safeAppendActionLog({
        action: 'remove-last.completed',
        actorId: message.author.id,
        actorName: message.member?.displayName || message.author.username,
        details: { removedLogId: removed.id, removedSpeed: removed.correctedSpeed || removed.speed, removedTimestamp: removed.timestamp, channelId: removed.channelId || null, via: 'text' },
      });
      return reply(`↩️ **Undone** — removed your last log · ${SPEED_DISPLAY[removed.correctedSpeed || removed.speed] || removed.speed}`);
    }
  } catch (err) {
    console.error('[Pulse] Text command failed:', err.message || err);
    return reply('That did not work. Try again in a moment.');
  }
  return undefined;
}

async function handleTextLeaderboard(message, intent) {
  const started = Date.now();
  const resolvedCmd =
    intent.cmd === 'master' ? `master_${intent.period || 'alltime'}` : intent.timeframe || 'daily';
  const dealChannel = await resolveDealChannelForMessage(message);
  if (intent.cmd !== 'master' && !messageChannelIsDealApproved(message, dealChannel)) {
    const chName = message.channel?.name || 'this channel';
    const mapped = marketForChannel(dealChannel || message.channel);
    console.warn(
      '[Pulse] Text leaderboard rejected',
      JSON.stringify({
        channelId: message.channel?.id,
        parentId: message.channel?.parentId,
        dealChannelId: dealChannel?.id,
        channelName: message.channel?.name,
        mappedMarket: mapped?.marketId || null,
      }),
    );
    await message
      .channel.send({
        content: compactJoin([
          `**#${chName}** is not a deal-log channel.`,
          mapped
            ? `Market **${mapped.marketName}** is configured — try \`!lb\` again (channel link was refreshed).`
            : `Use a channel named for a market (e.g. ${dealChannelHint(message.guild)}) or \`/admin add-channel\` here.`,
          'Keywords: `!lb` `!daily` `!weekly` `!master weekly`.',
        ]),
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
    return;
  }

  try {
    const data = await readLeaderboard();
    const content = await buildTextLeaderboardContent(dealChannel || message.channel, intent, data);
    if (!content) return;
    const sent = await message.channel.send({ content, allowedMentions: { parse: [] } }).catch((err) => {
      console.error('[Pulse] Text leaderboard send failed:', err.stack || err.message || err);
      return null;
    });
    if (!sent) return;
    await message.delete().catch(() => {});
    const rows = content
      .split('\n')
      .filter((line) => line.startsWith('🥇') || line.startsWith('🥈') || line.startsWith('🥉') || /^#\d+ /.test(line))
      .length;
    const totalMatch = content.match(/· (\d+) deals$/m);
    const market = intent.cmd === 'master' ? '__master__' : marketForChannel(dealChannel || message.channel)?.marketName || '__unmapped__';
    console.info(
      `[leaderboard] cmd=${resolvedCmd} market=${market} user=${message.author.username} channel=${message.channel?.id} ms=${Date.now() - started} rows=${rows} total=${totalMatch ? totalMatch[1] : 0}`,
    );
  } catch (err) {
    console.error(
      `[leaderboard] cmd=${resolvedCmd} market=${intent.cmd === 'master' ? '__master__' : '__unknown__'} user=${message.author.username} channel=${message.channel?.id} ms=${Date.now() - started} rows=0 total=0`,
      err.stack || err.message || err,
    );
    await message.channel.send({ content: "Couldn't load that leaderboard. Try again in a moment." }).catch(() => {});
  }
}

async function handlePhase3MyDeals(interaction) {
  if (!isPhase3ApprovedChannel(interaction)) {
    logChannelRejectionDiagnostics(`/${interaction.commandName}`, interaction.channel, interaction.user.id);
    await replyOutsideBlitz(interaction);
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const data = await readLeaderboard();
  const displayName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  await interaction.editReply({
    content: buildMyDealsContent(interaction.channel, interaction.user.id, data, displayName),
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
    rowsTodayBefore,
    rowsTodayAfter,
    hasCustomerOnFile: !!hasCustomerOnFile,
  };
}

function mostRecentUserLog(data, userId) {
  const logs = activeDealLogs(data).filter((l) => l.userId === userId);
  if (!logs.length) return null;
  return logs.reduce((latest, current) =>
    String(current.timestamp || '').localeCompare(String(latest.timestamp || '')) > 0 ? current : latest,
  );
}

function selectPrimaryDealLine({ ctx, dataBefore, dataAfter, now, tz }) {
  try {
    const game = ensureGamificationState(dataAfter);
    const recentLineIds = game.recentLineIds || [];
    const userId = ctx.userId;
    const displayName = ctx.displayName;
    const dealAllBefore = activeDealLogs(dataBefore).filter((l) => l.userId === userId).length;
    const dealAllAfter = activeDealLogs(dataAfter).filter((l) => l.userId === userId).length;
    const bestBefore = bestDayEver(activeDealLogs(dataBefore), userId);
    const movement = deriveLeaderboardMovement({
      beforeRows: ctx.rowsTodayBefore || [],
      afterRows: ctx.rowsTodayAfter || [],
      userId,
    });
    const lastBefore = mostRecentUserLog(dataBefore, userId);
    const quietMs = GAMIFICATION_CONFIG.quietHoursForComeback * 60 * 60 * 1000;
    const comeback =
      lastBefore && Number.isFinite(Date.parse(lastBefore.timestamp))
        ? now.getTime() - Date.parse(lastBefore.timestamp) >= quietMs
        : false;
    const hour = localHour(now, tz);

    const eventOrder = [];
    if (dealAllBefore === 0 && dealAllAfter > 0) eventOrder.push('first_ever');
    if (ctx.dealsTodayBefore === 0 && ctx.dealsTodayAfter > 0) eventOrder.push('first_today');
    if (ctx.dealsTodayAfter === 2) eventOrder.push('second_today');
    if (ctx.dealsTodayAfter === 3) eventOrder.push('hat_trick');
    if (ctx.dealsTodayAfter === 5) eventOrder.push('five_day');
    if (ctx.dealsTodayAfter === 10) eventOrder.push('ten_day');
    if (ctx.dealsTodayAfter > bestBefore) eventOrder.push('personal_best');
    if (comeback) eventOrder.push('comeback');
    if (movement.tookFirst) eventOrder.push('took_first');
    if (movement.enteredTop3) eventOrder.push('entered_top3');
    if (movement.passedRepName) eventOrder.push('passed_rep');
    if (movement.oneAwayFromFirst) eventOrder.push('one_away_first');
    if (hour >= GAMIFICATION_CONFIG.lateHourCutoff) eventOrder.push('late_night');
    if (hour <= GAMIFICATION_CONFIG.earlyHourCutoff) eventOrder.push('early_morning');
    eventOrder.push(getSalesQuarter(hour));
    eventOrder.push('fallback');

    for (const event of eventOrder) {
      const picked = selectHypeLine({
        event,
        recentLineIds,
        values: {
          rep: displayName,
          otherRep: movement.passedRepName || '',
          count: ctx.dealsTodayAfter,
          team: ctx.blitzName,
        },
      });
      if (picked?.text) return { ...picked, event };
    }
  } catch (err) {
    console.error('Primary hype selection failed:', err.message || err);
  }
  return null;
}

const REP_DAILY_MILESTONES = GAMIFICATION_CONFIG.dailyRepMilestones;
const REP_WEEKLY_MILESTONES = GAMIFICATION_CONFIG.weeklyRepMilestones;
const REP_ALLTIME_MILESTONES = GAMIFICATION_CONFIG.allTimeRepMilestones;
const TEAM_DAILY_MILESTONES = GAMIFICATION_CONFIG.teamDailyMilestones;
const TEAM_WEEKLY_MILESTONES = GAMIFICATION_CONFIG.teamWeeklyMilestones;

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

function weeklyUserCount(data, userId, weekId) {
  return activeDealLogs(data).filter((log) => log.userId === userId && log.weekId === weekId).length;
}

function allTimeUserCount(data, userId) {
  return activeDealLogs(data).filter((log) => log.userId === userId).length;
}

function weeklyTeamCount(data, blitzCtx, weekId) {
  return activeDealLogs(data).filter((log) => log.weekId === weekId && logMatchesBlitzContext(log, blitzCtx)).length;
}

function rememberLine(game, picked) {
  if (picked?.id) rememberLineId(game, picked.id);
}

function pickEventLine(game, event, values) {
  const picked = selectHypeLine({
    event,
    values,
    recentLineIds: game.recentLineIds || [],
  });
  if (!picked) return null;
  rememberLine(game, picked);
  return picked.text;
}

function eventFromMilestoneCount(count) {
  if (count >= 10) return 'ten_day';
  if (count >= 5) return 'five_day';
  if (count >= 3) return 'hat_trick';
  if (count === 2) return 'second_today';
  return 'first_today';
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
  primaryLineId = null,
  primaryEvent = null,
  suppressPersonalHype = false,
  confirmationHype = null,
}) {
  const date = fmtDateInTz(now, tz);
  const blitz = titleCaseBlitzName(blitzName);
  const blitzCtx = { channelId, blitzName };
  const messages = new Set();
  const nowHour = localHour(now, tz);
  const weekId = dataAfter.metadata.weekId;
  const skipPersonal = suppressPersonalHype || !!primaryLineId || !!confirmationHype;
  const skipEvent = (event) => skipPersonal && (event === primaryEvent || PERSONAL_EVENTS.has(event));

  const userBefore = dailyUserCount(dataBefore, date, userId);
  const userAfter = dailyUserCount(dataAfter, date, userId);
  const userWeekBefore = weeklyUserCount(dataBefore, userId, weekId);
  const userWeekAfter = weeklyUserCount(dataAfter, userId, weekId);
  const userAllBefore = allTimeUserCount(dataBefore, userId);
  const userAllAfter = allTimeUserCount(dataAfter, userId);
  const teamDailyBefore = dailyBlitzLogs(dataBefore, date, blitzCtx).length;
  const teamDailyAfter = dailyBlitzLogs(dataAfter, date, blitzCtx).length;
  const teamWeekBefore = weeklyTeamCount(dataBefore, blitzCtx, weekId);
  const teamWeekAfter = weeklyTeamCount(dataAfter, blitzCtx, weekId);

  const beforeRows = phase3Rows(dailyBlitzLogs(dataBefore, date, blitzCtx));
  const afterRows = phase3Rows(dailyBlitzLogs(dataAfter, date, blitzCtx));
  const movement = deriveLeaderboardMovement({ beforeRows, afterRows, userId });

  await mutate(async (data) => {
    const game = ensureGamificationState(data);
    if (primaryLineId) rememberLineId(game, primaryLineId);

    for (const count of REP_DAILY_MILESTONES) {
      if (userBefore < count && userAfter >= count) {
        const key = milestoneKey(date, 'rep.daily', userId, count);
        if (!markMilestoneOnce(game.dailyMilestones, key)) continue;
        if (!skipPersonal) {
          const event = count >= 10 ? 'ten_day' : count >= 5 ? 'five_day' : count >= 3 ? 'hat_trick' : count === 2 ? 'second_today' : 'first_today';
          const line = pickEventLine(game, event, { rep: displayName, count });
          if (line) messages.add(line);
        }
      }
    }

    for (const count of REP_WEEKLY_MILESTONES) {
      if (userWeekBefore < count && userWeekAfter >= count) {
        const key = milestoneKey(String(weekId), 'rep.weekly', userId, count);
        if (!markMilestoneOnce(game.weeklyMilestones, key)) continue;
        if (!skipEvent('weekly_milestone')) {
          const line = pickEventLine(game, 'weekly_milestone', { rep: displayName, count });
          if (line) messages.add(line);
        }
      }
    }

    for (const count of REP_ALLTIME_MILESTONES) {
      if (userAllBefore < count && userAllAfter >= count) {
        const key = milestoneKey('all', 'rep.alltime', userId, count);
        if (!markMilestoneOnce(game.allTimeMilestones, key)) continue;
        const event = count === 1 ? 'first_ever' : 'alltime_milestone';
        if (!skipEvent(event)) {
          const line = pickEventLine(game, event, { rep: displayName, count });
          if (line) messages.add(line);
        }
      }
    }

    for (const count of TEAM_DAILY_MILESTONES) {
      if (teamDailyBefore < count && teamDailyAfter >= count) {
        const key = milestoneKey(date, 'team.daily', channelId || blitz, count);
        if (!markMilestoneOnce(game.teamMilestones, key)) continue;
        const line = pickEventLine(game, count >= 50 ? 'team_milestone_high' : 'team_milestone', {
          team: blitz,
          count,
        });
        if (line) messages.add(line);
      }
    }

    for (const count of TEAM_WEEKLY_MILESTONES) {
      if (teamWeekBefore < count && teamWeekAfter >= count) {
        const key = milestoneKey(String(weekId), 'team.weekly', channelId || blitz, count);
        if (!markMilestoneOnce(game.teamMilestones, key)) continue;
        const line = pickEventLine(game, 'team_milestone', { team: blitz, count });
        if (line) messages.add(line);
      }
    }

    if (!skipPersonal) {
      if (movement.tookFirst && primaryEvent !== 'took_first' && !skipEvent('took_first')) {
        messages.add(pickEventLine(game, 'took_first', { rep: displayName }) || '');
      } else if (movement.enteredTop3 && !skipEvent('entered_top3')) {
        messages.add(pickEventLine(game, 'entered_top3', { rep: displayName }) || '');
      } else if (movement.passedRepName && !skipEvent('passed_rep')) {
        messages.add(
          pickEventLine(game, 'passed_rep', { rep: displayName, otherRep: movement.passedRepName }) || '',
        );
      } else if (movement.oneAwayFromFirst && !skipEvent('one_away_first')) {
        messages.add(pickEventLine(game, 'one_away_first', { rep: displayName }) || '');
      }
    }

    if (!skipPersonal) {
      if (nowHour >= GAMIFICATION_CONFIG.lateHourCutoff && !skipEvent('late_night')) {
        messages.add(pickEventLine(game, 'late_night', { rep: displayName }) || '');
      } else if (nowHour <= GAMIFICATION_CONFIG.earlyHourCutoff && !skipEvent('early_morning')) {
        messages.add(pickEventLine(game, 'early_morning', { rep: displayName }) || '');
      }
    }

    return data;
  });

  return [...messages]
    .filter(Boolean)
    .filter((line) => !confirmationHype || !hypeTextsSimilar(line, confirmationHype))
    .slice(0, 1);
}

function buildDealLogConfirmationPayload({ ctx, dataBefore, dataAfter, now, tz }) {
  const movement = deriveLeaderboardMovement({
    beforeRows: ctx.rowsTodayBefore || [],
    afterRows: ctx.rowsTodayAfter || [],
    userId: ctx.userId,
  });
  const primary = selectPrimaryDealLine({ ctx, dataBefore, dataAfter, now, tz });
  const hypeLine = buildDealHypeLine({
    picked: primary,
    displayName: ctx.displayName,
    movement,
  });
  return {
    content: buildPremiumDealConfirmation({ ...ctx, hypeLine, pulseBuild: PULSE_BUILD }),
    primary,
    hypeLine,
  };
}

async function syncTfiberProofForLog({ message, logEntry, speed, blitzName, marketIdentity, now }) {
  if (!logEntry) return null;
  const hasScreenshot = hasScreenshotAttachment(message);
  let payload = buildTfiberProofPayload({
    message,
    logEntry,
    speed,
    blitzName,
    marketIdentity,
    hasScreenshot,
    now,
  });
  if (hasScreenshot) {
    payload = await enrichTfiberProofPayload(payload);
  }
  let result;
  try {
    result = await postTfiberDiscordProof(payload);
  } catch (err) {
    console.error('[Pulse][T-Fiber] OS sync failed:', err.message || err);
    result = { ok: false, status: hasScreenshot ? 'SYNC_FAILED' : 'NEEDS_SCREENSHOT', message: err.message || String(err) };
  }
  await recordTfiberProofAttempt({
    logEntry,
    guildId: message.guild?.id || null,
    channelId: message.channel?.id || null,
    blitzName,
    marketIdentity,
    result,
    now,
  });
  return result;
}

function appendTfiberProofLine(content, result) {
  const line = formatTfiberProofLine(result);
  return line ? `${content}\n${line}` : content;
}

async function submitTfiberProofForPending({ message, pending, hasScreenshot, enrichedPayload = null }) {
  let payload = enrichedPayload || buildTfiberDmPayload({ message, pending, hasScreenshot });
  if (hasScreenshot && !payload.extracted) {
    payload = await enrichTfiberProofPayload(payload);
  }
  let result;
  try {
    result = await postTfiberDiscordProof(payload);
  } catch (err) {
    console.error('[Pulse][T-Fiber] proof sync failed:', err.message || err);
    result = { ok: false, status: 'SYNC_FAILED', message: err.message || String(err) };
  }

  if (result.status === 'ORDER_CREATED' || result.status === 'PROOF_ATTACHED' || result.status === 'IDEMPOTENT_REPLAY') {
    await markTfiberProofResolved({ logId: pending.logId, result });
  } else {
    await recordTfiberProofAttempt({
      logEntry: {
        id: pending.logId,
        userId: pending.userId,
        displayName: pending.displayName,
        username: pending.username,
        speed: pending.speed,
        timestamp: pending.timestamp,
        channelId: pending.channelId,
        blitzName: pending.blitzName,
        marketId: pending.marketId,
        marketName: pending.marketName,
      },
      guildId: pending.guildId,
      channelId: pending.channelId,
      blitzName: pending.blitzName,
      marketIdentity: { marketId: pending.marketId, marketName: pending.marketName },
      result,
    });
  }

  return result;
}

async function submitStandaloneTfiberProofUpload({ message, channel, hasScreenshot, enrichedPayload = null }) {
  const marketIdentity = marketIdentityForChannel(channel);
  const blitzName = approvedBlitzNameForChannel(channel) || blitzFromChannelName(channel.name);
  const member = message.member ?? (message.guild ? await message.guild.members.fetch(message.author.id).catch(() => null) : null);
  const tmoOrderId = extractTmoOrderId(
    enrichedPayload?.tmoOrderId ||
    enrichedPayload?.extracted?.orderConfirmationNumber ||
    message.content,
  );
  if (!tmoOrderId) return null;

  const payload = {
    idempotencyKey: `tfiber-channel-upload:${message.guild?.id || 'unknown-guild'}:${channel.id}:${message.id}:${message.author.id}`,
    discordGuildId: message.guild?.id || null,
    discordChannelId: channel.id,
    discordMessageId: message.id,
    discordUserId: message.author.id,
    discordNickname: member?.displayName || message.author.globalName || message.author.username,
    tmoOrderId,
    tmoOrderIdSource: enrichedPayload?.tmoOrderIdSource || 'SCREENSHOT_OCR',
    confidence: enrichedPayload?.confidence ?? null,
    hasScreenshot,
    attachments: extractDiscordAttachments(message),
    rawText: message.content || null,
    plan: 'T-Fiber',
    saleDate: message.createdAt?.toISOString?.() || new Date().toISOString(),
    marketId: marketIdentity?.marketId || null,
    marketName: marketIdentity?.marketName || blitzName || null,
    extracted: enrichedPayload?.extracted || null,
    missingFields: enrichedPayload?.missingFields || undefined,
  };

  try {
    return await postTfiberDiscordProof(payload);
  } catch (err) {
    console.error('[Pulse][T-Fiber] standalone proof sync failed:', err.message || err);
    return { ok: false, status: 'SYNC_FAILED', message: err.message || String(err) };
  }
}

function channelProofUploadCloseEnoughForPending(message, pending, tmoOrderId) {
  if (tmoOrderId) return true;
  const pendingAt = Date.parse(pending?.timestamp || pending?.createdAt || '');
  if (!Number.isFinite(pendingAt)) return false;
  const messageAt = message.createdTimestamp || Date.now();
  const delta = messageAt - pendingAt;
  return delta >= 0 && delta <= TFIBER_CHANNEL_PROOF_WINDOW_MS;
}

async function handleTfiberProofChannelUpload(message, channel) {
  const hasScreenshot = hasScreenshotAttachment(message);
  // No image but a TMO id in the text is a rep answering "what's the order number?" for a
  // screenshot the OS is already holding. Anything else with no image is not proof of anything.
  if (!hasScreenshot && !extractTmoOrderId(message.content)) return false;

  const marketIdentity = marketIdentityForChannel(channel);
  const blitzName = approvedBlitzNameForChannel(channel) || blitzFromChannelName(channel.name);
  let tmoOrderId = extractTmoOrderId(message.content);
  let enrichedPayload = null;
  if (!tmoOrderId) {
    enrichedPayload = await enrichTfiberProofPayload({
      rawText: message.content || null,
      attachments: extractDiscordAttachments(message),
      hasScreenshot,
    });
    tmoOrderId = extractTmoOrderId(enrichedPayload?.tmoOrderId || enrichedPayload?.extracted?.orderConfirmationNumber);
  }

  const selection = await selectPendingForUser(message.author.id, { tmoOrderId });
  let pending = selection.pending;
  if (!pending) {
    const data = await readLeaderboard().catch(() => null);
    const recent = selectRecentTfiberProofLog(data?.logs || [], {
      userId: message.author.id,
      channelId: channel.id,
      messageTimestamp: message.createdTimestamp || Date.now(),
      windowMs: TFIBER_CHANNEL_PROOF_WINDOW_MS,
      guildId: message.guild?.id || null,
      marketIdentity,
      blitzName,
    });
    pending = recent.pending;
  }
  if (!pending) {
    if (!tmoOrderId) return false;
    const result = await submitStandaloneTfiberProofUpload({ message, channel, hasScreenshot, enrichedPayload });
    if (!result) return false;
    await message.reply({
      content: formatTfiberProofLine(result) || 'T-Fiber proof received.',
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }
  if (!channelProofUploadCloseEnoughForPending(message, pending, tmoOrderId)) return false;

  const result = await submitTfiberProofForPending({
    message,
    pending,
    hasScreenshot,
    enrichedPayload: enrichedPayload
      ? {
          ...buildTfiberDmPayload({ message, pending, hasScreenshot }),
          tmoOrderId: enrichedPayload.tmoOrderId || tmoOrderId || null,
          tmoOrderIdSource: enrichedPayload.tmoOrderIdSource || (tmoOrderId ? 'SCREENSHOT_OCR' : null),
          confidence: enrichedPayload.confidence ?? null,
          extracted: enrichedPayload.extracted || null,
          missingFields: enrichedPayload.missingFields || undefined,
        }
      : null,
  });
  await message.reply({
    content: formatTfiberProofLine(result) || 'T-Fiber proof received.',
    allowedMentions: { parse: [] },
  }).catch(() => {});
  return true;
}

async function handleTfiberProofDm(message) {
  const hasScreenshot = hasScreenshotAttachment(message);
  if (!hasScreenshot && !String(message.content || '').trim()) return false;

  const tmoOrderId = extractTmoOrderId(message.content);
  const selection = await selectPendingForUser(message.author.id, { tmoOrderId });
  const pending = selection.pending;
  if (!pending) {
    if (selection.reason === 'ambiguous' || selection.reason === 'duplicate_tmo_pending') {
      await message.reply({
        content: `I found the screenshot, but you have ${selection.pendingCount} open T-Fiber proof requests. Send the screenshot again with the T-Mobile order confirmation number in the same DM so I attach it to the right deal.`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
      return true;
    }
    if (selection.reason === 'tmo_not_matched') {
      await message.reply({
        content: 'I found that T-Mobile order confirmation number, but it does not match your open T-Fiber proof requests. Check the number or log the 1G deal first, then send the screenshot with the confirmation number.',
        allowedMentions: { parse: [] },
      }).catch(() => {});
      return true;
    }
    if (hasScreenshot) {
      await message.reply({
        content: 'I found the screenshot, but I do not see a pending T-Fiber proof request for you. Log the 1G deal in the blitz channel first, then send the screenshot here.',
        allowedMentions: { parse: [] },
      }).catch(() => {});
      return true;
    }
    return false;
  }

  const result = await submitTfiberProofForPending({ message, pending, hasScreenshot });
  await message.reply({
    content: formatTfiberProofLine(result) || 'T-Fiber proof received.',
    allowedMentions: { parse: [] },
  }).catch(() => {});
  return true;
}

function tfiberReminderText(type, pending) {
  if (type === 'expired') {
    return `T-Fiber proof expired for your ${pending.plan || '1G'} log in ${pending.marketName || pending.blitzName || 'the blitz'}. It was removed from official Pulse totals until the screenshot is received.`;
  }
  if (type === 'final') {
    return `Final T-Fiber proof reminder: upload the order confirmation screenshot before the 48-hour window closes. If you send it here, include the T-Mobile order confirmation number in the same DM.`;
  }
  return `T-Fiber proof reminder: upload the order confirmation screenshot so the 1G order can sync into FiberSales OS. If you send it here, include the T-Mobile order confirmation number in the same DM.`;
}

async function runTfiberProofMaintenance() {
  const actions = await collectDueTfiberProofActions().catch((err) => {
    console.error('[Pulse][T-Fiber] proof maintenance failed:', err.message || err);
    return [];
  });
  for (const action of actions) {
    const user = action.pending?.userId ? await client.users.fetch(action.pending.userId).catch(() => null) : null;
    const content = tfiberReminderText(action.type, action.pending);
    const dmOk = user ? await user.send({ content, allowedMentions: { parse: [] } }).then(() => true).catch(() => false) : false;
    if (dmOk) continue;
    const channel = action.pending?.channelId ? await client.channels.fetch(action.pending.channelId).catch(() => null) : null;
    if (channel?.isTextBased?.()) {
      await channel.send({ content: `<@${action.pending.userId}> ${content}`, allowedMentions: { users: [action.pending.userId] } }).catch(() => {});
    }
  }
}

/** Milestone tracking only — deal logs never get a second channel message. */
async function recordGamificationAfterLog(ctx) {
  try {
    await buildPhase4Messages(ctx);
  } catch (err) {
    console.error('Gamification state update failed (log already saved):', err.message || err);
  }
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
    await backupAndLogAction({
      action: 'admin-remove-channel',
      actorId: message.author.id,
      actorName: member?.displayName || message.author.username,
      targetFilePath: APPROVED_CHANNELS_PATH,
      details: { source: 'text-command', channelId: message.channel.id },
    });
    unapproveDealChannel(message.channel.id);
    const marketRemoval = removeChannelFromMarket(message.channel.id);
    await safeAppendActionLog({
      action: 'admin-remove-channel.completed',
      actorId: message.author.id,
      actorName: member?.displayName || message.author.username,
      details: { source: 'text-command', channelId: message.channel.id, marketRemoved: marketRemoval.removed },
    });
    await message.reply({
      content: [
        `Removed <#${message.channel.id}> from approved deal channels.`,
        marketRemoval.removed ? `Removed market mapping from ${marketRemoval.market.marketName}.` : null,
      ].filter(Boolean).join('\n'),
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
  extraConfirmationLine = null,
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
  const { content, primary, hypeLine } = buildDealLogConfirmationPayload({
    ctx,
    dataBefore: appendResult.dataBefore,
    dataAfter: appendResult.data,
    now,
    tz,
  });

  await editConfirmation({
    content: extraConfirmationLine ? `${content}\n${extraConfirmationLine}` : content,
    embeds: [],
    components: [],
  });
  await recordGamificationAfterLog({
    dataBefore: appendResult.dataBefore,
    dataAfter: appendResult.data,
    userId,
    displayName,
    blitzName,
    channelId: channel?.id || null,
    speeds,
    now,
    tz,
    primaryLineId: primary?.id || null,
    primaryEvent: primary?.event || null,
    suppressPersonalHype: true,
    confirmationHype: hypeLine,
  });
  return true;
}

async function handleLog(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Pulse commands only work in a server.', ephemeral: true });
    return;
  }

  if (!isApprovedDealChannel(interaction.channel)) {
    logChannelRejectionDiagnostics('/log', interaction.channel, interaction.user.id);
    await replyOutsideBlitz(interaction);
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
  const marketIdentity = marketIdentityForChannel(channel);
  if (!marketIdentity.assigned) {
    console.warn(
      '[Pulse][UnassignedMarket] deal log allowed without market mapping',
      JSON.stringify({ channelId: channel?.id || null, channelName: channel?.name || null, userId: interaction.user.id }),
    );
  }

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
    marketId: marketIdentity.marketId,
    marketName: marketIdentity.marketName,
    weekId: data.metadata.weekId,
    ...(customerName && { customerName }),
    ...(customerPhone && { customerPhone }),
    ...(customerAddress && { customerAddress }),
  });

  const hasCustomerOnFile = !!(customerName || customerPhone || customerAddress);
  const replyKeys = logReplyKeys({ interactionId: interaction.id });
  if (!tryClaimLogReply(replyKeys)) {
    await interaction.editReply({
      content: '_Already handled (same command)._',
      embeds: [],
      components: [],
    });
    return;
  }

  const appendResult = await appendSingleDealLog({
    userId,
    speed,
    channelId: channel?.id || null,
    buildLogEntry,
  });

  let tfiberProofLine = null;
  if (requiresTfiberProof({ speeds: [speed], channelName: channel?.name, blitzName, marketName: marketIdentity.marketName, marketId: marketIdentity.marketId })) {
    const result = await syncTfiberProofForLog({
      message: {
        id: interaction.id,
        content: '',
        attachments: new Map(),
        guild: interaction.guild,
        channel,
        author: interaction.user,
        member,
      },
      logEntry: appendResult.logEntry,
      speed,
      blitzName,
      marketIdentity,
      now,
    });
    tfiberProofLine = formatTfiberProofLine(result);
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
    hasCustomerOnFile,
    extraConfirmationLine: tfiberProofLine,
    editConfirmation: (payload) => interaction.editReply(payload),
  });
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

  const team = agg ? primaryBlitz(agg) : '—';

  const embed = new EmbedBuilder()
    .setColor(0x111111)
    .setTitle('🔥 WEEKLY PRODUCTION')
    .setDescription(
      [
        `**${displayName}**`,
        `**${total} Fiber Deals Closed**`,
        '',
        '**Speed Breakdown**',
        formatSpeedBreakdown(speeds),
        '',
        `**Rank:** ${r ? `#${r} This Week` : '—'}`,
        `**Team:** ${team}`,
        '',
        '*Built different.*',
      ].join('\n'),
    );

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Remove a rep's most recent deal log. Shared by /remove-last and the plain-text "undo" so the two
 * paths can never drift — they must back up and audit identically, because this deletes real data.
 * @returns {Promise<object|null>} the removed log, or null if they had nothing to undo.
 */
async function removeLastDealForUser(userId, actorName, via) {
  await backupAndLogAction({
    action: 'remove-last',
    actorId: userId,
    actorName,
    targetFilePath: DATA_PATH,
    details: { command: via },
  });
  let removed = null;
  await mutate(async (d) => {
    for (let i = d.logs.length - 1; i >= 0; i--) {
      if (d.logs[i].userId === userId) {
        removed = d.logs[i];
        d.logs.splice(i, 1);
        break;
      }
    }
    return d;
  });
  return removed;
}

async function handleUndo(interaction) {
  await interaction.deferReply();
  const uid = interaction.user.id;

  const removedLog = await removeLastDealForUser(
    uid,
    interaction.member?.displayName || interaction.user.username,
    '/remove-last',
  );

  if (!removedLog) {
    await interaction.deleteReply().catch(() => {});
    await interaction.followUp({ content: 'Nothing to undo.', ephemeral: true });
    return;
  }

  await safeAppendActionLog({
    action: 'remove-last.completed',
    actorId: uid,
    actorName: interaction.member?.displayName || interaction.user.username,
    details: {
      removedLogId: removedLog.id,
      removedSpeed: removedLog.correctedSpeed || removedLog.speed,
      removedTimestamp: removedLog.timestamp,
      channelId: removedLog.channelId || null,
    },
  });

  await interaction.editReply({
    content: `↩️ **Undone** — removed your last log · ${SPEED_DISPLAY[removedLog.speed] || removedLog.speed}`,
    embeds: [],
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

function safeGetOption(interaction, getter, name) {
  try {
    return getter.call(interaction.options, name);
  } catch {
    return null;
  }
}

async function marketCreateChannel(interaction) {
  const picked = safeGetOption(interaction, interaction.options.getChannel, 'channel');
  if (picked) return picked;

  const ref =
    safeGetOption(interaction, interaction.options.getString, 'channel') ||
    safeGetOption(interaction, interaction.options.getString, 'channel_ref');
  if (ref) {
    const resolved = await resolveGuildTextChannel(interaction.guild, ref);
    if (!resolved) {
      const err = new Error(`I could not find one text channel matching \`${ref}\`. Try the exact channel name like \`goldsboro\`, a channel mention, or the raw channel ID.`);
      err.code = 'CHANNEL_NOT_FOUND';
      throw err;
    }
    return resolved;
  }

  return interaction.channel;
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
  const registered = ensureDealChannelRegistered(channel, interaction.user.id);
  const result = approveDealChannel(channel, interaction.user.id, blitzName);

  await interaction.editReply({
    content: [
      result.alreadyApproved ? 'Deal channel already approved.' : 'Deal channel approved.',
      `Channel: <#${result.channel.id}>`,
      `Blitz: ${result.channel.blitzName}`,
      registered.ok && registered.market
        ? `Linked to market **${registered.market.marketName}** (\`${registered.market.marketId}\`).`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
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
    await backupAndLogAction({
      action: 'admin-remove-channel',
      actorId: interaction.user.id,
      actorName: interaction.member?.displayName || interaction.user.username,
      targetFilePath: APPROVED_CHANNELS_PATH,
      details: { source: '/admin remove-channel', channelId: channel.id },
    });
    const removed = unapproveDealChannel(channel.id);
    const marketRemoval = removeChannelFromMarket(channel.id);
    await safeAppendActionLog({
      action: 'admin-remove-channel.completed',
      actorId: interaction.user.id,
      actorName: interaction.member?.displayName || interaction.user.username,
      details: {
        source: '/admin remove-channel',
        channelId: channel.id,
        removed,
        marketRemoved: marketRemoval.removed,
      },
    });
    await interaction.editReply({
      content: [
        removed ? `Removed <#${channel.id}> from approved deal channels.` : `<#${channel.id}> was not approved.`,
        marketRemoval.removed ? `Removed market mapping from ${marketRemoval.market.marketName}.` : null,
      ].filter(Boolean).join('\n'),
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

async function handleAdminAddMarket(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const marketName = interaction.options.getString('market_name', true);
    const marketIdRaw = interaction.options.getString('market_id');
    const isp = interaction.options.getString('isp');
    const result = addMarket({
      marketName,
      marketId: marketIdRaw,
      isp,
      createdBy: interaction.user.id,
    });
    let roleNote = '';
    try {
      const roleId = await ensureMarketRole(interaction.guild, result.market);
      roleNote = `Role: <@&${roleId}>`;
    } catch (err) {
      roleNote = `Role: not created (${err.message || err}). Bot needs **Manage Roles**.`;
    }
    await interaction.editReply({
      content: [
        result.alreadyExists ? 'Market updated.' : 'Market created.',
        `Market: ${result.market.marketName}`,
        `Market ID: ${result.market.marketId}`,
        `ISP: ${result.market.isp || '—'}`,
        roleNote,
        '_Use `/admin assign-rep` so reps only see this market’s channels._',
      ].join('\n'),
    });
  } catch (err) {
    await interaction.editReply({ content: `Could not add market: ${err.message || err}` });
  }
}

async function handleAdminListMarkets(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const bootstrapped = ensureDefaultMarkets(interaction.user.id);
  const markets = listMarkets();
  if (!markets.length) {
    await interaction.editReply({ content: 'No markets configured yet. Use /admin add-market.' });
    return;
  }
  await interaction.editReply({
    content: [
      bootstrapped.length ? `_Auto-registered ${bootstrapped.length} market(s) from *-deals channels._` : null,
      'Markets',
      '',
      ...markets.map((m) => {
        const channels = (m.channelIds || []).map((id) => `<#${id}>`).join(', ') || 'No channels';
        const role = m.roleId ? `<@&${m.roleId}>` : '—';
        const reps = Array.isArray(m.repUserIds) ? m.repUserIds.length : 0;
        return `• ${m.marketName} (${m.marketId})\n  Role: ${role} · Reps: ${reps}\n  Channels: ${channels}`;
      }),
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

async function handleAdminEditMarket(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const marketQuery = interaction.options.getString('market_id', true);
  const marketName = interaction.options.getString('market_name');
  const isp = interaction.options.getString('isp');
  if (!marketName && isp == null) {
    await interaction.editReply({ content: 'Provide **market_name** and/or **isp** to update.' });
    return;
  }
  try {
    const market = renameMarket(marketQuery, { marketName, isp });
    await interaction.editReply({
      content: [
        `Updated **${market.marketName}** (\`${market.marketId}\`).`,
        `ISP: ${market.isp || '—'}`,
      ].join('\n'),
    });
  } catch (err) {
    const msg = err.code === 'MARKET_NOT_FOUND' ? err.message : `Could not edit market: ${err.message || err}`;
    await interaction.editReply({ content: msg });
  }
}

async function handleAdminDeleteMarket(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  if (!(await safeDeferEphemeral(interaction))) return;
  const marketQuery = interaction.options.getString('market_id', true);
  const removeRole = interaction.options.getBoolean('delete_discord_role') ?? false;
  try {
    const { market } = deleteMarket(marketQuery);
    let roleNote = 'Discord role left in place.';
    if (removeRole) {
      try {
        const removed = await deleteMarketRole(interaction.guild, market);
        roleNote = removed
          ? `Removed Discord role for **${market.marketName}**.`
          : 'No Discord role on file for this market.';
      } catch (err) {
        roleNote = `Could not remove Discord role: ${err.message || err}`;
      }
    }
    await interaction.editReply({
      content: [
        `Deleted market **${market.marketName}** (\`${market.marketId}\`).`,
        'Channel mappings for this market were cleared.',
        roleNote,
        '_Reps still holding the old role will not see locked channels until you unassign or re-assign._',
      ].join('\n'),
    });
  } catch (err) {
    const msg = err.code === 'MARKET_NOT_FOUND' ? err.message : `Could not delete market: ${err.message || err}`;
    await interaction.editReply({ content: msg });
  }
}

async function handleAdminConnectChannel(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const channel = optionChannelOrCurrent(interaction);
  const marketId = interaction.options.getString('market_id', true);
  try {
    const result = connectChannelToMarket({
      channel,
      marketId,
      connectedBy: interaction.user.id,
    });
    let lockNote = '';
    try {
      const lock = await applyMarketChannelLock(
        channel,
        result.market,
        interaction.guild,
        client.user.id,
        marketAccessOpts(),
      );
      lockNote = lock.ok
        ? `Channel locked to <@&${lock.roleId}> (reps without this role cannot see it).`
        : 'Channel lock failed.';
    } catch (err) {
      lockNote = `Channel lock failed: ${err.message || err}. Bot needs **Manage Channels** + **Manage Roles**.`;
    }
    await interaction.editReply({
      content: [
        `Connected <#${channel.id}> to ${result.market.marketName} (${result.market.marketId}).`,
        result.removedFrom ? `Removed old mapping from: ${result.removedFrom}` : null,
        lockNote,
      ].filter(Boolean).join('\n'),
    });
  } catch (err) {
    const msg =
      err.code === 'MARKET_NOT_FOUND' ? err.message : `Could not connect channel: ${err.message || err}`;
    await interaction.editReply({ content: msg });
  }
}

// ---------------------------------------------------------------------------------------------
// /market — the whole market workflow in one discoverable command.
// ---------------------------------------------------------------------------------------------

/** Nickname format, owner decision 2026-07-28: "Real Name (Handle)" so the member list is
 *  searchable by real name while the leaderboard keeps the name people actually go by. */
function buildNickname(realName, handle) {
  const full = handle ? `${realName} (${handle})` : realName;
  return full.length <= 32 ? full : realName.slice(0, 32); // Discord hard limit; the real name wins.
}

/** /market create — market + role + channel mapping + channel lock, in one step.
 *  This replaces the /admin add-market -> add-channel -> connect-channel sequence that nobody
 *  could discover, and it is the single thing the owner named as the hardest part of the bot. */
async function handleMarketCreate(interaction) {
  if (!canUseAdminCommands(interaction)) return denyAdmin(interaction);
  await interaction.deferReply({ ephemeral: true });
  const marketName = interaction.options.getString('name', true);
  const isp = interaction.options.getString('isp');
  const explicitId = interaction.options.getString('id');
  const city = interaction.options.getString('city');
  const state = interaction.options.getString('state');
  const done = [];
  try {
    const channel = await marketCreateChannel(interaction);
    // An explicit id wins. It is immutable once deal logs carry it, so deriving it from a display
    // name is how "new-york" became the permanent id of an Ohio market.
    const { market } = addMarket({ marketName, marketId: explicitId || null, isp, createdBy: interaction.user.id });
    done.push(`Market **${market.marketName}** (\`${market.marketId}\`)`);

    // Location + the Palmetto future-mapping fields. Left null so the separate Palmetto
    // integration has somewhere to write, without blocking the market on ids nobody has yet.
    updateMarket(market.marketId, {
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      sourceSystem: 'palmetto',
      externalMarketId: null,
      externalMarketName: null,
      lastImportedAt: null,
    });
    if (city || state) done.push(`Location ${[city, state].filter(Boolean).join(', ')}`);

    try { done.push(`Role <@&${await ensureMarketRole(interaction.guild, market)}>`); }
    catch (err) { done.push(`⚠ Role not created — ${err.message || err} (bot needs **Manage Roles**)`); }

    if (channel) {
      connectChannelToMarket({ channel, marketId: market.marketId, connectedBy: interaction.user.id });
      done.push(`Channel <#${channel.id}> connected`);
      try {
        await applyMarketChannelLock(channel, market, interaction.guild, client.user.id, marketAccessOpts());
        done.push('Channel locked to this market only');
      } catch (err) { done.push(`⚠ Lock failed — ${err.message || err}`); }
    }
    await interaction.editReply({
      content: [`✅ ${done.join('\n✅ ').replace(/✅ ⚠/g, '⚠')}`, '', `Now add people: \`/market add rep:@them name:"Their Name" market:${market.marketName}\``].join('\n'),
    });
  } catch (err) {
    await interaction.editReply({ content: `Could not create the market: ${err.message || err}\n${done.length ? `Completed before failing:\n${done.join('\n')}` : ''}` });
  }
}

/** /market add — the one that actually saves time: real name + market access in a single step.
 *  Setting the nickname HERE is the whole point. Assigning a role is something Discord already
 *  does natively; capturing who the cryptic username belongs to is what it cannot do, and skipping
 *  it is how the server ended up full of handles like dboy1011 that nobody could identify. */
async function handleMarketAdd(interaction) {
  if (!canUseAdminCommands(interaction)) return denyAdmin(interaction);
  if (!(await safeDeferEphemeral(interaction))) return;
  const user = interaction.options.getUser('rep', true);
  const realName = interaction.options.getString('name', true).trim();
  const marketId = interaction.options.getString('market', true);
  const handle = interaction.options.getString('handle');
  const lines = [];
  let nicknameSet = false;
  try {
    const member = await interaction.guild.members.fetch(user.id);
    const nickname = buildNickname(realName, handle);
    try {
      await member.setNickname(nickname, `Added to a market by ${interaction.user.tag}`);
      nicknameSet = true;
      lines.push(`Name set to **${nickname}**`);
    } catch {
      // Discord refuses if their top role outranks the bot (managers) or they own the server.
      lines.push(`⚠ Could not set their nickname to **${nickname}** — their role outranks Pulse. Set it by hand.`);
    }
    // Write the ASSIGNMENT RECORD first — it is the authority. Reps are exclusive to one market;
    // reconciliation then makes the member's Discord roles match the record exactly, which also
    // strips any market role that was added by hand without a corresponding assignment.
    marketAssignments.assignRepMarket(user.id, marketId);
    const { market, roleId } = await assignRepToMarket(interaction.guild, user.id, marketId, marketAccessOpts());
    const recon = await marketAssignments.reconcileMemberMarketRoles(interaction.guild, user.id).catch(() => null);
    if (recon?.remove?.length) lines.push(`Removed ${recon.remove.length} market role(s) with no assignment on record`);
    console.log(auditLine({ actorId: interaction.user.id, action: 'market.add.applied', marketId, targetUserId: user.id, result: 'OK', detail: `nickname=${nicknameSet}` }));
    lines.push(`Added to **${market.marketName}** (<@&${roleId}>)`);
    lines.push('They can see that market\'s channel only.');
    await interaction.editReply({ content: `✅ <@${user.id}>\n• ${lines.join('\n• ')}` });
  } catch (err) {
    await interaction.editReply({ content: `Could not add them: ${err.message || err}${lines.length ? `\n\nDone before failing:\n• ${lines.join('\n• ')}` : ''}` });
  }
}

/** /market rename — fix a stale market NAME without touching its id.
 *  The id is what historical deal logs are stamped with, so changing it would orphan them; the
 *  name is only ever a label. Renaming "New York" to "Ashtabula" therefore also corrects every
 *  past leaderboard line for that market, because those deals were only ever mislabelled. */
async function handleMarketRename(interaction) {
  if (!canUseAdminCommands(interaction)) return denyAdmin(interaction);
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString('market', true);
  const newName = interaction.options.getString('name', true).trim();
  try {
    const result = renameMarket(query, { marketName: newName });
    const m = result?.market ?? result;
    await interaction.editReply({
      content: `✅ Renamed to **${m.marketName}** (id \`${m.marketId}\` unchanged, so past deals stay attached).\nUpdate the Discord role name to match if it hasn't already.`,
    });
  } catch (err) {
    await interaction.editReply({ content: `Could not rename: ${err.message || err}` });
  }
}

/** /market cleanup — retire markets whose channel is gone.
 *  A market with no resolvable channel cannot receive deals, but it still clutters autocomplete
 *  and /market list, which is what made "which market do I pick?" hard. Safe to delete: logs carry
 *  their own marketName, so history keeps its label (see inferMarketForLog). Previews by default. */
async function handleMarketCleanup(interaction) {
  if (!canUseAdminCommands(interaction)) return denyAdmin(interaction);
  await interaction.deferReply({ ephemeral: true });
  const confirm = interaction.options.getBoolean('confirm') ?? false;

  const dead = [];
  const live = [];
  for (const m of listMarkets()) {
    const ids = m.channelIds || [];
    const resolvable = ids.filter((id) => interaction.guild.channels.cache.get(id));
    (resolvable.length ? live : dead).push({ m, had: ids.length });
  }

  if (!dead.length) {
    return interaction.editReply({ content: `Nothing to clean up — all ${live.length} market(s) have a live channel.` });
  }
  const list = dead.map((d) => `• **${d.m.marketName}** (\`${d.m.marketId}\`)${d.had ? ` — channel gone` : ' — never had a channel'}`).join('\n');
  if (!confirm) {
    return interaction.editReply({
      content: [`Would delete **${dead.length}** market(s) with no live channel:`, list, '',
        `Keeping: ${live.map((l) => `**${l.m.marketName}**`).join(', ')}`, '',
        'Run again with `confirm:true` to delete. Past deals keep their market name either way.'].join('\n'),
    });
  }
  const done = [], failed = [];
  for (const d of dead) {
    try { deleteMarket(d.m.marketId); done.push(d.m.marketName); }
    catch (err) { failed.push(`${d.m.marketName} (${err.message || err})`); }
  }
  await interaction.editReply({
    content: [`✅ Deleted ${done.length} dead market(s): ${done.join(', ')}`,
      failed.length ? `⚠ Failed: ${failed.join('; ')}` : '',
      `Still live: ${live.map((l) => `**${l.m.marketName}**`).join(', ')}`].filter(Boolean).join('\n'),
  });
}

/**
 * Single authorization gate for every /market subcommand.
 *
 * Per-subcommand tiers live in command-policy.js — `/market list` is a harmless read while
 * `/market cleanup` deletes market records, so one tier for the whole command was wrong.
 * Manager scope is checked against the ASSIGNMENT RECORD, never against the Discord roles the
 * caller happens to hold: roles are a mutable cache that can be hand-edited or left stale.
 */
/**
 * OWNER-only manager authority management. Keyed on immutable Discord user ids.
 * Guarded upstream by command-policy (tier OWNER) — these never run for a manager.
 */
async function handleManagerAuthority(interaction, sub) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('user');
  const marketId = interaction.options.getString('market');
  const audit = (result, detail) => console.log(auditLine({
    actorId: interaction.user.id, action: `market.${sub}`, marketId, targetUserId: user?.id ?? null, result, detail,
  }));

  try {
    if (sub === 'manager-markets') {
      const markets = marketAssignments.getManagerMarkets(user.id);
      // Flag stale authority for the Owner: an assignment held by someone who has left, or who no
      // longer holds Manager, is inert but still on record and needs removing by hand.
      const m = await interaction.guild.members.fetch(user.id).catch(() => null);
      const mgrRole = pulseConfig.managerRoleId();
      const stale = !m
        ? '⚠ This user has **left the server** — their assignments are stale. Remove with `/market manager-remove`.'
        : (mgrRole && !m.roles.cache.has(mgrRole))
          ? '⚠ This user no longer holds the **Manager** role, so these assignments grant nothing.'
          : null;
      audit('OK', `${markets.length} market(s)${stale ? ' STALE' : ''}`);
      return interaction.editReply({
        content: markets.length
          ? [`<@${user.id}> \`${user.id}\` manages **${markets.length}** market(s):`, `• ${markets.join('\n• ')}`, stale].filter(Boolean).join('\n')
          : [`<@${user.id}> has **no** market assignments on record.`, stale].filter(Boolean).join('\n'),
      });
    }

    if (sub === 'manager-list') {
      const market = listMarkets().find((m) => m.marketId === normalizeMarketId(marketId) || m.marketName === marketId);
      if (!market) { audit('DENIED', 'unknown market'); return interaction.editReply({ content: `No market matches \`${marketId}\`.` }); }
      const ids = Array.isArray(market.managerUserIds) ? market.managerUserIds : [];
      const mgrRole = pulseConfig.managerRoleId();
      // Stale rows must be VISIBLE to the Owner — an assignment held by someone who left, or who
      // lost the Manager role, is exactly what needs cleaning up and is invisible otherwise.
      const rendered = [];
      for (const id of ids) {
        const m = await interaction.guild.members.fetch(id).catch(() => null);
        if (!m) rendered.push(`<@${id}> \`${id}\` — ⚠ **left the server** (stale)`);
        else if (mgrRole && !m.roles.cache.has(mgrRole)) rendered.push(`<@${id}> \`${id}\` — ⚠ no longer holds Manager (stale)`);
        else rendered.push(`<@${id}> \`${id}\``);
      }
      audit('OK', `${ids.length} manager(s)`);
      return interaction.editReply({
        content: ids.length
          ? `**${market.marketName}** is managed by:\n• ${rendered.join('\n• ')}`
          : `**${market.marketName}** has **no** managers assigned. Nobody can run scoped commands for it.`,
      });
    }

    // manager-remove must work when the target has LEFT or lost the Manager role — those are
    // precisely the assignments that need clearing. Requiring a resolvable member here would make
    // stale rows permanently unremovable.
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (sub === 'manager-add') {
      if (!member) { audit('DENIED', 'not in guild'); return interaction.editReply({ content: `<@${user.id}> is not in this server.` }); }
      if (member.user.bot) { audit('DENIED', 'bot'); return interaction.editReply({ content: 'Bots cannot hold market authority.' }); }
    }

    const before = marketAssignments.getManagerMarkets(user.id);

    if (sub === 'manager-add') {
      // Authority without the Manager role is inert — they still could not reach a manager command.
      const mgrRole = pulseConfig.managerRoleId();
      if (mgrRole && member && !member.roles.cache.has(mgrRole)) {
        audit('DENIED', 'target lacks Manager role');
        return interaction.editReply({ content: `<@${user.id}> does not hold the **Manager** role, so this authority would do nothing. Give them Manager first.` });
      }
      if (before.includes(normalizeMarketId(marketId))) {
        audit('OK', 'idempotent');
        return interaction.editReply({ content: `Already assigned — <@${user.id}> manages **${marketId}**. No change.` });
      }
      const r = marketAssignments.addManagerMarketAssignment(user.id, marketId);
      // The record is the authority, but it is inert until Discord matches it. Reconcile here so
      // the manager can actually SEE the channel — otherwise the assignment silently grants
      // command scope with no visibility, which looks like a broken permission.
      const recon = await marketAssignments.reconcileMemberMarketRoles(interaction.guild, user.id).catch((e) => ({ error: e.message }));
      audit('OK', `before=${before.length} after=${r.markets.length}`);
      return interaction.editReply({
        content: [`✅ <@${user.id}> now manages **${r.marketName}**.`,
          `Before: ${before.length ? before.join(', ') : '(none)'}`,
          `After:  ${r.markets.join(', ')}`,
          recon?.error ? `⚠ Role sync failed (${recon.error}) — run \`/market sync\`.`
            : `Roles: +${recon.add?.length ?? 0} / -${recon.remove?.length ?? 0}`].join('\n'),
      });
    }

    if (sub === 'manager-remove') {
      const r = marketAssignments.removeManagerMarketAssignment(user.id, marketId);
      // Reconcile so the Discord role goes with the record. Without this the person keeps channel
      // visibility they are no longer authorised for, which is the worse half of the failure.
      const recon = await marketAssignments.reconcileMemberMarketRoles(interaction.guild, user.id).catch((e) => ({ error: e.message }));
      audit('OK', `before=${before.length} after=${r.remaining.length}`);
      return interaction.editReply({
        content: [`✅ Removed <@${user.id}> from **${r.marketName}**.`,
          `Before: ${before.length ? before.join(', ') : '(none)'}`,
          `After:  ${r.remaining.length ? r.remaining.join(', ') : '(none)'} — other markets untouched.`,
          recon?.error ? `⚠ Role sync failed (${recon.error}) — run \`/market sync\`.`
            : `Roles: +${recon.add?.length ?? 0} / -${recon.remove?.length ?? 0}`].join('\n'),
      });
    }
    return interaction.editReply({ content: 'Unknown manager subcommand.' });
  } catch (err) {
    audit('ERROR', String(err?.message || err).slice(0, 120));
    return interaction.editReply({ content: `Failed: ${err?.message || err}` }).catch(() => {});
  }
}

/**
 * /admin readiness — the gate before MANAGER_SCOPING_ENABLED=true.
 *
 * Deliberately a slash command rather than a script: assessScopeReadiness reads the market records,
 * which live on Railway's /data volume. Run anywhere else it reports on a stale local file and is
 * worse than useless, because it looks authoritative.
 */
async function handleAdminReadiness(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  await guild.members.fetch().catch(() => null);

  const mgrRoleId = pulseConfig.managerRoleId();
  const mgrRole = mgrRoleId ? guild.roles.cache.get(mgrRoleId) : null;
  const guildMembers = new Map(
    guild.members.cache.map((m) => [m.id, { bot: m.user.bot, hasManagerRole: Boolean(mgrRole && m.roles.cache.has(mgrRole.id)) }]),
  );
  const markets = listMarkets();
  const scopingOn = pulseConfig.managerScopingEnabled();
  const r = assessScopeReadiness({
    guildMembers, markets,
    managerRoleIdValid: Boolean(mgrRole) && pulseConfig.isHealthy(),
    activated: scopingOn,   // after activation, one departed assignee warns instead of blocking
  });

  const tick = (ok) => (ok ? '✅' : '❌');
  const lines = [
    `**Scope readiness** — scoping is currently **${scopingOn ? 'ON' : 'OFF (Stage A hold)'}**`,
    '',
    `${tick(Boolean(mgrRole))} MANAGER_ROLE_ID valid${mgrRole ? ` — \`${mgrRole.name}\`` : ' — unresolved'}`,
    `${tick(pulseConfig.isHealthy())} configuration healthy`,
    `${tick(!isStoreCorrupt())} assignment store readable`,
    `${tick(r.assignedMarkets > 0)} markets with a manager: **${r.assignedMarkets}/${r.activeMarkets}**`,
    `${tick(!r.errors.some((e) => e.includes('no longer in the guild')))} every assignee is still in the server`,
    `${tick(!r.errors.some((e) => e.includes('is a bot')))} no bot holds authority`,
    '',
    ...markets.filter((m) => m.active !== false).map((m) => {
      const ids = m.managerUserIds || [];
      return `• \`${m.marketId}\` — ${ids.length ? ids.map((i) => `<@${i}>`).join(', ') : '**no manager**'}`;
    }),
  ];
  if (r.warnings.length) lines.push('', '**Warnings**', ...r.warnings.map((w) => `⚠ ${w}`));
  if (r.errors.length) lines.push('', '**Errors**', ...r.errors.map((e) => `✗ ${e}`));
  if (r.remediation?.length) lines.push('', '**Fix with**', ...r.remediation.map((c) => `\`${c}\``));
  lines.push('', r.ready
    ? '✅ **READY** — safe to set `MANAGER_SCOPING_ENABLED=true` in Railway.'
    : '❌ **NOT READY** — do not enable scoping yet.');

  await interaction.editReply({ content: lines.join('\n').slice(0, 1900), allowedMentions: { parse: [] } });
}

async function handleMarketRouter(interaction) {
  const sub = interaction.options.getSubcommand();
  const marketId = interaction.options.getString('market') ?? null;
  const isOwner = canUseOwnerCommands(interaction);
  const isManagerTier = canUseAdminCommands(interaction);

  const decision = authorizeMarketCommand({
    userId: interaction.user.id, isOwner, isManagerTier, subcommand: sub, marketId,
    scopingEnabled: pulseConfig.managerScopingEnabled(),
  });

  console.log(auditLine({
    actorId: interaction.user.id,
    action: `market.${sub}`,
    marketId,
    targetUserId: interaction.options.getUser?.('rep')?.id ?? null,
    result: decision.ok ? 'ALLOWED' : 'DENIED',
    detail: decision.ok ? decision.reason : decision.reason.slice(0, 120),
  }));

  if (!decision.ok) {
    const reply = { content: `🚫 ${decision.reason}`, ephemeral: true };
    return interaction.deferred || interaction.replied
      ? interaction.editReply(reply).catch(() => {})
      : interaction.reply(reply).catch(() => {});
  }

  if (sub.startsWith('manager-')) return handleManagerAuthority(interaction, sub);
  if (sub === 'create') return handleMarketCreate(interaction);
  if (sub === 'add') return handleMarketAdd(interaction);
  if (sub === 'rename') return handleMarketRename(interaction);
  if (sub === 'cleanup') return handleMarketCleanup(interaction);
  if (sub === 'remove') return handleAdminUnassignRep(interaction);
  if (sub === 'list') return handleAdminListMarkets(interaction);
  if (sub === 'status') return handleAdminMarketStatus(interaction);
  if (sub === 'sync') return handleAdminSyncPermissions(interaction);
  return interaction.reply({ content: 'Unknown /market subcommand.', ephemeral: true });
}

async function handleAdminAssignRep(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  if (!(await safeDeferEphemeral(interaction))) return;
  const rep = interaction.options.getUser('rep', true);
  const marketId = interaction.options.getString('market_id', true);
  try {
    const { market, roleId } = await assignRepToMarket(
      interaction.guild,
      rep.id,
      marketId,
      marketAccessOpts(),
    );
    await interaction.editReply({
      content: [
        `Assigned <@${rep.id}> to **${market.marketName}**.`,
        `Role: <@&${roleId}>`,
        'They can only see channels locked to this market (other market channels are hidden).',
        '_Do not add reps to a generic role that can see all deal channels._',
      ].join('\n'),
    });
  } catch (err) {
    const msg =
      err.code === 'MARKET_NOT_FOUND' ? err.message : `Could not assign rep: ${err.message || err}`;
    await interaction.editReply({ content: msg });
  }
}

async function handleAdminUnassignRep(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  if (!(await safeDeferEphemeral(interaction))) return;
  const rep = interaction.options.getUser('rep', true);
  try {
    const { removed } = await unassignRepFromMarkets(interaction.guild, rep.id);
    await interaction.editReply({
      content: removed.length
        ? `Removed <@${rep.id}> from ${removed.length} market role(s). They will no longer see locked market channels.`
        : `<@${rep.id}> had no Pulse market roles.`,
    });
  } catch (err) {
    await interaction.editReply({ content: `Could not unassign rep: ${err.message || err}` });
  }
}

async function handleAdminSyncPermissions(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  if (!(await safeDeferEphemeral(interaction))) return;
  try {
    const results = await syncAllMarketChannelPermissions(
      interaction.guild,
      client.user.id,
      marketAccessOpts(),
    );
    await interaction.editReply({
      content: [
        '**Market channel permissions synced.**',
        `Locked **${results.ok}** channel(s).`,
        results.failed.length
          ? `Failed: ${results.failed.slice(0, 5).map((f) => f.channelId || f.marketId).join(', ')}${results.failed.length > 5 ? '…' : ''}`
          : null,
        '_Reps need `/admin assign-rep` — adding them to the server alone does not assign a market._',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  } catch (err) {
    await interaction.editReply({ content: `Sync failed: ${err.message || err}` });
  }
}

async function handleAdminMarketStatus(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const channel = optionChannelOrCurrent(interaction);
  const market = marketForChannel(channel);
  await interaction.editReply({
    content: [
      `Channel: <#${channel?.id || interaction.channelId}>`,
      market
        ? `Market: ${market.marketName} (${market.marketId})`
        : 'Market: Unassigned',
    ].join('\n'),
  });
}

async function handleMarkets(interaction) {
  await interaction.deferReply();
  const data = await readLeaderboard();
  await interaction.editReply({ content: buildMarketsBoardContent(data), embeds: [] });
}

async function handleAdminStatus(interaction) {
  if (!canUseAdminCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const data = await readLeaderboard();
  const approvedChannelsCount = approvedChannelsForGuild(interaction.guild).filter((c) => c.active).length;
  const snapshot = buildAdminStatusSnapshot(data, {
    approvedChannelsCount,
    tz: getTimeZone(),
  });

  await interaction.editReply({
    content: [
      'Pulse Bot Status',
      '',
      `Bot online: ${client.isReady() ? 'yes' : 'no'}`,
      `Current weekId: ${snapshot.weekId == null ? 'unknown' : snapshot.weekId}`,
      `Total logged deals: ${snapshot.totalDeals}`,
      `Today's deals: ${snapshot.todayDeals}`,
      `This week's deals: ${snapshot.weeklyDeals}`,
      `Approved blitz channels: ${snapshot.approvedChannelsCount}`,
      `Storage mode: ${snapshot.storageMode}`,
      `Last weekly reset: ${snapshot.lastWeeklyResetAt || 'not recorded'}`,
      `Timezone: ${snapshot.timezone}`,
    ].join('\n'),
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
  if (!canUseOwnerCommands(interaction)) {
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

function resolveAdminSubcommand(interaction) {
  let sub = null;
  try {
    sub = interaction.options.getSubcommand(false);
  } catch {
    return null;
  }
  if (!sub) return null;
  const aliases = {
    assign_rep: 'assign-rep',
    unassign_rep: 'unassign-rep',
    sync_permissions: 'sync-permissions',
    delete_market: 'delete-market',
    edit_market: 'edit-market',
  };
  return aliases[sub] || sub;
}

async function handleAdmin(interaction) {
  const subcommand = resolveAdminSubcommand(interaction);
  console.log('[Pulse] /admin subcommand:', subcommand || '(none)');
  if (!subcommand) {
    return interaction.reply({
      content: 'Pick an admin action from the list (e.g. **assign-rep**, **sync-permissions**).',
      ephemeral: true,
    });
  }
  if (subcommand === 'add-market') return handleAdminAddMarket(interaction);
  if (subcommand === 'edit-market') return handleAdminEditMarket(interaction);
  if (subcommand === 'list-markets') return handleAdminListMarkets(interaction);
  if (subcommand === 'delete-market') return handleAdminDeleteMarket(interaction);
  if (subcommand === 'connect-channel') return handleAdminConnectChannel(interaction);
  if (subcommand === 'market-status') return handleAdminMarketStatus(interaction);
  if (subcommand === 'add-channel') return handleAdminAddChannel(interaction);
  if (subcommand === 'remove-channel') return handleAdminRemoveChannel(interaction);
  if (subcommand === 'list-channels') return handleAdminListChannels(interaction);
  if (subcommand === 'readiness') return handleAdminReadiness(interaction);
  if (subcommand === 'status') return handleAdminStatus(interaction);
  if (subcommand === 'stats') return handleAdminStats(interaction);
  if (subcommand === 'export-csv') return handleAdminExportCsv(interaction);
  if (subcommand === 'assign-rep') return handleAdminAssignRep(interaction);
  if (subcommand === 'unassign-rep') return handleAdminUnassignRep(interaction);
  if (subcommand === 'sync-permissions') return handleAdminSyncPermissions(interaction);
  console.warn('[Pulse] Unknown admin subcommand:', subcommand);
  return interaction.reply({
    content: `Unknown admin subcommand: \`${subcommand || 'none'}\`. Redeploy commands and restart the bot.`,
    ephemeral: true,
  });
}

async function handleExport(interaction) {
  if (!canUseOwnerCommands(interaction)) {
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

  await backupAndLogAction({
    action: 'unapprove-blitz',
    actorId: interaction.user.id,
    actorName: interaction.member?.displayName || interaction.user.username,
    targetFilePath: APPROVED_CHANNELS_PATH,
    details: { source: 'legacy-unapprove', channelId: interaction.channelId },
  });
  const removed = unapproveDealChannel(interaction.channelId);
  const marketRemoval = removeChannelFromMarket(interaction.channelId);
  await safeAppendActionLog({
    action: 'unapprove-blitz.completed',
    actorId: interaction.user.id,
    actorName: interaction.member?.displayName || interaction.user.username,
    details: {
      source: 'legacy-unapprove',
      channelId: interaction.channelId,
      removed,
      marketRemoved: marketRemoval.removed,
    },
  });
  await interaction.editReply({
    content: [
      removed ? 'This channel is no longer an approved blitz channel.' : 'This channel was not approved.',
      marketRemoval.removed ? `Market mapping removed from ${marketRemoval.market.marketName}.` : null,
    ].filter(Boolean).join('\n'),
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
  if (!canUseOwnerCommands(interaction)) {
    await denyAdmin(interaction);
    return;
  }

  await interaction.deferReply();
  const archivePath = path.join(__dirname, 'leaderboard_archive.json');
  const tz = getTimeZone();

  await backupAndLogAction({
    action: 'reset-weekly',
    actorId: interaction.user.id,
    actorName: interaction.member?.displayName || interaction.user.username,
    targetFilePath: DATA_PATH,
    details: { command: '/reset-weekly' },
  });

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
    d.metadata.lastWeeklyResetAt = archiveEntry.archivedAt;
    d.metadata.lastWeeklyResetBy = interaction.user.id;
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
            `New active **week id ${archiveEntry.weekId + 1}** — weekly leaderboards now start from this id.`,
            '',
            '_All-time logs stay in `leaderboard.json`. Weekly views filter by `weekId`._',
          ].join('\n'),
        ),
    ],
  });

  await safeAppendActionLog({
    action: 'reset-weekly.completed',
    actorId: interaction.user.id,
    actorName: interaction.member?.displayName || interaction.user.username,
    details: {
      previousWeekId: archiveEntry.weekId,
      newWeekId: archiveEntry.weekId + 1,
      archivePath,
      archivedAt: archiveEntry.archivedAt,
    },
  });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

// discord.js renamed 'ready' -> 'clientReady' partway through v14 and warns if you listen to the
// old name. Listen for BOTH so the boot sequence can't depend on which version Railway installs,
// with a latch because both fire in the versions that emit both — running startup twice would
// double-sync market permissions and double-register handlers.
let bootstrapped = false;
let tfiberProofMaintenanceStarted = false;
const onClientReady = async () => {
  if (bootstrapped) return;
  bootstrapped = true;
  await bootstrap();
};
client.once('clientReady', onClientReady);
client.once('ready', onClientReady);

async function bootstrap() {
  const appId = process.env.CLIENT_ID || client.application?.id || 'unknown';
  console.log(
    `Pulse online as ${client.user.tag} (pid ${process.pid}) · build ${PULSE_BUILD} · app ${appId} · ONE reply per log`,
  );
  const host = process.env.RAILWAY_ENVIRONMENT
    ? `Railway (${process.env.RAILWAY_SERVICE_NAME || 'pulse'})`
    : 'local';
  const dataDir = require('./paths').getPulseDataDir();
  console.log(`[Pulse] Host: ${host} · data dir: ${dataDir}`);
  if (!process.env.RAILWAY_ENVIRONMENT) {
    console.log('[Pulse] Production should run on Railway only — stop local npm start to avoid duplicate replies.');
  }
  const boot = ensureDefaultMarkets('startup');
  if (boot.length) {
    console.log(`[Pulse] Auto-registered markets: ${boot.map((m) => m.marketId).join(', ')}`);
  }
  // Validate configuration against the LIVE guild before touching a single permission.
  //
  // This is the gate that would have prevented the manager-access outage: MANAGER_ROLE_ID was
  // undefined on Railway, both consumers read it as "tier does not exist", and the incomplete
  // desired state was written to every market channel on every restart. Now an invalid config
  // marks the process unhealthy and BLOCKS permission reconciliation, so a bad config can never
  // silently rewrite access.
  const configReport = await pulseConfig.validateAgainstGuild(client.guilds.cache.first() ?? null);
  pulseConfig.markHealth(configReport);
  console.log(pulseConfig.formatReport(configReport));
  if (!configReport.ok) {
    console.error('[Pulse] UNHEALTHY — configuration invalid. Channel permission reconciliation is DISABLED');
    console.error('[Pulse] until it is fixed, so an incomplete desired state cannot be written to market channels.');
  }

  // Fail loud, before anything can write. readLeaderboard throws PULSE_DATA_CORRUPT rather than
  // replacing an unreadable file with an empty one, so this is the last moment we can stop while
  // the real data is still on disk and recoverable.
  try {
    await readLeaderboard();
  } catch (err) {
    if (err?.code === CORRUPT_CODE) {
      // The one case worth dying for: the file exists but is unparseable. Continuing would let the
      // next write replace real history with an empty file.
      console.error(`\n[Pulse] REFUSING TO START — leaderboard data is unreadable.\n${err.message}\n`);
      process.exit(1);
    }
    // Anything else (volume not mounted yet, transient EACCES, ENOSPC) must NOT take the bot down.
    // Rethrowing here surfaced as an unhandled rejection inside the ready handler and killed the
    // process — a far worse outcome than a noisy log, since deal logging stops for everyone.
    console.error(`[Pulse] Startup leaderboard read failed (continuing): ${err?.message || err}`);
  }

  if (!tfiberProofMaintenanceStarted) {
    tfiberProofMaintenanceStarted = true;
    runTfiberProofMaintenance();
    setInterval(runTfiberProofMaintenance, 15 * 60 * 1000).unref?.();
  }

  // Reconciliation writes desired state with permissionOverwrites.set(). Running it from an
  // invalid config is precisely how manager access was erased — so it does not run at all.
  if (!pulseConfig.isHealthy()) {
    console.error('[Pulse] Skipping market permission sync — configuration is unhealthy. Existing channel permissions left untouched.');
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    syncAllMarketChannelPermissions(guild, client.user.id, marketAccessOpts())
      .then((r) => {
        if (r.ok) console.log(`[Pulse] Synced market locks on ${r.ok} channel(s) in ${guild.name}`);
        if (r.failed.length) console.warn(`[Pulse] Market sync failures in ${guild.name}:`, r.failed.length);
      })
      .catch((err) => console.error(`[Pulse] Market permission sync failed (${guild.name}):`, err.message || err));
  }
}

/**
 * Greet a new member in #welcome, right next to the "Set My Name" button.
 *
 * Replaces Sapphire greeting people in #pulse-help — the one channel that was 93% bot noise with
 * zero human conversation, and nowhere near the action a new person actually needs to take. The
 * greeting and the button now live in the same place, which is the whole point: someone joins,
 * sees their name, and the next step is one click away.
 */
/** Members already greeted this process-lifetime. Discord can redeliver guildMemberAdd, and a
 *  rejoin re-fires it, so without this a member can be welcomed several times. */
const greeted = new Set();

client.on('guildMemberAdd', async (member) => {
  try {
    if (member.user.bot) return;
    if (greeted.has(member.id)) return;
    greeted.add(member.id);
    setTimeout(() => greeted.delete(member.id), 10 * 60 * 1000).unref?.();

    const welcome = member.guild.channels.cache.find((c) => c.name === WELCOME_CHANNEL && c.isTextBased?.());
    if (!welcome) {
      // Silence here meant nobody could onboard and nobody knew. Say it where leadership will see.
      console.error(`[Pulse] #${WELCOME_CHANNEL} not found — ${member.user.username} received no welcome.`);
      await notifyManagement(member.guild, `⚠ <@${member.id}> joined but **#${WELCOME_CHANNEL} was not found**, so they got no onboarding prompt. Create the channel or they cannot be set up.`);
      return;
    }
    const perms = welcome.permissionsFor(member.guild.members.me);
    if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
      console.error(`[Pulse] No SendMessages in #${WELCOME_CHANNEL} — ${member.user.username} received no welcome.`);
      await notifyManagement(member.guild, `⚠ <@${member.id}> joined but Pulse cannot post in **#${WELCOME_CHANNEL}**. Grant Send Messages there.`);
      return;
    }

    // The button is attached to THIS message, not to a pinned panel elsewhere. Previously the text
    // said "the button above" while every new join pushed that panel further up the channel — so
    // for the second joiner onward the instruction was simply wrong.
    await welcome.send({
      content: [
        `👋 Welcome to **FiberSales**, <@${member.id}>.`,
        '',
        '**Tap the button below and enter your real name.** That is how your manager finds you and gets you into your market channel.',
        'Until then you can read around, but market channels stay hidden.',
      ].join('\n'),
      components: [setNameRow()],
      allowedMentions: { users: [member.id] },
    });
  } catch (err) {
    console.error('[Pulse] Welcome message failed:', err.message || err);
  }
});

async function replySlashHint(message, hintKey) {
  const text = SLASH_HINTS[hintKey];
  if (!text) return;
  await message
    .reply({ content: text, allowedMentions: { parse: [] } })
    .catch(() => {});
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (message.webhookId) return;
    if (!message.guild) {
      await handleTfiberProofDm(message);
      return;
    }
    if (!message.channel) return;
    const dealChannel = await resolveDealChannelForMessage(message);
    if (!dealChannel || typeof dealChannel.name !== 'string' || !dealChannel.name) return;
    if (await handleTextAdminCommand(message)) return;

    const boardIntent = parseLeaderboardTextIntent(message.content);
    if (boardIntent) {
      await handleTextLeaderboard(message, boardIntent);
      return;
    }

    // Everything a rep needs mid-shift has to work as plain text, same as logging "1g".
    const textCmd = parseTextCommandIntent(message.content);
    if (textCmd) {
      await handleTextCommand(message, textCmd);
      return;
    }

    if (channelNameMatchesDealRules(dealChannel.name, getApprovedChannelRules())) {
      ensureDealChannelRegistered(message.channel, message.author.id);
    }

    if (!isApprovedDealChannel(message.channel)) return;

    const channel = message.channel;
    const channelMarketIdentity = marketIdentityForChannel(channel);
    const channelBlitzName = approvedBlitzNameForChannel(channel) || blitzFromChannelName(channel.name);
    const isTfiberProofChannel = channelNeedsTfiberProofContext(channel, channelMarketIdentity, channelBlitzName);
    const messageHasScreenshot = hasScreenshotAttachment(message);
    const hasMessageText = typeof message.content === 'string' && !!message.content.trim();

    if (!hasMessageText) {
      if (messageHasScreenshot && isTfiberProofChannel) {
        const handled = await handleTfiberProofChannelUpload(message, channel);
        if (!handled) rememberTfiberChannelScreenshot(message, channel);
      }
      return;
    }

    const logIntent = detectTextLogIntent(message.content);
    if (logIntent) {
      await replySlashHint(message, logIntent);
      return;
    }

    const parsed = parseDealMessage(message.content);
    if (!parsed.ok || !parsed.speeds.length) {
      if (isTfiberProofChannel && (messageHasScreenshot || extractTmoOrderId(message.content))) {
        const handled = await handleTfiberProofChannelUpload(message, channel);
        if (!handled) rememberTfiberChannelScreenshot(message, channel);
      }
      return;
    }
    if (recentLogReplies.has(message.id)) return;

    if (!isQuickNaturalLog(parsed)) {
      await replySlashHint(message, 'needSlashLog');
      return;
    }

    const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

    const tz = getTimeZone();
    const now = new Date();
    const blitzName = channelBlitzName;
    const marketIdentity = channelMarketIdentity;
    if (!marketIdentity.assigned) {
      console.warn(
        '[Pulse][UnassignedMarket] natural log allowed without market mapping',
        JSON.stringify({ channelId: channel.id, channelName: channel.name, userId: message.author.id }),
      );
    }
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
      marketId: marketIdentity.marketId,
      marketName: marketIdentity.marketName,
      weekId: data.metadata.weekId,
    });

    if (parsed.speeds.length === 1) {
      const speed = parsed.speeds[0];
      const replyKeys = logReplyKeys({ messageId: message.id });
      if (!tryClaimLogReply(replyKeys)) return;

      recentLogReplies.add(message.id);
      setTimeout(() => recentLogReplies.delete(message.id), 120_000);

      const appendResult = await appendSingleDealLog({
        userId,
        speed,
        channelId: channel.id,
        sourceMessageId: message.id,
        buildLogEntry: (data) => buildLogEntry(data, speed, 0),
      });

      if (appendResult.duplicateMessage) return;

      let tfiberProofLine = null;
      if (requiresTfiberProof({ speeds: [speed], channelName: channel.name, blitzName, marketName: marketIdentity.marketName, marketId: marketIdentity.marketId })) {
        const proofMessage = proofMessageForTfiberLog(message, channel);
        const result = await syncTfiberProofForLog({
          message: proofMessage,
          logEntry: appendResult.logEntry,
          speed,
          blitzName,
          marketIdentity,
          now,
        });
        tfiberProofLine = formatTfiberProofLine(result);
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
        extraConfirmationLine: tfiberProofLine,
        editConfirmation: (payload) =>
          message.reply({ content: payload.content, embeds: payload.embeds, allowedMentions: { parse: [] } }),
      });
      return;
    }

    const batchKeys = logReplyKeys({ messageId: message.id });
    if (!tryClaimLogReply(batchKeys)) return;
    recentLogReplies.add(message.id);
    setTimeout(() => recentLogReplies.delete(message.id), 120_000);

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
    const { content, primary, hypeLine } = buildDealLogConfirmationPayload({
      ctx,
      dataBefore: result.dataBefore,
      dataAfter: result.data,
      now,
      tz,
    });

    const tfiberLines = [];
    if (requiresTfiberProof({ speeds: parsed.speeds, channelName: channel.name, blitzName, marketName: marketIdentity.marketName, marketId: marketIdentity.marketId })) {
      for (const [idx, logEntry] of (result.logEntries || []).entries()) {
        const syncResult = await syncTfiberProofForLog({
          message,
          logEntry,
          speed: logEntry.speed,
          blitzName,
          marketIdentity,
          now,
        });
        const line = formatTfiberProofLine(syncResult);
        if (line) tfiberLines.push(line);
      }
    }
    const uniqueTfiberLines = [...new Set(tfiberLines)];
    await message.reply({ content: uniqueTfiberLines.length ? `${content}\n${uniqueTfiberLines.join('\n')}` : content, allowedMentions: { parse: [] } }).catch((err) => {
      console.error('Natural log reply failed:', err.message || err);
    });
    await recordGamificationAfterLog({
      dataBefore: result.dataBefore,
      dataAfter: result.data,
      userId,
      displayName,
      blitzName,
      channelId: channel.id,
      speeds: parsed.speeds,
      now,
      tz,
      primaryLineId: primary?.id || null,
      primaryEvent: primary?.event || null,
      suppressPersonalHype: true,
      confirmationHype: hypeLine,
    });
  } catch (e) {
    console.error(e);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete()) {
    try {
      const focused = interaction.options.getFocused(true);
      const subcommand = interaction.options.getSubcommand(false);
      const isMarketCreateChannel =
        interaction.commandName === 'market' &&
        subcommand === 'create' &&
        focused.name === 'channel';
      if (focused.name === 'channel_ref' || isMarketCreateChannel) {
        await interaction.respond(await buildChannelAutocompleteChoices(interaction.guild, focused.value));
        return;
      }
      // /admin uses "market_id"; /market uses the friendlier "market". Same picker behind both.
      if (focused.name !== 'market_id' && focused.name !== 'market') {
        await interaction.respond([]);
        return;
      }
      await interaction.respond(buildMarketAutocompleteChoices(focused.value));
    } catch (err) {
      console.error('[Pulse] Autocomplete failed:', err.message || err);
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  // --- Self-service real-name capture -------------------------------------------------------
  // Deliberately does NOT let people pick their own market (owner decision 2026-07-28) — someone
  // would land in the wrong channel or one they should not see. All this does is answer "who is
  // dboy1011?", which is the question that made the whole server hard to run. A manager still adds
  // them to a market afterwards with /market add.
  if (interaction.isButton() && interaction.customId === SET_NAME_ID) {
    const modal = new ModalBuilder().setCustomId(SET_NAME_ID).setTitle('What is your real name?');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('realname').setLabel('Full name').setPlaceholder('Riley Graves')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('handle').setLabel('What do people call you? (optional)')
          .setPlaceholder('Mooch').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20),
      ),
    );
    await interaction.showModal(modal).catch(() => {});
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === SET_NAME_ID) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const realName = interaction.fields.getTextInputValue('realname').trim();
    const handle = (interaction.fields.getTextInputValue('handle') || '').trim() || null;
    const nickname = buildNickname(realName, handle);
    if (!realName || realName.length < 2) {
      await interaction.editReply({ content: '❌ That does not look like a name. Tap the button again and enter your full name.' }).catch(() => {});
      return;
    }

    let nicknameSet = false;
    let failureReason = null;
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      // Duplicate-name check. Two people showing the same nickname is exactly the confusion this
      // whole flow exists to remove, so warn rather than silently create a second "Noah Mills".
      await interaction.guild.members.fetch().catch(() => null);
      const clash = interaction.guild.members.cache.find(
        (m) => m.id !== member.id && m.displayName.replace(/\s*\(.*\)$/, '').toLowerCase() === realName.toLowerCase(),
      );

      try {
        await member.setNickname(nickname, 'Self-service real-name capture');
        nicknameSet = true;
      } catch (err) {
        // Discord refuses if their top role outranks Pulse, or they own the server. Expected for
        // managers — not an error the member should see as a failure.
        failureReason = err?.message || String(err);
      }

      await interaction.editReply({
        content: nicknameSet
          ? [`✅ Thanks — you will show up as **${nickname}**.`,
             clash ? `\n⚠ Heads up: **${clash.displayName}** already goes by that name. A manager will sort it out.` : '',
             '\nA manager adds you to your market next — your market channel appears once they do.'].join('')
          : `✅ Got it — **${nickname}**.\nPulse could not set it automatically (your role sits above the bot), so a manager will apply it. Nothing else needed from you.`,
      }).catch(() => {});

      const posted = await notifyManagement(interaction.guild, [
        `🆕 **${nickname}** — \`@${interaction.user.username}\` (<@${interaction.user.id}>)`,
        nicknameSet ? '' : '⚠ nickname NOT applied — role hierarchy. Set it by hand.',
        clash ? `⚠ duplicate name: **${clash.displayName}** already uses it.` : '',
        `\`/market add rep:@${interaction.user.username} name:"${realName}" market:…\``,
      ].filter(Boolean).join('\n'));
      // Privacy-safe log: ids and outcome, never the entered name.
      console.log(`[Pulse] name capture user=${interaction.user.id} applied=${nicknameSet} clash=${Boolean(clash)} queued=${posted}`);
    } catch (err) {
      console.error(`[Pulse] name capture failed user=${interaction.user.id}: ${err?.message || err}`);
      await interaction.editReply({ content: 'Something went wrong saving that. A manager has been notified — you are not stuck.' }).catch(() => {});
      await notifyManagement(interaction.guild, `⚠ Name capture failed for <@${interaction.user.id}> (\`@${interaction.user.username}\`). Set their nickname by hand.`);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Pulse commands only work in a server.', ephemeral: true });
      return;
    }

    const leaderboardPeriod = (raw) => {
      const mk = (tf) => ({ timeframe: tf, label: phase3PeriodLabel(tf) });
      const map = {
        daily: mk('daily'),
        yesterday: mk('yesterday'),
        week: mk('weekly'),
        weekly: mk('weekly'),
        'last-week': mk('lastweek'),
        lastweek: mk('lastweek'),
        month: mk('monthly'),
        monthly: mk('monthly'),
        'last-month': mk('lastmonth'),
        lastmonth: mk('lastmonth'),
        alltime: mk('alltime'),
      };
      return map[raw] || map.daily;
    };

    switch (interaction.commandName) {
      case 'log':
        await handleLog(interaction);
        break;
      case 'admin':
        await handleAdmin(interaction);
        break;
      case 'assign-rep':
        await handleAdminAssignRep(interaction);
        break;
      case 'unassign-rep':
        await handleAdminUnassignRep(interaction);
        break;
      case 'sync-permissions':
        await handleAdminSyncPermissions(interaction);
        break;
      case 'leaderboard': {
        const cfg = leaderboardPeriod(interaction.options.getString('period') || 'daily');
        await handlePhase3Leaderboard(interaction, cfg);
        break;
      }
      case 'blitz':
        await handlePhase3Leaderboard(interaction, { timeframe: 'alltime', label: phase3PeriodLabel('alltime') });
        break;
      case 'daily':
        await handlePhase3Leaderboard(interaction, { timeframe: 'daily', label: phase3PeriodLabel('daily') });
        break;
      case 'yesterday':
        await handlePhase3Leaderboard(interaction, { timeframe: 'yesterday', label: phase3PeriodLabel('yesterday') });
        break;
      case 'weekly':
        await handlePhase3Leaderboard(interaction, { timeframe: 'weekly', label: phase3PeriodLabel('weekly') });
        break;
      case 'lastweek':
        await handlePhase3Leaderboard(interaction, { timeframe: 'lastweek', label: phase3PeriodLabel('lastweek') });
        break;
      case 'monthly':
        await handlePhase3Leaderboard(interaction, { timeframe: 'monthly', label: phase3PeriodLabel('monthly') });
        break;
      case 'lastmonth':
        await handlePhase3Leaderboard(interaction, { timeframe: 'lastmonth', label: phase3PeriodLabel('lastmonth') });
        break;
      case 'master': {
        const period = interaction.options.getString('period') || 'daily';
        await handlePhase3Master(interaction, period);
        break;
      }
      case 'quarter':
        await handleQuarter(interaction);
        break;
      case 'markets':
        await handleMarkets(interaction);
        break;
      case 'market':
        await handleMarketRouter(interaction);
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
        await interaction.editReply({ content: 'Pulse hit an error.', embeds: [] }).catch(() => {});
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

/**
 * Graceful shutdown. Railway sends SIGTERM on every redeploy and on any manual stop; without this
 * the process is force-killed, which Railway records as a failure and then restarts under
 * ON_FAILURE. Exiting 0 tells the platform this was an orderly stop, not a crash.
 *
 * Kept deliberately small: close the Discord connection, release the lock (process-lock's own
 * 'exit' handler does that), exit 0. A hard timeout guarantees we exit even if destroy() hangs,
 * because Railway will SIGKILL us shortly anyway and a clean 0 is better than being killed.
 */
function installGracefulShutdown() {
  let stopping = false;
  const stop = (signal) => async () => {
    if (stopping) return;
    stopping = true;
    console.log(`[Pulse] ${signal} received — shutting down cleanly.`);
    const hardExit = setTimeout(() => process.exit(0), 4000);
    hardExit.unref?.();
    try { await client.destroy(); } catch { /* already gone */ }
    process.exit(0);
  };
  process.on('SIGTERM', stop('SIGTERM'));
  process.on('SIGINT', stop('SIGINT'));
}

async function startBot() {
  installGracefulShutdown();
  const lock = acquireProcessLock();
  if (!lock.ok) {
    console.error(
      `[Pulse] Another instance is already running (pid ${lock.pid}${lock.startedAt ? `, started ${lock.startedAt}` : ''}). Stop it before starting again.`,
    );
    process.exit(1);
  }

  try {
    const maintenance = await runStartupMaintenance();
    if (maintenance.backedUp.length) {
      console.log(`[Pulse] Startup backups: ${maintenance.backedUp.join(', ')}`);
    }
    if (maintenance.pruned > 0) {
      console.log(`[Pulse] Pruned ${maintenance.pruned} old backup file(s).`);
    }
  } catch (err) {
    console.warn('[Pulse] Startup maintenance skipped:', err.message || err);
  }

  try {
    const health = await collectStartupHealth();
    console.log(formatHealthReport(health));
  } catch (err) {
    console.error('Pulse startup health check failed:', err.message || err);
  }

  if (!token) {
    console.error('Missing DISCORD_TOKEN in .env');
    process.exit(1);
  }

  if (process.env.RAILWAY_ENVIRONMENT && !process.env.PULSE_DATA_DIR?.trim()) {
    const fsSync = require('fs');
    const dataMount = '/data';
    if (fsSync.existsSync(dataMount) && fsSync.statSync(dataMount).isDirectory()) {
      process.env.PULSE_DATA_DIR = dataMount;
      console.warn(
        '[Pulse] PULSE_DATA_DIR was not in Railway Variables — using volume mount at /data. Add PULSE_DATA_DIR=/data in Variables to silence this.',
      );
    } else {
      console.error(
        '[Pulse][FATAL] Railway deploy without PULSE_DATA_DIR — leaderboard will reset every deploy.',
      );
      console.error('[Pulse][FATAL] Add a volume at /data and set PULSE_DATA_DIR=/data, then redeploy.');
      console.error(
        `[Pulse][FATAL] Debug: service=${process.env.RAILWAY_SERVICE_NAME || '(unknown)'} · /data exists=${fsSync.existsSync(dataMount)}`,
      );
      process.exit(1);
    }
  }

  try {
    await client.login(token);
  } catch (err) {
    console.error('Pulse login failed:', err.message || err);
    process.exit(1);
  }
}

startBot();
