# Impact preview — Virginia & Greenville market cleanup

Produced 2026-07-28 **before** any deletion. Nothing has been deleted.
Run this preview again yourself with `/market cleanup` (no `confirm`) — it is non-destructive.

---

## What will be removed

| | Virginia | Greenville |
|---|---|---|
| Market ID | `virginia` | `greenville` |
| Display name | Virginia | Greenville |
| Reps assigned (per `/market list`) | **0** | **0** |
| Managers assigned | 0 | 0 |
| Discord channel | **none** | **none** |
| Discord role generated | `Pulse · Virginia` (id 1531…, **0 members**) | `Pulse · Greenville` (**0 members**) |
| Archived legacy role | `zz · Virginia` (**2 members**) | `zz · Greenville` (**1 member**) |
| ISP / provider | unset | unset |
| Active | true | true |

## What is NOT affected

- **No active rep is orphaned.** Both markets have zero assigned reps and zero channels. The three
  people on `zz · Virginia` / `zz · Greenville` hold *archived legacy* roles, which are separate
  records and are **not touched** by market deletion.
- **Deal history survives.** `inferMarketForLog` resolves a log's market in this order: channel
  mapping → channel name → **the `marketId`/`marketName` stamped on the log itself**. A deleted
  market falls through to the stamped values, so historical rows keep their label. Verified in
  `deal-channels.js:375-395`.
- **Historical reporting stays intact** for the same reason. Leaderboards read from log records,
  not the market table.
- No other market, channel, or role is referenced by either record.

## What Pulse does on the next restart

**Today (before cleanup):** `ensureMarketRole` runs for every market. Both records have no stored
`roleId`, so it falls back to a **name** lookup, finds no `Pulse · Virginia` (it was renamed to
`zz · Virginia`), and **creates a fresh role**. This is exactly why the archive did not stick — the
two 0-member `Pulse ·` roles were created at 16:43 on 2026-07-28.

**After cleanup:** the market records no longer exist, so `ensureMarketRole` is never called for
them and no role can be recreated. **The market must be deleted for the role deletion to hold.**

## Exact sequence — order matters

```
1. /market cleanup                    ← preview, non-destructive, confirm it lists exactly 2
2. /market cleanup confirm:true       ← DESTRUCTIVE: deletes both market records
3. Delete role "Pulse · Virginia"     ← by hand, 0 members
4. Delete role "Pulse · Greenville"   ← by hand, 0 members
5. Restart Pulse from Railway
6. /market list                       ← must show exactly 4 markets
7. Restart Pulse a SECOND time
8. Confirm neither role has returned  ← this is the real test
```

Step 7 is not paranoia: the regeneration only happens at boot, so a single restart can pass by
luck if reconciliation was skipped.

## Rollback

Market deletion is **not** covered by a rollback file — `deleteMarket` removes the record outright.
To restore:

```
/market create name:Virginia          (recreates the market and its role)
/market create name:Greenville
```

The new records get **fresh market IDs**. Since neither market has any deal history, nothing is
lost by that — this is precisely why these two are safe to delete and why Ashtabula is not.

**Pre-deletion backup:** the current state of both records is captured in
`docs/discord-current-state.json` (roles, members, ids) and in the `/market list` output quoted in
`discord-audit-2026-07-28.md`.

## Acceptance criteria

| Check | Pass |
|---|---|
| `/market list` shows exactly 4 markets | ☐ |
| `Pulse · Virginia` and `Pulse · Greenville` roles are gone | ☐ |
| Roles do NOT return after restart #1 | ☐ |
| Roles do NOT return after restart #2 | ☐ |
| `zz · Virginia` (2 members) still exists and members keep it | ☐ |
| `zz · Greenville` (1 member) still exists | ☐ |
| All four live markets still resolve in `/market add` autocomplete | ☐ |
| Deal logging still works in all four blitz channels | ☐ |

---

# Ashtabula correction — why the internal ID stays

| Field | Current | Target | Change? |
|---|---|---|---|
| Market ID | `new-york` | `new-york` | ❌ **never** |
| Display name | Ashtabula | Ashtabula | ✅ already correct |
| City | — | Ashtabula | ➕ add |
| State | — | **Ohio** | ➕ add |
| Discord channel | `#🛜ashtabuhla` | `#🛜ashtabula` | ✅ rename (misspelt) |
| Discord role | `Pulse · Ashtabula` | unchanged | ✅ correct |
| Provider / ISP | unset | to confirm | ➕ add |
| Active | true | true | — |

**Why `new-york` stays.** The market ID is stamped onto every deal log at write time
(`log.marketId`). Changing it would orphan 11 reps' history from their market, and
`inferMarketForLog` would fall back to the stale stamped name. The gain would be cosmetic; the cost
is real historical data. The same reasoning applies to Inman (`newark`) and Kannapolis (`somerset`).

**The rule this establishes:** market ID is **immutable and internal**. Display name, city, state,
provider and status are mutable and are the only things ever shown to a human. No interface may
render `new-york` as a location.

⚠ `market.city`, `market.state` and `market.isp` do not currently exist as fields — the market
record has `marketId`, `marketName`, `channelIds`, `roleId`, `repUserIds`, `isp`. Adding city/state
is a small schema addition for Phase 2, not a blocker.
