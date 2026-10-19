/**
 * Small readers for what reps actually post around a T-Fiber deal (owner 2026-10-19):
 *  - the plan speed printed on the order screenshot ("Fiber 1 Gig") → a speed key,
 *  - a speed mentioned inside a sentence ("upgraded him to 2gig") → a speed key,
 *  - a typed install time ("8-10 am on the 21st", "12-3 on the 21st",
 *    "Wednesday October 21st 8:00am - 10:00am") → { date: 'YYYY-MM-DD', window: '8 - 10 a.m.' }.
 * Pure and unit-tested; the bot decides when to use them.
 */

/** Plan text from the screenshot → the bot's speed key, or null when it can't tell. */
function speedFromPlan(plan) {
  const t = String(plan || '').toLowerCase().replace(/\s+/g, ' ');
  if (/\b2\s?(gig|gb|g)\b|2,?000\s?mb/.test(t)) return '2gig';
  if (/\b1\s?(gig|gb|g)\b|1,?000\s?mb/.test(t)) return '1gig';
  if (/\b500\s?(mbps|mb|m)\b/.test(t)) return '500mb';
  if (/\b300\s?(mbps|mb|m)\b/.test(t)) return '300mb';
  return null;
}

/** First new-plan speed named in free text ("upgraded him to 2gig fiber"); the speed after "to" wins. */
function speedInText(text) {
  const t = String(text || '').toLowerCase();
  const after = t.match(/\bto\s+(?:the\s+)?(\d[\d,]*\s?(?:gig|gb|g|mbps|mb)\b)/);
  return speedFromPlan(after ? after[1] : t);
}

const isUpgrade = (text) => /\bupgrad/i.test(String(text || ''));

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Today's calendar date in a time zone, as { y, m (1-12), d, dow (0 Sun) }. */
function partsIn(now, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), dow: DAYS.indexOf(String(p.weekday).toLowerCase().slice(0, 3)) };
}
const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
};
const addDays = (y, m, d, n) => { const dt = new Date(Date.UTC(y, m - 1, d + n)); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };

function parseDate(t, today) {
  let mm;
  if ((mm = t.match(/\b(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])\b/))) {
    const m = Number(mm[1]), d = Number(mm[2]);
    return iso(m < today.m - 6 ? today.y + 1 : today.y, m, d);
  }
  if ((mm = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(3[01]|[12]\d|0?[1-9])(?:st|nd|rd|th)?\b/))) {
    const m = MONTHS.indexOf(mm[1].slice(0, 3)) + 1, d = Number(mm[2]);
    return iso(m < today.m - 6 ? today.y + 1 : today.y, m, d);
  }
  if ((mm = t.match(/\b(3[01]|[12]\d|0?[1-9])(?:st|nd|rd|th)\b/))) {
    const d = Number(mm[1]);
    return d >= today.d ? iso(today.y, today.m, d) : iso(today.m === 12 ? today.y + 1 : today.y, today.m === 12 ? 1 : today.m + 1, d);
  }
  if (/\btomorrow\b/.test(t)) return addDays(today.y, today.m, today.d, 1);
  if (/\btoday\b/.test(t)) return iso(today.y, today.m, today.d);
  if ((mm = t.match(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?\b/))) {
    const dow = DAYS.indexOf(mm[1].slice(0, 3));
    const ahead = ((dow - today.dow + 7) % 7) || 7; // installs are never same day: the next one
    return addDays(today.y, today.m, today.d, ahead);
  }
  return null;
}

/** "8-10 am" / "12-3" / "8:00am - 10:00am" → T-Mobile's own style: "8 - 10 a.m.", "12 - 3 p.m.", "10 a.m. - 12 p.m.". */
function parseWindow(t) {
  const mm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d/])/);
  if (!mm) return null;
  const [sh, eh] = [Number(mm[1]), Number(mm[4])];
  if (sh < 1 || sh > 12 || eh < 1 || eh > 12) return null;
  const mer = (x) => (x ? (x[0] === 'a' ? 'a.m.' : 'p.m.') : null);
  // ponytail: no meridiem = install hours (7 to 11 morning, 12 and 1 to 7 afternoon/evening).
  const guess = (h) => (h >= 7 && h <= 11 ? 'a.m.' : 'p.m.');
  const em = mer(mm[6]) || (mer(mm[3]) && eh > sh && eh !== 12 ? mer(mm[3]) : guess(eh));
  const smRaw = mer(mm[3]) || (mm[6] && sh < eh && eh !== 12 ? em : guess(sh));
  const sm = sh === 12 ? 'p.m.' : smRaw;
  const fmt = (h, m) => (m && m !== '00' ? `${h}:${m}` : `${h}`);
  return sm === em ? `${fmt(sh, mm[2])} - ${fmt(eh, mm[5])} ${em}` : `${fmt(sh, mm[2])} ${sm} - ${fmt(eh, mm[5])} ${em}`;
}

function parseInstallTime(text, now = new Date(), tz = 'America/New_York') {
  const t = String(text || '').toLowerCase();
  const today = partsIn(now, tz);
  const date = parseDate(t, today);
  const window = parseWindow(t);
  if (!date && !window) return null;
  return { date, window };
}

module.exports = { speedFromPlan, speedInText, isUpgrade, parseInstallTime };
