/**
 * Crew door board (owner 2026-11-12): at 8:30 PM ET each blitz chat gets its crew's doors pinned in Canvass today,
 * zeros included, so the crew holds itself to it. Only people set up in Canvass show (doorsToday null = left off, so a
 * crew that does not use Canvass never shows a wall of zeros). Counts come from the OS roster (fetchAccessRoster).
 */
const { BOARD_LINK, rankLabel } = require('./leaderboard-format');

const cleanName = (name) => String(name || '').replace(/\s*[—–-]\s*selling profile\s*$/i, '').trim();

/** roster.active → Map(blitz name → [{ name, doors }] sorted most doors first). One row per human. */
function doorRowsByBlitz(active) {
  const byBlitz = new Map();
  for (const p of active || []) {
    if (!p.blitz || p.doorsToday == null) continue;
    const crew = byBlitz.get(p.blitz) || new Map();
    const key = p.human || cleanName(p.name).toLowerCase();
    const prev = crew.get(key);
    if (!prev || p.doorsToday > prev.doors) crew.set(key, { name: cleanName(p.name), doors: p.doorsToday });
    byBlitz.set(p.blitz, crew);
  }
  const out = new Map();
  for (const [blitz, crew] of byBlitz) {
    const rows = [...crew.values()].sort((a, b) => b.doors - a.doors || a.name.localeCompare(b.name));
    // Nobody pinned = a crew that is off or does not use Canvass. Post nothing (owner 2026-11-17: a nightly wall of zeros
    // in Michigan and Greensboro teaches people to ignore the board).
    if (rows.some((r) => r.doors > 0)) out.set(blitz, rows);
  }
  return out;
}

/** Same look as the deal boards: bold top three, total line, link to the full board. First line = card title. */
function formatDoorBoard(crewName, rows) {
  const total = rows.reduce((n, r) => n + r.doors, 0);
  const body = rows.map((r, i) => (i < 3 && r.doors > 0 ? `${rankLabel(i)} **${r.name}** · **${r.doors}**` : `${rankLabel(i)} ${r.name} · ${r.doors}`));
  // Same tail as the deal boards: "· Caleb Head leads by 23" once someone has doors.
  const [a, b] = rows;
  const lead = a && b && a.doors > 0 ? (a.doors === b.doors ? ' · Tied at the top' : ` · ${a.name} leads by ${a.doors - b.doors}`) : '';
  return [
    `🚪 **${crewName} · Doors today**`,
    '',
    ...body,
    '',
    `**${total} door${total === 1 ? '' : 's'}** · ${rows.length} rep${rows.length === 1 ? '' : 's'}${lead}`,
    BOARD_LINK,
  ].join('\n');
}

/** Counts older than this are yesterday's or a failed sync: post nothing rather than wrong numbers. */
const MAX_SYNC_AGE_MS = 3 * 60 * 60 * 1000;
const syncIsFresh = (syncedAt, now = Date.now()) => Boolean(syncedAt) && now - Date.parse(syncedAt) <= MAX_SYNC_AGE_MS;

/**
 * Near-live doors (owner 2026-11-16): which Canvass sync slot is due at this ET time, or null. Hourly noon to 7 PM, plus
 * 8:10 PM so the 8:30 board counts the whole day (the OS's own evening runs land ~7:18 and ~9:05 PM since the clock change).
 * ~9 GitHub runs a day at ~3 billed minutes. `et` = { day: 'YYYY-MM-DD', hour, minute }; `done` = slots already kicked.
 */
function canvassSyncSlot(et, done) {
  let slot = null;
  if (et.hour >= 12 && et.hour <= 19) slot = `${et.day} ${et.hour}`;
  else if (et.hour === 20 && et.minute >= 10) slot = `${et.day} 20:10`;
  return slot && !done.has(slot) ? slot : null;
}

module.exports = { doorRowsByBlitz, formatDoorBoard, syncIsFresh, canvassSyncSlot };
