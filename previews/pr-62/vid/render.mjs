/**
 * vid/render.mjs — executes a Render plan produced by vid/compiler.mjs.
 *
 * The harness is imported lazily so media-only renders (no generator
 * clips) never require playwright-core to be installed.
 */

import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { transcode, trim, concat, xfadeConcat, framesToVideo, muxAudio, mixAudioIntoVideo } from './media-core.mjs';

/**
 * Run every step of a plan in order. onStep(step, index) fires before each
 * step, onStepDone(step, index, ms) after it — the CLI uses them for
 * progress output and trace timing. Returns plan.output.
 */
export async function executePlan(plan, { onStep, onStepDone } = {}) {
  await mkdir(plan.workDir, { recursive: true });

  for (const [i, step] of plan.steps.entries()) {
    onStep?.(step, i);
    const t0 = Date.now();
    switch (step.kind) {
      case 'generator': {
        const { renderScene } = await import('./harness.mjs');
        const { framesPattern, audioPath } = await renderScene(step.scene, {
          params: step.params,
          duration: step.duration,
          fps: step.fps, width: step.width, height: step.height,
          outDir: step.framesDir,
        });
        const videoOnly = join(step.framesDir, 'video-only.mp4');
        await framesToVideo(framesPattern, videoOnly, {
          fps: step.fps, vcodec: step.target.vcodec, crf: step.target.crf,
        });
        if (audioPath) {
          await muxAudio(videoOnly, audioPath, step.out, { acodec: step.target.acodec });
        } else {
          // keep concat inputs uniform: give the clip a silent audio track
          await transcode(videoOnly, step.out, { ensureAudio: true, acodec: step.target.acodec, crf: step.target.crf });
        }
        break;
      }
      case 'normalize': {
        const cut = step.outSec != null || (step.in ?? 0) > 0
          ? await trim(step.src, step.out + '.cut.mp4', {
              inSec: step.in ?? 0,
              outSec: step.outSec,
              vcodec: step.target.vcodec, acodec: step.target.acodec, crf: step.target.crf,
            })
          : step.src;
        await transcode(cut, step.out, { ...step.target, ensureAudio: true });
        break;
      }
      case 'concat':
        await concat(step.inputs, step.out);
        break;
      case 'xfade':
        await xfadeConcat(step.inputs, step.transitions, step.out, {
          fps: step.fps, vcodec: step.vcodec, acodec: step.acodec, crf: step.crf,
        });
        break;
      case 'audiomix':
        await mixAudioIntoVideo(step.video, step.clips, step.out, { acodec: step.acodec });
        break;
      case 'finalize':
        await mkdir(dirname(step.out), { recursive: true });
        await copyFile(step.src, step.out);
        break;
      default:
        throw new Error(`executePlan: unknown step kind "${step.kind}"`);
    }
    onStepDone?.(step, i, Date.now() - t0);
  }
  return plan.output;
}
