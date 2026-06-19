#!/usr/bin/env node
/**
 * Dream Loop Orchestrator
 * 
 * Two-phase execution:
 * 1. ANALYZE + PROPOSE (pauses for human ONTOLOGY_REVIEW)
 * 2. APPLY + GATE + COMMIT (after human approval with --approve)
 * 
 * Usage:
 *   node scripts/dream-loop.mjs              # Phase 1: analyze + propose
 *   node scripts/dream-loop.mjs --approve    # Phase 2: apply + gate + commit
 */

import { acquireLock, releaseLock, forceReleaseLock } from './lib/lock.mjs';
import { runAgentSession } from './lib/agent-session.mjs';
import { runGates } from './lib/gates.mjs';
import { writeDreamLoopHandoff, readLastJournalEntries, getLatestHandoff } from './lib/artifacts.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { resolve as pathResolve } from 'path';

const LOCK_FILE = '.dream-loop.lock';
const PROPOSAL_DIR = '.claude/proposals';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const isApprove = args.approve;
  const runId = `dream-loop-${new Date().toISOString().split('T')[0]}-${Date.now().toString(36).slice(-4)}`;
  
  console.log(`🌙 Dream Loop Orchestrator: ${runId}`);
  console.log(`   Mode: ${isApprove ? 'APPLY (Phase 2)' : 'ANALYZE + PROPOSE (Phase 1)'}`);

  // Acquire lock
  const lock = await acquireLock(LOCK_FILE, runId);
  if (!lock) {
    if (args.force) {
      await forceReleaseLock(LOCK_FILE);
      const newLock = await acquireLock(LOCK_FILE, runId);
      if (!newLock) { process.exit(1); }
    } else {
      console.error('❌ Another Dream Loop in progress. Use --force to override.');
      process.exit(1);
    }
  }

  try {
    if (isApprove) {
      await phaseApply(runId);
    } else {
      await phaseAnalyzeAndPropose(runId);
    }
  } catch (error) {
    console.error('\n💥 Dream Loop failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await releaseLock(lock);
  }
}

/**
 * Phase 1: Analyze handoffs + journal, generate proposals
 */
async function phaseAnalyzeAndPropose(runId) {
  console.log('\n📥 Phase: INGEST');
  const context = await ingestDreamContext();
  
  console.log('\n🔍 Phase: ANALYZE');
  const analysisResult = await runAgentSession({
    promptTemplate: '.claude/prompts/dream-loop-analyze.md',
    context,
    maxTurns: 15,
    allowedTools: ['read', 'grep', 'bash'],
    sessionId: `${runId}-analyze`
  });

  if (!analysisResult.success) {
    throw new Error(`ANALYZE failed: ${analysisResult.error}`);
  }

  const analysis = analysisResult.structuredOutput;
  if (!analysis || !analysis.patterns) {
    throw new Error('ANALYZE did not return valid patterns');
  }

  console.log(`  📊 Patterns found: ${analysis.patterns.length}`);
  analysis.patterns.forEach(p => console.log(`   - ${p.category}: ${p.signal} (${p.count}x)`));

  console.log('\n📝 Phase: PROPOSE');
  const proposeResult = await runAgentSession({
    promptTemplate: '.claude/prompts/dream-loop-propose.md',
    context: { ...context, analysis },
    maxTurns: 10,
    allowedTools: ['read', 'write', 'edit'],
    sessionId: `${runId}-propose`
  });

  if (!proposeResult.success) {
    throw new Error(`PROPOSE failed: ${proposeResult.error}`);
  }

  const proposals = proposeResult.structuredOutput;
  if (!proposals) {
    throw new Error('PROPOSE did not return valid proposals');
  }

  // Write proposal file for human review
  await writeProposalFile(runId, proposals, analysis);
  
  console.log('\n⏸ Phase 1 complete. Waiting for human ONTOLOGY_REVIEW.');
  console.log(`   Proposal: ${PROPOSAL_DIR}/ontology-${runId}.md`);
  console.log(`   Review, edit if needed, then run:`);
  console.log(`   node scripts/dream-loop.mjs --approve`);
  
  // Write handoff for Phase 1
  await writeDreamLoopHandoff(runId, {
    patterns: analysis.patterns,
    proposals,
    rationale: analysis.rationale || proposals.rationale,
    gateResults: { overall: false, phase: 'proposed' }
  });
}

/**
 * Phase 2: Apply proposals (after human approval)
 */
async function phaseApply(runId) {
  console.log('\n📋 Phase: APPLY (human approved)');
  
  // Find latest proposal file
  const proposalFile = findLatestProposal();
  if (!proposalFile) {
    throw new Error('No proposal file found. Run Phase 1 first.');
  }

  console.log(`  Loading proposal: ${proposalFile}`);
  const proposals = JSON.parse(readFileSync(proposalFile, 'utf-8'));
  
  // Agent applies proposals to the 3 artifacts atomically
  const applyResult = await runAgentSession({
    promptTemplate: '.claude/prompts/dream-loop-apply.md',
    context: { proposals },
    maxTurns: 20,
    allowedTools: 'all',
    sessionId: `${runId}-apply`
  });

  if (!applyResult.success) {
    throw new Error(`APPLY failed: ${applyResult.error}`);
  }

  console.log('\n🚪 Phase: GENERATIONAL GATE');
  const gateResults = await runGates({ fullRegression: true });
  
  if (!gateResults.overall) {
    console.error('❌ Generational gate failed — rolling back');
    await runCommand('git', ['checkout', '--', '.']);
    throw new Error('Generational gate failed. Changes reverted.');
  }

  console.log('\n📦 Phase: COMMIT + VERSION');
  const version = proposals.version || await computeNextVersion();
  const commitMsg = `dream-loop: ontology extension — ${proposals.summary || 'types/rels added'} (v${version})`;
  
  await gitAddAllAndCommit(commitMsg);
  await updateGenerationsMD(proposals, version);
  await gitTag(`v${version}`);
  
  // Clean up proposal file
  unlinkSync(proposalFile);
  
  // Write final handoff
  await writeDreamLoopHandoff(`dream-loop-${new Date().toISOString().split('T')[0]}`, {
    patterns: [],
    proposals,
    rationale: proposals.rationale,
    gateResults: { ...gateResults, overall: true, version },
    version
  });
  
  console.log(`\n✅ Dream Loop complete — v${version}`);
  console.log(`   Types added: ${(proposals.types || []).join(', ') || 'none'}`);
  console.log(`   Rels added: ${(proposals.rels || []).join(', ') || 'none'}`);
  console.log(`   Tagged: v${version}`);
}

async function ingestDreamContext() {
  const [handoffs, genesis, journal] = await Promise.all([
    readLastNHandoffs(10),
    readFile('genesis.md'),
    readLastJournalEntries(20)
  ]);
  
  return { handoffs, genesis, journal };
}

async function readLastNHandoffs(n) {
  const handoffDir = pathResolve(process.cwd(), 'library/handoffs');
  if (!existsSync(handoffDir)) return [];
  
  const files = readdirSync(handoffDir)
    .filter(f => (f.startsWith('alone-time') || f.startsWith('dream-loop')) && f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, n);
  
  const handoffs = [];
  for (const file of files) {
    const content = readFileSync(pathResolve(handoffDir, file), 'utf-8');
    handoffs.push({ file, content });
  }
  return handoffs;
}

async function writeProposalFile(runId, proposals, analysis) {
  const dir = pathResolve(process.cwd(), PROPOSAL_DIR);
  if (!existsSync(dir)) {
    // Create dir recursively
    const { mkdirSync } = await import('fs');
    mkdirSync(dir, { recursive: true });
  }
  
  const file = pathResolve(dir, `ontology-${runId}.md`);
  const content = `# Ontology Proposal: ${runId}

> **Generated:** ${new Date().toISOString()}
> **Status:** ⏳ Awaiting human ONTOLOGY_REVIEW

---

## Analysis Summary
${analysis.patterns?.map(p => `- **${p.category}**: ${p.signal} (${p.count}x) [${p.severity}]`).join('\n') || 'None'}

---

## Rationale
${analysis.rationale || proposals.rationale || 'Not provided'}

---

## Proposed Changes

### VALID_TYPES (add)
\`\`\`json
${JSON.stringify(proposals.types || [], null, 2)}
\`\`\`

### VALID_RELS (add)
\`\`\`json
${JSON.stringify(proposals.rels || [], null, 2)}
\`\`\`

### SOP Updates
${(proposals.sop || []).map(s => `- ${s}`).join('\n') || 'None'}

### Renderer Updates
${(proposals.renderer || []).map(r => `- ${r}`).join('\n') || 'None'}

---

## Version
${proposals.version || 'auto'}

---

## Human Review Checklist
- [ ] Types semantically correct and non-overlapping
- [ ] Rels semantically correct and non-overlapping  
- [ ] SOP updates reflect new encoding guidance
- [ ] Renderer updates wired for new types/rels
- [ ] No existing entry will break (generational gate will verify)

---

## Approval
Edit this file if needed, then run:
\`\`\`bash
node scripts/dream-loop.mjs --approve
\`\`\`
`;
  
  writeFileSync(file, content);
  console.log(`  📄 Proposal written: ${file}`);
}

function findLatestProposal() {
  const dir = pathResolve(process.cwd(), PROPOSAL_DIR);
  if (!existsSync(dir)) return null;
  
  const files = readdirSync(dir)
    .filter(f => f.startsWith('ontology-') && f.endsWith('.md'))
    .sort()
    .reverse();
  
  return files[0] ? pathResolve(dir, files[0]) : null;
}

async function computeNextVersion() {
  // Read last version from git tags or GENERATIONS.md
  const { stdout } = await runCommandCapture('git', ['tag', '-l', 'v*.*', '--sort=-v:refname']);
  const tags = stdout.trim().split('\n').filter(Boolean);
  if (tags.length === 0) return '1.0.0';
  
  const lastTag = tags[0].replace('v', '');
  const [major, minor, patch = 0] = lastTag.split('.').map(Number);
  return `${major}.${minor + 1}.0`; // Minor bump for ontology change
}

async function updateGenerationsMD(proposals, version) {
  const genFile = pathResolve(process.cwd(), 'GENERATIONS.md');
  const date = new Date().toISOString().split('T')[0];
  
  const entry = `
## Generation v${version} — ${date}

### Schema Changes
- **Types added:** ${(proposals.types || []).join(', ') || 'none'}
- **Rels added:** ${(proposals.rels || []).join(', ') || 'none'}

### Artifacts Updated
- \`.claude/hooks/validate-library-json.py\` — VALID_TYPES, VALID_RELS
- \`sop-reference.md\` — Encoding guidance
- \`canvas/\` — Renderer updates

### Rationale
${proposals.rationale || 'Not provided'}

### Re-encoding Required
Entries needing re-encoding with new ontology:
${(proposals.reencode || []).map(e => `- ${e}`).join('\n') || 'TBD'}

---
`;
  
  let content = '';
  if (existsSync(genFile)) {
    content = readFileSync(genFile, 'utf-8');
    // Insert after first heading
    content = content.replace(/^(# .*\n)/, '$1\n' + entry);
  } else {
    content = `# GENERATIONS.md\n\n*Ontology evolution log*\n${entry}`;
  }
  
  writeFileSync(genFile, content);
  console.log(`  📄 GENERATIONS.md updated`);
}

async function gitAddAllAndCommit(message) {
  await runCommand('git', ['add', '-A']);
  await runCommand('git', ['commit', '-m', message]);
}

async function gitTag(tag) {
  await runCommand('git', ['tag', '-a', tag, '-m', `Generation ${tag}`]);
}

function parseArgs(args) {
  return { approve: args.includes('--approve'), force: args.includes('--force') };
}

async function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: process.cwd(), stdio: 'inherit' });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
    child.on('error', reject);
  });
}

async function runCommandCapture(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => resolve({ stdout, stderr, code }));
    child.on('error', reject);
  });
}

main();