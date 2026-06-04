# V1 “done” checklist — do in order

Check each box in order. ~15 minutes total.

---

## A. GitHub (already done for you)

- [x] Latest code pushed to `https://github.com/sdkventuresllc2026-hash/pulsebot`
- [ ] Railway project is connected to that repo and deploys from **`main`**

---

## B. Railway — data never resets again

Open [railway.app](https://railway.app) → your **Pulse** service.

### B1. Volume

1. Service → **Volumes** (or **Settings** → Volume)
2. **Add volume** → mount path: **`/data`**
3. Attach volume to the Pulse service if asked

- [ ] Volume exists at `/data`

### B2. Environment variable

Service → **Variables** → add:

| Name | Value |
|------|--------|
| `PULSE_DATA_DIR` | `/data` |

Keep existing: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_IDS`, `TZ` (= `America/New_York`)

- [ ] `PULSE_DATA_DIR` is set

### B3. One replica

Service → **Settings** → **Replicas** = **1**

- [ ] Only 1 replica

### B4. Redeploy

**Deployments** → **Deploy** (or push to `main` if auto-deploy)

Wait until status is **Running**.

Open **Deploy logs**. You must see:

```text
Pulse online as Pulse#5159 · build 2026-05-21-v1
[Pulse] Host: Railway (...) · data dir: /data
```

If you see **`FATAL] Railway deploy without PULSE_DATA_DIR`** → go back to B2 and redeploy.

- [ ] Logs show `data dir: /data` and no FATAL

---

## C. Official totals start today (clean slate)

### Option 1 — Railway web shell (preferred)

1. Service → **Shell** (or **Exec**)
2. Run:

```bash
cd /app && node scripts/init-v1-official-start.js
```

3. **Restart** the service (Settings → Restart)

- [ ] Init script ran successfully
- [ ] Service restarted

### Option 2 — From your PC (if you install Railway CLI)

```powershell
npm install -g @railway/cli
railway login
cd "c:\Users\danny\.cursor\projects\empty-window\pulse-bot"
railway link
railway run node scripts/init-v1-official-start.js
```

Then restart the service in the dashboard.

---

## D. Your PC — stay off production

```powershell
cd "c:\Users\danny\.cursor\projects\empty-window\pulse-bot"
.\scripts\stop-pulse.ps1
```

Do **not** run `npm start` again while Railway is live.

- [ ] No local `node index.js` running (Task Manager → no stray `node` for Pulse)

Slash commands (one-time from PC is OK):

```powershell
npm run deploy
```

- [ ] `npm run deploy` succeeded

---

## E. Discord — tell the team

1. Copy the **full** post from `docs/ANNOUNCEMENT-v1-launch.md` → paste in **#announcements** (or your leadership channel)
2. Pin `discord-pinned-message-v1.txt` in **#🛜greenville** and **#🛜virginia** (each deal channel)

- [ ] Announcement posted
- [ ] Pin posted in deal channels

---

## F. Smoke test (2 minutes)

In a deal channel, type: **`1gig`**

You should get **one** reply like:

```text
✅ **Logged** — **Your Name** · 1 Gig
**On the board.**
_· 2026-05-21-v1_
```

Then type: **`daily`**

First line should be **today’s date**, then the board.

- [ ] One log reply (not two Pulses)
- [ ] `daily` shows today’s date and your test deal

---

## You’re done when F is checked

Pulse stays on Railway. You can focus on other work. Data lives on the volume at `/data`.

**If stuck:** note which step letter (B2, C, F, etc.) failed and what the Railway log says.
