const test = require('node:test');
const assert = require('node:assert/strict');
const { usedCodes, unlinkedHumans, pickerOptions, whoToAsk, ASK_AFTER_MS } = require('./join-match');

test('the used invite is the one that vanished or went up', () => {
  const stored = { aaa: { uses: 0 }, bbb: { uses: 0 }, ccc: { uses: 0 } };
  assert.deepEqual(usedCodes(stored, new Map([['bbb', 0], ['ccc', 0]])), ['aaa']); // one-use invite deleted on use
  assert.deepEqual(usedCodes(stored, new Map([['aaa', 0], ['bbb', 1], ['ccc', 0]])), ['bbb']); // still listed, uses up
  assert.deepEqual(usedCodes(stored, new Map([['aaa', 0], ['bbb', 0], ['ccc', 0]])), []); // general invite used
  assert.equal(usedCodes(stored, new Map([['ccc', 0]])).length, 2); // two at once: caller treats as unknown
});

const roster = { active: [
  { id: 'r1', kind: 'rep', name: 'Don Salcedo', discordUserId: null, since: '2026-10-01' },
  { id: 'm1', kind: 'manager', name: 'Don Salcedo', discordUserId: null, since: '2026-10-02' }, // same human
  { id: 'r2', kind: 'rep', name: 'Kaeden Glass', discordUserId: null, since: '2026-10-10' },
  { id: 'r3', kind: 'rep', name: 'Mark Mudik', discordUserId: '55', since: '2026-10-12' }, // linked
  { id: 'm3', kind: 'manager', name: 'Mark Mudik', discordUserId: null, since: '2026-10-12' }, // other half of a linked human
] };

test('unlinked humans: one per person, linked people skipped', () => {
  const h = unlinkedHumans(roster);
  assert.deepEqual(h.map((x) => x.name).sort(), ['Don Salcedo', 'Kaeden Glass']);
  assert.deepEqual(h.find((x) => x.name === 'Don Salcedo').keys.sort(), ['MANAGER:m1', 'REP:r1']);
});

test('picker lists newest first, capped at 25', () => {
  assert.deepEqual(pickerOptions(roster).map((o) => o.label), ['Kaeden Glass', 'Don Salcedo']);
  const many = { active: Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, kind: 'rep', name: `P${i}`, discordUserId: null, since: '2026-10-01' })) };
  assert.equal(pickerOptions(many).length, 25);
});

test('ask only about unknown humans who have been here 10+ minutes, once', () => {
  const now = 10_000_000;
  const old = now - ASK_AFTER_MS - 1;
  const ms = [
    { id: 'a', joinedAt: old }, { id: 'b', joinedAt: now - 1000 }, { id: 'c', joinedAt: old, hasMember: true },
    { id: 'd', joinedAt: old, isBot: true }, { id: 'e', joinedAt: old }, { id: 'f', joinedAt: old },
  ];
  assert.deepEqual(whoToAsk(ms, new Set(['f']), { e: '2026-10-15' }, now).map((m) => m.id), ['a']);
});
