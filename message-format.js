/**
 * Consistent Discord message assembly — no triple newlines or empty lines.
 */

function compactJoin(parts) {
  return parts
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

/** @param {string} text */
function countNewlines(text) {
  return (text.match(/\n/g) || []).length;
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 */
function countPattern(text, pattern) {
  return (text.match(pattern) || []).length;
}

/**
 * Test helper: output hygiene checks.
 * @param {string} text
 * @param {{ maxLines?: number, forbidDuplicateLabel?: string }} [opts]
 */
function assertCleanOutput(text, opts = {}) {
  const t = String(text || '').trim();
  if (!t) throw new Error('empty output');
  if (/\n{3,}/.test(t)) throw new Error('triple+ newline in output');
  if (/^\s*\n/m.test(t) || /\n\s*$/m.test(t)) throw new Error('leading/trailing whitespace on line');
  if (opts.forbidDuplicateLabel) {
    const label = opts.forbidDuplicateLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(label, 'gi');
    if (countPattern(t, re) > 1) throw new Error(`duplicate label: ${opts.forbidDuplicateLabel}`);
  }
  if (opts.maxLines && countNewlines(t) + 1 > opts.maxLines) {
    throw new Error(`too many lines: ${countNewlines(t) + 1} > ${opts.maxLines}`);
  }
  return t;
}

module.exports = {
  compactJoin,
  assertCleanOutput,
  countPattern,
};
