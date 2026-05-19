require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const { SPEEDS } = require('./constants');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env');
  process.exit(1);
}

const speedChoices = SPEEDS.map((s) => ({
  name: s === '1gig' ? '1GIG' : s === '2gig' ? '2GIG' : s.toUpperCase(),
  value: s,
}));

const commands = [
  new SlashCommandBuilder()
    .setName('log')
    .setDescription('Log a closed fiber deal')
    .addStringOption((o) =>
      o.setName('speed').setDescription('Speed sold').setRequired(true).addChoices(...speedChoices),
    )
    .addStringOption((o) =>
      o
        .setName('customer_name')
        .setDescription('Customer name (optional)')
        .setRequired(false)
        .setMaxLength(100),
    )
    .addStringOption((o) =>
      o
        .setName('customer_phone')
        .setDescription('Customer phone (optional)')
        .setRequired(false)
        .setMaxLength(40),
    )
    .addStringOption((o) =>
      o
        .setName('customer_address')
        .setDescription('Service or customer address (optional)')
        .setRequired(false)
        .setMaxLength(300),
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Current blitz leaderboard'),

  new SlashCommandBuilder().setName('lb').setDescription('Current blitz leaderboard'),
  new SlashCommandBuilder().setName('daily').setDescription("Today's leaderboard for this blitz"),
  new SlashCommandBuilder().setName('weekly').setDescription("This week's leaderboard"),
  new SlashCommandBuilder().setName('blitz').setDescription('All-time leaderboard for this blitz'),
  new SlashCommandBuilder().setName('master').setDescription('Master leaderboard across approved blitzes'),
  new SlashCommandBuilder().setName('mydeals').setDescription('Your deal stats and ranks'),
  new SlashCommandBuilder().setName('share').setDescription('Screenshot-friendly weekly production card'),
  new SlashCommandBuilder().setName('remove-last').setDescription('Remove your most recent deal log'),
  new SlashCommandBuilder()
    .setName('correction')
    .setDescription('Correct your most recent deal speed')
    .addStringOption((o) =>
      o.setName('speed').setDescription('Correct speed sold').setRequired(true).addChoices(...speedChoices),
    ),

  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Pulse admin controls')
    .addSubcommand((s) =>
      s
        .setName('add-channel')
        .setDescription('Approve a deal channel')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to approve (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('blitz_name')
            .setDescription('Blitz leaderboard name (defaults to channel name)')
            .setMaxLength(80)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('remove-channel')
        .setDescription('Remove an approved deal channel')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to remove (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) => s.setName('list-channels').setDescription('List approved deal channels'))
    .addSubcommand((s) => s.setName('stats').setDescription('Show admin deal stats'))
    .addSubcommand((s) => s.setName('export-csv').setDescription('Export active deal logs to CSV')),

  new SlashCommandBuilder()
    .setName('reset-weekly')
    .setDescription('Archive weekly totals and advance the weekly board (admin only)'),
].map((c) => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(token);
  console.log('Deploying guild (/) commands...');
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('Done. Commands can take ~1 minute to show up in Discord.');
})();
