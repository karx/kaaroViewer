/**
 * vid/compiler.mjs — Timeline → Render plan.
 *
 * Pure: takes a (validated) timeline + workDir and returns the ordered
 * list of concrete steps the executor (vid/render.mjs) will run. No
 * filesystem or subprocess access here, so plans are unit-testable and
 * dry-runnable (`kaaro-vid render --dry-run` prints exactly this).
 *
 * Step kinds:
 *   generator — run a Scene Script in the render harness → frames → clip video
 *   normalize — trim + transcode an asset clip to the uniform intermediate spec
 *   concat    — join normalized clips into the sequence
 *   audiomix  — mix audio-track clips under the sequence → final
 *   finalize  — no audio tracks: the sequence becomes the deliverable
 */

import { join } from 'node:path';
import { parseTimeline } from './timeline.mjs';

export function compile(timelineInput, { workDir = '.kaaro-vid/work', output } = {}) {
  const t = parseTimeline(timelineInput);
  const { fps, width, height } = t.meta;
  const { container, vcodec, acodec, crf } = t.deliverable;

  const videoTrack = t.tracks.find(tr => tr.kind === 'video');
  if (videoTrack.clips.length === 0) throw new Error('compile: video track has no clips');
  const audioClips = t.tracks
    .filter(tr => tr.kind === 'audio')
    .flatMap(tr => tr.clips)
    .map(c => ({ path: c.source.path, in: c.source.in, out: c.source.out, gain: c.gain, at: c.at ?? 0 }));

  const steps = [];
  const target = { fps, width, height, vcodec, acodec, crf };
  const normalized = [];

  videoTrack.clips.forEach((clip, i) => {
    const out = join(workDir, `clip_${String(i).padStart(2, '0')}_${clip.id}.mp4`);
    normalized.push(out);
    if (clip.source.kind === 'generator') {
      steps.push({
        kind: 'generator', clipId: clip.id,
        scene: clip.source.scene, params: clip.source.params,
        duration: clip.source.duration,
        fps, width, height,
        framesDir: join(workDir, `frames_${clip.id}`),
        out, target,
      });
    } else {
      steps.push({
        kind: 'normalize', clipId: clip.id,
        src: clip.source.path, in: clip.source.in, outSec: clip.source.out,
        out, target,
      });
    }
  });

  const sequence = join(workDir, 'sequence.mp4');
  steps.push({ kind: 'concat', inputs: [...normalized], out: sequence });

  const finalOut = output ?? join(workDir, `${t.meta.id}.${container}`);
  if (audioClips.length) {
    steps.push({ kind: 'audiomix', video: sequence, clips: audioClips, out: finalOut, acodec });
  } else {
    steps.push({ kind: 'finalize', src: sequence, out: finalOut });
  }

  return { timeline: t, workDir, output: finalOut, steps };
}

/** Human-readable plan listing for dry runs and agent transcripts. */
export function describePlan(plan) {
  const lines = plan.steps.map((s, i) => {
    switch (s.kind) {
      case 'generator': return `${i + 1}. generator  ${s.clipId}: ${s.scene} (${s.duration}s @ ${s.fps}fps ${s.width}x${s.height}) → ${s.out}`;
      case 'normalize': return `${i + 1}. normalize  ${s.clipId}: ${s.src} [${s.in ?? 0}${s.outSec != null ? `–${s.outSec}` : '…'}] → ${s.out}`;
      case 'concat':    return `${i + 1}. concat     ${s.inputs.length} clips → ${s.out}`;
      case 'audiomix':  return `${i + 1}. audiomix   ${s.clips.length} audio clips under ${s.video} → ${s.out}`;
      case 'finalize':  return `${i + 1}. finalize   ${s.src} → ${s.out}`;
      default:          return `${i + 1}. ${s.kind}`;
    }
  });
  return [`Render plan for "${plan.timeline.meta.id}" → ${plan.output}`, ...lines].join('\n');
}
