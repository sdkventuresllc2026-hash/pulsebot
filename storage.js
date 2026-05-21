/**
 * Pulse — leaderboard.json persistence
 * - fs/promises
 * - Auto-create file
 * - Corrupt JSON → backup + fresh starter
 * - Serialized writes (prevents interleaved writes)
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { dataPath } = require('./paths');

const DATA_PATH = dataPath('leaderboard.json');

const defaultData = () => ({
  metadata: {
    version: 1,
    weekId: 1,
    createdAt: new Date().toISOString(),
  },
  logs: [],
  users: {},
  weeklyArchive: [],
  gamification: {
    dailyMilestones: {},
  },
});

let writeChain = Promise.resolve();

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readLeaderboard() {
  if (!(await pathExists(DATA_PATH))) {
    const fresh = defaultData();
    await fs.writeFile(DATA_PATH, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }

  const raw = await fs.readFile(DATA_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid root');
    parsed.metadata = parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {};
    parsed.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
    parsed.users = parsed.users && typeof parsed.users === 'object' ? parsed.users : {};
    parsed.weeklyArchive = Array.isArray(parsed.weeklyArchive) ? parsed.weeklyArchive : [];
    parsed.gamification = parsed.gamification && typeof parsed.gamification === 'object' ? parsed.gamification : {};
    parsed.gamification.dailyMilestones =
      parsed.gamification.dailyMilestones && typeof parsed.gamification.dailyMilestones === 'object'
        ? parsed.gamification.dailyMilestones
        : {};
    if (typeof parsed.metadata.weekId !== 'number' || parsed.metadata.weekId < 1) {
      parsed.metadata.weekId = 1;
    }
    return parsed;
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bak = `${DATA_PATH}.corrupt.${stamp}.bak`;
    await fs.writeFile(bak, raw, 'utf8');
    const fresh = defaultData();
    fresh.metadata.recoveredFromCorruptionAt = new Date().toISOString();
    fresh.metadata.corruptionBackupFile = path.basename(bak);
    await fs.writeFile(DATA_PATH, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

function enqueueWrite(fn) {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

async function writeLeaderboard(data) {
  const tmp = `${DATA_PATH}.tmp.${crypto.randomBytes(6).toString('hex')}`;
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, DATA_PATH);
}

/**
 * @param {(data: object) => Promise<object>|object} mutator
 */
async function mutate(mutator) {
  return enqueueWrite(async () => {
    const data = await readLeaderboard();
    const next = await mutator(structuredClone(data));
    await writeLeaderboard(next);
    return next;
  });
}

async function appendSingleDealLog({
  userId,
  speed,
  channelId,
  buildLogEntry,
  sourceMessageId = null,
}) {
  return enqueueWrite(async () => {
    const data = await readLeaderboard();
    if (sourceMessageId != null && data.logs.some((l) => l.sourceMessageId === sourceMessageId)) {
      return { duplicateMessage: true };
    }

    const dataBefore = structuredClone(data);
    const logEntry = buildLogEntry(data);
    if (sourceMessageId != null) logEntry.sourceMessageId = sourceMessageId;
    const next = structuredClone(data);
    next.logs.push(logEntry);
    next.users[userId] = next.users[userId] || {};
    next.users[userId].lastLogId = logEntry.id;
    next.users[userId].lastLogAt = logEntry.timestamp;
    await writeLeaderboard(next);
    return { ok: true, dataBefore, data: next };
  });
}

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

exports.DATA_PATH = DATA_PATH;
exports.readLeaderboard = readLeaderboard;
exports.writeLeaderboard = writeLeaderboard;
exports.mutate = mutate;
exports.appendSingleDealLog = appendSingleDealLog;

/**
 * Append many logs from one Discord message (idempotent per message id).
 * Does not apply the 5s slash double-tap rule between entries in the batch.
 * @param {{ messageId: string|null, userId: string, speeds: string[], buildLogEntry: (data: object, speed: string) => object }} opts
 */
async function appendMessageLogsBatch({ messageId, userId, speeds, buildLogEntry }) {
  return enqueueWrite(async () => {
    const data = await readLeaderboard();
    if (messageId != null && data.logs.some((l) => l.sourceMessageId === messageId)) {
      return { duplicateMessage: true };
    }
    const dataBefore = structuredClone(data);
    const next = structuredClone(data);
    for (let idx = 0; idx < speeds.length; idx += 1) {
      const speed = speeds[idx];
      const logEntry = buildLogEntry(next, speed, idx);
      if (messageId != null) logEntry.sourceMessageId = messageId;
      next.logs.push(logEntry);
      next.users[userId] = next.users[userId] || {};
      next.users[userId].lastLogId = logEntry.id;
      next.users[userId].lastLogAt = logEntry.timestamp;
    }
    await writeLeaderboard(next);
    return { ok: true, dataBefore, data: next };
  });
}

exports.appendMessageLogsBatch = appendMessageLogsBatch;

/**
 * Tag historical logs with marketId from channel mapping or *-deals channel names.
 * @param {(log: object) => { marketId: string|null, marketName: string }} inferMarketForLog
 */
async function backfillLogMarketTags(inferMarketForLog) {
  let updated = 0;
  await mutate((data) => {
    for (const log of data.logs) {
      if (!log || log.removed || log.removedAt || log.deletedAt || log.voidedAt) continue;
      const inferred = inferMarketForLog(log);
      if (!inferred?.marketId) continue;
      if (log.marketId === inferred.marketId && log.marketName === inferred.marketName) continue;
      log.marketId = inferred.marketId;
      log.marketName = inferred.marketName;
      updated += 1;
    }
    return data;
  });
  return updated;
}

exports.backfillLogMarketTags = backfillLogMarketTags;
exports.defaultData = defaultData;
exports.pickRandom = pickRandom;
