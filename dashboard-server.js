/**
 * Read-only HTTP dashboard + JSON API (same data as Discord bot).
 * Protect with DASHBOARD_SECRET via X-Pulse-Key header.
 */

const path = require('path');
const express = require('express');
const { readLeaderboard } = require('./storage');
const {
  getTimeZone,
  filterToday,
  filterByWeekId,
  aggregateUsers,
  aggregateTeamWeekly,
} = require('./stats');
const { SPEED_LABELS, SPEEDS } = require('./constants');
const { inferMarketForLog, listMarkets } = require('./deal-channels');

function activeDealLogs(data) {
  return (data.logs || [])
    .filter((l) => l && !l.removed && !l.removedAt && !l.deletedAt && !l.voidedAt)
    .map((l) => ({ ...l, speed: l.correctedSpeed || l.speed }))
    .filter((l) => SPEEDS.includes(l.speed));
}

function sanitizeLogForApi(l) {
  const inferredMarket = inferMarketForLog(l);
  return {
    id: l.id,
    timestamp: l.timestamp,
    date: l.date,
    displayName: l.displayName,
    username: l.username,
    userId: l.userId,
    speed: l.speed,
    speedLabel: SPEED_LABELS[l.speed] || l.speed,
    blitzName: l.blitzName,
    marketId: inferredMarket.marketId,
    marketName: inferredMarket.marketName,
    channelName: l.channelName,
    weekId: l.weekId,
    sourceMessageId: l.sourceMessageId || '',
  };
}

function aggregateByMarket(logs) {
  const by = new Map();
  for (const log of logs) {
    const market = inferMarketForLog(log);
    const key = market.marketId || `unassigned:${market.marketName}`;
    if (!by.has(key)) by.set(key, { marketId: market.marketId, marketName: market.marketName, total: 0 });
    by.get(key).total += 1;
  }
  return [...by.values()].sort((a, b) => b.total - a.total || a.marketName.localeCompare(b.marketName));
}

function authMiddleware(secret) {
  return (req, res, next) => {
    if (!secret) {
      return res.status(503).json({ error: 'Set DASHBOARD_SECRET in .env to enable the API.' });
    }
    const k = req.headers['x-pulse-key'];
    if (typeof k === 'string' && k === secret) return next();
    return res.status(401).json({ error: 'Send header X-Pulse-Key matching DASHBOARD_SECRET.' });
  };
}

function startDashboard() {
  const secret = (process.env.DASHBOARD_SECRET || '').trim();
  const port = Number(process.env.DASHBOARD_PORT || 3050);
  const host = process.env.DASHBOARD_HOST || '0.0.0.0';

  const app = express();
  app.disable('x-powered-by');

  const api = express.Router();
  api.use(authMiddleware(secret));

  api.get('/overview', async (req, res) => {
    try {
      const data = await readLeaderboard();
      const logs = activeDealLogs(data);
      const tz = getTimeZone();
      const todayLogs = filterToday(logs, tz);
      const weekLogs = filterByWeekId(logs, data.metadata.weekId);
      const teamsWeek = Object.fromEntries(
        [...aggregateTeamWeekly(weekLogs).entries()].sort((a, b) => b[1] - a[1]),
      );
      const topToday = aggregateUsers(todayLogs).slice(0, 20).map((u) => ({
        displayName: u.displayName,
        userId: u.userId,
        total: u.total,
      }));

      res.json({
        weekId: data.metadata.weekId,
        timeZone: tz,
        counts: {
          today: todayLogs.length,
          week: weekLogs.length,
          allTime: logs.length,
        },
        teamsThisWeek: teamsWeek,
        marketsThisWeek: aggregateByMarket(weekLogs),
        marketsToday: aggregateByMarket(todayLogs),
        activeMarkets: listMarkets().filter((m) => m.active !== false).map((m) => ({
          marketId: m.marketId,
          marketName: m.marketName,
          channelIds: m.channelIds || [],
        })),
        topRepsToday: topToday,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to read leaderboard' });
    }
  });

  api.get('/logs', async (req, res) => {
    try {
      const data = await readLeaderboard();
      const tz = getTimeZone();
      const scope = ['today', 'week', 'all'].includes(req.query.scope) ? req.query.scope : 'week';

      let logs = activeDealLogs(data);
      if (scope === 'today') logs = filterToday(logs, tz);
      else if (scope === 'week') logs = filterByWeekId(logs, data.metadata.weekId);

      logs.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
      const slice = logs.slice(0, limit).map(sanitizeLogForApi);

      res.json({ scope, weekId: data.metadata.weekId, logs: slice });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to read logs' });
    }
  });

  app.use('/api', api);
  app.use(express.static(path.join(__dirname, 'dashboard-public')));

  const server = app.listen(port, host, () => {
    const hint = host === '0.0.0.0' ? `http://localhost:${port}/` : `http://${host}:${port}/`;
    console.log(`Pulse dashboard ${hint}(set X-Pulse-Key on /api/* requests)`);
  });
  server.on('error', (err) => {
    console.error('Pulse dashboard listen error:', err.message);
  });
}

module.exports = { startDashboard };
