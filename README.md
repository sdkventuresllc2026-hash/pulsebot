# Pulse Bot Launch Guide

## 1. What Pulse Bot Does

1. Pulse Bot helps sales teams track fiber internet deals inside Discord.
2. Reps type deal speeds like `1g`, `2g`, `500`, `300`, or `200`.
3. Pulse saves each deal.
4. Pulse updates leaderboards automatically.
5. Pulse helps managers see who is producing today, this week, and all time.

## 2. What V1 Includes

1. Deal logging from approved Discord channels.
2. Deal logging with `/log`.
3. Daily leaderboards.
4. Weekly leaderboards.
5. Blitz leaderboards.
6. Master leaderboard.
7. Personal rep stats with `/mydeals`.
8. Duplicate protection.
9. Deal correction.
10. Deal removal.
11. Admin channel approval.
12. CSV export.
13. Lightweight milestone hype messages.

## 3. What V1 Intentionally Does Not Include

1. No payroll calculations.
2. No commissions.
3. No customer database.
4. No customer outreach.
5. No OCR.
6. No dashboards required to run the bot.
7. No install tracking.
8. No Pulse Verify.
9. No incentive payouts.
10. No full streak engine.

## 4. Requirements

1. Use a Windows computer.
2. Use a Discord server where you can add bots.
3. Use a Discord account with permission to manage that server.
4. Install Node.js.
5. Have the Pulse Bot folder on your computer.
6. Keep your bot token private.

## 5. How To Install Node.js

1. Open [https://nodejs.org](https://nodejs.org).
2. Click the LTS download button.
3. Run the installer.
4. Keep the default installer options.
5. Finish the install.
6. Open Windows Command Prompt.
7. Run this:

```cmd
node -v
```

8. Confirm it prints a version number.
9. Run this:

```cmd
npm -v
```

10. Confirm it prints a version number.

## 6. How To Create A Discord Application

1. Open [https://discord.com/developers/applications](https://discord.com/developers/applications).
2. Click **New Application**.
3. Name it `Pulse Bot`.
4. Click **Create**.

## 7. How To Create The Bot User

1. Open your new Discord application.
2. Click **Bot** in the left menu.
3. Click **Add Bot** if Discord shows that button.
4. Confirm the bot creation.
5. Find **Privileged Gateway Intents**.
6. Turn on **Message Content Intent**.
7. Click **Save Changes**.

## 8. How To Copy The Bot Token

1. Stay on the **Bot** page.
2. Click **Reset Token**.
3. Confirm the reset.
4. Click **Copy**.
5. Paste it into `.env` only.
6. Do not send the token in Discord.
7. Do not commit the token to GitHub.

## 9. How To Get Application ID And Guild ID

1. Open your Discord application.
2. Click **General Information**.
3. Copy **Application ID**.
4. This is your `CLIENT_ID`.
5. Open Discord.
6. Right-click your server icon.
7. Click **Copy Server ID**.
8. This is your `GUILD_ID`.

## 10. How To Enable Developer Mode In Discord

1. Open Discord.
2. Click the gear icon near your username.
3. Click **Advanced**.
4. Turn on **Developer Mode**.
5. Right-click your profile.
6. Click **Copy User ID**.
7. This is your `ADMIN_IDS` value.
8. Right-click a manager role if you want managers to use admin commands.
9. Click **Copy Role ID**.
10. This is your optional `MANAGER_ROLE_ID`.

## 11. How To Fill Out `.env`

1. Open the Pulse Bot folder.
2. Copy `.env.example`.
3. Rename the copy to `.env`.
4. Open `.env`.
5. Replace the placeholders.

Use this exact shape:

```env
DISCORD_TOKEN=your-bot-token
CLIENT_ID=your-application-id
GUILD_ID=your-server-id
ADMIN_IDS=your-discord-user-id
# MANAGER_ROLE_ID=optional-manager-role-id
TZ=America/New_York

# Optional channel name approvals.
# Leave blank if you will use /admin add-channel.
# DEAL_LOG_CHANNEL_NAMES=virginia-deals,greenville-deals

# Optional channel ID approvals.
# Leave blank if you will use /admin add-channel.
# DEAL_LOG_CHANNEL_IDS=

DASHBOARD_SECRET=change-me-to-a-long-random-string
DASHBOARD_PORT=3050
# DASHBOARD_HOST=127.0.0.1

# Required for T-Fiber screenshot proof sync into FiberSales OS.
FIBERSALES_OS_URL=https://fibersales.co
PULSE_OS_SECRET=change-me-to-the-same-long-random-string
```

Line explanations:

1. `DISCORD_TOKEN` is the secret bot password from Discord.
2. `CLIENT_ID` is the Application ID from Discord.
3. `GUILD_ID` is your Discord server ID.
4. `ADMIN_IDS` is one or more Discord user IDs allowed to run admin commands.
5. `MANAGER_ROLE_ID` is optional.
6. `TZ` controls what Pulse considers “today.”
7. `DEAL_LOG_CHANNEL_NAMES` is optional.
8. `DEAL_LOG_CHANNEL_IDS` is optional.
9. `DASHBOARD_SECRET` protects the optional local dashboard API.
10. `DASHBOARD_PORT` controls the optional local dashboard port.
11. `DASHBOARD_HOST` is optional.
12. `FIBERSALES_OS_URL` is the FiberSales OS base URL Pulse posts proof events to.
13. `PULSE_OS_SECRET` must match the FiberSales OS deployment secret.

## 12. How To Install Dependencies

1. Open Windows Command Prompt.
2. Go to the Pulse Bot folder:

```cmd
cd /d "C:\Users\danny\.cursor\projects\empty-window\pulse-bot"
```

3. Install the needed packages:

```cmd
npm install
```

4. Wait until the command finishes.

## 13. How To Register Slash Commands

1. Stay in Windows Command Prompt.
2. Run this:

```cmd
npm run deploy
```

3. Wait for this message:

```txt
Done. Commands can take ~1 minute to show up in Discord.
```

4. Wait one minute.
5. Open Discord.
6. Type `/`.
7. Confirm Pulse commands appear.

## 14. How To Invite The Bot

1. Open the Discord Developer Portal.
2. Open your Pulse application.
3. Click **OAuth2**.
4. Click **URL Generator**.
5. Check **bot**.
6. Check **applications.commands**.
7. Add these bot permissions:
8. View Channels.
9. Send Messages.
10. Read Message History.
11. Use Slash Commands.
12. Embed Links.
13. Attach Files.
14. Click the generated URL.
15. Select your server.
16. Click **Authorize**.

## 15. How To Run The Bot Locally

1. Open Windows Command Prompt.
2. Go to the Pulse Bot folder:

```cmd
cd /d "C:\Users\danny\.cursor\projects\empty-window\pulse-bot"
```

3. Start the bot:

```cmd
npm start
```

4. Keep this window open.
5. Confirm you see:

```txt
Pulse online as ...
```

6. Press `Ctrl+C` when you want to stop the bot.

## 16. How To Approve Deal Channels

1. Start the bot.
2. Open Discord.
3. Go to the channel where reps should log deals.
4. Type this in the channel:

```txt
approve blitz Virginia Rippers
```

5. Pulse approves that channel.
6. Pulse uses `Virginia Rippers` as the leaderboard name.
7. You can also type this:

```txt
approve blitz
```

8. Pulse approves the channel and uses the channel name.
9. To remove the channel, type:

```txt
remove blitz
```

10. To list approved channels, type:

```txt
list blitzes
```

11. You can also use slash commands.
12. Run:

```txt
/admin add-channel
```

13. To set a custom blitz name, run:

```txt
/admin add-channel blitz_name:Virginia Rippers
```

14. To approve another channel, use the channel option:

```txt
/admin add-channel channel:#greenville-deals blitz_name:Greenville
```

15. To see approved channels, run:

```txt
/admin list-channels
```

16. To remove a channel, run:

```txt
/admin remove-channel
```

17. Confirm the removal when Pulse asks.

## 17. How Reps Log Deals

1. Reps must post in an approved deal channel.
2. Reps can type one speed.

Accepted one-deal examples:

```txt
1g
1G
1 gig
1gb
1000
2g
2 gig
2gb
2000
500
500m
500 mb
500 mbps
300
300m
300 mb
200
200m
200 mb
```

Accepted multi-deal examples:

```txt
1g 1g 2g
1g, 2g
1g and 500
2 1g
2x 1g
3 500
3x 1g, 1x 2g
2 1g and 1 500
```

Slash command example:

```txt
/log speed:1GIG
```

Duplicate protection:

1. If the same rep logs the same speed in the same channel within 10 seconds, Pulse asks:

```txt
Possible duplicate. Log it?
```

2. Click **New Deal** if it is real.
3. Click **Duplicate** if it was accidental.
4. Multi-deal messages skip duplicate checks.

## 18. How To Use `/lb`, `/master`, `/mydeals`

1. Run `/lb` in an approved deal channel.
2. Pulse shows that channel’s current blitz leaderboard.
3. Run `/leaderboard` for the same result.
4. Run `/daily` for today’s blitz leaderboard.
5. Run `/weekly` for this week’s blitz leaderboard.
6. Run `/blitz` for all-time results in that blitz.
7. Run `/master` for the server-wide approved-channel leaderboard.
8. Run `/mydeals` to see your own stats.

## 19. How To Correct A Deal

1. Use this when your most recent deal has the wrong speed.
2. Run:

```txt
/correction speed:500MB
```

3. Pulse updates your most recent active deal.
4. Leaderboards count the corrected speed.

## 20. How To Remove A Deal

1. Use this when your most recent deal should not count.
2. Run:

```txt
/remove-last
```

3. Pulse removes your most recent deal.
4. Removed deals do not count on leaderboards.

## 21. How To Export CSV

1. Run:

```txt
/admin export-csv
```

2. Pulse sends a CSV file in Discord.
3. The CSV includes active deal logs only.
4. Removed deals are not included.
5. Customer information is not included.

CSV columns:

1. timestamp
2. rep name
3. discord user ID
4. speed tier
5. blitz name
6. channel name

## 22. How To Troubleshoot The 10 Most Common Errors

1. Problem: Slash commands do not show up.
2. Fix: Run `npm run deploy`.
3. Fix: Wait one minute.
4. Fix: Check `CLIENT_ID` and `GUILD_ID`.

5. Problem: Bot is offline.
6. Fix: Run `npm start`.
7. Fix: Keep the Command Prompt window open.

8. Problem: `Missing DISCORD_TOKEN`.
9. Fix: Open `.env`.
10. Fix: Set `DISCORD_TOKEN`.

11. Problem: Bot says “This channel is not connected to a blitz leaderboard.”
12. Fix: Run `/admin add-channel` in that channel.

13. Problem: Reps type `1g` but Pulse does nothing.
14. Fix: Enable Message Content Intent in the Discord Developer Portal.
15. Fix: Restart the bot.

16. Problem: Discord says “application did not respond.”
17. Fix: Check the Command Prompt window for an error.
18. Fix: Run `npm run check`.
19. Fix: Run `npm test`.

20. Problem: `Used disallowed intents`.
21. Fix: Enable Message Content Intent in the Discord Developer Portal.
22. Fix: Restart the bot.

23. Problem: CSV export fails.
24. Fix: Give the bot **Attach Files** permission.

25. Problem: Admin commands say permission denied.
26. Fix: Use a Discord Administrator account.
27. Fix: Add your user ID to `ADMIN_IDS`.
28. Fix: Or set `MANAGER_ROLE_ID`.

29. Problem: Duplicate prompt appears.
30. Fix: Click **New Deal** if it is real.
31. Fix: Click **Duplicate** if it was accidental.

## 23. How To Keep The Bot Online With Railway Or Replit

Railway:

1. Create a GitHub repo for the bot.
2. Do not upload `.env`.
3. Open [https://railway.app](https://railway.app).
4. Create a new project.
5. Deploy from your GitHub repo.
6. Add the same environment variables from `.env`.
7. Set the start command to:

```cmd
npm start
```

8. Deploy.
9. Watch the logs for `Pulse online as ...`.

Replit:

1. Open [https://replit.com](https://replit.com).
2. Create a new Node.js Repl.
3. Upload the Pulse Bot files.
4. Add secrets for every `.env` value.
5. Run:

```cmd
npm install
```

6. Run:

```cmd
npm run deploy
```

7. Start the bot with:

```cmd
npm start
```

Important:

1. Free hosting may sleep.
2. Sleeping means the bot goes offline.
3. Use a paid always-on option for a serious sales team.

## 24. V2 Roadmap

1. Stronger admin reporting.
2. More polished weekly summaries.
3. Optional hosted deployment package.
4. Optional dashboard.
5. Optional incentive tracking.
6. Optional rep profiles.
7. Optional advanced streaks.
8. Optional manager alerts.
9. Optional audit log.
10. Optional CRM integrations.

# pulsebot
