/** READ-ONLY. Resolves the raw member IDs sitting in channel permission overwrites. */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const audit = require('../discord-audit.json');

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.members.fetch();

  const ids = new Set();
  const where = new Map();
  for (const cat of audit.categories) for (const ch of cat.channels) for (const o of ch.overwrites) {
    if (o.on.startsWith('member:')) {
      const id = o.on.slice(7);
      ids.add(id);
      where.set(id, [...(where.get(id) || []), `#${ch.name}[${o.allow.join('/')}]`]);
    }
  }
  console.log(`bot's own id: ${client.user.id} (${client.user.tag})\n`);
  for (const id of ids) {
    const m = guild.members.cache.get(id);
    const roles = m ? [...m.roles.cache.values()].filter((r) => r.name !== '@everyone').map((r) => r.name).join(', ') : '';
    console.log(`${id}  ${m ? (m.user.bot ? '[BOT] ' : '') + m.user.tag : '*** NOT IN SERVER ***'}`);
    console.log(`   roles: ${roles || '(none)'}`);
    console.log(`   on: ${where.get(id).join('  ')}\n`);
  }
  await client.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
