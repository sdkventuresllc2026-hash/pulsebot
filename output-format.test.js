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

test('formatQuarterStatus is the quarter plus one plain tip, no dashes', () => {
  for (const hour of [8, 10, 14, 16, 18, 20, 22]) {
    const out = formatQuarterStatus(hour);
    assertCleanOutput(out, { maxLines: 3 });
    assert.ok(out.split('\n').filter(Boolean).length <= 2, `max 2 lines hour=${hour}`);
    assert.doesNotMatch(out, /[—–]/, `no dashes hour=${hour}`);
    if (hour < 12) assert.match(out, /^\*\*Pregame\*\* · Doors open at noon/m);
  }
});

test('formatQuarterHeader is one quote bar line', () => {
  assert.equal(formatQuarterHeader(18), '> **Q3** · Extend the lead');
  assert.equal(formatQuarterHeader(10).split('\n').length, 1);
});

test('formatLeaderboard daily: bold title, grey date, quarter bar, bold podium, one summary line', () => {
  const out = formatLeaderboard({
    scope: 'market',
    period: 'daily',
    rows: [...SAMPLE_ROWS, { userId: '4', displayName: 'Parker Call', total: 2 }],
    total: 17,
    market: 'Virginia',
    dateContext: 'Today · Thursday, May 21',
    quarterLine: '> **Q3** · Extend the lead',
  });
  assert.equal(
    out,
    [
      '🏆 **Virginia · Today**',
      '-# Thursday, May 21',
      '> **Q3** · Extend the lead',
      '',
      '🥇 **Henny Sells** · **6**',
      '🥈 **Caleb Head** · **5**',
      '🥉 **iQRexy** · **4**',
      '4\\. Parker Call · 2',
      '',
      '**17 deals** · 4 reps · Henny Sells leads by 1',
    ].join('\n'),
  );
});

test('formatLeaderboard monthly drops "This Month" and names a tie', () => {
  const out = formatLeaderboard({
    scope: 'market',
    period: 'monthly',
    rows: [SAMPLE_ROWS[0], { ...SAMPLE_ROWS[1], total: 6 }, SAMPLE_ROWS[2]],
    total: 16,
    market: 'Virginia',
    dateContext: 'This Month · October 2026',
  });
  assert.equal(out.split('\n')[0], '🏆 **Virginia · October 2026**');
  assert.equal(out.split('\n')[1], '');
  assert.match(out, /· Tied at the top: Henny Sells, Caleb Head$/);
});

test('formatLeaderboard weekly date range reads "to", not a dash', () => {
  const out = formatLeaderboard({ scope: 'market', period: 'weekly', rows: SAMPLE_ROWS, total: 15, market: 'Virginia', dateContext: 'This Week · May 18–24' });
  assert.equal(out.split('\n')[1], '-# May 18 to 24');
});

test('formatLeaderboard all markets shows each market', () => {
  const out = formatLeaderboard({ scope: 'master', period: 'alltime', rows: SAMPLE_ROWS, total: 15, dateContext: 'All-Time' });
  assert.equal(out.split('\n')[0], '🏆 **All Markets · All-Time**');
  assert.match(out, /^🥈 \*\*Caleb Head\*\* · \*\*5\*\* · Greenville$/m);
  assert.match(out, /^\*\*15 deals\*\* · 3 reps · Henny Sells leads by 1$/m);
});

test('formatLeaderboard renders empty state', () => {
  const out = formatLeaderboard({ scope: 'market', period: 'weekly', rows: [], total: 0, market: 'Greenville', dateContext: 'This Week · May 18–24' });
  assert.equal(out, ['🏆 **Greenville · This Week**', '-# May 18 to 24', '', 'No deals logged yet.', '', '**0 deals**'].join('\n'));
});

test('formatLeaderboard escapes and trims long names, numbers after the podium', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    displayName: i === 0 ? 'Very_Long_*Rep*_Name_With_Extra' : `Rep ${i + 1}`,
    total: 12 - i,
  }));
  const out = formatLeaderboard({ scope: 'market', period: 'daily', rows, total: 78, market: 'Evansville', dateContext: 'Today' });
  assert.match(out, /^🥇 \*\*Very\\_Long\\_\\\*Rep\\\*\\_Name\\_Wit…\*\* · \*\*12\*\*$/m);
  assert.match(out, /^10\\\. Rep 10 · 3$/m);
  assert.doesNotMatch(out, /And \d+ more/);
});

test('formatLeaderboard applies soft cap with overflow note past 50 rows', () => {
  const rows = Array.from({ length: 55 }, (_, i) => ({ displayName: `Rep ${i + 1}`, total: 55 - i }));
  const out = formatLeaderboard({ scope: 'market', period: 'alltime', rows, total: 100, market: 'Virginia' });
  assert.match(out, /^50\\\. /m);
  assert.doesNotMatch(out, /Rep 51/);
  assert.match(out, /And 5 more/);
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
  assert.match(out, /And \d+ more/);
  assert.match(out, /^\*\*1275 deals\*\* · 50 reps/m);
});

test('formatLeaderboard shows the fibersales.co name for a linked Discord user', () => {
  require('./real-names').setFromRoster([{ discordUserId: '3', name: 'rex ranck' }]);
  const out = formatLeaderboard({ scope: 'market', period: 'daily', rows: SAMPLE_ROWS, total: 15, market: 'Virginia', dateContext: 'Today' });
  assert.match(out, /^🥉 \*\*Rex Ranck\*\* · \*\*4\*\*$/m);
  require('./real-names').setFromRoster([{ discordUserId: 'none', name: 'x' }]);
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
  assert.equal(out, '✅ **Test Rep** · 1 Gig\n**First of the day** for Test Rep.');
  assert.equal((out.match(/\n\n/g) || []).length, 0, 'no double newlines');
});

function countLines(text) {
  return text.split('\n').filter((l) => l.trim()).length;
}
