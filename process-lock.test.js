const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { lockStillHeld } = require('./process-lock');

describe('lockStillHeld', () => {
  it('rejects legacy lock without hostId even if pid matches', () => {
    assert.equal(lockStillHeld({ pid: process.pid, startedAt: new Date().toISOString() }), false);
  });

  it('rejects lock from another hostId', () => {
    assert.equal(
      lockStillHeld({
        pid: process.pid,
        hostId: 'other-container-xyz',
        startedAt: new Date().toISOString(),
      }),
      false,
    );
  });

  it('accepts lock only for same hostId and alive pid', () => {
    const { getHostId } = require('./process-lock');
    assert.equal(
      lockStillHeld({
        pid: process.pid,
        hostId: getHostId(),
        startedAt: new Date().toISOString(),
      }),
      true,
    );
  });

  it('rejects dead pid', () => {
    const { getHostId } = require('./process-lock');
    assert.equal(
      lockStillHeld({
        pid: 999999999,
        hostId: getHostId(),
        startedAt: new Date().toISOString(),
      }),
      false,
    );
  });
});
