/**
 * READ-ONLY. Executes assessScopeReadiness() against live Discord + the live assignment store.
 *
 * Run this BEFORE setting MANAGER_SCOPING_ENABLED=true. Exits 0 when ready, 1 when not, so it can
 * gate a deploy step.
 *
 *   node scripts/check-scope-readiness.js
 */
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { listMarkets, isStoreCorrupt } = require('../deal-channels');
const { assessScopeReadiness } = require('../command-policy');
const pulseConfig = require('../pulse-config');

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch(); await guild.members.fetch();

  const cfg = await pulseConfig.validateAgainstGuild(guild);
  const managerRoleId = pulseConfig.managerRoleId();
  const managerRole = managerRoleId ? guild.roles.cache.get(managerRoleId) : null;

  const guildMembers = new Map(
    guild.members.cache.map((m) => [m.id, { bot: m.user.bot, hasManagerRole: Boolean(managerRole && m.roles.cache.has(managerRole.id)) }]),
  );
  const markets = listMarkets();
  const r = assessScopeReadiness({ guildMembers, markets, managerRoleIdValid: cfg.ok && Boolean(managerRole) });

  console.log('\n=== SCOPE READINESS ===\n');
  console.log(`  MANAGER_ROLE_ID valid       ${cfg.ok && managerRole ? 'PASS' : 'FAIL'}  ${managerRole ? `"${managerRole.name}" ${managerRole.id}` : '(unresolved)'}`);
  console.log(`  assignment store readable   ${isStoreCorrupt() ? 'FAIL' : 'PASS'}`);
  console.log(`  active markets              ${r.activeMarkets}`);
  console.log(`  markets with a manager      ${r.assignedMarkets}`);
  console.log(`  assignees present in guild  ${r.errors.some((e) => e.includes('no longer in the guild')) ? 'FAIL' : 'PASS'}`);
  console.log(`  assignees hold Manager      ${r.warnings.some((w) => w.includes('no longer holds')) ? 'WARN' : 'PASS'}`);
  console.log(`  no bot holds authority      ${r.errors.some((e) => e.includes('is a bot')) ? 'FAIL' : 'PASS'}`);

  for (const m of markets.filter((x) => x.active !== false)) {
    const ids = m.managerUserIds || [];
    console.log(`\n  ${m.marketId.padEnd(16)} ${ids.length} manager(s)${ids.length ? ': ' + ids.join(', ') : '  <-- none'}`);
  }
  if (r.warnings.length) { console.log('\n  WARNINGS'); r.warnings.forEach((w) => console.log(`    ⚠ ${w}`)); }
  if (r.errors.length) { console.log('\n  ERRORS'); r.errors.forEach((e) => console.log(`    ✗ ${e}`)); }
  if (r.remediation?.length) { console.log('\n  FIX WITH'); r.remediation.forEach((c) => console.log(`    ${c}`)); }

  console.log(`\n  ${r.ready ? '✓ READY — safe to set MANAGER_SCOPING_ENABLED=true' : '✗ NOT READY — do not enable scoping'}\n`);
  await client.destroy();
  process.exit(r.ready ? 0 : 1);
})().catch((e) => { console.error('READINESS CHECK FAILED:', e); process.exit(1); });
