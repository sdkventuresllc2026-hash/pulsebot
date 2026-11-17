const test = require('node:test');
const assert = require('node:assert/strict');
const { doorRowsByBlitz, formatDoorBoard, syncIsFresh } = require('./door-board');
const { BOARD_LINK } = require('./leaderboard-format');

test('groups by blitz, keeps zeros, drops people not in Canvass, one row per human', () => {
  const rows = doorRowsByBlitz([
    { name: 'Caleb Head', human: 'caleb head', blitz: 'Greensboro', doorsToday: 84 },
    { name: 'Caleb Head — selling profile', human: 'caleb head', blitz: 'Greensboro', doorsToday: 84 },
    { name: 'Brandon Peeks', human: 'brandon peeks', blitz: 'Greensboro', doorsToday: 0 },
    { name: 'No Canvass', human: 'no canvass', blitz: 'Greensboro', doorsToday: null },
    { name: 'Rex Johnson', human: 'rex johnson', blitz: 'St. Cloud', doorsToday: 72 },
    { name: 'Off Card', human: 'off card', blitz: null, doorsToday: 50 },
  ]);
  assert.deepEqual([...rows.keys()].sort(), ['Greensboro', 'St. Cloud']);
  assert.deepEqual(rows.get('Greensboro'), [{ name: 'Caleb Head', doors: 84 }, { name: 'Brandon Peeks', doors: 0 }]);
});

test('formats like the approved mock', () => {
  const out = formatDoorBoard('Greensboro', [{ name: 'Caleb Head', doors: 84 }, { name: 'Jadin Kent', doors: 61 }, { name: 'Brandon Peeks', doors: 0 }]);
  assert.equal(out, [
    '🚪 **Greensboro · Doors today**',
    '',
    '1. **Caleb Head** · **84**',
    '2. **Jadin Kent** · **61**',
    '3. Brandon Peeks · 0',
    '',
    '**145 doors** · 3 reps · Caleb Head leads by 23',
    BOARD_LINK,
  ].join('\n'));
});

test('stale counts are not posted', () => {
  const now = Date.parse('2026-11-12T01:30:00Z');
  assert.equal(syncIsFresh('2026-11-12T00:50:00Z', now), true);
  assert.equal(syncIsFresh('2026-11-11T16:20:00Z', now), false);
  assert.equal(syncIsFresh(null, now), false);
});

test('canvassSyncSlot: hourly noon to 7 PM, 8:10 PM, once per slot', () => {
  const { canvassSyncSlot } = require('./door-board');
  const done = new Set();
  const at = (hour, minute = 0) => canvassSyncSlot({ day: '2026-11-16', hour, minute }, done);
  assert.equal(at(11, 55), null);
  assert.equal(at(12, 0), '2026-11-16 12');
  done.add('2026-11-16 12');
  assert.equal(at(12, 30), null, 'once per hour');
  assert.equal(at(19, 5), '2026-11-16 19');
  assert.equal(at(20, 5), null, '8 PM hour waits for 8:10');
  assert.equal(at(20, 12), '2026-11-16 20:10');
  assert.equal(at(21, 0), null, 'the OS 9 PM run covers the night');
});
