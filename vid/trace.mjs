/**
 * vid/trace.mjs — session Traces (VIDEO_AGENT_PLAN.md §3 "Agent & learning").
 *
 * A Trace is the serialized record of one brief → deliverable session:
 * every operation, its timing and outcome, and the verification verdict.
 * Verified-successful traces ("golden") are the training corpus for the
 * fine-tune track, and the unit of progression tracking in vid/samples/.
 *
 * v0 records at the tool layer (CLI operations); agent turns join the
 * schema when `kaaro-vid agent` lands.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const TRACE_SCHEMA_VERSION = 1;

export function createTrace({ brief = null, timelineId = null } = {}) {
  return {
    schema: TRACE_SCHEMA_VERSION,
    id: `trace-${Date.now().toString(36)}`,
    startedAt: new Date().toISOString(),
    brief,                       // natural-language ask, when there is one
    timelineId,
    operations: [],              // [{ op, args, startedAt, ms, ok, result|error }]
    verification: null,          // { ok, checks } from vid/verify.mjs
    golden: false,               // true only after verification passes
    finishedAt: null,
  };
}

/** Run fn while recording it as an operation on the trace. Rethrows failures. */
export async function recordOp(trace, op, args, fn) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const result = await fn();
    trace.operations.push({ op, args, startedAt, ms: Date.now() - t0, ok: true, result: summarize(result) });
    return result;
  } catch (err) {
    trace.operations.push({ op, args, startedAt, ms: Date.now() - t0, ok: false, error: err.message });
    throw err;
  }
}

/** Keep traces readable: don't inline huge results. */
function summarize(result) {
  if (result == null) return null;
  if (typeof result === 'string') return result.length > 400 ? result.slice(0, 400) + '…' : result;
  const json = JSON.stringify(result);
  return json.length > 2000 ? { summary: json.slice(0, 2000) + '…' } : result;
}

/** Attach a verification result and derive the golden flag. */
export function attachVerification(trace, verification) {
  trace.verification = { ok: verification.ok, checks: verification.checks };
  trace.golden = verification.ok === true;
  return trace;
}

export async function saveTrace(trace, path) {
  trace.finishedAt = new Date().toISOString();
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, JSON.stringify(trace, null, 2) + '\n');
  return path;
}

export async function loadTrace(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** One-line-per-op summary for `kaaro-vid trace <file>` and reports. */
export function formatTrace(trace) {
  const lines = [
    `trace ${trace.id}  timeline=${trace.timelineId ?? '-'}  golden=${trace.golden ? 'YES' : 'no'}`,
    ...trace.operations.map(o =>
      ` ${o.ok ? '✓' : '✗'} ${o.op.padEnd(10)} ${String(o.ms).padStart(6)}ms  ${JSON.stringify(o.args ?? {}).slice(0, 90)}`),
  ];
  if (trace.verification) {
    lines.push(` verify: ${trace.verification.ok ? 'PASS' : 'FAIL'} (${trace.verification.checks.filter(c => c.ok).length}/${trace.verification.checks.length} checks)`);
  }
  return lines.join('\n');
}
