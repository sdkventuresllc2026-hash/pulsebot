/**
 * Pulse — stats helpers (no points; rank = total deals)
 */

const { SPEED_LABELS } = require('./constants');

function getTimeZone() {
  return process.env.TZ || 'America/New_York';
}

function fmtDateInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

const WEEKDAY_LONG_TO_DOW = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function weekdayIndexInTz(date, timeZone) {
  const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
  return WEEKDAY_LONG_TO_DOW[weekdayStr] ?? 1;
}

function addDaysYmd(ymd, deltaDays, timeZone) {
  const [Y, M, D] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return fmtDateInTz(base, timeZone);
}

function getWeekWindow(date = new Date(), timeZone = getTimeZone()) {
  const ymd = fmtDateInTz(date, timeZone);
  const anchor = new Date(`${ymd}T12:00:00Z`);
  const dow = weekdayIndexInTz(anchor, timeZone);
  const daysFromMonday = (dow + 6) % 7;
  const startYmd = addDaysYmd(ymd, -daysFromMonday, timeZone);
  const endYmdExclusive = addDaysYmd(startYmd, 7, timeZone);
  return { startYmd, endYmdExclusive, timeZone };
}

function logInYmdRange(log, startYmd, endYmdExclusive) {
  const d = log.date || log.timestamp?.slice(0, 10);
  return d >= startYmd && d < endYmdExclusive;
}

function filterByWeekId(logs, weekId) {
  return logs.filter((l) => l.weekId === weekId);
}

function filterToday(logs, timeZone = getTimeZone()) {
  const today = fmtDateInTz(new Date(), timeZone);
  return logs.filter((l) => (l.date || l.timestamp?.slice(0, 10)) === today);
}

function filterWeeklyByCalendarWeek(logs, timeZone = getTimeZone()) {
  const { startYmd, endYmdExclusive } = getWeekWindow(new Date(), timeZone);
  return logs.filter((l) => logInYmdRange(l, startYmd, endYmdExclusive));
}

function blitzFromChannelName(channelName) {
  if (!channelName) return 'Unknown Team';
  return channelName.replace(/^#/, '').trim() || 'Unknown Team';
}

function aggregateUsers(logs) {
  const byUser = new Map();

  for (const l of logs) {
    if (!byUser.has(l.userId)) {
      byUser.set(l.userId, {
        userId: l.userId,
        displayName: l.displayName || l.username || 'Unknown',
        username: l.username || '',
        total: 0,
        speeds: {},
        blitzCounts: {},
      });
    }
    const u = byUser.get(l.userId);
    u.total += 1;
    u.speeds[l.speed] = (u.speeds[l.speed] || 0) + 1;
    const b = l.blitzName || 'Unknown Team';
    u.blitzCounts[b] = (u.blitzCounts[b] || 0) + 1;

    u.displayName = l.displayName || u.displayName;
    u.username = l.username || u.username;
  }

  return [...byUser.values()].sort((a, b) => b.total - a.total);
}

function primaryBlitz(userAgg) {
  let best = null;
  let bestN = -1;
  for (const [k, v] of Object.entries(userAgg.blitzCounts || {})) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best || 'Unknown Team';
}

function formatSpeedBreakdown(speeds) {
  const lines = [];
  for (const [k, label] of Object.entries(SPEED_LABELS)) {
    const n = speeds[k] || 0;
    if (n > 0) lines.push(`${label}: ${n}`);
  }
  return lines.length ? lines.join('\n') : '—';
}

function dealsPerDayForUser(allLogs, userId) {
  const map = new Map();
  for (const l of allLogs) {
    if (l.userId !== userId) continue;
    const d = l.date || l.timestamp?.slice(0, 10);
    map.set(d, (map.get(d) || 0) + 1);
  }
  return map;
}

function currentStreakDays(allLogs, userId, timeZone = getTimeZone()) {
  const perDay = dealsPerDayForUser(allLogs, userId);
  if (perDay.size === 0) return 0;

  let streak = 0;
  let cursor = fmtDateInTz(new Date(), timeZone);

  if (!perDay.has(cursor)) {
    cursor = addDaysYmd(cursor, -1, timeZone);
  }

  while (perDay.has(cursor) && (perDay.get(cursor) || 0) > 0) {
    streak += 1;
    cursor = addDaysYmd(cursor, -1, timeZone);
  }
  return streak;
}

function bestDayEver(allLogs, userId) {
  const perDay = dealsPerDayForUser(allLogs, userId);
  let best = 0;
  for (const n of perDay.values()) best = Math.max(best, n);
  return best;
}

function rankUser(sortedAggs, userId) {
  const idx = sortedAggs.findIndex((u) => u.userId === userId);
  if (idx === -1) return null;
  return idx + 1;
}

function aggregateTeamWeekly(logs) {
  const m = new Map();
  for (const l of logs) {
    const t = l.blitzName || 'Unknown Team';
    m.set(t, (m.get(t) || 0) + 1);
  }
  return m;
}

exports.getTimeZone = getTimeZone;
exports.fmtDateInTz = fmtDateInTz;
exports.getWeekWindow = getWeekWindow;
exports.filterByWeekId = filterByWeekId;
exports.filterToday = filterToday;
exports.filterWeeklyByCalendarWeek = filterWeeklyByCalendarWeek;
exports.blitzFromChannelName = blitzFromChannelName;
exports.aggregateUsers = aggregateUsers;
exports.primaryBlitz = primaryBlitz;
exports.formatSpeedBreakdown = formatSpeedBreakdown;
exports.dealsPerDayForUser = dealsPerDayForUser;
exports.currentStreakDays = currentStreakDays;
exports.bestDayEver = bestDayEver;
exports.rankUser = rankUser;
exports.aggregateTeamWeekly = aggregateTeamWeekly;
exports.logInYmdRange = logInYmdRange;
