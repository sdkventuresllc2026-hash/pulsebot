/**
 * Door-to-door sales day quarters + culture lines (local TZ hours).
 * Q1 12–3 · Q2 3–5 · Q3 5–8 · Q4 8–9
 */

const { SALES_QUARTER_HOURS: H } = require('./constants');
const { compactJoin } = require('./message-format');

const QUARTER_META = Object.freeze({
  pregame: { label: 'Pre-Q1', tagline: 'Stay at a **7** · doors open soon' },
  q1: { label: 'Q1', tagline: 'Gather info · get the nos out of the way' },
  q2: { label: 'Q2', tagline: 'Build momentum' },
  q3: { label: 'Q3', tagline: '**EXTEND THE LEAD**' },
  q4: { label: 'Q4', tagline: '**LEAVE NO DEAL STANDING**' },
  overtime: { label: 'After 9', tagline: 'Finish what you opened · **#nextdoor**' },
});

/** @type {{ id: string, quarter: string, cooldownCount: number, text: string }[]} */
const QUARTER_LINES = Object.freeze([
  // Q1 — gather info, nos out of the way
  { id: 'q1_a', quarter: 'q1', cooldownCount: 6, text: '**Q1** — gather info. Every **no** clears the board.' },
  { id: 'q1_b', quarter: 'q1', cooldownCount: 6, text: '**Q1.** Get the **nos** out of the way now.' },
  { id: 'q1_c', quarter: 'q1', cooldownCount: 6, text: '**Q1.** Intel pass — learn the block, not the scoreboard.' },
  { id: 'q1_d', quarter: 'q1', cooldownCount: 6, text: '**Q1.** Thin the nos. **#nextdoor** when the block is mapped.' },
  { id: 'q1_e', quarter: 'q1', cooldownCount: 6, text: '**Q1.** Volume of conversations wins.' },
  { id: 'q1_f', quarter: 'q1', cooldownCount: 6, text: '**Q1.** Collect nos like data.' },

  // Q2 — build momentum
  { id: 'q2_a', quarter: 'q2', cooldownCount: 6, text: '**Q2** — build momentum. Stack callbacks.' },
  { id: 'q2_b', quarter: 'q2', cooldownCount: 6, text: '**Q2.** Heat is building — set the **5–8** push.' },
  { id: 'q2_c', quarter: 'q2', cooldownCount: 6, text: '**Q2.** Stay at a **7**. Pace wins this block.' },
  { id: 'q2_d', quarter: 'q2', cooldownCount: 6, text: '**Q2.** Inputs > outputs. **#nextdoor**.' },
  { id: 'q2_e', quarter: 'q2', cooldownCount: 6, text: '**Q2.** Turn intel into appointments.' },
  { id: 'q2_f', quarter: 'q2', cooldownCount: 6, text: '**Q2.** Mid-day — separate on the board.' },

  // Q3 — extend the lead
  { id: 'q3_a', quarter: 'q3', cooldownCount: 8, text: '**Q3 — EXTEND THE LEAD.** This is the push.' },
  { id: 'q3_b', quarter: 'q3', cooldownCount: 8, text: '**Q3.** Separate yourself on the board. **Full send.**' },
  { id: 'q3_c', quarter: 'q3', cooldownCount: 8, text: '**Q3.** Prime time — **extend the lead**.' },
  { id: 'q3_d', quarter: 'q3', cooldownCount: 8, text: '**Q3.** Control the controllables. **#nextdoor**.' },
  { id: 'q3_e', quarter: 'q3', cooldownCount: 8, text: '**Q3.** Act like the leader on the board.' },
  { id: 'q3_f', quarter: 'q3', cooldownCount: 8, text: '**Q3.** Homes are lit — close in bunches.' },

  // Q4 — leave no deal standing
  { id: 'q4_a', quarter: 'q4', cooldownCount: 6, text: '**Q4 — LEAVE NO DEAL STANDING.**' },
  { id: 'q4_b', quarter: 'q4', cooldownCount: 6, text: '**Q4.** Final callbacks. Close every loop.' },
  { id: 'q4_c', quarter: 'q4', cooldownCount: 6, text: '**Q4.** Knock the lights on. **No loose ends.**' },
  { id: 'q4_d', quarter: 'q4', cooldownCount: 6, text: '**Q4.** Finish the block — **#nextdoor**.' },
  { id: 'q4_e', quarter: 'q4', cooldownCount: 6, text: '**Q4.** Empty the pipeline before dark.' },
  { id: 'q4_f', quarter: 'q4', cooldownCount: 6, text: '**Q4.** Last light — cash the callbacks.' },

  // Overtime (after 9)
  { id: 'ot_a', quarter: 'overtime', cooldownCount: 10, text: '**After 9.** Leave **no deal standing**.' },
  { id: 'ot_b', quarter: 'overtime', cooldownCount: 10, text: 'Late clock — **100% commission.** Still **#nextdoor**.' },
  { id: 'ot_c', quarter: 'overtime', cooldownCount: 10, text: '**After 9.** Finish what you opened.' },
  { id: 'ot_d', quarter: 'overtime', cooldownCount: 10, text: '**Overtime.** The board doesn\'t clock out.' },

  // Pregame (before noon)
  { id: 'pg_a', quarter: 'pregame', cooldownCount: 8, text: '**Pre-Q1.** Stay at a **7** — control what you can.' },
  { id: 'pg_b', quarter: 'pregame', cooldownCount: 8, text: '**Pre-Q1.** Remember your **why**. Q1 at noon.' },
  { id: 'pg_c', quarter: 'pregame', cooldownCount: 8, text: '**Pre-Q1.** Plan the block. Execute at noon.' },
  { id: 'pg_d', quarter: 'pregame', cooldownCount: 8, text: '**Pre-Q1.** Warm up the mind. Doors at **12**.' },
]);

/** General culture — #nextdoor · stay at a 7 · commission mindset */
const CULTURE_LINES = Object.freeze([
  { id: 'cul_nd1', cooldownCount: 8, text: '**#nextdoor**' },
  { id: 'cul_nd2', cooldownCount: 8, text: 'Stay at a **7**. **#nextdoor**.' },
  { id: 'cul_nd3', cooldownCount: 8, text: 'Process beats mood. **#nextdoor**.' },
  { id: 'cul_nd4', cooldownCount: 8, text: '**#nextdoor** — the only move that counts.' },
  { id: 'cul_s7_1', cooldownCount: 10, text: 'Stay at a **7** — not a 4, not a 10.' },
  { id: 'cul_s7_2', cooldownCount: 10, text: '**Stay at a 7.** Calm hands, fast feet.' },
  { id: 'cul_s7_3', cooldownCount: 10, text: '**7 out of 10** intensity — all day.' },
  { id: 'cul_1', cooldownCount: 10, text: '**100% commission.** Your effort is the variable.' },
  { id: 'cul_2', cooldownCount: 10, text: '**Inputs > outputs.** Doors first.' },
  { id: 'cul_3', cooldownCount: 10, text: '**Control the controllables.** Pace and **#nextdoor**.' },
  { id: 'cul_4', cooldownCount: 10, text: '**Remember your why.** Then knock.' },
  { id: 'cul_5', cooldownCount: 10, text: '**You\'re due.** Show up like it.' },
  { id: 'cul_6', cooldownCount: 10, text: 'Nobody\'s saving your week. **You are.**' },
  { id: 'cul_7', cooldownCount: 10, text: '**Earn the board.**' },
  { id: 'cul_8', cooldownCount: 10, text: '**Pressure is a privilege.**' },
  { id: 'cul_9', cooldownCount: 10, text: '**Run your block.** Not your mood.' },
  { id: 'cul_10', cooldownCount: 10, text: '**Scoreboard follows doors.**' },
]);

function pick(pool) {
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function allowedByCooldown(line, recentIds) {
  if (!line?.cooldownCount) return true;
  const window = recentIds.slice(-line.cooldownCount);
  return !window.includes(line.id);
}

/**
 * @param {number} hour 0–23 local
 * @returns {'pregame'|'q1'|'q2'|'q3'|'q4'|'overtime'}
 */
function getSalesQuarter(hour) {
  if (hour < H.dayStart) return 'pregame';
  if (hour < H.q1End) return 'q1';
  if (hour < H.q2End) return 'q2';
  if (hour < H.q3End) return 'q3';
  if (hour < H.q4End) return 'q4';
  return 'overtime';
}

function getQuarterMeta(quarter) {
  return QUARTER_META[quarter] || QUARTER_META.q1;
}

function lineRepeatsTagline(text, meta) {
  const t = String(text || '').toLowerCase().replace(/\*\*/g, '');
  const label = meta.label.toLowerCase();
  if (label.length > 2 && t.includes(label)) return true;
  const tag = meta.tagline.toLowerCase().replace(/\*\*/g, '');
  const keys = ['stay at a 7', 'doors open', 'gather info', 'nos out', 'build momentum', 'extend the lead', 'leave no deal', 'nextdoor'];
  let hits = 0;
  for (const k of keys) {
    if (tag.includes(k) && t.includes(k)) hits += 1;
  }
  return hits >= 1;
}

function selectQuarterLine(quarter, recentLineIds = [], { avoidTaglineDupes = false } = {}) {
  const meta = getQuarterMeta(quarter);
  let pool = QUARTER_LINES.filter((l) => l.quarter === quarter);
  if (avoidTaglineDupes) {
    const filtered = pool.filter((l) => !lineRepeatsTagline(l.text, meta));
    if (filtered.length) pool = filtered;
  }
  const available = pool.filter((l) => allowedByCooldown(l, recentLineIds));
  const picked = pick(available.length ? available : pool);
  if (!picked) return null;
  return { id: picked.id, event: quarter, text: picked.text };
}

function selectCultureLine(recentLineIds = []) {
  const available = CULTURE_LINES.filter((l) => allowedByCooldown(l, recentLineIds));
  const picked = pick(available.length ? available : CULTURE_LINES);
  if (!picked) return null;
  return { id: picked.id, event: 'culture', text: picked.text };
}

/** Header line for leaderboards: quarter + tagline */
function formatQuarterHeader(hour) {
  const quarter = getSalesQuarter(hour);
  const meta = getQuarterMeta(quarter);
  return `_${meta.label} — ${meta.tagline}_`;
}

/** Full /quarter command — title + one tip (no stacked culture lines) */
function formatQuarterStatus(hour) {
  const quarter = getSalesQuarter(hour);
  const meta = getQuarterMeta(quarter);
  const line = selectQuarterLine(quarter, [], { avoidTaglineDupes: true });
  const parts = [`**${meta.label}** — ${meta.tagline}`];
  if (line?.text) parts.push(line.text);
  return compactJoin(parts);
}

/** Pick quarter hype for deal log (before generic fallback) */
function selectQuarterHypeForDeal(hour, recentLineIds = []) {
  const quarter = getSalesQuarter(hour);
  return selectQuarterLine(quarter, recentLineIds, { avoidTaglineDupes: true });
}

module.exports = {
  QUARTER_META,
  QUARTER_LINES,
  CULTURE_LINES,
  getSalesQuarter,
  getQuarterMeta,
  selectQuarterLine,
  selectCultureLine,
  selectQuarterHypeForDeal,
  formatQuarterHeader,
  formatQuarterStatus,
};
