/**
 * Which text channels accept natural-language deal lines.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_NAME_SUBSTRINGS = ['virginia-deals', 'greenville-deals'];
const APPROVED_CHANNELS_PATH = path.join(__dirname, 'approved-blitz-channels.json');

function readApprovedChannels() {
  try {
    const raw = fs.readFileSync(APPROVED_CHANNELS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { channels: [], disabledChannelIds: [] };
    parsed.channels = Array.isArray(parsed.channels) ? parsed.channels : [];
    parsed.disabledChannelIds = Array.isArray(parsed.disabledChannelIds) ? parsed.disabledChannelIds : [];
    return parsed;
  } catch {
    return { channels: [], disabledChannelIds: [] };
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

module.exports = {
  isApprovedDealChannel,
  getApprovedChannelRules,
  approveDealChannel,
  unapproveDealChannel,
  listApprovedDealChannels,
  approvedBlitzNameForChannel,
  DEFAULT_NAME_SUBSTRINGS,
  APPROVED_CHANNELS_PATH,
};
