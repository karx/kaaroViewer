/**
 * scripts/health-check.mjs — kaaroViewer self-state telemetry.
 *
 * Produces a structured JSON health report: validator scores, structural
 * metrics, eval feedback, and ranked recommendations. This is the mirror
 * that the Alone-Time loop reads as its primary context.
 *
 * Usage:
 *   node scripts/health-check.mjs              # JSON to stdout
 *   node scripts/health-check.mjs --summary    # human-readable summary
 *   node scripts/health-check.mjs --out health.json   # write to file
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join, basename, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = resolve(__dirname, '..');
const LIBRARY_DIR = join(ROOT, 'library');
const VALIDATOR   = join(ROOT, '.claude', 'hooks', 'validate-library-json.py');

// ── Thresholds (mirror CLAUDE.md quality gates) ───────────────────────────────

const T = {
  density:  { ok: 2.0, watch: 1.7 },
  nodes:    { min: 12 },           // "small report" floor
  beats:    { min: 7, max: 12 },
  insights: { min: 4, max: 7 },
  climax:   1,                     // exactly one climax beat
};

// ── Validator ─────────────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function runValidator(filePath) {
  const cmds = ['python3', 'python'];
  for (const cmd of cmds) {
    const r = spawnSync(cmd, [VALIDATOR, filePath], { encoding: 'utf8', timeout: 15_000 });
    if (r.error?.code === 'ENOENT') continue;
    const raw = String(r.stdout ?? '') + String(r.stderr ?? '');
    // Strip ANSI codes, normalise line endings
    const clean = raw.replace(ANSI_RE, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Bullet character is U+00B7 (·) or U+2027 — match any non-space non-letter prefix
    const warnings = clean.split('\n')
      .filter(l => /^\s*[·‧•\-]/.test(l))
      .map(l => l.replace(/^\s*[·‧•\-]+\s*/, '').trim())
      .filter(Boolean);
    return { available: true, exitCode: r.status ?? 0, warnings, output: clean.trim() };
  }
  return { available: false, exitCode: null, warnings: [], output: '' };
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function computeMetrics(doc) {
  const nodes       = doc.nodes?.length   ?? 0;
  const edges       = doc.edges?.length   ?? 0;
  const density     = nodes > 0 ? edges / nodes : 0;
  const beats       = doc.story?.length   ?? 0;
  const insights    = doc.insights?.length ?? 0;
  const clusters    = doc.clusters?.length ?? 0;
  const climaxCount = (doc.story ?? []).filter(b => b.tension === 'climax').length;
  const clusteredIds = new Set((doc.clusters ?? []).flatMap(c => c.nodes ?? []));
  const unclustered  = (doc.nodes ?? []).filter(n => !clusteredIds.has(n.id)).length;
  const sentDist    = doc.analytics?.sentimentDist ?? null;

  return { nodes, edges, density, beats, insights, clusters, climaxCount, unclustered, sentDist };
}

// ── Health scoring ────────────────────────────────────────────────────────────

function scoreHealth(metrics, validator) {
  if (!validator.available) return { status: 'unknown', signals: ['validator-unavailable'] };
  if (validator.exitCode === 2)  return { status: 'critical', signals: ['validator-exit2'] };

  const signals = [];

  if (validator.exitCode === 1)
    signals.push(`validator:${validator.warnings.length}w`);
  if (metrics.density < T.density.ok)
    signals.push(`density:${metrics.density.toFixed(2)}`);
  if (metrics.climaxCount !== T.climax)
    signals.push(`climax:${metrics.climaxCount}`);
  if (metrics.nodes < T.nodes.min)
    signals.push(`nodes:${metrics.nodes}`);
  if (metrics.beats < T.beats.min || metrics.beats > T.beats.max)
    signals.push(`beats:${metrics.beats}`);
  if (metrics.insights < T.insights.min)
    signals.push(`insights:${metrics.insights}`);
  if (metrics.unclustered > 5)
    signals.push(`unclustered:${metrics.unclustered}`);

  if (signals.length === 0) return { status: 'ok', signals: [] };

  // A single critical signal is enough to degrade
  const critical = signals.some(s =>
    (s.startsWith('density:') && metrics.density < T.density.watch) ||
    (s.startsWith('validator:') && validator.warnings.length >= 3) ||
    (s.startsWith('climax:') && metrics.climaxCount > 1)
  );
  // Two or more moderate signals also degrade
  const moderate = signals.filter(s =>
    s.startsWith('validator:') ||
    s.startsWith('density:') ||
    s.startsWith('climax:') ||
    s.startsWith('unclustered:')
  );

  const status = (critical || moderate.length >= 2) ? 'degraded' : 'watch';
  return { status, signals };
}

// ── Degradation score (lower = higher priority to re-encode) ──────────────────
// Used to rank entries for Alone-Time selection.

function degradationScore(entry) {
  const { metrics, validator, health } = entry;
  let score = 0;
  if (health.status === 'critical')  score += 1000;
  if (health.status === 'degraded')  score += 100;
  if (health.status === 'watch')     score += 20;
  score += (validator.warnings?.length ?? 0) * 10;
  score += Math.max(0, (T.density.ok - metrics.density) * 30);
  score += Math.abs(metrics.climaxCount - T.climax) * 15;
  if (metrics.nodes < T.nodes.min)   score += 25;
  score += metrics.unclustered * 2;
  // Boost score if there are negative evals
  const badEvals = (entry.evals ?? []).filter(e => e.rating <= 2).length;
  score += badEvals * 50;
  return Math.round(score);
}

// ── GitHub eval issues ────────────────────────────────────────────────────────

function fetchEvals() {
  const r = spawnSync('gh', [
    'issue', 'list',
    '--label', 'eval',
    '--state', 'open',
    '--json', 'number,title,body,createdAt',
    '--limit', '50',
  ], { encoding: 'utf8', timeout: 10_000 });

  if (r.error || r.status !== 0) {
    return { available: false, issues: [], error: r.stderr?.trim() || 'gh not found' };
  }

  try {
    const issues = JSON.parse(r.stdout ?? '[]');
    return { available: true, issues };
  } catch {
    return { available: false, issues: [], error: 'parse error' };
  }
}

function parseEvalIssue(issue) {
  const ratingMatch = issue.body?.match(/⭐+\s*\((\d)\/5\)/);
  const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;

  // Doc ID is in a table row: | Doc ID | `some-id` |
  const idMatch = issue.body?.match(/Doc ID.*?`([^`]+)`/);
  const docId = idMatch ? idMatch[1] : null;

  const workedMatch   = issue.body?.match(/## What worked\n([\s\S]*?)(?=\n##|$)/);
  const confusedMatch = issue.body?.match(/## What was confusing\n([\s\S]*?)(?=\n##|$)/);

  return {
    issueNumber: issue.number,
    docId,
    rating,
    date: issue.createdAt?.slice(0, 10) ?? null,
    worked:   workedMatch?.[1]?.trim()   ?? null,
    confused: confusedMatch?.[1]?.trim() ?? null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function runTests() {
  const r = spawnSync('pnpm', ['test', '--reporter=json'], {
    encoding: 'utf8', timeout: 60_000, cwd: ROOT,
  });
  // pnpm test exits 1 on failures; JSON reporter writes to stdout
  try {
    const json = JSON.parse(r.stdout ?? '{}');
    const numTests = json.numTotalTests ?? null;
    const numFailed = json.numFailedTests ?? 0;
    const numPassed = json.numPassedTests ?? null;
    if (numTests !== null) return { available: true, pass: numPassed, fail: numFailed, total: numTests };
  } catch { /* fall through */ }

  // Fallback: parse the plain text summary line
  const combined = String(r.stdout ?? '') + String(r.stderr ?? '');
  const summary = combined
    .split('\n')
    .find(l => l.includes('Tests') && (l.includes('passed') || l.includes('failed')));
  const passMatch = summary?.match(/(\d+)\s+passed/);
  const failMatch = summary?.match(/(\d+)\s+failed/);
  return {
    available: true,
    pass:  passMatch  ? parseInt(passMatch[1],  10) : null,
    fail:  failMatch  ? parseInt(failMatch[1], 10) : 0,
    total: null,
    summary: summary?.trim() ?? null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function buildReport() {
  const date = new Date().toISOString().slice(0, 10);

  // 1. Find all library JSON files (skip handoffs subdir)
  const files = readdirSync(LIBRARY_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(LIBRARY_DIR, f));

  // 2. Fetch evals (best-effort)
  const evalResult   = fetchEvals();
  const evalsByDocId = {};
  if (evalResult.available) {
    for (const issue of evalResult.issues) {
      const parsed = parseEvalIssue(issue);
      if (parsed.docId) {
        if (!evalsByDocId[parsed.docId]) evalsByDocId[parsed.docId] = [];
        evalsByDocId[parsed.docId].push(parsed);
      }
    }
  }

  // 3. Assess each library entry
  const library = files.map(filePath => {
    const id = basename(filePath, '.json');
    let doc;
    try {
      doc = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      return { id, file: filePath, error: err.message, health: { status: 'critical', signals: ['parse-error'] } };
    }

    const metrics   = computeMetrics(doc);
    const validator = runValidator(filePath);
    const health    = scoreHealth(metrics, validator);
    const evals     = evalsByDocId[id] ?? [];
    const entry     = {
      id,
      title: doc.meta?.title ?? id,
      domain: doc.meta?.domain ?? '',
      year:   doc.meta?.year   ?? '',
      file:   filePath.replace(ROOT + '\\', '').replace(ROOT + '/', ''),
      metrics: {
        nodes:       metrics.nodes,
        edges:       metrics.edges,
        density:     parseFloat(metrics.density.toFixed(2)),
        beats:       metrics.beats,
        insights:    metrics.insights,
        clusters:    metrics.clusters,
        climaxCount: metrics.climaxCount,
        unclustered: metrics.unclustered,
      },
      validator: {
        exitCode: validator.exitCode,
        warnings: validator.warnings,
      },
      health,
      evals,
    };
    entry.degradationScore = degradationScore(entry);
    return entry;
  });

  // 4. Sort by degradation score descending (worst first)
  library.sort((a, b) => (b.degradationScore ?? 0) - (a.degradationScore ?? 0));

  // 5. System test results (best-effort)
  const tests = runTests();

  // 6. Recommendations
  const recommendations = [];
  const degraded = library.filter(e => e.health.status === 'degraded' || e.health.status === 'critical');
  const watch    = library.filter(e => e.health.status === 'watch');

  for (const entry of degraded) {
    const reason = entry.health.signals.join(', ');
    recommendations.push(`[${entry.health.status.toUpperCase()}] re-encode ${entry.id} — ${reason}`);
  }
  for (const entry of watch) {
    const reason = entry.health.signals.join(', ');
    recommendations.push(`[WATCH] monitor ${entry.id} — ${reason}`);
  }
  if (!evalResult.available) {
    recommendations.push('[INFO] gh CLI not available — eval feedback not included (install gh for full signal)');
  }

  // 7. Summary counts
  const counts = {
    ok:       library.filter(e => e.health.status === 'ok').length,
    watch:    library.filter(e => e.health.status === 'watch').length,
    degraded: library.filter(e => e.health.status === 'degraded').length,
    critical: library.filter(e => e.health.status === 'critical').length,
    unknown:  library.filter(e => e.health.status === 'unknown').length,
  };

  return {
    generated: date,
    systemTests: tests,
    evals: { available: evalResult.available, openCount: evalResult.issues?.length ?? 0 },
    counts,
    topPriority: library[0]?.id ?? null,
    recommendations,
    library,
  };
}

// ── Output ────────────────────────────────────────────────────────────────────

function printSummary(report) {
  const STATUS_ICON = { ok: '✅', watch: '👁', degraded: '⚠️ ', critical: '🔴', unknown: '❓' };
  const c = report.counts;

  console.log(`\n── kaaroViewer Health Check ─── ${report.generated} ──────────────────────────`);
  console.log(`   Library: ${c.ok} ok  ${c.watch} watch  ${c.degraded} degraded  ${c.critical} critical`);
  if (report.systemTests.available) {
    const t = report.systemTests;
    const label = t.fail > 0 ? `⚠️  ${t.fail} FAILING` : `✅ ${t.pass ?? '?'} passing`;
    console.log(`   Tests:   ${label}`);
  }
  if (report.evals.available) {
    console.log(`   Evals:   ${report.evals.openCount} open`);
  } else {
    console.log(`   Evals:   gh CLI unavailable — skipped`);
  }
  console.log('');

  for (const entry of report.library) {
    const icon = STATUS_ICON[entry.health.status] ?? '?';
    const d    = entry.metrics.density.toFixed(2);
    const warn = entry.validator.warnings.length > 0 ? ` (${entry.validator.warnings.length}w)` : '';
    const signals = entry.health.signals.length > 0
      ? `  ← ${entry.health.signals.join(', ')}`
      : '';
    console.log(`  ${icon}  ${entry.id.padEnd(38)} d:${d}  ${entry.metrics.nodes}N ${entry.metrics.edges}E${warn}${signals}`);
  }

  if (report.recommendations.length) {
    console.log('\n── Recommendations ────────────────────────────────────────────────────────');
    for (const r of report.recommendations) {
      console.log(`   ${r}`);
    }
  }

  if (report.topPriority) {
    console.log(`\n── Alone-Time Target ──────────────────────────────────────────────────────`);
    console.log(`   → ${report.topPriority}  (score: ${report.library[0].degradationScore})`);
  }
  console.log('');
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const isSummary = args.includes('--summary');
const outFlag   = args.findIndex(a => a === '--out');
const outFile   = outFlag >= 0 ? args[outFlag + 1] : null;

const report = buildReport();

if (outFile) {
  writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.error(`Health report written to ${outFile}`);
}

if (isSummary) {
  printSummary(report);
} else if (!outFile) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

// Exit non-zero if any degraded/critical entries exist
const hasDegraded = report.counts.degraded > 0 || report.counts.critical > 0;
process.exit(hasDegraded ? 1 : 0);