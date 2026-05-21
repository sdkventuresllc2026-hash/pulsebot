const test = require('node:test');
const assert = require('node:assert/strict');
const { HYPE_LINES, isDealLogSafeLine } = require('./hype-bank');
const { selectHypeLine } = require('./premium-confirmation');

test('hype bank has breadth across milestone tags', () => {
  assert.ok(HYPE_LINES.length >= 90, `expected 90+ lines, got ${HYPE_LINES.length}`);
  const tags = new Set(HYPE_LINES.flatMap((l) => l.tags));
  for (const required of [
    'first_ever',
    'five_day',
    'ten_day',
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

test('selectHypeLine rotates first_ever copy', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i += 1) {
    const picked = selectHypeLine({ event: 'first_ever', recentLineIds: [] });
    assert.ok(picked?.text);
    seen.add(picked.text);
  }
  assert.ok(seen.size >= 2, 'first_ever should have multiple variants');
});
