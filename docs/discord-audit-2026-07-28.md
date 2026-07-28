# Discord systems audit — FiberSales HQ

**2026-07-28** · live server state, Pulse source, market records, roles, overwrites, usage.
No changes were made during this audit. Raw capture: `docs/discord-current-state.json`.

---

## 0. Scope and limits — read this first

Three things I could **not** verify, stated up front so nothing here is over-claimed:

1. **I cannot join as a new account.** Item 4 asked for a live new-user journey. I verified the
   mechanics — intents, permissions, handler code, button persistence, hierarchy — but the
   end-to-end human test is in `discord-acceptance-tests.md` for you to run.
2. **Pulse's market records live on Railway's `/data` volume**, which I cannot read from here. Market
   state is verified from your `/market list` output (2026-07-28) plus what the Discord side proves.
   The local `approved-blitz-channels.json` is stale (Virginia + Greenville only) and is **not** the
   source of record.
3. **SIGTERM/restart behaviour could not be exercised locally** — Windows does not deliver SIGTERM
   like Linux. The restart test is in the acceptance list.

---

## 1. Current inventory

73 members (71 human, 2 bots) · 4 categories · 14 channels · 25 roles · 19 commands · 2 integrations.

| Category | ID | Channels |
|---|---|---|
| START HERE | 1504331974163169473 | welcome, announcements, wins, ask-anything, leaderboard |
| BLITZES | 1504331974163169476 | 🛜ashtabuhla, 🛜inman, 🛜kannapolis, 🛜jacksonville |
| REFERENCE | 1531729469344321713 | training, resources, pulse-help |
| LEADERSHIP | 1504349180427243682 | management, pay-and-ops |

Full IDs, overwrites, member lists and per-role effective permissions are in the JSON capture.
Role and command inventory is in `discord-permissions-matrix.md`.

**Server-level configuration**

| Setting | Value | Consequence |
|---|---|---|
| Community features | **disabled** | No Membership Screening, no Welcome Screen, no Onboarding. Rules channel is null. |
| System channel | **#pulse-help** | Wrong channel, but join notifications are suppressed by flag, so it is inert |
| Verification level | 1 (low) | Email-verified accounts only |
| MFA requirement | **0 (off)** | Moderators are not required to have 2FA |
| Bot's highest role | Pulse, position 22 | Cannot act on Manager (23) or Owner (24) |

---

## 2. Usage data — which channels earn their place

100-message sample per channel. `SATURATED` means the sample filled, so real volume is higher.

| Channel | Last post | 7d | 30d | Bot/Human | Authors | Verdict |
|---|---|---:|---:|---|---:|---|
| 🛜kannapolis | 1d | **100** | 100 | 34/66 | 12 | SATURATED — healthiest channel |
| 🛜jacksonville | 0d | **100** | 100 | 56/44 | 7 | SATURATED |
| 🛜ashtabuhla | 1d | **100** | 100 | 35/65 | 6 | SATURATED |
| 🛜inman | 2d | **100** | 100 | 44/56 | 7 | SATURATED |
| #pulse-help | 0d | 6 | 38 | **79/6** | 1 | 93% bot noise |
| #announcements | 4d | 1 | 21 | 1/81 | **1** | broadcast-only, healthy for its job |
| #training | 5d | 2 | 10 | 0/22 | **1** | broadcast-only |
| #resources | 14d | 0 | 2 | 0/14 | 1 | near-dormant |
| #management | **27d** | 0 | 1 | 0/1 | 1 | effectively dead |
| #wins | never | 0 | 0 | — | 0 | created today |
| #ask-anything | never | 0 | 0 | — | 0 | created today |
| #leaderboard | never | 0 | 0 | — | 0 | created today, **Pulse has never posted** |
| #pay-and-ops | never | 0 | 0 | — | 0 | created today |

**The four blitz channels are the entire server.** Everything else is broadcast or empty. Any
structural decision that does not serve the blitz channels is decoration.

---

## 3. CONFIRMED BROKEN

### 3.1 🔴 CRITICAL — Managers cannot see any blitz channel, and cannot run any `/market` command

Single root cause, two symptoms.

```
MANAGER_ROLE_ID lives only in .env  →  .env is git-ignored  →  never deployed to Railway
     ↓                                              ↓
marketAccessOpts() returns {}                canUseAdminCommands() has no manager tier
     ↓                                              ↓
buildChannelOverwrites omits Manager         managers get "you can't use this"
     ↓
applyMarketChannelLock calls
permissionOverwrites.set(...)  ← REPLACES the entire overwrite list
     ↓
Manager grant destroyed on every bot restart
```

`market-access.js:buildChannelOverwrites()` only includes the manager role
`if (opts.managerRoleId && guild.roles.cache.has(opts.managerRoleId))`. Unset ⇒ omitted.
`applyMarketChannelLock` then uses `permissionOverwrites.set()`, which is **destructive** — it does
not merge, it replaces.

**This silently reverted the Phase-1 fix applied earlier today.** Live state confirms it: the
Manager role appears in zero blitz-channel overwrites.

**Any manual permission change to a blitz channel will be wiped on the next restart.**

### 3.2 🔴 CRITICAL — `#management` is readable by non-managers

The LEADERSHIP category grants `ViewChannel` to **Pro, Vet and Rookie** — gamification tiers, not
leadership. Pro has 1 member today, so one non-manager can read it now, and anyone later given Vet
or Rookie inherits leadership visibility silently.

`#pay-and-ops` is correctly scoped to Manager + Owner and is unaffected.

### 3.3 🟠 The welcome instruction points at a button that moves

The `guildMemberAdd` message says *"Hit the 'Set My Name' button above"*. The button lives on a
separate pinned message. Every new join pushes that message further up, so for the second and later
joiner the instruction is wrong. You identified this correctly — it is a real defect, not a nitpick.

### 3.4 🟠 Pulse recreated two deleted market roles

`Pulse · Virginia` and `Pulse · Greenville` were recreated at 16:43 on 2026-07-28 with 0 members.
`ensureMarketRole()` falls back to a **name** lookup when a market record has no stored `roleId`;
the archived roles are now called `zz · Virginia`, so no match was found and new roles were created.

Archiving a role cannot stick while its market still exists. **Deleting the market is the only fix.**

### 3.5 🟠 Invite creation is only half-locked

`CreateInstantInvite` was removed from `@everyone`, but **all 13 market roles still grant it** —
including the archived `zz ·` ones. 26 people hold an archived market role. Effectively every rep
can still create invites.

### 3.6 🟡 Ashtabula: a three-way naming inconsistency

| Layer | Value | Correct? |
|---|---|---|
| Discord channel | `#🛜ashtabuhla` | ❌ misspelt — the city is **Ashtabula, Ohio** |
| Discord role | `Pulse · Ashtabula` | ✅ |
| Pulse market name | `Ashtabula` | ✅ (renamed today) |
| Pulse market **ID** | `new-york` | ⚠ stale but **must not change** |
| FiberSales OS | no market record | ❌ not represented in payroll |

The market ID is stamped on every historical deal log; changing it orphans 11 reps' history for a
cosmetic gain. **Leave the ID, fix the channel spelling.** Same pattern applies to Inman (`newark`)
and Kannapolis (`somerset`).

Ashtabula is in **Ohio**, and the provider is not recorded anywhere in Pulse — the `isp` field is
unset on all four markets, so Pulse cannot distinguish T-Fiber from Kinetic markets.

### 3.7 🟡 Manager role count disagrees with reality

`Pulse · Ashtabula` has **11** members but `/market list` reports **14 reps**. Pulse tracks
`repUserIds` in its own market record, which drifts from the Discord role. Same for Jacksonville
(role 17 / list 17 ✓) and Kannapolis (16/16 ✓) — only Ashtabula disagrees, most likely because
`assignRepToMarket` writes `repUserIds` but role removals done by hand do not.

### 3.8 🟡 One human has no `Member` role

71 humans, 70 hold `Member`. Harmless today (permissions come from `@everyone`), but it means role
assignment is not guaranteed on join.

---

## 4. RISKY (not broken yet)

| Risk | Why it matters |
|---|---|
| **Pulse holds Administrator** | Nothing in the code requires it (§ matrix). A leaked token can delete every channel and ban everyone. Managed role — must be changed by hand in Server Settings. |
| **`permissionOverwrites.set()` is destructive** | Any hand-made overwrite on a blitz channel is erased on the next restart. This will keep surprising you. |
| **All 19 commands visible to everyone** | `default_member_permissions` is null on every command. Gating is code-only, so a code path that forgets `canUseAdminCommands` is instantly exposed. |
| **No MFA requirement** | 9 managers hold Kick/Ban with no 2FA enforcement. |
| **`#leaderboard` has never received a post** | Pulse still posts standings into blitz channels. The channel is decoration until that changes. |
| **Empty Vet/Rookie roles grant leadership access** | Combined with 3.2, giving someone "Rookie" silently grants `#management`. |
| **Sapphire still installed** | Its only function is the welcome message Pulse now handles. Least-privileged today, but it is an unnecessary third-party token. |

---

## 5. CONFIRMED WORKING

- Blitz channel isolation is correct: each market role sees **only** its own channel; cross-market
  visibility is zero. Verified against effective permissions, not overwrites.
- `#pay-and-ops` is Manager + Owner only.
- `#wins` and `#ask-anything` are genuinely open to all members — the first two channels in server
  history where a rep can write.
- `@everyone` no longer has `CreateInstantInvite`.
- Sapphire no longer has Administrator.
- Deal logging, the busiest path, is untouched and healthy across all four markets.
- `#welcome` is first in the list with a pinned prompt; topics set on all 14 channels.
- Idempotency in the data layer (`sourceMessageId`) means double-logging remains impossible.

---

## 6. Structure evaluation vs your proposal

Your target vs current — they are nearly identical. Differences and my recommendation:

| Your proposal | Current | Recommendation |
|---|---|---|
| START HERE: welcome, announcements | START HERE: welcome, announcements, **wins, ask-anything, leaderboard** | **Adopt yours.** You are right that onboarding and daily chat should not share a category. |
| TEAM: wins, leaderboard, ask-anything | — | **Adopt.** Gives conversation its own home. |
| MARKETS: active only | BLITZES | **Rename to MARKETS**, keep the four. |
| TRAINING & TOOLS: training, resources, pulse-support | REFERENCE: training, resources, pulse-help | **Adopt**, with the pulse-help decision below. |
| LEADERSHIP: management, pay-and-ops | same | Keep — but fix the Pro/Vet/Rookie leak (§3.2). |

**One challenge, supported by the data:** `#resources` has had **2 messages in 30 days** and
`#management` **1 in 30 days**. Neither justifies a channel yet. I would still keep both — resources
is reference material that gets used at low frequency by design, and management being quiet is a
leadership habit problem, not a channel problem. But if you want to cut further, those are the two
with no evidence behind them.

---

## 7. `#pulse-help` decision

Data: 38 messages in 30 days, **79 bot / 6 human**, 1 unique human author, 0 pins.

It was never a help channel — it was Sapphire's join-notification dumping ground. Now that Pulse
welcomes people in `#welcome`, the noise source is gone.

**Recommendation: rename to `#pulse-commands`, purge the 79 bot messages, and pin one command
reference.** Reasons:

- "help" implies you can ask for help there; it is read-only, so that is a lie. `#ask-anything`
  is the real help channel.
- Renaming is non-destructive and keeps the channel ID, so nothing that references it breaks.
- Purging is what actually solves the noise — a rename alone leaves 79 join messages as the entire
  visible history.

Do **not** keep it as-is. Either it becomes a clean command reference or it should be deleted and
its content pinned in `#ask-anything`.

---

## 8. Reliability audit

| # | Issue | Location | Severity |
|---|---|---|---|
| R1 | `permissionOverwrites.set()` replaces rather than merges | `market-access.js:applyMarketChannelLock` | 🔴 wipes manual grants every restart |
| R2 | Manager access depends on an env var that is not deployed | `index.js:157`, `.env` git-ignored | 🔴 root cause of §3.1 |
| R3 | Channel lookup by **name** | `index.js:2667` (`welcome`), `index.js:2906` (`management`) | 🟠 renaming either channel silently breaks welcome + manager notifications |
| R4 | Role lookup by **name** | `market-access.js:49` (`ensureMarketRole`) | 🟠 renaming a market role creates a duplicate (proved by §3.4) |
| R5 | Two `interactionCreate`-family listeners | `index.js` | 🟡 verified distinct (`interactionCreate` + `guildMemberAdd`), not duplicates |
| R6 | Welcome message can post twice | `guildMemberAdd` has no dedupe | 🟡 Discord can redeliver the event; a rejoin also re-fires |
| R7 | Partial restructure failure leaves mixed state | `scripts/restructure-discord.js` | 🟡 mitigated by rollback files, but phases are not transactional |
| R8 | Role hierarchy blocks the bot | Manager(23) + Owner(24) > Pulse(22) | 🟡 by design; must be handled, not fixed |
| R9 | `market.repUserIds` drifts from the Discord role | `assignRepToMarket` | 🟡 caused the 14-vs-11 discrepancy |
| R10 | No handler if `#welcome` is missing | `index.js:2667` returns silently | 🟡 new members get no greeting and nobody knows |

Single `messageCreate` listener — confirmed, no duplicate deal logging.

---

## 9. Exact changes required

Ordered by severity. **D** = destructive.

| # | Change | Where | D? |
|---|---|---|---|
| 1 | Set `MANAGER_ROLE_ID=1504351060674740255` as a **Railway service variable** | Railway dashboard | no |
| 2 | Restart Pulse, confirm Manager appears in blitz overwrites | Railway | no |
| 3 | Remove Pro/Vet/Rookie from the LEADERSHIP category overwrites | script | **yes** (removes access) |
| 4 | Attach the Set-My-Name button to the welcome message itself | `index.js` | no |
| 5 | Strip Pulse Administrator → the 10 permissions in the matrix | Server Settings, by hand | no |
| 6 | Run `/market cleanup confirm:true` (Virginia, Greenville) | Discord | **yes** |
| 7 | Delete the two empty `Pulse · Virginia/Greenville` roles after step 6 | by hand | **yes** |
| 8 | Remove `CreateInstantInvite` from all 13 market roles | script | no |
| 9 | Rename `#🛜ashtabuhla` → `#🛜ashtabula` | script | no |
| 10 | Restructure START HERE / TEAM per §6 | script | no |
| 11 | Rename `#pulse-help` → `#pulse-commands`, purge bot messages, pin reference | script | **yes** (purge) |
| 12 | Replace name lookups with IDs (R3, R4) | `index.js`, `market-access.js` | no |
| 13 | Add dedupe to `guildMemberAdd` (R6) | `index.js` | no |
| 14 | Set `default_member_permissions` on `/market` and `/admin` | `deploy-commands.js` | no |
| 15 | Kick Sapphire | by hand | **yes** |
| 16 | Enable MFA requirement for moderation | Server Settings | no |

## 10. Actions only you can perform

1. **Set `MANAGER_ROLE_ID` in Railway** — the single highest-value action in this document.
2. **Strip Pulse's Administrator** — managed role, above the bot.
3. **Run `/market cleanup confirm:true`** — I cannot invoke slash commands.
4. **Kick Sapphire.**
5. **Nickname `@litty29012`** → `D'Angelo Simmons (Steezydlo)` — Manager outranks the bot.
6. **Run the acceptance tests** in `discord-acceptance-tests.md` — several need a second account.

---

## 11. Prioritised Phase 1 plan

**Phase 1A — restore manager access (do first, ~5 min, no destructive changes)**
1. Railway → Variables → `MANAGER_ROLE_ID=1504351060674740255` → redeploy
2. Confirm a manager can see all four blitz channels and run `/market list`
3. Acceptance tests 6, 9

**Phase 1B — close the access leaks (~10 min, one destructive step)**
4. Remove Pro/Vet/Rookie from LEADERSHIP overwrites *(destructive)*
5. Remove `CreateInstantInvite` from all market roles
6. Strip Pulse Administrator by hand, then test `1g` logging immediately
7. Acceptance tests 7, 8, 9

**Phase 1C — fix onboarding properly (~15 min, no destructive changes)**
8. Attach the button to the welcome message itself
9. Add `guildMemberAdd` dedupe and a missing-channel warning
10. Replace name lookups with IDs
11. Acceptance tests 1, 2, 3, 12

**Phase 1D — market lifecycle (~5 min, destructive)**
12. `/market cleanup confirm:true`, delete the two empty roles, restart, confirm they stay gone
13. Acceptance test 10

**Phase 2 — structure and naming** (rename channels, split START HERE/TEAM, pulse-commands purge)
**Phase 3 — T-Fiber logger.** Not before every acceptance test passes.
