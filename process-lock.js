/**
 * Prevent multiple Pulse bot instances (stale duplicate handlers).
 */
const fs = require('fs');
const { dataPath } = require('./paths');

const LOCK_PATH = dataPath('.pulse-bot.lock');

function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function acquireProcessLock() {
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const raw = fs.readFileSync(LOCK_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.pid && isProcessAlive(parsed.pid)) {
        return {
          ok: false,
          reason: 'already_running',
          pid: parsed.pid,
          startedAt: parsed.startedAt || null,
        };
      }
    } catch {
      /* stale or corrupt lock — overwrite */
    }
  }

  const payload = { pid: process.pid, startedAt: new Date().toISOString() };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2), 'utf8');
  const release = () => {
    try {
      if (fs.existsSync(LOCK_PATH)) {
        const raw = fs.readFileSync(LOCK_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.pid === process.pid) fs.unlinkSync(LOCK_PATH);
      }
    } catch {
      /* ignore */
    }
  };
  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });
  return { ok: true, pid: process.pid, release };
}

module.exports = { LOCK_PATH, acquireProcessLock, isProcessAlive };
