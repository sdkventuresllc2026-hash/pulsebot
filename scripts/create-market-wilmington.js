/**
 * Wilmington — Pulse OPERATIONAL market creation. DRY RUN BY DEFAULT, Owner-only.
 *
 * SCOPE BOUNDARY (owner decision 2026-07-28):
 *   · "wilmington-nc" is a PULSE OPERATIONAL IDENTIFIER. It is NOT a FiberSales.co Prisma
 *     Market id — those are cuid()s, and Pulse does not own that identity.
 *   · Jacksonville and Wilmington are T-Fiber markets whose ORDER DATA comes from Palmetto.
 *     FiberSales.co receives that data through a separate Palmetto integration built elsewhere.
 *   · This script does not touch FiberSales.co, Prisma, or the Palmetto importer. It manages
 *     Discord access and Pulse deal-channel activity only.
 *
 * Future-mapping fields are recorded now and left null — so the Palmetto integration has somewhere
 * to write when the real identifiers are known, without blocking Wilmington today.
 *
 *   node scripts/create-market-wilmington.js                      # preview
 *   node scripts/create-market-wilmington.js --apply              # create
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
const { listMarkets, normalizeMarketId } = require('../deal-channels');
const pulseConfig = require('../pulse-config');

const F = PermissionsBitField.Flags;
const APPLY = process.argv.includes('--apply');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || null;

const DISPLAY_NAME = 'Wilmington';
const CITY = 'Wilmington';
const STATE = arg('state') || 'NC';                    // owner-confirmed 2026-07-28
const PROVIDER = arg('provider') || 'T-Fiber';         // owner-confirmed 2026-07-28

// Pulse OPERATIONAL id — stable and readable, and stamped on Pulse deal logs. It is deliberately
// NOT a FiberSales.co Market cuid: Pulse does not own that identity. Still immutable once written,
// which is why it encodes the confirmed state rather than a guess (the Ashtabula/new-york lesson).
const MARKET_ID = 'wilmington-nc';

const CHANNEL_NAME = '🛜wilmington';   // matches the existing convention (🛜inman, 🛜kannapolis)
const ROLE_NAME = `Pulse · ${DISPLAY_NAME}`;
const TOPIC = 'Wilmington, North Carolina · T-Fiber (orders via Palmetto). Log every deal here — just post your speed: 1g, 2g, 2x 1g. Attach your order confirmation screenshot.';

/**
 * Future-mapping fields for the separate Palmetto integration. Written now, left null, so that
 * work has somewhere to record identifiers without a migration — and without blocking Wilmington
 * today on an identifier nobody has yet.
 */
const FUTURE_MAPPING = {
  sourceSystem: 'palmetto',
  externalMarketId: null,     // Palmetto market/office id — unknown until the importer runs
  externalMarketName: null,   // Palmetto's own label for this market
  lastImportedAt: null,       // set by the Palmetto integration, never by Pulse
};

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch(); await guild.channels.fetch(); await guild.members.fetch();

  const missing = [];
  if (!STATE) missing.push('--state   (e.g. --state=NC) — needed for the immutable id and reporting');
  if (!PROVIDER) missing.push('--provider (e.g. --provider="T-Fiber") — needed for comp and order entry');

  const existingRole = guild.roles.cache.find((r) => r.name === ROLE_NAME);
  const existingChannel = guild.channels.cache.find((c) => c.name === CHANNEL_NAME);
  const existingMarket = listMarkets().find((m) => m.marketName === DISPLAY_NAME || (MARKET_ID && m.marketId === MARKET_ID));
  const marketsCat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && /^(MARKETS|BLITZES)$/i.test(c.name));
  const managerRoleId = pulseConfig.managerRoleId();

  console.log(`\n=== CREATE MARKET "${DISPLAY_NAME}" — ${APPLY ? '⚡ APPLYING' : 'DRY RUN (nothing will change)'} ===\n`);
  console.log('  FIELDS');
  console.log(`    display name   ${DISPLAY_NAME}`);
  console.log(`    city           ${CITY}`);
  console.log(`    state          ${STATE ?? '⚠ PENDING — you must confirm'}`);
  console.log(`    provider       ${PROVIDER ?? '⚠ PENDING — you must confirm'}`);
  console.log(`    operational id ${MARKET_ID}   (Pulse id — NOT a FiberSales.co Market cuid)`);
  console.log(`    order source   Palmetto  (FiberSales.co receives T-Fiber data via the separate Palmetto integration)`);
  console.log(`    future mapping externalMarketId=null externalMarketName=null lastImportedAt=null`);
  console.log(`    active         ${missing.length ? 'false (PENDING config)' : 'true'}`);
  console.log(`    channel        #${CHANNEL_NAME}${existingChannel ? `  (EXISTS ${existingChannel.id})` : ''}`);
  console.log(`    role           ${ROLE_NAME}${existingRole ? `  (EXISTS ${existingRole.id})` : ''}`);
  console.log(`    category       ${marketsCat ? `${marketsCat.name} (${marketsCat.id})` : '⚠ no MARKETS/BLITZES category found'}`);

  if (missing.length) {
    console.log(`\n  ⚠ PENDING CONFIGURATION — cannot activate:`);
    missing.forEach((m) => console.log(`     • ${m}`));
    console.log(`     Channel and role may still be created as pending; the market stays inactive`);
    console.log(`     and Pulse will not log deals to it until both are supplied.`);
  }

  // Idempotency: duplicate creation must be safely rejected, never silently doubled.
  if (existingMarket) console.log(`\n  ⚠ A market named "${DISPLAY_NAME}" already exists (id ${existingMarket.marketId}) — creation would be REJECTED.`);
  if (existingRole && !existingMarket) console.log(`\n  ⚠ Role "${ROLE_NAME}" already exists — it would be REUSED, not duplicated.`);
  if (existingChannel && !existingMarket) console.log(`  ⚠ Channel #${CHANNEL_NAME} already exists — it would be REUSED, not duplicated.`);

  console.log(`\n  PERMISSION OVERWRITES (same shape as the other four markets)`);
  console.log(`    @everyone            deny ViewChannel`);
  console.log(`    ${ROLE_NAME}   allow View, Send, ReadHistory, UseAppCommands`);
  console.log(`    Pulse (bot)          allow View, Send, ReadHistory, ManageChannels, ManageRoles, ManageMessages`);
  console.log(`    Owner/Admin          via Administrator — no overwrite needed`);
  console.log(`    generic Manager role NOT granted — access is assignment-based`);
  console.log(`    CreateInstantInvite  NOT granted on the market role`);
  console.log(`    unrelated reps/mgrs  no visibility (denied by @everyone)`);

  console.log(`\n  PLANNED ASSIGNMENTS (applied separately, only after Owner approval)`);
  console.log(`    managers: Caleb Head, Ben Edwards, Jonah McKinnon`);
  console.log(`    reps:     Tripp Barnes, Malakai Shepherd  (moves them OFF Jacksonville)`);

  if (!APPLY) {
    console.log(`\n  Nothing changed.`);
    console.log(`  Complete config:  node scripts/create-market-wilmington.js --state=XX --provider="Name"`);
    console.log(`  Then apply:       node scripts/create-market-wilmington.js --state=XX --provider="Name" --apply\n`);
    await client.destroy();
    return;
  }

  if (existingMarket) { console.error('✗ Refusing: market already exists.'); process.exit(1); }
  if (missing.length) { console.error('✗ Refusing to APPLY with pending configuration. Supply --state and --provider.'); process.exit(1); }

  const rollback = { createdRoleId: null, createdChannelId: null, marketId: MARKET_ID };
  const role = existingRole || await guild.roles.create({ name: ROLE_NAME, mentionable: true, reason: `Pulse market role: ${DISPLAY_NAME}` });
  if (!existingRole) rollback.createdRoleId = role.id;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [F.ViewChannel] },
    { id: client.user.id, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.ManageChannels, F.ManageRoles, F.ManageMessages] },
    { id: role.id, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.UseApplicationCommands] },
  ];
  const channel = existingChannel || await guild.channels.create({
    name: CHANNEL_NAME, type: ChannelType.GuildText, parent: marketsCat?.id, topic: TOPIC, permissionOverwrites: overwrites,
  });
  if (!existingChannel) rollback.createdChannelId = channel.id;

  const { addMarket, connectChannelToMarket, updateMarket } = require('../deal-channels');
  addMarket({ marketName: DISPLAY_NAME, marketId: MARKET_ID, isp: PROVIDER, createdBy: 'owner-script' });
  updateMarket(MARKET_ID, { ...FUTURE_MAPPING });
  updateMarket(MARKET_ID, { roleId: role.id, city: CITY, state: STATE, active: true, managerUserIds: [], repUserIds: [] });
  connectChannelToMarket({ channel, marketId: MARKET_ID, connectedBy: 'owner-script' });

  const file = path.resolve(__dirname, '..', `wilmington-rollback-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(rollback, null, 2));
  console.log(`\n✓ Created market ${MARKET_ID} · role ${role.id} · channel ${channel.id}`);
  console.log(`  rollback -> ${path.basename(file)}`);
  console.log(`  Next: /market manager-add for each approved manager, then /market add for each rep.\n`);
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
