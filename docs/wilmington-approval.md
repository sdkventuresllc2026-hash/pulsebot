# Final rollout — Wilmington & Jacksonville

2026-07-28. Owner decisions **final**. All `approved` fields remain `false` until the reviewed
apply step. Nothing created, nothing pushed.

`wilmington-nc` is a **Pulse operational identifier**, not a FiberSales.co Prisma `Market` id.
T-Fiber order data reaches FiberSales.co via the separate Palmetto integration —
`docs/palmetto-mapping-contract.md`.

---

## Final target assignments

| Manager | Username | User ID | Markets |
|---|---|---|---|
| Caleb Head | `headcalebebay305` | `373653162042720266` | **Wilmington** |
| Ben Edwards | `bedwar26` | `949541784126648330` | **Wilmington** |
| Jonah McKinnon | `elitekill6996` | `699672451344236645` | **Wilmington** |
| Jacob Arnold | `jmaneski.` | `1234228856555045015` | Jacksonville |
| Alex Minter | `agm757` | `1464879769756893270` | Jacksonville 🔴 *needs Manager role* |
| Henry Sells | `hennysells` | `1504984792758751423` | **Inman, Kannapolis, Jacksonville** (all retained) |
| Blake Lipson | `blakelipson001` | `521846693130534915` | Ashtabula |
| Deven Topa | `deventopa696969` | `997526910827495486` | Ashtabula |
| D'Angelo Simmons | `litty29012` | `927499597453078589` | Kannapolis |
| Rex Ranck | `iqrexy_37266` | `1475356377760272505` | Kannapolis |

| Rep | Username | User ID | From → To |
|---|---|---|---|
| Tripp Barnes | `trippb23.` | `1296303439084650552` | Jacksonville → **Wilmington** · T-Fiber $275 ✅ |
| Malakai Shepherd | `malakai_0914` | `459667932914515969` | Jacksonville → **Wilmington** · 🔴 **payout setup incomplete** |

**Clean cut.** Caleb, Ben, Jonah, Tripp and Malakai retain **no** Jacksonville access. No temporary
unbacked roles; reconciliation runs normally.

**Jacksonville reps retained (9):** `jrhea75` · `sirnaan.` · `kkmx5` · `eli2smovee` ·
`rileeeey0859` · `caydensharp` · `_.fenfen._4396` · `heath_whitehead` · `jadin9400`

---

## Expected permission diff

| Member | Role change | Channel effect |
|---|---|---|
| Caleb, Ben, Jonah | `Pulse · Jacksonville` → `Pulse · Wilmington` | lose `#🛜jacksonville`, gain `#🛜wilmington` |
| Tripp, Malakai | same | same |
| Henry Sells | **none** | keeps all three |
| Alex Minter | **gains `Manager`** (manual) | unchanged |
| Jacob, Blake, Deven, D'Angelo, Rex | none | none |

Server-wide: `#management` loses Pro/Vet/Rookie · all 13 market roles lose `CreateInstantInvite` ·
`#🛜ashtabuhla` → `#🛜ashtabula` · `#pulse-help` → `#pulse-commands` · Virginia + Greenville markets
deleted.

New `#🛜wilmington`: `@everyone` deny ViewChannel · `Pulse · Wilmington` allow
View/Send/History/AppCommands · Pulse technical access · no invite permission · generic Manager
role **not** granted.

---

## Malakai — flagged, not fixed

| | |
|---|---|
| T-Fiber stack | **$0** |
| Reserve rate | 0 |
| paySetupComplete | **false** |

He gets full Wilmington Discord access. The payout issue is handed to the Palmetto/payroll work —
see `docs/palmetto-mapping-contract.md`. It does not block this rollout, and it stays visible.

---

## Rollback

| Change | Undo |
|---|---|
| Market created | `wilmington-rollback-*.json` has role + channel ids; delete both, then `/market cleanup` |
| Manager assignment | `/market manager-remove user:<id> market:<market>` |
| Rep move | `/market add rep:@… name:"…" market:jacksonville` |
| Permission fixes | `discord-rollback-phase2fixes-*.json` |
| Virginia/Greenville | `/market create name:Virginia` (fresh ids; no history exists) |
| Assignments wholesale | `manager-assignments-backup-*.json`, `assignments-export-*.json` |
| Code | `git revert <hash> && git push` |
