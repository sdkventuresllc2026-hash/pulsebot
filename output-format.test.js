const test = require('node:test');
const assert = require('node:assert/strict');
const { assertCleanOutput } = require('./message-format');
const { formatQuarterStatus, formatQuarterHeader } = require('./day-quarters');
const { buildPremiumDealConfirmation } = require('./premium-confirmation');
const { formatLeaderboard, resolveDateContext } = require('./leaderboard-format');

const SAMPLE_ROWS = [
  { userId: '1', displayName: 'Henny Sells', total: 6, market: 'Virginia' },
  { userId: '2', displayName: 'Caleb Head', total: 5, market: 'Greenville' },
  { userId: '3', displayName: 'iQRexy', total: 4, market: 'Virginia' },
];

test('formatQuarterStatus is compact - no duplicate Pre-Q1 or culture stack', () => {
  for (const hour of [8, 10, 14, 16, 18, 20, 22]) {
    const out = formatQuarterStatus(hour);
    assertCleanOutput(out, { maxLines: 3 });
    assert.equal(countLines(out), out.split('\n').filter(Boolean).length);
    assert.ok(!/\n{2,}.*\n{2,}/.test(out), `pregame spacing hour=${hour}`);
    const lines = out.split('\n').filter(Boolean);
    assert.ok(lines.length <= 2, `quarter output max 2 lines hour=${hour}: ${lines.length}`);
    if (hour < 12) {
      assert.match(out, /^\*\*Pre-Q1\*\*/m);
      assert.ok(!out.includes('Stay at a **7**. **#nextdoor**'), 'no culture stack on /quarter');
    }
  }
});

test('formatQuarterHeader is one italic line', () => {
  const h = formatQuarterHeader(10);
  assert.match(h, /^_.*_/);
  assert.equal(h.split('\n').length, 1);
});

test('formatLeaderboard renders exact market daily style', () => {
  const out = formatLeaderboard({
    scope: 'market',
    period: 'daily',
    rows: SAMPLE_ROWS,
    total: 15,
    market: 'Virginia',
    dateContext: 'Today · Thursday, May 21',
  });
  assert.equal(
    out,
    [
      '🏆 **Virginia Leaderboard**',
      'Today · Thursday, May 21',
      '',
      '🥇 **Henny Sells** · **6** ▰▰▰▰▰▰',
      '🥈 **Caleb Head** · **5** ▰▰▰▰▰▱',
      '🥉 **iQRexy** · **4** ▰▰▰▰▱▱',
      '',
      '**Virginia Total** · **15** deals · 3 reps',
      '🔥 Henny Sells leads by 1',
    ].join('\n'),
  );
});

test('formatLeaderboard shows quarter line and tie at the top', () => {
  const out = formatLeaderboard({
    scope: 'market',
    period: 'daily',
    rows: [SAMPLE_ROWS[0], { ...SAMPLE_ROWS[1], total: 6 }, SAMPLE_ROWS[2]],
    total: 16,
    market: 'Virginia',
    dateContext: 'Today · Thursday, May 21',
    quarterLine: '_Q3 — **EXTEND THE LEAD**_',
  });
  assert.equal(out.split('\n')[2], '_Q3 — **EXTEND THE LEAD**_');
  assert.match(out, /\n🔥 Tied at the top — Henny Sells, Caleb Head$/);
  assert.doesNotMatch(out, /leads by/);
});

test('formatLeaderboard renders exact master all-time style', () => {
  const out = formatLeaderboard({
    scope: 'master',
    period: 'alltime',
    rows: SAMPLE_ROWS,
    total: 15,
    dateContext: 'All-Time',
  });
  assert.equal(
    out,
    [
      '🏆 **Master Leaderboard**',
      'All-Time · All Markets',
      '',
      '🥇 **Henny Sells** · **6** · Virginia ▰▰▰▰▰▰',
      '🥈 **Caleb Head** · **5** · Greenville ▰▰▰▰▰▱',
      '🥉 **iQRexy** · **4** · Virginia ▰▰▰▰▱▱',
      '',
      '**All Markets Total** · **15** deals · 3 reps',
      '🔥 Henny Sells leads by 1',
    ].join('\n'),
  );
});

test('formatLeaderboard renders empty state', () => {
  const out = formatLeaderboard({
    scope: 'market',
    period: 'weekly',
    rows: [],
    total: 0,
    market: 'Greenville',
    dateContext: 'This Week · May 18–24',
  });
  assert.equal(
    out,
    [
      '🏆 **Greenville Leaderboard**',
      'This Week · May 18–24',
      '',
      '_No deals logged yet — first door wins the board._',
      '',
      '**Greenville Total** · **0** deals',
    ].join('\n'),
  );
});

test('formatLeaderboard shows all rows up to soft cap and notes overflow', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    displayName: i === 0 ? 'Very_Long_*Rep*_Name_With_Extra' : `Rep ${i + 1}`,
    total: 12 - i,
  }));
  const out = formatLeaderboard({
    scope: 'market',
    period: 'daily',
    rows,
    total: 78,
    market: 'Evansville',
    dateContext: 'Today · Thursday, May 21',
  });
  assert.match(out, /🥇 \*\*Very\\_Long\\_\\\*Rep\\\*\\_Name\\_Wit…\*\* · \*\*12\*\* ▰▰▰▰▰▰/);
  assert.match(out, /^\*\*#10\*\* \*\*Rep 10\*\* · \*\*3\*\* ▰▰▱▱▱▱$/m);
  assert.match(out, /^\*\*#11\*\* \*\*Rep 11\*\* · \*\*2\*\* ▰▱▱▱▱▱$/m);
  assert.match(out, /^\*\*#12\*\* \*\*Rep 12\*\* · \*\*1\*\* ▰▱▱▱▱▱$/m);
  assert.doesNotMatch(out, /and \d+ more/);
});

test('formatLeaderboard applies soft cap with overflow note past 50 rows', () => {
  const rows = Array.from({ length: 55 }, (_, i) => ({ displayName: `Rep ${i + 1}`, total: 55 - i }));
  const out = formatLeaderboard({ scope: 'market', period: 'alltime', rows, total: 100, market: 'Virginia' });
  assert.match(out, /^\*\*#50\*\* /m);
  assert.doesNotMatch(out, /Rep 51/);
  assert.match(out, /…and 5 more/);
  assert.ok(out.length <= 1900, `too long: ${out.length}`);
});

test('formatLeaderboard stays under the Discord 2000-char limit with long names', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({
    displayName: `Representative Longname ${i + 1}`,
    total: 50 - i,
    market: 'Some Longer Market Name',
  }));
  const out = formatLeaderboard({ scope: 'master', period: 'alltime', rows, total: 1275 });
  assert.ok(out.length <= 1900, `too long: ${out.length}`);
  assert.match(out, /…and \d+ more/);
  assert.match(out, /\*\*All Markets Total\*\* · \*\*1275\*\* deals · 50 reps/);
});

test('resolveDateContext formats daily and weekly labels', () => {
  assert.equal(
    resolveDateContext('daily', new Date('2026-05-21T16:00:00Z'), 'America/New_York'),
    'Today · Thursday, May 21',
  );
  assert.equal(
    resolveDateContext('weekly', new Date('2026-05-21T16:00:00Z'), 'America/New_York'),
    'This Week · May 18–24',
  );
  assert.equal(
    resolveDateContext('weekly', new Date('2026-06-01T16:00:00Z'), 'America/New_York'),
    'This Week · June 1–7',
  );
  assert.equal(
    resolveDateContext('weekly', new Date('2026-09-02T16:00:00Z'), 'America/New_York'),
    'This Week · August 31–September 6',
  );
  assert.equal(
    resolveDateContext('weekly', new Date('2026-12-31T16:00:00Z'), 'America/New_York'),
    'This Week · December 28–January 3, 2027',
  );
  assert.equal(resolveDateContext('alltime', new Date('2026-05-21T16:00:00Z'), 'America/New_York'), 'All-Time');
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
