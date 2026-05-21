# Package leaderboard + channel config for Railway volume restore.
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "restore-bundle"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$files = @(
  "leaderboard.json",
  "approved-blitz-channels.json",
  "leaderboard_archive.json"
)

foreach ($name in $files) {
  $src = Join-Path $root $name
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $out $name) -Force
    Write-Host "Copied $name"
  } else {
    Write-Host "Skip (missing): $name"
  }
}

node -e @"
const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'restore-bundle', 'leaderboard.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const logs = (d.logs || []).filter((l) => !l.removed && !l.removedAt && !l.deletedAt && !l.voidedAt);
const today = new Date().toISOString().slice(0, 10);
const todayN = logs.filter((l) => (l.date || l.timestamp?.slice(0, 10)) === today).length;
const weekId = d.metadata?.weekId;
const weekN = logs.filter((l) => l.weekId === weekId).length;
console.log('');
console.log('Restore bundle summary:');
console.log('  weekId:', weekId);
console.log('  total active logs:', logs.length);
console.log('  logs this calendar day (UTC date):', todayN);
console.log('  logs on current weekId:', weekN);
"@

Write-Host ""
Write-Host "Upload everything in restore-bundle/ to your Railway volume at /data"
Write-Host "Then set PULSE_DATA_DIR=/data and redeploy (or restart) Pulse."
