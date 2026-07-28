/**
 * READ-ONLY canonical export of the assignment store, for off-volume recovery.
 *
 * Railway's /data volume is durable against restarts but NOT against volume deletion or project
 * loss. Timestamped backups live on the same volume, so they die with it. This produces a single
 * checksummed artefact you keep somewhere else.
 *
 * PRIVATE OPERATIONAL DATA — Discord user ids. Write it outside the repo, or to a git-ignored
 * path. Never commit it to a public repository.
 *
 *   node scripts/export-assignments.js
 *   node scripts/export-assignments.js --out "C:/private/pulse-assignments.json"
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { listMarkets, ASSIGNMENT_SCHEMA_VERSION, isStoreCorrupt, APPROVED_CHANNELS_PATH } = require('../deal-channels');

const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? process.argv[outArg + 1] : path.resolve(__dirname, '..', `assignments-export-${Date.now()}.json`);

if (isStoreCorrupt()) { console.error(`✗ Refusing to export an unreadable store: ${isStoreCorrupt()}`); process.exit(1); }

const markets = listMarkets().map((m) => ({
  marketId: m.marketId, marketName: m.marketName, active: m.active !== false,
  roleId: m.roleId ?? null, channelIds: m.channelIds ?? [],
  repUserIds: m.repUserIds ?? [], managerUserIds: m.managerUserIds ?? [],
}));

const payload = { schemaVersion: ASSIGNMENT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), sourcePath: APPROVED_CHANNELS_PATH, markets };
const canonical = JSON.stringify(payload.markets);
payload.checksum = crypto.createHash('sha256').update(canonical).digest('hex');
payload.counts = {
  markets: markets.length,
  activeMarkets: markets.filter((m) => m.active).length,
  managerAssignments: markets.reduce((n, m) => n + m.managerUserIds.length, 0),
  repAssignments: markets.reduce((n, m) => n + m.repUserIds.length, 0),
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`✓ exported -> ${OUT}`);
console.log(`  schema v${payload.schemaVersion} · ${payload.counts.markets} markets · ${payload.counts.managerAssignments} manager + ${payload.counts.repAssignments} rep assignment(s)`);
console.log(`  sha256 ${payload.checksum}`);
console.log(`\n  RECOVERY: copy this file to <PULSE_DATA_DIR>/approved-blitz-channels.json shape, or replay`);
console.log(`  each managerUserIds entry with /market manager-add. Verify the checksum first.`);
