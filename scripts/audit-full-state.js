/**
 * READ-ONLY full Discord state capture for the systems audit.
 *
 * Writes docs/discord-current-state.json. Changes NOTHING in Discord.
 *
 * Captures more than audit-discord.js: every ID, every overwrite resolved to a name, effective
 * per-role permissions per channel, application command permissions, integrations, bot scopes,
 * membership screening / onboarding config, and 14-day usage per channel.
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, ChannelType, PermissionsBitField, REST, Routes } = require('discord.js');

const F = PermissionsBitField.Flags;
const OUT = path.resolve(__dirname, '..', 'docs', 'discord-current-state.json');
const DAY = 86400000;

const TYPE = {
  [ChannelType.GuildText]: 'text', [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildCategory]: 'category', [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildForum]: 'forum', [ChannelType.GuildStageVoice]: 'stage',
};

// The permissions that actually decide behaviour in this server.
const CHECK = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages', 'ManageChannels',
  'ManageRoles', 'MentionEveryone', 'AttachFiles', 'EmbedLinks', 'UseApplicationCommands',
  'AddReactions', 'CreateInstantInvite', 'Administrator', 'ManageGuild', 'KickMembers', 'BanMembers'];

(async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.fetch();
  const members = await guild.members.fetch();
  const roles = await guild.roles.fetch();
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();

  const roleName = (id) => (id === guild.id ? '@everyone' : roles.get(id)?.name ?? `role:${id}`);
  const memberName = (id) => members.get(id)?.user?.username ?? `member:${id}`;

  const state = { capturedAt: new Date().toISOString(), guild: {}, roles: [], bots: [], categories: [], uncategorized: [], applicationCommands: [], integrations: [], invites: [], notes: [] };

  state.guild = {
    name: guild.name, id: guild.id, ownerId: guild.ownerId, ownerUsername: memberName(guild.ownerId),
    createdAt: guild.createdAt?.toISOString(), memberCount: guild.memberCount,
    humans: members.filter((m) => !m.user.bot).size, bots: members.filter((m) => m.user.bot).size,
    verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter,
    mfaLevel: guild.mfaLevel, premiumTier: guild.premiumTier, features: guild.features,
    rulesChannelId: guild.rulesChannelId, rulesChannel: guild.rulesChannel?.name ?? null,
    systemChannelId: guild.systemChannelId, systemChannel: guild.systemChannel?.name ?? null,
    systemChannelFlags: guild.systemChannelFlags?.toArray?.() ?? [],
    publicUpdatesChannel: guild.publicUpdatesChannel?.name ?? null,
    // Membership screening / onboarding only exist on Community servers.
    communityEnabled: guild.features.includes('COMMUNITY'),
    membershipScreeningEnabled: guild.features.includes('MEMBER_VERIFICATION_GATE_ENABLED'),
    welcomeScreenEnabled: guild.features.includes('WELCOME_SCREEN_ENABLED'),
    botHighestRole: { name: me.roles.highest.name, id: me.roles.highest.id, position: me.roles.highest.position },
  };

  state.roles = Array.from(roles.values()).sort((a, b) => b.position - a.position).map((r) => ({
    name: r.name, id: r.id, position: r.position, color: r.hexColor, hoist: r.hoist,
    managed: r.managed, mentionable: r.mentionable,
    memberCount: r.id === guild.id ? guild.memberCount : r.members.size,
    members: r.id === guild.id ? [] : r.members.map((m) => m.user.username),
    permissions: CHECK.filter((p) => r.permissions.has(F[p])),
    aboveBot: r.position >= me.roles.highest.position,
  }));

  for (const m of members.filter((x) => x.user.bot).values()) {
    state.bots.push({
      username: m.user.username, id: m.id, tag: m.user.tag,
      roles: Array.from(m.roles.cache.values()).filter((r) => r.name !== '@everyone').map((r) => ({ name: r.name, id: r.id, managed: r.managed })),
      effectiveGuildPermissions: CHECK.filter((p) => m.permissions.has(F[p])),
      highestRolePosition: m.roles.highest.position,
      joinedAt: m.joinedAt?.toISOString(),
    });
  }

  const describe = async (ch) => {
    const rec = {
      name: ch.name, id: ch.id, type: TYPE[ch.type] ?? String(ch.type), position: ch.position,
      parentId: ch.parentId, topic: ch.topic ?? null, nsfw: ch.nsfw ?? false,
      slowmodeSeconds: ch.rateLimitPerUser ?? 0,
      permissionSynced: ch.permissionsLocked ?? null,
      overwrites: Array.from(ch.permissionOverwrites?.cache?.values() ?? []).map((o) => ({
        targetType: o.type === 0 ? 'role' : 'member',
        target: o.type === 0 ? roleName(o.id) : memberName(o.id),
        targetId: o.id,
        allow: o.allow.toArray(), deny: o.deny.toArray(),
      })),
      effectivePermissionsByRole: {},
    };
    // Effective view/send/manage per role — the thing a matrix actually needs.
    for (const r of roles.values()) {
      const p = ch.permissionsFor(r);
      if (!p) continue;
      rec.effectivePermissionsByRole[r.name] = {
        view: p.has(F.ViewChannel), send: p.has(F.SendMessages),
        history: p.has(F.ReadMessageHistory), manageMessages: p.has(F.ManageMessages),
      };
    }
    if ([ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) {
      try {
        const msgs = await ch.messages.fetch({ limit: 100 });
        const arr = Array.from(msgs.values());
        rec.usage = {
          messagesSampled: arr.length,
          lastMessageAt: arr[0]?.createdAt?.toISOString() ?? null,
          daysSinceLastMessage: arr[0] ? Math.round((Date.now() - arr[0].createdTimestamp) / DAY) : null,
          last7d: arr.filter((m) => Date.now() - m.createdTimestamp < 7 * DAY).length,
          last14d: arr.filter((m) => Date.now() - m.createdTimestamp < 14 * DAY).length,
          last30d: arr.filter((m) => Date.now() - m.createdTimestamp < 30 * DAY).length,
          botMessages: arr.filter((m) => m.author.bot).length,
          humanMessages: arr.filter((m) => !m.author.bot).length,
          uniqueHumanAuthors: new Set(arr.filter((m) => !m.author.bot).map((m) => m.author.id)).size,
          attachments: arr.reduce((n, m) => n + m.attachments.size, 0),
          sampleSaturated: arr.length === 100,
        };
        const pins = await ch.messages.fetchPins().catch(() => null);
        rec.pinnedCount = pins?.items?.length ?? pins?.size ?? 0;
      } catch (e) { rec.readError = String(e.message || e).slice(0, 160); }
    }
    return rec;
  };

  const all = Array.from(guild.channels.cache.values()).filter(Boolean);
  const cats = all.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  for (const cat of cats) {
    const entry = {
      name: cat.name, id: cat.id, position: cat.position,
      overwrites: Array.from(cat.permissionOverwrites.cache.values()).map((o) => ({
        targetType: o.type === 0 ? 'role' : 'member', target: o.type === 0 ? roleName(o.id) : memberName(o.id),
        targetId: o.id, allow: o.allow.toArray(), deny: o.deny.toArray(),
      })),
      channels: [],
    };
    for (const ch of all.filter((c) => c.parentId === cat.id).sort((a, b) => a.position - b.position)) {
      entry.channels.push(await describe(ch));
      process.stdout.write('.');
    }
    state.categories.push(entry);
  }
  for (const ch of all.filter((c) => !c.parentId && c.type !== ChannelType.GuildCategory)) {
    state.uncategorized.push(await describe(ch));
  }

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const cmds = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id));
    let perms = [];
    try { perms = await rest.get(Routes.guildApplicationCommandsPermissions(process.env.CLIENT_ID, guild.id)); }
    catch (e) { state.notes.push(`command permissions unreadable: ${e.message}`); }
    state.applicationCommands = cmds.map((c) => ({
      name: c.name, id: c.id, description: c.description,
      defaultMemberPermissions: c.default_member_permissions,
      dmPermission: c.dm_permission,
      subcommands: (c.options || []).filter((o) => o.type === 1).map((o) => o.name),
      overrides: perms.find((p) => p.id === c.id)?.permissions ?? null,
    }));
  } catch (e) { state.notes.push(`application commands unreadable: ${e.message}`); }

  try {
    const ints = await guild.fetchIntegrations();
    state.integrations = Array.from(ints.values()).map((i) => ({
      name: i.name, type: i.type, enabled: i.enabled,
      application: i.application?.name ?? null, scopes: i.scopes ?? null,
      roleId: i.role?.id ?? null, roleName: i.role?.name ?? null,
    }));
  } catch (e) { state.notes.push(`integrations unreadable (needs Manage Server): ${e.message}`); }

  try {
    const inv = await guild.invites.fetch();
    state.invites = Array.from(inv.values()).map((i) => ({ code: i.code, channel: i.channel?.name, uses: i.uses, maxUses: i.maxUses, inviter: i.inviter?.username, expiresAt: i.expiresAt?.toISOString() ?? 'never' }));
  } catch (e) { state.notes.push(`invites unreadable: ${e.message}`); }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(state, null, 2));
  const chCount = state.categories.reduce((n, c) => n + c.channels.length, 0) + state.uncategorized.length;
  console.log(`\n\n✓ ${chCount} channels · ${state.roles.length} roles · ${state.bots.length} bots · ${state.applicationCommands.length} commands`);
  console.log(`  wrote docs/discord-current-state.json`);
  if (state.notes.length) state.notes.forEach((n) => console.log(`  note: ${n}`));
  await client.destroy();
})().catch((e) => { console.error('CAPTURE FAILED:', e); process.exit(1); });
