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

## 6. Slash commands after deploy

Run once from your machine (not on Railway):

```powershell
cd "c:\Users\danny\.cursor\projects\empty-window\pulse-bot"
npm run deploy
```

Uses `CLIENT_ID` + `DISCORD_TOKEN` from your local `.env` — updates Discord command definitions only.
