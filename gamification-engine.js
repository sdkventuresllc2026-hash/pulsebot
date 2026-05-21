function ensureGamificationState(data) {
  data.gamification = data.gamification && typeof data.gamification === 'object' ? data.gamification : {};
  const game = data.gamification;
  game.dailyMilestones =
    game.dailyMilestones && typeof game.dailyMilestones === 'object' ? game.dailyMilestones : {};
  game.weeklyMilestones =
    game.weeklyMilestones && typeof game.weeklyMilestones === 'object' ? game.weeklyMilestones : {};
  game.allTimeMilestones =
    game.allTimeMilestones && typeof game.allTimeMilestones === 'object' ? game.allTimeMilestones : {};
  game.teamMilestones =
    game.teamMilestones && typeof game.teamMilestones === 'object' ? game.teamMilestones : {};
  game.recentLineIds = Array.isArray(game.recentLineIds) ? game.recentLineIds : [];
  game.lastLeaderboardEventByRep =
    game.lastLeaderboardEventByRep && typeof game.lastLeaderboardEventByRep === 'object'
      ? game.lastLeaderboardEventByRep
      : {};
  return game;
}

function rememberLineId(game, lineId, max = 40) {
  if (!lineId || !game) return;
  game.recentLineIds.push(lineId);
  if (game.recentLineIds.length > max) {
    game.recentLineIds.splice(0, game.recentLineIds.length - max);
  }
}

function markMilestoneOnce(bucket, key) {
  if (!bucket || typeof bucket !== 'object' || !key) return false;
  if (bucket[key]) return false;
  bucket[key] = new Date().toISOString();
  return true;
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

function deriveLeaderboardMovement({ beforeRows, afterRows, userId }) {
  const beforeRanked = withCompetitionRanks(beforeRows || []);
  const afterRanked = withCompetitionRanks(afterRows || []);
  const beforeUser = beforeRanked.find((r) => r.userId === userId);
  const afterUser = afterRanked.find((r) => r.userId === userId);
  if (!afterUser) {
    return {
      tookFirst: false,
      enteredTop3: false,
      passedRepName: null,
      oneAwayFromFirst: false,
    };
  }

  const tookFirst = afterUser.rank === 1 && (beforeUser?.rank || 999) > 1;
  const enteredTop3 = afterUser.rank <= 3 && (beforeUser?.rank || 999) > 3;
  const passedRepName =
    beforeUser && afterUser.rank < beforeUser.rank
      ? beforeRanked.find((r) => r.rank === afterUser.rank && r.userId !== userId)?.displayName || null
      : null;
  const topTotal = afterRanked[0]?.total || 0;
  const oneAwayFromFirst = afterUser.rank > 1 && topTotal > 0 && afterUser.total === topTotal - 1;

  return { tookFirst, enteredTop3, passedRepName, oneAwayFromFirst };
}

function buildLeaderboardContext(rows) {
  if (!rows || rows.length < 2) return '';
  const ranked = withCompetitionRanks(rows);
  const top = ranked[0];
  const second = ranked.find((r) => r.rank === 2) || ranked[1];
  const topGap = top.total - second.total;
  if (topGap <= 1) {
    return topGap === 0
      ? `**${second.displayName}** tied for **#1**`
      : `**${second.displayName}** is **1** deal from **#1**`;
  }
  const topThree = ranked.filter((r) => r.rank <= 3);
  if (topThree.length >= 3) {
    const spread = topThree[0].total - topThree[topThree.length - 1].total;
    if (spread <= 2) return `Top 3 within **${spread}** deals`;
  }
  return '';
}

module.exports = {
  ensureGamificationState,
  rememberLineId,
  markMilestoneOnce,
  deriveLeaderboardMovement,
  buildLeaderboardContext,
};
