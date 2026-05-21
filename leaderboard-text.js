/**
 * Type leaderboard commands in chat (no slash required).
 * Whole message must match — avoids false triggers on normal chat.
 */

/**
 * @param {string} raw
 * @returns {{ cmd: string, timeframe?: string, period?: string } | null}
 */
function parseLeaderboardTextIntent(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!?.]+$/g, '');
  if (!t) return null;

  if (/^(?:pulse\s+)?(?:quarter|q)$/.test(t)) return { cmd: 'quarter' };
  if (/^(?:pulse\s+)?(?:my[- ]?deals|my[- ]?stats|stats|me)$/.test(t)) return { cmd: 'mydeals' };
  if (/^(?:pulse\s+)?(?:markets|market)$/.test(t)) return { cmd: 'markets' };

  if (
    /^(?:pulse\s+)?(?:show\s+)?master(?:\s+(?:lb|leaderboard|board))?(?:\s+(?:week|weekly|month|monthly|all(?:[- ]?time)?))?$/.test(
      t,
    ) ||
    /^(?:pulse\s+)?(?:master\s+)?(?:lb|leaderboard|board)\s+master(?:\s+(?:week|weekly|month|monthly))?$/.test(t) ||
    /^(?:pulse\s+)?(?:week|weekly|month|monthly)\s+master(?:\s+(?:lb|leaderboard|board))?$/.test(t)
  ) {
    if (/\b(month|monthly)\b/.test(t)) return { cmd: 'master', period: 'month' };
    if (/\b(week|weekly)\b/.test(t)) return { cmd: 'master', period: 'week' };
    return { cmd: 'master', period: 'alltime' };
  }

  if (
    /^(?:pulse\s+)?(?:show\s+)?(?:daily|today)(?:\s+(?:lb|leaderboard|board))?$/.test(t) ||
    /^(?:pulse\s+)?(?:lb|leaderboard|board)\s+(?:daily|today)$/.test(t)
  ) {
    return { cmd: 'blitz', timeframe: 'daily' };
  }

  if (
    /^(?:pulse\s+)?(?:show\s+)?(?:weekly|week)(?:\s+(?:lb|leaderboard|board))?$/.test(t) ||
    /^(?:pulse\s+)?(?:lb|leaderboard|board)\s+(?:weekly|week)$/.test(t)
  ) {
    return { cmd: 'blitz', timeframe: 'weekly' };
  }

  if (/^(?:pulse\s+)?(?:show\s+)?(?:blitz|all[- ]?time)(?:\s+(?:lb|leaderboard|board))?$/.test(t)) {
    return { cmd: 'blitz', timeframe: 'alltime' };
  }

  if (/^(?:pulse\s+)?(?:show\s+)?(?:lb|leaderboard|board)$/.test(t)) {
    return { cmd: 'blitz', timeframe: 'alltime' };
  }

  return null;
}

module.exports = {
  parseLeaderboardTextIntent,
};
