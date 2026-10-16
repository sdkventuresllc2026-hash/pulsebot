/**
 * Door to door sales day quarters + culture lines (local TZ hours).
 * Q1 12 to 3 · Q2 3 to 5 · Q3 5 to 8 · Q4 8 to 9
 */

const { SALES_QUARTER_HOURS: H } = require('./constants');
const { compactJoin } = require('./message-format');

// Owner 2026-10-16: plain and simple. No dashes, no all caps, nothing cheesy.
const QUARTER_META = Object.freeze({
  pregame: { label: 'Pregame', tagline: 'Doors open at noon' },
  q1: { label: 'Q1', tagline: 'Get the nos out of the way' },
  q2: { label: 'Q2', tagline: 'Build momentum' },
  q3: { label: 'Q3', tagline: 'Extend the lead' },
  q4: { label: 'Q4', tagline: 'Leave no deal standing' },
  overtime: { label: 'After 9', tagline: 'Finish what you opened' },
});

/** One tip per quarter for /quarter. @type {{ id: string, quarter: string, cooldownCount: number, text: string }[]} */
const QUARTER_LINES = Object.freeze([
  { id: 'pg_a', quarter: 'pregame', cooldownCount: 2, text: 'Plan your block. Doors at noon.' },
  { id: 'pg_b', quarter: 'pregame', cooldownCount: 2, text: 'Stay at a **7**.' },
  { id: 'q1_a', quarter: 'q1', cooldownCount: 2, text: 'Talk to everyone. Every no gets you closer.' },
  { id: 'q1_b', quarter: 'q1', cooldownCount: 2, text: 'Learn the block. Note your callbacks.' },
  { id: 'q2_a', quarter: 'q2', cooldownCount: 2, text: 'Stack callbacks for tonight.' },
  { id: 'q2_b', quarter: 'q2', cooldownCount: 2, text: 'Stay at a **7**. **#nextdoor**' },
  { id: 'q3_a', quarter: 'q3', cooldownCount: 2, text: 'People are home. This is the push.' },
  { id: 'q3_b', quarter: 'q3', cooldownCount: 2, text: 'Hit your callbacks first.' },
  { id: 'q4_a', quarter: 'q4', cooldownCount: 2, text: 'Close every open loop.' },
  { id: 'q4_b', quarter: 'q4', cooldownCount: 2, text: 'Last callbacks. **#nextdoor**' },
  { id: 'ot_a', quarter: 'overtime', cooldownCount: 2, text: 'Wrap up your open deals.' },
]);

/** The team's own sayings. */
const CULTURE_LINES = Object.freeze([
  { id: 'cul_nd1', cooldownCount: 2, text: '**#nextdoor**' },
  { id: 'cul_s7_1', cooldownCount: 2, text: 'Stay at a **7**.' },
  { id: 'cul_1', cooldownCount: 2, text: '**100% commission.** Your effort decides it.' },
  { id: 'cul_3', cooldownCount: 2, text: '**Control the controllables.**' },
  { id: 'cul_4', cooldownCount: 2, text: '**Remember your why.**' },
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
  const keys = ['doors', 'nos out', 'build momentum', 'extend the lead', 'leave no deal', 'finish what'];
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

/** Leaderboard line under the title, in a quote bar: "> **Q3** · Extend the lead" */
function formatQuarterHeader(hour) {
  const quarter = getSalesQuarter(hour);
  const meta = getQuarterMeta(quarter);
  return `> **${meta.label}** · ${meta.tagline}`;
}

/** Full /quarter command — title + one tip (no stacked culture lines) */
function formatQuarterStatus(hour) {
  const quarter = getSalesQuarter(hour);
  const meta = getQuarterMeta(quarter);
  const line = selectQuarterLine(quarter, [], { avoidTaglineDupes: true });
  const parts = [`**${meta.label}** · ${meta.tagline}`];
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
