/**
 * Scene Script: closing stats card — the brief's key stats as a 2×2 grid
 * of stat tiles (dataviz: a headline number's best form is a tile, not a
 * chart). Staggered reveal, values in bright ink, labels muted; accent
 * only on the tile rule, never on text.
 *
 * params: { title, stats: ["Label: value", ...] (≤4), accent }
 */

const INK = { bright: '#ece9dd', body: '#b7b4a4', muted: '#6f7568', line: '#1c1f2a' };
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

/** "Test suite: 168 passing" → { label: "Test suite", value: "168 passing" } */
function splitStat(stat) {
  const i = stat.indexOf(':');
  if (i < 0) return { label: '', value: stat.trim() };
  return { label: stat.slice(0, i).trim(), value: stat.slice(i + 1).trim() };
}

export function renderFrame({ ctx, t, duration, width: W, height: H, params }) {
  const { title = '', stats = [], accent = '#f05500' } = params;

  const fade = clamp01(Math.min(t / 0.5, (duration - t) / 0.6));
  const mx = W * 0.075;

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // kicker + doc title
  ctx.fillStyle = INK.muted;
  ctx.font = `${Math.round(H / 42)}px monospace`;
  ctx.fillText('BY THE NUMBERS', mx, H * 0.14);
  ctx.fillStyle = INK.bright;
  ctx.font = `bold ${Math.round(H / 22)}px monospace`;
  const titleLines = wrap(ctx, title, W - mx * 2);
  ctx.fillText(titleLines.length > 1 ? titleLines[0] + ' …' : titleLines[0], mx, H * 0.21);

  // 2×2 stat tiles
  const gridTop = H * 0.30, gridH = H * 0.50;
  const gap = H * 0.03;
  const cols = Math.min(2, stats.length), rows = Math.ceil(stats.length / 2);
  const tileW = (W - mx * 2 - gap) / 2;
  const tileH = (gridH - gap * (rows - 1)) / Math.max(1, rows);

  stats.slice(0, 4).forEach((stat, i) => {
    const enter = easeOut(clamp01((t - 0.5 - i * 0.22) / 0.6));
    if (enter <= 0) return;
    const col = i % 2, row = Math.floor(i / 2);
    const x = mx + col * (tileW + gap);
    const y = gridTop + row * (tileH + gap) + (1 - enter) * H * 0.02;
    const { label, value } = splitStat(stat);

    ctx.globalAlpha = fade * enter;

    ctx.strokeStyle = INK.line;                      // hairline tile boundary
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, tileW, tileH);

    ctx.strokeStyle = accent;                        // accent rule, grows in
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + tileH);
    ctx.lineTo(x + tileW * 0.22 * enter, y + tileH);
    ctx.stroke();

    const pad = tileW * 0.07;
    if (label) {
      ctx.fillStyle = INK.muted;
      ctx.font = `${Math.round(H / 40)}px monospace`;
      ctx.fillText(label.toUpperCase(), x + pad, y + tileH * 0.32);
    }
    ctx.fillStyle = INK.bright;
    ctx.font = `bold ${Math.round(H / 24)}px monospace`;
    wrap(ctx, value, tileW - pad * 2).slice(0, 2).forEach((line, li) => {
      ctx.fillText(line, x + pad, y + tileH * (label ? 0.58 : 0.5) + li * (H / 20));
    });
  });
  ctx.globalAlpha = fade;

  // footer
  ctx.fillStyle = INK.muted;
  ctx.font = `${Math.round(H / 44)}px monospace`;
  ctx.fillText('kaaroViewer — knowledge graph explorer', mx, H * 0.92);

  ctx.restore();
}

export function renderAudio(offlineCtx, { duration }) {
  // resolution drone: root + fifth, gentle
  const freq = 147;
  const osc = offlineCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const fifth = offlineCtx.createOscillator();
  fifth.type = 'sine';
  fifth.frequency.value = freq * 1.5;

  const gain = offlineCtx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.05, 0.8);
  gain.gain.setValueAtTime(0.05, Math.max(0.8, duration - 1.2));
  gain.gain.linearRampToValueAtTime(0, duration);

  const fifthGain = offlineCtx.createGain();
  fifthGain.gain.value = 0.3;

  osc.connect(gain);
  fifth.connect(fifthGain).connect(gain);
  gain.connect(offlineCtx.destination);
  osc.start(0); osc.stop(duration);
  fifth.start(0); fifth.stop(duration);
}
