/**
 * Posts the one-time "set your real name" message into #welcome and pins it.
 *
 * DELIBERATELY NOT A MARKET PICKER (owner decision 2026-07-28). Letting people choose their own
 * market means someone lands in the wrong channel, or one they should not be able to see. This
 * only answers "who is dboy1011?" — a manager still adds them to a market with /market add.
 *
 * Safe to re-run: it deletes any previous prompt it posted before posting a fresh one, so you
 * never end up with two.
 *
 *   node scripts/post-name-prompt.js            # preview the text, post nothing
 *   node scripts/post-name-prompt.js --post     # post it and pin it
 */
require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const POST = process.argv.includes('--post');
const SET_NAME_ID = 'pulse:setname';
const CHANNEL = process.env.NAME_PROMPT_CHANNEL || 'welcome';

// Owner 2026-10-16: plain voice, no emoji. The live pin was edited in place to this text.
const embed = new EmbedBuilder()
  .setTitle('Set your name')
  .setDescription(
    [
      'Tap **Set My Name** and enter your first and last name. It takes ten seconds.',
      '',
      'This is how your manager finds you and opens your market channel.',
      '',
      'You can add a nickname too, for example: Anthony Mucciolo (Mooch).',
    ].join('\n'),
  )
  .setFooter({ text: 'You can change it any time with the same button.' });

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(SET_NAME_ID).setLabel('Set My Name').setStyle(ButtonStyle.Primary),
);

(async () => {
  if (!POST) {
    console.log(`Would post to #${CHANNEL} with a "Set My Name" button:\n`);
    console.log(embed.data.title);
    console.log(embed.data.description);
    console.log(`\nNothing posted. Run with --post to do it.`);
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const ready = new Promise((r) => { client.once('clientReady', r); client.once('ready', r); });
  await client.login(process.env.DISCORD_TOKEN);
  await ready;
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();
  const channel = guild.channels.cache.find((c) => c.name === CHANNEL && c.isTextBased?.());
  if (!channel) throw new Error(`No #${CHANNEL} channel found. Set NAME_PROMPT_CHANNEL to override.`);

  // Idempotent: clear any prompt this script posted before, so re-running never duplicates it.
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  for (const m of recent?.values() ?? []) {
    const isOurs = m.author.id === client.user.id && m.components?.some((r) => r.components?.some((c) => c.customId === SET_NAME_ID));
    if (isOurs) { await m.delete().catch(() => {}); console.log('removed a previous prompt'); }
  }

  const sent = await channel.send({ embeds: [embed], components: [row] });
  await sent.pin().catch((e) => console.log(`(could not pin: ${e.message})`));
  console.log(`✓ posted and pinned in #${channel.name}`);
  await client.destroy();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
