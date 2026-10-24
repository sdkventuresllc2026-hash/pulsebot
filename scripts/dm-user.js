/**
 * DM one Discord user (as the bot) with text the owner approved word for word.
 *   node scripts/dm-user.js <discordUserId> "<text>"          # preview: resolves the user, sends nothing
 *   node scripts/dm-user.js <discordUserId> "<text>" --send   # sends the DM
 * ponytail: no name lookup, pass the id (Rep/Manager.discordUserId in the OS).
 */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const [userId, text] = process.argv.slice(2);
const SEND = process.argv.includes('--send');
if (!/^\d{15,22}$/.test(userId || '') || !text) { console.error('usage: dm-user.js <discordUserId> "<text>" [--send]'); process.exit(1); }

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) { console.log('Not in the server, not sending.'); await client.destroy(); process.exit(2); }
  console.log(`to: ${member.user.tag} (${member.displayName})\n\n${text}\n`);
  if (!SEND) console.log('Nothing sent. Add --send.');
  else { await member.send({ content: text }); console.log('✓ DM sent'); }
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
