# Role audit + command security — FiberSales HQ

2026-07-28. Live state. Companion to `discord-audit-2026-07-28.md`.

---

## 1. Operational role model (owner decision, 2026-07-28)

Access is decided by **four** things and nothing else:

| Tier | Grants | Source of truth |
|---|---|---|
| **Owner/Admin** | everything, all markets, destructive commands | Discord `Administrator` + `ADMIN_IDS` |
| **Manager** | `#management`, `#pay-and-ops`, manager commands | `Manager` role (`MANAGER_ROLE_ID`) |
| **Rep** | team channels, training, **assigned markets only** | holds a `Pulse · <Market>` role |
| **Unverified / New** | `#welcome` and public reading only | no market role |
| **Market assignment** | which market channels are visible | market record → generated Discord role |
| **Bot** | technical access only | `Pulse` role |

**Rookie, Vet, Pro, Elite, Senior Rep and similar are recognition labels only.** They must never
control access. Today they violate that — see §2.

---

## 2. Every role, audited

| Role | Members | Assigned by | Used by Pulse? | Affects permissions? | Purpose | Recommendation |
|---|---:|---|---|---|---|---|
| **Owner** | 1 | manual | no | **yes** — Administrator | real | keep |
| **Manager** | 9 | manual | **yes** — `MANAGER_ROLE_ID` for command tier | **yes** — leadership channels | real | keep. Must NOT grant market access (fixed in code) |
| **Pulse** | 1 | Discord (managed) | n/a | **yes** — Administrator | bot | keep, strip Administrator |
| **Sapphire** | 1 | Discord (managed) | no | no (basic only) | welcome messages, now redundant | remove after test 1 passes |
| **Bot** | 2 | manual | no | yes — ManageMessages | groups both bots | keep, harmless |
| **Member** | 70 | unclear — **1 human lacks it** | no | no | cosmetic | keep; investigate the gap |
| **Pro** | **1** | unknown | no | 🔴 **YES — grants `#management`** | gamification | **strip from LEADERSHIP overwrites**, then keep as cosmetic |
| **Vet** | **0** | unknown | no | 🔴 **YES — grants `#management`** | gamification | same |
| **Rookie** | **0** | unknown | no | 🔴 **YES — grants `#management`** | gamification | same |
| **Pulse · Ashtabula** | 11 | `/market add`, `assignRepToMarket` | **yes** | yes — market channel | real | keep |
| **Pulse · Inman** | 9 | same | yes | yes | real | keep |
| **Pulse · Kannapolis** | 16 | same | yes | yes | real | keep |
| **Pulse · Jacksonville** | 17 | same | yes | yes | real | keep |
| **Pulse · Virginia** | 0 | **auto-recreated by `ensureMarketRole`** | yes | no channel | none | delete AFTER market cleanup |
| **Pulse · Greenville** | 0 | same | yes | no channel | none | same |
| **zz · Portland** | 10 | legacy | no | no | historical | keep for now — 10 real members |
| **zz · Kentucky** | 4 | legacy | no | no | historical | keep |
| **zz · Georgia** | 4 | legacy | no | no | historical | keep |
| **zz · Texarkana** | 3 | legacy | no | no | historical | keep |
| **zz · Virginia** | 2 | legacy | no | no | historical | keep |
| **zz · Greenville / London / Canton** | 1 each | legacy | no | no | historical | keep |
| **zz · Oklahoma** | 0 | legacy | no | no | none | safe to delete |
| **@everyone** | 73 | n/a | no | yes — baseline | real | keep |

**No role may be deleted yet** except `zz · Oklahoma` (0 members) and the two regenerated
`Pulse ·` roles after their markets are gone. The `zz ·` roles hold **26 real people**; deleting
them strips roles from members and loses the only record of prior market history.

🔴 **The one genuine problem: Pro, Vet and Rookie grant `#management`.** Fix is to remove those
three overwrites from the LEADERSHIP category *and* from `#management` itself — an explicit
channel-level allow survives a category correction, and `#management` has both.

---

## 3. Command security

19 commands. Runtime authorization is the real boundary; `setDefaultMemberPermissions` (added this
phase) controls visibility only.

| Command | Tier | Runtime check | Visibility | Scope of effect | Unauthorized result |
|---|---|---|---|---|---|
| `/market create` | Manager | `canUseAdminCommands` | ManageMessages | creates role + channel | ephemeral denial |
| `/market add` | Manager | `canUseAdminCommands` | ManageMessages | one member, one market | ephemeral denial |
| `/market remove` | Manager | `canUseAdminCommands` | ManageMessages | one member, all markets | ephemeral denial |
| `/market rename` | Manager | `canUseAdminCommands` | ManageMessages | display name only | ephemeral denial |
| `/market list` / `status` | Manager | `canUseAdminCommands` | ManageMessages | read-only | ephemeral denial |
| `/market sync` | Manager | `canUseAdminCommands` | ManageMessages | **rewrites all market overwrites** | ephemeral denial |
| `/market cleanup` | Manager ⚠ | `canUseAdminCommands` | ManageMessages | **deletes markets** | ephemeral denial |
| `/admin status` / `stats` | Manager | `canUseAdminCommands` | ManageGuild | read-only | ephemeral denial |
| `/admin export-csv` | **Owner** | `canUseOwnerCommands` | ManageGuild | every rep's history | ephemeral denial |
| `/reset-weekly` | **Owner** | `canUseOwnerCommands` | Administrator | archives the week, all markets | ephemeral denial |
| `/log`, `/leaderboard`, `/daily`, `/yesterday`, `/weekly`, `/lastweek`, `/monthly`, `/lastmonth`, `/blitz`, `/master`, `/markets`, `/mydeals`, `/share`, `/quarter` | Public | channel approval only | public | own data / own market | n/a |
| `/remove-last`, `/correction` | Public | own logs only | public | **own** last log | n/a |

### ⚠ Two gaps still open

1. **`/market cleanup` and `/market create` are Manager-tier but destructive.** Per your spec,
   destructive market actions should be Owner/Admin-only. Recommend moving `cleanup` (and
   arguably `create`) to `canUseOwnerCommands`. **Not changed yet — needs your confirmation**,
   since it would remove a capability managers have today.

2. **Manager commands are not market-scoped.** Any manager can run `/market add` for *any* market,
   including one they do not oversee. Your spec requires "manager commands limited to assigned
   markets". That needs a scope check inside the `/market` handlers comparing the target market
   against the manager's own market roles. **Designed, not implemented** — it changes behaviour for
   all 9 managers and belongs in Phase 2 with your sign-off.

---

## 4. Pulse least-privilege role — exact specification

Every permission traced to the code path that needs it.

| Permission | Code path | Discord action | Without it |
|---|---|---|---|
| ViewChannel | `messageCreate` handler | read blitz channels | **deal logging stops entirely** |
| SendMessages | `appendMessageLogsBatch` → reply, leaderboards, welcome | post confirmations | logs silently, rep sees nothing |
| ReadMessageHistory | `handleTextLeaderboard`, `messages.fetch` | aggregate standings | leaderboards empty |
| EmbedLinks | `EmbedBuilder` replies | rich confirmations | embeds fail to send |
| AttachFiles | `adminCsvAttachment` | `/admin export-csv` | export fails |
| AddReactions | log acknowledgement | react to a logged deal | reactions fail |
| UseExternalEmojis | hype lines | custom emoji in messages | emoji render as text |
| **ManageMessages** | `message.delete()` after logging | delete the raw `1g` | **channel fills with raw speed spam** |
| **ManageRoles** | `assignRepToMarket`, `ensureMarketRole` | add/create market roles | `/market add` and `/market create` fail |
| **ManageChannels** | `guild.channels.create`, `permissionOverwrites.set` | create + lock market channels | `/market create` and reconciliation fail |
| **ManageNicknames** | `member.setNickname` | Set-My-Name, `/market add` | **onboarding cannot set names** |
| UseApplicationCommands | all slash commands | receive interactions | commands do nothing |
| ~~Administrator~~ | **none** | — | nothing breaks |
| ~~ManageGuild~~ | none | — | nothing breaks |
| ~~KickMembers / BanMembers~~ | none | — | nothing breaks |
| ~~MentionEveryone~~ | none — grep confirms Pulse never sends `@everyone` | — | nothing breaks |
| ~~CreateInstantInvite~~ | none | — | nothing breaks |

**Administrator is not required.** Twelve permissions replace it.

⚠ Hierarchy limit, not a permission: Manager (23) and Owner (24) sit above Pulse (22), so Pulse can
never rename or role-change them. The onboarding flow already handles this — a manager who clicks
Set My Name is told a manager will apply it, and the request is queued to `#management`.

### The exact manual action (do NOT run until acceptance tests pass)

> **Server Settings → Roles → Pulse → Permissions**
> Turn **OFF**: Administrator
> Turn **ON**: View Channels · Send Messages · Read Message History · Embed Links · Attach Files ·
> Add Reactions · Use External Emoji · **Manage Messages** · **Manage Roles** · **Manage Channels** ·
> **Manage Nicknames** · Use Application Commands
>
> Immediately after, verify: post `1g` in a blitz channel (must log **and delete** your message),
> then `/market add` on a test member (must set nickname **and** grant the role).
