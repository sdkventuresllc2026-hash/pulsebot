/**
 * READ-ONLY. Show a member's recent messages in the blitz chats (images, reactions, Pulse replies) so proof handling can
 * be checked by eye.   node scripts/inspect-proof-messages.js "<name part>" [hours=36] [channel-part]
 */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const [who = '', hoursArg = '36', chanPart = ''] = process.argv.slice(2);
const since = Date.now() - Number(hoursArg) * 3600e3;

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN); await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch(); await guild.members.fetch();
  const target = guild.members.cache.filter((m) => (m.displayName + ' ' + m.user.username).toLowerCase().includes(who.toLowerCase()));
  console.log('members:', target.map((m) => `${m.displayName} (${m.id})`).join(', ') || 'none');
  const ids = new Set(target.map((m) => m.id));
  for (const ch of guild.channels.cache.values()) {
    if (!ch.isTextBased?.() || ch.isThread?.() || (chanPart && !ch.name.includes(chanPart))) continue;
    let msgs; try { msgs = await ch.messages.fetch({ limit: 100 }); } catch { continue; }
    const recent = [...msgs.values()].filter((m) => m.createdTimestamp >= since).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const mine = recent.filter((m) => ids.has(m.author.id));
    if (!mine.length) continue;
    console.log(`\n#${ch.name}`);
    for (const m of mine) {
      const imgs = [...m.attachments.values()].map((a) => a.contentType || a.name).join(',');
      const reacts = [...m.reactions.cache.values()].map((r) => `${r.emoji.name}x${r.count}${r.me ? '(bot)' : ''}`).join(' ');
      const replies = recent.filter((r) => r.author.bot && (r.reference?.messageId === m.id || (r.createdTimestamp > m.createdTimestamp && r.createdTimestamp - m.createdTimestamp < 90e3)));
      console.log(`  ${new Date(m.createdTimestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })} ${m.id} "${(m.content || '').slice(0, 60)}" imgs[${imgs}] reacts[${reacts}]`);
      for (const r of replies) console.log(`     bot> ${(r.content || '').replace(/\n/g, ' | ').slice(0, 220)}${r.reference?.messageId === m.id ? ' (reply)' : ''}`);
    }
  }
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
