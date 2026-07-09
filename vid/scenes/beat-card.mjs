/**
 * Scene Script: story-beat card, v1 — "constellation" edition.
 *
 * Layout (16:9): kicker row (doc title · beat position · tension chip),
 * beat title on the left, the beat's actual subgraph as an animated
 * constellation on the right, narration as paced caption chunks in a
 * lower band, and a segmented story progress bar.
 *
 * Design rules (dataviz): accent colors are pre-validated against the
 * dark surface; identity is carried by labels, never color alone; text
 * wears ink tokens, not series colors; marks are thin (2px edges, ≥8px
 * nodes with a 2px surface ring); motion is eased, staggered, and
 * deterministic in t.
 *
 * params: {
 *   index, count, title, narration,
 *   tension,                    // low | medium | high | climax | resolution
 *   accent,                     // validated cluster color
 *   docTitle,
 *   graph: { nodes: [{ id, label, tier, focus }], edges: [{ from, to, rel }] }
 * }
 */

const INK = { bright: '#ece9dd', body: '#b7b4a4', muted: '#6f7568', line: '#1c1f2a' };
const SURFACE = '#0a0a0f';
const TENSION_TONE = { low: 165, medium: 196, high: 247, climax: 330, resolution: 147 };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const easeOut = x => 1 - Math.pow(1 - x, 3);
const clamp01 = x => Math.min(1, Math.max(0, x));

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** narration → caption chunks of ~2 display lines, split on sentence ends. */
function chunkNarration(text, maxChars = 150) {
  const sentences = String(text).match(/[^.!?]+[.!?]*/g) ?? [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    const probe = cur ? cur + s : s;
    if (probe.length > maxChars && cur) { chunks.push(cur.trim()); cur = s; }
    else cur = probe;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/** deterministic constellation layout inside a panel rect. */
function layoutGraph(graph, panel, seed) {
  const rand = mulberry32(seed);
  const cx = panel.x + panel.w / 2;
  const cy = panel.y + panel.h * 0.47;
  const rBase = Math.min(panel.w, panel.h) * 0.36;
  const pos = new Map();
  const focus = graph.nodes.find(n => n.focus) ?? graph.nodes[0];
  const others = graph.nodes.filter(n => n !== focus);
  if (focus) pos.set(focus.id, { x: cx, y: cy });
  others.forEach((n, i) => {
    const angle = i * GOLDEN + seed * 0.7 + rand() * 0.35;
    const r = rBase * (n.tier === 'primary' ? 0.72 : n.tier === 'tertiary' ? 1.12 : 0.94)
      * (0.92 + rand() * 0.16);
    pos.set(n.id, { x: cx + Math.cos(angle) * r * 1.25, y: cy + Math.sin(angle) * r });
  });
  return { pos, focus };
}

export function renderFrame({ ctx, t, duration, width: W, height: H, params }) {
  const {
    index = 1, count = 1, title = '', narration = '',
    tension = 'low', accent = '#f05500', docTitle = '',
    graph = { nodes: [], edges: [] },
  } = params;

  const fade = clamp01(Math.min(t / 0.4, (duration - t) / 0.45));
  const mx = W * 0.075;

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.textBaseline = 'alphabetic';

  // ── kicker row ─────────────────────────────────────────────────────
  const kickerY = H * 0.095;
  ctx.font = `${Math.round(H / 42)}px monospace`;
  ctx.fillStyle = INK.muted;
  ctx.textAlign = 'left';
  ctx.fillText(docTitle.slice(0, 64).toUpperCase(), mx, kickerY);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK.body;
  ctx.fillText(`${String(index).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, W - mx, kickerY);

  // tension chip: dot + label (state is never color-alone)
  const chipY = kickerY + H * 0.045;
  ctx.font = `bold ${Math.round(H / 46)}px monospace`;
  const chipLabel = tension.toUpperCase();
  const chipW = ctx.measureText(chipLabel).width;
  ctx.fillStyle = tension === 'climax' ? accent : INK.muted;
  ctx.beginPath();
  ctx.arc(W - mx - chipW - H / 55, chipY - H / 120, H / 160, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(chipLabel, W - mx, chipY);

  // ── beat title (left column) ───────────────────────────────────────
  const rise = (1 - easeOut(clamp01(t / 0.7))) * H * 0.018;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK.bright;
  ctx.font = `bold ${Math.round(H / 15)}px monospace`;
  const titleW = W * 0.42;
  const titleLines = wrap(ctx, title, titleW);
  const titleTop = H * 0.225;
  titleLines.forEach((line, i) => ctx.fillText(line, mx, titleTop + rise + i * (H / 12.5)));

  const ruleY = titleTop + (titleLines.length - 1) * (H / 12.5) + H * 0.045;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, H / 260);
  ctx.beginPath();
  ctx.moveTo(mx, ruleY);
  ctx.lineTo(mx + W * 0.13 * easeOut(clamp01(t / 0.9)), ruleY);
  ctx.stroke();

  // ── constellation panel (right column) ─────────────────────────────
  const panel = { x: W * 0.52, y: H * 0.16, w: W * 0.405, h: H * 0.52 };
  const { pos, focus } = layoutGraph(graph, panel, index * 9973);
  const drift = (id, i) => {
    const p = pos.get(id);
    const settle = easeOut(clamp01((t - 0.5) / 1.2));
    return {
      x: p.x + Math.sin(t * 0.45 + i * 1.7) * 2.4 * settle,
      y: p.y + Math.cos(t * 0.38 + i * 2.3) * 2.0 * settle,
    };
  };
  const nodeIdx = new Map(graph.nodes.map((n, i) => [n.id, i]));

  // edges first: thin, recessive, accent-tinted when touching the focus
  graph.edges.forEach((e, i) => {
    const a = nodeIdx.get(e.from), b = nodeIdx.get(e.to);
    if (a == null || b == null) return;
    const grow = easeOut(clamp01((t - 0.9 - i * 0.08) / 0.6));
    if (grow <= 0) return;
    const p1 = drift(e.from, a), p2 = drift(e.to, b);
    const touchesFocus = focus && (e.from === focus.id || e.to === focus.id);
    ctx.strokeStyle = touchesFocus ? accent : INK.body;
    ctx.globalAlpha = fade * (touchesFocus ? 0.5 : 0.28) * grow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x + (p2.x - p1.x) * grow, p1.y + (p2.y - p1.y) * grow);
    ctx.stroke();
  });
  ctx.globalAlpha = fade;

  // nodes + labels, staggered entrance
  graph.nodes.forEach((n, i) => {
    const enter = easeOut(clamp01((t - 0.45 - i * 0.12) / 0.5));
    if (enter <= 0) return;
    const p = drift(n.id, i);
    const rBig = H / 72, rSmall = H / 110;
    const r = (n.focus ? rBig : rSmall) * enter;

    if (n.focus) { // soft halo pulse on the focus node
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
      ctx.globalAlpha = fade * 0.14 * enter * (0.6 + 0.4 * pulse);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (2.2 + pulse * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade;
    }

    ctx.fillStyle = SURFACE;               // 2px surface ring under every mark
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = n.focus ? accent : INK.body;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // label placed away from the panel center so it never crosses the graph
    ctx.globalAlpha = fade * enter;
    ctx.font = `${n.focus ? 'bold ' : ''}${Math.round(H / (n.focus ? 40 : 48))}px monospace`;
    ctx.fillStyle = n.focus ? INK.bright : INK.body;
    const cx = panel.x + panel.w / 2;
    const side = p.x >= cx ? 1 : -1;
    ctx.textAlign = side === 1 ? 'left' : 'right';
    ctx.fillText(n.label, p.x + side * (r + H / 90), p.y + H / 220);
    ctx.globalAlpha = fade;
  });

  // ── caption band ────────────────────────────────────────────────────
  // Aligned mode: params.captions carries measured VO chunk timings
  // ({ text, start, end }) — the caption flips exactly when the voice
  // does (CT-V06). Fallback mode (silent cards): pace chunks linearly.
  let chunks, ci, capAlpha;
  if (Array.isArray(params.captions) && params.captions.length) {
    const caps = params.captions;
    chunks = caps.map(c => c.text);
    ci = 0;
    for (let i = 0; i < caps.length; i++) if (t >= caps[i].start - 0.15) ci = i;
    const holdUntil = ci + 1 < caps.length ? caps[ci + 1].start : Math.min(duration, caps[ci].end + 1.0);
    const inA = clamp01((t - (caps[ci].start - 0.15)) / 0.2);
    const outA = clamp01((holdUntil - t) / 0.2);
    capAlpha = t < caps[0].start - 0.15 ? 0 : Math.min(inA, outA);
  } else {
    chunks = chunkNarration(narration);
    const capWindow = duration - 1.2;                  // 0.5s in, 0.7s out
    const per = capWindow / Math.max(1, chunks.length);
    ci = Math.min(chunks.length - 1, Math.floor(Math.max(0, t - 0.5) / per));
    const local = (t - 0.5 - ci * per) / per;
    capAlpha = clamp01(Math.min(local / 0.12, (1 - local) / 0.12, 1));
  }
  if (chunks.length) {
    const capTop = H * 0.745;

    ctx.font = `${Math.round(H / 26)}px monospace`;
    ctx.fillStyle = INK.body;
    ctx.textAlign = 'left';
    ctx.globalAlpha = fade * capAlpha;
    wrap(ctx, chunks[ci], W - mx * 2).slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, mx, capTop + i * (H / 20));
    });
    ctx.globalAlpha = fade;

    if (chunks.length > 1) {               // caption position dots
      ctx.textAlign = 'left';
      chunks.forEach((_, i) => {
        ctx.fillStyle = i === ci ? accent : INK.line;
        ctx.beginPath();
        ctx.arc(mx + i * H / 45, H * 0.71, H / 260, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // ── segmented story progress bar ───────────────────────────────────
  const barY = H * 0.935, barH = Math.max(2, H / 200);
  const gap = 2;
  const segW = (W - mx * 2 - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) {
    const x = mx + i * (segW + gap);
    ctx.fillStyle = INK.line;
    ctx.fillRect(x, barY, segW, barH);
    if (i < index - 1) { ctx.fillStyle = INK.muted; ctx.fillRect(x, barY, segW, barH); }
    if (i === index - 1) { ctx.fillStyle = accent; ctx.fillRect(x, barY, segW * clamp01(t / duration), barH); }
  }

  ctx.restore();
}

export function renderAudio(offlineCtx, { duration, params }) {
  const freq = TENSION_TONE[params.tension] ?? 165;

  const osc = offlineCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const fifth = offlineCtx.createOscillator();
  fifth.type = 'sine';
  fifth.frequency.value = freq * 1.5;

  const gain = offlineCtx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.045, 0.6);
  gain.gain.setValueAtTime(0.045, Math.max(0.6, duration - 0.8));
  gain.gain.linearRampToValueAtTime(0, duration);

  const fifthGain = offlineCtx.createGain();
  fifthGain.gain.value = 0.35;

  osc.connect(gain);
  fifth.connect(fifthGain).connect(gain);
  gain.connect(offlineCtx.destination);
  osc.start(0); osc.stop(duration);
  fifth.start(0); fifth.stop(duration);
}
