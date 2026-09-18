#!/usr/bin/env node
/**
 * scripts/graph-server.mjs
 *
 * Live-reloading dev server for the session graph.
 *
 * - Watches ~/.claude/projects/ for .jsonl changes
 * - Debounces 1.5s then rebuilds: analyze-sessions → build-graph
 * - Serves graph.html at http://localhost:3333
 * - Injects SSE client that reloads the page on rebuild
 *
 * Usage: node scripts/graph-server.mjs
 */

import http         from 'http';
import fs           from 'fs';
import path         from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const PORT          = 3333;
const PROJECTS_DIR  = 'C:/Users/karx0/.claude/projects';
const HTML_PATH      = path.join(__dirname, 'graph.html');
const DATA_PATH      = path.join(__dirname, 'graph-data.json');
const ANALYZE_SCRIPT = path.join(__dirname, 'analyze-sessions.mjs');
const GRAPH_SCRIPT   = path.join(__dirname, 'build-graph.mjs');

// ── SSE clients ───────────────────────────────────────────────────────────────

const clients = new Set();

function notify(event, data = '') {
  const payload = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

// ── Rebuild pipeline ──────────────────────────────────────────────────────────

let rebuilding    = false;
let pendingRebuild = false;
let debounceTimer  = null;
let lastBuilt      = null;

function run(script) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script], { cwd: path.dirname(__dirname) }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (err) reject(err); else resolve();
    });
  });
}

async function rebuild() {
  if (rebuilding) { pendingRebuild = true; return; }
  rebuilding = true;
  const t0 = Date.now();
  console.log(`\n[${new Date().toLocaleTimeString()}] Rebuilding…`);
  notify('status', 'rebuilding');

  try {
    await run(ANALYZE_SCRIPT);
    await run(GRAPH_SCRIPT);
    lastBuilt = new Date();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s — notifying ${clients.size} client(s)`);
    notify('updated', lastBuilt.toISOString());
  } catch (e) {
    console.error('Rebuild failed:', e.message);
    notify('error', e.message.slice(0, 200));
  } finally {
    rebuilding = false;
    if (pendingRebuild) {
      pendingRebuild = false;
      rebuild();
    }
  }
}

function scheduleRebuild() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(rebuild, 1500);
}

// ── File watcher ──────────────────────────────────────────────────────────────

try {
  fs.watch(PROJECTS_DIR, { recursive: true }, (event, filename) => {
    if (filename?.endsWith('.jsonl')) {
      console.log(`  changed: ${filename}`);
      scheduleRebuild();
    }
  });
  console.log(`Watching: ${PROJECTS_DIR}`);
} catch (e) {
  console.warn(`Could not watch ${PROJECTS_DIR}: ${e.message}`);
}


// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // SSE endpoint
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(':\n\n');                  // comment to flush
    res.write('event: connected\ndata: ok\n\n');
    clients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(':\n\n'); } catch { clearInterval(heartbeat); clients.delete(res); }
    }, 25_000);
    req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
    return;
  }

  // Status JSON
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rebuilding, lastBuilt, clients: clients.size }));
    return;
  }

  // Graph data JSON for incremental updates
  if (req.url.startsWith('/graph-data.json')) {
    if (!fs.existsSync(DATA_PATH)) { res.writeHead(503); res.end('{}'); return; }
    try {
      const data = fs.readFileSync(DATA_PATH);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch (e) { res.writeHead(500); res.end(e.message); }
    return;
  }

  // Main page
  if (req.url === '/' || req.url === '/graph.html') {
    if (!fs.existsSync(HTML_PATH)) {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end('<html><body style="font:14px monospace;padding:40px;background:#111;color:#ccc">'
            + '<h2>Building graph…</h2><p>The initial analysis is running. '
            + 'Refresh in a few seconds.</p></body></html>');
      return;
    }
    try {
      const html = fs.readFileSync(HTML_PATH);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end(e.message);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Graph server → http://localhost:${PORT}\n`);
  // Initial build
  rebuild();
});
