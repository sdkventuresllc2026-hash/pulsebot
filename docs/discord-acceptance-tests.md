# Discord acceptance tests — FiberSales HQ

Updated **2026-07-28** after Phase 1 code changes. Live-server state unchanged since the audit.
**Phase 1 is not complete until every test below passes.**

Key: ✅ pass · ❌ fail · ⏳ needs a human or second account · 🔒 blocked on a config/manual action

---

## Scoreboard

| # | Test | Before Phase 1 | Now | Blocker |
|---|---|---|---|---|
| 1 | New Rep onboarding | ⏳ | ⏳ | needs 2nd account |
| 2 | Set My Name — success | ⏳ | ⏳ | needs 2nd account |
| 3 | Set My Name — failure (role above bot) | ❌ | ✅ *(code)* ⏳ *(live)* | |
| 4 | Unmatched account | ⏳ | ⏳ | needs 2nd account |
| 5 | Duplicate name | ⚠ | ✅ *(code)* ⏳ *(live)* | |
| 6 | Rep assigned to one market | ✅ | ✅ | |
| 7 | Manager assigned to one market | ❌ | ✅ *(code)* 🔒 *(live)* | `MANAGER_ROLE_ID` |
| 8 | Manager assigned to multiple markets | ❌ | ✅ *(code)* 🔒 *(live)* | `MANAGER_ROLE_ID` |
| 9 | Unassigned Manager sees no markets | ❌ | ✅ *(code)* | |
| 10 | Unauthorized market access | ✅ | ✅ | |
| 11 | Owner/Admin global access | ✅ | ✅ | |
| 12 | `#management` privacy | ❌ | ❌ | destructive fix pending |
| 13 | `#pay-and-ops` privacy | ✅ | ✅ | |
| 14 | Invite creation restricted | ❌ | ❌ | destructive fix pending |
| 15 | Slash-command visibility | ❌ | ✅ *(code)* 🔒 *(live)* | needs `npm run deploy` |
| 16 | Runtime command authorization | ✅ | ✅ | |
| 17 | Manager command market scoping | ❌ | ❌ | **not implemented — needs your decision** |
| 18 | Owner-only destructive commands | ⚠ | ⚠ | `/market cleanup` is Manager-tier |
| 19 | Pulse least-privilege | ❌ | 🔒 | spec ready, manual action |
| 20 | Virginia/Greenville cleanup | ❌ | 🔒 | needs `/market cleanup confirm:true` |
| 21 | Market deletion survives 2 restarts | ❌ | 🔒 | after 20 |
| 22 | Ashtabula display correction | ❌ | ❌ | channel rename pending |
| 23 | Mobile onboarding | ⏳ | ⏳ | needs a phone |
| 24 | Membership Screening behaviour | ✅ n/a | ✅ n/a | Community disabled — not applicable |
| 25 | Sapphire removal | ⏳ | ⏳ | after test 1 |
| 26 | Duplicate welcome-event prevention | ❌ | ✅ *(code)* ⏳ *(live)* | |

**Automated: 80/80 passing** (`npm test`). Live: 5 pass · 4 fail · 8 blocked · 6 need a human.

---

## Automated coverage (run `npm test`)

| Test file | Covers | Count |
|---|---|---|
| `pulse-config.test.js` | missing / invalid / deleted / duplicated / wrong-guild ids, secret redaction, health latch | 9 |
| `market-access.test.js` | rep-one-market, manager-one, manager-three, unassigned, no-leakage, deterministic restart, lockout refusal, Pulse technical access | 11 |
| `text-commands.test.js` | plain-text commands never swallow a deal log | 4 |
| `palmetto-daily-detection.test.js` etc. | import/identity | 56 |

---

## Detail on the tests that changed

### 3 · Set My Name — failure ✅ code
A member whose top role outranks Pulse (any of the 9 Managers, or the Owner) now gets:
*"Pulse could not set it automatically (your role sits above the bot), so a manager will apply it."*
and the request is queued to `#management` flagged `⚠ nickname NOT applied`. Previously this
surfaced as a raw Discord error string.

### 5 · Duplicate name ✅ code
The modal now checks every member's display name before applying. On a clash the member is told
*"⚠ Heads up: X already goes by that name"* and `#management` receives a duplicate warning. It does
not block — a real duplicate (two people genuinely named the same) must not be prevented, only surfaced.

### 7–9 · Manager market scope ✅ code, 🔒 live
`buildChannelOverwrites` no longer accepts the generic Manager role at all. Market visibility comes
only from holding that market's role, so:
- manager with 1 market role → sees exactly 1 market
- manager with 3 → sees exactly 3
- manager with 0 → sees none

Proven by unit tests. **Live verification blocked on `MANAGER_ROLE_ID`** being set in Railway,
because reconciliation is now refused while config is unhealthy.

### 12 · `#management` privacy ❌ STILL FAILING
Pro, Vet and Rookie still hold `ViewChannel` on both the LEADERSHIP **category** and the
`#management` **channel**. Fixing it removes access from 1 person (the single Pro holder), which
makes it destructive — deferred to the approved-changes list.

### 15 · Slash-command visibility ✅ code, 🔒 live
`/market` → ManageMessages, `/admin` → ManageGuild, `/reset-weekly` → Administrator.
Requires `npm run deploy` to take effect in Discord.

### 17 · Manager command market scoping ❌ NOT IMPLEMENTED
Any manager can currently run `/market add` for a market they do not oversee. Your spec requires
scoping. **This needs your decision before I build it** — it removes a capability all 9 managers
have today.

### 19 · Pulse least-privilege 🔒
Exact 12-permission replacement is specified in `discord-roles-and-commands.md` §4, with the code
path for each. Do not apply until 1–11, 20 and 21 pass.

### 24 · Membership Screening ✅ not applicable
Community features are **disabled** (`features: []`), so there is no Membership Screening, Welcome
Screen or Onboarding. New members join straight into the server. The `guildMemberAdd` flow is
therefore the entire gate — which is why the button had to move onto the greeting itself.
If you enable Community later, this test must be re-run: screening delays `guildMemberAdd` until
the member accepts the rules.

### 26 · Duplicate welcome prevention ✅ code
A 10-minute in-process latch keyed on member id. Discord can redeliver `guildMemberAdd`, and a
rejoin re-fires it. Note: the latch is per-process, so a restart between two joins of the same
person could still double-post. Acceptable — the failure mode is one extra message.

---

## Still requiring a human

| # | Test | Why |
|---|---|---|
| 1, 2, 4 | Onboarding journey | needs a brand-new account |
| 23 | Mobile onboarding | modals behave differently on mobile, and most reps are phone-only |
| 25 | Sapphire removal | must confirm Pulse's welcome fires first |
| 21 | Restart survival | needs two Railway restarts |
