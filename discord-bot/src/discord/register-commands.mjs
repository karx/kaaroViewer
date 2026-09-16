#!/usr/bin/env node
/**
 * register-commands.mjs — one-shot: registers the /visualize slash command.
 *
 * Run once after creating the Discord application, and again any time the
 * command's options change. Guild-scoped (DISCORD_GUILD_ID set) propagates
 * in seconds; global (unset) can take up to an hour.
 */

import 'dotenv/config';
import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required (see .env.example).');
  process.exit(1);
}

const visualizeCommand = {
  name: 'visualize',
  description: 'Encode a document into a kaaroViewer intelligence brief (opens a PR for review).',
  options: [
    {
      name: 'text',
      description: 'Inline markdown/text to encode',
      type: ApplicationCommandOptionType.String,
      required: false,
    },
    {
      name: 'attachment',
      description: 'A .md/.txt file to encode',
      type: ApplicationCommandOptionType.Attachment,
      required: false,
    },
    {
      name: 'source_url',
      description: 'A URL to fetch and encode',
      type: ApplicationCommandOptionType.String,
      required: false,
    },
    {
      name: 'class',
      description: 'Encoding depth — minimalistic (fast, default) or full library-grade (slower)',
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: 'Minimalistic — fast draft (default)', value: 'B' },
        { name: 'Full — library-grade, slower', value: 'A' },
      ],
    },
  ],
};

const rest = new REST().setToken(DISCORD_BOT_TOKEN);

const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

const data = await rest.put(route, { body: [visualizeCommand] });
console.log(`Registered ${data.length} command(s)${DISCORD_GUILD_ID ? ' (guild-scoped)' : ' (global)'}.`);
