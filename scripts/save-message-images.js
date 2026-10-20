/** READ-ONLY. Save a message's image attachments to a folder.  node scripts/save-message-images.js <channel-part> <messageId> <outDir> */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const [chanPart, msgId, outDir] = process.argv.slice(2);
(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN); await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID); await guild.channels.fetch();
  const ch = guild.channels.cache.find((c) => c.isTextBased?.() && c.name.includes(chanPart));
  const m = await ch.messages.fetch(msgId);
  fs.mkdirSync(outDir, { recursive: true });
  let i = 0;
  for (const a of m.attachments.values()) { const buf = Buffer.from(await (await fetch(a.url)).arrayBuffer()); const f = path.join(outDir, `${msgId}_${++i}${path.extname(a.name) || '.png'}`); fs.writeFileSync(f, buf); console.log('saved', f, buf.length); }
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
