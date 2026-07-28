const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the data dir BEFORE requiring storage — DATA_PATH is resolved at module load.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-storage-'));
process.env.PULSE_DATA_DIR = dir;
const storage = require('./storage');

test('unreadable leaderboard.json throws and is NOT overwritten', async () => {
  const garbage = '{"logs":[{"id":"real-deal-that-must-survive"';
  fs.writeFileSync(storage.DATA_PATH, garbage, 'utf8');

  await assert.rejects(() => storage.readLeaderboard(), (err) => {
    assert.equal(err.code, storage.CORRUPT_CODE);
    return true;
  });

  // The whole point: the bad file is still there, byte for byte, so it can be recovered.
  assert.equal(fs.readFileSync(storage.DATA_PATH, 'utf8'), garbage,
    'corrupt file was modified — real deal history would have been destroyed');
});

test('a missing file is still created fresh (not an error)', async () => {
  fs.rmSync(storage.DATA_PATH, { force: true });
  const data = await storage.readLeaderboard();
  assert.deepEqual(data.logs, []);
  assert.ok(fs.existsSync(storage.DATA_PATH));
});
