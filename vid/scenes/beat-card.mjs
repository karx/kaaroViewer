/**
 * Scene Script: story-beat card — the v0 visual for `kaaro-vid beats`.
 * One card per intelligence-brief story beat: beat index, title, wrapped
 * narration, tension badge, drifting node-field backdrop in the beat's
 * accent color, and a low drone whose pitch tracks tension.
 *
 * params: {
 *   index, count,            // beat position, e.g. 3 of 10
 *   title, narration,
 *   tension,                 // low | medium | high | climax | resolution
 *   accent,                  // cluster color, default kaaro orange
 *   docTitle                 // running header
 * }
 */

const TENSION_TONE = { low: 165, medium: 196, high: 247, climax: 330, resolution: 147 };

// deterministic pseudo-random for the node-field backdrop
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

export function renderFrame({ ctx, t, duration, width, height, params }) {
  const {
    index = 1, count = 1, title = '', narration = '',
    tension = 'low', accent = '#ff6600', docTitle = '',
  } = params;

  const fade = Math.min(1, t / 0.4, (duration - t) / 0.4);

  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, width, height);

  // drifting node field, seeded by beat index so each card differs but is stable
  const rand = mulberry32(index * 9973);
  ctx.save();
  for (let i = 0; i < 42; i++) {
    const bx = rand() * width, by = rand() * height;
    const speed = 4 + rand() * 10, phase = rand() * Math.PI * 2;
    const x = bx + Math.sin(phase + t * 0.3) * speed;
    const y = by + Math.cos(phase + t * 0.2) * speed;
    ctx.globalAlpha = 0.05 + rand() * 0.10;
    ctx.fillStyle = i % 5 === 0 ? accent : '#8899aa';
    ctx.beginPath();
    ctx.arc(x, y, 1 + rand() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  const margin = width * 0.1;

  // header: doc title + beat position
  ctx.font = `${Math.round(height / 30)}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#667755';
  ctx.textAlign = 'left';
  ctx.fillText(docTitle.slice(0, 60), margin, height * 0.07);
  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.fillText(`${String(index).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, width - margin, height * 0.07);

  // tension badge
  ctx.textAlign = 'right';
  ctx.fillStyle = tension === 'climax' ? accent : '#8899aa';
  ctx.font = `bold ${Math.round(height / 34)}px monospace`;
  ctx.fillText(`◆ ${tension.toUpperCase()}`, width - margin, height * 0.13);

  // title (slides up slightly as it fades in)
  const rise = (1 - Math.min(1, t / 0.6)) * height * 0.02;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#eeeedd';
  ctx.font = `bold ${Math.round(height / 14)}px monospace`;
  const titleLines = wrap(ctx, title, width - margin * 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, margin, height * 0.20 + rise + i * (height / 12));
  });

  // accent rule under the title
  const ruleY = height * 0.20 + titleLines.length * (height / 12) + height * 0.015;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, height / 240);
  ctx.beginPath();
  ctx.moveTo(margin, ruleY);
  ctx.lineTo(margin + width * 0.18 * Math.min(1, t / 0.8), ruleY);
  ctx.stroke();

  // narration reveals line by line over the first 60% of the card,
  // ellipsized to the space above the progress bar
  ctx.fillStyle = '#ccccaa';
  ctx.font = `${Math.round(height / 24)}px monospace`;
  const lineH = height / 18;
  const bodyTop = ruleY + height * 0.045;
  const maxLines = Math.max(1, Math.floor((height * 0.90 - bodyTop) / lineH));
  let bodyLines = wrap(ctx, narration, width - margin * 2);
  if (bodyLines.length > maxLines) {
    bodyLines = bodyLines.slice(0, maxLines);
    bodyLines[maxLines - 1] = bodyLines[maxLines - 1].replace(/\s*\S*$/, ' …');
  }
  const visible = Math.ceil(bodyLines.length * Math.min(1, t / (duration * 0.6)));
  bodyLines.slice(0, visible).forEach((line, i) => {
    ctx.fillText(line, margin, bodyTop + i * lineH);
  });

  // bottom progress bar: position of this beat in the story
  const barY = height * 0.94;
  ctx.fillStyle = '#222230';
  ctx.fillRect(margin, barY, width - margin * 2, Math.max(2, height / 180));
  ctx.fillStyle = accent;
  const beatSpan = (width - margin * 2) / count;
  ctx.fillRect(margin, barY, beatSpan * (index - 1) + beatSpan * Math.min(1, t / duration), Math.max(2, height / 180));

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
  gain.gain.linearRampToValueAtTime(0.06, 0.6);
  gain.gain.setValueAtTime(0.06, Math.max(0.6, duration - 0.8));
  gain.gain.linearRampToValueAtTime(0, duration);

  const fifthGain = offlineCtx.createGain();
  fifthGain.gain.value = 0.35;

  osc.connect(gain);
  fifth.connect(fifthGain).connect(gain);
  gain.connect(offlineCtx.destination);
  osc.start(0); osc.stop(duration);
  fifth.start(0); fifth.stop(duration);
}
