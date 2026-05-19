const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { isApprovedDealChannel } = require('./deal-channels');
const {
  pathExists,
  createTimestampedBackup,
  collectStartupHealth,
  buildAdminStatusSnapshot,
} = require('./ops-safety');

test('startup health check handles missing files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-health-'));
  const missingDataPath = path.join(root, 'missing-leaderboard.json');
  const missingApprovedPath = path.join(root, 'missing-approved.json');

  const report = await collectStartupHealth({
    env: {
      DISCORD_TOKEN: '',
      GUILD_ID: '',
      CLIENT_ID: '',
      TZ: 'America/New_York',
      DASHBOARD_SECRET: '',
    },
    dataPath: missingDataPath,
    approvedPath: missingApprovedPath,
  });

  assert.equal(report.dataFileExists, false);
  assert.equal(report.approvedFileExists, false);
  assert.equal(report.totalLogs, 0);
  assert.equal(report.totalUsers, 0);
  assert.ok(Array.isArray(report.warnings));
});

test('channel approval logic supports default names and explicit IDs', async () => {
  const oldIds = process.env.DEAL_LOG_CHANNEL_IDS;
  const oldNames = process.env.DEAL_LOG_CHANNEL_NAMES;
  try {
    delete process.env.DEAL_LOG_CHANNEL_IDS;
    delete process.env.DEAL_LOG_CHANNEL_NAMES;
    assert.equal(isApprovedDealChannel({ id: 'x', name: 'virginia-deals-east' }), true);
    assert.equal(isApprovedDealChannel({ id: 'y', name: 'random-chat' }), false);

    process.env.DEAL_LOG_CHANNEL_IDS = '12345,67890';
    process.env.DEAL_LOG_CHANNEL_NAMES = '';
    assert.equal(isApprovedDealChannel({ id: '12345', name: 'not-a-deal-channel' }), true);
    assert.equal(isApprovedDealChannel({ id: '99999', name: 'not-a-deal-channel' }), false);
  } finally {
    if (oldIds == null) delete process.env.DEAL_LOG_CHANNEL_IDS;
    else process.env.DEAL_LOG_CHANNEL_IDS = oldIds;
    if (oldNames == null) delete process.env.DEAL_LOG_CHANNEL_NAMES;
    else process.env.DEAL_LOG_CHANNEL_NAMES = oldNames;
  }
});

test('destructive action backup file is created', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-backup-'));
  const source = path.join(root, 'leaderboard.json');
  await fs.writeFile(source, '{"ok":true}', 'utf8');

  const backup = await createTimestampedBackup(source, 'test-action');
  assert.equal(backup.ok, true);
  assert.equal(await pathExists(backup.backupPath), true);
});

test('weekly status snapshot exposes current counts', () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const data = {
    metadata: {
      weekId: 7,
      lastWeeklyResetAt: '2026-05-18T00:00:00.000Z',
    },
    logs: [
      { id: '1', userId: 'u1', speed: '1gig', date: today, weekId: 7 },
      { id: '2', userId: 'u2', speed: '500mb', date: today, weekId: 7 },
      { id: '3', userId: 'u2', speed: '500mb', date: today, weekId: 6 },
    ],
  };

  const snapshot = buildAdminStatusSnapshot(data, { approvedChannelsCount: 4, now, tz: 'America/New_York' });
  assert.equal(snapshot.weekId, 7);
  assert.equal(snapshot.totalDeals, 3);
  assert.equal(snapshot.weeklyDeals, 2);
  assert.equal(snapshot.approvedChannelsCount, 4);
  assert.equal(snapshot.lastWeeklyResetAt, '2026-05-18T00:00:00.000Z');
});

test('admin status command is registered and routed', async () => {
  const deployCommands = await fs.readFile(path.join(__dirname, 'deploy-commands.js'), 'utf8');
  const indexRuntime = await fs.readFile(path.join(__dirname, 'index.js'), 'utf8');

  assert.match(deployCommands, /\.setName\('status'\)/);
  assert.match(indexRuntime, /subcommand === 'status'/);
  assert.match(indexRuntime, /handleAdminStatus\(interaction\)/);
});
