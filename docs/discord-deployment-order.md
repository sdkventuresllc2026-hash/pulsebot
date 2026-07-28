# Deployment & rollback order — Phase 1

2026-07-28. Each stage has its own verification. **Do not skip a verify step** — several stages
depend on the one before actually having worked.

---

## Stage 0 — code (NON-DESTRUCTIVE, ready now)

```
cd C:\dev\FiberSales\pulse-bot
npm test          # must be 80/80
npm run deploy    # registers command visibility restrictions
git push          # triggers Railway build
```

**Verify:** Railway logs show `--- Pulse configuration ---`. Expect it to report
`✗ CONFIGURATION INVALID` until Stage 1 — that is correct, and it is why permission
reconciliation is skipped rather than run from bad config.

**Rollback:** `git revert d24d596 && git push`.

---

## Stage 1 — Railway configuration (NON-DESTRUCTIVE, unblocks everything)

Railway → pulsebot → Variables → add:

```
MANAGER_ROLE_ID = 1504351060674740255
```

Redeploy.

**Verify:** logs show `✓ configuration valid` and `MANAGER_ROLE_ID  1504351060674740255  "Manager"`.
Then have a manager run `/market list` — it must work.

**Rollback:** delete the variable. Pulse returns to unhealthy and stops reconciling permissions;
it does not break logging.

---

## Stage 2 — Discord permission fixes (DESTRUCTIVE — removes access)

1. Remove `Pro`, `Vet`, `Rookie` overwrites from the **LEADERSHIP category** and from
   **#management** (both — a channel allow survives a category fix).
2. Remove `CreateInstantInvite` from all 13 market roles.

**Impact:** 1 person (the single `Pro` holder) loses `#management`. Reps lose invite creation.
**Verify:** `#management` viewable only by Manager + Owner; a rep cannot create an invite.
**Rollback:** re-add the overwrites; re-enable `CreateInstantInvite` per role.
**Backup:** current state is in `docs/discord-current-state.json`.

---

## Stage 3 — market cleanup (DESTRUCTIVE)

Full impact preview: `docs/discord-market-cleanup-impact.md`. Zero reps affected.

```
/market cleanup                  # preview — must list exactly 2
/market cleanup confirm:true     # delete
```
Then delete roles `Pulse · Virginia` and `Pulse · Greenville` by hand (0 members each).

**Verify:** restart Pulse **twice**; neither role returns; `/market list` shows 4.
**Rollback:** `/market create name:Virginia`, `/market create name:Greenville` (new ids; no history
exists, so nothing is lost).

---

## Stage 4 — channel structure (LOW RISK, one destructive step)

1. Rename `#🛜ashtabuhla` → `#🛜ashtabula` (misspelt city).
2. Split START HERE → START HERE (welcome, announcements) + TEAM (wins, leaderboard, ask-anything).
3. Rename REFERENCE → TRAINING & TOOLS; rename `#pulse-help` → `#pulse-commands`.
4. **Destructive:** purge the 79 bot join-messages from `#pulse-commands` after exporting them.

**Verify:** all 14 channels present; deal logging unaffected (channel IDs never change on rename).
**Rollback:** rename back; the message purge is NOT reversible — export first.

---

## Stage 5 — Pulse least privilege (MANUAL, after tests pass)

Only once tests 1–11, 20 and 21 pass. Exact permission list in
`docs/discord-roles-and-commands.md` §4.

**Verify immediately:** post `1g` (must log **and delete** your message); `/market add` on a test
member (must set nickname **and** grant the role).
**Rollback:** re-enable Administrator on the Pulse role.

---

## Stage 6 — Sapphire removal (DESTRUCTIVE, last)

Only after acceptance test 1 passes with a real new account.
**Verify:** a new join produces exactly one welcome, from Pulse, in `#welcome`.
**Rollback:** re-invite Sapphire.

---

## Rollback order (reverse)

```
6 Sapphire   → re-invite
5 Pulse perms→ re-enable Administrator
4 channels   → rename back (purge NOT reversible)
3 markets    → /market create (new ids)
2 permissions→ re-add overwrites from discord-current-state.json
1 Railway    → delete MANAGER_ROLE_ID
0 code       → git revert d24d596 && git push
```

Stages 0 and 1 are safe to leave in place while rolling back anything above them.
