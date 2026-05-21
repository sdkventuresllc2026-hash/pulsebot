/**
 * Pulse — constants
 * Edit speeds and hype messages here without touching core logic.
 */

/** Bump when deploying — if Discord logs don't match, an old bot is still running. */
exports.PULSE_BUILD = '2026-05-21-v1.1';

/** Fixed speed choices (values must match slash-command choices). */
exports.SPEEDS = Object.freeze(['200mb', '300mb', '500mb', '1gig', '2gig']);

/** Human labels for embeds (keys = stored values). */
exports.SPEED_LABELS = Object.freeze({
  '200mb': '200MB',
  '300mb': '300MB',
  '500mb': '500MB',
  '1gig': '1GIG',
  '2gig': '2GIG',
});

exports.COLORS = Object.freeze({
  primary: 0x5865f2,
  success: 0x57f287,
  gold: 0xfee75c,
  danger: 0xed4245,
});

exports.GAMIFICATION_CONFIG = Object.freeze({
  dailyRepMilestones: [1, 2, 3, 5, 10],
  weeklyRepMilestones: [10, 25, 50],
  allTimeRepMilestones: [1, 10, 25, 50, 100],
  teamDailyMilestones: [10, 25, 50, 100],
  teamWeeklyMilestones: [25, 50, 100, 200],
  quietHoursForComeback: 3,
  earlyHourCutoff: 9,
  lateHourCutoff: 19,
});

/** Door-to-door day quarters (local hour, 24h). See day-quarters.js */
exports.SALES_QUARTER_HOURS = Object.freeze({
  dayStart: 12,
  q1End: 15,
  q2End: 17,
  q3End: 20,
  q4End: 21,
});

/** Shown when reps need slash for full log / fixes */
exports.SLASH_HINTS = Object.freeze({
  log:
    'Quick log: type **`1g`**, **`1gig`**, **`500`**, or **`2x 1g`**. Full log + customer info → **`/log`**',
  undo: 'Use **`/remove-last`** or **`/correction`**',
  needSlashLog:
    'Mixed speeds in one message → use **`/log`** (pick speed). Quick single-speed: type **`1g`** or **`500`**.',
});

/**
 * Hype pools — competitive sales tone, not corny.
 * index.js calls pickRandom() from storage.js on these arrays.
 */
exports.HYPE = Object.freeze({
  genericAfterLog: [
    'That’s another one. Keep stacking.',
    'Momentum is real. Next door.',
    'Board doesn’t lie. Stay on it.',
    'Quietly violent numbers. Keep going.',
    'Stacking season. Don’t blink.',
  ],
  speedTag: {
    '200mb': ['Basement deal still counts. Logged.', '200MB in. Volume play.'],
    '300mb': ['300MB closed. Feet don’t fail now.', '300MB. Consistency wins.'],
    '500mb': ['500MB. Bread-and-butter money.', 'Half gig in the books.'],
    '1gig': ['1GIG logged. That’s real fiber.', '1GIG. Stop playing with him.'],
    '2gig': ['Big boy deal. 2GIG closed.', '2GIG. That’s a statement close.'],
  },
  firstOfDay: [
    'First blood today. Now make it a pattern.',
    'Day is officially open. Set the tone early.',
  ],
  threeToday: ['Three today. You’re in rhythm.', 'Three-piece. Kitchen’s hot.'],
  fiveToday: ['Five today. That’s a day people remember.', 'Five on the board. Don’t apologize for the work.'],
  tenWeek: ['Double digits this week. That’s a producer week.', '10+ this week. You’re not here for participation.'],
  personalBestDay: ['New personal best day. Raise the ceiling.', 'PB day. The old you just got retired.'],
  numberOneToday: ['🚨 New leader on the board.', 'Top spot today. Defend it like rent is due.'],
  passedRep: (name) => [
    `You just passed ${name}. Don’t let him breathe.`,
    `Moved ahead of ${name}. Keep stepping.`,
  ],
  teamMilestone: (team, n) => [
    `${team} just crossed ${n} deals this week. Pressure’s contagious.`,
    `${team}: ${n} weekly deals. That’s a squad trending up.`,
  ],
});
