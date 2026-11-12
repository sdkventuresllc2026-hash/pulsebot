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
