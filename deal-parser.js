/**
 * Natural-language deal line parser (strict).
 * Returns internal speed keys matching constants.SPEEDS or rejects.
 */

const { SPEEDS } = require('./constants');

const MAX_COUNT_PER_TOKEN = 20;
const MAX_DEALS_PER_MESSAGE = 50;

const BARE_SPEED_NUM = new Set(['200', '300', '500', '1000', '2000']);

/** @type {Record<string, RegExp>} */
const SLICE = {
  '2gig': /^(2000\s*mbps|2000mbps|2000|2\s*gigs?|2gig|2\s*gbps|2gbps|2\s*gb|2gb|2g)$/i,
  '1gig': /^(1000\s*mbps|1000mbps|1000|1\s*gigs?|1gig|1\s*gbps|1gbps|1\s*gb|1gb|1g)$/i,
  '500mb': /^(500\s*(megs?|mbps|mbs|mb)|500mbps|500mbs|500mb|500m|500)$/i,
  '300mb': /^(300\s*(megs?|mbps|mbs|mb)|300mbps|300mbs|300mb|300m|300)$/i,
  '200mb': /^(200\s*(megs?|mbps|mbs|mb)|200mbps|200mbs|200mb|200m|200)$/i,
};

const SPEED_ORDER = ['2gig', '1gig', '500mb', '300mb', '200mb'];

function isBareSpeedToken(token) {
  return BARE_SPEED_NUM.has(String(token).toLowerCase());
}

function matchSpeedSlice(slice) {
  const s = slice.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const key of SPEED_ORDER) {
    if (SLICE[key].test(s)) return key;
  }
  return null;
}

/**
 * @param {string[]} tokens
 * @param {number} start
 * @returns {{ speed: string, consumed: number } | null}
 */
function tryMatchSpeed(tokens, start) {
  const maxK = Math.min(4, tokens.length - start);
  for (let k = maxK; k >= 1; k -= 1) {
    const slice = tokens.slice(start, start + k).join(' ');
    const speed = matchSpeedSlice(slice);
    if (speed) return { speed, consumed: k };
  }
  return null;
}

function isCountToken(token) {
  const t = String(token);
  return /^\d{1,2}x?$/i.test(t);
}

function parseCountToken(token) {
  const m = String(token).match(/^(\d{1,2})x?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > MAX_COUNT_PER_TOKEN) return null;
  if (isBareSpeedToken(token)) return null;
  return n;
}

/**
 * @param {string} chunk
 * @returns {string[] | null}
 */
function parseChunk(chunk) {
  const tokens = chunk
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const speeds = [];
  let i = 0;

  while (i < tokens.length) {
    let count = 1;

    const n = parseCountToken(tokens[i]);
    if (n != null) {
      const ahead = tryMatchSpeed(tokens, i + 1);
      if (ahead) {
        count = n;
        i += 1 + ahead.consumed;
        for (let k = 0; k < count; k += 1) speeds.push(ahead.speed);
        continue;
      }
    }

    const sp = tryMatchSpeed(tokens, i);
    if (!sp) return null;
    i += sp.consumed;
    for (let k = 0; k < count; k += 1) speeds.push(sp.speed);
  }

  return speeds;
}

/**
 * @param {string} raw
 * @returns {{ ok: true, speeds: string[] } | { ok: false, reason: string }}
 */
function parseDealMessage(raw) {
  if (raw == null || typeof raw !== 'string') {
    return { ok: false, reason: 'empty' };
  }
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { ok: false, reason: 'empty' };
  }

  const chunks = normalized
    .split(/\s*,\s*|\s+\band\b\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const all = [];
  for (const chunk of chunks) {
    const part = parseChunk(chunk);
    if (part == null) return { ok: false, reason: 'unparsed_segment' };
    all.push(...part);
  }

  if (all.length === 0) {
    return { ok: false, reason: 'no_deals' };
  }
  if (all.length > MAX_DEALS_PER_MESSAGE) {
    return { ok: false, reason: 'too_many_deals' };
  }

  for (const s of all) {
    if (!SPEEDS.includes(s)) return { ok: false, reason: 'internal_speed' };
  }

  return { ok: true, speeds: all };
}

/** Full log phrases — use /log or speed shorthand */
function detectTextLogIntent(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (/^(?:pulse\s+)?(?:log|logged|close|closed|sale|sold)\b/.test(t)) return 'log';
  if (/^(?:undo|remove[- ]?last|correction|fix)\b/.test(t)) return 'undo';
  return null;
}

/**
 * Quick channel log: any valid speed shorthand line (e.g. 1g, 2x 1g, 1g 2g 500).
 */
function isQuickNaturalLog(parsed) {
  return !!(parsed?.ok && parsed.speeds?.length);
}

module.exports = {
  parseDealMessage,
  detectTextLogIntent,
  isQuickNaturalLog,
  matchSpeedSlice,
  tryMatchSpeed,
  parseChunk,
  MAX_DEALS_PER_MESSAGE,
};
