#!/usr/bin/env node
/**
 * Hardened Alone-Time Orchestrator
 * 
 * Production-grade with:
 * - Phase timeouts with graceful degradation
 * - LLM Gateway with model fallbacks
 * - Atomic checkpoint with schema versioning
 * - Audit event emission (kaaroSessions)
 * - HITL Coordinator integration
 * - Structured error handling & recovery
 */

import { acquireLock, releaseLock, forceReleaseLock } from './lib/lock.mjs';
import { loadCheckpoint, saveCheckpoint, clearCheckpoint, hasCheckpoint } from './lib/checkpoint.mjs';
import { invokeLLM, getModelForTask } from './lib/llm-gateway.mjs';
import { runGates } from './lib/gates.mjs';
import { writeHandoff, updateQueue, appendJournal, getLatestHandoff, readLastJournalEntries } from './lib/artifacts.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { resolve as pathResolve } from 'path';
import { ContextService } from './lib/context-service.mjs';
import { HITLCoordinator } from './lib/hitl-coordinator.mjs';
import { AuditBus } from './lib/audit-bus.mjs';

const LOCK_FILE = '.alone-time.lock';
const CHECKPOINT_FILE = '.alone-time-checkpoint.json';
const CHECKPOINT_SCHEMA_VERSION = 1;

const PHASE_TIMEOUTS = {
  INGEST: 30000,
  SELECT: 180000,   // 3 min (fast model)
  MUTATE: 600000,   // 10 min (smart/reasoning model)
  GATE: 180000,     // 3 min
  COMMIT: 60000,    // 1 min
  IDLE: 5000
};

const MAX_RETRIES = {
  SELECT: 2,
  MUTATE: 1,
  GATE: 1,
  COMMIT: 1
};

class HardenedAloneTime {
  constructor(options = {}) {
    this.options = {
      resume: options.resume || false,
      force: options.force || false,
      humanPresent: options.humanPresent || false,
      dryRun: options.dryRun || false,
      ...options
    };
    this.runId = `alone-time-${new Date().toISOString().split('T')[0]}-${Date.now().toString(36).slice(-4)}`;
    this.lock = null;
    this.checkpoint = null;
    this.contextService = new ContextService();
    this.hitlCoordinator = new HITLCoordinator();
    this.auditBus = new AuditBus();
    this.phaseRetries = {};
  }

  async run() {
    console.log(`🌱 Hardened Alone-Time: ${this.runId}`);
    console.log(`   Resume: ${this.options.resume} | Human: ${this.options.humanPresent} | Dry-run: ${this.options.dryRun}`);

    this.auditBus.emit({
      event: 'run_start',
      runId: this.runId,
      orchestrator: 'alone-time',
      humanPresent: this.options.humanPresent,
      dryRun: this.options.dryRun
    });

    try {
      // Acquire lock
      this.lock = await this.acquireLockWithRetry();
      
      // Load or initialize checkpoint
      await this.loadOrInitializeCheckpoint();
      
      // Execute phase loop
      await this.executePhaseLoop();
      
      // Success
      this.auditBus.emit({
        event: 'run_complete',
        runId: this.runId,
        orchestrator: 'alone-time',
        taskId: this.checkpoint.taskId,
        taskType: this.checkpoint.taskType,
        success: true
      });
      
      console.log(`\n✅ Alone-Time ${this.runId} complete!`);
      
    } catch (error) {
      await this.handleFailure(error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async acquireLockWithRetry() {
    const lock = await acquireLock(LOCK_FILE, this.runId);
    if (lock) return lock;
    
    if (this.options.force) {
      console.log('⚠️ Forcing lock release...');
      await forceReleaseLock(LOCK_FILE);
      const newLock = await acquireLock(LOCK_FILE, this.runId);
      if (!newLock) throw new Error('Failed to acquire lock after force release');
      return newLock;
    }
    
    // Check if lock is stale (PID dead)
    const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
    if (lockData.pid && !this.isPidAlive(lockData.pid)) {
      console.log(`⚠️ Lock held by dead PID ${lockData.pid}, forcing release`);
      await forceReleaseLock(LOCK_FILE);
      return await acquireLock(LOCK_FILE, this.runId);
    }
    
    throw new Error(`Another Alone-Time run in progress (${lockData.ownerId}). Use --force to override.`);
  }

  isPidAlive(pid) {
    try {
      process.kill(pid, 0); // Signal 0 = check existence
      return true;
    } catch (e) {
      return e.code === 'EPERM'; // EPERM means process exists but we can't signal it
    }
  }

  async loadOrInitializeCheckpoint() {
    if (this.options.resume && hasCheckpoint(CHECKPOINT_FILE)) {
      const loaded = await loadCheckpoint(CHECKPOINT_FILE);
      if (loaded.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
        console.warn(`⚠️ Checkpoint schema mismatch (${loaded.schemaVersion} vs ${CHECKPOINT_SCHEMA_VERSION}), starting fresh`);
        this.checkpoint = await this.initializeCheckpoint();
      } else {
        console.log(`📂 Resumed from checkpoint: phase=${loaded.phase}`);
        this.checkpoint = loaded;
        this.phaseRetries = loaded.phaseRetries || {};
      }
    } else {
      this.checkpoint = await this.initializeCheckpoint();
    }
  }

  async initializeCheckpoint() {
    console.log('\n📥 Phase: INGEST');
    const startTime = Date.now();
    
    const context = await this.withTimeout(
      this.contextService.ingestForAloneTime(),
      PHASE_TIMEOUTS.INGEST,
      'INGEST'
    );
    
    this.auditBus.emit({
      event: 'phase_transition',
      runId: this.runId,
      orchestrator: 'alone-time',
      phase: 'INGEST',
      duration: Date.now() - startTime,
      success: true
    });

    const checkpoint = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      runId: this.runId,
      phase: 'SELECT',
      startedAt: new Date().toISOString(),
      context,
      humanPresent: this.options.humanPresent,
      phaseRetries: {},
      taskId: null,
      taskType: null,
      modality: null,
      plan: [],
      rationale: null,
      changes: [],
      gateResults: {},
      handoffNotes: {}
    };
    
    await saveCheckpoint(checkpoint, CHECKPOINT_FILE);
    return checkpoint;
  }

  async executePhaseLoop() {
    while (true) {
      const phase = this.checkpoint.phase;
      console.log(`\n▶️  Phase: ${phase} (retry: ${this.phaseRetries[phase] || 0})`);
      
      const phaseStart = Date.now();
      this.auditBus.emit({
        event: 'phase_transition',
        runId: this.runId,
        orchestrator: 'alone-time',
        phase,
        retry: this.phaseRetries[phase] || 0
      });
      
      try {
        await this.withTimeout(
          this.executePhase(phase),
          PHASE_TIMEOUTS[phase],
          phase
        );
        
        this.auditBus.emit({
          event: 'phase_transition',
          runId: this.runId,
          orchestrator: 'alone-time',
          phase,
          duration: Date.now() - phaseStart,
          success: true
        });
        
      } catch (error) {
        const retryCount = this.phaseRetries[phase] = (this.phaseRetries[phase] || 0) + 1;
        const maxRetry = MAX_RETRIES[phase] || 0;
        
        this.auditBus.emit({
          event: 'phase_transition',
          runId: this.runId,
          orchestrator: 'alone-time',
          phase,
          duration: Date.now() - phaseStart,
          success: false,
          error: error.message,
          retry: retryCount
        });
        
        if (retryCount <= maxRetry) {
          console.warn(`⚠️ Phase ${phase} failed (attempt ${retryCount}/${maxRetry}), retrying in 5s...`);
          await appendJournal({
            observation: `Phase ${phase} retry ${retryCount}/${maxRetry}: ${error.message}`,
            action: 'retry',
            details: { phase, error: error.message, retry: retryCount }
          });
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        
        throw error;
      }
      
      if (this.checkpoint.phase === 'COMMIT') return;
      if (this.checkpoint.phase === 'IDLE') return;
    }
  }

  async executePhase(phase) {
    switch (phase) {
      case 'SELECT':
        await this.phaseSelect();
        break;
      case 'MUTATE':
        await this.phaseMutate();
        break;
      case 'GATE':
        await this.phaseGate();
        break;
      case 'COMMIT':
        await this.phaseCommit();
        break;
      case 'IDLE':
        await this.phaseIdle();
        break;
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
    
    await saveCheckpoint(this.checkpoint, CHECKPOINT_FILE);
  }

  // ===== PHASE IMPLEMENTATIONS =====

  async phaseSelect() {
    const { context, humanPresent } = this.checkpoint;
    
    const hitlAvailable = humanPresent || await this.hitlCoordinator.isHumanAvailable();
    
    // ALWAYS run rule-based selection first (fast, no LLM)
    let output = this.selectWithRules(context, hitlAvailable);
    
    // If rule-based returns a HITL task but no human, try LLM for alternative
    if (output.modality === 'HITL' && !hitlAvailable) {
      console.log(`  ⏭️  HITL task selected but human not available, trying LLM for alternative...`);
      const llmOutput = await this.selectWithLLM(context, hitlAvailable);
      if (llmOutput && llmOutput.modality !== 'HITL') {
        output = llmOutput;
      }
    }
    
    // If rule-based returns IDLE and human is present, try LLM for better selection
    if (output.taskId === 'IDLE' && hitlAvailable) {
      const llmOutput = await this.selectWithLLM(context, hitlAvailable);
      if (llmOutput && llmOutput.taskId !== 'IDLE') {
        output = llmOutput;
      }
    }
    
    if (!output || !output.taskId) {
      throw new Error('No task selected (both LLM and rules failed)');
    }

    console.log(`  🎯 Selected: ${output.taskId} (${output.taskType} / ${output.modality})`);
    console.log(`  📋 Plan: ${output.plan?.join('; ') || 'None'}`);
    console.log(`  💭 Rationale: ${output.rationale || 'Not provided'}`);

    // Handle HITL task when human not available
    if (output.modality === 'HITL' && !hitlAvailable) {
      console.log(`  ⏭️  Skipping HITL task ${output.taskId} (human not available)`);
      await appendJournal({ 
        observation: `Skipped HITL task ${output.taskId} (${output.taskType}) - human not available`,
        action: 're-queue'
      });
      output = this.selectWithRules(context, hitlAvailable);
    }

    if (output.taskId === 'IDLE') {
      this.checkpoint.phase = 'IDLE';
      return;
    }

    if (output.modality === 'HITL' && hitlAvailable) {
      await this.createHITLHandoff(output);
    }

    this.checkpoint.phase = 'MUTATE';
    this.checkpoint.taskId = output.taskId;
    this.checkpoint.taskType = output.taskType;
    this.checkpoint.modality = output.modality;
    this.checkpoint.plan = output.plan || [];
    this.checkpoint.rationale = output.rationale;
    this.checkpoint.estimatedTurns = output.estimatedTurns || 15;
  }

  async selectWithLLM(context, hitlAvailable) {
    try {
      const result = await invokeLLM({
        taskType: 'SELECT',
        promptTemplate: '.claude/prompts/alone-time-select.md',
        context: {
          ...context,
          humanPresent: hitlAvailable
        },
        runId: `${this.runId}-select`
      });

      if (!result.success) {
        console.warn(`⚠️ SELECT agent failed: ${result.error}`);
        return null;
      }

      return result.structuredOutput;
    } catch (e) {
      console.warn(`⚠️ SELECT LLM invocation error: ${e.message}`);
      return null;
    }
  }

  selectWithRules(context, hitlAvailable) {
    const { health, queue } = context;
    
    // Rule 1: Critical entry + human available → HITL VISUALIZE
    if (health?.critical && health.critical.length > 0 && hitlAvailable) {
      return {
        taskId: `VISUALIZE-${health.critical[0].id || 'unknown'}`,
        taskType: 'VISUALIZE',
        modality: 'HITL',
        plan: ['Run /visualize on critical entry'],
        rationale: 'Critical entry + human available'
      };
    }
    
    // Rule 2: Signal spike → DREAM_LOOP
    if (this.detectSignalSpike(context)) {
      return {
        taskId: 'DREAM_LOOP',
        taskType: 'DETECT_ONTOLOGY_GAPS',
        modality: 'AUTONOMOUS',
        plan: ['Run dream-loop analysis'],
        rationale: 'Signal spike detected (3x same warning)'
      };
    }
    
    // Rule 3: Autonomous queue pressure
    const autonomousReady = (queue || []).filter(t => 
      t.Modality === '🤖 Autonomous' && t.Status === '🟡 Ready'
    );
    if (autonomousReady.length > 0) {
      const task = autonomousReady[0];
      return {
        taskId: task['Task ID'] || 'unknown',
        taskType: task.Type || 'UNKNOWN',
        modality: 'AUTONOMOUS',
        plan: [`Execute ${task.Type} for ${task.Target || 'target'}`],
        rationale: `Autonomous task ready (${autonomousReady.length} in queue)`
      };
    }
    
    // Rule 4: IDLE
    return {
      taskId: 'IDLE',
      taskType: 'IDLE',
      modality: 'NONE',
      plan: [],
      rationale: 'No autonomous tasks available'
    };
  }

  detectSignalSpike(context) {
    const { health } = context;
    if (!health?.library) return false;
    
    const warningCounts = {};
    for (const entry of health.library) {
      if (entry.validator?.warnings) {
        for (const warning of entry.validator.warnings) {
          const key = warning.slice(0, 50);
          warningCounts[key] = (warningCounts[key] || 0) + 1;
        }
      }
    }
    
    for (const [warning, count] of Object.entries(warningCounts)) {
      if (count >= 3) {
        return true;
      }
    }
    return false;
  }

  async createHITLHandoff(task) {
    const handoff = {
      runId: this.runId,
      taskId: task.taskId,
      taskType: task.taskType,
      modality: 'HITL',
      plan: task.plan,
      rationale: task.rationale,
      context: {
        health: this.checkpoint.context.health,
        queue: this.checkpoint.context.queue,
        strategy: this.checkpoint.context.strategy
      },
      createdAt: new Date().toISOString(),
      status: 'READY_FOR_HUMAN'
    };
    
    writeFileSync('.hitl-handoff.json', JSON.stringify(handoff, null, 2));
    console.log(`  📋 HITL handoff created: .hitl-handoff.json`);
    
    this.auditBus.emit({
      event: 'human_handoff',
      runId: this.runId,
      orchestrator: 'alone-time',
      taskId: task.taskId,
      taskType: task.taskType,
      handoffPath: '.hitl-handoff.json'
    });
  }

  async phaseMutate() {
    const { taskId, taskType, plan, context } = this.checkpoint;
    
    const promptTemplate = `.claude/prompts/alone-time-${taskType.toLowerCase()}.md`;
    if (!existsSync(pathResolve(process.cwd(), promptTemplate))) {
      throw new Error(`Prompt template not found: ${promptTemplate}`);
    }
    
    console.log(`  🔧 Executing ${taskType} with ${promptTemplate}`);

    const result = await invokeLLM({
      taskType: taskType,
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
      maxTurns: this.checkpoint.estimatedTurns || 20,
      runId: `${this.runId}-mutate`
    });

    if (!result.success) {
      throw new Error(`MUTATE agent failed: ${result.error}`);
    }

    const output = result.structuredOutput || { changes: [], gateResults: {}, handoffNotes: {} };
    
    this.checkpoint.phase = 'GATE';
    this.checkpoint.changes = output.changes || [];
    this.checkpoint.gateResults = output.gateResults || {};
    this.checkpoint.handoffNotes = output.handoffNotes || {};
  }

  async phaseGate() {
    const { changes, taskId, taskType } = this.checkpoint;
    
    const changedFiles = this.extractChangedFiles(changes);
    const fullRegression = ['IMPROVE_PIPELINE', 'DETECT_ONTOLOGY_GAPS'].includes(taskType);
    
    console.log(`  🚪 Running gates (${changedFiles.length} files, fullRegression: ${fullRegression})`);
    
    const gateResults = await runGates({ changedFiles, fullRegression });
    
    if (!gateResults.overall) {
      await appendJournal({
        observation: `Gate failed for ${taskId} (${taskType})`,
        details: gateResults,
        action: 'requeue'
      });
      throw new Error(`Gates failed for ${taskId}. See handoff for details.`);
    }
    
    console.log(`  ✅ Gates passed`);
    
    this.checkpoint.phase = 'COMMIT';
    this.checkpoint.gateResults = gateResults;
  }

  async phaseCommit() {
    const { runId, taskId, taskType, changes, gateResults, handoffNotes, plan } = this.checkpoint;
    
    if (this.options.dryRun) {
      console.log('  🔍 DRY RUN: Skipping git commit, handoff, queue update');
      this.auditBus.emit({
        event: 'run_complete',
        runId,
        orchestrator: 'alone-time',
        taskId,
        taskType,
        success: true,
        dryRun: true
      });
      return;
    }
    
    console.log('  📦 Committing changes...');
    
    const commitMsg = `alone-time: ${taskId} (${taskType}) — ${handoffNotes.summary || handoffNotes.rationale || 'completed'}`;
    await this.gitAddAndCommit(changes, commitMsg);
    
    const { stdout: commitHash } = await this.runCommandCapture('git', ['rev-parse', 'HEAD']);
    
    await writeHandoff(runId, {
      taskId,
      taskType,
      plan,
      changes,
      gateResults,
      handoffNotes: { ...handoffNotes, commitHash: commitHash.trim() }
    });
    
    await updateQueue(taskId, 'complete', {
      type: taskType,
      target: handoffNotes.target,
      outcome: handoffNotes.summary || 'Completed'
    });
    
    await appendJournal({
      observation: handoffNotes.journalEntry || `Completed ${taskId} (${taskType})`,
      details: { changes: changes.length, gates: gateResults, commit: commitHash.trim() },
      action: 'complete'
    });
    
    if (existsSync('.hitl-handoff.json')) {
      const hitlHandoff = JSON.parse(readFileSync('.hitl-handoff.json', 'utf-8'));
      hitlHandoff.status = 'COMPLETED';
      hitlHandoff.completedAt = new Date().toISOString();
      hitlHandoff.commitHash = commitHash.trim();
      writeFileSync('.hitl-handoff.json', JSON.stringify(hitlHandoff, null, 2));
    }
    
    await clearCheckpoint(CHECKPOINT_FILE);
    
    console.log(`  ✅ Committed: ${commitMsg}`);
    
    this.auditBus.emit({
      event: 'task_complete',
      runId,
      orchestrator: 'alone-time',
      taskId,
      taskType,
      commitHash: commitHash.trim(),
      success: true
    });
  }

  async phaseIdle() {
    const { humanPresent } = this.checkpoint;
    const hitlAvailable = humanPresent || await this.hitlCoordinator.isHumanAvailable();
    
    let message = 'No autonomous tasks available';
    if (hitlAvailable && this.checkpoint.context?.queue?.some(t => t.Modality === '🤖 Autonomous' && t.Status === '🟡 Ready')) {
      message += ' — HITL tasks waiting for human';
    }
    
    await appendJournal({
      observation: message,
      details: { humanPresent, hitlAvailable, queueLength: this.checkpoint.context?.queue?.length },
      action: 'wait'
    });
    
    await clearCheckpoint(CHECKPOINT_FILE);
    
    this.auditBus.emit({
      event: 'idle',
      runId: this.runId,
      orchestrator: 'alone-time',
      reason: message
    });
  }

  // ===== HELPERS =====

  async withTimeout(promise, timeoutMs, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  async handleFailure(error) {
    console.error(`\n💥 Alone-Time failed: ${error.message}`);
    console.error(error.stack);
    
    await appendJournal({ 
      observation: `Alone-Time failed: ${error.message}`,
      details: { phase: this.checkpoint?.phase, error: error.stack },
      action: 'investigate'
    });
    
    this.auditBus.emit({
      event: 'run_complete',
      runId: this.runId,
      orchestrator: 'alone-time',
      taskId: this.checkpoint?.taskId,
      taskType: this.checkpoint?.taskType,
      success: false,
      error: error.message,
      phase: this.checkpoint?.phase
    });
  }

  async cleanup() {
    if (this.lock) {
      await releaseLock(this.lock);
    }
    await this.auditBus.flush();
  }

  extractChangedFiles(changes) {
    if (!Array.isArray(changes)) return [];
    return [...new Set(changes.filter(c => c && c.file).map(c => c.file))];
  }

  async gitAddAndCommit(changes, message) {
    const files = this.extractChangedFiles(changes);
    const uniqueFiles = [...new Set(files)];
    
    if (uniqueFiles.length > 0) {
      await this.runCommand('git', ['add', ...uniqueFiles]);
    }
    await this.runCommand('git', ['commit', '-m', message]);
  }

  async runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: process.cwd(), stdio: 'inherit' });
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
      child.on('error', reject);
    });
  }

  async runCommandCapture(cmd, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());
      child.on('close', code => resolve({ stdout, stderr, code }));
      child.on('error', reject);
    });
  }
}

// ===== CLI =====

function parseArgs(args) {
  return {
    resume: args.includes('--resume'),
    force: args.includes('--force'),
    humanPresent: args.includes('--human-present'),
    dryRun: args.includes('--dry-run')
  };
}

const options = parseArgs(process.argv.slice(2));
const orchestrator = new HardenedAloneTime(options);

orchestrator.run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});