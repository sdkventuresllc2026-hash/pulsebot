/**
 * Which text channels accept natural-language deal lines.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_NAME_SUBSTRINGS = ['virginia-deals', 'greenville-deals'];
const APPROVED_CHANNELS_PATH = path.join(__dirname, 'approved-blitz-channels.json');

function normalizeMarketId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readApprovedChannels() {
  try {
    const raw = fs.readFileSync(APPROVED_CHANNELS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { channels: [], disabledChannelIds: [] };
    parsed.channels = Array.isArray(parsed.channels) ? parsed.channels : [];
    parsed.disabledChannelIds = Array.isArray(parsed.disabledChannelIds) ? parsed.disabledChannelIds : [];
    parsed.markets = Array.isArray(parsed.markets) ? parsed.markets : [];
    return parsed;
  } catch {
    return { channels: [], disabledChannelIds: [], markets: [] };
  }
}

function writeApprovedChannels(data) {
  fs.writeFileSync(APPROVED_CHANNELS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getApprovedChannelRules() {
  const idsRaw = process.env.DEAL_LOG_CHANNEL_IDS || '';
  const stored = readApprovedChannels();
  const ids = new Set([
    ...idsRaw.split(',').map((s) => s.trim()).filter(Boolean),
    ...stored.channels.map((c) => c.id).filter(Boolean),
  ]);
  const disabledIds = new Set(stored.disabledChannelIds.map((s) => String(s).trim()).filter(Boolean));

  const namesRaw = process.env.DEAL_LOG_CHANNEL_NAMES;
  let nameSubstrings;
  if (namesRaw == null || namesRaw.trim() === '') {
    nameSubstrings = [...DEFAULT_NAME_SUBSTRINGS];
  } else {
    nameSubstrings = namesRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }

  return { ids, disabledIds, nameSubstrings };
}

function isApprovedDealChannel(channel) {
  if (!channel || typeof channel.name !== 'string') return false;
  const { ids, disabledIds, nameSubstrings } = getApprovedChannelRules();
  if (disabledIds.has(channel.id)) return false;
  if (ids.has(channel.id)) return true;
  const lower = channel.name.toLowerCase();
  return nameSubstrings.some((sub) => sub && lower.includes(sub));
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

function marketForChannelId(channelId) {
  if (!channelId) return null;
  const id = String(channelId);
  const found = readApprovedChannels().markets.find((m) => Array.isArray(m.channelIds) && m.channelIds.includes(id));
  return found || null;
}

function marketForChannel(channel) {
  return marketForChannelId(channel?.id);
}

function inferMarketForLog(log) {
  if (log?.marketId || log?.marketName) {
    return {
      marketId: log.marketId || null,
      marketName: log.marketName || 'Unassigned',
    };
  }
  const mapped = marketForChannelId(log?.channelId);
  if (mapped) {
    return {
      marketId: mapped.marketId,
      marketName: mapped.marketName,
    };
  }
  return {
    marketId: null,
    marketName: 'Unassigned',
  };
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
    createdAt: new Date().toISOString(),
    createdBy: createdBy || null,
  };
  data.markets.push(market);
  writeApprovedChannels(data);
  return { market, alreadyExists: false };
}

function connectChannelToMarket({ channel, marketId, connectedBy = null }) {
  if (!channel || !channel.id) throw new Error('Invalid channel');
  const id = normalizeMarketId(marketId);
  if (!id) throw new Error('Market id is required');

  const data = readApprovedChannels();
  const market = data.markets.find((m) => m.marketId === id);
  if (!market) throw new Error(`Market not found: ${id}`);
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
  isApprovedDealChannel,
  getApprovedChannelRules,
  approveDealChannel,
  unapproveDealChannel,
  listApprovedDealChannels,
  approvedBlitzNameForChannel,
  listMarkets,
  addMarket,
  marketForChannelId,
  marketForChannel,
  connectChannelToMarket,
  removeChannelFromMarket,
  inferMarketForLog,
  normalizeMarketId,
  channelApprovalDiagnostics,
  DEFAULT_NAME_SUBSTRINGS,
  APPROVED_CHANNELS_PATH,
};
