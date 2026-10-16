/**
 * Know who joined without them doing anything (owner 2026-10-15: "people join but don't set their
 * name up"). Two paths, no commands:
 *
 *  1. Personal invites. Every active person on the org chart with no Discord link gets a one-use
 *     invite (#welcome, never expires). The code goes to the OS; fibersales.co/discord sends them to
 *     it. On join, the invite that was used (gone, or its uses went up) names the person.
 *  2. Manager one-tap. Anyone who joined through another link and is still unknown after 10 minutes
 *     shows up in #management as "Who is @x?" with a pick-list of not-yet-linked people.
 *
 * Pure planners (usedCodes, unlinkedHumans, pickerOptions, whoToAsk) are unit-tested; the rest is I/O.
 * Never touches the Member gate itself: linking makes the OS know them, then access-sync does the rest.
 */
const fs = require('fs');
const { dataPath } = require('./paths');
const { postInviteCodes } = require('./fiberSalesOsClient');

const STORE = () => dataPath('personal-invites.json'); // { invites: { code: { keys, name, uses } }, asked: { memberId: iso } }
const WHOIS_ID = 'pulse:whois:';
const ASK_AFTER_MS = 10 * 60 * 1000;

function load() {
  try { const j = JSON.parse(fs.readFileSync(STORE(), 'utf8')); return { invites: j.invites || {}, asked: j.asked || {} }; } catch { return { invites: {}, asked: {} }; }
}
function save(s) {
  try { fs.writeFileSync(STORE(), JSON.stringify(s, null, 1)); } catch (err) { console.error('[join] save failed:', err.message || err); }
}

/** Active, unlinked people grouped into humans (a selling manager's rep + manager records = one). */
function unlinkedHumans(roster) {
  const linkedNames = new Set((roster.active || []).filter((p) => p.discordUserId).map((p) => p.name.toLowerCase()));
  const byName = new Map();
  for (const p of roster.active || []) {
    if (p.discordUserId || !p.id || linkedNames.has(p.name.toLowerCase())) continue;
    const k = p.name.toLowerCase();
    const h = byName.get(k) || { name: p.name, since: p.since || '', keys: [], people: [] };
    h.keys.push(`${p.kind.toUpperCase()}:${p.id}`);
    h.people.push({ kind: p.kind.toUpperCase(), id: p.id });
    if ((p.since || '') > h.since) h.since = p.since;
    byName.set(k, h);
  }
  return [...byName.values()];
}

/** Which stored codes were just used: gone from the server (one-use invites vanish) or uses went up. */
function usedCodes(stored, live) {
  const out = [];
  for (const [code, rec] of Object.entries(stored)) {
    if (!live.has(code)) out.push(code);
    else if (live.get(code) > (rec.uses || 0)) out.push(code);
  }
  return out;
}

/** Up to 25 not-yet-linked people, newest first (the person who just joined is usually new). */
function pickerOptions(roster) {
  return unlinkedHumans(roster)
    .sort((a, b) => b.since.localeCompare(a.since) || a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((h) => ({ label: h.name.slice(0, 100), value: `${h.people[0].kind}:${h.people[0].id}`, ...(h.since ? { description: `Added ${h.since}` } : {}) }));
}

/** Members to ask about: human, no Member role, joined 10+ min ago, not asked yet, not linked. */
function whoToAsk(members, linkedIds, asked, now) {
  // ponytail: only joins from the last 7 days, so the first run doesn't flood #management with old strays.
  return members.filter((m) => !m.isBot && !m.hasMember && !m.protected && !linkedIds.has(m.id) && !asked[m.id] && now - m.joinedAt >= ASK_AFTER_MS && now - m.joinedAt <= 7 * 24 * 60 * 60 * 1000);
}

/** Read-modify-write so a join that consumes a code mid-run is never overwritten by the mint pass. */
function update(fn) { const s = load(); fn(s); save(s); return s; }

let minting = false; // one pass at a time: minting 70+ invites outlasts the 3-minute timer

/** Mint invites for unlinked humans; retire invites of people who got linked or left the chart;
 *  delete stray one-use #welcome invites Pulse made that nothing points to (self-heal). */
async function mintPass(guild, roster, { welcomeChannelName, log = console.log } = {}) {
  if (minting) return { minted: 0, retired: 0, skipped: true };
  minting = true;
  let minted = 0;
  let retired = 0;
  try {
    const humans = unlinkedHumans(roster);
    const wanted = new Set(humans.flatMap((h) => h.keys));
    const welcome = guild.channels.cache.find((c) => c.name === welcomeChannelName && c.isTextBased?.());
    if (welcome) {
      for (const h of humans) {
        const haveKeys = new Set(Object.values(load().invites).flatMap((r) => r.keys));
        if (h.keys.some((k) => haveKeys.has(k))) continue;
        try {
          const inv = await welcome.createInvite({ maxAge: 0, maxUses: 1, unique: true, reason: `Personal invite: ${h.name}` });
          update((st) => { st.invites[inv.code] = { keys: h.keys, name: h.name, uses: 0 }; });
          const r = await postInviteCodes({ set: h.people.map((p) => ({ kind: p.kind, id: p.id, code: inv.code })) });
          if (!r.ok) log(`[join] OS invite sync failed for ${h.name}: ${r.message || r.status}`);
          minted++;
        } catch (err) { log(`[join] invite for ${h.name} failed: ${err.message || err}`); }
      }
    }
    for (const [code, rec] of Object.entries(load().invites)) {
      if (rec.keys.some((k) => wanted.has(k))) continue;
      await guild.invites.delete(code, 'Person linked or inactive').catch(() => null);
      update((st) => { delete st.invites[code]; });
      await postInviteCodes({ remove: rec.keys });
      retired++;
    }
    const known = new Set(Object.keys(load().invites));
    const botId = guild.members.me?.id;
    const live = await guild.invites.fetch().catch(() => null);
    for (const inv of live ? live.values() : []) {
      if (inv.inviterId === botId && inv.maxUses === 1 && inv.channel?.name === welcomeChannelName && !known.has(inv.code)) {
        await inv.delete('Stray personal invite').catch(() => null);
      }
    }
  } finally {
    minting = false;
  }
  return { minted, retired };
}

/** Called first thing in guildMemberAdd. Returns { people, name } when a personal invite was used. */
async function resolveJoin(guild) {
  const store = load();
  if (!Object.keys(store.invites).length) return null;
  const live = new Map((await guild.invites.fetch().catch(() => new Map())).map((i) => [i.code, i.uses || 0]));
  const used = usedCodes(store.invites, live);
  const rec = used.length === 1 ? store.invites[used[0]] : null;
  const gone = used.flatMap((code) => store.invites[code]?.keys || []);
  for (const code of used) delete store.invites[code];
  save(store);
  if (gone.length) await postInviteCodes({ remove: gone }); // a used invite is dead; the OS must stop sending people to it
  if (!rec) return null; // nothing used, two joins at once, or a deleted invite: one-tap handles it
  return { name: rec.name, people: rec.keys.map((k) => { const [kind, id] = k.split(':'); return { kind, id }; }) };
}

module.exports = { WHOIS_ID, ASK_AFTER_MS, load, save, unlinkedHumans, usedCodes, pickerOptions, whoToAsk, mintPass, resolveJoin };
