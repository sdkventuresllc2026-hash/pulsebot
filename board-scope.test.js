const test = require('node:test');
const assert = require('node:assert/strict');
const { boardsById, scopeFor } = require('./board-scope');

const boards = boardsById({ active: [
  { discordUserId: 'caleb', board: 'group:a,b,c' },
  { discordUserId: 'jayden', board: 'group:a,b,c' },
  { discordUserId: 'mark', board: 'group:don' },
  { discordUserId: 'manny', board: 'hidden' },
  { discordUserId: 'keegan', board: 'all' },
  { discordUserId: 'dual', board: 'all' }, { discordUserId: 'dual', board: 'group:don' }, // one human, two records
] });
const logs = [{ userId: 'caleb' }, { userId: 'jayden' }, { userId: 'mark' }, { userId: 'stranger' }];
const seen = (viewer, owner = false) => { const f = scopeFor(viewer, owner, boards); return (f ? logs.filter(f) : logs).map((l) => l.userId); };

test("Caleb's group sees only its own people", () => assert.deepEqual(seen('jayden'), ['caleb', 'jayden']));
test("Don's team sees only Don's team", () => assert.deepEqual(seen('mark'), ['mark']));
test('hidden and unknown viewers see nothing; owner and "all" see everything', () => {
  assert.deepEqual(seen('manny'), []);
  assert.deepEqual(seen('nobody'), []);
  assert.equal(seen('caleb', true).length, 4);
  assert.equal(seen('keegan').length, 4);
});
test('two records for one human: the stricter board wins', () => assert.deepEqual(seen('dual'), ['mark']));
