/**
 * One-time official V1 launch: empty deal logs, week 1, metadata marks tracking start date.
 * Keeps approved-blitz-channels.json untouched. Backs up existing leaderboard first.
 *
 * Run on the machine that owns production data (Railway shell with PULSE_DATA_DIR=/data):
 *   node scripts/init-v1-official-start.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { dataPath, getPulseDataDir } = require('../paths');
const { getTimeZone } = require('../stats');
const { createTimestampedBackup } = require('../ops-safety');

const DATA_PATH = dataPath('leaderboard.json');
const tz = getTimeZone();
const now = new Date();
const startYmd = new Intl.DateTimeFormat('en-CA', {
  timeZone: tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(now);

function freshV1Data() {
  return {
    metadata: {
      version: 2,
      weekId: 1,
      createdAt: now.toISOString(),
      officialTrackingStart: startYmd,
      officialTrackingTimezone: tz,
      v1LaunchNote: 'Official Pulse V1 leaderboard tracking — totals before this date are not counted.',
    },
    logs: [],
    users: {},
    weeklyArchive: [],
    gamification: {
      dailyMilestones: {},
      weeklyMilestones: {},
      allTimeMilestones: {},
      teamMilestones: {},
      recentLineIds: [],
      lastLeaderboardEventByRep: {},
    },
  };
}

async function main() {
  console.log('[Pulse] Data directory:', getPulseDataDir());
  if (fs.existsSync(DATA_PATH)) {
    const backup = await createTimestampedBackup(DATA_PATH, 'pre-v1-launch');
    if (backup.ok) console.log('[Pulse] Backup:', backup.backupPath);
  }
  const payload = freshV1Data();
  const tmp = `${DATA_PATH}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_PATH);
  console.log('[Pulse] Official V1 leaderboard initialized.');
  console.log('  officialTrackingStart:', startYmd, `(${tz})`);
  console.log('  weekId: 1 · logs: 0');
  console.log('  Channels/markets file NOT changed — deals start counting on next log.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
