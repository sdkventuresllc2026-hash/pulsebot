// Owner 2026-11-24: the Michigan card's archive moved #jacksonville-nc under ARCHIVE while the Jacksonville NC card was
// live (the chat was still listed under the old market). A chat is never archived while a live card still uses it.
const { normalizeMarketId } = require('./deal-channels');

/** The live card name that still owns this chat, or null when it is safe to archive.
 *  Live = the chat's own name matches an active card, or any OTHER market listing this chat is named like an active card.
 *  activeCards null/undefined (older OS) = no guard information, returns null (old behaviour). */
function liveCardForChat({ channelName, channelId, archivingMarketId, markets, activeCards }) {
  if (!Array.isArray(activeCards)) return null;
  const live = new Map(activeCards.map((n) => [normalizeMarketId(n), n]));
  const own = live.get(normalizeMarketId(channelName));
  if (own) return own;
  for (const m of markets || []) {
    if (m.marketId === archivingMarketId || !(m.channelIds || []).includes(channelId)) continue;
    const hit = live.get(normalizeMarketId(m.marketName)) || live.get(normalizeMarketId(m.marketId));
    if (hit) return hit;
  }
  return null;
}

module.exports = { liveCardForChat };
