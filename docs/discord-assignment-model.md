# Market assignment model & command authorization

2026-07-28, Phase 2. Implemented in `market-assignments.js` and `command-policy.js`.

---

## 1. Where the database is — and an honest gap

**Authority: `approved-blitz-channels.json` on Railway's `/data` volume.** Pulse's own persistent
store. Each market record carries:

```jsonc
{
  "marketId":       "new-york",        // IMMUTABLE. Stamped on every deal log. Never changes.
  "marketName":     "Ashtabula",       // mutable display name
  "roleId":         "1506…",           // generated OUTPUT, not authority
  "channelIds":     ["1508…"],
  "repUserIds":     ["…"],             // a rep belongs to exactly ONE market
  "managerUserIds": ["…"],             // a manager may oversee MANY   ← added this phase
  "active":         true,
  "isp":            null
}
```

**It is NOT the FiberSales OS Postgres, and it cannot be yet.** No `Rep` row carries a Discord user
id — `OnboardingCandidate.discordAt` is only a timestamp recording *when* someone was added. There
is no link to resolve, so "resolve their linked FiberSales account" has nothing to resolve against.

What matters for your requirement is satisfied: **authorization reads a persistent record, never
the Discord roles the caller holds.** Roles are a mutable cache — hand-editable, lost when a role
is recreated, stale after a failed sync. Authorising on them authorises on a forgeable input.

### Migration required to make Postgres the authority

```prisma
model Rep {
  discordUserId String? @unique   // Discord snowflake
  discordLinkedAt DateTime?
}
model Manager {
  discordUserId String? @unique
}
model ManagerMarketAssignment {   // new
  id         String   @id @default(cuid())
  managerId  String
  marketId   String   // Pulse marketId, e.g. "new-york"
  active     Boolean  @default(true)
  @@unique([managerId, marketId])
}
```
Plus an API on FiberSales OS for Pulse to query, since Pulse has no Prisma client.
**Not built this phase** — it is a genuine schema + integration project, and prod does not
auto-migrate (CLAUDE.md §7).

---

## 2. Assignment rules

| | Rep | Manager | Owner/Admin |
|---|---|---|---|
| Markets | exactly **1** | **0..many** | all, via Administrator |
| Assigning a new one | **removes** the previous | **adds**, keeps the others | n/a |
| Removing one | removes their only market | removes **only that one** | n/a |
| Function | `assignRepMarket()` | `addManagerMarketAssignment()` / `removeManagerMarketAssignment()` | — |

Separate functions on purpose. One ambiguous `assignRepToMarket` handling both is exactly how
multi-market managers silently lost their other markets — and removing the stripping wholesale
would have let reps accumulate stale roles. A rep in two markets must be written deliberately into
the record, never created as a side effect.

### Reconciliation — the record always wins

`reconcileMemberMarketRoles(guild, userId, { dryRun })`:

| Discord | Record | Result |
|---|---|---|
| has role | no assignment | **role removed** (added by hand) |
| no role | has assignment | **role added** (recreated / failed sync) |
| disagree | — | **record wins** |

---

## 3. Command authorization matrix

Tier is per **subcommand**. `/market list` is a harmless read; `/market cleanup` deletes records.

| Subcommand | Tier | Scoped | Destructive | Why |
|---|---|---|---|---|
| `create` | **OWNER** | — | yes | creates a Discord channel + role; adding a market is an organisational decision |
| `cleanup` | **OWNER** | — | yes | deletes market records; can affect historical reporting |
| `rename` | **OWNER** | — | no | global display name, visible on every leaderboard |
| `sync` | **OWNER** | — | yes | rewrites overwrites server-wide; a bad desired state locks everyone out |
| `add` | MANAGER | ✅ assigned only | no | day-to-day rep movement |
| `remove` | MANAGER | ✅ assigned only | no | day-to-day rep movement |
| `list` | MANAGER | — | no | read-only |
| `status` | MANAGER | — | no | read-only diagnostic |
| *(unknown)* | **OWNER** | — | yes | deny by default |

| Other command | Tier |
|---|---|
| `/admin export-csv`, `/reset-weekly` | **OWNER** |
| `/admin status`, `/admin stats` | MANAGER |
| 16 rep-facing commands | PUBLIC |

**Owner/Admin is global for everything.**

### Authorization flow

```
identify Discord member
  → Owner/Admin?  (ADMIN_IDS or Administrator)        → ALLOW, global
  → policy tier OWNER?                                 → DENY with the reason
  → Manager role? (MANAGER_ROLE_ID, validated config)  → else DENY
  → subcommand scoped?
        → read getManagerMarkets(userId) FROM THE RECORD
        → no assignments at all                        → DENY
        → target market not in that list               → DENY, naming what they do manage
  → ALLOW
always: audit line {ts, actorId, action, marketId, targetUserId, result, detail}
```

`MANAGER_ROLE_ID` identifies the **leadership tier only** — who may reach manager commands and
leadership channels. It grants **no market access whatsoever**; market visibility comes solely
from assignment. That separation is the fix for the outage.

Audit output is single-line JSON (`kind: "pulse.audit"`) to stdout, retained by Railway. Ids and
outcomes only — never names or entered text.
