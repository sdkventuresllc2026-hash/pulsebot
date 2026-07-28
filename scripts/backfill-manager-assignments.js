/**
 * One-time manager-assignment backfill. DRY RUN BY DEFAULT.
 *
 * Every active market currently has an empty `managerUserIds`, so deploying scoped manager
 * commands as-is would deny all nine managers. This proposes assignments from EVIDENCE and refuses
 * to guess: holding the generic Manager role proves someone is a manager, it does not prove WHICH
 * markets they run. Anything ambiguous is left unassigned for Owner review.
 *
 * Evidence, strongest first:
 *   E1  an explicit assignment already recorded          -> CONFIRMED (nothing to do)
 *   E2  they hold that market's Discord role             -> HIGH
 *   E3  they have effective view access to the channel   -> MEDIUM (could be Administrator)
 *   E4  they are the only manager with any tie to it     -> LOW
 *   --  nothing, or contradictory                        -> AMBIGUOUS, never auto-applied
 *
 * Flow:
 *   1. node scripts/backfill-manager-assignments.js                  → writes a review file
 *   2. edit docs/manager-backfill-review.json, set "approved": true
 *   3. node scripts/backfill-manager-assignments.js --apply --confirm → applies ONLY approved rows
 *
 * Apply mode: requires --confirm, is idempotent, backs up first, writes atomically (via
 * deal-channels), validates after writing, and prints a final diff.
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { listMarkets } = require('../deal-channels');
const A = require('../market-assignments');

/**
 * Owner-declared organisational changes. These SUPERSEDE role-derived evidence, because a Discord
 * role reflects where someone was, not where the org has decided they are going. Caleb, Ben and
 * Jonah still hold `Pulse · Jacksonville`, so inference alone would propose Jacksonville and
 * silently miss the Wilmington move.
 *
 * `replaces: true` means the proposal REPLACES their inferred markets rather than adding to them —
 * managing both Wilmington and Jacksonville is a separate Owner decision, never a default.
 */
const OWNER_OVERRIDES = {
  // userId -> { markets, replaces, reason }
  '373653162042720266': { markets: ['wilmington-nc'], replaces: true, reason: 'Owner 2026-07-28: moved to the new Wilmington market' }, // Caleb Head
  '949541784126648330': { markets: ['wilmington-nc'], replaces: true, reason: 'Owner 2026-07-28: moved to the new Wilmington market' }, // Ben Edwards
  '699672451344236645': { markets: ['wilmington-nc'], replaces: true, reason: 'Owner 2026-07-28: moved to the new Wilmington market' }, // Jonah McKinnon
  // Alex Minter backfills Jacksonville management. He does NOT hold the Discord Manager role, so
  // this assignment is inert until an Owner grants it — surfaced as a blocker, never auto-granted.
  '1464879769756893270': { markets: ['jacksonville'], replaces: true, reason: 'Owner 2026-07-28: Jacksonville manager after Caleb/Ben/Jonah move to Wilmington', requiresManagerRole: true }, // Alex Minter
  // Henry Sells is NARROWED to Jacksonville. His earlier three-market proposal is superseded and
  // must not be treated as still approved — Inman and Kannapolis need separate explicit approval.
  // He holds all three Discord roles today, so reconciliation will REMOVE two of them.
  '1504984792758751423': { markets: ['jacksonville'], replaces: true, reason: 'Owner 2026-07-28: Jacksonville only. Inman and Kannapolis are NOT approved and require a separate decision.' }, // Henry Sells
};

const APPLY = process.argv.includes('--apply');
const CONFIRM = process.argv.includes('--confirm');
const REVIEW = path.resolve(__dirname, '..', 'docs', 'manager-backfill-review.json');

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch(); await guild.members.fetch(); await guild.channels.fetch();

  const managerRole = guild.roles.cache.get(process.env.MANAGER_ROLE_ID) || guild.roles.cache.find((r) => r.name === 'Manager');
  if (!managerRole) throw new Error('Manager role not found — set MANAGER_ROLE_ID.');

  // Evidence MUST come from live Discord, not the local market file. Run from a laptop,
  // `listMarkets()` reads the repo copy — which is stale (Virginia/Greenville) because production
  // markets live on Railway's /data volume. Deriving them from the live `Pulse · <Market>` roles
  // and the channels they gate makes the preview correct wherever this is run.
  const localMarkets = listMarkets().filter((m) => m.active !== false);
  const discordMarkets = Array.from(guild.roles.cache.values())
    .filter((r) => r.name.startsWith('Pulse · '))
    .map((r) => {
      const name = r.name.replace('Pulse · ', '');
      const local = localMarkets.find((m) => m.roleId === r.id || m.marketName === name);
      const channels = Array.from(guild.channels.cache.values())
        .filter((c) => c.isTextBased?.() && c.permissionOverwrites?.cache?.has(r.id))
        .map((c) => c.id);
      return { marketId: local?.marketId ?? name.toLowerCase(), marketName: name, roleId: r.id, channelIds: channels, active: true, fromDiscord: !local };
    })
    .filter((m) => m.channelIds.length > 0); // a role gating no channel is not a live market

  const markets = discordMarkets.length ? discordMarkets : localMarkets;
  if (discordMarkets.length) {
    console.log(`(evidence source: live Discord — ${markets.length} market role(s) gating a channel)`);
    const unknown = markets.filter((m) => m.fromDiscord).map((m) => m.marketName);
    if (unknown.length) console.log(`(⚠ not in the local market file, so marketId is inferred: ${unknown.join(', ')} — verify against /market list before applying)\n`);
  }
  const byRoleId = new Map(markets.filter((m) => m.roleId).map((m) => [m.roleId, m]));

  const rows = [];
  const candidates = new Map(managerRole.members.map((m) => [m.id, m]));
  for (const uid of Object.keys(OWNER_OVERRIDES)) {
    if (candidates.has(uid)) continue;
    const m = guild.members.cache.get(uid);
    if (m) candidates.set(uid, m);   // owner-directed target who does not yet hold Manager
  }
  for (const member of candidates.values()) {
    if (member.user.bot) continue;
    const holdsManagerRole = member.roles.cache.has(managerRole.id);

    const heldMarketRoles = Array.from(member.roles.cache.keys()).filter((r) => byRoleId.has(r)).map((r) => byRoleId.get(r));
    const visible = markets.filter((m) => (m.channelIds || []).some((cid) => {
      const ch = guild.channels.cache.get(cid);
      return ch?.permissionsFor(member)?.has(PermissionsBitField.Flags.ViewChannel);
    }));
    const already = A.getManagerMarkets(member.id);

    /** @type {{marketId:string, evidence:string, confidence:string}[]} */
    const proposed = [];
    for (const m of markets) {
      if (already.includes(m.marketId)) { proposed.push({ marketId: m.marketId, evidence: 'E1 already recorded', confidence: 'ALREADY_RECORDED' }); continue; }
      if (heldMarketRoles.some((h) => h.marketId === m.marketId)) { proposed.push({ marketId: m.marketId, evidence: 'E2 holds the market role', confidence: 'ROLE_SUPPORTED' }); continue; }
      if (visible.some((v) => v.marketId === m.marketId)) proposed.push({ marketId: m.marketId, evidence: 'E3 effective channel access only', confidence: 'MEDIUM' });
    }

    // Administrator sees every channel, so E3 across the board proves nothing about scope.
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
    const onlyMedium = proposed.length > 0 && proposed.every((p) => p.confidence === 'MEDIUM');
    const conflicts = [];
    if (isAdmin && onlyMedium) conflicts.push('Administrator — channel visibility proves nothing about which markets they run');
    if (proposed.length === 0) conflicts.push('no market role and no channel access — cannot infer any market');
    if (!holdsManagerRole) conflicts.push('DOES NOT HOLD THE MANAGER ROLE — this assignment is inert until an Owner grants it. Owner action required; never granted automatically.');
    if (onlyMedium && proposed.length > 1) conflicts.push(`visible in ${proposed.length} markets with no role in any — cannot tell which they run`);

    let autoApplicable = proposed.filter((p) => p.confidence === 'ROLE_SUPPORTED');

    // An Owner-declared move outranks role-derived evidence, and REPLACES it — so the previous
    // market is not silently retained alongside the new one.
    const override = OWNER_OVERRIDES[member.id];
    if (override) {
      const displaced = autoApplicable.map((p) => p.marketId).filter((m) => !override.markets.includes(m));
      autoApplicable = override.markets.map((m) => ({ marketId: m, evidence: `OWNER OVERRIDE — ${override.reason}`, confidence: 'OWNER_DIRECTED' }));
      proposed.push(...autoApplicable);
      if (override.replaces && displaced.length) {
        conflicts.push(`Owner move REPLACES their role-derived market(s): ${displaced.join(', ')}. If they should ALSO keep ${displaced.join(', ')}, approve that separately — it is not a default.`);
      }
    }

    rows.push({
      userId: member.id,
      username: member.user.username,
      displayName: member.displayName,
      hasManagerRole: holdsManagerRole,
      managerRoleId: managerRole.id,
      marketRoleDetail: heldMarketRoles.map((m) => ({ marketId: m.marketId, marketName: m.marketName, roleId: m.roleId, active: m.active !== false })),
      roleAssignedAt: 'not exposed by the Discord API',
      isAdministrator: isAdmin,
      currentMarketRoles: heldMarketRoles.map((m) => m.marketId),
      effectiveMarketVisibility: visible.map((m) => m.marketId),
      alreadyRecorded: already,
      proposed,
      proposedAssignments: autoApplicable.map((p) => p.marketId),
      confidence: override ? 'OWNER_DIRECTED_REQUIRES_APPROVAL' : (autoApplicable.length ? 'ROLE_SUPPORTED_REQUIRES_OWNER_APPROVAL' : (proposed.length ? 'AMBIGUOUS' : 'NONE')),
      conflicts,
      approved: false, // Owner sets this to true after review.
      ownerOverride: override ?? null,
      note: autoApplicable.length ? '' : 'LEFT UNASSIGNED — requires an explicit Owner decision.',
    });
  }

  if (!APPLY) {
    fs.mkdirSync(path.dirname(REVIEW), { recursive: true });
    fs.writeFileSync(REVIEW, JSON.stringify({
      reviewFileVersion: 1,
      generatedAt: new Date().toISOString(),
      guildId: guild.id,
      managerRoleId: managerRole.id,
      instructions: 'Review each row. Set "approved": true and adjust "proposedAssignments" as needed. Then run with --apply --confirm. Rows left approved:false are skipped.',
      guild: guild.name, managerRole: managerRole.name, activeMarkets: markets.map((m) => m.marketId),
      managers: rows,
      // Covers userId + proposedAssignments only, so flipping approved to true stays valid while
      // editing the actual assignments invalidates the file and forces a fresh review.
      checksum: crypto.createHash('sha256').update(JSON.stringify(rows.map((r) => ({ userId: r.userId, proposedAssignments: r.proposedAssignments })))).digest('hex'),
      storeSnapshotChecksum: crypto.createHash('sha256').update(JSON.stringify(listMarkets().map((m) => ({ id: m.marketId, mgrs: (m.managerUserIds || []).slice().sort() })))).digest('hex'),
    }, null, 2));

    console.log(`\n=== MANAGER BACKFILL — DRY RUN (nothing changed) ===\n`);
    for (const r of rows) {
      console.log(`${r.confidence.includes('REQUIRES') ? '✅' : '⚠ '} ${r.displayName}  (${r.userId})`);
      console.log(`     roles: ${r.currentMarketRoles.join(', ') || '(none)'}   visible: ${r.effectiveMarketVisibility.join(', ') || '(none)'}${r.isAdministrator ? '   [ADMIN]' : ''}`);
      console.log(`     propose: ${r.proposedAssignments.join(', ') || '(nothing — needs your decision)'}`);
      r.proposed.forEach((p) => console.log(`       · ${p.marketId}: ${p.evidence} [${p.confidence}]`));
      r.conflicts.forEach((c) => console.log(`     ⚠ ${c}`));
      console.log('');
    }
    const auto = rows.filter((r) => r.confidence === 'ROLE_SUPPORTED_REQUIRES_OWNER_APPROVAL').length;
    console.log(`${rows.length} manager(s): ${auto} with role-supported evidence (still needs your approval), ${rows.length - auto} need your decision.`);
    console.log(`\nReview file -> docs/${path.basename(REVIEW)}`);
    console.log(`Approve rows there, then: node scripts/backfill-manager-assignments.js --apply --confirm\n`);
    await client.destroy();
    return;
  }

  // ---- APPLY --------------------------------------------------------------------------------
  if (!CONFIRM) { console.error('Refusing to apply without --confirm.'); process.exit(1); }
  if (!fs.existsSync(REVIEW)) { console.error(`No review file at ${REVIEW}. Run the dry run first.`); process.exit(1); }
  const review = JSON.parse(fs.readFileSync(REVIEW, 'utf8'));

  // APPLY USES ONLY THE APPROVED ROWS. The inference above already ran to build `rows`, but it is
  // deliberately discarded here: re-inferring at apply time would silently produce a different
  // result if a Discord role changed between review and execution, and the Owner would have
  // approved something other than what was written.
  const approved = (review.managers || []).filter((r) => r.approved === true && Array.isArray(r.proposedAssignments) && r.proposedAssignments.length);
  if (!approved.length) { console.error('No rows approved. Set "approved": true on the ones you accept.'); process.exit(1); }

  // --- staleness gate: refuse to apply a preview that no longer matches reality ---------------
  const stale = [];
  if (review.guildId && review.guildId !== guild.id) stale.push(`review was generated for guild ${review.guildId}, connected to ${guild.id}`);
  if (review.managerRoleId && review.managerRoleId !== managerRole.id) stale.push(`Manager role changed since review (${review.managerRoleId} -> ${managerRole.id})`);

  // Checksum covers only the reviewable payload, so setting approved:true does not invalidate it.
  if (review.checksum) {
    const canonical = JSON.stringify((review.managers || []).map((r) => ({ userId: r.userId, proposedAssignments: r.proposedAssignments })));
    const actual = crypto.createHash('sha256').update(canonical).digest('hex');
    if (actual !== review.checksum) stale.push('review file was modified after generation (checksum mismatch on userId/proposedAssignments)');
  }
  const liveMarketIds = new Set(markets.map((m) => m.marketId));
  for (const r of approved) {
    const member = guild.members.cache.get(r.userId);
    if (!member) { stale.push(`${r.userId} (${r.displayName || '?'}) has left the guild since review`); continue; }
    if (!member.roles.cache.has(managerRole.id)) stale.push(`${r.userId} no longer holds the Manager role`);
    for (const mid of r.proposedAssignments) {
      if (!liveMarketIds.has(mid)) stale.push(`${r.userId}: market "${mid}" is no longer active`);
    }
    for (const detail of r.marketRoleDetail || []) {
      if (!guild.roles.cache.has(detail.roleId)) stale.push(`${r.userId}: reviewed market role ${detail.roleId} (${detail.marketName}) no longer exists`);
    }
  }
  // The live store must also be unchanged since the preview.
  if (review.storeSnapshotChecksum) {
    const now = crypto.createHash('sha256')
      .update(JSON.stringify(listMarkets().map((m) => ({ id: m.marketId, mgrs: (m.managerUserIds || []).slice().sort() }))))
      .digest('hex');
    if (now !== review.storeSnapshotChecksum) stale.push('the live assignment store changed after the preview was generated');
  }
  if (stale.length) {
    console.error('\n✗ REFUSING TO APPLY — reviewed input is stale:');
    stale.forEach((s) => console.error(`   • ${s}`));
    console.error('\nRe-run the dry run, re-review, then apply.\n');
    process.exit(1);
  }

  const before = JSON.parse(JSON.stringify(listMarkets().map((m) => ({ marketId: m.marketId, managerUserIds: m.managerUserIds || [] }))));
  const backup = path.resolve(__dirname, '..', `manager-assignments-backup-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), markets: before }, null, 2));
  console.log(`backup -> ${path.basename(backup)}`);

  let applied = 0;
  for (const r of approved) {
    const member = guild.members.cache.get(r.userId);
    if (!member) { console.error(`  ✗ ${r.userId} not in guild — skipped`); continue; }
    if (member.user.bot) { console.error(`  ✗ ${r.userId} is a bot — skipped`); continue; }
    if (!member.roles.cache.has(managerRole.id)) { console.error(`  ✗ ${r.userId} no longer holds Manager — skipped`); continue; }
    for (const mid of r.proposedAssignments) {
      if (A.getManagerMarkets(r.userId).includes(mid)) { console.log(`  = ${r.userId} already manages ${mid}`); continue; }
      A.addManagerMarketAssignment(r.userId, mid);
      applied++;
      console.log(`  ✓ ${r.userId} -> ${mid}`);
    }
  }

  // Post-write validation + diff.
  const after = listMarkets().map((m) => ({ marketId: m.marketId, managerUserIds: m.managerUserIds || [] }));
  console.log(`\n--- diff ---`);
  for (const a of after) {
    const b = before.find((x) => x.marketId === a.marketId);
    const added = a.managerUserIds.filter((u) => !(b?.managerUserIds || []).includes(u));
    if (added.length) console.log(`  ${a.marketId}: +${added.length} manager(s) ${added.join(', ')}`);
  }
  console.log(`\n✓ ${applied} assignment(s) applied. Rollback: restore managerUserIds from ${path.basename(backup)}.\n`);
  await client.destroy();
})().catch((e) => { console.error('BACKFILL FAILED:', e); process.exit(1); });
