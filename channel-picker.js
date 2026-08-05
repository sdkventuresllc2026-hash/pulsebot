const { ChannelType } = require('discord.js');

function normalizeChannelQuery(input) {
  return String(input || '')
    .trim()
    .replace(/^<#(\d+)>$/, '$1')
    .replace(/^#/, '')
    .toLowerCase();
}

function channelSearchText(channel) {
  return [
    channel?.id,
    channel?.name,
    String(channel?.name || '').replace(/^[^a-z0-9]+/i, ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isGuildTextChannel(channel) {
  return Boolean(channel && channel.type === ChannelType.GuildText && channel.id && typeof channel.name === 'string');
}

async function fetchGuildTextChannels(guild) {
  if (!guild?.channels) return [];
  const fetched = await guild.channels.fetch().catch(() => null);
  const source = fetched || guild.channels.cache;
  return [...(source?.values?.() || [])].filter(isGuildTextChannel);
}

function buildChannelAutocompleteChoicesFromChannels(channels, query = '') {
  const q = normalizeChannelQuery(query);
  return channels
    .filter(isGuildTextChannel)
    .filter((channel) => !q || channelSearchText(channel).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((channel) => ({
      name: `#${channel.name}`.slice(0, 100),
      value: channel.id,
    }));
}

async function buildChannelAutocompleteChoices(guild, query = '') {
  const channels = await fetchGuildTextChannels(guild);
  return buildChannelAutocompleteChoicesFromChannels(channels, query);
}

async function resolveGuildTextChannel(guild, ref) {
  const raw = String(ref || '').trim();
  if (!raw) return null;

  const id = normalizeChannelQuery(raw);
  const byId = await guild?.channels?.fetch?.(id).catch(() => null);
  if (isGuildTextChannel(byId)) return byId;

  const channels = await fetchGuildTextChannels(guild);
  const q = normalizeChannelQuery(raw);
  const exactName = channels.find((channel) => channel.name.toLowerCase() === q);
  if (exactName) return exactName;

  const matches = channels.filter((channel) => channelSearchText(channel).includes(q));
  return matches.length === 1 ? matches[0] : null;
}

module.exports = {
  normalizeChannelQuery,
  isGuildTextChannel,
  buildChannelAutocompleteChoicesFromChannels,
  buildChannelAutocompleteChoices,
  resolveGuildTextChannel,
};
