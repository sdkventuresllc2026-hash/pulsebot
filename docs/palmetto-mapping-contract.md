# Palmetto → Pulse mapping contract (future work — NOT built here)

Wilmington and Jacksonville are T-Fiber operational markets whose **order data comes from
Palmetto**. FiberSales.co receives that data through a separate Palmetto integration built in
another session. **Nothing in this repository implements that integration.**

## The boundary

| System | Owns |
|---|---|
| **Palmetto** | source of T-Fiber order data |
| **Pulse + Discord** | operational markets, access, Managers, Reps, deal-channel activity |
| **FiberSales.co** | canonical payroll/order records — fed by the Palmetto integration |

`wilmington-nc` is a **Pulse operational identifier**. It is deliberately **not** a FiberSales.co
Prisma `Market` id — those are `cuid()`s, and Pulse does not own that identity. A test asserts the
Pulse id can never masquerade as one.

## Fields reserved now, written later

Recorded on the Pulse market record at creation, all null:

```jsonc
{
  "sourceSystem":       "palmetto",
  "externalMarketId":   null,   // Palmetto market/office id
  "externalMarketName": null,   // Palmetto's own label
  "lastImportedAt":     null    // set by the importer, never by Pulse
}
```

Wilmington is **not blocked** on these. They exist so the importer has somewhere to write without a
schema change.

## Contract for whoever builds the importer

| Element | Expectation |
|---|---|
| Palmetto order identifier | `alt_order_id` (`TMO…`) — the join key already proven across all three Palmetto exports |
| Palmetto market/office id | `market_id` (e.g. `METNCJCVL`) — maps to one Pulse market |
| Pulse operational market id | `wilmington-nc`, or an explicit mapping record |
| FiberSales.co mapping | the importer resolves the real `Market` cuid; **Pulse must never invent one** |
| Import timestamp | written to `lastImportedAt` |
| Duplicate protection | dedupe on the Palmetto order identifier, not on customer or address |

## Attribution rule to implement there, not here

Imported orders must **preserve the market supplied or mapped at import time**. Pulse moving a rep
between markets changes *current operational access only* — it does not and must not rewrite
historical attribution. An order submitted under Jacksonville and installed after a transfer stays
Jacksonville unless the import data says otherwise.

## Payroll safety finding — handed off, not fixed here

A valid provider stack must **exist**, **match the rep and ISP**, and be **greater than zero**.
A null, missing, zero or negative stack must place the payout on hold with an Owner-visible reason.

Today it does not. `lib/payroll.ts:434` tests **membership** in the rated set, not the amount:

```js
!ratedRepIdsByIspId.get(order.ispId)?.has(order.repId)
```

A `$0` `PersonIspStack` row therefore **passes** the guard and the rep is paid **$0** rather than
held out. Known affected, both active T-Fiber, neither with unpaid installs yet:

| Rep | T-Fiber stack | Reserve | paySetupComplete |
|---|---|---|---|
| Malakai Shepherd | **$0** | 0 | false |
| Heath Whitehead | **$0** | — | — |

Also outstanding: **Anthony Mucciolo** has `defaultRepStack $350` but **no `PersonIspStack` rows**
and **2 unpaid installs** — he is blocked by the guard, not mispaid. My earlier "unblocked" claim
was wrong for him.

**None of this is fixed in this Discord work.** It belongs to the FiberSales.co / Palmetto payroll
session.
