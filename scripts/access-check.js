/** READ-ONLY. Who can actually see a blitz channel, and who is stranded. */
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const audit = require('../discord-audit.json');

const BLITZ = audit.categories.find((c) => c.name.toUpperCase().includes('BLITZ'));

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  // Market roles that actually gate a live blitz channel.
  const gating = new Map();
  for (const ch of BLITZ.channels) for (const o of ch.overwrites) {
    if (!o.on.startsWith('member:') && o.on !== '@everyone' && o.allow.includes('ViewChannel')) {
      gating.set(o.on, [...(gating.get(o.on) || []), ch.name]);
    }
  }
  console.log('=== roles that gate a live blitz channel ===');
  for (const [r, chs] of gating) console.log(`  ${r}  ->  ${chs.map((c) => '#' + c).join(', ')}`);

  const allMarketRoles = audit.roles.filter((r) => r.name.startsWith('Pulse · ')).map((r) => r.name);
  const stale = allMarketRoles.filter((r) => !gating.has(r));
  console.log(`\n=== market roles with NO channel (stale): ${stale.length} ===\n  ${stale.join('\n  ')}`);

  const live = [...gating.keys()];
  const humans = [...members.values()].filter((m) => !m.user.bot);
  // EFFECTIVE permission, not just role names — Administrator bypasses every overwrite, so a
  // name-only check wrongly reports admins (and the owner) as stranded.
  const canSeeAnyBlitz = (m) => BLITZ.channels.some((c) => guild.channels.cache.get(c.id)?.permissionsFor(m)?.has(PermissionsBitField.Flags.ViewChannel));
  const stranded = [], multi = [];
  for (const m of humans) {
    const mine = [...m.roles.cache.values()].map((r) => r.name).filter((n) => n.startsWith('Pulse · '));
    const liveMine = mine.filter((n) => live.includes(n));
    if (!canSeeAnyBlitz(m)) stranded.push(`${m.user.username} (market roles: ${mine.join(', ') || 'NONE'})`);
    if (liveMine.length > 1) multi.push(`${m.user.username} -> ${liveMine.join(', ')}`);
  }
  console.log(`\n=== CANNOT see ANY blitz channel (effective permissions) ===`);
  stranded.forEach((s) => console.log(`  ${s}`));
  console.log(`\n  TOTAL STRANDED HUMANS: ${stranded.length} of ${humans.length}`);

  console.log(`\n=== in MORE THAN ONE live blitz channel: ${multi.length} ===`);
  multi.forEach((s) => console.log(`  ${s}`));

  // Can each Manager see the blitz channels?
  const managerRole = guild.roles.cache.find((r) => r.name === 'Manager');
  console.log(`\n=== Manager role (${managerRole?.members.size ?? 0} members) blitz visibility ===`);
  for (const m of managerRole?.members.values() ?? []) {
    const vis = BLITZ.channels.map((c) => {
      const ch = guild.channels.cache.get(c.id);
      return ch?.permissionsFor(m)?.has(PermissionsBitField.Flags.ViewChannel) ? `#${c.name}` : null;
    }).filter(Boolean);
    console.log(`  ${m.user.username}: ${vis.length ? vis.join(', ') : '❌ NONE'}`);
  }

  // #management access truth
  const mgmt = audit.categories.flatMap((c) => c.channels).find((c) => c.name === 'management');
  if (mgmt) {
    const ch = guild.channels.cache.get(mgmt.id);
    const canSee = humans.filter((m) => ch?.permissionsFor(m)?.has(PermissionsBitField.Flags.ViewChannel));
    console.log(`\n=== #management: ${canSee.length} humans can see it ===`);
    canSee.forEach((m) => {
      const isMgr = m.roles.cache.some((r) => r.name === 'Manager' || r.name === 'Owner');
      console.log(`  ${isMgr ? '✓ ' : '⚠ NOT a Manager/Owner: '}${m.user.username}`);
    });
  }
  await client.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
