/**
 * READ-ONLY. Discord access cleanup, step 1 (owner 2026-10-15): who in the server is on the active
 * org chart, and who is not. Joins every guild member to fibersales-roster-oct15.json (written by the
 * payos script diag-oct15-discord-roster.ts): Discord id first, then an exact or token name match.
 *
 * Writes discord-access-review-oct15.md + .json next to this repo. Changes NOTHING in Discord.
 *
 *   node scripts/audit-member-role-oct15.js
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');

const ROSTER = path.resolve(__dirname, '..', 'fibersales-roster-oct15.json');
const OUT_MD = path.resolve(__dirname, '..', 'discord-access-review-oct15.md');
const OUT_JSON = path.resolve(__dirname, '..', 'discord-access-review-oct15.json');
const PROTECTED_ROLES = new Set(['Owner', 'Manager', 'Pulse', 'Bot', 'Sapphire']);
const DAY = 86400000;

// "Christopher Matsko (Matsko)" → "christopher matsko": the parenthetical is a Discord nickname, not a name.
const norm = (s) => String(s ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const squash = (s) => norm(s).replace(/\s/g, '');
const tokens = (s) => norm(s).split(' ').filter(Boolean);

function nameMatch(member, person) {
  const nick = member.displayName, user = member.user.username, name = person.name;
  if (squash(nick) === squash(name) || squash(user) === squash(name)) return 'EXACT';
  const nt = tokens(name), kt = tokens(nick);
  if (nt.length >= 2 && kt.length >= 2 && (nt.every((t) => kt.includes(t)) || kt.every((t) => nt.includes(t)))) return 'TOKENS';
  return null;
}

(async () => {
  const roster = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
  const people = [...roster.reps.map((r) => ({ ...r, kind: 'rep' })), ...roster.managers.map((m) => ({ ...m, kind: 'manager' }))];
  const byDiscord = new Map(people.filter((p) => p.discordUserId).map((p) => [p.discordUserId, p]));

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const memberRole = guild.roles.cache.find((r) => r.name === 'Member');
  const botTop = guild.members.me?.roles.highest;

  const rows = [];
  for (const m of members.values()) {
    if (m.user.bot) continue;
    const roles = [...m.roles.cache.values()].filter((r) => r.name !== '@everyone').map((r) => r.name);
    const protectedRole = roles.find((r) => PROTECTED_ROLES.has(r)) ?? null;
    let person = byDiscord.get(m.id) ?? null;
    let how = person ? 'DISCORD_ID' : null;
    if (!person) {
      // One human can be two OS records (Rep + Manager, or a duplicate): count distinct names, not rows.
      const seen = new Set();
      const hits = people.map((p) => ({ p, t: nameMatch(m, p) })).filter((x) => x.t && !seen.has(squash(x.p.name)) && seen.add(squash(x.p.name)));
      const exact = hits.filter((x) => x.t === 'EXACT');
      const pick = exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null;
      if (pick) { person = pick.p; how = pick.t; }
    }
    // One human can be both a Rep and a Manager record: active if ANY record with that name is active.
    const active = person ? people.some((p) => squash(p.name) === squash(person.name) && p.active) : false;
    const decision = protectedRole ? 'KEEP_PROTECTED' : active ? 'KEEP' : person ? 'REMOVE_INACTIVE' : 'REMOVE_UNKNOWN';
    rows.push({
      id: m.id, username: m.user.username, display: m.displayName, joinedDaysAgo: Math.round((Date.now() - m.joinedTimestamp) / DAY),
      roles, hasMember: memberRole ? m.roles.cache.has(memberRole.id) : null, botCanEdit: botTop ? m.roles.highest.position < botTop.position : null,
      person: person ? { name: person.name, kind: person.kind, active, manager: person.manager ?? null } : null, how, decision,
    });
  }
  rows.sort((a, b) => a.decision.localeCompare(b.decision) || a.display.localeCompare(b.display));

  const activeUnmatched = people.filter((p) => p.active && !rows.some((r) => r.person && squash(r.person.name) === squash(p.name)));
  const count = (d) => rows.filter((r) => r.decision === d).length;
  const md = [];
  md.push(`# Discord access review, ${new Date().toISOString().slice(0, 10)}`, '');
  md.push(`Server members (humans): ${rows.length}. Member role: ${memberRole ? memberRole.name + ' ' + memberRole.id : 'NOT FOUND'}. Bot top role: ${botTop?.name ?? '?'} (pos ${botTop?.position ?? '?'}).`, '');
  md.push(`KEEP (active on org chart): ${count('KEEP')} · KEEP (Owner/Manager/bot roles, untouched): ${count('KEEP_PROTECTED')} · REMOVE (inactive in OS): ${count('REMOVE_INACTIVE')} · REMOVE (not in OS at all): ${count('REMOVE_UNKNOWN')}`, '');
  for (const d of ['REMOVE_UNKNOWN', 'REMOVE_INACTIVE', 'KEEP', 'KEEP_PROTECTED']) {
    md.push(`## ${d} (${count(d)})`, '', '| Discord | username | joined | roles | OS match | how |', '|---|---|---|---|---|---|');
    for (const r of rows.filter((x) => x.decision === d)) {
      md.push(`| ${r.display} | ${r.username} | ${r.joinedDaysAgo}d ago | ${r.roles.join(', ') || 'none'} | ${r.person ? `${r.person.name} (${r.person.kind}${r.person.active ? '' : ', INACTIVE'}${r.person.manager ? ', under ' + r.person.manager : ''})` : '—'} | ${r.how ?? '—'}${r.botCanEdit === false ? ' ⚠ above bot' : ''} |`);
    }
    md.push('');
  }
  md.push(`## Active in OS but NOT found in Discord (${activeUnmatched.length})`, '');
  for (const p of activeUnmatched) md.push(`- ${p.name} (${p.kind}${p.manager ? ', under ' + p.manager : ''})${p.discordUserId ? ' · linked id ' + p.discordUserId + ' not in server' : ' · no Discord link'}`);
  fs.writeFileSync(OUT_MD, md.join('\n'));
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), memberRoleId: memberRole?.id ?? null, rows }, null, 2));
  console.log(md.slice(0, 4).join('\n'));
  console.log(`wrote ${OUT_MD}`);
  client.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
