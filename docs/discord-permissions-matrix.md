# Discord permissions matrix — FiberSales HQ

Generated from live server state, 2026-07-28. Source: `docs/discord-current-state.json`.
Every cell is the **effective** permission (category + channel overwrites resolved), not the
overwrite as written.

---

## 1. The role model you described does not exist

You asked about **Unverified, Rep, Team Lead, Manager, Senior/Regional Manager**. Only one of
those is real. Actual roles, by position:

| Pos | Role | Members | Guild-level permissions | Notes |
|----:|---|---:|---|---|
| 24 | **Owner** | 1 | Administrator | fibersales. Above the bot. |
| 23 | **Manager** | 9 | ManageMessages, KickMembers, BanMembers | Above the bot — bot cannot grant it or rename holders |
| 22 | **Pulse** | 1 | **Administrator** | managed (bot integration). Above the bot's own reach |
| 21 | Pro | 1 | none | gamification tier, effectively unused |
| 20 | Vet | 0 | none | **empty** |
| 19 | Rookie | 0 | none | **empty** |
| 18 | Bot | 2 | ManageMessages + basic | applied to both bots |
| 17 | **Member** | 70 | none | 71 humans exist → **1 human has no Member role** |
| 16 | Sapphire | 1 | basic only | managed. Administrator removed 2026-07-28 |
| 10,8,6,5 | Pulse · Ashtabula / Inman / Kannapolis / Jacksonville | 11 / 9 / 16 / 17 | basic + **CreateInstantInvite** | market gates |
| 15,14,13,12,11,9,7,4,3 | zz · Virginia/Greenville/Portland/Kentucky/Georgia/Oklahoma/London/Canton/Texarkana | 2/1/10/4/4/0/1/1/3 | basic + **CreateInstantInvite** | archived, still held by 26 people |
| 2,1 | Pulse · Virginia / Greenville | 0 / 0 | basic | **recreated by the bot on 2026-07-28 boot** |
| 0 | @everyone | 73 | basic, **no CreateInstantInvite** | invite creation removed |

There is **no Unverified, Rep, Team Lead, or Senior/Regional Manager role.** "Rep" is implied by
holding a `Pulse · <Market>` role. New members land with `@everyone` + `Member` only.

---

## 2. Channel matrix — who can VIEW / SEND

`V` = view, `S` = view + send, `—` = no access.

| Channel | @everyone / Member | Market roles | Pro / Vet / Rookie | Manager | Owner | Pulse | Sapphire |
|---|---|---|---|---|---|---|---|
| **START HERE** | | | | | | | |
| #welcome | V | V | V | V | S | S | V |
| #announcements | V | V | V | V | S | S | V |
| #wins | **S** | S | S | S | S | S | S |
| #ask-anything | **S** | S | S | S | S | S | S |
| #leaderboard | V | V | V | V | S | S | V |
| **BLITZES** | | | | | | | |
| #🛜ashtabuhla | — | S *(Ashtabula only)* | — | **—** ⚠ | S | S | — |
| #🛜inman | — | S *(Inman only)* | — | **—** ⚠ | S | S | — |
| #🛜kannapolis | — | S *(Kannapolis only)* | — | **—** ⚠ | S | S | — |
| #🛜jacksonville | — | S *(Jacksonville only)* | — | **—** ⚠ | S | S | — |
| **REFERENCE** | | | | | | | |
| #training | V | V | V | V | S | S | V |
| #resources | V | V | V | V | S | S | V |
| #pulse-help | V | V | V | V | S | S | **S** |
| **LEADERSHIP** | | | | | | | |
| #management | — | — | **S** ⚠ | S | S | S | — |
| #pay-and-ops | — | — | — | S | S | S | — |

### Two failures in that table

**⚠ Managers cannot see ANY blitz channel.** The Manager role is absent from all four channels'
overwrites. Only the market role, Pulse and Owner can view. The nine managers who *appear* to have
access only get it if they personally hold a market role.

**⚠ `#management` is readable by Pro, Vet and Rookie.** The LEADERSHIP category grants
`ViewChannel` to all three gamification tiers. Pro currently has 1 member, so one non-manager can
read leadership discussion today; the moment anyone is given Vet or Rookie, they can too.

---

## 3. Bot permissions

| | Pulse | Sapphire |
|---|---|---|
| Effective guild permissions | **Administrator** (⇒ everything) | ViewChannel, SendMessages, ReadMessageHistory, ManageMessages, AttachFiles, EmbedLinks, UseApplicationCommands, AddReactions |
| Roles | Pulse (managed), Bot, Member | Sapphire (managed), Bot |
| OAuth scopes | `bot`, `applications.commands` | `bot`, `applications.commands` |
| Per-channel grants | ManageChannels + ManageRoles on all 4 blitz channels; send on #leaderboard, #pulse-help | send on #pulse-help |

### What Pulse actually needs (least privilege)

Derived from every Discord write the code performs — `message.delete()`, `roles.add/remove`,
`roles.create`, `permissionOverwrites.set`, `setNickname`, `channels.create`, `send`, `showModal`:

| Permission | Needed? | Why |
|---|---|---|
| ViewChannel | ✅ | read blitz channels |
| SendMessages | ✅ | confirmations, leaderboards, welcome |
| ReadMessageHistory | ✅ | leaderboard aggregation |
| EmbedLinks, AttachFiles | ✅ | embeds and CSV export |
| AddReactions, UseExternalEmojis | ✅ | reactions on logs |
| **ManageMessages** | ✅ | deletes the raw `1g` after logging |
| **ManageRoles** | ✅ | `/market add` assigns market roles; `ensureMarketRole` creates them |
| **ManageChannels** | ✅ | `/market create` creates the blitz channel; `applyMarketChannelLock` sets overwrites |
| **ManageNicknames** | ✅ | `/market add` and the Set-My-Name modal set nicknames |
| UseApplicationCommands | ✅ | slash commands |
| **Administrator** | ❌ | nothing requires it |
| ManageGuild | ❌ | never called |
| KickMembers / BanMembers | ❌ | never called |
| MentionEveryone | ❌ | grep confirms Pulse never sends `@everyone`/`@here` |
| CreateInstantInvite | ❌ | never called |

**Conclusion: Administrator is not required.** Replacing it with the ten permissions above removes
kick, ban, server-management and invite powers from a token that lives in a `.env` file.

⚠ `ManageRoles` and `ManageNicknames` only work on targets **below** the bot's highest role.
Manager (23) and Owner (24) sit above Pulse (22), so Pulse can never rename or role-change them —
this is a Discord hierarchy rule, not a permission that can be granted.

---

## 4. Slash-command permissions

All 19 commands are registered with `default_member_permissions = null` — **every command is
visible and invocable by every member.** Command-level gating is done entirely in code:

| Tier | Function | Grants access to |
|---|---|---|
| Owner | `canUseOwnerCommands` | `/admin export-csv`, `/reset-weekly` — ADMIN_IDS or Discord Administrator only |
| Admin/Manager | `canUseAdminCommands` | `/market *`, `/admin status\|stats` — ADMIN_IDS, Administrator, **or `MANAGER_ROLE_ID`** |
| Everyone | none | all 16 rep-facing commands |

⚠ **The manager tier is dead in production.** `MANAGER_ROLE_ID` is read from the environment and is
set only in the local `.env`, which is git-ignored and therefore never deployed. On Railway the
variable is unset, so `canUseAdminCommands` falls through to Administrator-only — **no manager can
run any `/market` command.**

This same variable also feeds `marketAccessOpts()`, which is why managers lost blitz access (§2).
One missing environment variable causes both failures.
