/**
 * slides.mjs — horizontally-scrollable narrative slides, overlaid on the canvas.
 *
 * Each slide is one logical unit of the brief (title, briefing, beat, insight,
 * cluster, analytics, closer). Slides ride on top of the three.js scene; the
 * canvas stays full-screen as the backdrop and reframes its node set whenever
 * the active slide changes.
 *
 * Events dispatched:
 *   slides:frame      { nodeIds[] }     — active slide wants the canvas to frame these
 *   slides:navigate   { qid }           — user clicked an entity pill → focus in canvas
 *   slides:mode       { mode: 'reader' }— user clicked the "reader" toggle
 *
 * Public API:
 *   initSlides()              — mount DOM
 *   renderSlides(doc)         — build + render slide array for a library doc
 *   showSlides() / hideSlides()
 *   isSlidesVisible()
 *   nextSlide() / prevSlide() — keyboard navigation
 *   goToSlide(idx)
 *   getActiveSlideIdx()
 */

import { getEntityStyle } from '../ontology.mjs';

let _wrap   = null;   // #slides-wrap
let _track  = null;   // .sl-track
let _index  = null;   // .sl-index
let _title  = null;   // .sl-topbar-title
let _slides = [];     // Slide[]
let _active = 0;
let _observer = null;
let _currentDoc = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initSlides() {
  if (document.getElementById('slides-wrap')) {
    _wrap  = document.getElementById('slides-wrap');
    _track = _wrap.querySelector('.sl-track');
    _index = _wrap.querySelector('.sl-index');
    _title = _wrap.querySelector('.sl-topbar-title');
    return;
  }

  _wrap = document.createElement('div');
  _wrap.id        = 'slides-wrap';
  _wrap.className = 'sl-wrap';
  _wrap.setAttribute('role', 'region');
  _wrap.setAttribute('aria-label', 'Brief slides — horizontally scrollable');
  _wrap.innerHTML = `
    <div class="sl-topbar">
      <div class="sl-topbar-left">
        <span class="sl-index">— / —</span>
        <span class="sl-topbar-title"></span>
      </div>
      <div class="sl-topbar-right">
        <button class="sl-nav-btn sl-prev" aria-label="Previous slide (←)" title="Previous (←)">◀</button>
        <button class="sl-nav-btn sl-next" aria-label="Next slide (→)" title="Next (→)">▶</button>
        <button class="sl-mode-btn" data-mode="reader" aria-label="Switch to reader view" title="Reader view">READER ▸</button>
        <button class="sl-close" aria-label="Close slides (F9)" title="Close (F9)">✕</button>
      </div>
    </div>
    <div class="sl-track" aria-label="Slide track"></div>
    <div class="sl-dots" aria-hidden="true"></div>
  `;

  const middle = document.querySelector('.middle') ?? document.body;
  middle.appendChild(_wrap);

  _track = _wrap.querySelector('.sl-track');
  _index = _wrap.querySelector('.sl-index');
  _title = _wrap.querySelector('.sl-topbar-title');

  _wrap.querySelector('.sl-prev').addEventListener('click', prevSlide);
  _wrap.querySelector('.sl-next').addEventListener('click', nextSlide);
  _wrap.querySelector('.sl-close').addEventListener('click', () => {
    hideSlides();
    document.dispatchEvent(new CustomEvent('slides:closed'));
  });

  // Swallow native arrow-key scroll on the track so our JS navigator isn't
  // racing the browser's scroll-snap (which skips by one snap-point per key).
  _track.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
  });
  _wrap.querySelector('.sl-mode-btn').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('slides:mode', { detail: { mode: 'reader' } }));
  });
}

export function renderSlides(doc) {
  if (!_track || !doc) return;
  _currentDoc = doc;
  _slides = _buildSlides(doc);
  _track.innerHTML = _slides.map((s, i) => _renderSlide(s, i, _slides.length)).join('');
  _renderDots();
  _bindIntersection();
  _bindClicks();
  _active = 0;
  _updateIndex();
}

export function showSlides() {
  _wrap?.classList.add('sl-visible');
  setTimeout(() => goToSlide(_active, 'auto'), 50);   // ensure initial snap
}

export function hideSlides() {
  _wrap?.classList.remove('sl-visible');
}

export function isSlidesVisible() {
  return !!_wrap?.classList.contains('sl-visible');
}

export function getActiveSlideIdx() { return _active; }

export function nextSlide() { goToSlide(_active + 1); }
export function prevSlide() { goToSlide(_active - 1); }

export function goToSlide(idx, behavior = 'smooth') {
  if (!_track || !_slides.length) return;
  const n  = Math.max(0, Math.min(_slides.length - 1, idx));
  const el = _track.querySelector(`[data-slide-idx="${n}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
  _setActive(n);
}

// ── Slide model builder ──────────────────────────────────────────────────────

function _buildSlides(doc) {
  const slides = [];

  // 00 — Title
  slides.push({
    id: 'title',
    type: 'title',
    title: doc.title ?? 'Untitled',
    frameNodes: doc.report_card?.spine ?? [],
  });

  // 01 — Briefing
  if (doc.report_card?.summary || doc.report_card?.key_stats?.length) {
    slides.push({
      id: 'briefing',
      type: 'briefing',
      title: 'Executive briefing',
      frameNodes: [
        ...(doc.report_card?.spine ?? []),
        ...(doc.report_card?.protagonists ?? []),
        ...(doc.report_card?.antagonists ?? []),
      ],
    });
  }

  // 02 — Tension arc (only if there are beats)
  if (doc.story?.length >= 2) {
    slides.push({
      id: 'arc',
      type: 'arc',
      title: 'Narrative arc',
      frameNodes: (doc.story ?? []).flatMap(b => [b.node, ...(b.nodes ?? [])]).filter(Boolean),
    });
  }

  // 03…N — Story beats
  (doc.story ?? []).forEach((beat, i) => {
    slides.push({
      id:    `beat-${i}`,
      type:  'beat',
      title: beat.title,
      beatIdx: i,
      beat,
      frameNodes: [beat.node, ...(beat.nodes ?? [])].filter(Boolean),
    });
  });

  // Insights
  (doc.insights ?? []).forEach((ins, i) => {
    slides.push({
      id:    `insight-${i}`,
      type:  'insight',
      title: ins.title,
      insight: ins,
      frameNodes: ins.evidence ?? [],
    });
  });

  // Clusters
  (doc.clusters ?? []).forEach(cl => {
    slides.push({
      id:    `cluster-${cl.id}`,
      type:  'cluster',
      title: cl.label,
      cluster: cl,
      frameNodes: cl.nodes ?? [],
    });
  });

  // Analytics (consolidated)
  const a = doc.analytics;
  if (a && (a.centrality || a.relTypeDist || a.sentimentDist)) {
    slides.push({
      id: 'analytics',
      type: 'analytics',
      title: 'Analytics',
      frameNodes: [],
    });
  }

  // Closer
  slides.push({
    id: 'closer',
    type: 'closer',
    title: 'End of brief',
    frameNodes: [],
  });

  return slides;
}

// ── Slide renderers ──────────────────────────────────────────────────────────

function _renderSlide(slide, idx, total) {
  const body = (() => {
    switch (slide.type) {
      case 'title':     return _renderTitle(_currentDoc);
      case 'briefing':  return _renderBriefing(_currentDoc);
      case 'arc':       return _renderArc(_currentDoc);
      case 'beat':      return _renderBeat(slide.beat, slide.beatIdx, _currentDoc);
      case 'insight':   return _renderInsight(slide.insight, _currentDoc);
      case 'cluster':   return _renderCluster(slide.cluster, _currentDoc);
      case 'analytics': return _renderAnalytics(_currentDoc);
      case 'closer':    return _renderCloser(_currentDoc);
      default:          return '';
    }
  })();

  return `
    <article class="sl-slide sl-slide-${_e(slide.type)}"
      data-slide-idx="${idx}"
      data-slide-id="${_e(slide.id)}"
      data-frame-nodes="${_e((slide.frameNodes ?? []).join(','))}"
      role="group"
      aria-roledescription="slide"
      aria-label="Slide ${idx + 1} of ${total}: ${_e(slide.title)}">
      <div class="sl-slide-marker">
        <span class="sl-slide-num">${String(idx + 1).padStart(2, '0')}</span>
        <span class="sl-slide-type">${_e(slide.type.toUpperCase())}</span>
      </div>
      <div class="sl-slide-body">${body}</div>
    </article>
  `;
}

function _renderTitle(doc) {
  const tags = (doc.tags ?? []).map(t => `<span class="sl-tag">${_e(t)}</span>`).join('');
  const tone = doc.tone ?? 'analytical';
  return `
    <div class="sl-title-meta">
      <span class="sl-title-domain">${_e(doc.domain ?? '')}</span>
      <span class="sl-sep">·</span>
      <span class="sl-title-year">${_e(doc.year ?? '')}</span>
      <span class="sl-title-tone sl-tone-${_e(tone)}">${_e(tone.toUpperCase())}</span>
    </div>
    <h1 class="sl-title-h1">${_e(doc.title ?? '')}</h1>
    ${doc.subtitle ? `<p class="sl-title-sub">${_e(doc.subtitle)}</p>` : ''}
    ${tags ? `<div class="sl-tags">${tags}</div>` : ''}
    <div class="sl-title-spine">
      ${(doc.report_card?.spine ?? []).map(id => _pill(id, doc)).join('')}
    </div>
    <p class="sl-title-hint">${_slides.length} slides · use ← → or scroll →</p>
  `;
}

function _renderBriefing(doc) {
  const rc     = doc.report_card ?? {};
  const stats  = (rc.key_stats ?? []).slice(0, 6).map(s => {
    const { label, value } = _parseStat(s);
    return `<div class="sl-stat">
      <span class="sl-stat-val">${_e(value)}</span>
      ${label ? `<span class="sl-stat-lbl">${_e(label)}</span>` : ''}
    </div>`;
  }).join('');

  const prota  = (rc.protagonists ?? []).map(id => _pill(id, doc)).join('');
  const antag  = (rc.antagonists  ?? []).map(id => _pill(id, doc, 'neg')).join('');
  const themes = (rc.themes ?? []).map(t => `<span class="sl-theme">${_e(t)}</span>`).join('');

  return `
    <h2 class="sl-h2">Executive briefing</h2>
    ${rc.summary ? `<p class="sl-lead">${_e(rc.summary)}</p>` : ''}
    ${stats ? `<div class="sl-stats-grid">${stats}</div>` : ''}
    ${prota ? `<div class="sl-actor-row"><span class="sl-actor-lbl">Protagonists</span>${prota}</div>` : ''}
    ${antag ? `<div class="sl-actor-row"><span class="sl-actor-lbl sl-actor-lbl-neg">Antagonists</span>${antag}</div>` : ''}
    ${themes ? `<div class="sl-actor-row"><span class="sl-actor-lbl">Themes</span>${themes}</div>` : ''}
  `;
}

function _renderArc(doc) {
  const beats = doc.story ?? [];
  const curve = doc.analytics?.tensionCurve ?? beats.map(b => _tensionVal(b.tension));
  const strip = beats.map((beat, i) => {
    return `<button class="sl-arc-block sl-arc-${_e(beat.tension ?? 'low')}"
      data-goto-slide="beat-${i}"
      title="${_e(beat.title)}"
      aria-label="Jump to beat ${i + 1}: ${_e(beat.title)}">
      <span class="sl-arc-num">${i + 1}</span>
    </button>`;
  }).join('');

  return `
    <h2 class="sl-h2">Narrative arc</h2>
    <p class="sl-caption">${beats.length} beats · tension from setup to climax to close. Click a block to jump to that beat.</p>
    ${_svgArc(curve)}
    <div class="sl-arc-strip">${strip}</div>
  `;
}

function _renderBeat(beat, idx, doc) {
  const tension    = beat.tension ?? 'low';
  const primary    = doc.nodeLookup?.[beat.node];
  const related    = (beat.nodes ?? []).map(id => _pill(id, doc)).join('');

  return `
    <div class="sl-beat-hdr">
      <span class="sl-beat-num">Beat ${String(idx + 1).padStart(2, '0')} / ${(doc.story ?? []).length}</span>
      <span class="sl-beat-tension sl-t-${_e(tension)}">${_e(tension.toUpperCase())}</span>
    </div>
    <h2 class="sl-h2">${_e(beat.title)}</h2>
    ${primary ? _entityBadge(primary) : ''}
    <p class="sl-narration">${_e(beat.narration ?? '')}</p>
    ${beat.diagram ? `<div class="sl-diagram">
      <img class="sl-diagram-img" src="${_e(beat.diagram)}" alt="${_e(beat.title)}" loading="lazy">
    </div>` : ''}
    ${related ? `<div class="sl-related"><span class="sl-related-lbl">Also ▸</span>${related}</div>` : ''}
  `;
}

function _renderInsight(ins, doc) {
  const ICON = { finding:'◈', warning:'⚑', pattern:'◎', conclusion:'◆', paradox:'◉', opportunity:'◇' };
  const icon    = ICON[ins.type] ?? '◈';
  const sevPct  = { high: 100, medium: 66, low: 33 }[ins.severity] ?? 66;
  const sevCol  = { high: '#ff4400', medium: '#cc8800', low: '#334433' }[ins.severity] ?? '#cc8800';
  const evidence = (ins.evidence ?? []).map(id => _pill(id, doc)).join('');

  return `
    <div class="sl-ins-hdr">
      <span class="sl-ins-icon">${icon}</span>
      <span class="sl-ins-type">${_e((ins.type ?? 'finding').toUpperCase())}</span>
      <div class="sl-ins-sev-bar"><div class="sl-ins-sev-fill" style="width:${sevPct}%;background:${sevCol}"></div></div>
      <span class="sl-ins-sev" style="color:${sevCol}">${_e((ins.severity ?? 'medium').toUpperCase())}</span>
    </div>
    <blockquote class="sl-ins-quote">"${_e(ins.title)}"</blockquote>
    <p class="sl-ins-body">${_e(ins.body ?? '')}</p>
    ${evidence ? `<div class="sl-related"><span class="sl-related-lbl">Evidence ▸</span>${evidence}</div>` : ''}
  `;
}

function _renderCluster(cl, doc) {
  const col     = cl.color ?? '#666666';
  const count   = cl.nodes?.length ?? 0;
  const total   = (doc.nodes ?? []).length || 1;
  const pct     = (count / total * 100).toFixed(0);
  const nodes   = (cl.nodes ?? []).map(id => _pill(id, doc)).join('');

  return `
    <div class="sl-cl-hdr">
      <span class="sl-cl-dot" style="background:${_e(col)}"></span>
      <h2 class="sl-h2 sl-cl-label" style="border-left-color:${_e(col)}">${_e(cl.label ?? '')}</h2>
      <span class="sl-cl-cnt">${count} · ${pct}%</span>
    </div>
    ${cl.description ? `<p class="sl-lead">${_e(cl.description)}</p>` : ''}
    <div class="sl-cl-nodes">${nodes}</div>
  `;
}

function _renderAnalytics(doc) {
  const a = doc.analytics ?? {};
  return `
    <h2 class="sl-h2">Analytics</h2>
    <div class="sl-analytics-grid">
      ${_centralityBars(doc)}
      ${_relDistBars(a.relTypeDist)}
      ${_sentimentBar(a.sentimentDist)}
    </div>
  `;
}

function _renderCloser(doc) {
  const url = `?lib=${encodeURIComponent(doc.id ?? '')}&slide=0`;
  return `
    <h2 class="sl-h2">End of brief</h2>
    <p class="sl-lead">${_e(doc.title ?? '')}</p>
    <div class="sl-closer-meta">
      <span>${_e(doc.domain ?? '')}</span><span class="sl-sep">·</span>
      <span>${_e(doc.year ?? '')}</span><span class="sl-sep">·</span>
      <span>${_e(doc.id ?? '')}</span>
    </div>
    <div class="sl-closer-actions">
      <button class="sl-action-btn" data-goto-slide="title">◀ First slide</button>
      <button class="sl-action-btn sl-mode-btn" data-mode="reader">Reader view ▸</button>
      <a class="sl-action-btn" href="${_e(url)}" target="_self">Share link</a>
    </div>
  `;
}

// ── Chart helpers ────────────────────────────────────────────────────────────

function _svgArc(curve) {
  if (!curve || curve.length < 2) return '';
  const W = 640, H = 96, PX = 40, PY = 10;
  const n      = curve.length;
  const xStep  = (W - PX - 16) / Math.max(n - 1, 1);
  const yRange = H - PY * 2 - 14;

  const pts = curve.map((v, i) => ({
    x: PX + i * xStep,
    y: PY + yRange - ((Math.max(1, Math.min(4, v)) - 1) / 3) * yRange,
  }));

  const polylineStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const bottomY     = (PY + yRange).toFixed(1);
  const areaPath    = `M ${pts[0].x.toFixed(1)},${bottomY} ` +
    pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` L ${pts[n - 1].x.toFixed(1)},${bottomY} Z`;

  const TCOL  = { 1: '#334433', 2: '#996600', 3: '#ff4400', 4: '#ff0044' };
  const TNAME = { 1: 'LOW', 2: 'MED', 3: 'HIGH', 4: 'CLIMAX' };

  const grid = [1, 2, 3, 4].map(v => {
    const y   = (PY + yRange - ((v - 1) / 3) * yRange).toFixed(1);
    const col = TCOL[v];
    return `<line x1="${PX}" y1="${y}" x2="${W - 8}" y2="${y}" stroke="${col}" stroke-opacity="0.18" stroke-dasharray="3 5"/>
            <text x="${PX - 4}" y="${(parseFloat(y) + 3.5).toFixed(1)}" text-anchor="end" class="sl-svg-lbl" fill="${col}">${TNAME[v]}</text>`;
  }).join('');

  const dots = pts.map((p, i) => {
    const col = TCOL[Math.max(1, Math.min(4, curve[i]))] ?? '#334433';
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${col}" stroke="#000" stroke-width="1.5"/>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="sl-svg-arc" preserveAspectRatio="none">
      <defs>
        <linearGradient id="slTensionGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff4400" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#330000" stop-opacity="0.04"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${areaPath}" fill="url(#slTensionGrad)"/>
      <polyline points="${polylineStr}" fill="none" stroke="#cc5500" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
}

function _centralityBars(doc) {
  const c = doc.analytics?.centrality;
  if (!c) return '';
  const sorted = Object.entries(c).sort(([, a], [, b]) => b - a).slice(0, 6);
  if (!sorted.length) return '';
  return `<div class="sl-chart-block">
    <div class="sl-chart-title">Degree centrality</div>
    ${sorted.map(([id, score]) => {
      const node = doc.nodeLookup?.[id];
      const lbl  = node?.label ?? id;
      const pct  = (score * 100).toFixed(1);
      const col  = '#' + (getEntityStyle(node?.type ?? 'default').color).toString(16).padStart(6, '0');
      return `<div class="sl-cbar-row" data-qid="${_e(id)}">
        <span class="sl-cbar-lbl">${_e(lbl.length > 22 ? lbl.slice(0, 21) + '…' : lbl)}</span>
        <div class="sl-cbar-track"><div class="sl-cbar-fill" style="width:${pct}%;background:${col}"></div></div>
        <span class="sl-cbar-val">${pct}%</span>
      </div>`;
    }).join('')}
  </div>`;
}

function _relDistBars(dist) {
  if (!dist) return '';
  const sorted = Object.entries(dist).sort(([, a], [, b]) => b - a).slice(0, 8);
  if (!sorted.length) return '';
  const max = sorted[0][1];
  return `<div class="sl-chart-block">
    <div class="sl-chart-title">Relationships</div>
    ${sorted.map(([rel, count]) => {
      const pct = (count / max * 100).toFixed(1);
      return `<div class="sl-cbar-row">
        <span class="sl-cbar-lbl">${_e(rel)}</span>
        <div class="sl-cbar-track"><div class="sl-cbar-fill" style="width:${pct}%;background:#cc6600"></div></div>
        <span class="sl-cbar-val">${count}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function _sentimentBar(dist) {
  if (!dist) return '';
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  if (!total) return '';
  const SCOL = { positive: '#00ff88', negative: '#ff4444', neutral: '#555544', contested: '#ffcc00' };
  const entries = Object.entries(dist).filter(([, v]) => v > 0);
  const segs = entries.map(([k, v]) => {
    const col = SCOL[k] ?? '#666';
    const pct = (v / total * 100).toFixed(0);
    return `<div class="sl-sent-seg" style="flex:${v};background:${col}" title="${_e(k)}: ${v} (${pct}%)">
      <span class="sl-sent-lbl">${_e(k.slice(0, 3).toUpperCase())}</span>
    </div>`;
  }).join('');
  return `<div class="sl-chart-block">
    <div class="sl-chart-title">Sentiment</div>
    <div class="sl-sent-row">${segs}</div>
  </div>`;
}

// ── Active-slide tracking via IntersectionObserver ──────────────────────────

function _bindIntersection() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  if (!_track) return;

  _observer = new IntersectionObserver((entries) => {
    // Pick the entry with the greatest intersection ratio
    let best = null;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
    }
    if (!best) return;
    const idx = parseInt(best.target.dataset.slideIdx ?? '-1', 10);
    if (idx >= 0 && idx !== _active) _setActive(idx);
  }, {
    root: _track,
    rootMargin: '0px',
    threshold: [0.55, 0.75, 0.95],
  });

  _track.querySelectorAll('.sl-slide').forEach(el => _observer.observe(el));
}

function _setActive(n) {
  _active = n;
  _updateIndex();
  _track.querySelectorAll('.sl-slide').forEach(el => {
    el.classList.toggle('sl-active', parseInt(el.dataset.slideIdx, 10) === n);
  });
  _wrap.querySelectorAll('.sl-dot').forEach(el => {
    el.classList.toggle('sl-dot-active', parseInt(el.dataset.dotIdx, 10) === n);
  });

  const slide = _slides[n];
  if (!slide) return;
  if (_title) _title.textContent = slide.title ?? '';
  if (slide.frameNodes?.length) {
    document.dispatchEvent(new CustomEvent('slides:frame', { detail: { nodeIds: slide.frameNodes } }));
  } else {
    document.dispatchEvent(new CustomEvent('slides:frame', { detail: { nodeIds: [] } }));
  }
}

function _updateIndex() {
  if (!_index) return;
  _index.textContent = `${String(_active + 1).padStart(2, '0')} / ${String(_slides.length).padStart(2, '0')}`;
}

function _renderDots() {
  const dots = _wrap.querySelector('.sl-dots');
  if (!dots) return;
  dots.innerHTML = _slides.map((s, i) =>
    `<button class="sl-dot sl-dot-${_e(s.type)}" data-dot-idx="${i}" aria-label="Slide ${i + 1}: ${_e(s.title)}" title="${_e(s.title)}"></button>`
  ).join('');
}

// ── Click delegation ────────────────────────────────────────────────────────

function _bindClicks() {
  // Entity pills / centrality rows → navigate to node (leave slides)
  _track.querySelectorAll('[data-qid]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const qid = el.dataset.qid;
      if (qid) document.dispatchEvent(new CustomEvent('slides:navigate', { detail: { qid } }));
    });
  });

  // Jump to specific slide by slide-id
  _track.querySelectorAll('[data-goto-slide]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id  = el.dataset.gotoSlide;
      const idx = _slides.findIndex(s => s.id === id);
      if (idx >= 0) goToSlide(idx);
    });
  });

  // Mode switch buttons inside slides (closer slide has one)
  _track.querySelectorAll('.sl-mode-btn').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const mode = el.dataset.mode ?? 'reader';
      document.dispatchEvent(new CustomEvent('slides:mode', { detail: { mode } }));
    });
  });

  // Dot navigation
  _wrap.querySelectorAll('.sl-dot').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(el.dataset.dotIdx, 10);
      if (!isNaN(idx)) goToSlide(idx);
    });
  });
}

// ── Small helpers ───────────────────────────────────────────────────────────

function _pill(id, doc, mod = '') {
  const node  = doc.nodeLookup?.[id];
  const label = node?.label ?? id;
  const style = getEntityStyle(node?.type ?? 'default');
  const col   = '#' + style.color.toString(16).padStart(6, '0');
  return `<span class="sl-pill${mod ? ' sl-pill-' + mod : ''}" data-qid="${_e(id)}" style="border-color:${col}">${_e(label)}</span>`;
}

function _entityBadge(node) {
  const style = getEntityStyle(node.type ?? 'default');
  const col   = '#' + style.color.toString(16).padStart(6, '0');
  return `<div class="sl-ebadge" data-qid="${_e(node.id)}">
    <span class="sl-ebadge-type" style="color:${col}">${_e(style.label.toUpperCase())}</span>
    <span class="sl-ebadge-lbl">${_e(node.label ?? node.id)}</span>
  </div>`;
}

function _tensionVal(t) {
  return { low: 1, medium: 2, high: 3, climax: 4 }[t] ?? 1;
}

function _parseStat(s) {
  if (typeof s === 'string') {
    const sep = s.indexOf(': ');
    return sep > 0
      ? { label: s.slice(0, sep), value: s.slice(sep + 2) }
      : { label: '', value: s };
  }
  return { label: s.label ?? '', value: s.value ?? '' };
}

function _e(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
