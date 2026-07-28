# Public command review — all 16

2026-07-28. Verified against handler code and the live permission matrix.
"Unverified" = a member with no market role (the state every new join lands in).

| # | Command | Purpose | Unverified? | Data exposed | Modifies | Ephemeral | Rate limit | Cross-market | Abuse | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/log` | log a deal via slash | ❌ blitz only | own deal | own logs | no | Discord 3s | none | low | ✅ keep |
| 2 | `/leaderboard` | market standings, this channel | ❌ blitz only | display names + counts | none | no | Discord | **own market only** | low | ✅ keep |
| 3 | `/daily` | today, this market | ❌ blitz only | same | none | no | Discord | own market | low | ✅ keep |
| 4 | `/yesterday` | yesterday | ❌ blitz only | same | none | no | Discord | own market | low | ✅ keep |
| 5 | `/weekly` | this week | ❌ blitz only | same | none | no | Discord | own market | low | ✅ keep |
| 6 | `/lastweek` | last week | ❌ blitz only | same | none | no | Discord | own market | low | ✅ keep |
| 7 | `/monthly` | this month | ❌ blitz only | same | none | no | Discord | own market | low | ✅ keep |
| 8 | `/lastmonth` | last month | ❌ blitz only | same | none | no | Discord | own market | low | ✅ keep |
| 9 | `/blitz` | all-time, this market | ❌ blitz only | same | none | no | Discord | own market | low | ✅ keep |
| 10 | `/master` | **all markets head-to-head** | ✅ **anywhere** | names + counts **across every market** | none | no | Discord | ⚠ **BY DESIGN** | low | ⚠ see below |
| 11 | `/markets` | market board, today + week | ✅ **anywhere** | market names + totals | none | no | Discord | ⚠ totals only | low | ⚠ see below |
| 12 | `/mydeals` | your own stats | ✅ anywhere | **own** data only | none | no | Discord | none | low | ✅ keep |
| 13 | `/share` | weekly production card | ✅ anywhere | own totals | none | no | Discord | none | low | ✅ keep |
| 14 | `/quarter` | quarter + culture note | ✅ anywhere | static text | none | no | Discord | none | none | ✅ keep |
| 15 | `/remove-last` | undo your last log | ❌ blitz only | own | **own logs only** | no | Discord | none | low | ✅ keep |
| 16 | `/correction` | fix your last speed | ❌ blitz only | own | **own logs only** | no | Discord | none | low | ✅ keep |

## Confirmed for every one of the 16

- **No customer data.** Pulse stores no customer name, phone, address or account number.
- **No payroll data.** No stack, commission, gross, or pay date is reachable from any public command.
- **No management data.** Nothing reads `#management` or `#pay-and-ops`.
- **No cross-user modification.** `/remove-last` and `/correction` filter on `log.userId === interaction.user.id` — a rep cannot alter anyone else's logs.
- **No mass-message vector.** No public command sends to multiple channels or mentions `@everyone`; grep confirms Pulse never emits `@everyone`/`@here`.
- **Rate limiting** is Discord's native per-user interaction limit. Pulse adds a 180s reply-claim latch on deal logging, so repeat submissions cannot spam a channel.

## The two worth a decision

**`/master`** — deliberately shows every market's standings to anyone, from anywhere. That is the
point of a master leaderboard, and it is how the culture works today (the existing bot already
posts it into blitz channels). But it *is* cross-market exposure: a Jacksonville rep sees
Kannapolis names and counts. **Recommendation: keep.** Names and deal counts are not sensitive, and
company-wide competition is the intended behaviour. Restrict only if you want markets blind to each
other.

**`/markets`** — market names plus totals, no individual names. Lower exposure than `/master`.
**Recommendation: keep.**

## One real improvement, not a security fix

None of the 16 use ephemeral replies. `/mydeals` and `/share` are personal and noisy — they post a
visible message into whatever channel they are run in. **Recommendation: make `/mydeals` and
`/share` ephemeral.** Not a data-exposure fix (the rep is showing their own numbers), purely
channel-noise. Not done in this phase; no security reason to rush it.

## Verdict

**No public command exposes customer, payroll, management, private deal, or unintended cross-market
data.** Nothing blocks deployment.
