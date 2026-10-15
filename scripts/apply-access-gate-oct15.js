/**
 * Discord access cleanup, step 3 (owner 2026-10-15): the gate.
 *   1. Every KEEP row in discord-access-review-oct15.json (plus --keep handles) gets the Member role,
 *      so no active rep is locked out when the gate closes.
 *   2. @everyone loses View Channels server-wide; Member gains it.
 *   3. #welcome gets an @everyone overwrite allowing View Channels + Read History (+ Send, so new
 *      people can post their real name).
 * Result: no Member role = you see #welcome and nothing else. Nobody is kicked.
 *
 * DRY RUN unless --apply.  node scripts/apply-access-gate-oct15.js --apply --keep=a,b
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, PermissionsBitField: P } = require('discord.js');

const REVIEW = path.resolve(__dirname, '..', 'discord-access-review-oct15.json');
const APPLY = process.argv.includes('--apply');
const KEEP = new Set((process.argv.find((a) => a.startsWith('--keep='))?.slice(7) ?? '').split(',').map((s) => s.trim()).filter(Boolean));

(async () => {
  const review = JSON.parse(fs.readFileSync(REVIEW, 'utf8'));
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();
  const member = guild.roles.cache.find((r) => r.name === 'Member');
  const everyone = guild.roles.everyone;
  const welcome = guild.channels.cache.find((c) => c.name === 'welcome');
  if (!member || !welcome) throw new Error('Member role or #welcome not found');
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}\n`);

  // 1. Member for everyone who stays.
  const stay = review.rows.filter((r) => r.decision.startsWith('KEEP') || KEEP.has(r.username));
  let granted = 0;
  for (const r of stay) {
    const m = await guild.members.fetch(r.id).catch(() => null);
    if (!m || m.roles.cache.has(member.id)) continue;
    console.log(`  ${APPLY ? 'grant' : 'would grant'} Member → ${r.display} (${r.username})`);
    if (APPLY) await m.roles.add(member, 'Access gate 2026-10-15: active on the org chart');
    granted++;
  }
  console.log(`  Member grants: ${granted}\n`);

  // 2. Role-level gate.
  const evHas = everyone.permissions.has(P.Flags.ViewChannel);
  const memHas = member.permissions.has(P.Flags.ViewChannel);
  console.log(`  @everyone View Channels: ${evHas ? 'ON → OFF' : 'already off'}`);
  console.log(`  Member View Channels: ${memHas ? 'already on' : 'OFF → ON'}`);
  if (APPLY) {
    if (evHas) await everyone.setPermissions(everyone.permissions.remove(P.Flags.ViewChannel), 'Access gate 2026-10-15');
    if (!memHas) await member.setPermissions(member.permissions.add(P.Flags.ViewChannel), 'Access gate 2026-10-15');
  }

  // 3. #welcome stays open to everyone.
  console.log(`  #welcome: ${APPLY ? 'set' : 'would set'} @everyone overwrite View + Read History + Send`);
  if (APPLY) await welcome.permissionOverwrites.edit(everyone, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }, { reason: 'Access gate 2026-10-15: new people land here' });

  // Verify: who can still see #announcements without Member?
  const ann = guild.channels.cache.find((c) => c.name === 'announcements');
  const members = await guild.members.fetch();
  const leak = [...members.values()].filter((m) => !m.user.bot && !m.roles.cache.has(member.id) && ann.permissionsFor(m).has(P.Flags.ViewChannel));
  console.log(`\n  after: ${leak.length} people without Member can still see #announcements${leak.length ? ': ' + leak.map((m) => m.displayName).join(', ') : ''}`);
  const locked = stay.filter((r) => { const m = members.get(r.id); return m && !ann.permissionsFor(m).has(P.Flags.ViewChannel); });
  console.log(`  after: ${locked.length} KEEP people locked out of #announcements${locked.length ? ': ' + locked.map((r) => r.display).join(', ') : ''}`);
  client.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
