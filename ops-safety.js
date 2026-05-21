const fs = require('fs/promises');
const path = require('path');

const { DATA_PATH } = require('./storage');
const { APPROVED_CHANNELS_PATH } = require('./deal-channels');
const { getTimeZone, filterToday, filterByWeekId } = require('./stats');
const { dataPath } = require('./paths');

const ACTION_LOG_PATH = dataPath('admin-actions.log');
const BACKUP_DIR = dataPath('backups');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function safeStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function pruneBackups(maxFiles = 40) {
  if (!(await pathExists(BACKUP_DIR))) return { pruned: 0 };
  const entries = await fs.readdir(BACKUP_DIR);
  const files = [];
  for (const name of entries) {
    const full = path.join(BACKUP_DIR, name);
    try {
      const stat = await fs.stat(full);
      if (stat.isFile()) files.push({ full, mtime: stat.mtimeMs });
    } catch {
      /* skip */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  let pruned = 0;
  for (const file of files.slice(maxFiles)) {
    await fs.unlink(file.full).catch(() => {});
    pruned += 1;
  }
  return { pruned };
}

async function runStartupMaintenance() {
  await ensureBackupDir();
  const backedUp = [];
  for (const sourcePath of [DATA_PATH, APPROVED_CHANNELS_PATH]) {
    const result = await createTimestampedBackup(sourcePath, 'startup');
    if (result.ok) backedUp.push(path.basename(result.backupPath));
  }
  const { pruned } = await pruneBackups(40);
  return { backedUp, pruned };
}

async function createTimestampedBackup(sourcePath, label = 'snapshot') {
  if (!(await pathExists(sourcePath))) {
    return { ok: false, reason: 'missing_source', sourcePath };
  }
  await ensureBackupDir();
  const base = path.basename(sourcePath);
  const backupPath = path.join(BACKUP_DIR, `${base}.${label}.${safeStamp()}.bak`);
  await fs.copyFile(sourcePath, backupPath);
  return { ok: true, sourcePath, backupPath };
}

async function appendActionLog(entry) {
  const row = {
    at: new Date().toISOString(),
    ...entry,
  };
  await fs.appendFile(ACTION_LOG_PATH, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

async function collectStartupHealth({
  env = process.env,
  dataPath = DATA_PATH,
  approvedPath = APPROVED_CHANNELS_PATH,
} = {}) {
  const tokenPresent = Boolean((env.DISCORD_TOKEN || '').trim());
  const guildIdPresent = Boolean((env.GUILD_ID || '').trim());
  const clientIdPresent = Boolean((env.CLIENT_ID || '').trim());
  const dashboardSecretPresent = Boolean((env.DASHBOARD_SECRET || '').trim());
  const dataFileExists = await pathExists(dataPath);
  const approvedFileExists = await pathExists(approvedPath);
  const timezone = getTimeZone();

  let leaderboard = null;
  try {
    if (dataFileExists) {
      const raw = await fs.readFile(dataPath, 'utf8');
      leaderboard = JSON.parse(raw);
    }
  } catch {
    leaderboard = null;
  }

  const logs = Array.isArray(leaderboard?.logs) ? leaderboard.logs : [];
  const users = leaderboard?.users && typeof leaderboard.users === 'object' ? leaderboard.users : {};
  const metadata = leaderboard?.metadata && typeof leaderboard.metadata === 'object' ? leaderboard.metadata : {};

  let marketsCount = 0;
  if (approvedFileExists) {
    try {
      const approvedRaw = await fs.readFile(approvedPath, 'utf8');
      const approvedParsed = JSON.parse(approvedRaw);
      marketsCount = Array.isArray(approvedParsed?.markets) ? approvedParsed.markets.length : 0;
    } catch {
      marketsCount = 0;
    }
  }

  const report = {
    tokenPresent,
    guildIdPresent,
    clientIdPresent,
    dataPath,
    approvedPath,
    dataFileExists,
    approvedFileExists,
    marketsCount,
    weekId: typeof metadata.weekId === 'number' ? metadata.weekId : null,
    totalLogs: logs.length,
    totalUsers: Object.keys(users).length,
    timezone,
    dashboard: {
      enabled: dashboardSecretPresent,
      port: Number(env.DASHBOARD_PORT || 3050),
      host: env.DASHBOARD_HOST || '0.0.0.0',
    },
    warnings: [],
  };

  if (!dataFileExists) report.warnings.push('leaderboard.json missing (will be created automatically).');
  if (!approvedFileExists) report.warnings.push('approved-blitz-channels.json missing (channel approvals may rely on env/defaults).');
  if (!tokenPresent) report.warnings.push('DISCORD_TOKEN missing.');
  if (!guildIdPresent) report.warnings.push('GUILD_ID missing (slash deploy scripts will fail).');
  if (!clientIdPresent) report.warnings.push('CLIENT_ID missing (slash deploy scripts will fail).');

  return report;
}

function formatHealthReport(report) {
  return [
    '--- Pulse Startup Health ---',
    `DISCORD_TOKEN: ${report.tokenPresent ? 'present' : 'missing'}`,
    `GUILD_ID: ${report.guildIdPresent ? 'present' : 'missing'}`,
    `CLIENT_ID: ${report.clientIdPresent ? 'present' : 'missing'}`,
    `Data file path: ${report.dataPath}`,
    `leaderboard.json exists: ${report.dataFileExists ? 'yes' : 'no'}`,
    `approved-blitz-channels.json exists: ${report.approvedFileExists ? 'yes' : 'no'}`,
    `Current weekId: ${report.weekId == null ? 'unknown' : report.weekId}`,
    `Total deal logs: ${report.totalLogs}`,
    `Total users tracked: ${report.totalUsers}`,
    `Timezone: ${report.timezone}`,
    `Dashboard: ${report.dashboard.enabled ? 'enabled' : 'disabled'} (host ${report.dashboard.host}, port ${report.dashboard.port})`,
    ...(report.warnings.length
      ? ['Warnings:', ...report.warnings.map((w) => ` - ${w}`)]
      : ['Warnings: none']),
    '----------------------------',
  ].join('\n');
}

function buildAdminStatusSnapshot(data, { approvedChannelsCount = 0, now = new Date(), tz = getTimeZone() } = {}) {
  const logs = (data?.logs || [])
    .filter((l) => l && !l.removed && !l.removedAt && !l.deletedAt && !l.voidedAt)
    .map((l) => ({ ...l, speed: l.correctedSpeed || l.speed }));
  const todayDeals = filterToday(logs, tz).length;
  const currentWeekId = data?.metadata?.weekId;
  const weeklyDeals = typeof currentWeekId === 'number' ? filterByWeekId(logs, currentWeekId).length : 0;
  return {
    onlineStatus: 'online',
    asOf: now.toISOString(),
    weekId: typeof currentWeekId === 'number' ? currentWeekId : null,
    totalDeals: logs.length,
    todayDeals,
    weeklyDeals,
    approvedChannelsCount,
    storageMode: `json-file (${path.basename(DATA_PATH)})`,
    lastWeeklyResetAt: data?.metadata?.lastWeeklyResetAt || null,
    timezone: tz,
  };
}

module.exports = {
  ACTION_LOG_PATH,
  BACKUP_DIR,
  pathExists,
  createTimestampedBackup,
  appendActionLog,
  pruneBackups,
  runStartupMaintenance,
  collectStartupHealth,
  formatHealthReport,
  buildAdminStatusSnapshot,
};
