/**
 * Pulse — constants
 * Edit speeds and hype messages here without touching core logic.
 */

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
