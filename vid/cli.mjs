#!/usr/bin/env node
/**
 * kaaro-vid — CLI surface of the video agent tool layer (VIDEO_AGENT_PLAN.md §5).
 *
 *   kaaro-vid probe <asset...>                        media inspection (JSON)
 *   kaaro-vid new <id> [--out timeline.json]          scaffold a Timeline
 *   kaaro-vid render <timeline.json> [--out final.mp4] [--work dir] [--dry-run]
 *   kaaro-vid verify <final.mp4> --timeline <timeline.json>
 *   kaaro-vid scene <scene.mjs> --duration 3 [--params '{"title":"Hi"}'] [--out dir]
 *
 * Every command is non-interactive and exit-code honest: 0 success,
 * 1 failure (including a failed verify). Designed to be driven by an
 * agent as much as by a human.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { probe } from './probe.mjs';
import { createTimeline, parseTimeline } from './timeline.mjs';
import { compile, describePlan } from './compiler.mjs';
import { executePlan } from './render.mjs';
import { verifyDeliverable, formatChecks } from './verify.mjs';
import { libraryToTimeline } from './beats.mjs';
import { createTrace, saveTrace, loadTrace, attachVerification, formatTrace } from './trace.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

const USAGE = `usage:
  kaaro-vid probe <asset...>
  kaaro-vid new <id> [--out timeline.json] [--fps 30] [--width 1280] [--height 720]
  kaaro-vid beats <library-id> [--out timeline.json] [--fps 24] [--width 1280] [--height 720] [--library dir]
  kaaro-vid render <timeline.json> [--out final.mp4] [--work dir] [--dry-run] [--trace trace.json]
  kaaro-vid verify <deliverable> --timeline <timeline.json> [--trace trace.json]
  kaaro-vid scene <scene.mjs> --duration <sec> [--params <json>] [--fps 30] [--width 1280] [--height 720] [--out dir]
  kaaro-vid trace <trace.json>`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (cmd) {
    case 'probe': {
      if (!args._.length) throw new Error('probe: at least one asset path required');
      const results = {};
      for (const path of args._) results[path] = await probe(path);
      console.log(JSON.stringify(args._.length === 1 ? results[args._[0]] : results, null, 2));
      return 0;
    }

    case 'new': {
      const id = args._[0];
      if (!id) throw new Error('new: an id is required');
      const t = createTimeline({
        id,
        fps: Number(args.fps ?? 30),
        width: Number(args.width ?? 1280),
        height: Number(args.height ?? 720),
      });
      const out = args.out ?? `${id}.timeline.json`;
      await writeFile(out, JSON.stringify(t, null, 2) + '\n');
      console.log(`timeline scaffolded → ${out}`);
      return 0;
    }

    case 'beats': {
      const libraryId = args._[0];
      if (!libraryId) throw new Error('beats: a library id is required (see pipeline/local-graph.mjs LIBRARY)');
      const t = await libraryToTimeline(libraryId, {
        libraryDir: args.library ?? 'library',
        fps: Number(args.fps ?? 24),
        width: Number(args.width ?? 1280),
        height: Number(args.height ?? 720),
      });
      const out = args.out ?? `${t.meta.id}.timeline.json`;
      await writeFile(out, JSON.stringify(t, null, 2) + '\n');
      const total = t.tracks[0].clips.reduce((s, c) => s + c.source.duration, 0);
      console.log(`story timeline: ${t.tracks[0].clips.length} clips, ~${Math.round(total)}s → ${out}`);
      return 0;
    }

    case 'render': {
      const file = args._[0];
      if (!file) throw new Error('render: a timeline.json path is required');
      const timeline = JSON.parse(await readFile(file, 'utf8'));
      const plan = compile(timeline, {
        workDir: args.work ?? '.kaaro-vid/work',
        output: args.out,
      });
      console.log(describePlan(plan));
      if (args['dry-run']) return 0;

      const trace = createTrace({ timelineId: plan.timeline.meta.id });
      trace.operations.push({ op: 'compile', args: { timeline: file }, startedAt: trace.startedAt, ms: 0, ok: true, result: { steps: plan.steps.map(s => s.kind), output: plan.output } });
      try {
        await executePlan(plan, {
          onStep: (step, i) => console.log(`▶ step ${i + 1}/${plan.steps.length}: ${step.kind}${step.clipId ? ` (${step.clipId})` : ''}`),
          onStepDone: (step, i, ms) => trace.operations.push({ op: `step:${step.kind}`, args: step.clipId ? { clipId: step.clipId } : {}, startedAt: null, ms, ok: true }),
        });
      } finally {
        const tracePath = args.trace ?? `${plan.output}.trace.json`;
        await saveTrace(trace, tracePath);
        console.log(`trace → ${tracePath}`);
      }
      console.log(`rendered → ${plan.output}`);
      return 0;
    }

    case 'verify': {
      const file = args._[0];
      if (!file || !args.timeline) throw new Error('verify: <deliverable> --timeline <timeline.json> required');
      const timeline = parseTimeline(JSON.parse(await readFile(args.timeline, 'utf8')));
      const result = await verifyDeliverable(file, timeline);
      console.log(formatChecks(result));

      const tracePath = args.trace ?? `${file}.trace.json`;
      if (existsSync(tracePath)) {
        const trace = attachVerification(await loadTrace(tracePath), result);
        await saveTrace(trace, tracePath);
        console.log(`trace updated (golden=${trace.golden}) → ${tracePath}`);
      }
      return result.ok ? 0 : 1;
    }

    case 'trace': {
      const file = args._[0];
      if (!file) throw new Error('trace: a trace.json path is required');
      console.log(formatTrace(await loadTrace(file)));
      return 0;
    }

    case 'scene': {
      const scenePath = args._[0];
      if (!scenePath || !args.duration) throw new Error('scene: <scene.mjs> --duration <sec> required');
      const { renderScene } = await import('./harness.mjs');
      const result = await renderScene(scenePath, {
        params: args.params ? JSON.parse(args.params) : {},
        duration: Number(args.duration),
        fps: Number(args.fps ?? 30),
        width: Number(args.width ?? 1280),
        height: Number(args.height ?? 720),
        outDir: args.out ?? '.kaaro-vid/scene',
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    default:
      console.error(USAGE);
      return cmd ? (console.error(`\nunknown command: ${cmd}`), 1) : 1;
  }
}

main().then(
  code => process.exit(code),
  err => { console.error(`kaaro-vid: ${err.message}`); process.exit(1); },
);
