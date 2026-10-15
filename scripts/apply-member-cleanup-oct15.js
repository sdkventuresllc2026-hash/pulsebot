/**
 * Discord access cleanup, step 2 (owner 2026-10-15). Reads discord-access-review-oct15.json (from
 * audit-member-role-oct15.js) and, for every row whose decision starts with REMOVE, takes away the
 * Member role and every market role (Pulse · X, zz · X, bare market names). Nobody is kicked; they
 * keep #welcome, and a manager re-adds them with one click if they come back.
 *
 * DRY RUN unless --apply. Never touches KEEP rows, bots, or anyone the bot cannot edit (role above
 * Pulse). --keep=<username,username> spares specific people after review.
 *
 *   node scripts/apply-member-cleanup-oct15.js
 *   node scripts/apply-member-cleanup-oct15.js --apply --keep=rome08575,5.carti
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');

const REVIEW = path.resolve(__dirname, '..', 'discord-access-review-oct15.json');
const APPLY = process.argv.includes('--apply');
const KEEP = new Set((process.argv.find((a) => a.startsWith('--keep='))?.slice(7) ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const NEVER_STRIP = new Set(['@everyone', 'Owner', 'Manager', 'Pulse', 'Bot', 'Sapphire', 'Pro', 'Vet', 'Rookie']);

(async () => {
  const review = JSON.parse(fs.readFileSync(REVIEW, 'utf8'));
  const targets = review.rows.filter((r) => r.decision.startsWith('REMOVE') && !KEEP.has(r.username));
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const botTop = guild.members.me.roles.highest.position;

  let changed = 0, skipped = 0;
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${targets.length} members (${KEEP.size} spared by --keep)\n`);
  for (const t of targets) {
    const m = await guild.members.fetch(t.id).catch(() => null);
    if (!m) { console.log(`  skip ${t.display}: no longer in server`); skipped++; continue; }
    if (m.roles.highest.position >= botTop) { console.log(`  skip ${t.display}: role above the bot`); skipped++; continue; }
    const strip = [...m.roles.cache.values()].filter((r) => !NEVER_STRIP.has(r.name) && r.position < botTop);
    if (!strip.length) { console.log(`  ok   ${t.display}: nothing to remove`); continue; }
    console.log(`  ${APPLY ? 'strip' : 'would'} ${t.display} (${t.username}): ${strip.map((r) => r.name).join(', ')}`);
    if (APPLY) { await m.roles.remove(strip, 'Access cleanup 2026-10-15: not on the active org chart'); changed++; }
  }
  console.log(`\n${APPLY ? `done: ${changed} changed` : 'dry run, nothing changed'}, ${skipped} skipped`);
  client.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
