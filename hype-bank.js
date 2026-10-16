/**
 * Pulse hype line bank: deal logs, milestones, quarters, team boards.
 *
 * Owner review 2026-10-16: rewritten to sound like a sales manager talking. No dashes, no odd
 * jargon, nothing that puts a teammate down. Deal logs only show a line on a real moment (a count
 * from 2 to 10, 15, 20, first ever, took #1, passed someone, top 3, tied, personal best,
 * comeback); routine events (fallback, momentum, quarters, late/early) are kept for other
 * surfaces but are never printed on a deal log (see ROUTINE_EVENTS in premium-confirmation.js).
 * Review this list every quarter: edit text here, keep the tags.
 */

const L = (id, category, intensity, tags, cooldownCount, text) => ({ id, category, intensity, tags, cooldownCount, text });

/** @type {readonly { id: string, category: string, intensity: string, tags: string[], cooldownCount: number, text: string }[]} */
const HYPE_LINES = Object.freeze([
  // Routine (not printed on deal logs)
  L('fb_1', 'Fallback', 'low', ['fallback'], 4, '**On the board.**'),
  L('fb_2', 'Fallback', 'low', ['fallback'], 4, '**Another one.**'),
  L('mo_1', 'Momentum', 'medium', ['momentum'], 4, '**Stacked.**'),

  // Deal count today
  L('ft_1', 'First Today', 'medium', ['first_today'], 6, '**First one in.**'),
  L('ft_2', 'First Today', 'medium', ['first_today'], 6, '**First door down.**'),
  L('ft_3', 'First Today', 'medium', ['first_today'], 6, '**Day is open.**'),
  L('ft_4', 'First Today', 'medium', ['first_today'], 6, '**Off and running.**'),
  L('s2_1', 'Second', 'low', ['second_today'], 4, '**Two today.**'),
  L('s2_2', 'Second', 'low', ['second_today'], 4, '**Back to back.**'),
  L('s2_3', 'Second', 'low', ['second_today'], 4, '**Doubled up.**'),
  L('ht_1', 'Hat Trick', 'medium', ['hat_trick'], 4, '**3 ball.**'),
  L('ht_2', 'Hat Trick', 'medium', ['hat_trick'], 4, '**Hat trick.**'),
  L('ht_3', 'Hat Trick', 'medium', ['hat_trick'], 4, '**Three on the day.**'),
  L('d4_1', 'Four Day', 'medium', ['day_4'], 2, '**Four today.**'),
  L('d4_2', 'Four Day', 'medium', ['day_4'], 2, '**Four on the day.**'),
  L('f5_1', 'Five Day', 'high', ['five_day'], 3, '**Five today.**'),
  L('f5_2', 'Five Day', 'high', ['five_day'], 3, '**Five on the board.**'),
  L('f5_3', 'Five Day', 'high', ['five_day'], 3, '**Real day now.**'),
  L('d6_1', 'Six Day', 'high', ['day_6'], 2, '**Six today.**'),
  L('d6_2', 'Six Day', 'high', ['day_6'], 2, '**Six and counting.**'),
  L('d7_1', 'Seven Day', 'high', ['day_7'], 2, '**Seven today.**'),
  L('d7_2', 'Seven Day', 'high', ['day_7'], 2, '**Seven on the day.**'),
  L('d8_1', 'Eight Day', 'high', ['day_8'], 2, '**Eight today.**'),
  L('d8_2', 'Eight Day', 'high', ['day_8'], 2, '**Eight. Big day building.**'),
  L('d9_1', 'Nine Day', 'high', ['day_9'], 2, '**Nine today. One from double digits.**'),
  L('d9_2', 'Nine Day', 'high', ['day_9'], 2, '**Nine on the day.**'),
  L('t10_1', 'Ten Day', 'high', ['ten_day'], 3, '**Double digits.**'),
  L('t10_2', 'Ten Day', 'high', ['ten_day'], 3, '**Ten on the day.**'),
  L('t10_3', 'Ten Day', 'high', ['ten_day'], 3, '**Big day.**'),
  L('d15_1', 'Fifteen Day', 'high', ['day_15'], 2, '**15 today.**'),
  L('d15_2', 'Fifteen Day', 'high', ['day_15'], 2, '**15 on the day. Monster day.**'),
  L('d20_1', 'Twenty Day', 'high', ['day_20'], 1, '**20 today. Monster day.**'),

  // First ever
  L('fe_1', 'First Ever', 'medium', ['first_ever', 'rookie_first'], 6, '**First deal. Welcome to the board.**'),
  L('fe_2', 'First Ever', 'medium', ['first_ever', 'rookie_first'], 6, '**Name on the board.**'),
  L('fe_3', 'First Ever', 'medium', ['first_ever'], 6, '**First one down. Many more.**'),

  // Leaderboard moves
  L('tf_1', 'Took First', 'high', ['took_first'], 6, '**Took #1.**'),
  L('tf_2', 'Took First', 'high', ['took_first'], 6, '**Top spot.**'),
  L('tf_3', 'Took First', 'high', ['took_first'], 6, '**New leader.**'),
  L('t3_1', 'Top 3', 'medium', ['entered_top3'], 4, '**Top 3.**'),
  L('t3_2', 'Top 3', 'medium', ['entered_top3'], 4, '**Into the top three.**'),
  L('pr_1', 'Passed', 'medium', ['passed_rep'], 4, '**Passed {otherRep}.**'),
  L('pr_2', 'Passed', 'medium', ['passed_rep'], 4, '**Moved past {otherRep}.**'),
  L('o1_1', 'One Away', 'medium', ['one_away_first'], 4, '**One back from #1.**'),
  L('o1_2', 'One Away', 'medium', ['one_away_first'], 4, '**One deal from the top.**'),
  L('cr_1', 'Close Race', 'medium', ['close_race'], 4, '**Tied for #1.**'),
  L('cr_2', 'Close Race', 'medium', ['close_race'], 4, '**Dead even at the top.**'),

  // Personal best / comeback
  L('pb_1', 'Personal Best', 'high', ['personal_best'], 6, '**New personal best.**'),
  L('pb_2', 'Personal Best', 'high', ['personal_best'], 6, '**Best day yet.**'),
  L('cb_1', 'Comeback', 'medium', ['comeback'], 6, '**Back on the board.**'),
  L('cb_2', 'Comeback', 'medium', ['comeback'], 6, '**Dry spell over.**'),

  // Clock (not printed on deal logs)
  L('ln_1', 'Late', 'low', ['late_night'], 4, '**Late close.**'),
  L('ln_2', 'Late', 'low', ['late_night'], 4, '**Closing after dark.**'),
  L('em_1', 'Early', 'low', ['early_morning'], 4, '**Early start.**'),
  L('em_2', 'Early', 'low', ['early_morning'], 4, '**First light close.**'),

  // Week / career / team
  L('wk_1', 'Weekly', 'medium', ['weekly_milestone'], 6, '**{count} this week.**'),
  L('wk_2', 'Weekly', 'medium', ['weekly_milestone'], 6, '**Week at {count}.**'),
  L('at_1', 'All Time', 'high', ['alltime_milestone'], 6, '**{count} all time.**'),
  L('at_2', 'All Time', 'high', ['alltime_milestone'], 6, '**{count} career deals.**'),
  L('tm_1', 'Team', 'medium', ['team_milestone'], 4, '**{team}:** {count} today.'),
  L('tm_2', 'Team', 'high', ['team_milestone_high'], 4, '**{team} is rolling:** {count} today.'),

  // Quarters (not printed on deal logs)
  L('pg_1', 'Pregame', 'low', ['pregame'], 4, '**Doors open soon.**'),
  L('q1_1', 'Q1', 'low', ['q1'], 4, '**Q1.** Map the block.'),
  L('q2_1', 'Q2', 'medium', ['q2'], 4, '**Q2.** Build pace.'),
  L('q2_2', 'Q2', 'medium', ['q2'], 4, '**Q2.** Stack callbacks.'),
  L('q3_1', 'Q3', 'high', ['q3'], 4, '**Q3.** Extend the lead.'),
  L('q3_2', 'Q3', 'high', ['q3'], 4, '**Q3.** Prime time.'),
  L('q4_1', 'Q4', 'high', ['q4'], 4, '**Q4.** Close the loops.'),
  L('q4_2', 'Q4', 'high', ['q4'], 4, '**Q4.** Finish strong.'),
  L('ot_1', 'Overtime', 'medium', ['overtime'], 4, '**After 9.** Still closing.'),
]);

const DEAL_LOG_FORBIDDEN = /\{rep\}/i;

function isDealLogSafeLine(text) {
  return text && !DEAL_LOG_FORBIDDEN.test(text);
}

module.exports = {
  HYPE_LINES,
  isDealLogSafeLine,
};
