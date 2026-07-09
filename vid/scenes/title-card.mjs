/**
 * Scene Script: opening title card, v1 — centered wordmark over a slowly
 * rotating constellation ring, subtitle and meta line beneath an animated
 * accent rule. Self-contained, deterministic in t.
 *
 * params: { title, subtitle?, meta?, accent?, tone? (Hz, 0 = silent) }
 */

const INK = { bright: '#ece9dd', body: '#b7b4a4', muted: '#6f7568' };
const SURFACE = '#0a0a0f';

const easeOut = x => 1 - Math.pow(1 - x, 3);
const clamp01 = x => Math.min(1, Math.max(0, x));

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? line + ' ' + word : word;
    if (ctx.measureText(probe).width > maxWidth && line) { lines.push(line); line = word; }
    else line = probe;
  }
  if (line) lines.push(line);
  return lines;
}

export function renderFrame({ ctx, t, duration, width: W, height: H, params }) {
  const {
    title = 'kaaroViewer', subtitle = '', meta = '',
    accent = '#f05500',
  } = params;

  const fade = clamp01(Math.min(t / 0.5, (duration - t) / 0.5));

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);

  // constellation ring: 28 dots on an ellipse, slow rotation, a few arcs
  const cx = W / 2, cy = H * 0.46;
  const ringIn = easeOut(clamp01(t / 1.6));
  ctx.save();
  const N = 28;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + t * 0.04;
    const wobble = 1 + 0.05 * Math.sin(i * 2.7 + t * 0.3);
    pts.push({
      x: cx + Math.cos(a) * W * 0.34 * wobble * ringIn,
      y: cy + Math.sin(a) * H * 0.36 * wobble * ringIn,
    });
  }
  ctx.strokeStyle = INK.muted;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < N; i += 4) {          // sparse chords, recessive
    const j = (i + 7) % N;
    ctx.globalAlpha = fade * 0.10;
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[j].x, pts[j].y);
    ctx.stroke();
  }
  pts.forEach((p, i) => {
    ctx.globalAlpha = fade * (i % 6 === 0 ? 0.5 : 0.22);
    ctx.fillStyle = i % 6 === 0 ? accent : INK.body;
    ctx.beginPath();
    ctx.arc(p.x, p.y, i % 6 === 0 ? 2.4 : 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // wordmark: tracking eases from wide to normal
  const track = (1 - easeOut(clamp01(t / 1.4))) * H * 0.02;
  ctx.fillStyle = INK.bright;
  ctx.font = `bold ${Math.round(H / 11)}px monospace`;
  const titleLines = wrap(ctx, title, W * 0.8);
  const titleTop = cy - (titleLines.length - 1) * (H / 9) / 2;
  titleLines.forEach((line, li) => {
    const y = titleTop + li * (H / 9);
    // manual tracking: draw per-char offsets around center
    const widths = [...line].map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (line.length - 1);
    let x = W / 2 - total / 2;
    ctx.textAlign = 'left';
    [...line].forEach((ch, i) => {
      ctx.fillText(ch, x, y);
      x += widths[i] + track;
    });
  });
  ctx.textAlign = 'center';

  // accent rule
  const ruleY = titleTop + (titleLines.length - 1) * (H / 9) + H * 0.05;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, H / 260);
  const ruleW = W * 0.11 * easeOut(clamp01((t - 0.3) / 0.9));
  ctx.beginPath();
  ctx.moveTo(W / 2 - ruleW, ruleY);
  ctx.lineTo(W / 2 + ruleW, ruleY);
  ctx.stroke();

  // subtitle + meta
  if (subtitle) {
    ctx.globalAlpha = fade * easeOut(clamp01((t - 0.5) / 0.8));
    ctx.fillStyle = INK.body;
    ctx.font = `${Math.round(H / 28)}px monospace`;
    wrap(ctx, subtitle, W * 0.66).slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, W / 2, ruleY + H * 0.065 + i * (H / 22));
    });
  }
  if (meta) {
    ctx.globalAlpha = fade * easeOut(clamp01((t - 0.9) / 0.8));
    ctx.fillStyle = INK.muted;
    ctx.font = `${Math.round(H / 38)}px monospace`;
    ctx.fillText(meta, W / 2, H * 0.88);
  }

  ctx.restore();
}

export function renderAudio(offlineCtx, { duration, params }) {
  const tone = params.tone ?? 196;
  if (!tone) return;

  const osc = offlineCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = tone;

  const gain = offlineCtx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.1, 0.5);
  gain.gain.setValueAtTime(0.1, Math.max(0.5, duration - 0.6));
  gain.gain.linearRampToValueAtTime(0, duration);

  osc.connect(gain).connect(offlineCtx.destination);
  osc.start(0);
  osc.stop(duration);
}
