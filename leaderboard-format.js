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
  return MEDALS[index] || `#${index + 1}`;
}

function formatPhase3SpeedBreakdown(speeds) {
  const parts = PHASE3_SPEED_ORDER.map((speed) => [speed, speeds?.[speed] || 0])
    .filter(([, count]) => count > 0)
    .map(([speed, count]) => `${count}x ${PHASE3_SPEED_LABELS[speed] || speed}`);
  return parts.length ? parts.join(' | ') : '-';
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

function resolveDateContext(period, now = new Date(), tz = process.env.TZ || DEFAULT_TZ) {
  if (period === 'daily') {
    const parts = getDateParts(now, tz);
    return `Today · ${parts.weekday}, ${parts.month} ${parts.day}`;
  }
  if (period === 'weekly') {
    return `This Week · ${weekRangeLabel(now, tz)}`;
  }
  return 'All-Time';
}

function formatLeaderboard({ scope, period, rows, total, market, dateContext }) {
  const isMaster = scope === 'master';
  const title = isMaster ? '**Master Leaderboard**' : `**${market || 'Unknown Market'} Leaderboard**`;
  const baseContext = dateContext || resolveDateContext(period);
  const context = isMaster ? `${baseContext} · All Markets` : baseContext;
  const safeRows = Array.isArray(rows) ? rows.slice(0, 10) : [];
  const lines = [title, context, ''];

  if (safeRows.length) {
    safeRows.forEach((row, index) => {
      const fields = [`${rankLabel(index)} **${displayRepName(row)}**`, String(dealCount(row))];
      if (isMaster) fields.push(row.market || 'Unassigned');
      lines.push(fields.join(' · '));
    });
  } else {
    lines.push('No deals logged yet.');
  }

  lines.push('');
  lines.push(isMaster ? `**All Markets Total** · ${total} deals` : `**${market || 'Unknown Market'} Total** · ${total} deals`);
  return lines.join('\n').replace(/[ \t]+$/gm, '');
}

function formatPhase3Leaderboard({ title, rows, totalDeals, dateHeader }) {
  const [market = title] = String(title || '').split(' · ');
  const period = title?.includes('This Week') ? 'weekly' : title?.includes('All-Time') ? 'alltime' : 'daily';
  return formatLeaderboard({
    scope: 'market',
    period,
    rows,
    total: totalDeals,
    market,
    dateContext: dateHeader || resolveDateContext(period),
  });
}

function formatPhase3Master(rows, totalDeals, periodLabel, _quarterHeader, dateHeader) {
  const period = periodLabel === 'This Week' ? 'weekly' : periodLabel === 'Today' ? 'daily' : 'alltime';
  return formatLeaderboard({
    scope: 'master',
    period,
    rows,
    total: totalDeals,
    dateContext: dateHeader || resolveDateContext(period),
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
