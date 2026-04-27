#!/usr/bin/env node
/**
 * scripts/build-graph.mjs
 *
 * Reads sessions-data.json → builds graph nodes/edges → writes graph.html
 *
 * Graph layers:
 *   project  (7)   — fixed cluster anchors, sized by session count
 *   session  (56)  — orbit project, sized by sqrt(total tokens)
 *   file     (N)   — float between sessions, sized by edit+write count
 *                    only files touched (edit or write) in MIN_SESSIONS+ sessions
 *
 * Run: node scripts/build-graph.mjs [--min-sessions=2]
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const DATA   = JSON.parse(fs.readFileSync(path.join(__dir, 'sessions-data.json'), 'utf8'));

// Default: only show files touched (write or edit) in 2+ distinct sessions
const MIN_FILE_SESSIONS = parseInt(process.argv.find(a => a.startsWith('--min-sessions='))?.split('=')[1] ?? '2');

// ── Color maps ────────────────────────────────────────────────────────────────

const PROJECT_COLORS = {
  'D--src-kaaroViewer':                '#00aaff',
  'D--src-art-of-intent':              '#ff4488',
  'D--src-kaaroCatalogue':             '#cc44ff',
  'D--src-kaaroExcalidraw':            '#ff8800',
  'D--src-kaaroPoker':                 '#00ff88',
  'D--src-karx-github-io':             '#ffcc00',
  'C--Users-karx0-kaaro-codepractice': '#00cccc',
};

const EXT_COLORS = {
  mjs: '#00cccc', js: '#00aaff', ts: '#6688ff', svelte: '#ff8844',
  json: '#ffcc00', md: '#cc44ff', html: '#ff4488', css: '#00ff88',
  py: '#88cc44', txt: '#888888', sh: '#44ffaa', css: '#33ee88',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const sessById = {};
DATA.sessions.forEach(s => { sessById[s.session_id] = s; });

// ── Build nodes ───────────────────────────────────────────────────────────────

const nodes = [];
const edges = [];

// 1. Project nodes
for (const proj of DATA.projects) {
  const tokenTotal = proj.tokens.input + proj.tokens.cache_create + proj.tokens.cache_read + proj.tokens.output;
  nodes.push({
    id:            proj.id,
    type:          'project',
    label:         proj.label,
    color:         PROJECT_COLORS[proj.id] || '#888888',
    session_count: proj.session_count,
    tokens_total:  tokenTotal,
    skills:        proj.skills,
    tool_calls:    0, // filled below
  });
}

// 2. Session nodes
const MAX_SESS_TOKENS = Math.max(1, ...DATA.sessions.map(s => s.tokens?.total || 0));

for (const sess of DATA.sessions) {
  const tokens   = sess.tokens?.total || 0;
  const sizeNorm = Math.sqrt(tokens / MAX_SESS_TOKENS);
  nodes.push({
    id:                  sess.session_id,
    type:                'session',
    label:               sess.slug || sess.session_id.slice(0, 8),
    color:               PROJECT_COLORS[sess.project_id] || '#888888',
    project_id:          sess.project_id,
    tokens_total:        tokens,
    tool_calls:          sess.tool_calls,
    tool_errors:         sess.tool_errors,
    skills:              sess.skills || [],
    builtin_commands:    sess.builtin_commands || [],
    date_str:            sess.date_str,
    duration_min:        sess.duration_min,
    cache_hit_rate:      sess.cache_hit_rate,
    tool_diversity:      sess.tool_diversity,
    first_user_message:  sess.first_user_message,
    sizeNorm,
    // error severity: 0=clean, 1=few, 2=many
    errorLevel: sess.tool_errors >= 8 ? 2 : sess.tool_errors >= 3 ? 1 : 0,
  });
  edges.push({ source: sess.session_id, target: sess.project_id, type: 'membership' });
}

// 3. File nodes — only files with edits+writes in MIN_FILE_SESSIONS+ sessions
const globalFiles = DATA.rollup?.files || [];
const MAX_FILE_WEIGHT = Math.max(1, ...globalFiles.map(f => f.write + f.edit));

let fileCount = 0;
for (const f of globalFiles) {
  if (f.sessions.length < MIN_FILE_SESSIONS) continue;
  if (f.write + f.edit === 0) continue;

  const ext      = (f.path.split('.').pop() || '').toLowerCase().split('?')[0];
  const shortName = f.path.split('/').pop();
  const sizeNorm  = Math.sqrt((f.write + f.edit) / MAX_FILE_WEIGHT);

  nodes.push({
    id:            f.path,
    type:          'file',
    label:         shortName,
    full_path:     f.path,
    color:         EXT_COLORS[ext] || '#666666',
    ext,
    read:          f.read,
    write:         f.write,
    edit:          f.edit,
    session_count: f.sessions.length,
    sizeNorm,
  });
  fileCount++;

  // Edges: one edge per session per file (pick highest-priority op type)
  for (const sessId of f.sessions) {
    const sess = sessById[sessId];
    if (!sess?.file_ops?.[f.path]) continue;
    const ops = sess.file_ops[f.path];
    // Prefer write > edit > read for single edge label
    const opType = ops.write > 0 ? 'write' : ops.edit > 0 ? 'edit' : 'read';
    const weight = ops.write + ops.edit + ops.read;
    edges.push({ source: sessId, target: f.path, type: opType, weight });
  }
}

// ── Stats for console ─────────────────────────────────────────────────────────

const projNodes    = nodes.filter(n => n.type === 'project');
const sessNodes    = nodes.filter(n => n.type === 'session');
const fileNodes    = nodes.filter(n => n.type === 'file');
const writeEdges   = edges.filter(e => e.type === 'write').length;
const editEdges    = edges.filter(e => e.type === 'edit').length;
const memberEdges  = edges.filter(e => e.type === 'membership').length;

console.log(`Graph: ${nodes.length} nodes (${projNodes.length} project · ${sessNodes.length} session · ${fileNodes.length} file)`);
console.log(`Edges: ${edges.length} (${memberEdges} membership · ${writeEdges} write · ${editEdges} edit)`);

// ── HTML template ─────────────────────────────────────────────────────────────

const graphJson = JSON.stringify({ nodes, edges, meta: DATA.meta });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Code Sessions — Force Graph</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #080810;
  color: #9aa0b8;
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  overflow: hidden;
  user-select: none;
}
#canvas { display: block; width: 100vw; height: 100vh; }

/* ── Tooltip ── */
#tip {
  position: fixed;
  pointer-events: none;
  background: #0e0e1c;
  border: 1px solid #252540;
  padding: 10px 14px;
  max-width: 320px;
  display: none;
  line-height: 1.6;
  z-index: 200;
  box-shadow: 0 4px 20px rgba(0,0,0,0.6);
}
#tip strong { color: #ffffff; display: block; margin-bottom: 2px; font-size: 12px; }
#tip .meta  { color: #5566aa; }
#tip .body  { color: #9ab; margin-top: 6px; font-size: 10px; line-height: 1.4; }

/* ── Legend ── */
#legend {
  position: fixed; top: 16px; left: 16px;
  background: rgba(8,8,16,0.88);
  border: 1px solid #1c1c34;
  padding: 12px 16px; min-width: 190px;
}
#legend h3 { color: #4455cc; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; }
.leg { display: flex; align-items: center; gap: 8px; margin: 5px 0; color: #778; }
.dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.dia { width: 10px; height: 10px; transform: rotate(45deg); flex-shrink: 0; }
.ring { width: 12px; height: 12px; border-radius: 50%; border: 2px solid; background: transparent; flex-shrink: 0; }
.line { width: 22px; height: 2px; flex-shrink: 0; }
.leg-sep { border-top: 1px solid #1c1c34; margin: 8px 0; }

/* ── Controls ── */
#controls {
  position: fixed; top: 16px; right: 16px;
  background: rgba(8,8,16,0.88);
  border: 1px solid #1c1c34;
  padding: 12px 16px; min-width: 210px;
}
#controls h3 { color: #4455cc; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; }
.ctrl { display: flex; align-items: center; gap: 8px; margin: 7px 0; }
.ctrl label { flex: 1; cursor: pointer; color: #778; }
input[type=checkbox] { accent-color: #4455cc; cursor: pointer; }
input[type=range]    { flex: 1; accent-color: #4455cc; cursor: pointer; }
span.val { min-width: 16px; text-align: right; color: #9ab; }

/* ── Stats bar ── */
#stats {
  position: fixed; bottom: 14px; left: 16px;
  color: #333355; font-size: 10px; letter-spacing: 1px;
  pointer-events: none;
}

/* ── Info panel ── */
#panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: 300px;
  background: rgba(8,8,16,0.95);
  border-left: 1px solid #1c1c34;
  padding: 20px 18px;
  display: none; overflow-y: auto;
}
#panel-close {
  position: absolute; top: 12px; right: 14px;
  cursor: pointer; color: #334; font-size: 18px; line-height: 1;
}
#panel-close:hover { color: #fff; }
#panel h3 { font-size: 13px; margin-bottom: 14px; word-break: break-all; }
.prow { display: flex; justify-content: space-between; gap: 8px; margin: 5px 0; font-size: 11px; }
.pkey { color: #445566; flex-shrink: 0; }
.pval { color: #c0cce0; text-align: right; word-break: break-all; }
.pmsg { margin-top: 10px; color: #6677aa; font-size: 10px; line-height: 1.5; }
.psep { border-top: 1px solid #1c1c34; margin: 10px 0; }
.ptag { display: inline-block; background: #1a1a30; border: 1px solid #2a2a50;
        padding: 1px 6px; margin: 2px 2px 0 0; font-size: 10px; color: #8899cc; }
</style>
</head>
<body>
<svg id="canvas"></svg>
<div id="tip"></div>

<div id="legend">
  <h3>◆ LEGEND</h3>
  <div class="leg"><div class="dot" style="background:#0e0e1c;border:2px solid #fff;box-sizing:border-box"></div><span>Project cluster</span></div>
  <div class="leg"><div class="dot" style="background:#00aaff;opacity:.9"></div><span>Session (size = tokens)</span></div>
  <div class="leg"><div class="dia" style="background:#00cccc"></div><span>File (size = edits)</span></div>
  <div class="leg-sep"></div>
  <div class="leg"><div class="line" style="background:#00ff88;opacity:.7"></div><span>write op</span></div>
  <div class="leg"><div class="line" style="background:#ffcc00;opacity:.7"></div><span>edit op</span></div>
  <div class="leg"><div class="line" style="background:#223366;opacity:.9"></div><span>read op</span></div>
  <div class="leg"><div class="line" style="background:#334;opacity:.7"></div><span>membership</span></div>
  <div class="leg-sep"></div>
  <div class="leg"><div class="ring" style="border-color:#ff2244"></div><span>high error session</span></div>
  <div class="leg"><div class="ring" style="border-color:#ffcc00"></div><span>skill used</span></div>
</div>

<div id="controls">
  <h3>◆ FILTER</h3>
  <div class="ctrl">
    <input type="checkbox" id="cb-files" checked>
    <label for="cb-files">Show file nodes</label>
  </div>
  <div class="ctrl">
    <input type="checkbox" id="cb-reads">
    <label for="cb-reads">Show read edges</label>
  </div>
  <div class="ctrl">
    <label for="sl-min">Min sessions (file):</label>
    <input type="range" id="sl-min" min="1" max="10" value="${MIN_FILE_SESSIONS}">
    <span class="val" id="sl-min-val">${MIN_FILE_SESSIONS}</span>
  </div>
  <div class="ctrl">
    <label for="sl-alpha">Reheat:</label>
    <button id="btn-reheat" style="background:#1a1a30;border:1px solid #334;color:#9ab;padding:2px 10px;cursor:pointer;font-family:inherit">⟳ Shake</button>
  </div>
</div>

<div id="stats"></div>

<div id="panel">
  <span id="panel-close" onclick="closePanel()">✕</span>
  <div id="panel-content"></div>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
// ── Embedded data ──────────────────────────────────────────────────────────
const GRAPH = ${graphJson};

// ── Setup ──────────────────────────────────────────────────────────────────
const svg  = d3.select('#canvas');
let   W    = window.innerWidth;
let   H    = window.innerHeight;
const cx   = () => W / 2;
const cy   = () => H / 2;

svg.attr('width', W).attr('height', H);

// Root group for zoom/pan
const root = svg.append('g').attr('id', 'root');
svg.call(
  d3.zoom().scaleExtent([0.08, 12])
    .on('zoom', e => root.attr('transform', e.transform))
);

// Layer order matters for hit testing
const edgeLayer  = root.append('g').attr('id', 'edges');
const errorLayer = root.append('g').attr('id', 'errors');
const nodeLayer  = root.append('g').attr('id', 'nodes');
const labelLayer = root.append('g').attr('id', 'labels');

// ── Node sizing ────────────────────────────────────────────────────────────
const PROJ_R = 26, SESS_RMIN = 6, SESS_RMAX = 22, FILE_RMIN = 4, FILE_RMAX = 14;

function nodeR(d) {
  if (d.type === 'project') return PROJ_R;
  if (d.type === 'session') return SESS_RMIN + (SESS_RMAX - SESS_RMIN) * (d.sizeNorm || 0);
  return FILE_RMIN + (FILE_RMAX - FILE_RMIN) * (d.sizeNorm || 0);
}

// ── Initial positions ──────────────────────────────────────────────────────
// Projects: fixed ring around center
const projNodes = GRAPH.nodes.filter(n => n.type === 'project');
const projPos   = {};
projNodes.forEach((p, i) => {
  const angle = (i / projNodes.length) * 2 * Math.PI - Math.PI / 2;
  p.x  = cx() + 230 * Math.cos(angle);
  p.y  = cy() + 200 * Math.sin(angle);
  p.fx = p.x;
  p.fy = p.y;
  projPos[p.id] = { x: p.x, y: p.y };
});

// Sessions: random scatter near their project
GRAPH.nodes.filter(n => n.type === 'session').forEach(s => {
  const pp = projPos[s.project_id] || { x: cx(), y: cy() };
  s.x = pp.x + (Math.random() - 0.5) * 110;
  s.y = pp.y + (Math.random() - 0.5) * 110;
});

// Files: midpoint of connected sessions
const sessById = {};
GRAPH.nodes.filter(n => n.type === 'session').forEach(s => sessById[s.id] = s);
GRAPH.nodes.filter(n => n.type === 'file').forEach(f => {
  const linked = GRAPH.edges
    .filter(e => (e.target === f.id || e.source === f.id))
    .map(e => sessById[e.source === f.id ? e.target : e.source])
    .filter(Boolean);
  if (linked.length) {
    f.x = linked.reduce((s, n) => s + n.x, 0) / linked.length + (Math.random()-0.5)*50;
    f.y = linked.reduce((s, n) => s + n.y, 0) / linked.length + (Math.random()-0.5)*50;
  } else {
    f.x = cx() + (Math.random()-0.5)*300;
    f.y = cy() + (Math.random()-0.5)*300;
  }
});

// ── Simulation ─────────────────────────────────────────────────────────────
const simulation = d3.forceSimulation(GRAPH.nodes)
  .force('link', d3.forceLink(GRAPH.edges).id(d => d.id)
    .distance(d => d.type === 'membership' ? 120 : d.type === 'read' ? 90 : 65)
    .strength(d => d.type === 'membership' ? 0.7 : d.type === 'read' ? 0.1 : 0.35))
  .force('charge', d3.forceManyBody()
    .strength(d => d.type === 'project' ? -700 : d.type === 'session' ? -140 : -60))
  .force('collision', d3.forceCollide(d => nodeR(d) + 4).strength(0.9))
  .alphaDecay(0.006)
  .velocityDecay(0.38);

// ── Edge rendering ─────────────────────────────────────────────────────────
const EDGE_COLOR   = { membership: '#1e2244', write: '#00ff88', edit: '#ffcc00', read: '#11223a' };
const EDGE_OPACITY = { membership: 0.5,       write: 0.65,       edit: 0.65,      read: 0.3  };
const EDGE_WIDTH   = { membership: 1.5,        write: 1,          edit: 1,          read: 0.8  };

let edgeSel = edgeLayer.selectAll('line').data(GRAPH.edges).join('line')
  .attr('stroke',         d => EDGE_COLOR[d.type]   || '#222')
  .attr('stroke-opacity', d => EDGE_OPACITY[d.type] || 0.3)
  .attr('stroke-width',   d => EDGE_WIDTH[d.type]   || 1)
  .attr('class',          d => 'edge edge-' + d.type);

// ── Node rendering ─────────────────────────────────────────────────────────
const nodeById = {};
GRAPH.nodes.forEach(n => nodeById[n.id] = n);

let nodeSel = nodeLayer.selectAll('g.node').data(GRAPH.nodes).join(
  enter => {
    const g = enter.append('g')
      .attr('class', d => 'node node-' + d.type)
      .style('cursor', 'pointer');

    g.each(function(d) {
      const el = d3.select(this);
      const r  = nodeR(d);

      if (d.type === 'project') {
        el.append('circle')
          .attr('r', PROJ_R)
          .attr('fill', '#080810')
          .attr('stroke', d.color)
          .attr('stroke-width', 2.5);
        el.append('circle')
          .attr('r', PROJ_R - 6)
          .attr('fill', d.color)
          .attr('fill-opacity', 0.12);

      } else if (d.type === 'session') {
        // Error halo
        if (d.errorLevel === 2)
          el.append('circle').attr('r', r + 5).attr('fill', 'none')
            .attr('stroke', '#ff2244').attr('stroke-width', 1.5).attr('stroke-opacity', 0.7);
        else if (d.errorLevel === 1)
          el.append('circle').attr('r', r + 4).attr('fill', 'none')
            .attr('stroke', '#ff6644').attr('stroke-width', 1).attr('stroke-opacity', 0.5);

        // Skill ring
        if (d.skills && d.skills.length > 0)
          el.append('circle').attr('r', r + 3).attr('fill', 'none')
            .attr('stroke', '#ffcc00').attr('stroke-width', 1).attr('stroke-opacity', 0.6)
            .attr('stroke-dasharray', '3 2');

        el.append('circle')
          .attr('r', r)
          .attr('fill', d.color)
          .attr('fill-opacity', 0.82)
          .attr('stroke', '#000').attr('stroke-width', 0.5);

      } else {
        // File: diamond
        el.append('path')
          .attr('d', \`M0,\${-r} L\${r},0 L0,\${r} L\${-r},0 Z\`)
          .attr('fill', d.color)
          .attr('fill-opacity', 0.8)
          .attr('stroke', d.color).attr('stroke-width', 0.5).attr('stroke-opacity', 0.4);
      }
    });

    return g;
  }
);

// ── Project labels ─────────────────────────────────────────────────────────
const projLabelSel = labelLayer.selectAll('text.plabel')
  .data(projNodes).join('text')
  .attr('class', 'plabel')
  .attr('text-anchor', 'middle')
  .attr('fill', d => d.color)
  .attr('font-size', 9).attr('letter-spacing', 1)
  .attr('pointer-events', 'none')
  .text(d => d.label.toUpperCase());

// ── Drag ───────────────────────────────────────────────────────────────────
nodeSel.call(d3.drag()
  .on('start', (ev, d) => {
    if (!ev.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  })
  .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
  .on('end', (ev, d) => {
    if (!ev.active) simulation.alphaTarget(0);
    if (d.type !== 'project') { d.fx = null; d.fy = null; }
  })
);

// ── Tick ───────────────────────────────────────────────────────────────────
simulation.on('tick', () => {
  edgeSel
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y);

  nodeSel.attr('transform', d => \`translate(\${d.x},\${d.y})\`);

  projLabelSel
    .attr('x', d => d.x)
    .attr('y', d => d.y + PROJ_R + 13);
});

// ── Tooltip ────────────────────────────────────────────────────────────────
const tip = document.getElementById('tip');

function fmt(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return n;
}

nodeSel.on('mouseover', (ev, d) => {
  tip.style.display = 'block';
  if (d.type === 'project') {
    tip.innerHTML = \`<strong style="color:\${d.color}">\${d.label}</strong>
      <div class="meta">\${d.session_count} sessions · \${fmt(d.tokens_total)} tokens</div>
      \${d.skills.length ? '<div class="meta">Skills: /' + d.skills.join(' /') + '</div>' : ''}\`;
  } else if (d.type === 'session') {
    tip.innerHTML = \`<strong style="color:\${d.color}">\${d.label}</strong>
      <div class="meta">\${d.date_str || '?'} · \${d.duration_min != null ? d.duration_min + 'min' : '?'}</div>
      <div class="meta">\${fmt(d.tokens_total)} tokens · \${d.cache_hit_rate}% cache</div>
      <div class="meta">\${d.tool_calls} calls · \${d.tool_errors} errors · \${d.tool_diversity} tools</div>
      \${d.skills.length ? '<div class="meta">/' + d.skills.join(' /') + '</div>' : ''}
      \${d.first_user_message ? '<div class="body">' + d.first_user_message.slice(0,130) + '</div>' : ''}\`;
  } else {
    tip.innerHTML = \`<strong style="color:\${d.color}">\${d.label}</strong>
      <div class="meta">\${d.session_count} sessions · \${d.edit} edits · \${d.write} writes · \${d.read} reads</div>
      <div class="meta" style="word-break:break-all;font-size:10px">\${d.full_path}</div>\`;
  }
}).on('mousemove', ev => {
  const tx = ev.clientX + 16;
  const ty = ev.clientY - 8;
  const ow = tip.offsetWidth;
  tip.style.left = (tx + ow > W - 10 ? ev.clientX - ow - 16 : tx) + 'px';
  tip.style.top  = Math.min(ty, H - tip.offsetHeight - 10) + 'px';
}).on('mouseout', () => {
  tip.style.display = 'none';
});

// ── Click highlight ────────────────────────────────────────────────────────
let selectedId = null;

function getNeighbours(id) {
  const s = new Set([id]);
  GRAPH.edges.forEach(e => {
    const src = e.source?.id ?? e.source;
    const tgt = e.target?.id ?? e.target;
    if (src === id) s.add(tgt);
    if (tgt === id) s.add(src);
  });
  return s;
}

function applyHighlight(id) {
  if (!id) {
    nodeSel.attr('opacity', 1);
    edgeSel.attr('stroke-opacity', d => EDGE_OPACITY[d.type] || 0.3);
    return;
  }
  const nb = getNeighbours(id);
  nodeSel.attr('opacity', d => nb.has(d.id) ? 1 : 0.06);
  edgeSel.attr('stroke-opacity', e => {
    const s = e.source?.id ?? e.source;
    const t = e.target?.id ?? e.target;
    return (s === id || t === id) ? Math.min(1, (EDGE_OPACITY[e.type]||0.3) * 1.8) : 0.03;
  });
}

nodeSel.on('click', (ev, d) => {
  ev.stopPropagation();
  if (selectedId === d.id) {
    selectedId = null;
    applyHighlight(null);
    closePanel();
  } else {
    selectedId = d.id;
    applyHighlight(d.id);
    showPanel(d);
  }
});

svg.on('click', () => {
  selectedId = null;
  applyHighlight(null);
  closePanel();
});

// ── Info panel ─────────────────────────────────────────────────────────────
function showPanel(d) {
  const panel = document.getElementById('panel');
  const inner = document.getElementById('panel-content');
  panel.style.display = 'block';

  const nb = getNeighbours(d.id);

  if (d.type === 'project') {
    const sessions = [...nb].filter(id => id !== d.id).map(id => nodeById[id]).filter(n => n?.type === 'session');
    inner.innerHTML = \`
      <h3 style="color:\${d.color}">\${d.label}</h3>
      <div class="prow"><span class="pkey">Sessions</span><span class="pval">\${d.session_count}</span></div>
      <div class="prow"><span class="pkey">Tokens</span><span class="pval">\${fmt(d.tokens_total)}</span></div>
      <div class="prow"><span class="pkey">Skills</span><span class="pval">\${d.skills.join(', ') || 'none'}</span></div>
      <div class="psep"></div>
      \${sessions.map(s => \`<div class="prow" style="font-size:10px">
        <span class="pkey">\${s.date_str||'?'}</span>
        <span class="pval" style="color:\${d.color}">\${s.label}</span>
      </div>\`).join('')}
    \`;
  } else if (d.type === 'session') {
    const files = [...nb].filter(id => id !== d.id && nodeById[id]?.type === 'file').map(id => nodeById[id]);
    inner.innerHTML = \`
      <h3 style="color:\${d.color}">\${d.label}</h3>
      <div class="prow"><span class="pkey">Date</span><span class="pval">\${d.date_str||'?'}</span></div>
      <div class="prow"><span class="pkey">Duration</span><span class="pval">\${d.duration_min != null ? d.duration_min + ' min' : '?'}</span></div>
      <div class="prow"><span class="pkey">Tokens</span><span class="pval">\${fmt(d.tokens_total)}</span></div>
      <div class="prow"><span class="pkey">Cache hit</span><span class="pval">\${d.cache_hit_rate}%</span></div>
      <div class="prow"><span class="pkey">Tool calls</span><span class="pval">\${d.tool_calls}</span></div>
      <div class="prow"><span class="pkey">Tool errors</span><span class="pval" style="color:\${d.errorLevel>0?'#ff6644':'inherit'}">\${d.tool_errors}</span></div>
      <div class="prow"><span class="pkey">Tool types</span><span class="pval">\${d.tool_diversity}</span></div>
      \${d.skills.length ? '<div class="prow"><span class="pkey">Skills</span><span class="pval">' + d.skills.map(s => '<span class="ptag">/' + s + '</span>').join('') + '</span></div>' : ''}
      \${d.first_user_message ? '<div class="pmsg">' + d.first_user_message.slice(0, 250) + '</div>' : ''}
      \${files.length ? '<div class="psep"></div><div style="color:#445566;margin-bottom:6px">Files touched (' + files.length + '):</div>' +
        files.map(f => \`<div class="prow" style="font-size:10px">
          <span class="pkey" style="color:\${f.color}">\${f.label}</span>
          <span class="pval">\${f.edit}e \${f.write}w \${f.read}r</span>
        </div>\`).join('') : ''}
    \`;
  } else {
    const sessions = [...nb].filter(id => id !== d.id && nodeById[id]?.type === 'session').map(id => nodeById[id]);
    inner.innerHTML = \`
      <h3 style="color:\${d.color}">\${d.label}</h3>
      <div class="prow"><span class="pkey">Type</span><span class="pval">.\${d.ext}</span></div>
      <div class="prow"><span class="pkey">Sessions</span><span class="pval">\${d.session_count}</span></div>
      <div class="prow"><span class="pkey">Edits</span><span class="pval">\${d.edit}</span></div>
      <div class="prow"><span class="pkey">Writes</span><span class="pval">\${d.write}</span></div>
      <div class="prow"><span class="pkey">Reads</span><span class="pval">\${d.read}</span></div>
      <div class="pmsg" style="word-break:break-all">\${d.full_path}</div>
      \${sessions.length ? '<div class="psep"></div>' +
        sessions.map(s => \`<div class="prow" style="font-size:10px">
          <span class="pkey" style="color:\${s.color}">\${s.date_str||'?'}</span>
          <span class="pval">\${s.label}</span>
        </div>\`).join('') : ''}
    \`;
  }
}

function closePanel() {
  document.getElementById('panel').style.display = 'none';
}
window.closePanel = closePanel;

// ── Controls ───────────────────────────────────────────────────────────────
document.getElementById('cb-reads').addEventListener('change', function() {
  edgeSel.filter(e => e.type === 'read').attr('display', this.checked ? null : 'none');
});

document.getElementById('cb-files').addEventListener('change', function() {
  const show = this.checked;
  nodeSel.filter(n => n.type === 'file').attr('display', show ? null : 'none');
  edgeSel.filter(e => nodeById[e.target?.id ?? e.target]?.type === 'file')
    .attr('display', show ? null : 'none');
});

document.getElementById('sl-min').addEventListener('input', function() {
  const val = +this.value;
  document.getElementById('sl-min-val').textContent = val;
  const hide = new Set(GRAPH.nodes.filter(n => n.type === 'file' && n.session_count < val).map(n => n.id));
  nodeSel.filter(n => n.type === 'file').attr('display', n => hide.has(n.id) ? 'none' : null);
  edgeSel.attr('display', e => {
    const tgt = e.target?.id ?? e.target;
    return hide.has(tgt) ? 'none' : null;
  });
});

document.getElementById('btn-reheat').addEventListener('click', () => {
  simulation.alpha(0.4).restart();
});

// Read edges hidden by default — toggle checkbox to show
edgeSel.filter(e => e.type === 'read').attr('display', 'none');

// ── Stats ──────────────────────────────────────────────────────────────────
const pN = GRAPH.nodes.filter(n=>n.type==='project').length;
const sN = GRAPH.nodes.filter(n=>n.type==='session').length;
const fN = GRAPH.nodes.filter(n=>n.type==='file').length;
const dr = GRAPH.meta.date_range;
document.getElementById('stats').textContent =
  \`\${pN} projects · \${sN} sessions · \${fN} files · \${GRAPH.edges.length} edges · \${dr.first.slice(0,10)} → \${dr.last.slice(0,10)}\`;

// ── Resize ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  W = window.innerWidth; H = window.innerHeight;
  svg.attr('width', W).attr('height', H);
});
</script>
</body>
</html>`;

const outPath = path.join(__dir, 'graph.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Written: ${outPath}  (${(html.length/1024).toFixed(0)} KB)`);
