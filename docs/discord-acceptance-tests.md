# Discord acceptance tests — FiberSales HQ

Run these in order. **The server is not "done" until every test passes.**
Baseline recorded 2026-07-28 against live state. `docs/discord-current-state.json` is the evidence.

Status key: ✅ pass · ❌ fail · ⏳ needs a human/second account · ⚠ passes with a caveat

---

## Current baseline

| # | Test | Status today |
|---|---|---|
| 1 | New rep onboarding | ⏳ |
| 2 | Failed name setup | ❌ |
| 3 | Unmatched rep | ⏳ |
| 4 | Correct market access | ✅ |
| 5 | Unauthorized market access | ✅ |
| 6 | Manager scope | ❌ |
| 7 | Leadership access | ❌ |
| 8 | Pay-channel privacy | ✅ |
| 9 | Pulse least-privilege | ❌ |
| 10 | Market deletion survives restart | ❌ |
| 11 | Duplicate names | ⚠ |
| 12 | Mobile button flow | ⏳ |
| 13 | Sapphire removal | ⏳ |
| 14 | Slash-command restrictions | ❌ |

**4 of 14 passing.** Do not start the T-Fiber logger until 1–10 pass.

---

## 1. New rep onboarding ⏳

**Setup:** a second Discord account not in the server.
**Steps:** join via invite → land in `#welcome` → click **Set My Name** → enter `Test User` + handle `TU` → submit.
**Pass:**
- Pulse posts a greeting in `#welcome` naming the new member
- Modal opens within 3s
- Nickname becomes `Test User (TU)`
- A message appears in `#management` with a ready-to-paste `/market add` command
- No blitz channel is visible yet
**Fail today if:** the greeting says "button above" while the button is buried (see test 2).

## 2. Failed name setup ❌ — KNOWN FAIL

**Steps:** join as a second member *after* another join has already posted.
**Pass:** the instruction to set a name is reachable without scrolling.
**Current result:** ❌ the `guildMemberAdd` message says *"Hit the 'Set My Name' button above"*, but the
button is on a separate pinned message that every new join pushes further up.
**Also test:** a member whose top role outranks Pulse (a Manager) clicks the button.
**Pass:** they get *"a manager will set it for you"*, not an unhandled error. Verified in code
(`index.js` modal handler catches and replies) — needs a live click to confirm.

## 3. Unmatched rep ⏳

**Steps:** set a name with no FiberSales OS record (e.g. `Zzz Nonexistent`).
**Pass:** nickname still updates, `#management` still receives the notice, nothing throws.
**Note:** the audit flagged that Pulse does **not** cross-check the roster. Brayden (`@toqcin`) sat in
a market for weeks with no payroll record. Roster matching is a Phase-2 improvement, not a blocker.

## 4. Correct market access ✅ PASS

**Verified:** each `Pulse · <Market>` role grants view+send on exactly its own blitz channel.
Ashtabula→ashtabuhla, Inman→inman, Kannapolis→kannapolis, Jacksonville→jacksonville.
Evidence: `effectivePermissionsByRole` in the state capture.

## 5. Unauthorized market access ✅ PASS

**Verified:** zero cross-market visibility. `@everyone` is denied `ViewChannel` on all four, and no
market role appears in another market's overwrites. A Kannapolis rep cannot see Jacksonville.

## 6. Manager scope ❌ — KNOWN FAIL

**Pass criteria:** the Manager role grants view+send on every market channel, and managers can run
`/market list`.
**Current result:** ❌ Manager appears in **zero** blitz-channel overwrites and cannot run any
`/market` command. Root cause: `MANAGER_ROLE_ID` is set only in the git-ignored `.env` and was never
deployed to Railway.
**Fix:** set it as a Railway service variable, restart, re-run.
**Then decide (your open question):** should all 9 managers see all 4 markets, or only their own?
Current data: 4 of 9 managers hold exactly one market role; `hennysells` holds three. If you want
per-region scope instead of all-markets, that is a code change to `buildChannelOverwrites` —
say which and I will implement it.

## 7. Leadership access ❌ — KNOWN FAIL

**Pass criteria:** only Manager + Owner can read `#management`.
**Current result:** ❌ the LEADERSHIP category grants `ViewChannel` to **Pro, Vet and Rookie**. Pro
has 1 member, so one non-manager can read leadership today.
**Fix:** remove those three overwrites from the category and from `#management`.

## 8. Pay-channel privacy ✅ PASS

**Verified:** `#pay-and-ops` is viewable and postable by Manager, Owner and Pulse only. Pro/Vet/
Rookie/market roles/@everyone are all denied.

## 9. Pulse least-privilege ❌ — KNOWN FAIL

**Pass criteria:** Pulse holds no Administrator, and deal logging still works.
**Current result:** ❌ Pulse retains Administrator.
**Required permissions** (proved against every Discord write in the code): ViewChannel, SendMessages,
ReadMessageHistory, EmbedLinks, AttachFiles, AddReactions, UseExternalEmojis, ManageMessages,
ManageRoles, ManageChannels, ManageNicknames, UseApplicationCommands.
**Fix:** Server Settings → Roles → Pulse → disable Administrator, enable those twelve.
**Verify immediately after:** post `1g` in a blitz channel → Pulse logs it **and deletes your
message** (that delete needs ManageMessages), then run `/market add` on a test member (needs
ManageRoles + ManageNicknames).

## 10. Market deletion survives restart ❌ — KNOWN FAIL

**Pass criteria:** after deleting Virginia and Greenville, their roles do not reappear on restart.
**Current result:** ❌ `Pulse · Virginia` and `Pulse · Greenville` were **recreated at 16:43 today**
with 0 members. `ensureMarketRole` falls back to a name lookup when a market record has no stored
`roleId`, finds no `Pulse · Virginia` (it is now `zz · Virginia`), and creates a new one.
**Fix sequence — order matters:**
1. `/market cleanup confirm:true`
2. Delete the two empty `Pulse ·` roles by hand
3. Restart Pulse from Railway
4. Confirm neither role returns and `/market list` shows exactly four markets
**Also confirm:** no active rep lost a role. Both roles have 0 members, so this is safe.

## 11. Duplicate names ⚠ PASSES WITH CAVEAT

**Discord side:** ✅ no two members share a nickname. A collision was caught and corrected today
(`@noahagm07_61514` was reverted from "Noah Mills" after `@donniemills` was confirmed as the real one).
**FiberSales OS side:** ✅ 0 duplicate active rep records; a `findSimilarReps` guard now blocks
creation of a second row (409 + candidates).
**Caveat:** nothing prevents two Discord members from choosing the same nickname via the modal.
Low impact, worth a Phase-2 check.

## 12. Mobile button flow ⏳

**Steps:** on the Discord mobile app, open `#welcome`, tap **Set My Name**, complete the modal.
**Pass:** modal renders, both fields accept input, nickname updates.
**Why it needs testing:** modals behave differently on mobile, and most reps are phone-only. This is
the single most likely place the onboarding silently fails for real users.

## 13. Sapphire removal ⏳

**Prerequisite:** test 1 passes (Pulse's welcome is confirmed working).
**Steps:** kick Sapphire → have a test account join.
**Pass:** exactly **one** welcome message appears, in `#welcome`, from Pulse.
**Rollback:** re-invite Sapphire from its dashboard if Pulse's welcome fails.

## 14. Slash-command restrictions ❌ — KNOWN FAIL

**Pass criteria:** `/market` and `/admin` are not visible to ordinary reps.
**Current result:** ❌ all 19 commands have `default_member_permissions = null`, so every command is
visible and invocable by everyone. Gating is code-only — a rep who runs `/market create` gets a
permission denial, but the command still appears in their picker and the denial depends entirely on
`canUseAdminCommands` being called in every handler.
**Fix:** set `default_member_permissions` on `/market`, `/admin` and `/reset-weekly` so Discord
hides them, keeping the code check as defence in depth.

---

## Regression tests — run after ANY future change

| Test | Command | Expected |
|---|---|---|
| Deal logging | post `1g` in a blitz channel | logged + your message deleted |
| Text undo | post `undo` | last log removed |
| Leaderboard | post `daily` | standings render |
| Market list | `/market list` | exactly 4 markets |
| Cross-market isolation | check as a single-market rep | only 1 blitz channel visible |
| Restart safety | restart Pulse, re-check blitz overwrites | Manager still present |

That last one is the trap: `applyMarketChannelLock` uses `permissionOverwrites.set()`, which
**replaces** the whole overwrite list on every restart. Any hand-made permission change to a blitz
channel is temporary until `MANAGER_ROLE_ID` is deployed.
