/** Run one access reconcile against the live server. DRY RUN unless --apply.
 *    node scripts/access-sync-once.js            (prints what would change)
 *    node scripts/access-sync-once.js --apply    (same as the bot's 15-minute pass) */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { reconcileAccess } = require('../access-sync');

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch();
  const out = await reconcileAccess(guild, { apply: process.argv.includes('--apply') });
  console.log(out ? `\n+${out.granted} −${out.stripped} linked ${out.linked}, ${out.skipped} unchanged` : 'OS unreachable');
  client.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
