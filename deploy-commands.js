require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
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
    // Visibility gate only. canUseAdminCommands is still the security boundary - a Discord
    // default can be changed in Server Settings, so it can never be the sole check.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a market AND wire up its channel in one step')
        .addStringOption((o) => o.setName('name').setDescription('Market name, e.g. Ashtabula').setRequired(true).setMaxLength(80))
        // The id is IMMUTABLE once deal logs carry it. Supplying it explicitly is what prevents
        // another Ashtabula, whose permanent id is "new-york" for an Ohio market.
        .addStringOption((o) => o.setName('id').setDescription('Operational id, e.g. wilmington-nc (defaults to the name)').setRequired(false).setMaxLength(40))
        .addStringOption((o) => o.setName('city').setDescription('City, e.g. Wilmington').setRequired(false).setMaxLength(60))
        .addStringOption((o) => o.setName('state').setDescription('State, e.g. NC').setRequired(false).setMaxLength(30))
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
    .addSubcommand((s) =>
      s
        .setName('rename')
        .setDescription('Fix a market name (e.g. "New York" -> "Ashtabula")')
        .addStringOption((o) => o.setName('market').setDescription('Which market').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('name').setDescription('Correct name, e.g. Ashtabula').setRequired(true).setMaxLength(80)),
    )
    .addSubcommand((s) =>
      s
        .setName('cleanup')
        .setDescription('Delete every market whose channel no longer exists')
        .addBooleanOption((o) => o.setName('confirm').setDescription('Set true to actually delete (otherwise just previews)').setRequired(false)),
    )
    // Manager AUTHORITY. Owner/Admin only — a manager who could grant themselves a market would
    // make scoping meaningless. Targets are always a Discord user object, so authority is keyed on
    // an immutable user id, never a nickname or display name.
    .addSubcommand((s) =>
      s
        .setName('manager-add')
        .setDescription('OWNER: give a Manager authority over a market')
        .addUserOption((o) => o.setName('user').setDescription('Must already hold the Manager role').setRequired(true))
        .addStringOption((o) => o.setName('market').setDescription('Which market').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('manager-remove')
        .setDescription('OWNER: revoke a Manager’s authority over ONE market')
        .addUserOption((o) => o.setName('user').setDescription('Manager to revoke').setRequired(true))
        .addStringOption((o) => o.setName('market').setDescription('Which market').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('manager-list')
        .setDescription('OWNER: who manages a market')
        .addStringOption((o) => o.setName('market').setDescription('Which market').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('manager-markets')
        .setDescription('OWNER: which markets a person manages')
        .addUserOption((o) => o.setName('user').setDescription('Manager to inspect').setRequired(true)),
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

  // Everything market-related moved to /market. What is left is genuinely admin-only and has no
  // natural home there: runtime health, deal stats, and the CSV export.
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Pulse admin controls')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('status').setDescription('Pulse runtime and storage status'))
    // The gate before MANAGER_SCOPING_ENABLED=true. Must run in production — anything that reads
    // market records is meaningless off the /data volume.
    .addSubcommand((s) => s.setName('readiness').setDescription('Can Manager scoping be safely enabled?'))
    .addSubcommand((s) => s.setName('stats').setDescription('Deal stats'))
    .addSubcommand((s) => s.setName('export-csv').setDescription('Export active deal logs to CSV')),
  new SlashCommandBuilder()
    .setName('reset-weekly')
    .setDescription('Archive weekly totals and advance the weekly board (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(token);
  console.log('Deploying guild (/) commands...');
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('Done. Commands can take ~1 minute to show up in Discord.');
})();
