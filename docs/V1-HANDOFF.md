# Pulse V1 — handoff checklist (owner)

Use this once, then leave Pulse on **Railway only**.

## Never lose totals again

| Step | Railway setting |
|------|-----------------|
| 1 | **Volume** mounted at `/data` (not optional) |
| 2 | Env `PULSE_DATA_DIR` = `/data` |
| 3 | **Replicas = 1** |
| 4 | Do **not** run `npm start` on your PC in production |

The bot **refuses to start on Railway** without `PULSE_DATA_DIR` so deploys cannot silently wipe data.

Startup also copies `leaderboard.json` into `/data/backups/` on each boot.

## Official “totals start today” launch

1. SSH / Railway shell on the service (with volume attached).
2. Run:
   ```bash
   node scripts/init-v1-official-start.js
   ```
   This backs up the old file, then sets **0 logs**, **weekId 1**, and `officialTrackingStart` = today (America/New_York).
3. Restart Pulse once.
4. Post the announcement in `docs/ANNOUNCEMENT-v1-launch.md` in your main server channel.
5. Pin `discord-pinned-message-v1.txt` in each deal channel.

## What reps use (no slash required)

- Log: `1g` · `1gig` · `500` · `2gig`
- Boards: `daily` · `weekly` · `lb` · `master` · `mydeals`

## When you come back for V2

- Hosted DB instead of JSON (optional)
- Rep profiles / incentives
- Admin reporting exports polish

## Your PC

- `npm run deploy` — update slash commands only
- `npm test` — before any code change
- **Do not** leave `npm start` running while Railway is live
