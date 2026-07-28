/**
 * READ-ONLY. Matches every Discord member to a real person in the FiberSales OS roster so their
 * nickname can be set to their actual name.
 *
 * Changes NOTHING. Writes nickname-proposal.json + nickname-proposal.md for review.
 * Applying happens separately (apply-nicknames.js), only after you've read the proposal.
 *
 * Signals, best first:
 *   1. current Discord nickname == rep name            -> EXACT
 *   2. username or nickname appears in the rep's csvAliases  -> ALIAS  (the strongest cryptic-handle signal)
 *   3. every token of the rep name appears in the nickname (or vice versa) -> TOKENS
 *   4. first name + last initial                       -> INITIAL
 *   5. unique first-name hit                           -> WEAK
 *
 * Usage:  node scripts/match-discord-to-roster.js
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');

const ROSTER = path.resolve(__dirname, '..', 'fibersales-roster.json');
const OUT_JSON = path.resolve(__dirname, '..', 'nickname-proposal.json');
const OUT_MD = path.resolve(__dirname, '..', 'nickname-proposal.md');

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);
const squash = (s) => norm(s).replace(/\s/g, '');

function score(member, person) {
  const nick = member.displayName;
  const user = member.username;
  const name = person.name;

  if (squash(nick) === squash(name)) return { tier: 'EXACT', confidence: 100, why: 'nickname already matches the roster name' };

  for (const alias of person.aliases || []) {
    if (!alias) continue;
    if (squash(alias) === squash(user) || squash(alias) === squash(nick)) {
      return { tier: 'ALIAS', confidence: 95, why: `roster alias "${alias}"` };
    }
  }

  const nameToks = tokens(name);
  const nickToks = tokens(nick);
  if (nameToks.length >= 2 && nickToks.length >= 1) {
    const allNameInNick = nameToks.every((t) => nickToks.includes(t));
    const allNickInName = nickToks.every((t) => nameToks.includes(t)) && nickToks.length >= 2;
    if (allNameInNick || allNickInName) return { tier: 'TOKENS', confidence: 85, why: `name tokens match "${nick}"` };
  }

  // "Riley G" / "rileyg" style.
  if (nameToks.length >= 2) {
    const compact = nameToks[0] + nameToks[nameToks.length - 1][0];
    if (squash(nick) === compact || squash(user) === compact) {
      return { tier: 'INITIAL', confidence: 70, why: 'first name + last initial' };
    }
  }

  // Bare first name — only useful if it is unique across the roster; caller checks that.
  if (nameToks.length && nickToks.length === 1 && nickToks[0] === nameToks[0]) {
    return { tier: 'WEAK', confidence: 40, why: `first name "${nameToks[0]}" only` };
  }
  return null;
}

(async () => {
  if (!fs.existsSync(ROSTER)) throw new Error(`Missing ${ROSTER}. Run the payos export first.`);
  const roster = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
  const people = [...roster.reps, ...roster.managers];

  // How many roster people share a first name — used to demote WEAK matches to unusable.
  // Count DISTINCT humans per first name, not roster rows. Selling managers appear twice (Rep +
  // Manager record), which made every one of their first names look ambiguous and suppressed the
  // first-name match — "Noah" reads as two Noahs when it is one Noah Mills with two records.
  const firstNameCount = new Map();
  const seenPeople = new Set();
  for (const p of people) {
    const key = squash(p.name);
    if (seenPeople.has(key)) continue;
    seenPeople.add(key);
    const f = tokens(p.name)[0];
    if (f) firstNameCount.set(f, (firstNameCount.get(f) || 0) + 1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  const results = [];
  for (const m of members.values()) {
    if (m.user.bot) continue;
    const market = [...m.roles.cache.values()].map((r) => r.name).filter((n) => n.startsWith('Pulse · ')).join(', ');
    const scored = people
      .map((p) => ({ person: p, ...(score(m, p) || {}) }))
      .filter((s) => s.tier)
      .filter((s) => s.tier !== 'WEAK' || firstNameCount.get(tokens(s.person.name)[0]) === 1)
      .sort((a, b) => b.confidence - a.confidence);

    const best = scored[0] || null;
    // Two hits at the same score are only ambiguous if they are two DIFFERENT humans. Selling
    // managers (Ben Edwards, Caleb Head, Jacob Arnold, …) intentionally hold BOTH a Rep and a
    // Manager record — same person, same name, two rows. Treating that as a tie discarded every
    // dual-identity manager as "no match", which is most of the leadership team.
    const topName = best ? squash(best.person.name) : null;
    const ambiguous = scored.some((s) => s.confidence === best?.confidence && squash(s.person.name) !== topName);
    results.push({
      userId: m.id,
      username: m.user.username,
      currentNickname: m.displayName,
      market: market || null,
      joinedDaysAgo: Math.round((Date.now() - m.joinedTimestamp) / 86400000),
      match: best && !ambiguous ? { name: best.person.name, kind: best.person.kind, tier: best.tier, confidence: best.confidence, why: best.why } : null,
      alternatives: ambiguous ? scored.slice(0, 3).map((s) => s.person.name) : [],
      needsNicknameChange: Boolean(best && !ambiguous && best.tier !== 'EXACT'),
    });
  }

  const auto = results.filter((r) => r.match && r.match.confidence >= 85 && r.needsNicknameChange);
  const already = results.filter((r) => r.match && r.match.tier === 'EXACT');
  const review = results.filter((r) => r.match && r.match.confidence < 85 && r.needsNicknameChange);
  const none = results.filter((r) => !r.match);

  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), auto, review, none, already }, null, 2));

  const L = ['# Discord → FiberSales name matching', '',
    `${results.length} humans · **${auto.length} confident renames** · ${already.length} already correct · ${review.length} need a look · ${none.length} no match`, ''];
  const row = (r) => `| ${r.username} | ${r.currentNickname} | ${r.match ? r.match.name : '—'} | ${r.match ? r.match.tier : ''} | ${r.market || '—'} | ${r.joinedDaysAgo}d |`;
  const head = '| username | nickname now | → real name | via | market | joined |\n|---|---|---|---|---|---|';
  L.push('## ✅ Confident — will rename', '', head, ...auto.map(row), '');
  if (review.length) L.push('## 🤔 Lower confidence — confirm these', '', head, ...review.map(row), '');
  if (none.length) L.push('## ❓ No roster match', '', head, ...none.map(row), '');
  if (already.length) L.push('## Already correct', '', head, ...already.map(row), '');
  fs.writeFileSync(OUT_MD, L.join('\n'));

  console.log(`${results.length} humans scanned`);
  console.log(`  ✅ confident renames : ${auto.length}`);
  console.log(`  ✓  already correct   : ${already.length}`);
  console.log(`  🤔 need review       : ${review.length}`);
  console.log(`  ❓ no match          : ${none.length}`);
  console.log(`\nwrote nickname-proposal.md and .json — nothing has been changed`);
  await client.destroy();
})().catch((e) => { console.error('MATCH FAILED:', e); process.exit(1); });
