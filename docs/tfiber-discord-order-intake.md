# T-Fiber Discord Order Intake

Status: Pulse-side companion note, not implemented.
Canonical OS spec: `C:\dev\FiberSales\fibersaleshq-payos\docs\TFIBER_DISCORD_ORDER_INTAKE_SPEC.md`.
Locked with Danny on 2026-07-29.

## What Pulse Owns

Pulse remains the Discord field layer:

- live deal logging;
- leaderboards and hype;
- T-Fiber screenshot/proof collection;
- proof-missing reminders;
- temporary T-Fiber proof-pending counts;
- 48-hour proof expiration/restoration;
- Discord market/channel provenance;
- sending proof payloads to FiberSales OS.

FiberSales OS owns canonical order records, identity links, role-scoped visibility, and pay safety.

## Product Rules For Pulse

- Current speed/deal logging stays.
- In T-Fiber markets, screenshot proof is required in addition to speed logging.
- A T-Fiber text-only log counts temporarily, then expires after 48 hours without proof.
- Expired proof-missing T-Fiber logs are removed from official market and master totals.
- Late valid proof restores an expired log.
- Missing proof reminders happen immediately, end-of-day, and before expiration.
- Pulse collects missing screenshots by DM first, with channel reply fallback.
- Screenshots remain visible in Discord after capture.
- Multiple screenshots can belong to one logged deal by reply/DM reminder context.
- Unlinked Discord users can count temporarily but cannot create OS orders.
- Manager + admin are notified when an unlinked user logs a T-Fiber deal.
- Public replies say `T-Fiber`, never `Palmetto`.

## Reply Language

Pulse should keep its normal deal confirmation as the first part of the message, then add one
short tracker line.

With captured proof:

```text
<normal Pulse deal confirmation>

Tracker: T-Fiber order captured
```

With captured proof but missing details:

```text
<normal Pulse deal confirmation>

Tracker: T-Fiber order captured - details screenshot needed
```

Without screenshot:

```text
<normal Pulse deal confirmation>

Tracker: screenshot needed to add this T-Fiber order
```

Duplicate:

```text
Already logged.

Tracker: matched existing T-Fiber order - no duplicate created
```

Needs review:

```text
<normal Pulse deal confirmation>

Tracker: screenshot saved - needs order ID review
```

Do not post full customer details or full order ids in public Discord replies.

## Pulse To OS API

Pulse should call the OS internal endpoint defined in the canonical spec:

```text
POST /api/internal/discord/tfiber-proof
Header: x-pulse-os-secret: <secret>
```

Pulse must not send or invent OS ids such as `repId`, `managerId`, `marketId`, or `ispId` as
authority. It may send Discord ids, Pulse market ids/names, speed, attachment metadata, message
context, and parsed proof data. OS resolves the canonical records.

## State Pulse Needs

Pulse will need persistent state for:

- proof-pending logs;
- temporary count expiry time;
- reminder message/context ids;
- proof attached/restored state;
- expired audit trail;
- OS proof/order response ids when available;
- grouped screenshot context.

This state should live in Pulse's persistent store until the OS integration fully owns it. It must
be idempotent across Railway restarts and Discord event re-delivery.

## Build Order

1. OS Discord identity linking and internal proof API.
2. Pulse proof-missing lifecycle with 48-hour expiry/restoration.
3. Pulse proof payload sender.
4. Screenshot grouping by message/reply/DM context.
5. OCR and typed order-id fallback.

OCR is intentionally not first. The foundation must work before screenshot parsing becomes smart.
