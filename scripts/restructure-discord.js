/**
 * FiberSales HQ restructure — DRY RUN BY DEFAULT.
 *
 * Prints exactly what it would change and exits. Nothing happens without --apply.
 * Every applied change is recorded to discord-rollback-<timestamp>.json first.
 *
 *   node scripts/restructure-discord.js --phase=1              # preview phase 1
 *   node scripts/restructure-discord.js --phase=1 --apply      # do it
 *
 * PHASES — run in order, stop anywhere, each is independently safe:
 *   1  ACCESS    give Manager real oversight of every blitz channel        (additive only)
 *   2  STRUCTURE new channels (#wins, #ask-anything, #welcome, …) + topics (additive only)
 *   3  ROLES     rename market roles so they match their channel           (visible rename)
 *   4  SECURITY  strip bot Administrator, lock invite creation             (test bot after)
 *
 * NOT automated on purpose — these need your judgement, the script only lists them:
 *   · assigning a market role to the 21 people who can't see any blitz channel
 *   · the 4 non-Managers with access to #management (promote them, or remove them)
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField: P } = require('discord.js');

const APPLY = process.argv.includes('--apply');
const PHASE = Number((process.argv.find((a) => a.startsWith('--phase=')) || '--phase=0').split('=')[1]);
const F = P.Flags;

// Channel gated by role  ->  what that role should actually be called.
const ROLE_RENAMES = {
  'Pulse · New York': 'Pulse · Ashtabula',   // gates #🛜ashtabuhla
  'Pulse · Newark': 'Pulse · Inman',         // gates #🛜inman
  'Pulse · 🛜somerset': 'Pulse · Kannapolis', // gates #🛜kannapolis
  // 'Pulse · Jacksonville' already correct
};
const STALE_ROLES = ['Pulse · Virginia', 'Pulse · Greenville', 'Pulse · Portland', 'Pulse · Kentucky',
  'Pulse · Georgia', 'Pulse · Oklahoma', 'Pulse · London', 'Pulse · Canton', 'Pulse · Texarkana'];

const TOPICS = {
  announcements: 'Company-wide news from leadership. Read-only.',
  training: 'Scripts, objection handling, and door-to-door fundamentals. Read-only — ask in #ask-anything.',
  'kinetic-resources': 'Order-entry references, promos, and tools for every carrier we sell.',
  shoutouts: 'Recognition from leadership. Post your own wins in #wins.',
  'pulse-help': 'How to use Pulse. Log a deal by posting your speed in your blitz channel: 1g, 2g, 2x 1g.',
  management: 'Managers and Owner only. Team performance, staffing, escalations.',
};

// Bots do not create channels or roles (verified: PulseBot only deletes its own prompts and edits
// its own messages), so neither needs Administrator.
const PULSE_PERMS = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory',
  'AddReactions', 'UseExternalEmojis', 'ManageMessages', 'UseApplicationCommands'];
const SAPPHIRE_PERMS = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions'];

const plan = [];
const rollback = [];
const add = (label, undo, run) => plan.push({ label, undo, run });

(async () => {
  if (!PHASE) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch(); await guild.roles.fetch(); await guild.members.fetch();

  const role = (n) => guild.roles.cache.find((r) => r.name === n);
  const chan = (n) => guild.channels.cache.find((c) => c.name === n);
  const cat = (n) => guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toUpperCase() === n.toUpperCase());
  const blitz = () => guild.channels.cache.filter((c) => c.parent?.name?.toUpperCase().includes('BLITZ') && c.type === ChannelType.GuildText);

  const manager = role('Manager');
  const everyone = guild.roles.everyone;

  // ---------------- PHASE 1 — ACCESS (purely additive; nobody loses anything) -------------
  if (PHASE === 1) {
    for (const ch of blitz().values()) {
      add(`#${ch.name}: grant Manager view/send/history`,
        { channelId: ch.id, roleId: manager.id, previous: ch.permissionOverwrites.cache.get(manager.id)?.allow.toArray() ?? null },
        () => ch.permissionOverwrites.edit(manager, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }));
    }
    // PulseBot's own per-channel grants include ManageChannels/ManageRoles it never uses, but no
    // ManageMessages — which it DOES use (it deletes the raw "1g" after logging). Today that works
    // only because its role is Administrator, so phase 4 would silently break logging without this.
    const pulseBot = guild.members.cache.find((m) => m.user.bot && m.user.username === 'Pulse');
    if (pulseBot) for (const ch of blitz().values()) {
      add(`#${ch.name}: grant PulseBot ManageMessages (needed once Administrator is removed)`,
        { channelId: ch.id, memberId: pulseBot.id, previous: ch.permissionOverwrites.cache.get(pulseBot.id)?.allow.toArray() ?? null },
        () => ch.permissionOverwrites.edit(pulseBot.id, { ManageMessages: true }));
    }
  }

  // ---------------- PHASE 2 — STRUCTURE (new channels + topics; additive) -----------------
  if (PHASE === 2) {
    const info = cat('INFO');
    const leadership = cat('LEADERSHIP');
    const readOnly = [{ id: everyone.id, deny: [F.SendMessages] }];
    const openToAll = [{ id: everyone.id, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory] }];

    const NEW = [
      { name: 'welcome', parent: info, topic: 'Start here. What FiberSales is, how you get paid, and how to get into your market channel.', ow: readOnly },
      { name: 'wins', parent: info, topic: 'Post your own wins. Closed a tough one? Say it here. Everyone can post.', ow: openToAll },
      { name: 'ask-anything', parent: info, topic: 'No dumb questions. Pricing, objections, order entry, pay — ask here.', ow: openToAll },
      { name: 'leaderboard', parent: info, topic: 'Daily and all-time standings, posted by Pulse.', ow: readOnly },
      { name: 'pay-and-ops', parent: leadership, topic: 'Payday schedule, pay runs, and operational issues. Managers only.', ow: [{ id: everyone.id, deny: [F.ViewChannel] }, { id: manager.id, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory] }] },
    ];
    for (const c of NEW) {
      if (chan(c.name)) { console.log(`  (skip) #${c.name} already exists`); continue; }
      add(`CREATE #${c.name} in ${c.parent?.name ?? 'no category'} — ${c.ow === openToAll ? 'EVERYONE CAN POST' : 'read-only'}`,
        { createdChannelName: c.name },
        async () => { const made = await guild.channels.create({ name: c.name, type: ChannelType.GuildText, parent: c.parent?.id, topic: c.topic, permissionOverwrites: c.ow }); rollback.push({ deleteChannelId: made.id }); });
    }
    const kin = chan('kinetic-resources');
    if (kin) add(`RENAME #kinetic-resources -> #resources (we sell more than Kinetic)`, { channelId: kin.id, previousName: kin.name }, () => kin.setName('resources'));
    for (const [name, topic] of Object.entries(TOPICS)) {
      const ch = chan(name);
      if (ch && ch.topic !== topic) add(`#${name}: set topic`, { channelId: ch.id, previousTopic: ch.topic }, () => ch.setTopic(topic));
    }
  }

  // ---------------- PHASE 3 — ROLES (visible renames) -------------------------------------
  if (PHASE === 3) {
    for (const [from, to] of Object.entries(ROLE_RENAMES)) {
      const r = role(from);
      if (!r) { console.log(`  (skip) role "${from}" not found`); continue; }
      add(`RENAME role "${from}" -> "${to}"  (${r.members.size} members — they are the ${to.split('· ')[1]} crew)`,
        { roleId: r.id, previousName: from }, () => r.setName(to));
    }
    for (const name of STALE_ROLES) {
      const r = role(name);
      if (!r) continue;
      add(`ARCHIVE role "${name}" -> "zz · ${name.replace('Pulse · ', '')}" (${r.members.size} members, gates no channel)`,
        { roleId: r.id, previousName: name }, () => r.setName(`zz · ${name.replace('Pulse · ', '')}`));
    }
  }

  // ---------------- PHASE 4 — SECURITY ----------------------------------------------------
  if (PHASE === 4) {
    for (const [name, perms] of [['Pulse', PULSE_PERMS], ['Sapphire', SAPPHIRE_PERMS], ['Bot', PULSE_PERMS]]) {
      const r = role(name);
      if (!r) continue;
      if (!r.permissions.has(F.Administrator)) { console.log(`  (skip) "${name}" already has no Administrator`); continue; }
      add(`"${name}" role: REMOVE Administrator -> grant only [${perms.join(', ')}]`,
        { roleId: r.id, previousPermissions: r.permissions.bitfield.toString() },
        () => r.setPermissions(perms.map((p) => F[p])));
    }
    if (everyone.permissions.has(F.CreateInstantInvite)) {
      add(`@everyone: REMOVE CreateInstantInvite (${(Array.isArray(require('../discord-audit.json').invites) ? require('../discord-audit.json').invites.length : '?')} open invites exist, made by 10 different people)`,
        { roleId: everyone.id, previousPermissions: everyone.permissions.bitfield.toString() },
        () => everyone.setPermissions(everyone.permissions.remove(F.CreateInstantInvite)));
    }
  }

  // ---------------- PHASE 5 — BOT POSTING RIGHTS (required by phase 4) ---------------------
  // Read-only channels deny SendMessages to @everyone, and that deny applies to bots too. Until
  // phase 4 the bots bypassed it with Administrator; the moment that is removed they go silent in
  // exactly the channels they exist to post in. These per-channel allows replace what Admin was
  // doing, without handing back a server-wide permission.
  if (PHASE === 5) {
    const bots = guild.members.cache.filter((m) => m.user.bot);
    const pulseBot = bots.find((m) => m.user.username === 'Pulse');
    const sapphire = bots.find((m) => m.user.username === 'Sapphire');
    const grant = (bot, names, why) => {
      if (!bot) return;
      for (const n of names) {
        const ch = chan(n);
        if (!ch) { console.log(`  (skip) #${n} not found`); continue; }
        add(`#${n}: allow ${bot.user.username} to post — ${why}`,
          { channelId: ch.id, memberId: bot.id, previous: ch.permissionOverwrites.cache.get(bot.id)?.allow.toArray() ?? null },
          () => ch.permissionOverwrites.edit(bot.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true, AttachFiles: true, ReadMessageHistory: true }));
      }
    };
    grant(sapphire, ['pulse-help'], 'posts the welcome message for every new member');
    grant(pulseBot, ['leaderboard', 'pulse-help'], 'posts standings into read-only channels');
  }

  // ---------------- PHASE 6 — PROMOTIONS + #management cleanup ----------------------------
  // Owner-confirmed 2026-07-28. Ben Edwards and Jacob Arnold are already sub-managers in payroll
  // (CLAUDE.md §4 dual-identity list); Steezydlo and iQRexy promoted on the owner's call. Once all
  // eight #management readers hold the Manager role, every per-person overwrite is redundant —
  // strip them so access is role-based and legible.
  if (PHASE === 6) {
    const PROMOTE = ['bedwar26', 'jmaneski.', 'litty29012', 'iqrexy_37266'];
    for (const name of PROMOTE) {
      const m = guild.members.cache.find((x) => x.user.username === name);
      if (!m) { console.log(`  (skip) ${name} not in server`); continue; }
      if (m.roles.cache.has(manager.id)) { console.log(`  (skip) ${name} already Manager`); continue; }
      add(`PROMOTE ${name} ("${m.displayName}") -> Manager`,
        { memberId: m.id, removeRoleId: manager.id }, () => m.roles.add(manager));
    }
    const mgmt = chan('management');
    if (mgmt) {
      for (const [id, ow] of mgmt.permissionOverwrites.cache) {
        if (ow.type !== 1) continue; // member overwrites only
        const m = guild.members.cache.get(id);
        if (!m) continue;
        add(`#management: remove per-person overwrite for ${m.user.username} (only if Manager role actually landed)`,
          { channelId: mgmt.id, memberId: id, previous: ow.allow.toArray() },
          async () => {
            // Re-read at RUN time. The first version of this checked "is this person in the
            // PROMOTE list" while building the plan — i.e. it trusted an intent, not an outcome.
            // The promotions then failed (Manager sits above the bot in the role hierarchy, so a
            // bot can never grant it) and the removals still ran, locking four people out of the
            // channel this phase was supposed to tidy. Only a role the member DEMONSTRABLY holds
            // right now may justify dropping their overwrite.
            const fresh = await guild.members.fetch({ user: id, force: true });
            if (!fresh.roles.cache.has(manager.id) && !fresh.permissions.has(F.Administrator)) {
              throw new Error(`${m.user.username} does not hold Manager — overwrite KEPT (removing it would lock them out)`);
            }
            await mgmt.permissionOverwrites.delete(id);
          });
      }
    }
  }

  // ---------------- PHASE 7 — remove dormant members --------------------------------------
  // Owner-confirmed 2026-07-28. These three joined 57-73 days ago and never posted a single
  // message anywhere in the server. KICK, not ban — they can be re-invited if that was wrong.
  // NOTE: a kick is NOT undone by the rollback file. The tag + id are recorded so you can send
  // them a fresh invite, but Discord has no "un-kick".
  if (PHASE === 7) {
    for (const name of ['dmassey1', 'maxk7748', 'luckysp0220']) {
      const m = guild.members.cache.find((x) => x.user.username === name);
      if (!m) { console.log(`  (skip) ${name} not in server`); continue; }
      if (m.roles.cache.some((r) => ['Owner', 'Manager'].includes(r.name))) { console.log(`  (skip) ${name} holds a leadership role — refusing to kick`); continue; }
      add(`KICK ${name} ("${m.displayName}", id ${m.id}, joined ${m.joinedAt.toISOString().slice(0, 10)}, 0 messages) — NOT reversible`,
        { kickedUserTag: m.user.tag, kickedUserId: m.id, note: 're-invite manually if this was wrong' },
        () => m.kick('Dormant: never posted, no market role (owner-approved cleanup 2026-07-28)'));
    }
  }

  // ---------------- report / execute ------------------------------------------------------
  console.log(`\n=== PHASE ${PHASE} — ${APPLY ? '⚡ APPLYING' : 'DRY RUN (nothing will change)'} ===\n`);
  if (!plan.length) console.log('  Nothing to do — already in the target state.');
  plan.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.label}`));

  if (PHASE === 1) {
    const live = ['Pulse · New York', 'Pulse · Newark', 'Pulse · 🛜somerset', 'Pulse · Jacksonville'];
    const stranded = [...guild.members.cache.values()].filter((m) => !m.user.bot)
      .filter((m) => ![...blitz().values()].some((c) => c.permissionsFor(m)?.has(F.ViewChannel)));
    console.log(`\n  ⚠ NEEDS YOU — ${stranded.length} people cannot see any blitz channel. Assign each a market role:`);
    stranded.forEach((m) => console.log(`     ${m.user.username.padEnd(24)} currently: ${[...m.roles.cache.values()].map((r) => r.name).filter((n) => n.startsWith('Pulse · ')).join(', ') || 'NO MARKET ROLE'}`));
    console.log(`     (live market roles: ${live.join(', ')})`);
    const mgmt = chan('management');
    if (mgmt) {
      const wrong = [...guild.members.cache.values()].filter((m) => !m.user.bot)
        .filter((m) => mgmt.permissionsFor(m)?.has(F.ViewChannel))
        .filter((m) => !m.roles.cache.some((r) => r.name === 'Manager' || r.name === 'Owner'));
      console.log(`\n  ⚠ NEEDS YOU — ${wrong.length} non-Managers can read #management. Promote or remove:`);
      wrong.forEach((m) => console.log(`     ${m.user.username}`));
    }
  }

  if (!APPLY) {
    console.log(`\n  Nothing changed. To apply:  node scripts/restructure-discord.js --phase=${PHASE} --apply\n`);
    await client.destroy();
    return;
  }

  const file = path.resolve(__dirname, '..', `discord-rollback-phase${PHASE}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ phase: PHASE, at: new Date().toISOString(), steps: plan.map((s) => s.undo) }, null, 2));
  console.log(`\n  rollback written to ${path.basename(file)}`);
  for (const [i, s] of plan.entries()) {
    try { await s.run(); console.log(`  ✓ ${i + 1}. ${s.label}`); }
    catch (e) { console.error(`  ✗ ${i + 1}. ${s.label}\n      ${e.message}`); }
  }
  if (rollback.length) fs.writeFileSync(file, JSON.stringify({ phase: PHASE, at: new Date().toISOString(), steps: [...plan.map((s) => s.undo), ...rollback] }, null, 2));
  console.log(`\n  Phase ${PHASE} done.${PHASE === 4 ? '\n  ⚠ TEST PULSEBOT NOW — post "1g" in a blitz channel and confirm it logs and deletes.' : ''}`);
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
