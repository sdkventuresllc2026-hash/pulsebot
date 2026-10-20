/**
 * Post one plain message (as the bot) into a channel found by name. Owner approves the exact text first.
 *   node scripts/post-message.js <channel-name-part> "<text>"          # preview: lists matching channels, posts nothing
 *   node scripts/post-message.js <channel-name-part> "<text>" --post   # posts only if exactly one channel matches
 */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const [match, text] = process.argv.slice(2);
const POST = process.argv.includes('--post');
if (!match || !text) { console.error('usage: post-message.js <channel-name-part> "<text>" [--post]'); process.exit(1); }

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();
  const hits = [...guild.channels.cache.values()].filter((c) => c.isTextBased?.() && c.name.includes(match.toLowerCase()));
  console.log(`channels matching "${match}": ${hits.map((c) => `#${c.name}`).join(', ') || 'none'}`);
  if (!POST) console.log(`\nWould post:\n${text}\n\nNothing posted. Add --post.`);
  else if (hits.length !== 1) console.log('Not posting: need exactly one matching channel.');
  else { await hits[0].send({ content: text }); console.log(`✓ posted in #${hits[0].name}`); }
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
