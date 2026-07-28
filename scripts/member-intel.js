/** READ-ONLY. Context on specific members so decisions aren't made blind. */
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField: P } = require('discord.js');
const fs = require('node:fs');

const UNASSIGNED = ['luckysp0220', 'cc.7k', 'dmassey1', 'maxk7748', 'kaisyiturner', 'spiffyfn123', 'goob.mc', 'jallen710', 'dihcheeseitis'];
const MGMT = ['litty29012', 'bedwar26', 'jmaneski.', 'iqrexy_37266'];
const DAY = 86400000;

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  await guild.channels.fetch();

  // Count messages per author across every readable text channel (last 200 each).
  const counts = new Map();
  const lastSeen = new Map();
  for (const ch of guild.channels.cache.values()) {
    if (!ch.isTextBased?.() || !ch.viewable) continue;
    try {
      let before;
      for (let page = 0; page < 2; page++) {
        const msgs = await ch.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!msgs.size) break;
        for (const m of msgs.values()) {
          counts.set(m.author.id, (counts.get(m.author.id) || 0) + 1);
          const prev = lastSeen.get(m.author.id) || 0;
          if (m.createdTimestamp > prev) lastSeen.set(m.author.id, m.createdTimestamp);
        }
        before = msgs.last()?.id;
      }
    } catch { /* unreadable */ }
  }

  const show = (title, names) => {
    console.log(`\n=== ${title} ===`);
    for (const n of names) {
      const m = [...members.values()].find((x) => x.user.username === n);
      if (!m) { console.log(`  ${n}: NOT IN SERVER`); continue; }
      const joined = Math.round((Date.now() - m.joinedTimestamp) / DAY);
      const ls = lastSeen.get(m.id);
      const roles = [...m.roles.cache.values()].map((r) => r.name).filter((r) => r !== '@everyone').join(', ') || 'none';
      console.log(`  ${n}`);
      console.log(`     joined ${joined}d ago (${m.joinedAt.toISOString().slice(0, 10)}) · display "${m.displayName}"`);
      console.log(`     messages seen: ${counts.get(m.id) || 0} · last post: ${ls ? Math.round((Date.now() - ls) / DAY) + 'd ago' : 'NEVER'}`);
      console.log(`     roles: ${roles}`);
    }
  };
  show('NO MARKET ROLE — who are these people', UNASSIGNED);
  show('NON-MANAGERS WITH #management ACCESS', MGMT);

  // Confirm the restructure landed.
  console.log(`\n=== post-restructure state ===`);
  const everyone = guild.roles.everyone;
  console.log(`  @everyone can create invites: ${everyone.permissions.has(P.Flags.CreateInstantInvite)}`);
  for (const n of ['Pulse', 'Sapphire', 'Bot']) {
    const r = guild.roles.cache.find((x) => x.name === n);
    if (r) console.log(`  role "${n}" Administrator: ${r.permissions.has(P.Flags.Administrator)}${r.managed ? ' (managed — must be changed by hand)' : ''}`);
  }
  const mgr = guild.roles.cache.find((r) => r.name === 'Manager');
  const blitz = guild.channels.cache.filter((c) => c.parent?.name?.toUpperCase().includes('BLITZ') && c.isTextBased?.());
  console.log(`  Manager can now see: ${[...blitz.values()].filter((c) => c.permissionsFor(mgr)?.has(P.Flags.ViewChannel)).length}/${blitz.size} blitz channels`);
  const names = [...guild.channels.cache.values()].filter((c) => c.isTextBased?.()).map((c) => c.name);
  for (const n of ['welcome', 'wins', 'ask-anything', 'leaderboard', 'pay-and-ops', 'resources']) {
    console.log(`  #${n}: ${names.includes(n) ? '✓ exists' : '✗ MISSING'}`);
  }
  await client.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
