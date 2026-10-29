/**
 * READ-ONLY. Show specific messages (by id) in a channel with their attachments, reactions and the bot's replies, plus
 * the few messages around each.   node scripts/inspect-messages-by-id.js <channel-name-part> <messageId>...
 */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const [chanPart, ...ids] = process.argv.slice(2);
const fmt = (m) => {
  const imgs = [...m.attachments.values()].map((a) => `${a.contentType || '?'}:${a.name}:${a.size}`).join(',');
  const reacts = [...m.reactions.cache.values()].map((r) => `${r.emoji.name}x${r.count}${r.me ? '(bot)' : ''}`).join(' ');
  const ref = m.reference?.messageId ? ` ->${m.reference.messageId}` : '';
  return `${new Date(m.createdTimestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })} ${m.id} ${m.author.bot ? 'BOT' : (m.member?.displayName || m.author.username)}${ref} "${(m.content || '').replace(/\n/g, ' | ').slice(0, 160)}" imgs[${imgs}] reacts[${reacts}]`;
};
(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN); await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();
  const ch = guild.channels.cache.find((c) => c.isTextBased?.() && c.name.includes(chanPart));
  if (!ch) throw new Error('no channel ' + chanPart);
  for (const id of ids) {
    console.log(`\n=== ${id} in #${ch.name}`);
    const before = await ch.messages.fetch({ before: id, limit: 3 }).catch(() => new Map());
    const m = await ch.messages.fetch(id).catch(() => null);
    const after = await ch.messages.fetch({ after: id, limit: 6 }).catch(() => new Map());
    for (const x of [...before.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)) console.log('   ' + fmt(x));
    if (m) console.log('>> ' + fmt(m)); else console.log('>> (message gone)');
    for (const x of [...after.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)) console.log('   ' + fmt(x));
  }
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
