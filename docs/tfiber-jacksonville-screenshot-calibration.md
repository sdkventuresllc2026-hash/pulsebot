# T-Fiber Jacksonville Screenshot Calibration

Observed 2026-07-29 from 116 historical image attachments in `#jacksonville`.

## Useful Screenshots

- Most valid screenshots are T-Mobile Fiber mobile web pages from `fiber.t-mobile.com`.
- Valid layouts usually say `Order details` or `Thank you for your order!`.
- The T-Mobile confirmation number appears after `Order number:` and starts with `TMO`.
- `Dealer Code`, `NTID`, unrelated reference numbers, browser bars, and timestamps are not order IDs.
- `Service address` is a dedicated section and can be one or two lines.
- `Contact info` usually appears as customer name, email, then phone.
- `Installation details` is only sometimes visible; if it is below the fold, the extractor must leave install date/time blank.
- Promo language appears under `Discounts and promotions` and should be copied only when visible.

## Guardrails

- Ignore random photos, selfies, and non-order text screenshots.
- Do not merge screenshots when two different `TMO...` confirmation numbers are visible.
- Do not infer a customer phone from an email, address, or Discord message.
- Do not write over stronger FiberSales OS fields; screenshot capture only fills missing data.
