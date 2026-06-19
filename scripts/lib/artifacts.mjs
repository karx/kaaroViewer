/**
 * Artifact utilities - Handoffs, Work Queue updates, Garden Journal
 */

import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { resolve as pathResolve } from 'path';

/**
 * Write Alone-Time handoff document
 * @param {string} runId - Run identifier (e.g., "alone-time-2026-06-17")
 * @param {Object} data - Handoff data
 */
export async function writeHandoff(runId, data) {
  const filename = `library/handoffs/${runId}.md`;
  const fullPath = pathResolve(process.cwd(), filename);
  
  const handoff = generateHandoffMarkdown(runId, data);
  writeFileSync(fullPath, handoff);
  console.log(`📝 Handoff written: ${filename}`);
}

/**
 * Write Dream Loop handoff document
 */
export async function writeDreamLoopHandoff(runId, data) {
  const filename = `library/handoffs/${runId}.md`;
  const fullPath = pathResolve(process.cwd(), filename);
  
  const handoff = generateDreamLoopHandoffMarkdown(runId, data);
  writeFileSync(fullPath, handoff);
  console.log(`📝 Dream Loop handoff written: ${filename}`);
}

function generateHandoffMarkdown(runId, data) {
  const { taskId, taskType, plan, changes, gateResults, handoffNotes } = data;
  const date = new Date().toISOString().split('T')[0];
  
  return `# Alone-Time Handoff: ${runId}

> **Task:** ${taskId} (${taskType})  
> **Date:** ${date}  
> **Status:** ${gateResults?.overall ? '✅ PASSED' : '❌ FAILED'}

---

## Telemetry Snapshot
- Library entries: ${handoffNotes?.libraryCount || 'N/A'}
- Critical entries: ${handoffNotes?.criticalCount || 'N/A'}
- Avg density: ${handoffNotes?.avgDensity || 'N/A'}

---

## Task Selected
- **Task ID:** ${taskId}
- **Type:** ${taskType}
- **Rationale:** ${handoffNotes?.rationale || 'N/A'}

---

## Plan
${plan?.map((p, i) => `${i + 1}. ${p}`).join('\n') || 'No plan recorded'}

---

## Changes Made
${formatChanges(changes)}

---

## Gate Results
- **Validator:** ${gateResults?.validator?.passed ? '✅ PASS' : '❌ FAIL'}
- **Tests:** ${gateResults?.tests?.passed ? '✅ PASS' : '❌ FAIL'}
- **Overall:** ${gateResults?.overall ? '✅ PASS' : '❌ FAIL'}

${gateResults?.validator?.details?.length ? `### Validator Details\n${gateResults.validator.details.map(d => `- ${d}`).join('\n')}` : ''}
${gateResults?.tests?.details ? `### Test Details\n${gateResults.tests.details}` : ''}

---

## Unresolved / Next Steps
${handoffNotes?.unresolved?.map(u => `- ${u}`).join('\n') || 'None'}

---

## Signal Tracking
- Consecutive runs on this thread: ${handoffNotes?.consecutiveRuns || 1}
- Same signal count: ${handoffNotes?.sameSignalCount || 0}

---

## Next Recommendation
${handoffNotes?.nextRecommendation || 'Continue thread'}

---

## Journal Entry
${handoffNotes?.journalEntry || 'No journal entry'}
`;
}

function generateDreamLoopHandoffMarkdown(runId, data) {
  const { patterns, proposals, gateResults, rationale } = data;
  const date = new Date().toISOString().split('T')[0];

  return `# Dream Loop Handoff: ${runId}

> **Date:** ${date}  
> **Status:** ${gateResults?.overall ? '✅ PASSED' : '❌ FAILED'}

---

## Patterns Detected
${patterns?.map(p => `
### ${p.category}
- **Signal:** ${p.signal}
- **Count:** ${p.count}
- **Entries:** ${p.entries?.join(', ') || 'N/A'}
- **Severity:** ${p.severity}
`).join('\n') || 'None'}

---

## Proposals
### VALID_TYPES
\`\`\`json
${JSON.stringify(proposals?.types || [], null, 2)}
\`\`\`

### VALID_RELS
\`\`\`json
${JSON.stringify(proposals?.rels || [], null, 2)}
\`\`\`

### SOP Updates
${proposals?.sop?.map(s => `- ${s}`).join('\n') || 'None'}

### Renderer Updates
${proposals?.renderer?.map(r => `- ${r}`).join('\n') || 'None'}

---

## Rationale
${rationale || 'No rationale provided'}

---

## Generational Gate
- **All entries pass:** ${gateResults?.validator?.passed ? '✅' : '❌'}
- **Tests pass:** ${gateResults?.tests?.passed ? '✅' : '❌'}
- **Version:** ${proposals?.version || 'N/A'}

---

## Next Steps
${gateResults?.overall 
  ? 'commit + GENERATIONS.md + version tag' 
  : 'retry with adjusted proposals'}
`;
}

function formatChanges(changes) {
  if (!changes || changes.length === 0) return 'No changes recorded';
  return changes.map(c => {
    if (typeof c === 'string') return `- ${c}`;
    return `- ${c.type}: ${c.file} — ${c.description}`;
  }).join('\n');
}

/**
 * Update work queue - mark task complete, unblock deps
 * @param {string} taskId 
 * @param {string} status - 'complete', 'blocked', 'ready'
 * @param {Object} [extra] - Additional fields to update
 */
export async function updateQueue(taskId, status, extra = {}) {
  const queuePath = pathResolve(process.cwd(), 'library/handoffs/work-queue.md');
  
  if (!existsSync(queuePath)) {
    console.warn('⚠️ Work queue not found');
    return;
  }

  let content = readFileSync(queuePath, 'utf-8');
  
  // Simple status update in the Queue table
  // This is a basic implementation - could be enhanced with proper table parsing
  const statusIcon = status === 'complete' ? '✅' : status === 'blocked' ? '🔴' : '🟡';
  const today = new Date().toISOString().split('T')[0];
  
  // Update status in Queue table
  content = content.replace(
    new RegExp(`(\\|\\s*\\d+\\s*\\|\\s*${taskId}\\s*\\|[^|]*\\|[^|]*\\|[^|]*\\|)\\s*[^|]*\\s*(\\|)`),
    `$1 ${statusIcon} ${status.charAt(0).toUpperCase() + status.slice(1)} $2`
  );
  
  // If complete, also add to Completed Log
  if (status === 'complete') {
    const completedRow = `| ${today} | ${taskId} | ${extra.type || 'TASK'} | ${extra.target || ''} | ${extra.outcome || 'Completed'} | ${runId || 'handoff'} |\n`;
    content = content.replace(
      /(\| Date \| Task ID \| Type \| Target \| Outcome \| Handoff Ref \|\n\|[-\s|]+\n)/,
      `$1${completedRow}`
    );
  }

  writeFileSync(queuePath, content);
  console.log(`📋 Queue updated: ${taskId} → ${status}`);
}

/**
 * Append to garden journal
 * @param {Object} entry - Journal entry
 */
export async function appendJournal(entry) {
  const journalPath = pathResolve(process.cwd(), 'library/handoffs/garden-journal.md');
  
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  const markdown = `\n## ${timestamp} — ${entry.observation}

${entry.details ? `**Details:** ${JSON.stringify(entry.details, null, 2)}\n` : ''}
${entry.action ? `**Action:** ${entry.action}\n` : ''}
${entry.rationale ? `**Rationale:** ${entry.rationale}\n` : ''}
`;

  // Append to file
  if (existsSync(journalPath)) {
    const content = readFileSync(journalPath, 'utf-8');
    writeFileSync(journalPath, content + markdown);
  } else {
    writeFileSync(journalPath, `# Garden Journal\n\n*Append-only observational log*\n${markdown}`);
  }
  
  console.log(`📓 Journal: ${entry.observation}`);
}

/**
 * Get latest handoff file for a prefix
 * @param {string} prefix - 'alone-time' or 'dream-loop'
 * @returns {Promise<string | null>}
 */
export async function getLatestHandoff(prefix) {
  const handoffDir = pathResolve(process.cwd(), 'library/handoffs');
  if (!existsSync(handoffDir)) return null;
  
  const files = readdirSync(handoffDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.md'))
    .sort()
    .reverse();
  
  return files[0] ? `library/handoffs/${files[0]}` : null;
}

/**
 * Read last N entries from garden journal
 * @param {number} n
 * @returns {Promise<string[]>}
 */
export async function readLastJournalEntries(n = 5) {
  const journalPath = pathResolve(process.cwd(), 'library/handoffs/garden-journal.md');
  if (!existsSync(journalPath)) return [];
  
  const content = readFileSync(journalPath, 'utf-8');
  const entries = content.split(/^## /m).slice(1); // Split by date headers
  return entries.slice(-n).map(e => '## ' + e.trim());
}