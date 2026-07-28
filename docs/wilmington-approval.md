# Wilmington & Jacksonville — approval artifact

2026-07-28, **final owner decisions applied**. Every `approved` field is still **false**.
Nothing created, nothing pushed, no live changes.

`wilmington-nc` is a **Pulse operational identifier**, not a FiberSales.co Prisma `Market` id.
T-Fiber order data reaches FiberSales.co through the separate Palmetto integration — see
`docs/palmetto-mapping-contract.md`.

---

## A. Corrected manager review — 10 rows

| # | Username | User ID | Confirmed name | Current | Proposed | Add/Replace | Evidence | Conflict | Approved |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `blakelipson001` | `521846693130534915` | Blake Lipson | Ashtabula | Ashtabula | — | holds role | — | ☐ |
| 2 | `deventopa696969` | `997526910827495486` | Deven Topa | Ashtabula | Ashtabula | — | holds role | — | ☐ |
| 3 | `litty29012` | `927499597453078589` | D'Angelo Simmons | Kannapolis | Kannapolis | — | holds role | nickname not applied (outranks bot) | ☐ |
| 4 | `headcalebebay305` | `373653162042720266` | Caleb Head | Jacksonville | **Wilmington** | **REPLACE** | Owner directive | loses Jacksonville authority · 52 pending | ☐ |
| 5 | `bedwar26` | `949541784126648330` | Ben Edwards | Jacksonville | **Wilmington** | **REPLACE** | Owner directive | loses Jacksonville authority · 33 pending | ☐ |
| 6 | `elitekill6996` | `699672451344236645` | Jonah McKinnon | Jacksonville | **Wilmington** | **REPLACE** | Owner directive | loses Jacksonville authority · 16 pending | ☐ |
| 7 | `jmaneski.` | `1234228856555045015` | Jacob Arnold | Jacksonville | Jacksonville | — | holds role | — | ☐ |
| 8 | `agm757` | `1464879769756893270` | Alex Minter | Jacksonville (as rep) | **Jacksonville** | **ADD** | Owner directive + active FiberSales Manager record `cmqeia1ye…` | 🔴 **does not hold the Discord Manager role** | ☐ |
| 9 | `hennysells` | `1504984792758751423` | Henry Sells | Inman, Kannapolis, Jacksonville | **Jacksonville only** | **REPLACE** | Owner directive | ⚠ **loses Inman + Kannapolis roles** | ☐ |
| 10 | `iqrexy_37266` | `1475356377760272505` | Rex Ranck | Kannapolis | Kannapolis | — | holds role | nickname not applied | ☐ |

**Henry's earlier three-market proposal is superseded.** Inman and Kannapolis require a separate
explicit approval; they are not carried forward.

---

## B. Wilmington — five people

| Name | Username | User ID | Role | Current | Proposed | Add/Replace | Warning | Approved |
|---|---|---|---|---|---|---|---|---|
| Caleb Head | `headcalebebay305` | `373653162042720266` | Manager | Jacksonville | Wilmington | REPLACE | 52 pending in Jacksonville | ☐ |
| Ben Edwards | `bedwar26` | `949541784126648330` | Manager | Jacksonville | Wilmington | REPLACE | 33 pending | ☐ |
| Jonah McKinnon | `elitekill6996` | `699672451344236645` | Manager | Jacksonville | Wilmington | REPLACE | 16 pending | ☐ |
| Tripp Barnes | `trippb23.` | `1296303439084650552` | Rep | Jacksonville | Wilmington | REPLACE | T-Fiber stack $275 ✅ ready | ☐ |
| Malakai Shepherd | `malakai_0914` | `459667932914515969` | Rep | Jacksonville | Wilmington | REPLACE | 🔴 **T-Fiber stack $0 — payout setup incomplete** | ☐ |

Market: `wilmington-nc` · Wilmington, NC · T-Fiber · orders via Palmetto ·
`#🛜wilmington` · `Pulse · Wilmington`.

---

## C. Jacksonville after the move

**Managers (3):**

| Name | Username | User ID | Status |
|---|---|---|---|
| Jacob Arnold | `jmaneski.` | `1234228856555045015` | ✅ holds Manager + Jacksonville role |
| Alex Minter | `agm757` | `1464879769756893270` | 🔴 **needs the Manager role granted** |
| Henry Sells | `hennysells` | `1504984792758751423` | ✅ holds Manager; loses Inman + Kannapolis |

**Reps retained (9)** — unchanged, no action:
`jrhea75` Jacob Rhea · `sirnaan.` Sirnaan Dilbi · `kkmx5` Kam · `eli2smovee` Elijah Boyd ·
`rileeeey0859` rileeeey · `caydensharp` Caydensharp · `_.fenfen._4396` Isaiah Fenner ·
`heath_whitehead` heathwhitehead_ · `jadin9400` Jadin Kent

**Leaving Jacksonville:** Caleb, Ben, Jonah (managers) · Tripp, Malakai (reps → Wilmington).

---

## D. Expected Discord permission diff

| Member | Role change | Channel effect |
|---|---|---|
| Caleb Head | `Pulse · Jacksonville` → `Pulse · Wilmington` | loses `#🛜jacksonville`, gains `#🛜wilmington` |
| Ben Edwards | same | same |
| Jonah McKinnon | same | same |
| Tripp Barnes | same | same |
| Malakai Shepherd | same | same |
| **Henry Sells** | **loses `Pulse · Inman` + `Pulse · Kannapolis`**, keeps Jacksonville | loses `#🛜inman`, `#🛜kannapolis` |
| Alex Minter | **gains `Manager`** (Owner action), keeps Jacksonville | unchanged |
| Jacob Arnold | none | none |

New channel `#🛜wilmington`: `@everyone` deny ViewChannel · `Pulse · Wilmington` allow
View/Send/History/AppCommands · Pulse bot technical access · no `CreateInstantInvite` · the generic
Manager role is **not** granted.

---

## E. Pending-order close-out — recommendation

Caleb (52), Ben (33) and Jonah (16) have **101 pending Jacksonville orders** between them.

**Recommended: keep their `Pulse · Jacksonville` Discord role until 2026-08-31, with no manager
assignment record.**

That gives read/write access to `#🛜jacksonville` for close-out conversation while granting **zero**
manager authority — they cannot add or remove reps, or run `/market status` there. Proven by test.

Why 2026-08-31: Palmetto orders install within 1–3 days of sale, and T-Fiber pay lands +14 days
after the period closes. Anything pending today is installed and paid well before month end.

**No new permission model is needed** — it is the role they already hold, minus the assignment
record, plus a date in your calendar. On 2026-08-31 run:

```
/market remove rep:@headcalebebay305
/market remove rep:@bedwar26
/market remove rep:@elitekill6996
```

⚠ Reconciliation treats a role with no backing record as drift. **If you take this option, do not
run `/market sync` before 2026-08-31.** The simpler alternative is a clean cut now — history, deal
logs and reporting are unaffected either way.

**This is your decision. Nothing is applied.**

---

## F. Commands

```
# 1. create the market (Owner)
node scripts/create-market-wilmington.js              # preview
node scripts/create-market-wilmington.js --apply

# 2. Wilmington managers
/market manager-add user:@headcalebebay305 market:wilmington-nc
/market manager-add user:@bedwar26          market:wilmington-nc
/market manager-add user:@elitekill6996     market:wilmington-nc

# 3. Wilmington reps (each REPLACES their Jacksonville assignment)
/market add rep:@trippb23.    name:"Tripp Barnes"     market:wilmington-nc
/market add rep:@malakai_0914 name:"Malakai Shepherd" market:wilmington-nc

# 4. Jacksonville managers
/market manager-add user:@jmaneski.  market:jacksonville
/market manager-add user:@hennysells market:jacksonville
#    Alex — grant the Manager role FIRST, then:
/market manager-add user:@agm757     market:jacksonville
```

## G. Rollback

| Step | Undo |
|---|---|
| Market created | `wilmington-rollback-*.json` has the role + channel ids; delete both, then `/market cleanup` |
| Any manager assignment | `/market manager-remove user:<id> market:<market>` — removes only that market |
| Rep moves | `/market add rep:@… market:jacksonville` |
| Henry's narrowing | `/market manager-add user:@hennysells market:inman` (and `kannapolis`) |
| Everything | `manager-assignments-backup-*.json` + `assignments-export-*.json` |
