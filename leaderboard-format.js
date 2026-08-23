/**
 * Leaderboard plain-text output (testable, no Discord deps).
 */

const MARKDOWN_ESCAPE_RE = /([*_~`|\\])/g;
const MEDALS = ['🥇', '🥈', '🥉'];
const DEFAULT_TZ = 'America/New_York';
const PHASE3_SPEED_ORDER = ['1gig', '2gig', '500mb', '300mb', '200mb'];
const PHASE3_SPEED_LABELS = {
  '1gig': '1 Gig',
  '2gig': '2 Gig',
  '500mb': '500 Mbps',
  '300mb': '300 Mbps',
  '200mb': '200 Mbps',
};

function escapeMarkdown(text) {
  return String(text || '').replace(MARKDOWN_ESCAPE_RE, '\\$1');
}

function displayRepName(row) {
  const raw = String(row.displayName || row.username || 'Unknown Rep').trim() || 'Unknown Rep';
  const trimmed = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
  return escapeMarkdown(trimmed);
}

function dealCount(row) {
  return Number(row.dealCount ?? row.total ?? 0);
}

function rankLabel(index) {
  return MEDALS[index] || `**#${index + 1}**`;
}

function formatPhase3SpeedBreakdown(speeds) {
  const parts = PHASE3_SPEED_ORDER.map((speed) => [speed, speeds?.[speed] || 0])
    .filter(([, count]) => count > 0)
    .map(([speed, count]) => `${count}x ${PHASE3_SPEED_LABELS[speed] || speed}`);
  return parts.length ? parts.join(' · ') : '-';
}

function getDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value;
  return {
    weekday: pick('weekday'),
    month: pick('month'),
    day: Number(pick('day')),
    year: Number(pick('year')),
  };
}

function ymdInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function addDaysYmd(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateFromYmdNoonUtc(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function weekdayIndex(date, timeZone) {
  const weekday = getDateParts(date, timeZone).weekday;
  return {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  }[weekday] ?? 1;
}

function weekRangeLabel(now, timeZone) {
  const todayYmd = ymdInTz(now, timeZone);
  const daysFromMonday = (weekdayIndex(dateFromYmdNoonUtc(todayYmd), timeZone) + 6) % 7;
  const startYmd = addDaysYmd(todayYmd, -daysFromMonday);
  const endYmd = addDaysYmd(startYmd, 6);
  const start = getDateParts(dateFromYmdNoonUtc(startYmd), timeZone);
  const end = getDateParts(dateFromYmdNoonUtc(endYmd), timeZone);

  if (start.year !== end.year) {
    return `${start.month} ${start.day}–${end.month} ${end.day}, ${end.year}`;
  }
  if (start.month !== end.month) {
    return `${start.month} ${start.day}–${end.month} ${end.day}`;
  }
  return `${start.month} ${start.day}–${end.day}`;
}

function previousWeekRangeLabel(now, timeZone) {
  const todayYmd = ymdInTz(now, timeZone);
  const daysFromMonday = (weekdayIndex(dateFromYmdNoonUtc(todayYmd), timeZone) + 6) % 7;
  const thisMondayYmd = addDaysYmd(todayYmd, -daysFromMonday);
  const startYmd = addDaysYmd(thisMondayYmd, -7);
  const endYmd = addDaysYmd(startYmd, 6);
  const start = getDateParts(dateFromYmdNoonUtc(startYmd), timeZone);
  const end = getDateParts(dateFromYmdNoonUtc(endYmd), timeZone);
  if (start.year !== end.year) return `${start.month} ${start.day}–${end.month} ${end.day}, ${end.year}`;
  if (start.month !== end.month) return `${start.month} ${start.day}–${end.month} ${end.day}`;
  return `${start.month} ${start.day}–${end.day}`;
}

function monthLabel(now, timeZone, offsetMonths = 0) {
  const todayYmd = ymdInTz(now, timeZone);
  const [Y, M] = todayYmd.split('-').map(Number);
  const targetMonth0 = M - 1 + offsetMonths;
  const yearAdj = Math.floor(targetMonth0 / 12);
  const monthIdx = ((targetMonth0 % 12) + 12) % 12;
  const targetYmd = `${Y + yearAdj}-${String(monthIdx + 1).padStart(2, '0')}-15`;
  const parts = getDateParts(dateFromYmdNoonUtc(targetYmd), timeZone);
  return `${parts.month} ${parts.year}`;
}

function resolveDateContext(period, now = new Date(), tz = process.env.TZ || DEFAULT_TZ) {
  if (period === 'daily') {
    const parts = getDateParts(now, tz);
    return `Today · ${parts.weekday}, ${parts.month} ${parts.day}`;
  }
  if (period === 'yesterday') {
    const ymd = ymdInTz(now, tz);
    const y = addDaysYmd(ymd, -1);
    const parts = getDateParts(dateFromYmdNoonUtc(y), tz);
    return `Yesterday · ${parts.weekday}, ${parts.month} ${parts.day}`;
  }
  if (period === 'weekly') {
    return `This Week · ${weekRangeLabel(now, tz)}`;
  }
  if (period === 'lastweek') {
    return `Last Week · ${previousWeekRangeLabel(now, tz)}`;
  }
  if (period === 'monthly') {
    return `This Month · ${monthLabel(now, tz, 0)}`;
  }
  if (period === 'lastmonth') {
    return `Last Month · ${monthLabel(now, tz, -1)}`;
  }
  return 'All-Time';
}

const BAR_LEN = 6;
const MAX_CONTENT = 1900; // Discord hard cap is 2000 chars per message

/** Six-block bar scaled against the leader: ▰▰▰▰▱▱ */
function progressBar(count, top) {
  if (!top || !count) return '▱'.repeat(BAR_LEN);
  const filled = Math.max(1, Math.round((count / top) * BAR_LEN));
  return '▰'.repeat(filled) + '▱'.repeat(BAR_LEN - filled);
}

/** "🔥 Henny Sells leads by 2" / "🔥 Tied at the top — A, B" / null when nothing to say. */
function leaderLine(rows) {
  if (rows.length < 2) return null;
  const top = dealCount(rows[0]);
  if (!top) return null;
  const leaders = rows.filter((r) => dealCount(r) === top);
  if (leaders.length > 1) {
    const names = leaders.slice(0, 3).map(displayRepName).join(', ');
    const extra = leaders.length > 3 ? ` +${leaders.length - 3}` : '';
    return `🔥 Tied at the top — ${names}${extra}`;
  }
  return `🔥 ${displayRepName(rows[0])} leads by ${top - dealCount(rows[1])}`;
}

function formatLeaderboard({ scope, period, rows, total, market, dateContext, quarterLine }) {
  const isMaster = scope === 'master';
  const name = isMaster ? 'Master' : market || 'Unknown Market';
  const baseContext = dateContext || resolveDateContext(period);
  const context = isMaster ? `${baseContext} · All Markets` : baseContext;
  const SOFT_CAP = 50;
  const allRows = Array.isArray(rows) ? rows : [];
  const safeRows = allRows.slice(0, SOFT_CAP);
  const top = dealCount(safeRows[0] || {});

  const header = [`🏆 **${name} Leaderboard**`, context];
  if (quarterLine) header.push(quarterLine);

  const rowLine = (row, index) => {
    const fields = [`${rankLabel(index)} **${displayRepName(row)}** · **${dealCount(row)}**`];
    if (isMaster) fields.push(row.market || 'Unassigned');
    return `${fields.join(' · ')} ${progressBar(dealCount(row), top)}`;
  };

  const totalLabel = isMaster ? 'All Markets Total' : `${name} Total`;
  const reps = allRows.length ? ` · ${allRows.length} rep${allRows.length === 1 ? '' : 's'}` : '';
  const footer = [`**${totalLabel}** · **${total}** deals${reps}`];
  const leader = leaderLine(safeRows);
  if (leader) footer.push(leader);

  // ponytail: shrink rows until under Discord's limit; the overflow note absorbs what's cut.
  let shown = safeRows.length;
  let out;
  do {
    const body = shown ? safeRows.slice(0, shown).map(rowLine) : ['_No deals logged yet — first door wins the board._'];
    const overflow = allRows.length - shown;
    if (overflow > 0) body.push(`…and ${overflow} more`);
    out = [...header, '', ...body, '', ...footer].join('\n').replace(/[ \t]+$/gm, '');
    shown -= 1;
  } while (out.length > MAX_CONTENT && shown > 0);
  return out;
}

function formatPhase3Leaderboard({ title, rows, totalDeals, dateHeader, quarterHeader }) {
  const [market = title] = String(title || '').split(' · ');
  const t = String(title || '');
  const period = t.includes('Last Week') ? 'lastweek'
    : t.includes('This Week') ? 'weekly'
    : t.includes('Last Month') ? 'lastmonth'
    : t.includes('This Month') ? 'monthly'
    : t.includes('Yesterday') ? 'yesterday'
    : t.includes('All-Time') ? 'alltime'
    : 'daily';
  return formatLeaderboard({
    scope: 'market',
    period,
    rows,
    total: totalDeals,
    market,
    dateContext: dateHeader || resolveDateContext(period),
    quarterLine: quarterHeader,
  });
}

function formatPhase3Master(rows, totalDeals, periodLabel, quarterHeader, dateHeader) {
  const labelToPeriod = {
    'Today': 'daily',
    'Yesterday': 'yesterday',
    'This Week': 'weekly',
    'Last Week': 'lastweek',
    'This Month': 'monthly',
    'Last Month': 'lastmonth',
    'All-Time': 'alltime',
  };
  const period = labelToPeriod[periodLabel] || 'alltime';
  return formatLeaderboard({
    scope: 'master',
    period,
    rows,
    total: totalDeals,
    dateContext: dateHeader || resolveDateContext(period),
    quarterLine: quarterHeader,
  });
}

module.exports = {
  escapeMarkdown,
  displayRepName,
  rankLabel,
  formatPhase3SpeedBreakdown,
  resolveDateContext,
  formatLeaderboard,
  formatPhase3Leaderboard,
  formatPhase3Master,
};
