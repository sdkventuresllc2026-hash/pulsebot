const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { APPROVED_CHANNELS_PATH, ensureDefaultMarkets } = require('./deal-channels');
const { buildMarketAutocompleteChoices } = require('./market-autocomplete');

function withEmptyMarkets(fn) {
  const existed = fs.existsSync(APPROVED_CHANNELS_PATH);
  const original = existed ? fs.readFileSync(APPROVED_CHANNELS_PATH, 'utf8') : null;
  fs.writeFileSync(
    APPROVED_CHANNELS_PATH,
    JSON.stringify({ channels: [], disabledChannelIds: [], markets: [] }, null, 2),
    'utf8',
  );
  try {
    return fn();
  } finally {
    if (existed) fs.writeFileSync(APPROVED_CHANNELS_PATH, original, 'utf8');
    else fs.unlinkSync(APPROVED_CHANNELS_PATH);
  }
}

test('buildMarketAutocompleteChoices filters by query', () =>
  withEmptyMarkets(() => {
    ensureDefaultMarkets('test');
    const all = buildMarketAutocompleteChoices('');
    assert.ok(all.length >= 2);
    const va = buildMarketAutocompleteChoices('vir');
    assert.equal(va.length, 1);
    assert.equal(va[0].value, 'virginia');
  }));
