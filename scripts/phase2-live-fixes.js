/**
 * Phase 2 live fixes — DRY RUN BY DEFAULT. Nothing changes without --apply.
 *
 * Each fix is independently selectable so a failure in one cannot half-apply another:
 *   --leadership   remove Pro/Vet/Rookie from #management (category AND channel)
 *   --invites      remove CreateInstantInvite from every market role
 *   --ashtabula    rename #🛜ashtabuhla -> #🛜ashtabula   (channel ID unchanged)
 *   --pulse-cmds   rename #pulse-help -> #pulse-commands  (channel ID unchanged)
 *   --export       export #pulse-help messages + attachment URLs BEFORE any purge
 *   --all          every fix above (still dry run unless --apply is also passed)
 *
 * NOT included on purpose: the message purge, market cleanup, Pulse least-privilege and Sapphire
 * removal. Those are gated on acceptance tests and, in two cases, are manual actions.
 *
 *   node scripts/phase2-live-fixes.js --all
 *   node scripts/phase2-live-fixes.js --leadership --apply
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;
const APPLY = process.argv.includes('--apply');
const want = (flag) => process.argv.includes('--all') || process.argv.includes(flag);

// Recognition-only roles. Owner decision 2026-07-28: these are gamification labels and must never
// control access to leadership, pay, market channels or commands.
const RECOGNITION_ROLES = ['Pro', 'Vet', 'Rookie', 'Elite', 'Senior Rep'];

const plan = [];
const rollback = [];
const add = (label, undo, run) => plan.push({ label, undo, run });

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch(); await guild.roles.fetch(); await guild.members.fetch();

  const chan = (n) => guild.channels.cache.find((c) => c.name === n);
  const cat = (n) => guild.channels.cache.find((c) => c.type === 4 && c.name.toUpperCase() === n.toUpperCase());

  // ---- 1. leadership privacy ---------------------------------------------------------------
  if (want('--leadership')) {
    const targets = [cat('LEADERSHIP'), chan('management'), chan('pay-and-ops')].filter(Boolean);
    for (const t of targets) {
      for (const roleName of RECOGNITION_ROLES) {
        const role = guild.roles.cache.find((r) => r.name === roleName);
        if (!role) continue;
        const ow = t.permissionOverwrites.cache.get(role.id);
        if (!ow) continue;
        const holders = role.members.size;
        add(`${t.name}: remove "${roleName}" overwrite (allow=[${ow.allow.toArray().join(',')}]) — ${holders} member(s) lose access`,
          { channelId: t.id, roleId: role.id, previousAllow: ow.allow.toArray(), previousDeny: ow.deny.toArray() },
          () => t.permissionOverwrites.delete(role.id, 'Recognition roles must not grant leadership access'));
      }
    }
  }

  // ---- 2. invite lock ----------------------------------------------------------------------
  if (want('--invites')) {
    for (const role of guild.roles.cache.values()) {
      if (!/^(Pulse · |zz · )/.test(role.name)) continue;
      if (!role.permissions.has(F.CreateInstantInvite)) continue;
      add(`role "${role.name}" (${role.members.size} members): remove CreateInstantInvite`,
        { roleId: role.id, previousPermissions: role.permissions.bitfield.toString() },
        () => role.setPermissions(role.permissions.remove(F.CreateInstantInvite)));
    }
  }

  // ---- 3. Ashtabula spelling ---------------------------------------------------------------
  // Channel IDs never change on rename, so nothing that references this channel breaks. The
  // market's internal id stays `new-york` on purpose — it is stamped on every historical deal log.
  if (want('--ashtabula')) {
    const ch = guild.channels.cache.find((c) => /ashtabuhla/i.test(c.name || ''));
    if (ch) add(`rename #${ch.name} -> #${ch.name.replace(/ashtabuhla/i, 'ashtabula')} (id ${ch.id} unchanged)`,
      { channelId: ch.id, previousName: ch.name }, () => ch.setName(ch.name.replace(/ashtabuhla/i, 'ashtabula')));
    else console.log('  (skip) no channel matching "ashtabuhla"');
  }

  // ---- 4. pulse-help -> pulse-commands ------------------------------------------------------
  if (want('--pulse-cmds')) {
    const ch = chan('pulse-help');
    if (ch) {
      add(`rename #pulse-help -> #pulse-commands (id ${ch.id} unchanged)`,
        { channelId: ch.id, previousName: ch.name }, () => ch.setName('pulse-commands'));
      add(`#pulse-commands: set topic`, { channelId: ch.id, previousTopic: ch.topic },
        () => ch.setTopic('Bot commands and system messages only. Ask a human in #ask-anything.'));
    } else console.log('  (skip) #pulse-help not found');
  }

  // ---- 5. export before any purge ------------------------------------------------------------
  // Runs even in dry run: preserving content is never destructive, and the purge must never be
  // possible before an export exists.
  if (want('--export')) {
    const ch = chan('pulse-help') || chan('pulse-commands');
    if (ch) {
      const out = [];
      let before;
      for (let page = 0; page < 10; page++) {
        const msgs = await ch.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!msgs.size) break;
        for (const m of msgs.values()) {
          out.push({
            id: m.id, at: m.createdAt.toISOString(), author: m.author.username, bot: m.author.bot,
            content: m.content || '',
            attachments: Array.from(m.attachments.values()).map((a) => ({ name: a.name, url: a.url, size: a.size })),
            embeds: m.embeds.length,
          });
        }
        before = msgs.last()?.id;
      }
      const file = path.resolve(__dirname, '..', 'docs', `pulse-help-export-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ channel: ch.name, channelId: ch.id, exportedAt: new Date().toISOString(), messages: out }, null, 2));
      const human = out.filter((m) => !m.bot);
      const withFiles = out.filter((m) => m.attachments.length);
      console.log(`\n  📦 exported ${out.length} message(s) -> docs/${path.basename(file)}`);
      console.log(`     ${human.length} human message(s), ${withFiles.length} with attachments`);
      if (human.length) human.forEach((m) => console.log(`       KEEP? ${m.at.slice(0, 10)} ${m.author}: ${m.content.slice(0, 80)}`));
      console.log(`     ⚠ attachment URLs expire — download anything you need before purging.\n`);
    }
  }

  // ---- report / execute ----------------------------------------------------------------------
  console.log(`=== PHASE 2 LIVE FIXES — ${APPLY ? '⚡ APPLYING' : 'DRY RUN (nothing will change)'} ===\n`);
  if (!plan.length) console.log('  Nothing to do (already applied, or no fix selected — try --all).');
  plan.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.label}`));

  if (!APPLY) {
    console.log(`\n  Nothing changed. Add --apply to execute.\n`);
    await client.destroy();
    return;
  }
  const file = path.resolve(__dirname, '..', `discord-rollback-phase2fixes-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), steps: plan.map((s) => s.undo) }, null, 2));
  console.log(`\n  rollback -> ${path.basename(file)}`);
  for (const [i, s] of plan.entries()) {
    try { await s.run(); console.log(`  ✓ ${i + 1}. ${s.label}`); }
    catch (e) { console.error(`  ✗ ${i + 1}. ${s.label}\n      ${e.message}`); }
  }
  if (rollback.length) fs.writeFileSync(file, JSON.stringify({ steps: [...plan.map((s) => s.undo), ...rollback] }, null, 2));
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
