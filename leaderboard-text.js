/**
 * Text leaderboard commands. Detected from raw message text (no prefix).
 *
 * Market (current channel):
 *   daily              → market today
 *   yesterday          → market yesterday
 *   weekly             → market this week
 *   weekly last        → market last week
 *   monthly            → market this month
 *   monthly last       → market last month
 *   alltime            → market all-time
 *
 * Master (all markets):
 *   master             → master DAILY (default)
 *   master daily       → master today
 *   master yesterday   → master yesterday
 *   master week        → master this week
 *   master weekly      → master this week
 *   master week last   → master last week
 *   master weekly last → master last week
 *   master month       → master this month
 *   master monthly     → master this month
 *   master month last  → master last month
 *   master alltime     → master all-time
 */

function normalizedCommand(raw) {
  const text = String(raw || '').trim();
  const withoutBang = text.startsWith('!') ? text.slice(1) : text;
  const withoutSlash = withoutBang.startsWith('/') ? withoutBang.slice(1) : withoutBang;
  return withoutSlash.trim().toLowerCase().replace(/\s+/g, ' ');
}

const MARKET_DIRECT = {
  daily: 'daily',
  today: 'daily',
  yesterday: 'yesterday',
  weekly: 'weekly',
  week: 'weekly',
  'this week': 'weekly',
  'this weekly': 'weekly',
  monthly: 'monthly',
  month: 'monthly',
  'this month': 'monthly',
  'this monthly': 'monthly',
  alltime: 'alltime',
  'all time': 'alltime',
  'all-time': 'alltime',
  'weekly last': 'lastweek',
  'week last': 'lastweek',
  'last week': 'lastweek',
  'last weekly': 'lastweek',
  'monthly last': 'lastmonth',
  'month last': 'lastmonth',
  'last month': 'lastmonth',
  'last monthly': 'lastmonth',
};

const MASTER_PERIODS = {
  '': 'daily',
  daily: 'daily',
  today: 'daily',
  yesterday: 'yesterday',
  weekly: 'weekly',
  week: 'weekly',
  'this week': 'weekly',
  'this weekly': 'weekly',
  monthly: 'monthly',
  month: 'monthly',
  'this month': 'monthly',
  'this monthly': 'monthly',
  alltime: 'alltime',
  'all time': 'alltime',
  'all-time': 'alltime',
  'weekly last': 'lastweek',
  'week last': 'lastweek',
  'last week': 'lastweek',
  'last weekly': 'lastweek',
  'monthly last': 'lastmonth',
  'month last': 'lastmonth',
  'last month': 'lastmonth',
  'last monthly': 'lastmonth',
  leaderboard: 'daily',
};

/**
 * @param {string} raw
 * @returns {{ cmd: 'blitz'|'master', timeframe?: string, period?: string } | null}
 */
function parseLeaderboardTextIntent(raw) {
  const t = normalizedCommand(raw);
  if (!t) return null;

  if (t === 'master' || t.startsWith('master ')) {
    const rest = t === 'master' ? '' : t.slice(7).trim();
    const period = MASTER_PERIODS[rest];
    if (!period) return null;
    return { cmd: 'master', period };
  }

  const tf = MARKET_DIRECT[t];
  if (tf) return { cmd: 'blitz', timeframe: tf };

  return null;
}

module.exports = {
  parseLeaderboardTextIntent,
};
