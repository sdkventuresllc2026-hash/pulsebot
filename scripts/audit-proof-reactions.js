/**
 * READ-ONLY. Every screenshot posted by a rep in the last N hours: did Pulse ✅ it, reply to it, or ignore it?
 *   node scripts/audit-proof-reactions.js [hours=36]
 */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const hours = Number(process.argv[2] || 36);
const since = Date.now() - hours * 3600e3;
(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN); await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID); await guild.channels.fetch();
  const rows = [];
  for (const ch of guild.channels.cache.values()) {
    if (!ch.isTextBased?.() || ch.isThread?.()) continue;
    let all = [];
    let before;
    for (let i = 0; i < 5; i++) {
      const page = await ch.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
      if (!page?.size) break;
      all.push(...page.values()); before = page.last().id;
      if (page.last().createdTimestamp < since) break;
    }
    all = all.filter((m) => m.createdTimestamp >= since);
    for (const m of all) {
      if (m.author.bot || ![...m.attachments.values()].some((a) => /image/.test(a.contentType || '') || /\.(png|jpe?g|heic|webp)$/i.test(a.name || ''))) continue;
      const checked = m.reactions.cache.some((r) => r.emoji.name === '✅' && r.me);
      const reply = all.find((r) => r.author.id === client.user.id && r.reference?.messageId === m.id);
      rows.push({ ch: ch.name, at: new Date(m.createdTimestamp).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }), who: m.member?.displayName || m.author.username, id: m.id, checked, reply: reply ? (reply.content || '').replace(/\n/g, ' | ').slice(0, 110) : '' });
    }
  }
  const by = {};
  for (const r of rows) { const o = by[r.ch] ||= { shots: 0, checked: 0, replyOnly: 0, ignored: 0 }; o.shots++; if (r.checked) o.checked++; else if (r.reply) o.replyOnly++; else o.ignored++; }
  console.log('per channel:', JSON.stringify(by));
  for (const r of rows.filter((r) => !r.checked)) console.log(`${r.ch.padEnd(14)} ${r.at.padEnd(16)} ${r.who.padEnd(18)} ${r.id} ${r.reply ? 'REPLY ONLY: ' + r.reply : 'IGNORED'}`);
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
