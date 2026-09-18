/**
 * vid/harness.mjs — the Render harness (VIDEO_AGENT_PLAN.md §4.2).
 *
 * Executes a Scene Script in headless Chromium (real Canvas 2D / WebGL /
 * OfflineAudioContext) and emits a PNG frame sequence plus an optional
 * offline-rendered WAV. Deterministic by contract: frames are pulled by
 * frame index, never by wall clock.
 *
 * Scene Script contract — an ES module, self-contained (no imports),
 * exporting:
 *   init(env)        optional, async — one-time setup. env = { canvas, ctx,
 *                    width, height, duration, fps, params }
 *   renderFrame(env) required for visual scenes — draw frame at env.t
 *                    (seconds). Also gets env.frame (index).
 *   renderAudio(offlineCtx, env) optional — schedule Web Audio nodes on the
 *                    OfflineAudioContext; the harness renders it offline.
 *
 * Chromium resolution order: KAARO_CHROMIUM env → playwright-core's own
 * download → /opt/pw-browsers/chromium (this environment's pre-install).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function resolveChromium(chromium) {
  if (process.env.KAARO_CHROMIUM) return process.env.KAARO_CHROMIUM;
  try {
    const own = chromium.executablePath();
    if (own && existsSync(own)) return own;
  } catch { /* fall through */ }
  const preinstalled = '/opt/pw-browsers/chromium';
  if (existsSync(preinstalled)) return preinstalled;
  throw new Error('no Chromium found: set KAARO_CHROMIUM or run "npx playwright-core install chromium"');
}

/**
 * Render a Scene Script.
 * Returns { framesPattern, frameCount, audioPath } — framesPattern is a
 * printf-style path ready for media-core.framesToVideo(); audioPath is
 * null when the scene has no renderAudio export.
 *
 * frameTimes: optional array of exact times (seconds) to render instead
 * of the full fps sequence — used for stills, golden frames, and visual
 * regression probes. Audio is skipped in this mode.
 */
export async function renderScene(scenePath, {
  params = {}, duration, fps = 30, width = 1280, height = 720,
  outDir, sampleRate = 48000, frameTimes = null,
} = {}) {
  if (!(duration > 0)) throw new Error('renderScene: duration must be > 0');
  if (!outDir) throw new Error('renderScene: outDir is required');
  await mkdir(outDir, { recursive: true });

  const source = await readFile(resolve(scenePath), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const frameCount = frameTimes ? frameTimes.length : Math.max(1, Math.round(duration * fps));

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: resolveChromium(chromium),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`<canvas id="stage" width="${width}" height="${height}"></canvas>`);

    // passed as a string so bundlers/test runners (vite) can't rewrite the
    // dynamic import into their own module runtime helpers
    await page.evaluate(`(async () => {
      const mod = await import(${JSON.stringify(moduleUrl)});
      const canvas = document.getElementById('stage');
      const ctx = mod.contextType === 'webgl' ? null : canvas.getContext('2d');
      window.__scene = mod;
      window.__env = {
        canvas, ctx,
        width: ${width}, height: ${height},
        duration: ${duration}, fps: ${fps},
        params: ${JSON.stringify(params)},
      };
      if (mod.init) await mod.init(window.__env);
    })()`);

    // ── frames ──────────────────────────────────────────────────────────
    for (let frame = 0; frame < frameCount; frame++) {
      const t = frameTimes ? frameTimes[frame] : frame / fps;
      const dataUrl = await page.evaluate(async ({ frame, t }) => {
        const env = { ...window.__env, frame, t };
        await window.__scene.renderFrame(env);
        return env.canvas.toDataURL('image/png');
      }, { frame, t });
      const png = Buffer.from(dataUrl.split(',')[1], 'base64');
      await writeFile(join(outDir, `frame_${String(frame).padStart(5, '0')}.png`), png);
    }

    // ── offline audio ───────────────────────────────────────────────────
    let audioPath = null;
    const hasAudio = !frameTimes && await page.evaluate(() => typeof window.__scene.renderAudio === 'function');
    if (hasAudio) {
      const wavBase64 = await page.evaluate(async ({ duration, sampleRate }) => {
        const offlineCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
        await window.__scene.renderAudio(offlineCtx, window.__env);
        const rendered = await offlineCtx.startRendering();

        // interleave + encode 16-bit PCM WAV
        const ch = rendered.numberOfChannels, len = rendered.length;
        const pcm = new Int16Array(len * ch);
        for (let c = 0; c < ch; c++) {
          const data = rendered.getChannelData(c);
          for (let i = 0; i < len; i++) {
            const s = Math.max(-1, Math.min(1, data[i]));
            pcm[i * ch + c] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
        }
        const bytesPerSample = 2, blockAlign = ch * bytesPerSample;
        const buf = new ArrayBuffer(44 + pcm.byteLength);
        const dv = new DataView(buf);
        const str = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE');
        str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
        dv.setUint16(22, ch, true); dv.setUint32(24, sampleRate, true);
        dv.setUint32(28, sampleRate * blockAlign, true); dv.setUint16(32, blockAlign, true);
        dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, pcm.byteLength, true);
        new Int16Array(buf, 44).set(pcm);

        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(bin);
      }, { duration, sampleRate });
      audioPath = join(outDir, 'audio.wav');
      await writeFile(audioPath, Buffer.from(wavBase64, 'base64'));
    }

    return {
      framesPattern: join(outDir, 'frame_%05d.png'),
      frameCount,
      audioPath,
    };
  } finally {
    await browser.close();
  }
}
