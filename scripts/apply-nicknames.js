/**
 * Set Discord nicknames to real names. DRY RUN BY DEFAULT — pass --apply to write.
 *
 * Format (owner decision 2026-07-28): "Real Name (Handle)" when the person goes by a handle that
 * isn't just their name, otherwise plain "Real Name". Keeps the leaderboard readable AND keeps the
 * street names the culture runs on.
 *
 * Sources, in priority order:
 *   1. confirmed-names.json  — names you explicitly confirmed. Always wins.
 *   2. nickname-proposal.json — matcher output (auto + review tiers).
 *
 * Records every previous nickname to nickname-rollback-<ts>.json before changing anything.
 *
 *   node scripts/apply-nicknames.js            # preview
 *   node scripts/apply-nicknames.js --apply    # do it
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');

const APPLY = process.argv.includes('--apply');
const MAX_NICK = 32; // Discord hard limit.
const P = (f) => path.resolve(__dirname, '..', f);

function targetNickname(realName, handle) {
  if (!handle) return realName.slice(0, MAX_NICK);
  const withHandle = `${realName} (${handle})`;
  // Over the limit → the real name is what makes assignment possible, so the handle is what goes.
  return withHandle.length <= MAX_NICK ? withHandle : realName.slice(0, MAX_NICK);
}

(async () => {
  const confirmed = JSON.parse(fs.readFileSync(P('confirmed-names.json'), 'utf8'));
  const proposal = JSON.parse(fs.readFileSync(P('nickname-proposal.json'), 'utf8'));

  // username -> { name, handle }
  const targets = new Map();
  for (const r of [...proposal.auto, ...proposal.review]) {
    if (r.match) targets.set(r.username, { name: r.match.name, handle: null, src: r.match.tier });
  }
  for (const [username, v] of Object.entries(confirmed.confirmed)) {
    targets.set(username, { name: v.name, handle: v.handle, src: 'CONFIRMED' });
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const me = await guild.members.fetchMe();
  const myTop = me.roles.highest.position;

  const plan = [], blocked = [], unchanged = [], missing = [];
  for (const [username, t] of targets) {
    const m = [...members.values()].find((x) => x.user.username === username);
    if (!m) { missing.push(username); continue; }
    const next = targetNickname(t.name, t.handle);
    if (m.nickname === next) { unchanged.push(`${username} → ${next}`); continue; }

    // Discord refuses these outright; catching them here turns a wall of API errors into a worklist.
    if (m.id === guild.ownerId) { blocked.push({ username, next, why: 'server owner — Discord forbids renaming the owner' }); continue; }
    if (m.roles.highest.position >= myTop) { blocked.push({ username, next, why: `top role "${m.roles.highest.name}" outranks the bot` }); continue; }
    plan.push({ id: m.id, username, from: m.displayName, to: next, src: t.src });
  }

  console.log(`=== nicknames — ${APPLY ? '⚡ APPLYING' : 'DRY RUN'} ===\n`);
  plan.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. @${p.username.padEnd(22)} "${p.from}" → "${p.to}"  [${p.src}]`));
  if (unchanged.length) console.log(`\n  ${unchanged.length} already correct`);
  if (missing.length) console.log(`  ${missing.length} not in server: ${missing.join(', ')}`);
  if (blocked.length) {
    console.log(`\n  ⚠ ${blocked.length} the bot CANNOT rename — set these by hand (right-click → Change Nickname):`);
    blocked.forEach((b) => console.log(`     @${b.username.padEnd(22)} → "${b.next}"   (${b.why})`));
  }

  if (!APPLY) { console.log(`\n  Nothing changed. Apply with --apply\n`); await client.destroy(); return; }

  const file = P(`nickname-rollback-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.map((p) => ({ id: p.id, username: p.username, previousNickname: p.from })), null, 2));
  console.log(`\n  rollback → ${path.basename(file)}`);
  let ok = 0;
  for (const p of plan) {
    try { await members.get(p.id).setNickname(p.to, 'Real-name sync from FiberSales OS roster'); ok++; console.log(`  ✓ ${p.username} → ${p.to}`); }
    catch (e) { console.error(`  ✗ ${p.username}: ${e.message}`); }
  }
  console.log(`\n  ${ok}/${plan.length} renamed.`);
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
