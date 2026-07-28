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

/** Autocomplete-enabled market picker (assign, connect, delete, edit). */
function marketIdOption(required = true) {
  return (o) => {
    let opt = o
      .setName('market_id')
      .setDescription('Pick from list or type market id / name')
      .setMaxLength(80)
      .setAutocomplete(true);
    if (required) opt = opt.setRequired(true);
    return opt;
  };
}

const commands = [
  // ONE discoverable home for the whole market workflow. Everything here already existed, but it
  // was scattered: market setup buried inside /admin next to unrelated things like export-csv,
  // while assign-rep / unassign-rep / sync-permissions floated at the top level. Nobody could find
  // "how do I make a market and connect a channel" by guessing. Type /market and the whole
  // workflow is right there.
  new SlashCommandBuilder()
    .setName('market')
    .setDescription('Markets: create one, add reps, see who is where')
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a market AND wire up its channel in one step')
        .addStringOption((o) => o.setName('name').setDescription('Market name, e.g. Ashtabula').setRequired(true).setMaxLength(80))
        .addChannelOption((o) => o.setName('channel').setDescription('Its blitz channel (defaults to this one)').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption((o) => o.setName('isp').setDescription('Optional ISP label, e.g. T-Fiber').setRequired(false)),
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a rep to a market and set their real name')
        .addUserOption((o) => o.setName('rep').setDescription('Who to add').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Their REAL name, e.g. Riley Graves').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('market').setDescription('Which market').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('handle').setDescription('What they go by, e.g. Mooch (optional)').setRequired(false).setMaxLength(20)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove a rep from all markets')
        .addUserOption((o) => o.setName('rep').setDescription('Who to remove').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('All markets and their channels'))
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Which market a channel belongs to')
        .addChannelOption((o) => o.setName('channel').setDescription('Defaults to this channel').addChannelTypes(ChannelType.GuildText).setRequired(false)),
    )
    .addSubcommand((s) => s.setName('sync').setDescription('Re-lock every market channel to its own market')),

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
    .setDescription('Market leaderboard for this channel')
    .addStringOption((o) =>
      o
        .setName('period')
        .setDescription('Time period (default: today)')
        .setRequired(false)
        .addChoices(
          { name: 'Today', value: 'daily' },
          { name: 'Yesterday', value: 'yesterday' },
          { name: 'This Week', value: 'weekly' },
          { name: 'Last Week', value: 'lastweek' },
          { name: 'This Month', value: 'monthly' },
          { name: 'Last Month', value: 'lastmonth' },
          { name: 'All-Time', value: 'alltime' },
        ),
    ),

  new SlashCommandBuilder().setName('daily').setDescription("Today's market leaderboard"),
  new SlashCommandBuilder().setName('yesterday').setDescription("Yesterday's market leaderboard"),
  new SlashCommandBuilder().setName('weekly').setDescription("This week's market leaderboard"),
  new SlashCommandBuilder().setName('lastweek').setDescription("Last week's market leaderboard"),
  new SlashCommandBuilder().setName('monthly').setDescription("This month's market leaderboard"),
  new SlashCommandBuilder().setName('lastmonth').setDescription("Last month's market leaderboard"),
  new SlashCommandBuilder().setName('blitz').setDescription('All-time market leaderboard'),
  new SlashCommandBuilder()
    .setName('master')
    .setDescription('Master leaderboard across all approved markets')
    .addStringOption((o) =>
      o
        .setName('period')
        .setDescription('Time period (default: today)')
        .setRequired(false)
        .addChoices(
          { name: 'Today', value: 'daily' },
          { name: 'Yesterday', value: 'yesterday' },
          { name: 'This Week', value: 'weekly' },
          { name: 'Last Week', value: 'lastweek' },
          { name: 'This Month', value: 'monthly' },
          { name: 'Last Month', value: 'lastmonth' },
          { name: 'All-Time', value: 'alltime' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('quarter')
    .setDescription('Current sales quarter (Q1–Q4) + culture check-in'),

  new SlashCommandBuilder().setName('markets').setDescription('Market board (today + this week)'),
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
        .setName('add-market')
        .setDescription('Create or update a market')
        .addStringOption((o) =>
          o
            .setName('market_name')
            .setDescription('Market display name (e.g. New Haven CT)')
            .setRequired(true)
            .setMaxLength(80),
        )
        .addStringOption((o) =>
          o
            .setName('market_id')
            .setDescription('Optional market id (slug). Defaults from market name.')
            .setRequired(false)
            .setMaxLength(80),
        )
        .addStringOption((o) =>
          o
            .setName('isp')
            .setDescription('Optional ISP label')
            .setRequired(false)
            .setMaxLength(80),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('edit-market')
        .setDescription('Rename a market or update ISP label')
        .addStringOption(marketIdOption(true))
        .addStringOption((o) =>
          o.setName('market_name').setDescription('New display name').setRequired(false).setMaxLength(80),
        )
        .addStringOption((o) =>
          o.setName('isp').setDescription('New ISP label (optional)').setRequired(false).setMaxLength(80),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('connect-channel')
        .setDescription('Connect a channel to a market')
        .addStringOption(marketIdOption(true))
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to connect (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('market-status')
        .setDescription('Show market mapping for one channel')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to inspect (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s.setName('list-markets').setDescription('List markets and mapped channels'),
    )
    .addSubcommand((s) =>
      s
        .setName('delete-market')
        .setDescription('Delete a market from Pulse (unmap channels)')
        .addStringOption(marketIdOption(true))
        .addBooleanOption((o) =>
          o
            .setName('delete_discord_role')
            .setDescription('Also delete the Pulse market Discord role')
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('remove-channel')
        .setDescription('Remove an approved deal channel and market mapping')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to remove (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('assign-rep')
        .setDescription('Assign a rep to one market (hides other market channels)')
        .addUserOption((o) =>
          o.setName('rep').setDescription('Rep to assign').setRequired(true),
        )
        .addStringOption(marketIdOption(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('unassign-rep')
        .setDescription('Remove all Pulse market roles from a rep')
        .addUserOption((o) =>
          o.setName('rep').setDescription('Rep to unassign').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('sync-permissions')
        .setDescription('Re-lock all market channels (hide from other markets)'),
    )
    .addSubcommand((s) => s.setName('list-channels').setDescription('List approved deal channels'))
    .addSubcommand((s) => s.setName('status').setDescription('Show Pulse runtime and storage status'))
    .addSubcommand((s) => s.setName('stats').setDescription('Show admin deal stats'))
    .addSubcommand((s) => s.setName('export-csv').setDescription('Export active deal logs to CSV')),

  new SlashCommandBuilder()
    .setName('assign-rep')
    .setDescription('Assign a rep to a market (admin)')
    .addUserOption((o) => o.setName('rep').setDescription('Rep to assign').setRequired(true))
    .addStringOption(marketIdOption(true)),

  new SlashCommandBuilder()
    .setName('unassign-rep')
    .setDescription('Remove Pulse market roles from a rep (admin)')
    .addUserOption((o) => o.setName('rep').setDescription('Rep to unassign').setRequired(true)),

  new SlashCommandBuilder()
    .setName('sync-permissions')
    .setDescription('Re-lock all market channels to market roles (admin)'),

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
