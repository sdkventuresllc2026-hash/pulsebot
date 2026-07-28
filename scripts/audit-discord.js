/**
 * READ-ONLY Discord server audit. Writes nothing to Discord — no posts, no edits, no deletes,
 * no permission changes. It logs in with PulseBot's existing token, reads the structure, and
 * writes two local files:
 *
 *   discord-audit.json  — full machine-readable dump (for Claude to analyze)
 *   discord-audit.md    — human summary you can skim
 *
 * Captures: server settings, every role + who holds it, every category/channel in display order,
 * per-channel permission overwrites, and an activity read (last message, 30-day volume, human vs
 * bot split) so dead channels are obvious.
 *
 * Message CONTENT: only the first 100 chars of the last 5 messages per channel, to identify what
 * each channel is actually used for. Stays on your machine. Pass --no-samples to skip entirely.
 *
 * Usage:
 *   cd pulse-bot
 *   node scripts/audit-discord.js
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, ChannelType, PermissionsBitField } = require('discord.js');

const SAMPLES = !process.argv.includes('--no-samples');
const OUT_DIR = path.resolve(__dirname, '..');
const DAY = 86400000;

const TYPE = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildCategory]: 'category',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildStageVoice]: 'stage',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'media',
  [ChannelType.AnnouncementThread]: 'thread',
  [ChannelType.PublicThread]: 'thread',
  [ChannelType.PrivateThread]: 'thread',
};

const KEY_PERMS = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageMessages',
  'KickMembers', 'BanMembers', 'MentionEveryone', 'ManageWebhooks', 'ModerateMembers',
];

const days = (ts) => (ts ? Math.round((Date.now() - ts) / DAY) : null);

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;
  if (!token || !guildId) throw new Error('DISCORD_TOKEN and GUILD_ID must be set in pulse-bot/.env');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });

  // discord.js renamed 'ready' -> 'clientReady' mid-v14; listen for both so this can't hang on
  // whichever version is installed. If the client is already up, resolve immediately.
  const ready = new Promise((resolve) => {
    if (client.isReady()) return resolve();
    client.once('clientReady', resolve);
    client.once('ready', resolve);
  });
  await client.login(token);
  await ready;
  console.log('connected as', client.user.tag);

  const guild = await client.guilds.fetch(guildId);
  await guild.fetch();
  const members = await guild.members.fetch().catch(() => null);
  const roles = await guild.roles.fetch();
  const channels = await guild.channels.fetch();

  const roleMemberCount = new Map();
  if (members) for (const m of members.values()) for (const rid of m.roles.cache.keys()) roleMemberCount.set(rid, (roleMemberCount.get(rid) || 0) + 1);

  const roleName = (id) => (id === guild.id ? '@everyone' : roles.get(id)?.name ?? `role:${id}`);

  const out = {
    generatedAt: new Date().toISOString(),
    guild: {
      name: guild.name,
      id: guild.id,
      createdAt: guild.createdAt?.toISOString(),
      memberCount: guild.memberCount,
      humans: members ? members.filter((m) => !m.user.bot).size : null,
      bots: members ? members.filter((m) => m.user.bot).size : null,
      botList: members ? members.filter((m) => m.user.bot).map((m) => m.user.tag) : [],
      premiumTier: guild.premiumTier,
      boosts: guild.premiumSubscriptionCount,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      features: guild.features,
      rulesChannel: guild.rulesChannel?.name ?? null,
      systemChannel: guild.systemChannel?.name ?? null,
      publicUpdatesChannel: guild.publicUpdatesChannel?.name ?? null,
      afkChannel: guild.afkChannel?.name ?? null,
      vanityURLCode: guild.vanityURLCode ?? null,
      emojiCount: guild.emojis.cache.size,
      stickerCount: guild.stickers.cache.size,
    },
    roles: [...roles.values()]
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        name: r.name,
        id: r.id,
        position: r.position,
        color: r.hexColor,
        hoisted: r.hoist,
        mentionable: r.mentionable,
        managed: r.managed,
        memberCount: r.id === guild.id ? guild.memberCount : roleMemberCount.get(r.id) || 0,
        keyPermissions: KEY_PERMS.filter((p) => r.permissions.has(PermissionsBitField.Flags[p])),
      })),
    categories: [],
    orphanChannels: [],
  };

  const all = [...channels.values()].filter(Boolean);
  const cats = all.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);

  async function describe(ch) {
    const rec = {
      name: ch.name,
      id: ch.id,
      type: TYPE[ch.type] ?? String(ch.type),
      position: ch.position,
      topic: ch.topic ?? null,
      nsfw: ch.nsfw ?? false,
      slowmodeSeconds: ch.rateLimitPerUser ?? 0,
      overwrites: [...(ch.permissionOverwrites?.cache?.values() ?? [])].map((o) => ({
        on: o.type === 0 ? roleName(o.id) : `member:${o.id}`,
        allow: o.allow.toArray(),
        deny: o.deny.toArray(),
      })),
    };
    // @everyone visibility — the single most useful signal for "is this channel public".
    const everyone = rec.overwrites.find((o) => o.on === '@everyone');
    rec.everyoneCanView = !everyone?.deny.includes('ViewChannel');
    rec.everyoneCanSend = !(everyone?.deny.includes('SendMessages'));

    const readable = [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type);
    if (readable) {
      try {
        const msgs = await ch.messages.fetch({ limit: 100 });
        const arr = [...msgs.values()];
        rec.lastMessageAt = arr[0]?.createdAt?.toISOString() ?? null;
        rec.daysSinceLastMessage = days(arr[0]?.createdTimestamp);
        rec.messagesInSample = arr.length;
        rec.last30d = arr.filter((m) => Date.now() - m.createdTimestamp < 30 * DAY).length;
        rec.last7d = arr.filter((m) => Date.now() - m.createdTimestamp < 7 * DAY).length;
        rec.uniqueHumanAuthors = new Set(arr.filter((m) => !m.author.bot).map((m) => m.author.id)).size;
        rec.botMessageShare = arr.length ? Math.round((arr.filter((m) => m.author.bot).length / arr.length) * 100) : 0;
        rec.attachmentsInSample = arr.reduce((n, m) => n + m.attachments.size, 0);
        rec.pinnedCount = (await ch.messages.fetchPinned().catch(() => null))?.size ?? null;
        if (SAMPLES) {
          rec.recentSamples = arr.slice(0, 5).map((m) => ({
            from: m.author.bot ? `[bot] ${m.author.username}` : m.author.username,
            at: m.createdAt.toISOString().slice(0, 10),
            text: (m.content || '').replace(/\s+/g, ' ').slice(0, 100),
            attachments: m.attachments.size,
          }));
        }
      } catch (e) {
        rec.readError = String(e.message || e).slice(0, 120);
      }
      try {
        const active = await ch.threads.fetchActive();
        const archived = await ch.threads.fetchArchived({ limit: 25 }).catch(() => null);
        rec.activeThreads = active.threads.size;
        rec.archivedThreadsSampled = archived?.threads.size ?? 0;
      } catch { /* threads unsupported/forbidden */ }
    }
    return rec;
  }

  for (const cat of cats) {
    const kids = all.filter((c) => c.parentId === cat.id).sort((a, b) => a.position - b.position);
    const entry = {
      name: cat.name,
      id: cat.id,
      position: cat.position,
      overwrites: [...cat.permissionOverwrites.cache.values()].map((o) => ({
        on: o.type === 0 ? roleName(o.id) : `member:${o.id}`,
        allow: o.allow.toArray(),
        deny: o.deny.toArray(),
      })),
      channels: [],
    };
    for (const ch of kids) { entry.channels.push(await describe(ch)); process.stdout.write('.'); }
    out.categories.push(entry);
  }

  for (const ch of all.filter((c) => !c.parentId && c.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position)) {
    out.orphanChannels.push(await describe(ch));
    process.stdout.write('.');
  }

  try {
    const hooks = await guild.fetchWebhooks();
    out.webhooks = [...hooks.values()].map((w) => ({ name: w.name, channel: w.channelId, owner: w.owner?.username ?? null }));
  } catch { out.webhooks = 'no permission to read webhooks'; }
  try {
    const invites = await guild.invites.fetch();
    out.invites = [...invites.values()].map((i) => ({ code: i.code, channel: i.channel?.name, uses: i.uses, inviter: i.inviter?.username, expiresAt: i.expiresAt?.toISOString() ?? 'never' }));
  } catch { out.invites = 'no permission to read invites'; }

  fs.writeFileSync(path.join(OUT_DIR, 'discord-audit.json'), JSON.stringify(out, null, 2));

  // ---- readable summary ----
  const L = [];
  L.push(`# Discord audit — ${out.guild.name}`, '', `Generated ${out.generatedAt}`, '');
  L.push(`**${out.guild.memberCount} members** (${out.guild.humans} human / ${out.guild.bots} bot) · boost tier ${out.guild.premiumTier} · ${out.categories.length} categories`, '');
  L.push(`Bots: ${out.guild.botList.join(', ') || 'none'}`, '');
  L.push('## Roles', '', '| Role | Members | Hoisted | Key perms |', '|---|---|---|---|');
  for (const r of out.roles) L.push(`| ${r.name} | ${r.memberCount} | ${r.hoisted ? 'yes' : ''} | ${r.keyPermissions.join(', ')} |`);
  L.push('', '## Channels', '');
  const line = (c, pad = '') => {
    const act = c.daysSinceLastMessage == null ? '—' : c.daysSinceLastMessage === 0 ? 'today' : `${c.daysSinceLastMessage}d ago`;
    const vol = c.last30d == null ? '' : ` · ${c.last30d}/30d · ${c.last7d}/7d · ${c.botMessageShare}% bot · ${c.uniqueHumanAuthors} humans`;
    const lock = c.everyoneCanView === false ? ' 🔒' : c.everyoneCanSend === false ? ' 📢' : '';
    return `${pad}- **#${c.name}** (${c.type})${lock} — last: ${act}${vol}${c.topic ? `\n${pad}  _topic:_ ${c.topic}` : ''}`;
  };
  for (const cat of out.categories) {
    L.push(`### ${cat.name}`, '');
    if (!cat.channels.length) L.push('_(empty category)_', '');
    for (const c of cat.channels) L.push(line(c));
    L.push('');
  }
  if (out.orphanChannels.length) { L.push('### (no category)', ''); for (const c of out.orphanChannels) L.push(line(c)); }
  fs.writeFileSync(path.join(OUT_DIR, 'discord-audit.md'), L.join('\n'));

  const totalCh = out.categories.reduce((n, c) => n + c.channels.length, 0) + out.orphanChannels.length;
  const dead = [...out.categories.flatMap((c) => c.channels), ...out.orphanChannels].filter((c) => c.daysSinceLastMessage != null && c.daysSinceLastMessage > 30);
  console.log(`\n\n✓ ${totalCh} channels across ${out.categories.length} categories · ${out.roles.length} roles`);
  console.log(`  ${dead.length} channel(s) silent >30 days`);
  console.log(`\n  wrote pulse-bot/discord-audit.json`);
  console.log(`  wrote pulse-bot/discord-audit.md`);

  await client.destroy();
}

main().catch((e) => { console.error('AUDIT FAILED:', e); process.exit(1); });
