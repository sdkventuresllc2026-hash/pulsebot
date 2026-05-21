const test = require('node:test');
const assert = require('node:assert/strict');
const { assertCleanOutput } = require('./message-format');
const { formatQuarterStatus, formatQuarterHeader } = require('./day-quarters');
const { buildPremiumDealConfirmation } = require('./premium-confirmation');
const { formatPhase3Master, formatPhase3Leaderboard } = require('./leaderboard-format');
const { leaderboardDateHeader } = require('./stats');

const SAMPLE_ROWS = [
  {
    userId: '1',
    displayName: 'Henny Sells',
    total: 6,
    speeds: { '1gig': 6 },
    blitzCounts: { Virginia: 6 },
  },
  {
    userId: '2',
    displayName: 'Caleb Head',
    total: 5,
    speeds: { '1gig': 5 },
    blitzCounts: { Greenville: 5 },
  },
  {
    userId: '3',
    displayName: 'iQRexy',
    total: 4,
    speeds: { '1gig': 4 },
    blitzCounts: { Virginia: 4 },
  },
];

test('formatQuarterStatus is compact — no duplicate Pre-Q1 or culture stack', () => {
  for (const hour of [8, 10, 14, 16, 18, 20, 22]) {
    const out = formatQuarterStatus(hour);
    assertCleanOutput(out, { maxLines: 3 });
    assert.equal(countLines(out), out.split('\n').filter(Boolean).length);
    assert.ok(!/\n{2,}.*\n{2,}/.test(out), `pregame spacing hour=${hour}`);
    const lines = out.split('\n').filter(Boolean);
    assert.ok(lines.length <= 2, `quarter output max 2 lines hour=${hour}: ${lines.length}`);
    if (hour < 12) {
      assert.match(out, /^\*\*Pre-Q1\*\* —/m);
      assert.ok(!out.includes('Stay at a **7**. **#nextdoor**'), 'no culture stack on /quarter');
    }
  }
});

test('formatQuarterHeader is one italic line', () => {
  const h = formatQuarterHeader(10);
  assert.match(h, /^_.*_/);
  assert.equal(h.split('\n').length, 1);
});

test('formatPhase3Master one line per rep with market in parentheses', () => {
  const out = formatPhase3Master(SAMPLE_ROWS, 15, 'All-Time', '_Q3 — **EXTEND THE LEAD**_');
  assertCleanOutput(out);
  assert.match(out, /🥇 \*\*Henny Sells\*\* · \*\*6\*\* \(Virginia\)/);
  assert.match(out, /🥈 \*\*Caleb Head\*\* · \*\*5\*\* \(Greenville\)/);
  assert.ok(!out.includes('Virginia: 6'), 'no old Virginia: N line');
  assert.ok(!out.includes('6 deals'), 'no old "N deals" line');
  assert.ok(!out.includes('\n\n\n'), 'no triple newline');
  const repBlocks = out.split('\n').filter((l) => l.startsWith('🥇') || l.startsWith('🥈') || l.startsWith('🥉'));
  assert.equal(repBlocks.length, 3);
});

test('formatPhase3Leaderboard compact rows', () => {
  const out = formatPhase3Leaderboard({
    title: 'Virginia · Today',
    rows: SAMPLE_ROWS,
    totalDeals: 15,
    quarterHeader: null,
  });
  assertCleanOutput(out);
  assert.match(out, /🥇 \*\*Henny Sells\*\* · \*\*6\*\*$/m);
  assert.ok(!out.includes('6x 1 Gig'), 'no per-row speed stack');
  assert.ok(!out.includes('Henny Sells - 6'));
  const repLines = out.split('\n').filter((l) => l.startsWith('🥇') || l.startsWith('🥈'));
  assert.equal(repLines.length, 2);
});

test('formatPhase3Leaderboard date on first line for daily and weekly only', () => {
  const daily = formatPhase3Leaderboard({
    title: 'Greenville · Today',
    rows: SAMPLE_ROWS,
    totalDeals: 15,
    dateHeader: 'Thursday, May 21, 2026',
  });
  const lines = daily.split('\n');
  assert.match(lines[0], /^\*\*Thursday, May 21, 2026\*\*$/);
  assert.match(lines[1], /Greenville · Today/);

  const weekly = formatPhase3Leaderboard({
    title: 'Greenville · This Week',
    rows: SAMPLE_ROWS,
    totalDeals: 15,
    dateHeader: 'May 19, 2026 – May 25, 2026',
  });
  assert.match(weekly.split('\n')[0], /May 19, 2026 – May 25, 2026/);

  const alltime = formatPhase3Leaderboard({
    title: 'Greenville · All-Time',
    rows: SAMPLE_ROWS,
    totalDeals: 15,
    quarterHeader: '_Q3 — test_',
  });
  assert.ok(!alltime.match(/^\*\*[A-Z][a-z]+day,/m), 'all-time has no calendar date line');
  assert.match(alltime, /^(\*\*Greenville|_Q3)/m);
});

test('leaderboardDateHeader returns null for all-time only', () => {
  assert.equal(leaderboardDateHeader('alltime'), null);
  assert.ok(leaderboardDateHeader('daily'));
  assert.ok(leaderboardDateHeader('weekly'));
  assert.match(leaderboardDateHeader('monthly'), /\d{4}/);
});

test('buildPremiumDealConfirmation no extra blank lines', () => {
  const out = buildPremiumDealConfirmation({
    displayName: 'Test Rep',
    speeds: ['1gig'],
    hypeLine: '**First of the day** for Test Rep.',
  });
  assertCleanOutput(out, { maxLines: 4 });
  assert.match(out, /^✅ \*\*Logged\*\*/m);
  assert.equal((out.match(/\n\n/g) || []).length, 0, 'no double newlines');
});

function countLines(text) {
  return text.split('\n').filter((l) => l.trim()).length;
}
