/**
 * pi-coding-agent-backend.mjs — runs /visualize via the `pi` CLI
 * (@earendil-works/pi-coding-agent, formerly @mariozechner/pi-coding-agent).
 *
 * pi has no notion of Claude Code's `.claude/skills` loader, so unlike the
 * claude-code backend it can't just say "/visualize <arg>" — it needs the
 * SOP spelled out as one literal prompt. The SOP text itself still lives in
 * exactly one place (.claude/skills/visualize/), read fresh on every run so
 * the two backends can never drift apart.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { spawnCapture } from './spawn-capture.mjs';

const SKILL_DIR = '.claude/skills/visualize';

async function buildPrompt(cwd, sourceArg) {
  const skillMd = await readFile(path.join(cwd, SKILL_DIR, 'SKILL.md'), 'utf8');
  const sopRef  = await readFile(path.join(cwd, SKILL_DIR, 'sop-reference.md'), 'utf8');

  // SKILL.md's Step 0 already explains how to interpret $ARGUMENTS (a file
  // path vs. raw text) — substitute it literally rather than re-deriving
  // that logic here.
  const skillBody = skillMd.replace(/\$ARGUMENTS/g, sourceArg);

  return [
    'You are running the kaaroViewer /visualize encoding skill directly ' +
      '(no Claude Code skill loader available in this environment). ' +
      'Follow every step below exactly, using your Read/Write/Edit/Bash tools ' +
      'against the current working directory, which is a kaaroViewer checkout.',
    '--- SKILL.md ---',
    skillBody,
    '--- sop-reference.md (ontology + visual reference, load before Step 2a) ---',
    sopRef,
  ].join('\n\n');
}

/**
 * @param {{ cwd: string, sourceArg: string, timeoutMs?: number, env?: object,
 *           onOutput?: Function }} job
 * @param {typeof spawnCapture} spawnFn — injectable for tests
 * @param {typeof buildPrompt} promptFn — injectable for tests
 */
export async function runPiCodingAgent(
  { cwd, sourceArg, timeoutMs, env, onOutput },
  spawnFn = spawnCapture,
  promptFn = buildPrompt,
) {
  const prompt = await promptFn(cwd, sourceArg);

  const args = ['-p', prompt];
  if (process.env.PI_PROVIDER) args.push('--provider', process.env.PI_PROVIDER);
  if (process.env.PI_MODEL)    args.push('--model', process.env.PI_MODEL);
  if (process.env.PI_API_KEY)  args.push('--api-key', process.env.PI_API_KEY);

  const result = await spawnFn('pi', args, { cwd, timeoutMs, env, onOutput });
  return { backend: 'pi-coding-agent', ...result };
}
