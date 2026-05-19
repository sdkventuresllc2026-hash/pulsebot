/**
 * Premium plain-text confirmations for logged deals (slash + natural).
 */

const { SPEEDS } = require('./constants');

const SPEED_DISPLAY = Object.freeze({
  '200mb': '200 Mbps',
  '300mb': '300 Mbps',
  '500mb': '500 Mbps',
  '1gig': '1 Gig',
  '2gig': '2 Gig',
});

function pick(pool) {
  if (!pool || !pool.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

/** @param {string[]} speeds */
function formatMultiSpeedLine(speeds) {
  const counts = new Map();
  for (const s of speeds) {
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const parts = [];
  for (const key of SPEEDS) {
    const n = counts.get(key);
    if (!n) continue;
    const label = SPEED_DISPLAY[key];
    parts.push(n > 1 ? `${n}× ${label}` : label);
  }
  return parts.join(' | ');
}

const BANK = Object.freeze({
  newLeader: ['🏆 New leader.', '🏆 Top spot today.', '😤 Board\'s yours. Defend it.'],
  tiedTop: ['👀 Tied at the top. Next deal wins it.', '👀 The lead doesn\'t hold itself.', '⚔️ Tied — next door breaks it.'],
  oneBehind: ['⚔️ 1 away from the top spot.', '🚪 One door away.', '👀 Chase is on.'],
  firstOfDay: ['✅ First one\'s on the board.', '✅ First door down. Day is open.', '✅ Started right. Build on it.'],
  threeToday: ['3️⃣ Third deal. Ramp is real.', '🔥 Three today. Stay on it.', '📈 Third on the board.'],
  fiveToday: ['5️⃣ Five deep. Day\'s rolling.', '5️⃣ Halfway to ten. Keep the foot down.', '🔥 Five on the board.'],
  tenToday: ['🏆 10 on the board. That\'s a day\'s work.', '🏆 Double digits. That\'s elite.', '🏆 That milestone means something. Don\'t stop.'],
  twoGig: ['💰 Premium close. Top tier.', '💰 2 Gig in the books. Big one.', '🚀 2 Gig logs different.', '🚀 Big swing.'],
  multiLog: ['📈 Board is moving.', '📌 Stack it and move.', '⚡ Fast session.', '🎯 Clean log.'],
  todayTail: ['Keep stacking.', 'Next door.', 'Onto the next.', 'The board doesn\'t lie.', 'Production talks.'],
  production: ['📈 Production talks. Everything else walks.', '🩸 The board doesn\'t lie.', '📌 Logged. Onto the next.', '💰 That one counts.', '🧱 Brick by brick.'],
  doors: ['🚪 More doors. More deals.', '🚪 The door is the job. Everything else is a result.', '📊 Volume is the cheat code.', '🔁 Stay on the doors. The deals find you.'],
  competitive: ['⚔️ Someone else is knocking right now.', '⚔️ Don\'t let them catch you.', '😤 Pressure is on.', '👊 You want it — go get it.'],
  ramp: ['📈 This is the ramp. Ride it.', '🔥 Ramp is building. Don\'t stop now.', '⚡ Hot rep. Next door.', '🔥 Don\'t tap the brakes during a run.'],
  defaultMix: [
    '⚙️ Execution over emotion.',
    '🎯 Control the controllables. You\'re locked in.',
    '📊 Inputs are working.',
    '🔁 Outputs follow inputs. Keep moving.',
    '🕰️ Still time left.',
    '⏰ Day\'s still open. Add to it.',
  ],
  phase4B: {
    repDaily: {
      first: ['✅ {rep} opened the board. Day is live.'],
      3: ['🔥 {rep} hit 3 today. Day is alive.'],
      5: ['📈 {rep} hit 5 today. Real production.'],
      8: ['😤 {rep} hit 8 today. Big day brewing.'],
      10: ['🏆 {rep} hit 10 today. Double digits.'],
      15: ['🚀 {rep} hit 15 today. Monster day.'],
      20: ['🩸 {rep} hit 20 today. Golden Door pace.'],
    },
    lateClock: ['🕰️ {rep} still working. Late clock deal.'],
    blitzDaily: {
      10: ['🔥 {blitz} hit 10 today.'],
      25: ['🔥 {blitz} hit 25 today.'],
      50: ['📈 {blitz} crossed 50 today.'],
      75: ['😤 {blitz} at 75 today.'],
      100: ['🏆 {blitz} hit 100 today. Big day.'],
    },
    lead: {
      newLeader: ['🏆 New daily leader: {rep} with {count}.'],
      oneAway: ['⚔️ {rep} is 1 away from the lead.'],
      tied: ['🤝 {rep} tied for the lead at {count}.'],
    },
  },
});

function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function buildPhase4HypeLine(kind, values = {}) {
  let pool = null;
  if (kind === 'repDaily') pool = BANK.phase4B.repDaily[values.count];
  if (kind === 'lateClock') pool = BANK.phase4B.lateClock;
  if (kind === 'blitzDaily') pool = BANK.phase4B.blitzDaily[values.count];
  if (kind === 'newLeader') pool = BANK.phase4B.lead.newLeader;
  if (kind === 'oneAway') pool = BANK.phase4B.lead.oneAway;
  if (kind === 'tied') pool = BANK.phase4B.lead.tied;

  const template = pick(pool);
  return template ? fillTemplate(template, values) : '';
}

/**
 * @param {{
 *   speeds: string[],
 *   userId: string,
 *   dealsTodayAfter: number,
 *   dealsTodayBefore: number,
 *   rankTodayAfter: number | null,
 *   rankTodayBefore: number | null,
 *   rowsTodayAfter: { userId: string, total: number }[],
 * }} ctx
 */
function selectClosingLine(ctx) {
  const {
    speeds,
    userId,
    dealsTodayAfter,
    dealsTodayBefore,
    rankTodayAfter,
    rankTodayBefore,
    rowsTodayAfter,
  } = ctx;

  const userRow = rowsTodayAfter.find((r) => r.userId === userId);
  const userTotal = userRow?.total ?? 0;
  const topTotal = rowsTodayAfter[0]?.total ?? 0;
  const leaders = rowsTodayAfter.filter((r) => r.total === topTotal && topTotal > 0);
  const tiedAtTop = leaders.length >= 2 && leaders.some((r) => r.userId === userId);

  const newSoleLeader =
    rankTodayAfter === 1 &&
    rowsTodayAfter[0]?.userId === userId &&
    rankTodayBefore != null &&
    rankTodayBefore > 1 &&
    !tiedAtTop;

  const oneBehind =
    topTotal > 0 &&
    userTotal === topTotal - 1 &&
    rankTodayAfter != null &&
    rankTodayAfter > 1 &&
    !tiedAtTop;

  if (tiedAtTop) return pick(BANK.tiedTop);
  if (newSoleLeader) return pick(BANK.newLeader);
  if (oneBehind) return pick(BANK.oneBehind);

  if (dealsTodayBefore === 0 && dealsTodayAfter > 0) return pick(BANK.firstOfDay);
  if (dealsTodayAfter === 10) return pick(BANK.tenToday);
  if (dealsTodayAfter === 5) return pick(BANK.fiveToday);
  if (dealsTodayAfter === 3) return pick(BANK.threeToday);
  if (speeds.includes('2gig')) return pick(BANK.twoGig);
  if (speeds.length > 1) return pick(BANK.multiLog);

  const roll = Math.random();
  if (roll < 0.28) {
    return `🔥 **${dealsTodayAfter}** today. ${pick(BANK.todayTail)}`.trim();
  }
  if (roll < 0.45) return pick(BANK.production);
  if (roll < 0.62) return pick(BANK.doors);
  if (roll < 0.78) return pick(BANK.competitive);
  if (roll < 0.9) return pick(BANK.ramp);
  return pick(BANK.defaultMix);
}

/**
 * @param {{
 *   displayName: string,
 *   blitzName: string,
 *   speeds: string[],
 *   userId: string,
 *   dealsTodayAfter: number,
 *   dealsTodayBefore: number,
 *   rankTodayAfter: number | null,
 *   rankTodayBefore: number | null,
 *   rowsTodayAfter: { userId: string, total: number }[],
 *   hasCustomerOnFile?: boolean,
 * }} ctx
 */
function buildPremiumDealConfirmation(ctx) {
  const { displayName, blitzName, speeds } = ctx;
  const blitzLine = `${blitzName} + Master updated`;

  let bodyLine;
  if (speeds.length === 1) {
    bodyLine = `**${displayName}** — ${SPEED_DISPLAY[speeds[0]] || speeds[0]}`;
  } else {
    bodyLine = `**${displayName}** — ${speeds.length} deals\n${formatMultiSpeedLine(speeds)}`;
  }

  const footer = selectClosingLine(ctx);
  const parts = ['Logged ✅', bodyLine, blitzLine, '', footer];
  if (ctx.hasCustomerOnFile) {
    parts.push('', '_Customer on file._');
  }
  return parts.join('\n');
}

module.exports = {
  buildPremiumDealConfirmation,
  buildPhase4HypeLine,
  selectClosingLine,
  formatMultiSpeedLine,
  SPEED_DISPLAY,
};
