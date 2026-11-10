# PulseBot (Discord bot)

PulseBot logs deals from Discord, posts leaderboards and #wins, checks T-Fiber proof screenshots, and seats people in
blitz chats from the FiberSales OS blitz board. Plain Node (no build step). Entry point: `index.js`.

## Deploy

- Railway deploys from GitHub `sdkventuresllc2026-hash/pulsebot` on push. Pushing IS deploying to every rep.
- One replica only, with a volume at `/data` (`PULSE_DATA_DIR=/data`, set in `railway.toml`). Without the volume a
  redeploy wipes `leaderboard.json` and channel config. Details: `docs/RAILWAY.md`.
- Railway showing "Online" does not mean the bot works. Confirm in the deploy logs (`Pulse online as ...`) and
  with one real Discord message.

## Before every push

1. `npm run check` (syntax check of the main files) and `node --check <file>` for any file you edited that the
   check list does not cover.
2. `npm test` (node's built-in runner, `*.test.js` next to each file).
3. A syntax error crash-loops the bot (the Oct 24 outage). Never push without both passing.

## Rules

- The bot talks to real reps. New message wording, new channels, role or permission changes, and anything that posts
  publicly need Danny's yes on the exact text first.
- Discord voice: simple hype, real names, no dashes.
- `scripts/` and the `discord-rollback-*.json` files are one-off ops records; read a script before running it.
