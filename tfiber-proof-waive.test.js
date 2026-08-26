const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.PULSE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-waive-'));

const { mutate, readLeaderboard } = require('./storage');
const { waiveTfiberProofsForUser, listOpenPending } = require('./tfiber-proof-store');

const DLO = '927499597453078589';
const OTHER = '111111111111111111';

test('waive clears the rep\'s open proofs and restores only expiry-removed deals', async () => {
  await mutate((data) => {
    data.logs = [
      { id: 'a', userId: DLO, speed: '1gig', removed: true, removedAt: 'x', removedReason: 'T-Fiber screenshot proof not received within 48 hours.', tfiberProofStatus: 'EXPIRED' },
      { id: 'b', userId: DLO, speed: '1gig', tfiberProofStatus: 'NEEDS_REVIEW' },
      { id: 'c', userId: DLO, speed: '1gig', removed: true, removedAt: 'x', removedReason: 'admin removed: duplicate' },
      { id: 'd', userId: OTHER, speed: '1gig', removed: true, removedAt: 'x', tfiberProofStatus: 'EXPIRED' },
    ];
    data.tfiberProofs = { pending: { b: { logId: 'b', userId: DLO }, d: { logId: 'd', userId: OTHER } }, events: [] };
    return data;
  });

  const result = await waiveTfiberProofsForUser(DLO, { waivedBy: 'admin' });
  assert.deepEqual(result, { pendingCleared: 1, logsRestored: 1 });

  const data = await readLeaderboard();
  const byId = Object.fromEntries(data.logs.map((l) => [l.id, l]));
  assert.equal(byId.a.removed, false); // expired by proof → back in totals
  assert.equal(byId.a.tfiberProofStatus, 'WAIVED');
  assert.equal(byId.b.tfiberProofStatus, 'WAIVED'); // open request → no longer pending
  assert.equal(byId.c.removed, true); // removed for another reason → untouched
  assert.equal(byId.d.removed, true); // other rep → untouched
  assert.deepEqual((await listOpenPending()).map((p) => p.logId), ['d']);
});
