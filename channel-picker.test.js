const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');

const {
  buildChannelAutocompleteChoicesFromChannels,
  normalizeChannelQuery,
  resolveGuildTextChannel,
} = require('./channel-picker');

function textChannel(id, name) {
  return { id, name, type: ChannelType.GuildText };
}

test('channel_ref autocomplete finds a new market channel by visible name', () => {
  const choices = buildChannelAutocompleteChoicesFromChannels(
    [
      textChannel('1', 'jacksonville'),
      textChannel('2', 'goldsboro'),
      textChannel('3', 'management'),
    ],
    'Goldsboro',
  );

  assert.deepEqual(choices, [{ name: '#goldsboro', value: '2' }]);
});

test('channel_ref normalizes mentions and leading hash marks', () => {
  assert.equal(normalizeChannelQuery('#goldsboro'), 'goldsboro');
  assert.equal(normalizeChannelQuery('<#1234567890>'), '1234567890');
});

test('resolveGuildTextChannel accepts id, exact name, and single fuzzy match', async () => {
  const channels = [textChannel('10', 'goldsboro'), textChannel('20', 'wilmington-nc')];
  const guild = {
    channels: {
      cache: new Map(channels.map((channel) => [channel.id, channel])),
      fetch: async (id) => {
        if (id) return channels.find((channel) => channel.id === id) || null;
        return new Map(channels.map((channel) => [channel.id, channel]));
      },
    },
  };

  assert.equal((await resolveGuildTextChannel(guild, '10')).name, 'goldsboro');
  assert.equal((await resolveGuildTextChannel(guild, '#goldsboro')).id, '10');
  assert.equal((await resolveGuildTextChannel(guild, 'wilming')).id, '20');
});
