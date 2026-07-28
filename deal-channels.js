/**
 * Which text channels accept natural-language deal lines.
 */

const fs = require('fs');
const path = require('path');

const { dataPath } = require('./paths');

const DEFAULT_NAME_SUBSTRINGS = ['virginia-deals', 'greenville-deals'];
const APPROVED_CHANNELS_PATH =
  process.env.PULSE_APPROVED_CHANNELS_PATH || dataPath('approved-blitz-channels.json');

function normalizeMarketId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function marketIdFromDealsSubstring(substring) {
  const base = String(substring || '')
    .trim()
    .toLowerCase()
    .replace(/-deals$/i, '');
  return normalizeMarketId(base);
}

function displayNameFromMarketId(marketId) {
  return String(marketId || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * TRANSITIONAL AUTHORITY STORE.
 *
 * This file is the source of truth for market records AND for manager/rep assignments until the
 * Postgres model in docs/discord-assignment-model.md exists. It lives on Railway's persistent
 * /data volume: durable across restarts, but explicitly NOT the long-term canonical architecture.
 *
 * Schema version is stamped so a future migration can detect and upgrade old files.
 */
const ASSIGNMENT_SCHEMA_VERSION = 1;

/** Set when the file exists but cannot be parsed. Authorization must fail CLOSED and LOUD, never
 *  silently treat "unreadable" as "nobody is assigned" — that would deny every manager with no
 *  explanation, which is indistinguishable from a permissions bug. */
let storeCorrupt = null;

function isStoreCorrupt() { return storeCorrupt; }

function readApprovedChannels() {
  let raw;
  try {
    raw = fs.readFileSync(APPROVED_CHANNELS_PATH, 'utf8');
  } catch {
    // Genuinely absent: a first run. An empty store is correct here.
    storeCorrupt = null;
    return { schemaVersion: ASSIGNMENT_SCHEMA_VERSION, channels: [], disabledChannelIds: [], markets: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('root is not an object');
    if (!Array.isArray(parsed.markets ?? [])) throw new Error('markets is not an array');
    parsed.channels = Array.isArray(parsed.channels) ? parsed.channels : [];
    parsed.disabledChannelIds = Array.isArray(parsed.disabledChannelIds) ? parsed.disabledChannelIds : [];
    parsed.markets = Array.isArray(parsed.markets) ? parsed.markets : [];
    parsed.schemaVersion = parsed.schemaVersion ?? ASSIGNMENT_SCHEMA_VERSION;
    storeCorrupt = null;
    return parsed;
  } catch (err) {
    // Do NOT return an empty store — that silently erases every market and assignment, and the
    // next write would persist the erasure. Flag it; callers decide.
    storeCorrupt = `approved-blitz-channels.json is unreadable (${err.message}). File left untouched at ${APPROVED_CHANNELS_PATH}.`;
    return { schemaVersion: ASSIGNMENT_SCHEMA_VERSION, channels: [], disabledChannelIds: [], markets: [], __corrupt: true };
  }
}

/** Atomic write + timestamped backup. A crash mid-write previously truncated the authority file. */
function writeApprovedChannels(data) {
  if (storeCorrupt) {
    const err = new Error(`Refusing to write over an unreadable assignment store. ${storeCorrupt}`);
    err.code = 'ASSIGNMENT_STORE_CORRUPT';
    throw err;
  }
  const payload = JSON.stringify({ ...data, schemaVersion: ASSIGNMENT_SCHEMA_VERSION }, null, 2);

  try {
    if (fs.existsSync(APPROVED_CHANNELS_PATH)) {
      const dir = path.join(path.dirname(APPROVED_CHANNELS_PATH), 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(APPROVED_CHANNELS_PATH, path.join(dir, `approved-blitz-channels.${stamp}.bak`));
    }
  } catch { /* a failed backup must not block the write */ }

  const tmp = `${APPROVED_CHANNELS_PATH}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, payload, 'utf8');
  // Validate what we are about to promote — a truncated tmp must never become the live file.
  const check = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  if (!Array.isArray(check.markets)) throw new Error('post-write validation failed: markets missing');
  fs.renameSync(tmp, APPROVED_CHANNELS_PATH);
}

function buildDealNameSubstrings(stored) {
  const subs = new Set(DEFAULT_NAME_SUBSTRINGS.map((s) => s.toLowerCase()));
  for (const market of stored.markets || []) {
    if (!market?.marketId) continue;
    subs.add(String(market.marketId).toLowerCase());
    subs.add(`${market.marketId}-deals`.toLowerCase());
  }
  return [...subs];
}

function getApprovedChannelRules() {
  const idsRaw = process.env.DEAL_LOG_CHANNEL_IDS || '';
  const stored = readApprovedChannels();
  const ids = new Set([
    ...idsRaw.split(',').map((s) => s.trim()).filter(Boolean),
    ...stored.channels.map((c) => c.id).filter(Boolean),
  ]);
  for (const market of stored.markets || []) {
    for (const channelId of market.channelIds || []) {
      if (channelId) ids.add(String(channelId));
    }
  }
  const disabledIds = new Set(stored.disabledChannelIds.map((s) => String(s).trim()).filter(Boolean));

  const namesRaw = process.env.DEAL_LOG_CHANNEL_NAMES;
  let nameSubstrings;
  if (namesRaw == null || namesRaw.trim() === '') {
    nameSubstrings = buildDealNameSubstrings(stored);
  } else {
    nameSubstrings = namesRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }

  return { ids, disabledIds, nameSubstrings, markets: stored.markets };
}

function channelNameMatchesDealRules(channelName, rules) {
  const lower = String(channelName || '').toLowerCase();
  if (!lower) return false;
  if (rules.nameSubstrings.some((sub) => sub && lower.includes(sub))) return true;
  const slug = normalizeMarketId(channelName);
  for (const market of rules.markets || []) {
    if (!market?.marketId) continue;
    if (slug === market.marketId || lower.includes(market.marketId)) return true;
  }
  return false;
}

/**
 * Deal logs/leaderboards use the parent channel when the message is in a thread.
 */
function resolveDealChannel(channel) {
  if (!channel) return null;
  if (typeof channel.isThread === 'function' && channel.isThread() && channel.parent) {
    return channel.parent;
  }
  return channel;
}

function isApprovedDealChannel(channel) {
  const target = resolveDealChannel(channel);
  if (!target?.id) return false;
  const rules = getApprovedChannelRules();
  if (rules.disabledIds.has(target.id)) return false;
  if (rules.ids.has(String(target.id))) return true;
  if (marketForChannelId(target.id)) return true;
  if (typeof target.name !== 'string') return false;
  return channelNameMatchesDealRules(target.name, rules);
}

function isApprovedDealChannelId(channelId) {
  const id = String(channelId || '').trim();
  if (!id) return false;
  const rules = getApprovedChannelRules();
  if (rules.disabledIds.has(id)) return false;
  if (rules.ids.has(id)) return true;
  return !!marketForChannelId(id);
}

/**
 * Persist approval + market link when channel name matches a configured market
 * (e.g. #🛜greenville → greenville). Safe to call repeatedly.
 */
function ensureDealChannelRegistered(channel, actorId = 'auto') {
  const target = resolveDealChannel(channel);
  if (!target?.id || typeof target.name !== 'string') {
    return { ok: false, reason: 'invalid_channel' };
  }
  const rules = getApprovedChannelRules();
  if (!channelNameMatchesDealRules(target.name, rules)) {
    return { ok: false, reason: 'name_mismatch' };
  }
  const inferred = inferMarketFromChannelName(target.name);
  if (inferred) {
    connectChannelToMarket({
      channel: target,
      marketId: inferred.marketId,
      connectedBy: actorId,
    });
    return { ok: true, market: inferred, channelId: target.id, linked: true };
  }
  approveDealChannel(target, actorId);
  return { ok: true, market: null, channelId: target.id, linked: false };
}

function channelDefaultBlitzName(channel) {
  return String(channel?.name || 'Unknown Blitz')
    .replace(/^#/, '')
    .trim() || 'Unknown Blitz';
}

function approveDealChannel(channel, approvedBy, blitzName) {
  if (!channel || !channel.id || typeof channel.name !== 'string') {
    throw new Error('Invalid channel');
  }

  const data = readApprovedChannels();
  data.disabledChannelIds = data.disabledChannelIds.filter((id) => id !== channel.id);
  const existing = data.channels.find((c) => c.id === channel.id);
  const cleanBlitzName = String(blitzName || existing?.blitzName || channelDefaultBlitzName(channel)).trim();
  const entry = {
    id: channel.id,
    name: channel.name,
    blitzName: cleanBlitzName || channelDefaultBlitzName(channel),
    approvedBy: approvedBy || null,
    approvedAt: existing?.approvedAt || new Date().toISOString(),
  };

  if (existing) Object.assign(existing, entry);
  else data.channels.push(entry);

  writeApprovedChannels(data);
  return { channel: entry, alreadyApproved: !!existing };
}

function unapproveDealChannel(channelId) {
  const data = readApprovedChannels();
  const id = String(channelId || '').trim();
  const before = data.channels.length;
  data.channels = data.channels.filter((c) => c.id !== id);
  data.disabledChannelIds = data.disabledChannelIds || [];
  if (id && !data.disabledChannelIds.includes(id)) data.disabledChannelIds.push(id);
  writeApprovedChannels(data);
  return before !== data.channels.length || !!id;
}

function listApprovedDealChannels() {
  return readApprovedChannels().channels;
}

function approvedBlitzNameForChannel(channel) {
  if (!channel || !channel.id) return null;
  const found = readApprovedChannels().channels.find((c) => c.id === channel.id);
  return found?.blitzName || null;
}

function listMarkets() {
  return readApprovedChannels().markets;
}

function readApprovedChannelsData() {
  return readApprovedChannels();
}

function getMarketById(marketId) {
  const id = normalizeMarketId(marketId);
  if (!id) return null;
  return readApprovedChannels().markets.find((m) => m.marketId === id) || null;
}

/**
 * Resolve market by slug, display name, or single fuzzy match.
 * @returns {{ market: object, matchedBy: string } | null}
 */
function resolveMarket(query) {
  const markets = listMarkets();
  if (!markets.length) return null;

  const raw = String(query || '').trim();
  if (!raw) return null;

  const byId = getMarketById(raw);
  if (byId) return { market: byId, matchedBy: 'id' };

  const lower = raw.toLowerCase();
  const byName = markets.find((m) => String(m.marketName || '').toLowerCase() === lower);
  if (byName) return { market: byName, matchedBy: 'name' };

  const slug = normalizeMarketId(raw);
  const bySlugInName = markets.filter(
    (m) =>
      String(m.marketName || '').toLowerCase().includes(lower) ||
      lower.includes(String(m.marketName || '').toLowerCase()) ||
      (slug && (m.marketId.includes(slug) || slug.includes(m.marketId))),
  );
  if (bySlugInName.length === 1) return { market: bySlugInName[0], matchedBy: 'fuzzy' };

  return null;
}

function formatMarketNotFoundMessage(query) {
  const tried = normalizeMarketId(query);
  const markets = listMarkets();
  const lines = [`No market matches **${query}**${tried ? ` (slug tried: \`${tried}\`)` : ''}.`];
  if (markets.length) {
    lines.push('', 'Use one of these **market_id** values:');
    for (const m of markets) {
      lines.push(`• \`${m.marketId}\` — ${m.marketName}`);
    }
  } else {
    lines.push(
      '',
      'No markets saved yet. Run `/admin add-market` or approve a `*-deals` channel (Virginia/Greenville auto-register).',
    );
  }
  return lines.join('\n');
}

/**
 * Create markets for default *-deals patterns and approved channels missing from registry.
 */
function ensureDefaultMarkets(createdBy = null) {
  const created = [];
  const rules = getApprovedChannelRules();

  for (const sub of rules.nameSubstrings) {
    const id = marketIdFromDealsSubstring(sub);
    if (!id || getMarketById(id)) continue;
    const result = addMarket({
      marketId: id,
      marketName: displayNameFromMarketId(id),
      createdBy,
    });
    created.push(result.market);
  }

  const channels = readApprovedChannels().channels;
  for (const ch of channels) {
    const name = String(ch?.name || '').toLowerCase();
    for (const sub of rules.nameSubstrings) {
      if (!sub || !name.includes(sub)) continue;
      const id = marketIdFromDealsSubstring(sub);
      if (!id || getMarketById(id)) continue;
      const result = addMarket({
        marketId: id,
        marketName: displayNameFromMarketId(id),
        createdBy,
      });
      created.push(result.market);
    }
  }

  return created;
}

function deleteMarket(query) {
  const resolved = resolveMarket(query);
  if (!resolved) {
    const err = new Error(formatMarketNotFoundMessage(query));
    err.code = 'MARKET_NOT_FOUND';
    throw err;
  }

  const data = readApprovedChannels();
  const idx = data.markets.findIndex((m) => m.marketId === resolved.market.marketId);
  if (idx === -1) {
    const err = new Error(formatMarketNotFoundMessage(query));
    err.code = 'MARKET_NOT_FOUND';
    throw err;
  }

  const [market] = data.markets.splice(idx, 1);
  writeApprovedChannels(data);
  return { market, matchedBy: resolved.matchedBy };
}

function updateMarket(marketId, patch) {
  const id = normalizeMarketId(marketId);
  const data = readApprovedChannels();
  const market = data.markets.find((m) => m.marketId === id);
  if (!market) return null;
  Object.assign(market, patch, { updatedAt: new Date().toISOString() });
  writeApprovedChannels(data);
  return market;
}

function marketForChannelId(channelId) {
  if (!channelId) return null;
  const id = String(channelId);
  const found = readApprovedChannels().markets.find((m) => Array.isArray(m.channelIds) && m.channelIds.includes(id));
  return found || null;
}

function marketForChannel(channel) {
  return marketForChannelId(channel?.id);
}

function inferMarketFromChannelName(channelName) {
  const rules = getApprovedChannelRules();
  const lower = String(channelName || '').toLowerCase();
  const slug = normalizeMarketId(channelName);

  for (const market of rules.markets || []) {
    if (!market?.marketId) continue;
    if (slug === market.marketId || lower.includes(market.marketId)) {
      return { marketId: market.marketId, marketName: market.marketName };
    }
  }

  for (const sub of rules.nameSubstrings) {
    if (!sub || !lower.includes(sub)) continue;
    const id = marketIdFromDealsSubstring(sub);
    const market = getMarketById(id);
    if (market) {
      return { marketId: market.marketId, marketName: market.marketName };
    }
  }
  return null;
}

function inferMarketForLog(log) {
  const mapped = marketForChannelId(log?.channelId);
  if (mapped) {
    return { marketId: mapped.marketId, marketName: mapped.marketName };
  }

  const fromChannelName = inferMarketFromChannelName(log?.channelName || log?.blitzName);
  if (fromChannelName) return fromChannelName;

  if (log?.marketId) {
    const normalized = normalizeMarketId(log.marketId);
    const byId = normalized ? getMarketById(normalized) : null;
    if (byId) return { marketId: byId.marketId, marketName: byId.marketName };
    return {
      marketId: normalized || log.marketId,
      marketName: log.marketName || log.marketId || 'Unassigned',
    };
  }

  if (log?.marketName && log.marketName !== 'Unassigned') {
    const resolved = resolveMarket(log.marketName);
    if (resolved) {
      return { marketId: resolved.market.marketId, marketName: resolved.market.marketName };
    }
  }

  return { marketId: null, marketName: 'Unassigned' };
}

function renameMarket(query, { marketName, isp }) {
  const resolved = resolveMarket(query);
  if (!resolved) {
    const err = new Error(formatMarketNotFoundMessage(query));
    err.code = 'MARKET_NOT_FOUND';
    throw err;
  }
  const patch = { updatedAt: new Date().toISOString() };
  if (marketName != null && String(marketName).trim()) patch.marketName = String(marketName).trim();
  if (isp !== undefined) patch.isp = isp ? String(isp).trim() : null;
  return updateMarket(resolved.market.marketId, patch);
}

function addMarket({ marketId, marketName, isp = null, createdBy = null }) {
  const name = String(marketName || '').trim();
  if (!name) throw new Error('Market name is required');
  const id = normalizeMarketId(marketId || name);
  if (!id) throw new Error('Market id is required');

  const data = readApprovedChannels();
  const existing = data.markets.find((m) => m.marketId === id);
  if (existing) {
    existing.marketName = name;
    existing.isp = isp ? String(isp).trim() : existing.isp || null;
    existing.active = true;
    writeApprovedChannels(data);
    return { market: existing, alreadyExists: true };
  }

  const market = {
    marketId: id,
    marketName: name,
    isp: isp ? String(isp).trim() : null,
    active: true,
    channelIds: [],
    roleId: null,
    repUserIds: [],
    createdAt: new Date().toISOString(),
    createdBy: createdBy || null,
  };
  data.markets.push(market);
  writeApprovedChannels(data);
  return { market, alreadyExists: false };
}

function connectChannelToMarket({ channel, marketId, connectedBy = null }) {
  if (!channel || !channel.id) throw new Error('Invalid channel');
  const resolved = resolveMarket(marketId);
  if (!resolved) {
    const err = new Error(formatMarketNotFoundMessage(marketId));
    err.code = 'MARKET_NOT_FOUND';
    throw err;
  }
  const id = resolved.market.marketId;

  const data = readApprovedChannels();
  const market = data.markets.find((m) => m.marketId === id);
  if (!market) throw new Error(formatMarketNotFoundMessage(marketId));
  market.channelIds = Array.isArray(market.channelIds) ? market.channelIds : [];

  let removedFrom = null;
  for (const m of data.markets) {
    m.channelIds = Array.isArray(m.channelIds) ? m.channelIds : [];
    if (m.marketId !== id && m.channelIds.includes(channel.id)) {
      m.channelIds = m.channelIds.filter((c) => c !== channel.id);
      removedFrom = m.marketId;
    }
  }

  if (!market.channelIds.includes(channel.id)) {
    market.channelIds.push(channel.id);
  }
  market.updatedAt = new Date().toISOString();
  market.updatedBy = connectedBy || null;
  writeApprovedChannels(data);

  try {
    approveDealChannel(channel, connectedBy, market.marketName);
  } catch {
    /* channel may already be approved */
  }

  return { market, removedFrom };
}

function removeChannelFromMarket(channelId) {
  const id = String(channelId || '').trim();
  if (!id) return { removed: false, market: null };
  const data = readApprovedChannels();
  for (const market of data.markets) {
    market.channelIds = Array.isArray(market.channelIds) ? market.channelIds : [];
    if (market.channelIds.includes(id)) {
      market.channelIds = market.channelIds.filter((c) => c !== id);
      market.updatedAt = new Date().toISOString();
      writeApprovedChannels(data);
      return { removed: true, market };
    }
  }
  return { removed: false, market: null };
}

function channelApprovalDiagnostics(channel) {
  const safeName = String(channel?.name || '').toLowerCase();
  const rules = getApprovedChannelRules();
  const listed = listApprovedDealChannels();
  const market = marketForChannel(channel);
  const idApproved = !!(channel?.id && rules.ids.has(channel.id));
  const idDisabled = !!(channel?.id && rules.disabledIds.has(channel.id));
  const matchedNameSubstrings = rules.nameSubstrings.filter((sub) => sub && safeName.includes(sub));
  const matchedByName = !idApproved && !idDisabled && matchedNameSubstrings.length > 0;
  return {
    channelId: channel?.id || null,
    channelName: channel?.name || null,
    idApproved,
    idDisabled,
    matchedByName,
    approved: idApproved || matchedByName,
    nameSubstringFallbackEnabled: rules.nameSubstrings.length > 0,
    matchedNameSubstrings,
    configuredNameSubstrings: rules.nameSubstrings,
    approvedChannels: listed.map((c) => ({ id: c.id, name: c.name, blitzName: c.blitzName })),
    market: market
      ? {
          marketId: market.marketId,
          marketName: market.marketName,
          active: market.active !== false,
        }
      : null,
    envControls: {
      DEAL_LOG_CHANNEL_IDS_configured: Boolean((process.env.DEAL_LOG_CHANNEL_IDS || '').trim()),
      DEAL_LOG_CHANNEL_NAMES_configured: Boolean((process.env.DEAL_LOG_CHANNEL_NAMES || '').trim()),
      MANAGER_ROLE_ID_configured: Boolean((process.env.MANAGER_ROLE_ID || '').trim()),
    },
  };
}

module.exports = {
  resolveDealChannel,
  isApprovedDealChannel,
  isApprovedDealChannelId,
  ensureDealChannelRegistered,
  channelNameMatchesDealRules,
  getApprovedChannelRules,
  approveDealChannel,
  unapproveDealChannel,
  listApprovedDealChannels,
  approvedBlitzNameForChannel,
  listMarkets,
  readApprovedChannelsData,
  getMarketById,
  resolveMarket,
  formatMarketNotFoundMessage,
  ensureDefaultMarkets,
  deleteMarket,
  updateMarket,
  addMarket,
  marketForChannelId,
  marketForChannel,
  connectChannelToMarket,
  removeChannelFromMarket,
  inferMarketForLog,
  inferMarketFromChannelName,
  renameMarket,
  normalizeMarketId,
  marketIdFromDealsSubstring,
  channelApprovalDiagnostics,
  DEFAULT_NAME_SUBSTRINGS,
  APPROVED_CHANNELS_PATH,
  ASSIGNMENT_SCHEMA_VERSION,
  isStoreCorrupt,
};
