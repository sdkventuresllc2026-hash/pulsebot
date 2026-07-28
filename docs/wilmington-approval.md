# Wilmington — approval artifact

2026-07-28. **Nothing is approved. Nothing has been created.** Every row awaits your sign-off.

Confirmed by Owner: **Wilmington, NC · T-Fiber**. Jacksonville is also NC · T-Fiber.

---

## 1. Market definition

| Field | Value | Status |
|---|---|---|
| Immutable market ID | **`wilmington-nc`** | derived from the confirmed state |
| Display name | Wilmington | ✅ |
| City | Wilmington | ✅ |
| State | **NC** | ✅ confirmed |
| Provider | **T-Fiber** | ✅ confirmed |
| Active | true | on creation |
| Discord channel | `#🛜wilmington` | matches `🛜inman` / `🛜kannapolis` |
| Discord role | `Pulse · Wilmington` | matches convention |
| Category | BLITZES (`1504331974163169476`) | rename to MARKETS is a separate step |

The id is derived **only** because the state was confirmed. That is the direct lesson from
Ashtabula, whose permanent id is `new-york` for an Ohio market because a value was written before
it was known. Ids are immutable once deal logs carry them.

⚠ **Still unconfirmed** (creation does not depend on them, reporting may): territory/map boundary,
order-entry config, and whether Wilmington needs its own dealer/stack config in FiberSales OS.
Note there is **no Wilmington market in FiberSales OS** — its 3 markets are Brightspeed-Virginia,
Kinetic-Arkansas and TFiber-KY&Greenville. Creating this in Pulse does not create it there.

---

## 2. Corrected nine-manager approval table

| # | Username | User ID | Real name | Proposed | Evidence | Conflict | Approved |
|---|---|---|---|---|---|---|---|
| 1 | `blakelipson001` | `521846693130534915` | Blake Lipson | Ashtabula | holds role | — | ☐ |
| 2 | `deventopa696969` | `997526910827495486` | Deven Topa | Ashtabula | holds role | — | ☐ |
| 3 | `litty29012` | `927499597453078589` | **D'Angelo Simmons** | Kannapolis | holds role | nickname never applied (outranks bot) | ☐ |
| 4 | `bedwar26` | `949541784126648330` | Ben Edwards | **Wilmington** | **Owner directive** | ⚠ replaces Jacksonville | ☐ |
| 5 | `elitekill6996` | `699672451344236645` | Jonah McKinnon | **Wilmington** | **Owner directive** | ⚠ replaces Jacksonville | ☐ |
| 6 | `jmaneski.` | `1234228856555045015` | Jacob Arnold | Jacksonville | holds role | — | ☐ |
| 7 | `hennysells` | `1504984792758751423` | **Henry Sells** | Inman, Kannapolis, Jacksonville | holds all 3 roles | nickname never applied | ☐ |
| 8 | `iqrexy_37266` | `1475356377760272505` | **Rex Ranck** | Kannapolis | holds role | nickname never applied | ☐ |
| 9 | `headcalebebay305` | `373653162042720266` | Caleb Head | **Wilmington** | **Owner directive** | ⚠ replaces Jacksonville | ☐ |

**Jacksonville loses 3 of its 4 managers.** Only Jacob Arnold (+ Henry Sells, who holds it among
three) remains. If Caleb, Ben or Jonah should keep Jacksonville **as well as** Wilmington, that is a
separate approval — the default is Wilmington only, as instructed.

---

## 3. Wilmington five-person review

| Name | Username | User ID | Role | Current market | Proposed | Add or replace | Evidence | Warning | Approved |
|---|---|---|---|---|---|---|---|---|---|
| Caleb Head | `headcalebebay305` | `373653162042720266` | Manager | Jacksonville | Wilmington | **REPLACE** | Owner directive | loses Jacksonville authority | ☐ |
| Ben Edwards | `bedwar26` | `949541784126648330` | Manager | Jacksonville | Wilmington | **REPLACE** | Owner directive | loses Jacksonville authority | ☐ |
| Jonah McKinnon | `elitekill6996` | `699672451344236645` | Manager | Jacksonville | Wilmington | **REPLACE** | Owner directive | loses Jacksonville authority | ☐ |
| Tripp Barnes | `trippb23.` | `1296303439084650552` | Rep | Jacksonville | Wilmington | **REPLACE** | FiberSales rep `cmrxo3y60000004l7z3xoeimh`, stack $275, **manager = Caleb Head** | loses `Pulse · Jacksonville` role | ☐ |
| Malakai Shepherd | `malakai_0914` | `459667932914515969` | Rep | Jacksonville | Wilmington | **REPLACE** | FiberSales rep `cmrsom18k000804l49m32f6vb`, **manager = Jonah McKinnon** | ⚠ **stack is $0 — unpayable**; nickname still `malakai_0914` | ☐ |

### Identity — no ambiguity

Both reps resolved on **two independent sources**, not a display-name match:

- **Tripp Barnes** — Discord `@trippb23.` (nickname already "Tripp Barnes"); FiberSales rep
  `cmrxo3y60000004l7z3xoeimh`, manager **Caleb Head**, stack $275, 0 orders. Exactly one active
  rep matches "barn" (the duplicate `John Barnes` was deactivated on 2026-07-28).
- **Malakai Shepherd** — Discord `@malakai_0914`, joined today, currently `Pulse · Jacksonville`;
  FiberSales rep `cmrsom18k000804l49m32f6vb`, manager **Jonah McKinnon**, 0 orders. Exactly one
  match on both "malakai" and "shepherd".

**Corroboration:** both reps report in FiberSales OS to proposed Wilmington managers (Caleb, Jonah).
That is independent support for the grouping, not a coincidence of names.

### Two issues to fix alongside

1. **Malakai Shepherd has `defaultRepStack = $0`** — the same unpayable pattern as Jacob Rhea and
   Isaiah Fenner. He has no installs yet, so nothing is stuck, but he cannot be paid until a stack
   is set. Not fixed here: it is a FiberSales OS change and needs your number.
2. **His Discord nickname is still `malakai_0914`.** `/market add` will set it when he is moved,
   provided you supply his real name.

---

## 4. Commands

```
# preview (safe, changes nothing)
node scripts/create-market-wilmington.js --state=NC --provider="T-Fiber"

# apply — Owner only, after you approve section 1
node scripts/create-market-wilmington.js --state=NC --provider="T-Fiber" --apply

# then, after the market exists:
/market manager-add user:@headcalebebay305  market:wilmington-nc
/market manager-add user:@bedwar26          market:wilmington-nc
/market manager-add user:@elitekill6996     market:wilmington-nc
/market add rep:@trippb23.     name:"Tripp Barnes"      market:wilmington-nc
/market add rep:@malakai_0914  name:"Malakai Shepherd"  market:wilmington-nc
```

Order matters: the market must exist before any assignment references it.

## 5. Rollback

| Step | Undo |
|---|---|
| Market created | `wilmington-rollback-*.json` records the created role + channel ids. Delete both, then `/market cleanup` (Owner-only). |
| Manager assignments | `/market manager-remove user:<id> market:wilmington-nc` — each removes only that market. |
| Rep moves | `/market add rep:@… market:jacksonville` puts them back; rep assignment is exclusive, so this is a clean reversal. |
| Everything | `manager-assignments-backup-*.json` + `assignments-export-*.json` restore the whole store. |

Because both reps have **0 orders**, moving them cannot affect deal history.
