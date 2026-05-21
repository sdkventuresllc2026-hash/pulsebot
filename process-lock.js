/**
 * Prevent multiple Pulse bot instances (stale duplicate handlers).
 * Lock includes hostId — PID alone is unsafe on Railway (new containers reuse low PIDs).
 */
const fs = require('fs');
const os = require('os');
const { dataPath } = require('./paths');

const LOCK_PATH = dataPath('.pulse-bot.lock');

function getHostId() {
  return (
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.RAILWAY_REPLICA_ID ||
    process.env.HOSTNAME ||
    os.hostname()
  );
}

function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Lock is held only when PID is alive and hostId matches (avoids Railway PID reuse). */
function lockStillHeld(parsed) {
  if (!parsed?.pid || !isProcessAlive(parsed.pid)) return false;
  if (!parsed.hostId) return false;
  return parsed.hostId === getHostId();
}

function acquireProcessLock() {
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const raw = fs.readFileSync(LOCK_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (lockStillHeld(parsed)) {
        return {
          ok: false,
          reason: 'already_running',
          pid: parsed.pid,
          startedAt: parsed.startedAt || null,
          hostId: parsed.hostId || null,
        };
      }
    } catch {
      /* stale or corrupt lock — overwrite */
    }
  }

  const payload = {
    pid: process.pid,
    hostId: getHostId(),
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2), 'utf8');
  const release = () => {
    try {
      if (fs.existsSync(LOCK_PATH)) {
        const raw = fs.readFileSync(LOCK_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.pid === process.pid && parsed?.hostId === getHostId()) {
          fs.unlinkSync(LOCK_PATH);
        }
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

module.exports = {
  LOCK_PATH,
  acquireProcessLock,
  isProcessAlive,
  getHostId,
  lockStillHeld,
};
