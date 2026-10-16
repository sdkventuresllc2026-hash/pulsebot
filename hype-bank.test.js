const test = require('node:test');
const assert = require('node:assert/strict');
const { HYPE_LINES, isDealLogSafeLine } = require('./hype-bank');
const { selectHypeLine } = require('./premium-confirmation');

test('hype bank has breadth across milestone tags', () => {
  assert.ok(HYPE_LINES.length >= 30, `expected 30+ lines, got ${HYPE_LINES.length}`);
  // Owner 2026-10-16: no dashes in any line ("3 ball", not "3-ball").
  for (const line of HYPE_LINES) assert.doesNotMatch(line.text, /[-—–]/, `${line.id} has a dash: ${line.text}`);
  const tags = new Set(HYPE_LINES.flatMap((l) => l.tags));
  for (const required of [
    'first_ever',
    'five_day',
    'ten_day',
    'day_4',
    'day_6',
    'day_7',
    'day_8',
    'day_9',
    'took_first',
    'passed_rep',
    'team_milestone_high',
    'q3',
    'pregame',
  ]) {
    assert.ok(tags.has(required), `missing tag ${required}`);
  }
});

test('deal log lines never use {rep}', () => {
  for (const line of HYPE_LINES) {
    if (line.tags.includes('passed_rep')) {
      assert.ok(line.text.includes('{otherRep}'), `${line.id} passed_rep needs otherRep`);
      continue;
    }
    if (line.tags.some((t) => ['weekly_milestone', 'alltime_milestone', 'team_milestone', 'team_milestone_high'].includes(t))) {
      continue;
    }
    assert.ok(isDealLogSafeLine(line.text), `${line.id} must not use {rep}: ${line.text}`);
  }
});

test('one simple line per moment (owner 2026-10-16)', () => {
  assert.equal(selectHypeLine({ event: 'hat_trick', recentLineIds: [] }).text, '**3 ball.**');
  assert.equal(selectHypeLine({ event: 'day_7', recentLineIds: [] }).text, '**Seven today.**');
  assert.equal(selectHypeLine({ event: 'first_ever', recentLineIds: [] }).text, '**First deal.**');
});
