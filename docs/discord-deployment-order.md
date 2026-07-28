# Deployment order — two-stage, Phase 2

The backfill script only exists on Railway once the commit containing it is deployed. Scoped
enforcement therefore CANNOT ship enabled — it would deny all nine managers before any assignment
exists. Stage A installs capability with enforcement held; Stage B turns it on.

---

## Stage A — install capability, enforcement HELD

Manager-scoped commands return a maintenance message. Owner commands work. Managers are **never**
granted global access as a fallback.

**A1.** Approve rows in `docs/manager-backfill-review.json` (set `"approved": true`).
Editing `proposedAssignments` invalidates the checksum and forces a fresh preview — that is intended.

**A2.** Railway → Variables:
```
MANAGER_ROLE_ID          = 1504351060674740255
MANAGER_SCOPING_ENABLED  = false
```

**A3.** Push:
```
git push
```

**A4.** Confirm startup. Railway logs must show:
```
--- Pulse configuration ---
  GUILD             1504331970916909106  "FiberSales HQ"
  MANAGER_ROLE_ID   1504351060674740255  "Manager"
  ⚠ Role "Manager" (MANAGER_ROLE_ID) sits at or above Pulse's highest role — …
  ✓ configuration valid
```
`✗ CONFIGURATION INVALID` means stop — permission reconciliation is skipped by design.

**A5.** Create Wilmington (Owner-only) BEFORE any assignment references it:
```
node scripts/create-market-wilmington.js --state=NC --provider="T-Fiber"          # preview
node scripts/create-market-wilmington.js --state=NC --provider="T-Fiber" --apply  # create
```
Verify: `/market list` shows Wilmington (`wilmington-nc`), restart Pulse, confirm it survives.

**A6.** Run the backfill **on Railway** (it needs the real /data volume):
```
node scripts/backfill-manager-assignments.js                     # preview, changes nothing
node scripts/backfill-manager-assignments.js --apply --confirm   # applies ONLY approved rows
```
Apply refuses if: a user left, the Manager role changed, a market was archived, a reviewed market
role vanished, the file was edited after approval, or the live store changed since the preview.

**A7.** Verify:
```
/market manager-list market:Jacksonville      → expect 4 managers
/market manager-markets user:@hennysells      → expect inman, kannapolis, jacksonville
```

**A8.** Apply Wilmington assignments (managers first, then reps):
```
/market manager-add user:@headcalebebay305 market:wilmington-nc
/market manager-add user:@bedwar26         market:wilmington-nc
/market manager-add user:@elitekill6996    market:wilmington-nc
/market add rep:@trippb23.    name:"Tripp Barnes"     market:wilmington-nc
/market add rep:@malakai_0914 name:"Malakai Shepherd" market:wilmington-nc
```
Each rep move REMOVES their Jacksonville role — that is the intended exclusive behaviour.

**A9.** Export off-volume — the /data backups die with the volume:
```
node scripts/export-assignments.js --out "<somewhere private, NOT the repo>"
```

**A10.** Dry-run reconciliation before any enforcement:
```
node scripts/phase2-live-fixes.js --all        # 22 changes, applies nothing
```

### Stage A rollback
Set `MANAGER_SCOPING_ENABLED=false` (already false) → nothing to undo.
Code: `git revert f5d8d19 d24d596 && git push`.
Assignments: restore `managerUserIds` from `manager-assignments-backup-*.json`.

---

## Stage B — enable enforcement

**B1.** Readiness must pass before flipping the flag. Expected once A5 succeeds:
```
ready: true · activeMarkets: 4 · assignedMarkets: 4 · stale: []
```

**B2.** Railway → `MANAGER_SCOPING_ENABLED = true` → redeploy.

**B3.** Test Wilmington specifically: Caleb, Ben and Jonah can each run `/market status market:wilmington-nc` and are REFUSED on `jacksonville`; Tripp and Malakai see #🛜wilmington and no longer see #🛜jacksonville.

**B4.** Test all nine (table in `discord-manager-approval.md`): each manager runs `/market list`
and sees exactly their markets; `/market status` on an unassigned market is refused.

**B5.** Only after B3 and B4 pass, apply the permission fixes:
```
node scripts/phase2-live-fixes.js --leadership --invites --apply   # DESTRUCTIVE
```

### Stage B rollback
`MANAGER_SCOPING_ENABLED=false` → redeploy. Scoped commands return to safe-hold within one restart;
assignments are untouched.

---

## Ongoing: a manager leaving does NOT break the others

Before activation a departed assignee blocks readiness — the reviewed backfill no longer matches
reality. After activation it is flagged, not fatal:

- the stale user gets no authority (authorisation reads the record; they never invoke anything)
- the other eight keep working
- `assessScopeReadiness().remediation` prints the exact fix
- Owner removes it by id: `/market manager-remove user:<id> market:<market>`
- no reassignment is ever inferred

Corrupt storage still blocks all scoped authorisation — one stale row does not.

---

## Still blocked after Stage B

Market cleanup (`docs/discord-market-cleanup-impact.md`) · Ashtabula rename · `#pulse-commands`
rename · Pulse least-privilege (`discord-roles-and-commands.md` §4) · Sapphire removal.
Each has its own preview and rollback. None run in Phase 2.
