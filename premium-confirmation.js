/**
 * Premium plain-text confirmations for logged deals (slash + natural).
 */

const { SPEEDS } = require('./constants');
const { compactJoin } = require('./message-format');
const { HYPE_LINES, isDealLogSafeLine } = require('./hype-bank');

const SPEED_DISPLAY = Object.freeze({
  '200mb': '200 Mbps',
  '300mb': '300 Mbps',
  '500mb': '500 Mbps',
  '1gig': '1 Gig',
  '2gig': '2 Gig',
});

function pick(pool) {
  if (!pool || !pool.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

/** @param {string[]} speeds */
function formatMultiSpeedLine(speeds) {
  const counts = new Map();
  for (const s of speeds) {
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const parts = [];
  for (const key of SPEEDS) {
    const n = counts.get(key);
    if (!n) continue;
    const label = SPEED_DISPLAY[key];
    parts.push(n > 1 ? `${n}× ${label}` : label);
  }
  return parts.join(' · ');
}

const PERSONAL_EVENTS = new Set([
  'first_ever',
  'first_today',
  'second_today',
  'hat_trick',
  'five_day',
  'ten_day',
  'personal_best',
  'comeback',
  'took_first',
  'entered_top3',
  'passed_rep',
  'one_away_first',
  'close_race',
  'late_night',
  'early_morning',
  'weekly_milestone',
  'alltime_milestone',
  'fallback',
  'momentum',
  'q1',
  'q2',
  'q3',
  'q4',
  'pregame',
  'overtime',
  'culture',
]);

function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function lineAllowedByCooldown(line, recentLineIds) {
  if (!line || !line.cooldownCount) return true;
  const window = recentLineIds.slice(-line.cooldownCount);
  return !window.includes(line.id);
}

function selectHypeLine({ event, values = {}, recentLineIds = [] }) {
  const candidates = HYPE_LINES.filter((line) => line.tags.includes(event));
  const scoped = candidates.length ? candidates : HYPE_LINES.filter((line) => line.tags.includes('fallback'));
  const available = scoped.filter((line) => lineAllowedByCooldown(line, recentLineIds));
  const picked = pick(available.length ? available : scoped);
  if (!picked) return null;
  return {
    id: picked.id,
    category: picked.category,
    intensity: picked.intensity,
    event,
    text: fillTemplate(picked.text, values),
  };
}

function buildPhase4HypeLine(kind, values = {}, recentLineIds = []) {
  const byKind = {
    newLeader: 'took_first',
    oneAway: 'one_away_first',
    tied: 'close_race',
    lateClock: 'late_night',
    repDaily: Number(values.count) >= 10 ? 'ten_day' : Number(values.count) >= 5 ? 'five_day' : 'hat_trick',
    blitzDaily: Number(values.count) >= 50 ? 'team_milestone_high' : 'team_milestone',
  };
  const event = byKind[kind] || 'fallback';
  return selectHypeLine({ event, values, recentLineIds })?.text || '';
}

function selectClosingLine(ctx) {
  const {
    speeds,
    userId,
    dealsTodayAfter,
    dealsTodayBefore,
    rankTodayAfter,
    rankTodayBefore,
    rowsTodayAfter,
    displayName,
  } = ctx;

  const userRow = rowsTodayAfter.find((r) => r.userId === userId);
  const userTotal = userRow?.total ?? 0;
  const topTotal = rowsTodayAfter[0]?.total ?? 0;
  const leaders = rowsTodayAfter.filter((r) => r.total === topTotal && topTotal > 0);
  const tiedAtTop = leaders.length >= 2 && leaders.some((r) => r.userId === userId);

  const newSoleLeader =
    rankTodayAfter === 1 &&
    rowsTodayAfter[0]?.userId === userId &&
    rankTodayBefore != null &&
    rankTodayBefore > 1 &&
    !tiedAtTop;

  const oneBehind =
    topTotal > 0 &&
    userTotal === topTotal - 1 &&
    rankTodayAfter != null &&
    rankTodayAfter > 1 &&
    !tiedAtTop;

  const rep = displayName || userId;
  if (tiedAtTop) return selectHypeLine({ event: 'close_race', values: { rep } })?.text;
  if (newSoleLeader) return selectHypeLine({ event: 'took_first', values: { rep } })?.text;
  if (oneBehind) return selectHypeLine({ event: 'one_away_first', values: { rep } })?.text;

  if (dealsTodayBefore === 0 && dealsTodayAfter > 0) return selectHypeLine({ event: 'first_today', values: { rep } })?.text;
  if (dealsTodayAfter === 2) return selectHypeLine({ event: 'second_today', values: { rep } })?.text;
  if (dealsTodayAfter === 3) return selectHypeLine({ event: 'hat_trick', values: { rep } })?.text;
  if (dealsTodayAfter === 5) return selectHypeLine({ event: 'five_day', values: { rep } })?.text;
  if (dealsTodayAfter === 10) return selectHypeLine({ event: 'ten_day', values: { rep } })?.text;
  if (speeds.length > 1) return selectHypeLine({ event: 'momentum', values: { rep } })?.text;
  return selectHypeLine({ event: 'fallback', values: { rep } })?.text;
}

/** Deal confirmation: one bank line, no rep/speed repeat (header has both). */
function buildDealHypeLine({ picked, displayName, movement }) {
  if (!picked) return null;

  if (picked.event === 'passed_rep' && movement?.passedRepName) {
    return `**Passed ${movement.passedRepName}.**`;
  }

  const text = picked.text || '';
  if (!isDealLogSafeLine(text)) return '**On the board.**';
  if (displayName && text.toLowerCase().includes(String(displayName).toLowerCase())) {
    return '**On the board.**';
  }
  if (/\{otherrep\}/i.test(text) && !movement?.passedRepName) return '**On the board.**';
  return text || '**On the board.**';
}

function buildPremiumDealConfirmation(ctx) {
  const { displayName, speeds } = ctx;

  // "· 3 today" only once there's a count to show; the first deal of the day is already the hype line's job.
  const today = Number(ctx.dealsTodayAfter) > 1 ? ` · **${ctx.dealsTodayAfter} today**` : '';
  let header;
  if (speeds.length === 1) {
    header = `✅ **Logged** — **${displayName}** · ${SPEED_DISPLAY[speeds[0]] || speeds[0]}${today}`;
  } else {
    header = `✅ **Logged** — **${displayName}** · **${speeds.length}** deals${today}\n${formatMultiSpeedLine(speeds)}`;
  }

  const parts = [header];
  if (ctx.hypeLine) parts.push(ctx.hypeLine);
  if (ctx.hasCustomerOnFile) parts.push('_Customer on file._');
  return compactJoin(parts);
}

function normalizeHypeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hypeTextsSimilar(a, b) {
  const na = normalizeHypeText(a);
  const nb = normalizeHypeText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

module.exports = {
  buildPremiumDealConfirmation,
  buildDealHypeLine,
  buildPhase4HypeLine,
  selectHypeLine,
  HYPE_LINES,
  PERSONAL_EVENTS,
  selectClosingLine,
  formatMultiSpeedLine,
  SPEED_DISPLAY,
  normalizeHypeText,
  hypeTextsSimilar,
};
