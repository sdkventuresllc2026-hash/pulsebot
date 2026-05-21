/**
 * Leaderboard & board-related plain-text output (testable, no Discord deps).
 */

const { buildLeaderboardContext } = require('./gamification-engine');
const { selectCultureLine } = require('./day-quarters');
const { compactJoin } = require('./message-format');

const PHASE3_SPEED_ORDER = ['1gig', '2gig', '500mb', '300mb', '200mb'];
const PHASE3_SPEED_LABELS = {
  '1gig': '1 Gig',
  '2gig': '2 Gig',
  '500mb': '500 Mbps',
  '300mb': '300 Mbps',
  '200mb': '200 Mbps',
};

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `**#${rank}**`;
}

function withCompetitionRanks(rows) {
  let previousTotal = null;
  let previousRank = 0;
  return rows.map((row, idx) => {
    const rank = row.total === previousTotal ? previousRank : idx + 1;
    previousTotal = row.total;
    previousRank = rank;
    return { ...row, rank };
  });
}

function formatPhase3SpeedBreakdown(speeds) {
  const parts = PHASE3_SPEED_ORDER.map((speed) => [speed, speeds[speed] || 0])
    .filter(([, count]) => count > 0)
    .map(([speed, count]) => `${count}x ${PHASE3_SPEED_LABELS[speed] || speed}`);
  return parts.length ? parts.join(' | ') : '-';
}

function formatBlitzParenthetical(blitzCounts) {
  const entries = Object.entries(blitzCounts || {}).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (!entries.length) return '';
  if (entries.length === 1) return `(${entries[0][0]})`;
  return `(${entries.map(([name, count]) => `${name} ${count}`).join(' · ')})`;
}

function appendLeaderboardFooter(lines, rows, totalDeals, { skipCulture = false, compact = true } = {}) {
  const ctx = buildLeaderboardContext(rows);
  if (compact) {
    const parts = [`**${totalDeals}** deal${totalDeals === 1 ? '' : 's'}`];
    if (ctx) parts.push(ctx);
    lines.push(parts.join(' · '));
    return;
  }
  if (ctx) lines.push(ctx);
  else if (!skipCulture) {
    const cul = selectCultureLine([]);
    if (cul?.text) lines.push(cul.text);
  }
  lines.push(`**${totalDeals}** total`);
}

function formatPhase3Leaderboard({ title, rows, totalDeals, quarterHeader, dateHeader }) {
  if (!rows.length) return '**No deals logged yet.**';

  const lines = [];
  if (dateHeader) lines.push(`**${dateHeader}**`);
  lines.push(`**${title}**`);
  if (quarterHeader) lines.push(quarterHeader);
  for (const row of withCompetitionRanks(rows).slice(0, 10)) {
    lines.push(`${rankMedal(row.rank)} **${row.displayName}** · **${row.total}**`);
  }
  appendLeaderboardFooter(lines, rows, totalDeals, { skipCulture: true, compact: true });
  return compactJoin(lines);
}

function formatPhase3Master(rows, totalDeals, periodLabel, quarterHeader, dateHeader) {
  if (!rows.length) return '**No deals logged yet.**';

  const lines = [];
  if (dateHeader) lines.push(`**${dateHeader}**`);
  lines.push(`**Master Leaderboard** · ${periodLabel}`);
  if (quarterHeader) lines.push(quarterHeader);
  for (const row of withCompetitionRanks(rows).slice(0, 15)) {
    const market = formatBlitzParenthetical(row.blitzCounts);
    const marketPart = market ? ` ${market}` : '';
    lines.push(`${rankMedal(row.rank)} **${row.displayName}** · **${row.total}**${marketPart}`);
  }
  appendLeaderboardFooter(lines, rows, totalDeals, { skipCulture: true, compact: true });
  return compactJoin(lines);
}

module.exports = {
  rankMedal,
  withCompetitionRanks,
  formatPhase3SpeedBreakdown,
  formatBlitzParenthetical,
  formatPhase3Leaderboard,
  formatPhase3Master,
  appendLeaderboardFooter,
};
