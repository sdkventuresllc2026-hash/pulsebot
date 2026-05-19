/**
 * Premium plain-text confirmations for logged deals (slash + natural).
 */

const { SPEEDS } = require('./constants');

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
  return parts.join(' | ');
}

const HYPE_LINES = Object.freeze([
  { id: 'recognition_1', category: 'Clean Recognition', intensity: 'low', tags: ['fallback'], cooldownCount: 8, text: 'That one matters. {rep} is on the sheet.' },
  { id: 'recognition_2', category: 'Clean Recognition', intensity: 'low', tags: ['fallback'], cooldownCount: 8, text: 'Clean work. Keep stacking.' },
  { id: 'momentum_1', category: 'Momentum', intensity: 'medium', tags: ['second_today', 'hat_trick'], cooldownCount: 10, text: 'Momentum is starting to show.' },
  { id: 'momentum_2', category: 'Momentum', intensity: 'medium', tags: ['five_day'], cooldownCount: 12, text: 'Five on the day. That is a real shift.' },
  { id: 'momentum_3', category: 'Momentum', intensity: 'high', tags: ['ten_day'], cooldownCount: 14, text: 'Double digits. Different kind of day.' },
  { id: 'pressure_1', category: 'Competitive Pressure', intensity: 'medium', tags: ['one_away_first', 'close_race'], cooldownCount: 8, text: 'Top spot is one deal away.' },
  { id: 'pressure_2', category: 'Competitive Pressure', intensity: 'medium', tags: ['close_race'], cooldownCount: 8, text: 'Top 3 just got tighter.' },
  { id: 'lb_1', category: 'Leaderboard Movement', intensity: 'high', tags: ['took_first'], cooldownCount: 12, text: 'Board changed. Everyone saw it.' },
  { id: 'lb_2', category: 'Leaderboard Movement', intensity: 'medium', tags: ['entered_top3'], cooldownCount: 10, text: '{rep} just stepped into the top 3.' },
  { id: 'lb_3', category: 'Leaderboard Movement', intensity: 'medium', tags: ['passed_rep'], cooldownCount: 10, text: '{rep} just passed {otherRep}.' },
  { id: 'pb_1', category: 'Personal Best', intensity: 'high', tags: ['personal_best'], cooldownCount: 18, text: 'New personal best day for {rep}.' },
  { id: 'rookie_1', category: 'Rookie / First Deal', intensity: 'medium', tags: ['first_ever', 'rookie_first'], cooldownCount: 20, text: 'First one logged. Now the game starts.' },
  { id: 'rookie_2', category: 'Rookie / First Deal', intensity: 'medium', tags: ['first_today'], cooldownCount: 10, text: 'First one is always the hardest. Now build.' },
  { id: 'team_1', category: 'Team Culture', intensity: 'medium', tags: ['team_milestone'], cooldownCount: 10, text: '{team} hit {count}. Team is moving.' },
  { id: 'team_2', category: 'Team Culture', intensity: 'high', tags: ['team_milestone_high'], cooldownCount: 12, text: '{team} put {count} on the board.' },
  { id: 'grind_1', category: 'Late Night / Grind', intensity: 'low', tags: ['late_night'], cooldownCount: 12, text: 'Late clock deal from {rep}.' },
  { id: 'grind_2', category: 'Late Night / Grind', intensity: 'low', tags: ['early_morning'], cooldownCount: 12, text: '{rep} started early. Good sign.' },
  { id: 'milestone_1', category: 'Milestone', intensity: 'medium', tags: ['weekly_milestone'], cooldownCount: 14, text: '{count} this week. That is not luck.' },
  { id: 'milestone_2', category: 'Milestone', intensity: 'high', tags: ['alltime_milestone'], cooldownCount: 20, text: '{count} all-time logged by {rep}.' },
  { id: 'comeback_1', category: 'Quiet Killer / Comeback', intensity: 'medium', tags: ['comeback'], cooldownCount: 16, text: 'That is a real answer after a quiet stretch.' },
  { id: 'comeback_2', category: 'Quiet Killer / Comeback', intensity: 'medium', tags: ['comeback'], cooldownCount: 16, text: '{rep} is making noise again.' },
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

/**
 * @param {{
 *   speeds: string[],
 *   userId: string,
 *   dealsTodayAfter: number,
 *   dealsTodayBefore: number,
 *   rankTodayAfter: number | null,
 *   rankTodayBefore: number | null,
 *   rowsTodayAfter: { userId: string, total: number }[],
 * }} ctx
 */
function selectClosingLine(ctx) {
  const {
    speeds,
    userId,
    dealsTodayAfter,
    dealsTodayBefore,
    rankTodayAfter,
    rankTodayBefore,
    rowsTodayAfter,
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

  if (tiedAtTop) return selectHypeLine({ event: 'close_race', values: { rep: userId } })?.text;
  if (newSoleLeader) return selectHypeLine({ event: 'took_first', values: { rep: userId } })?.text;
  if (oneBehind) return selectHypeLine({ event: 'one_away_first', values: { rep: userId } })?.text;

  if (dealsTodayBefore === 0 && dealsTodayAfter > 0) return selectHypeLine({ event: 'first_today', values: { rep: userId } })?.text;
  if (dealsTodayAfter === 2) return selectHypeLine({ event: 'second_today', values: { rep: userId } })?.text;
  if (dealsTodayAfter === 3) return selectHypeLine({ event: 'hat_trick', values: { rep: userId } })?.text;
  if (dealsTodayAfter === 5) return selectHypeLine({ event: 'five_day', values: { rep: userId } })?.text;
  if (dealsTodayAfter === 10) return selectHypeLine({ event: 'ten_day', values: { rep: userId } })?.text;
  if (speeds.length > 1) return selectHypeLine({ event: 'momentum', values: { rep: userId } })?.text;
  return selectHypeLine({ event: 'fallback', values: { rep: userId } })?.text;
}

/**
 * @param {{
 *   displayName: string,
 *   blitzName: string,
 *   speeds: string[],
 *   userId: string,
 *   dealsTodayAfter: number,
 *   dealsTodayBefore: number,
 *   rankTodayAfter: number | null,
 *   rankTodayBefore: number | null,
 *   rowsTodayAfter: { userId: string, total: number }[],
 *   hasCustomerOnFile?: boolean,
 * }} ctx
 */
function buildPremiumDealConfirmation(ctx) {
  const { displayName, speeds } = ctx;

  let bodyLine;
  if (speeds.length === 1) {
    bodyLine = `**${displayName}** — ${SPEED_DISPLAY[speeds[0]] || speeds[0]}`;
  } else {
    bodyLine = `**${displayName}** — ${speeds.length} deals\n${formatMultiSpeedLine(speeds)}`;
  }

  const footer = ctx.primaryLine || selectClosingLine(ctx);
  const parts = ['Logged ✅', bodyLine, '', footer];
  if (ctx.hasCustomerOnFile) {
    parts.push('', '_Customer on file._');
  }
  return parts.join('\n');
}

module.exports = {
  buildPremiumDealConfirmation,
  buildPhase4HypeLine,
  selectHypeLine,
  HYPE_LINES,
  selectClosingLine,
  formatMultiSpeedLine,
  SPEED_DISPLAY,
};
