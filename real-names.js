/**
 * Discord user id -> name on fibersales.co (owner 2026-10-16: boards and deal logs show real names,
 * not "B Ray" / "Marcus"). Refreshed from the access roster every time the bot fetches it.
 * Unlinked people keep their Discord name.
 */
const SELLING_PROFILE = /\s*[—–-]\s*selling profile\s*$|\s*\(selling profile\)\s*$/i;
let names = new Map();

/** "darren bledsoe" -> "Darren Bledsoe"; names already capitalized are left as typed. */
function tidy(name) {
  const n = String(name || '').replace(SELLING_PROFILE, '').replace(/\s+/g, ' ').trim();
  return n === n.toLowerCase() ? n.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : n;
}

function setFromRoster(people) {
  const next = new Map();
  for (const p of people || []) if (p?.discordUserId && p.name) next.set(String(p.discordUserId), tidy(p.name));
  if (next.size) names = next;
}

function realName(userId, fallback) {
  return (userId && names.get(String(userId))) || fallback;
}

module.exports = { setFromRoster, realName, tidy };
