#!/usr/bin/env node
/**
 * Alone-Time Orchestrator
 * 
 * Deterministic skeleton that runs the Alone-Time loop:
 * INGEST → SELECT (agent) → MUTATE (agent) → GATE → COMMIT + HANDOFF
 * 
 * Usage:
 *   node scripts/alone-time.mjs [--resume] [--human-present]
 * 
 * Resume: Continues from .alone-time-checkpoint.json
 * Human-present: Enables HITL task selection (VISUALIZE queue)
 */

import { acquireLock, releaseLock, forceReleaseLock } from './lib/lock.mjs';
import { loadCheckpoint, saveCheckpoint, clearCheckpoint, hasCheckpoint } from './lib/checkpoint.mjs';
import { runAgentSession } from './lib/agent-session.mjs';
import { runGates } from './lib/gates.mjs';
import { writeHandoff, updateQueue, appendJournal, getLatestHandoff, readLastJournalEntries, getLatestHandoff as readLatestHandoff } from './lib/artifacts.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve as pathResolve } from 'path';

const LOCK_FILE = '.alone-time.lock';
const CHECKPOINT_FILE = '.alone-time-checkpoint.json';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = `alone-time-${new Date().toISOString().split('T')[0]}-${Date.now().toString(36).slice(-4)}`;
  
  console.log(`🌱 Alone-Time Orchestrator: ${runId}`);
  console.log(`   Resume: ${args.resume}`);
  console.log(`   Human present: ${args.humanPresent}`);

  // Acquire lock
  const lock = await acquireLock(LOCK_FILE, runId);
  if (!lock) {
    if (args.force) {
      console.log('⚠️ Forcing lock release...');
      await forceReleaseLock(LOCK_FILE);
      const newLock = await acquireLock(LOCK_FILE, runId);
      if (!newLock) { process.exit(1); }
    } else {
      console.error('❌ Another Alone-Time run in progress. Use --force to override.');
      process.exit(1);
    }
  }

  try {
    // Load or initialize checkpoint
    let checkpoint = args.resume ? await loadCheckpoint(CHECKPOINT_FILE) : null;
    
    if (!checkpoint) {
      // Fresh run - INGEST phase
      console.log('\n📥 Phase: INGEST');
      const context = await ingestContext();
      checkpoint = {
        runId,
        phase: 'SELECT',
        startedAt: new Date().toISOString(),
        context,
        humanPresent: args.humanPresent
      };
      await saveCheckpoint(checkpoint);
    }

    // Execute phases based on checkpoint
    while (true) {
      console.log(`\n▶️  Phase: ${checkpoint.phase}`);
      
      switch (checkpoint.phase) {
        case 'SELECT':
          checkpoint = await phaseSelect(checkpoint);
          break;
        case 'MUTATE':
          checkpoint = await phaseMutate(checkpoint);
          break;
        case 'GATE':
          checkpoint = await phaseGate(checkpoint);
          break;
        case 'COMMIT':
          await phaseCommit(checkpoint);
          return; // Success - exit loop
        case 'IDLE':
          console.log('😴 No autonomous work available. Idling.');
          await phaseIdle(checkpoint);
          return;
        default:
          throw new Error(`Unknown phase: ${checkpoint.phase}`);
      }
      
      await saveCheckpoint(checkpoint);
    }

  } catch (error) {
    console.error('\n💥 Alone-Time failed:', error.message);
    console.error(error.stack);
    await appendJournal({ 
      observation: `Alone-Time failed: ${error.message}`,
      details: { phase: checkpoint?.phase, error: error.stack },
      action: 'investigate'
    });
    await releaseLock(lock);
    process.exit(1);
  }
}

/**
 * INGEST: Load all context files
 */
async function ingestContext() {
  console.log('  Loading context...');
  
  const [health, queue, threads, strategy, lastHandoff, journal] = await Promise.all([
    readJSON('health.json'),
    readQueueTable(),
    readThreadsTable(),
    readFile('STRATEGY.md'),
    readLatestHandoff('alone-time'),
    readLastJournalEntries(5)
  ]);

  return { health, queue, threads, strategy, lastHandoff, journal };
}

/**
 * SELECT: Agent chooses next task and creates plan
 */
async function phaseSelect(checkpoint) {
  const { context, humanPresent } = checkpoint;
  
  // Agent session for task selection
  const result = await runAgentSession({
    promptTemplate: '.claude/prompts/alone-time-select.md',
    context: {
      health: context.health,
      queue: context.queue,
      threads: context.threads,
      strategy: context.strategy,
      lastHandoff: context.lastHandoff,
      journal: context.journal,
      humanPresent
    },
    maxTurns: 10,
    allowedTools: ['read', 'grep', 'bash'],
    sessionId: `${checkpoint.runId}-select`
  });

  if (!result.success) {
    throw new Error(`SELECT agent failed: ${result.error}`);
  }

  const output = result.structuredOutput;
  if (!output || !output.taskId) {
    throw new Error('SELECT agent did not return valid task selection');
  }

  console.log(`  🎯 Selected: ${output.taskId} (${output.taskType})`);
  console.log(`  📋 Plan: ${output.plan?.join('; ') || 'None'}`);

  // Handle HITL task when human not present
  if (output.modality === 'HITL' && !humanPresent) {
    console.log(`  ⏭️  Skipping HITL task ${output.taskId} (human not present)`);
    await appendJournal({ 
      observation: `Skipped HITL task ${output.taskId} (${output.taskType}) - human not present`,
      action: 're-queue'
    });
    // Re-run SELECT with updated context (queue unchanged but we note the skip)
    return { ...checkpoint, phase: 'SELECT' };
  }

  // Handle IDLE (no work)
  if (output.taskId === 'IDLE') {
    return { ...checkpoint, phase: 'IDLE' };
  }

  return {
    ...checkpoint,
    phase: 'MUTATE',
    taskId: output.taskId,
    taskType: output.taskType,
    modality: output.modality,
    plan: output.plan || [],
    rationale: output.rationale,
    estimatedTurns: output.estimatedTurns || 15
  };
}

/**
 * MUTATE: Agent executes the plan
 */
async function phaseMutate(checkpoint) {
  const { taskId, taskType, plan, context } = checkpoint;
  
  // Determine prompt template for this task type
  const promptTemplate = `.claude/prompts/alone-time-${taskType.toLowerCase()}.md`;
  
  console.log(`  🔧 Executing ${taskType} with ${promptTemplate}`);

  const result = await runAgentSession({
    promptTemplate,
    context: {
      ...context,
      taskId,
      taskType,
      plan,
      health: context.health,
      queue: context.queue,
      threads: context.threads
    },
    maxTurns: checkpoint.estimatedTurns || 20,
    allowedTools: 'all',
    sessionId: `${checkpoint.runId}-mutate`
  });

  if (!result.success) {
    throw new Error(`MUTATE agent failed: ${result.error}`);
  }

  const output = result.structuredOutput || { changes: [], gateResults: {}, handoffNotes: {} };
  
  return {
    ...checkpoint,
    phase: 'GATE',
    changes: output.changes || [],
    gateResults: output.gateResults || {},
    handoffNotes: output.handoffNotes || {}
  };
}

/**
 * GATE: Run validator and tests
 */
async function phaseGate(checkpoint) {
  const { changes, taskId, taskType } = checkpoint;
  
  // Determine which files to validate based on task type
  const changedFiles = extractChangedFiles(changes);
  const fullRegression = taskType === 'IMPROVE_PIPELINE' || taskType === 'DETECT_ONTOLOGY_GAPS';
  
  const gateResults = await runGates({ changedFiles, fullRegression });
  
  if (!gateResults.overall) {
    await appendJournal({
      observation: `Gate failed for ${taskId} (${taskType})`,
      details: gateResults,
      action: 'requeue'
    });
    throw new Error(`Gates failed for ${taskId}. See handoff for details.`);
  }

  return {
    ...checkpoint,
    phase: 'COMMIT',
    gateResults
  };
}

/**
 * COMMIT: Git commit + handoff + queue update + journal
 */
async function phaseCommit(checkpoint) {
  const { runId, taskId, taskType, changes, gateResults, handoffNotes, plan } = checkpoint;
  
  console.log('  📦 Committing changes...');
  
  // Git add and commit
  const commitMsg = `alone-time: ${taskId} (${taskType}) — ${handoffNotes.summary || handoffNotes.rationale || 'completed'}`;
  await gitAddAndCommit(changes, commitMsg);
  
  // Write handoff
  await writeHandoff(runId, {
    taskId,
    taskType,
    plan,
    changes,
    gateResults,
    handoffNotes
  });
  
  // Update queue
  await updateQueue(taskId, 'complete', {
    type: taskType,
    target: handoffNotes.target,
    outcome: handoffNotes.summary || 'Completed'
  });
  
  // Append journal
  await appendJournal({
    observation: handoffNotes.journalEntry || `Completed ${taskId} (${taskType})`,
    details: { changes: changes.length, gates: gateResults },
    action: 'complete'
  });

  // Clear checkpoint
  await clearCheckpoint(CHECKPOINT_FILE);
  
  console.log(`\n✅ Alone-Time ${runId} complete!`);
  console.log(`   Task: ${taskId} (${taskType})`);
  console.log(`   Commit: ${commitMsg}`);
}

/**
 * IDLE: No autonomous work available
 */
async function phaseIdle(checkpoint) {
  const { humanPresent } = checkpoint;
  
  let message = 'No autonomous tasks available';
  if (humanPresent && checkpoint.context?.queue?.some(t => t.modality === 'HITL' && t.status === 'Ready')) {
    message += ' — HITL tasks waiting for human';
  }
  
  await appendJournal({
    observation: message,
    details: { humanPresent, queueLength: checkpoint.context?.queue?.length },
    action: 'wait'
  });
  
  await clearCheckpoint(CHECKPOINT_FILE);
}

// ===== Helper Functions =====

function parseArgs(args) {
  return {
    resume: args.includes('--resume'),
    humanPresent: args.includes('--human-present'),
    force: args.includes('--force')
  };
}

async function readJSON(path) {
  const fullPath = pathResolve(process.cwd(), path);
  if (!existsSync(fullPath)) return {};
  return JSON.parse(readFileSync(fullPath, 'utf-8'));
}

async function readFile(path) {
  const fullPath = pathResolve(process.cwd(), path);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8');
}

async function readQueueTable() {
  const content = await readFile('library/handoffs/work-queue.md');
  return parseMarkdownTable(content, 'Queue');
}

async function readThreadsTable() {
  const content = await readFile('library/handoffs/work-queue.md');
  return parseMarkdownTable(content, 'Active Threads');
}

function parseMarkdownTable(content, sectionName) {
  if (!content) return [];
  const sectionRegex = new RegExp(`## ${sectionName}[\\s\\S]*?\\|([\\s\\S]*?)(?:##|$)`, 'i');
  const match = content.match(sectionRegex);
  if (!match) return [];
  
  const lines = match[1].trim().split('\n');
  const dataLines = lines.filter(l => l.includes('|') && !l.match(/^[\s|:-]+$/));
  
  if (dataLines.length < 2) return [];
  
  const headers = dataLines[0].split('|').map(h => h.trim()).filter(Boolean);
  return dataLines.slice(1).map(line => {
    const values = line.split('|').map(v => v.trim()).filter(Boolean);
    const row = {};
    headers.forEach((h, i) => row[h] = values[i] || '');
    return row;
  });
}

async function extractChangedFiles(changes) {
  if (!Array.isArray(changes)) return [];
  return changes
    .filter(c => c && c.file)
    .map(c => c.file);
}

async function gitAddAndCommit(changes, message) {
  const files = extractChangedFiles(changes);
  const uniqueFiles = [...new Set(files)];
  
  if (uniqueFiles.length > 0) {
    await runCommand('git', ['add', ...uniqueFiles]);
  }
  
  await runCommand('git', ['commit', '-m', message]);
}

async function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: process.cwd(), stdio: 'inherit' });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
    child.on('error', reject);
  });
}

main();