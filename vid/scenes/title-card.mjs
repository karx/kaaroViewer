/**
 * Scene Script: title card in the kaaroViewer look — dark field, orange
 * wordmark, mono type, fade-in/out. Reference implementation of the
 * harness contract (see vid/harness.mjs).
 *
 * params: { title, subtitle?, bg?, fg?, accent?, tone? (Hz, 0 = silent) }
 */

export function renderFrame({ ctx, t, duration, width, height, params }) {
  const {
    title = 'kaaroViewer',
    subtitle = '',
    bg = '#0a0a0f',
    fg = '#ccccaa',
    accent = '#ff6600',
  } = params;

  // fade envelope: 0.5s in, 0.5s out
  const fade = Math.min(1, t / 0.5, (duration - t) / 0.5);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = accent;
  ctx.font = `bold ${Math.round(height / 10)}px monospace`;
  ctx.fillText(title, width / 2, height / 2 - height * 0.04);

  if (subtitle) {
    ctx.fillStyle = fg;
    ctx.font = `${Math.round(height / 24)}px monospace`;
    ctx.fillText(subtitle, width / 2, height / 2 + height * 0.08);
  }

  // slow accent underline sweep
  const sweep = Math.min(1, t / Math.max(0.001, duration * 0.6));
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, height / 240);
  ctx.beginPath();
  ctx.moveTo(width / 2 - (width * 0.2 * sweep), height / 2 + height * 0.16);
  ctx.lineTo(width / 2 + (width * 0.2 * sweep), height / 2 + height * 0.16);
  ctx.stroke();
  ctx.restore();
}

export function renderAudio(offlineCtx, { duration, params }) {
  const tone = params.tone ?? 220;
  if (!tone) return;

  const osc = offlineCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = tone;

  const gain = offlineCtx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.15, 0.4);
  gain.gain.setValueAtTime(0.15, Math.max(0.4, duration - 0.5));
  gain.gain.linearRampToValueAtTime(0, duration);

  osc.connect(gain).connect(offlineCtx.destination);
  osc.start(0);
  osc.stop(duration);
}
