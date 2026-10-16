/**
 * Pulse hype line bank.
 *
 * Owner 2026-10-16: simple. Not corny, not cheesy, nothing that sounds written by a bot. One line
 * per moment, and mostly it just says the number ("Seven today."). "3 ball." stays: the team uses it.
 * Deal logs only show a line on a real moment; routine events (fallback, momentum, quarters,
 * late/early) never print on a deal log (ROUTINE_EVENTS in premium-confirmation.js).
 * Review every quarter: change the text here, keep the tags.
 */

const L = (id, category, intensity, tags, cooldownCount, text) => ({ id, category, intensity, tags, cooldownCount, text });

/** @type {readonly { id: string, category: string, intensity: string, tags: string[], cooldownCount: number, text: string }[]} */
const HYPE_LINES = Object.freeze([
  // Routine (not printed on deal logs)
  L('fb_1', 'Fallback', 'low', ['fallback'], 0, '**On the board.**'),
  L('mo_1', 'Momentum', 'medium', ['momentum'], 0, '**Stacked.**'),

  // Deal count today: say the number, that is the hype.
  L('ft_1', 'First Today', 'medium', ['first_today'], 0, '**First one today.**'),
  L('s2_1', 'Second', 'low', ['second_today'], 0, '**Two today.**'),
  L('ht_1', 'Hat Trick', 'medium', ['hat_trick'], 0, '**3 ball.**'),
  L('d4_1', 'Four Day', 'medium', ['day_4'], 0, '**Four today.**'),
  L('f5_1', 'Five Day', 'high', ['five_day'], 0, '**Five today.**'),
  L('d6_1', 'Six Day', 'high', ['day_6'], 0, '**Six today.**'),
  L('d7_1', 'Seven Day', 'high', ['day_7'], 0, '**Seven today.**'),
  L('d8_1', 'Eight Day', 'high', ['day_8'], 0, '**Eight today.**'),
  L('d9_1', 'Nine Day', 'high', ['day_9'], 0, '**Nine today.**'),
  L('t10_1', 'Ten Day', 'high', ['ten_day'], 0, '**Double digits.**'),
  L('d15_1', 'Fifteen Day', 'high', ['day_15'], 0, '**15 today.**'),
  L('d20_1', 'Twenty Day', 'high', ['day_20'], 0, '**20 today.**'),

  // First ever
  L('fe_1', 'First Ever', 'medium', ['first_ever', 'rookie_first'], 0, '**First deal.**'),

  // Leaderboard moves
  L('tf_1', 'Took First', 'high', ['took_first'], 0, '**Took #1.**'),
  L('t3_1', 'Top 3', 'medium', ['entered_top3'], 0, '**Top 3.**'),
  L('pr_1', 'Passed', 'medium', ['passed_rep'], 0, '**Passed {otherRep}.**'),
  L('o1_1', 'One Away', 'medium', ['one_away_first'], 0, '**One back from #1.**'),
  L('cr_1', 'Close Race', 'medium', ['close_race'], 0, '**Tied for #1.**'),

  // Personal best / comeback
  L('pb_1', 'Personal Best', 'high', ['personal_best'], 0, '**Personal best.**'),
  L('cb_1', 'Comeback', 'medium', ['comeback'], 0, '**Back on the board.**'),

  // Clock (not printed on deal logs)
  L('ln_1', 'Late', 'low', ['late_night'], 0, '**Late close.**'),
  L('em_1', 'Early', 'low', ['early_morning'], 0, '**Early start.**'),

  // Week / career / team
  L('wk_1', 'Weekly', 'medium', ['weekly_milestone'], 0, '**{count} this week.**'),
  L('at_1', 'All Time', 'high', ['alltime_milestone'], 0, '**{count} all time.**'),
  L('tm_1', 'Team', 'medium', ['team_milestone'], 0, '**{team}:** {count} today.'),
  L('tm_2', 'Team', 'high', ['team_milestone_high'], 0, '**{team}:** {count} today.'),

  // Quarters (not printed on deal logs)
  L('pg_1', 'Pregame', 'low', ['pregame'], 0, '**Pregame.**'),
  L('q1_1', 'Q1', 'low', ['q1'], 0, '**Q1.**'),
  L('q2_1', 'Q2', 'medium', ['q2'], 0, '**Q2.**'),
  L('q3_1', 'Q3', 'high', ['q3'], 0, '**Q3.**'),
  L('q4_1', 'Q4', 'high', ['q4'], 0, '**Q4.**'),
  L('ot_1', 'Overtime', 'medium', ['overtime'], 0, '**After 9.**'),
]);

const DEAL_LOG_FORBIDDEN = /\{rep\}/i;

function isDealLogSafeLine(text) {
  return text && !DEAL_LOG_FORBIDDEN.test(text);
}

module.exports = {
  HYPE_LINES,
  isDealLogSafeLine,
};
