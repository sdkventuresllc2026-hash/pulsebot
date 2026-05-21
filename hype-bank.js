/**
 * Pulse hype line bank — deal logs, milestones, quarters, team boards.
 * Tone: sharp, competitive, D2D fiber sales. No names on deal logs (header has rep).
 */

/** @type {readonly { id: string, category: string, intensity: string, tags: string[], cooldownCount: number, text: string }[]} */
const HYPE_LINES = Object.freeze([
  // —— Fallback / rhythm ——
  { id: 'fb_1', category: 'Fallback', intensity: 'low', tags: ['fallback', 'momentum'], cooldownCount: 8, text: '**On the board.**' },
  { id: 'fb_2', category: 'Fallback', intensity: 'low', tags: ['fallback'], cooldownCount: 8, text: '**Logged.** Next door.' },
  { id: 'fb_3', category: 'Fallback', intensity: 'low', tags: ['fallback'], cooldownCount: 8, text: '**Another one.**' },
  { id: 'fb_4', category: 'Fallback', intensity: 'low', tags: ['fallback'], cooldownCount: 8, text: '**Keep stacking.**' },
  { id: 'fb_5', category: 'Fallback', intensity: 'low', tags: ['fallback', 'momentum'], cooldownCount: 8, text: '**Deal in.**' },
  { id: 'fb_6', category: 'Fallback', intensity: 'low', tags: ['fallback'], cooldownCount: 8, text: '**Board updated.**' },
  { id: 'fb_7', category: 'Fallback', intensity: 'low', tags: ['fallback', 'momentum'], cooldownCount: 8, text: '**Pace.**' },
  { id: 'fb_8', category: 'Fallback', intensity: 'low', tags: ['fallback'], cooldownCount: 8, text: '**Run it back.**' },

  { id: 'mo_1', category: 'Momentum', intensity: 'medium', tags: ['momentum'], cooldownCount: 8, text: '**Stacked.**' },
  { id: 'mo_2', category: 'Momentum', intensity: 'medium', tags: ['momentum'], cooldownCount: 8, text: '**Multi-close.**' },
  { id: 'mo_3', category: 'Momentum', intensity: 'medium', tags: ['momentum'], cooldownCount: 8, text: '**Volume play.**' },

  // —— First today ——
  { id: 'ft_1', category: 'First Today', intensity: 'medium', tags: ['first_today'], cooldownCount: 10, text: '**First of the day.**' },
  { id: 'ft_2', category: 'First Today', intensity: 'medium', tags: ['first_today'], cooldownCount: 10, text: '**Day is open.**' },
  { id: 'ft_3', category: 'First Today', intensity: 'medium', tags: ['first_today'], cooldownCount: 10, text: '**First door down.**' },
  { id: 'ft_4', category: 'First Today', intensity: 'medium', tags: ['first_today'], cooldownCount: 10, text: '**Tone set.**' },
  { id: 'ft_5', category: 'First Today', intensity: 'medium', tags: ['first_today'], cooldownCount: 10, text: '**Zero to one.**' },

  // —— Second / rhythm ——
  { id: 's2_1', category: 'Second', intensity: 'low', tags: ['second_today'], cooldownCount: 10, text: '**Two today.**' },
  { id: 's2_2', category: 'Second', intensity: 'low', tags: ['second_today'], cooldownCount: 10, text: '**Back-to-back.**' },
  { id: 's2_3', category: 'Second', intensity: 'low', tags: ['second_today'], cooldownCount: 10, text: '**Rhythm started.**' },
  { id: 's2_4', category: 'Second', intensity: 'low', tags: ['second_today'], cooldownCount: 10, text: '**Second on the board.**' },

  // —— Hat trick ——
  { id: 'ht_1', category: 'Hat Trick', intensity: 'medium', tags: ['hat_trick'], cooldownCount: 12, text: '**Hat trick.**' },
  { id: 'ht_2', category: 'Hat Trick', intensity: 'medium', tags: ['hat_trick'], cooldownCount: 12, text: '**Three deep today.**' },
  { id: 'ht_3', category: 'Hat Trick', intensity: 'medium', tags: ['hat_trick'], cooldownCount: 12, text: '**Three on the day.**' },
  { id: 'ht_4', category: 'Hat Trick', intensity: 'medium', tags: ['hat_trick'], cooldownCount: 12, text: '**3-ball.**' },

  // —— Five / ten (big day) ——
  { id: 'f5_1', category: 'Five Day', intensity: 'high', tags: ['five_day'], cooldownCount: 14, text: '**Five today.**' },
  { id: 'f5_2', category: 'Five Day', intensity: 'high', tags: ['five_day'], cooldownCount: 14, text: '**Five on the board.**' },
  { id: 'f5_3', category: 'Five Day', intensity: 'high', tags: ['five_day'], cooldownCount: 14, text: '**Halfway to ten.**' },
  { id: 'f5_4', category: 'Five Day', intensity: 'high', tags: ['five_day'], cooldownCount: 14, text: '**Real pace today.**' },
  { id: 'f5_5', category: 'Five Day', intensity: 'high', tags: ['five_day'], cooldownCount: 14, text: '**Five-deep.**' },

  { id: 't10_1', category: 'Ten Day', intensity: 'high', tags: ['ten_day'], cooldownCount: 16, text: '**Double digits today.**' },
  { id: 't10_2', category: 'Ten Day', intensity: 'high', tags: ['ten_day'], cooldownCount: 16, text: '**10+ today.**' },
  { id: 't10_3', category: 'Ten Day', intensity: 'high', tags: ['ten_day'], cooldownCount: 16, text: '**Ten on the board.**' },
  { id: 't10_4', category: 'Ten Day', intensity: 'high', tags: ['ten_day'], cooldownCount: 16, text: '**Big day.**' },
  { id: 't10_5', category: 'Ten Day', intensity: 'high', tags: ['ten_day'], cooldownCount: 16, text: '**That\'s a full send.**' },

  // —— First ever / debut ——
  { id: 'fe_1', category: 'First Ever', intensity: 'medium', tags: ['first_ever', 'rookie_first'], cooldownCount: 24, text: '**First ever on the board.**' },
  { id: 'fe_2', category: 'First Ever', intensity: 'medium', tags: ['first_ever'], cooldownCount: 24, text: '**Debut log.**' },
  { id: 'fe_3', category: 'First Ever', intensity: 'medium', tags: ['first_ever', 'rookie_first'], cooldownCount: 24, text: '**First career log.**' },
  { id: 'fe_4', category: 'First Ever', intensity: 'medium', tags: ['first_ever'], cooldownCount: 24, text: '**Name on the board.**' },
  { id: 'fe_5', category: 'First Ever', intensity: 'medium', tags: ['first_ever'], cooldownCount: 24, text: '**You\'re live.**' },

  // —— Leaderboard ——
  { id: 'tf_1', category: 'Took First', intensity: 'high', tags: ['took_first'], cooldownCount: 14, text: '**Now #1.**' },
  { id: 'tf_2', category: 'Took First', intensity: 'high', tags: ['took_first'], cooldownCount: 14, text: '**Top spot.**' },
  { id: 'tf_3', category: 'Took First', intensity: 'high', tags: ['took_first'], cooldownCount: 14, text: '**Lead taken.**' },
  { id: 'tf_4', category: 'Took First', intensity: 'high', tags: ['took_first'], cooldownCount: 14, text: '**#1 — hold it.**' },
  { id: 'tf_5', category: 'Took First', intensity: 'high', tags: ['took_first'], cooldownCount: 14, text: '**Leaderboard flip.**' },

  { id: 't3_1', category: 'Top 3', intensity: 'medium', tags: ['entered_top3'], cooldownCount: 12, text: '**Top 3.**' },
  { id: 't3_2', category: 'Top 3', intensity: 'medium', tags: ['entered_top3'], cooldownCount: 12, text: '**In the top three.**' },
  { id: 't3_3', category: 'Top 3', intensity: 'medium', tags: ['entered_top3'], cooldownCount: 12, text: '**Podium range.**' },
  { id: 't3_4', category: 'Top 3', intensity: 'medium', tags: ['entered_top3'], cooldownCount: 12, text: '**Top three today.**' },

  { id: 'pr_1', category: 'Passed', intensity: 'medium', tags: ['passed_rep'], cooldownCount: 12, text: '**Passed {otherRep}.**' },
  { id: 'pr_2', category: 'Passed', intensity: 'medium', tags: ['passed_rep'], cooldownCount: 12, text: '**Moved ahead of {otherRep}.**' },
  { id: 'pr_3', category: 'Passed', intensity: 'medium', tags: ['passed_rep'], cooldownCount: 12, text: '**Stepped on {otherRep}.**' },
  { id: 'pr_4', category: 'Passed', intensity: 'medium', tags: ['passed_rep'], cooldownCount: 12, text: '**Climbed past {otherRep}.**' },

  { id: 'o1_1', category: 'One Away', intensity: 'medium', tags: ['one_away_first'], cooldownCount: 10, text: '**One back from #1.**' },
  { id: 'o1_2', category: 'One Away', intensity: 'medium', tags: ['one_away_first'], cooldownCount: 10, text: '**One deal from the top.**' },
  { id: 'o1_3', category: 'One Away', intensity: 'medium', tags: ['one_away_first'], cooldownCount: 10, text: '**Chasing #1.**' },
  { id: 'o1_4', category: 'One Away', intensity: 'medium', tags: ['one_away_first', 'close_race'], cooldownCount: 10, text: '**One swing from first.**' },

  { id: 'cr_1', category: 'Close Race', intensity: 'medium', tags: ['close_race'], cooldownCount: 10, text: '**Tied for #1.**' },
  { id: 'cr_2', category: 'Close Race', intensity: 'medium', tags: ['close_race'], cooldownCount: 10, text: '**Dead heat.**' },
  { id: 'cr_3', category: 'Close Race', intensity: 'medium', tags: ['close_race'], cooldownCount: 10, text: '**Shared lead.**' },
  { id: 'cr_4', category: 'Close Race', intensity: 'medium', tags: ['close_race'], cooldownCount: 10, text: '**Next door decides it.**' },

  // —— Personal best / comeback ——
  { id: 'pb_1', category: 'Personal Best', intensity: 'high', tags: ['personal_best'], cooldownCount: 20, text: '**New best day.**' },
  { id: 'pb_2', category: 'Personal Best', intensity: 'high', tags: ['personal_best'], cooldownCount: 20, text: '**Personal best today.**' },
  { id: 'pb_3', category: 'Personal Best', intensity: 'high', tags: ['personal_best'], cooldownCount: 20, text: '**Best day on record.**' },
  { id: 'pb_4', category: 'Personal Best', intensity: 'high', tags: ['personal_best'], cooldownCount: 20, text: '**New high for the day.**' },

  { id: 'cb_1', category: 'Comeback', intensity: 'medium', tags: ['comeback'], cooldownCount: 18, text: '**Back on the board.**' },
  { id: 'cb_2', category: 'Comeback', intensity: 'medium', tags: ['comeback'], cooldownCount: 18, text: '**Ended the dry spell.**' },
  { id: 'cb_3', category: 'Comeback', intensity: 'medium', tags: ['comeback'], cooldownCount: 18, text: '**Back in the count.**' },
  { id: 'cb_4', category: 'Comeback', intensity: 'medium', tags: ['comeback'], cooldownCount: 18, text: '**Answered.**' },

  // —— Clock ——
  { id: 'ln_1', category: 'Late', intensity: 'low', tags: ['late_night'], cooldownCount: 14, text: '**Late close.**' },
  { id: 'ln_2', category: 'Late', intensity: 'low', tags: ['late_night'], cooldownCount: 14, text: '**After-hours W.**' },
  { id: 'ln_3', category: 'Late', intensity: 'low', tags: ['late_night'], cooldownCount: 14, text: '**Night cap.**' },

  { id: 'em_1', category: 'Early', intensity: 'low', tags: ['early_morning'], cooldownCount: 14, text: '**Early start.**' },
  { id: 'em_2', category: 'Early', intensity: 'low', tags: ['early_morning'], cooldownCount: 14, text: '**First-light close.**' },
  { id: 'em_3', category: 'Early', intensity: 'low', tags: ['early_morning'], cooldownCount: 14, text: '**Out before the block wakes up.**' },

  // —— Week / career / team milestones ——
  { id: 'wk_1', category: 'Weekly', intensity: 'medium', tags: ['weekly_milestone'], cooldownCount: 16, text: '**{count} this week.**' },
  { id: 'wk_2', category: 'Weekly', intensity: 'medium', tags: ['weekly_milestone'], cooldownCount: 16, text: '**{count} on the week.**' },
  { id: 'wk_3', category: 'Weekly', intensity: 'medium', tags: ['weekly_milestone'], cooldownCount: 16, text: '**Week at {count}.**' },
  { id: 'wk_4', category: 'Weekly', intensity: 'high', tags: ['weekly_milestone'], cooldownCount: 16, text: '**Weekly milestone: {count}.**' },

  { id: 'at_1', category: 'All-Time', intensity: 'high', tags: ['alltime_milestone'], cooldownCount: 20, text: '**{count} all-time.**' },
  { id: 'at_2', category: 'All-Time', intensity: 'high', tags: ['alltime_milestone'], cooldownCount: 20, text: '**{count} career logs.**' },
  { id: 'at_3', category: 'All-Time', intensity: 'high', tags: ['alltime_milestone'], cooldownCount: 20, text: '**Career mark: {count}.**' },
  { id: 'at_4', category: 'All-Time', intensity: 'high', tags: ['alltime_milestone', 'first_ever'], cooldownCount: 20, text: '**{count} on the books.**' },

  { id: 'tm_1', category: 'Team', intensity: 'medium', tags: ['team_milestone'], cooldownCount: 12, text: '**{team}** — **{count}** today.' },
  { id: 'tm_2', category: 'Team', intensity: 'medium', tags: ['team_milestone'], cooldownCount: 12, text: '**{team}** hit **{count}**.' },
  { id: 'tm_3', category: 'Team', intensity: 'high', tags: ['team_milestone_high'], cooldownCount: 14, text: '**{team}** — **{count}** on the board.' },
  { id: 'tm_4', category: 'Team', intensity: 'high', tags: ['team_milestone_high'], cooldownCount: 14, text: '**{team}** is rolling — **{count}**.' },

  // —— Quarter flavor (deal log only when no milestone; short) ——
  { id: 'pg_1', category: 'Pregame', intensity: 'low', tags: ['pregame'], cooldownCount: 10, text: '**Pre-Q1.** Doors open soon.' },
  { id: 'pg_2', category: 'Pregame', intensity: 'low', tags: ['pregame'], cooldownCount: 10, text: '**Stay at a 7.** Pre-Q1.' },

  { id: 'q1_1', category: 'Q1', intensity: 'low', tags: ['q1'], cooldownCount: 10, text: '**Q1.** Thin the nos.' },
  { id: 'q1_2', category: 'Q1', intensity: 'low', tags: ['q1'], cooldownCount: 10, text: '**Q1.** Map the block.' },
  { id: 'q1_3', category: 'Q1', intensity: 'low', tags: ['q1'], cooldownCount: 10, text: '**Q1.** Intel pass.' },

  { id: 'q2_1', category: 'Q2', intensity: 'medium', tags: ['q2'], cooldownCount: 10, text: '**Q2.** Build pace.' },
  { id: 'q2_2', category: 'Q2', intensity: 'medium', tags: ['q2'], cooldownCount: 10, text: '**Q2.** Stack callbacks.' },
  { id: 'q2_3', category: 'Q2', intensity: 'medium', tags: ['q2'], cooldownCount: 10, text: '**Q2.** Heat is on.' },

  { id: 'q3_1', category: 'Q3', intensity: 'high', tags: ['q3'], cooldownCount: 12, text: '**Q3.** Extend the lead.' },
  { id: 'q3_2', category: 'Q3', intensity: 'high', tags: ['q3'], cooldownCount: 12, text: '**Q3.** Prime-time push.' },
  { id: 'q3_3', category: 'Q3', intensity: 'high', tags: ['q3'], cooldownCount: 12, text: '**Q3.** Full send.' },

  { id: 'q4_1', category: 'Q4', intensity: 'high', tags: ['q4'], cooldownCount: 12, text: '**Q4.** Close the loops.' },
  { id: 'q4_2', category: 'Q4', intensity: 'high', tags: ['q4'], cooldownCount: 12, text: '**Q4.** No loose ends.' },
  { id: 'q4_3', category: 'Q4', intensity: 'high', tags: ['q4'], cooldownCount: 12, text: '**Q4.** Finish the block.' },

  { id: 'ot_1', category: 'Overtime', intensity: 'medium', tags: ['overtime'], cooldownCount: 14, text: '**After 9.** Still closing.' },
  { id: 'ot_2', category: 'Overtime', intensity: 'medium', tags: ['overtime'], cooldownCount: 14, text: '**Overtime.** Commission hours.' },
]);

const DEAL_LOG_FORBIDDEN = /\{rep\}/i;

function isDealLogSafeLine(text) {
  return text && !DEAL_LOG_FORBIDDEN.test(text);
}

module.exports = {
  HYPE_LINES,
  isDealLogSafeLine,
};
