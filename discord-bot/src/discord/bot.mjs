#!/usr/bin/env node
/**
 * bot.mjs — long-lived process: listens for /visualize, runs one job at a
 * time (single worktree slot), always lands the result as a PR.
 *
 * No privileged Discord intents needed — slash commands don't require
 * MESSAGE_CONTENT or gateway mention plumbing, unlike a mention-based bot.
 */

import 'dotenv/config';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, Events, EmbedBuilder } from 'discord.js';

import { runVisualize }                                        from '../agent-service/index.mjs';
import { resolveSource }                                       from '../resolve-source.mjs';
import { validateLibraryDoc }                                  from '../validate.mjs';
import { prepareWorktree, commitAndPush, removeWorktree,
         openPullRequest, makeBranchName }                      from '../git-workflow.mjs';
import { snapshotLibraryDocs, findNewLibraryDocs }              from '../find-new-library-docs.mjs';
import { createJobLogger }                                      from '../job-logger.mjs';
import { ensurePythonShim }                                     from '../python-shim.mjs';
import { buildEmbedData }                                       from './embed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR       = process.env.KAARO_REPO_PATH || path.resolve(__dirname, '../../..');
const WORKTREES_ROOT = path.join(REPO_DIR, 'discord-bot', '.worktrees');
const LOG_DIR         = path.join(REPO_DIR, 'discord-bot', 'logs');
const PYTHON_SHIM_DIR = path.join(REPO_DIR, 'discord-bot', '.bin');

// The claude-code backend alone can spend most of a run untangling a bad
// source (see resolve-source.mjs's GitHub-URL fix, born from exactly this)
// before it even starts encoding — 8 minutes was too tight in practice.
const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS) || 15 * 60 * 1000;
const HEARTBEAT_MS     = 30 * 1000;

const {
  DISCORD_BOT_TOKEN, GITHUB_TOKEN,
  GITHUB_OWNER = 'karx', GITHUB_REPO = 'kaaroViewer',
} = process.env;

if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is required (see discord-bot/.env.example).');
  process.exit(1);
}
if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN is required to open PRs (see discord-bot/.env.example).');
  process.exit(1);
}

const { pythonCmd } = await ensurePythonShim(PYTHON_SHIM_DIR);

// ── Job queue (single concurrency — one worktree slot) ─────────────────────

const queue = [];
let processing = false;

function enqueue(job) {
  queue.push(job);
  if (queue.length > 1) {
    job.interaction.followUp(`Queued — position ${queue.length}. This can take several minutes.`);
  }
  pump();
}

async function pump() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const job = queue.shift();
    await processJob(job).catch(err => console.error('[bot] job failed unexpectedly:', err));
  }
  processing = false;
}

async function processJob({ interaction, text, sourceUrl, attachmentUrl, titleSeed, docClass }) {
  const jobId      = crypto.randomUUID().slice(0, 8);
  const branchName = makeBranchName(titleSeed);
  const { log, raw, logPath } = createJobLogger(LOG_DIR, jobId);
  const backend = process.env.AGENT_BACKEND || 'claude-code';

  const status = text => { log(`STATUS: ${text}`); return interaction.editReply({ content: `⏳ ${text}`, embeds: [] }); };

  log(`job start — backend=${backend} class=${docClass} branch=${branchName} log=${logPath}`);
  log(`source: ${attachmentUrl ? `attachment ${attachmentUrl}` : sourceUrl ? `source_url ${sourceUrl}` : `text (${text.length} chars)`}`);

  let worktreeDir;
  let heartbeat;

  try {
    await status('Preparing worktree off origin/master…');
    worktreeDir = await prepareWorktree({ repoDir: REPO_DIR, worktreesRoot: WORKTREES_ROOT, branchName });
    log(`worktree ready at ${worktreeDir}`);

    await status('Resolving source…');
    const sourcePath = await resolveSource({ text, sourceUrl, attachmentUrl }, worktreeDir, fetch, log);
    log(`source written to ${sourcePath}`);

    // The B-class: marker is Step 0's contract in SKILL.md — stripped there,
    // switching to the minimalistic flow for the rest of that run. Prefixing
    // it here (rather than inside either backend) means both backends see
    // the exact same argument string, since pi-coding-agent-backend.mjs
    // substitutes this verbatim into SKILL.md's own $ARGUMENTS text.
    const sourceArg = docClass === 'B' ? `B-class: ${sourcePath}` : sourcePath;

    const beforeDocs = await snapshotLibraryDocs(worktreeDir);

    await status(`Running the ${backend} encoder (class ${docClass}) — this can take a few minutes…`);
    const startedAt = Date.now();
    heartbeat = setInterval(() => {
      status(`Still running (${backend}, class ${docClass}) — ${Math.round((Date.now() - startedAt) / 1000)}s elapsed…`);
    }, HEARTBEAT_MS);

    const agentResult = await runVisualize({
      cwd: worktreeDir, sourceArg, timeoutMs: AGENT_TIMEOUT_MS,
      onOutput: chunk => raw(chunk.text),
    });
    clearInterval(heartbeat);

    log(`agent finished: exitCode=${agentResult.exitCode} timedOut=${agentResult.timedOut}`);

    const newDocs = await findNewLibraryDocs(worktreeDir, beforeDocs);
    log(`new library docs: ${newDocs.join(', ') || '(none)'}`);

    if (newDocs.length === 0) {
      log('no library JSON produced — reporting failure');
      await reply(interaction, buildEmbedData({
        stdout: agentResult.stdout,
        validation: { status: 'unknown' },
        failure: (agentResult.timedOut
          ? `The encoder was still running after ${Math.round(AGENT_TIMEOUT_MS / 1000)}s and had to be stopped, ` +
            'and it hadn\'t written a library JSON yet.'
          : 'The encoding run finished but did not produce a library JSON file.') +
          ` Full log: \`discord-bot/logs/${jobId}.log\`\n` +
          `Last output:\n\`\`\`\n${tail(agentResult.stdout + agentResult.stderr)}\n\`\`\``,
      }));
      return;
    }

    const docId = newDocs[0];
    const note = newDocs.length > 1 ? `Multiple new docs were produced; using "${docId}".`
               : agentResult.timedOut ? `The encoder hit the ${Math.round(AGENT_TIMEOUT_MS / 1000)}s timeout ` +
                 'after writing this doc but before its final report — recovered from the worktree anyway.'
               : null;

    await status(`Validating library/${docId}.json…`);
    const validation = await validateLibraryDoc({ cwd: worktreeDir, docId, pythonCmd });
    log(`validator: ${validation.status} (exit ${validation.exitCode})`);

    await status('Committing and pushing…');
    await commitAndPush({
      worktreeDir, branchName,
      message: `docs: encode ${docId} via Discord /visualize`,
    });
    log(`pushed ${branchName}`);

    await status('Opening pull request…');
    let pr;
    try {
      pr = await openPullRequest({
        owner: GITHUB_OWNER, repo: GITHUB_REPO, branch: branchName,
        title: `Encode ${docId} (via Discord /visualize)`,
        body: `Requested by ${interaction.user.tag} in Discord.\n\nValidator: ${validation.status}.\n\n` +
              (note ? `Note: ${note}\n\n` : '') +
              '🤖 Opened automatically by the kaaroViewer Discord bot — review before merging.',
        token: GITHUB_TOKEN,
      });
      log(`opened PR #${pr.number} — ${pr.htmlUrl}`);
    } catch (prErr) {
      // The branch is already pushed at this point — don't report total
      // failure and strand it invisibly. Give back what a human needs to
      // open the PR by hand (session d0b79095's follow-up run hit exactly
      // this: push succeeded, PR creation 403'd, branch sat unreferenced).
      log(`PR creation failed (branch still pushed): ${prErr.message}`);
      const compareUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/compare/master...${branchName}?expand=1`;
      await reply(interaction, buildEmbedData({
        stdout: agentResult.stdout, validation, docId,
        note: [note, `PR creation failed (\`${prErr.message}\`) — likely GITHUB_TOKEN lacks ` +
               '"Pull requests: write". The branch pushed fine though; open it manually:'].filter(Boolean).join(' '),
        prUrl: compareUrl,
        owner: GITHUB_OWNER, repo: GITHUB_REPO,
      }));
      return;
    }

    await reply(interaction, buildEmbedData({
      stdout: agentResult.stdout, validation, docId, note,
      prNumber: pr.number, prUrl: pr.htmlUrl,
      owner: GITHUB_OWNER, repo: GITHUB_REPO,
    }));
  } catch (err) {
    clearInterval(heartbeat);
    log(`job error: ${err.stack || err.message}`);
    await reply(interaction, buildEmbedData({
      stdout: '', validation: { status: 'unknown' },
      failure: `\`${err.message}\`\nFull log: \`discord-bot/logs/${jobId}.log\``,
    }));
  } finally {
    clearInterval(heartbeat);
    if (worktreeDir) {
      await removeWorktree({ repoDir: REPO_DIR, worktreeDir }).catch(
        e => log(`worktree cleanup failed: ${e.message}`),
      );
    }
    log('job done');
  }
}

function tail(str, maxLen = 1500) {
  return str.length > maxLen ? '…' + str.slice(-maxLen) : str;
}

/**
 * Terminal reply for a job — replaces the "thinking…"/status placeholder.
 * Interim status (heartbeats, the queue-position notice) uses editReply
 * with plain content or followUp instead, since neither is the last word.
 */
async function reply(interaction, embedData) {
  const embed = new EmbedBuilder()
    .setTitle(embedData.title)
    .setColor(embedData.color ?? 0x808080);
  if (embedData.url) embed.setURL(embedData.url);
  if (embedData.description) embed.setDescription(embedData.description);
  if (embedData.fields?.length) embed.addFields(embedData.fields);

  await interaction.editReply({ content: null, embeds: [embed] });
}

// ── Discord client ──────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'visualize') return;

  const text          = interaction.options.getString('text');
  const sourceUrl      = interaction.options.getString('source_url');
  const attachmentUrl  = interaction.options.getAttachment('attachment')?.url ?? null;
  const docClass       = interaction.options.getString('class') || 'B';

  if (!text && !sourceUrl && !attachmentUrl) {
    await interaction.reply({
      content: 'Provide `text`, `attachment`, or `source_url` — at least one is required.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const titleSeed = attachmentUrl ? interaction.options.getAttachment('attachment').name
                   : sourceUrl ? sourceUrl
                   : text.slice(0, 40);

  console.log(`[bot] /visualize (class ${docClass}) from ${interaction.user.tag} in guild ${interaction.guildId}`);
  enqueue({ interaction, text, sourceUrl, attachmentUrl, titleSeed, docClass });
});

client.once(Events.ClientReady, c => console.log(`[bot] ready as ${c.user.tag}`));
client.login(DISCORD_BOT_TOKEN);
