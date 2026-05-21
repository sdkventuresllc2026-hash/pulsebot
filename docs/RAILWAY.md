# Run Pulse on Railway (not locally)

## 1. Stop local Pulse

On your PC, do **not** leave `npm start` running. In PowerShell:

```powershell
cd "c:\Users\danny\.cursor\projects\empty-window\pulse-bot"
.\scripts\stop-pulse.ps1
```

## 2. Push latest code to GitHub

Railway deploys from `https://github.com/sdkventuresllc2026-hash/pulsebot`. Commit and push all `pulse-bot` changes so Railway builds **build 2026-05-21e+** (one reply, new hype bank).

## 3. Railway project settings

| Setting | Value |
|--------|--------|
| **Start command** | `npm start` |
| **Replicas** | **1** (required) |

### Environment variables (same as `.env`)

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `ADMIN_IDS`
- `TZ` = `America/New_York`
- `PULSE_DATA_DIR` = `/data` (after volume mount, step 4)
- Optional: `MANAGER_ROLE_ID`, `DASHBOARD_SECRET`, `DASHBOARD_PORT`

## 4. Persistent volume (important)

Without a volume, every redeploy **wipes** `leaderboard.json` and channel config.

1. In Railway → your Pulse service → **Volumes** → Add volume, mount path **`/data`**
2. Set variable: `PULSE_DATA_DIR` = `/data`
3. Redeploy

Copy your current data once (from PC):

- `leaderboard.json`
- `approved-blitz-channels.json`

Upload into the volume via Railway shell or copy before first production deploy.

## 5. Verify deploy logs

You should see:

```text
Pulse online as Pulse#5159 · build 2026-05-21e · ONE reply per log
[Pulse] Host: Railway (…) · data dir: /data
```

Deal logs should end with `_· 2026-05-21e_` (or newer build tag). If you still see `Logged ✅` without that stamp, an **old** deploy or a second bot is still running.

## 6. Leaderboard reset — restore from your PC

Railway **wiped data** if there was no volume at `/data`. Your **local** Pulse folder may still have the real file.

On this machine, check:

```powershell
cd "c:\Users\danny\.cursor\projects\empty-window\pulse-bot"
.\scripts\prepare-railway-restore.ps1
```

That creates `restore-bundle/` with `leaderboard.json`, `approved-blitz-channels.json`, and archive (if present).

**Upload to Railway**

1. Service → **Volume** mounted at `/data`
2. Variable `PULSE_DATA_DIR` = `/data`
3. Copy into the volume (Railway shell / CLI):
   - `/data/leaderboard.json`
   - `/data/approved-blitz-channels.json`
4. **Restart** the Pulse service (not a full redeploy that skips the volume)

**Today / this week come back automatically** — Pulse filters by `date` and `weekId` on each log. No separate “import today” command.

If Railway already logged new deals after the reset, say so — we can merge by log `id` instead of overwriting.

Data that only ever lived on a previous Railway deploy **without a volume** is usually **not recoverable**.

## 7. V1 launch — official totals from today

On Railway (with volume mounted):

```bash
node scripts/init-v1-official-start.js
```

Then restart Pulse. Post `docs/ANNOUNCEMENT-v1-launch.md` in Discord.

The bot **will not start** on Railway without `PULSE_DATA_DIR` — this prevents accidental wipes.

## 8. Slash commands after deploy

Run once from your machine (not on Railway):

```powershell
cd "c:\Users\danny\.cursor\projects\empty-window\pulse-bot"
npm run deploy
```

Uses `CLIENT_ID` + `DISCORD_TOKEN` from your local `.env` — updates Discord command definitions only.
