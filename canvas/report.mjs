/**
 * report.mjs — rich story-driven report view.
 *
 * Renders an intelligence brief from enriched doc metadata:
 *   Header → Briefing → Story Arc → Insights → Entity Spotlight → Clusters
 *
 * All entity pills/cards dispatch 'report:navigate' { qid } on click.
 * Switching to graph mode is handled by main.mjs.
 */

import { getEntityStyle } from '../ontology.mjs';

let _wrap  = null;
let _inner = null;

export function initReport() {
  _wrap  = document.getElementById('report-wrap');
  _inner = document.getElementById('report-inner');
}

export function renderReport(docMeta) {
  if (!_inner || !docMeta) return;
  _inner.innerHTML = [
    _header(docMeta),
    _briefing(docMeta),
    _storyArc(docMeta),
    _insights(docMeta),
    _entitySpotlight(docMeta),
    _clusters(docMeta),
    _footer(docMeta),
  ].join('');
  _bindClicks(_inner);
}

export function showReport() { _wrap?.classList.add('rp-visible'); }
export function hideReport() { _wrap?.classList.remove('rp-visible'); }
export function isReportVisible() { return !!_wrap?.classList.contains('rp-visible'); }

// ── Section renderers ─────────────────────────────────────────────────────────

function _header(doc) {
  const tags = (doc.tags ?? []).map(t => `<span class="rp-tag">${_e(t)}</span>`).join('');
  const tone = doc.tone ?? 'analytical';
  return `
  <header class="rp-header">
    <div class="rp-header-meta">
      <span class="rp-domain">${_e(doc.domain)}</span>
      <span class="rp-sep">·</span>
      <span class="rp-year">${_e(doc.year)}</span>
      <span class="rp-tone rp-tone-${_e(tone)}">${_e(tone.toUpperCase())}</span>
    </div>
    <h1 class="rp-title">${_e(doc.title)}</h1>
    ${doc.subtitle ? `<p class="rp-subtitle">${_e(doc.subtitle)}</p>` : ''}
    ${tags ? `<div class="rp-tags">${tags}</div>` : ''}
  </header>`;
}

function _briefing(doc) {
  const rc = doc.report_card ?? {};

  const stats = (rc.key_stats ?? []).map(s =>
    `<div class="rp-stat">
      <span class="rp-stat-val">${_e(s.value)}</span>
      <span class="rp-stat-lbl">${_e(s.label)}</span>
    </div>`
  ).join('');

  const prota = (rc.protagonists ?? []).map(id => _pill(id, doc)).join('');
  const antag = (rc.antagonists  ?? []).map(id => _pill(id, doc, 'neg')).join('');
  const themes = (rc.themes ?? []).map(t => `<span class="rp-theme">${_e(t)}</span>`).join('');

  return `
  <section class="rp-briefing">
    <div class="rp-sechdr">── EXECUTIVE BRIEFING ─────────────────────────────────────────────</div>
    ${rc.summary ? `<p class="rp-summary">${_e(rc.summary)}</p>` : ''}
    ${stats ? `<div class="rp-stats-row">${stats}</div>` : ''}
    <div class="rp-actors-row">
      ${prota ? `<div class="rp-actor-grp"><span class="rp-actor-lbl">PROTAGONISTS</span>${prota}</div>` : ''}
      ${antag ? `<div class="rp-actor-grp"><span class="rp-actor-lbl rp-actor-lbl-neg">ANTAGONISTS</span>${antag}</div>` : ''}
    </div>
    ${themes ? `<div class="rp-themes-row"><span class="rp-actor-lbl">THEMES</span>${themes}</div>` : ''}
  </section>`;
}

function _storyArc(doc) {
  if (!doc.story?.length) return '';

  // Mini arc visualizer — dots colored by tension
  const TENSION_COLOR = { low: '#334433', medium: '#cc8800', high: '#ff4400', climax: '#ff0044' };
  const arcDots = doc.story.map((b, i) => {
    const col = TENSION_COLOR[b.tension] ?? '#334433';
    return `<span class="rp-arc-dot" style="background:${col}" title="${_e(b.title)}"></span>`;
  }).join('<span class="rp-arc-line"></span>');

  const beats = doc.story.map((beat, i) => {
    const primary = doc.nodeLookup?.[beat.node];
    const related = (beat.nodes ?? []).map(id => _pill(id, doc)).join('');
    return `
    <div class="rp-beat rp-tension-${_e(beat.tension ?? 'low')}">
      <div class="rp-beat-bar"></div>
      <div class="rp-beat-body">
        <div class="rp-beat-hdr">
          <span class="rp-beat-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="rp-beat-title">${_e(beat.title)}</span>
          <span class="rp-beat-tension-tag">${_e((beat.tension ?? 'low').toUpperCase())}</span>
        </div>
        ${primary ? _entityBadge(primary) : ''}
        <p class="rp-beat-narration">${_e(beat.narration)}</p>
        ${related ? `<div class="rp-beat-related"><span class="rp-related-lbl">ALSO ▸</span>${related}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `
  <section class="rp-story">
    <div class="rp-sechdr">── STORY ────────────────────────────────────────────────────────────</div>
    <div class="rp-arc-row">${arcDots}</div>
    ${beats}
  </section>`;
}

function _insights(doc) {
  if (!doc.insights?.length) return '';

  const ICON = { finding:'◈', warning:'⚑', pattern:'◎', conclusion:'◆', paradox:'◉', opportunity:'◇' };
  const SBAR = { high:'███', medium:'██░', low:'█░░' };

  const cards = doc.insights.map(ins => {
    const icon = ICON[ins.type] ?? '◈';
    const sbar = SBAR[ins.severity] ?? '██░';
    const evidence = (ins.evidence ?? []).map(id => _pill(id, doc)).join('');
    return `
    <div class="rp-insight rp-ins-${_e(ins.type)} rp-sev-${_e(ins.severity ?? 'medium')}">
      <div class="rp-ins-hdr">
        <span class="rp-ins-icon">${icon}</span>
        <span class="rp-ins-type">${_e((ins.type ?? 'finding').toUpperCase())}</span>
        <span class="rp-ins-sbar">${sbar}</span>
        <span class="rp-ins-sevlbl">${_e((ins.severity ?? 'medium').toUpperCase())}</span>
      </div>
      <blockquote class="rp-ins-quote">"${_e(ins.title)}"</blockquote>
      <p class="rp-ins-body">${_e(ins.body)}</p>
      ${evidence ? `<div class="rp-ins-evidence"><span class="rp-related-lbl">EVIDENCE ▸</span>${evidence}</div>` : ''}
    </div>`;
  }).join('');

  return `
  <section class="rp-insights-sec">
    <div class="rp-sechdr">── ANALYTICAL INSIGHTS ──────────────────────────────────────────────</div>
    <div class="rp-insights-grid">${cards}</div>
  </section>`;
}

function _entitySpotlight(doc) {
  const rc = doc.report_card ?? {};
  const protas = (rc.protagonists ?? []).map(id => doc.nodeLookup?.[id]).filter(Boolean);
  const antags  = (rc.antagonists  ?? []).map(id => doc.nodeLookup?.[id]).filter(Boolean);
  if (!protas.length && !antags.length) return '';

  const card = (node) => {
    const style  = getEntityStyle(node.type ?? 'default');
    const col    = '#' + style.color.toString(16).padStart(6, '0');
    const metrics = node.metrics
      ? Object.entries(node.metrics).slice(0, 5).map(([k, v]) =>
          `<div class="rp-ec-row"><span class="rp-ec-k">${_e(k)}</span><span class="rp-ec-v">${_e(String(v))}</span></div>`
        ).join('')
      : '';
    const descShort = node.description
      ? node.description.length > 160 ? node.description.slice(0, 159) + '…' : node.description
      : '';
    return `
    <div class="rp-ec rp-ec-${_e(node.sentiment ?? 'neutral')}" data-qid="${_e(node.id)}">
      <div class="rp-ec-top">
        <span class="rp-ec-type" style="color:${col}">${_e(style.label.toUpperCase())}</span>
        <span class="rp-ec-tier">${_e((node.tier ?? 'primary').toUpperCase())}</span>
      </div>
      <div class="rp-ec-label" style="border-left-color:${col}">${_e(node.label)}</div>
      ${descShort ? `<p class="rp-ec-desc">${_e(descShort)}</p>` : ''}
      ${metrics ? `<div class="rp-ec-metrics">${metrics}</div>` : ''}
      <button class="rp-ec-goto" data-qid="${_e(node.id)}">VIEW IN GRAPH →</button>
    </div>`;
  };

  return `
  <section class="rp-spotlight">
    <div class="rp-sechdr">── ENTITY SPOTLIGHT ─────────────────────────────────────────────────</div>
    ${protas.length ? `
      <div class="rp-spot-grp">
        <div class="rp-spot-grp-lbl">PROTAGONISTS</div>
        <div class="rp-ec-grid">${protas.map(card).join('')}</div>
      </div>` : ''}
    ${antags.length ? `
      <div class="rp-spot-grp">
        <div class="rp-spot-grp-lbl rp-spot-grp-lbl-neg">ANTAGONISTS / FORCES</div>
        <div class="rp-ec-grid">${antags.map(card).join('')}</div>
      </div>` : ''}
  </section>`;
}

function _clusters(doc) {
  if (!doc.clusters?.length) return '';

  const cards = doc.clusters.map(cl => {
    const col   = cl.color ?? '#666666';
    const nodes = (cl.nodes ?? []).map(id => {
      const n = doc.nodeLookup?.[id];
      return `<span class="rp-cl-node" data-qid="${_e(id)}">${_e(n?.label ?? id)}</span>`;
    }).join('');
    return `
    <div class="rp-cl-card" style="--cl-color:${_e(col)}">
      <div class="rp-cl-hdr">
        <span class="rp-cl-dot" style="background:${_e(col)}"></span>
        <span class="rp-cl-lbl">${_e(cl.label)}</span>
        <span class="rp-cl-cnt">${cl.nodes?.length ?? 0}</span>
      </div>
      ${cl.description ? `<p class="rp-cl-desc">${_e(cl.description)}</p>` : ''}
      <div class="rp-cl-nodes">${nodes}</div>
    </div>`;
  }).join('');

  return `
  <section class="rp-clusters-sec">
    <div class="rp-sechdr">── ENTITY CLUSTERS ──────────────────────────────────────────────────</div>
    <div class="rp-cl-grid">${cards}</div>
  </section>`;
}

function _footer(doc) {
  return `
  <footer class="rp-footer">
    <span>kaaroViewer</span><span class="rp-sep">·</span>
    <span>${_e(doc.domain)}</span><span class="rp-sep">·</span>
    <span>${_e(doc.year)}</span><span class="rp-sep">·</span>
    <span>${_e(doc.id)}</span>
  </footer>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _entityBadge(node) {
  const style = getEntityStyle(node.type ?? 'default');
  const col   = '#' + style.color.toString(16).padStart(6, '0');
  return `<div class="rp-ebadge" data-qid="${_e(node.id)}">
    <span class="rp-ebadge-type" style="color:${col}">${_e(style.label.toUpperCase())}</span>
    <span class="rp-ebadge-lbl">${_e(node.label)}</span>
  </div>`;
}

function _pill(id, doc, mod = '') {
  const node = doc.nodeLookup?.[id];
  const label = node?.label ?? id;
  const style = getEntityStyle(node?.type ?? 'default');
  const col   = '#' + style.color.toString(16).padStart(6, '0');
  return `<span class="rp-pill${mod ? ' rp-pill-' + mod : ''}" data-qid="${_e(id)}" style="border-color:${col}">${_e(label)}</span>`;
}

function _bindClicks(root) {
  root.querySelectorAll('[data-qid]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const qid = el.dataset.qid;
      if (qid) document.dispatchEvent(new CustomEvent('report:navigate', { detail: { qid } }));
    });
  });
}

function _e(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
