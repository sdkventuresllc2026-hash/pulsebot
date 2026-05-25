/**
 * Prefix leaderboard commands only. Unsupported duplicates intentionally return null.
 */

const UNSUPPORTED_PREFIXES = [
  'master today',
  'master week',
  'master leaderboard',
  'master all time',
  'master lb',
  'all time',
  'week',
  'today',
  'daily leaderboard',
  'weekly leaderboard',
];

function normalizedCommand(raw) {
  const text = String(raw || '').trim();
  if (!text.startsWith('!')) return null;
  return text.slice(1).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @param {string} raw
 * @returns {{ cmd: 'blitz'|'master', timeframe?: 'daily'|'weekly'|'alltime', period?: 'daily'|'weekly'|'alltime' } | null}
 */
function parseLeaderboardTextIntent(raw) {
  const t = normalizedCommand(raw);
  if (!t) return null;

  if (UNSUPPORTED_PREFIXES.some((cmd) => t === cmd || t.startsWith(`${cmd} `))) {
    return null;
  }

  const parts = t.split(' ');
  const first = parts[0];
  const second = parts[1];

  if (first === 'master') {
    if (second === 'daily') return { cmd: 'master', period: 'daily' };
    if (second === 'weekly') return { cmd: 'master', period: 'weekly' };
    if (second === 'alltime') return { cmd: 'master', period: 'alltime' };
    return null;
  }

  if (first === 'daily' || first === 'leaderboard' || first === 'lb') {
    return { cmd: 'blitz', timeframe: 'daily' };
  }
  if (first === 'weekly') return { cmd: 'blitz', timeframe: 'weekly' };
  if (first === 'alltime') return { cmd: 'blitz', timeframe: 'alltime' };

  return null;
}

module.exports = {
  parseLeaderboardTextIntent,
};
