/**
 * /master and /markets follow the fibersales.co leaderboard rules (owner 2026-10-15): Caleb+Henry+
 * Anthony share one board, Don's team sees only Don's team, hidden branches see an empty board.
 * The OS roster carries each person's `board` ("all" | "hidden" | "group:<ids>").
 *
 * Viewer rules: Owner / Discord admin → everything. Viewer the OS does not know → empty (safe default).
 * A deal counts for a restricted viewer only when its author is on the same board.
 */
const { fetchAccessRoster } = require('./fiberSalesOsClient');

const RANK = { hidden: 3, group: 2, all: 1 };
const rankOf = (b) => RANK[String(b).split(':')[0]] || 0;

/** discordUserId → board. Two records for one human: the more restrictive board wins. */
function boardsById(roster) {
  const out = new Map();
  for (const p of roster.active || []) {
    if (!p.discordUserId || !p.board) continue;
    const cur = out.get(p.discordUserId);
    if (!cur || rankOf(p.board) > rankOf(cur)) out.set(p.discordUserId, p.board);
  }
  return out;
}

/** Returns null (no filter) or a predicate on a deal log. */
function scopeFor(viewerId, isOwner, boards) {
  if (isOwner) return null;
  const mine = boards.get(viewerId);
  if (!mine || mine === 'hidden') return () => false;
  if (mine === 'all') return null;
  return (log) => boards.get(log.userId) === mine;
}

let cache = { at: 0, boards: null };
/** Cached 5 min. If the OS is unreachable, restricted viewers get an empty board, never everyone's. */
async function viewerScope(viewerId, isOwner) {
  if (isOwner) return null;
  if (!cache.boards || Date.now() - cache.at > 5 * 60 * 1000) {
    const roster = await fetchAccessRoster();
    if (roster.ok) cache = { at: Date.now(), boards: boardsById(roster) };
  }
  if (!cache.boards) return () => false;
  return scopeFor(viewerId, false, cache.boards);
}

module.exports = { boardsById, scopeFor, viewerScope };
