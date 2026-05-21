const { listMarkets, ensureDefaultMarkets } = require('./deal-channels');

function buildMarketAutocompleteChoices(query = '') {
  ensureDefaultMarkets('autocomplete');
  const q = String(query || '')
    .trim()
    .toLowerCase();
  return listMarkets()
    .filter((m) => {
      if (!q) return true;
      const id = String(m.marketId || '').toLowerCase();
      const name = String(m.marketName || '').toLowerCase();
      return id.includes(q) || name.includes(q) || q.includes(id) || q.includes(name);
    })
    .slice(0, 25)
    .map((m) => ({
      name: `${m.marketName} (${m.marketId})`.slice(0, 100),
      value: m.marketId,
    }));
}

module.exports = { buildMarketAutocompleteChoices };
