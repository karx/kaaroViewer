#!/usr/bin/env node
/**
 * Alone-Time Scheduler — Autonomous Run Orchestration
 * 
 * Manages scheduled and trigger-based Alone-Time runs with precedence rules.
 */

import { ContextService } from './lib/context-service.mjs';
import { HITLCoordinator } from './lib/hitl-coordinator.mjs';
import { spawn } from 'child_process';

const DEFAULT_CRON = '0 2 * * *'; // Daily 02:00 UTC

export class AloneTimeScheduler {
  constructor(config = {}) {
    this.config = {
      cronExpression: config.cron || DEFAULT_CRON,
      maxConcurrentRuns: 1,
      queuePressureThreshold: 3,
      signalSpikeThreshold: 3,
      checkInterval: 15 * 60 * 1000, // 15 minutes
      ...config
    };
    
    this.contextService = new ContextService();
    this.hitlCoordinator = new HITLCoordinator();
    this.running = false;
    this.currentRun = null;
    this.cronJob = null;
    this.healthInterval = null;
    this.triggerWatcher = null;
  }

  async start() {
    console.log(`⏰ Starting Alone-Time Scheduler`);
    console.log(`   Cron: ${this.config.cronExpression}`);
    console.log(`   Queue pressure threshold: ${this.config.queuePressureThreshold}`);
    console.log(`   Signal spike threshold: ${this.config.signalSpikeThreshold}`);
    console.log(`   Check interval: ${this.config.checkInterval / 60000} min`);
    
    // 1. Start cron job
    await this.startCron();
    
    // 2. Start health check interval
    this.startHealthChecks();
    
    // 3. Start trigger file watcher
    await this.startTriggerWatcher();
    
    // 4. Initial check
    setTimeout(() => this.maybeRun('startup'), 5000);
    
    // Handle shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  async startCron() {
    try {
      const cron = await import('node-cron');
      this.cronJob = cron.default.schedule(this.config.cronExpression, () => {
        this.maybeRun('scheduled');
      }, { scheduled: true, timezone: 'UTC' });
      console.log('✅ Cron job scheduled');
    } catch (e) {
      console.warn('⚠️ node-cron not available, using setInterval fallback');
      this.cronJob = setInterval(() => this.maybeRun('scheduled'), 24 * 60 * 60 * 1000);
    }
  }

  startHealthChecks() {
    this.healthInterval = setInterval(() => {
      this.checkHealthPressure();
    }, this.config.checkInterval);
    this.healthInterval.unref?.();
  }

  async startTriggerWatcher() {
    try {
      const chokidar = await import('chokidar');
      const { mkdirSync } = await import('fs');
      const triggerDir = '.alone-time-triggers';
      
      // Ensure directory exists
      mkdirSync(triggerDir, { recursive: true });
      
      this.triggerWatcher = chokidar.watch(triggerDir, { persistent: true, ignoreInitial: true });
      this.triggerWatcher.on('add', (path) => this.handleTrigger(path));
      this.triggerWatcher.on('change', (path) => this.handleTrigger(path));
      console.log('✅ Trigger watcher started');
    } catch (e) {
      console.warn('⚠️ chokidar not available, trigger watching disabled');
    }
  }

  async handleTrigger(triggerPath) {
    console.log(`🔔 Trigger file detected: ${triggerPath}`);
    // Read trigger to get context
    const { readFileSync, unlinkSync } = await import('fs');
    try {
      const content = readFileSync(triggerPath, 'utf-8');
      const trigger = JSON.parse(content);
      unlinkSync(triggerPath); // Consume trigger
      await this.maybeRun('trigger', trigger);
    } catch (e) {
      console.error('Failed to process trigger:', e.message);
    }
  }

  async maybeRun(triggerType, triggerData = {}) {
    if (this.running) {
      console.log(`⏭️ Skipping ${triggerType} run — already running`);
      return { skipped: true, reason: 'already running' };
    }
    
    console.log(`🔍 Evaluating run (trigger: ${triggerType})...`);
    
    try {
      const context = await this.contextService.ingestForScheduler();
      const decision = await this.selectTask(context);
      
      if (decision.action === 'IDLE') {
        await this.logIdle(triggerType, context);
        return { action: 'idle' };
      }
      
      return await this.executeRun(decision, triggerType);
      
    } catch (error) {
      console.error(`❌ Scheduler error: ${error.message}`);
      return { error: error.message };
    }
  }

  async selectTask(context) {
    const { health, queue, threads } = context;
    
    // 1. Critical entries + human available → HITL VISUALIZE
    const hitlAvailable = await this.hitlCoordinator.isHumanAvailable();
    if (health.critical && health.critical.length > 0 && hitlAvailable) {
      return { 
        action: 'RUN', 
        task: health.critical[0], 
        modality: 'HITL',
        reason: 'critical entry + human available'
      };
    }
    
    // 2. Dream Loop signal spike
    if (this.detectSignalSpike(context)) {
      return { 
        action: 'DREAM_LOOP', 
        reason: 'signal spike detected (3x same warning)' 
      };
    }
    
    // 3. Autonomous queue pressure
    const autonomousReady = (queue || []).filter(t => 
      t.Modality === '🤖 Autonomous' && t.Status === '🟡 Ready'
    );
    if (autonomousReady.length >= this.config.queuePressureThreshold) {
      return { 
        action: 'RUN', 
        task: autonomousReady[0], 
        modality: 'AUTONOMOUS',
        reason: `queue pressure (${autonomousReady.length} ready)`
      };
    }
    
    // 4. Single autonomous task (lower threshold when idle)
    if (autonomousReady.length > 0 && !this.running) {
      return { 
        action: 'RUN', 
        task: autonomousReady[0], 
        modality: 'AUTONOMOUS',
        reason: 'autonomous task ready'
      };
    }
    
    return { action: 'IDLE' };
  }

  detectSignalSpike(context) {
    // Check for 3x same validator warning across entries
    const { health } = context;
    if (!health.library) return false;
    
    const warningCounts = {};
    for (const entry of health.library) {
      if (entry.validator?.warnings) {
        for (const warning of entry.validator.warnings) {
          const key = warning.slice(0, 50); // Group similar warnings
          warningCounts[key] = (warningCounts[key] || 0) + 1;
        }
      }
    }
    
    for (const [warning, count] of Object.entries(warningCounts)) {
      if (count >= this.config.signalSpikeThreshold) {
        console.log(`🚨 Signal spike: "${warning}" appeared ${count}x`);
        return true;
      }
    }
    
    return false;
  }

  async executeRun(decision, triggerType) {
    this.running = true;
    this.currentRun = { decision, triggerType, startedAt: new Date() };
    
    console.log(`🚀 Executing ${decision.action} (reason: ${decision.reason})`);
    
    try {
      let result;
      
      if (decision.action === 'DREAM_LOOP') {
        result = await this.runDreamLoop();
      } else if (decision.action === 'RUN') {
        result = await this.runAloneTime(decision.task, decision.modality);
      }
      
      this.running = false;
      this.currentRun = null;
      
      return { action: decision.action, result };
      
    } catch (error) {
      this.running = false;
      this.currentRun = null;
      throw error;
    }
  }

  async runAloneTime(task, modality) {
    const args = ['scripts/alone-time-hardened.mjs'];
    
    if (modality === 'HITL') {
      args.push('--human-present');
    }
    
    // Add task context via env (Alone-Time reads from work-queue.md)
    if (task && task['Task ID']) {
      // Could pass task ID, but Alone-Time reads queue directly
    }
    
    return this.runChildProcess('node', args);
  }

  async runDreamLoop() {
    return this.runChildProcess('node', ['scripts/dream-loop.mjs']);
  }

  runChildProcess(cmd, args) {
    return new Promise((resolve, reject) => {
      console.log(`   Spawning: ${cmd} ${args.join(' ')}`);
      const child = spawn(cmd, args, { 
        stdio: 'inherit', 
        cwd: process.cwd(),
        env: { ...process.env, SCHEDULER_TRIGGER: 'true' }
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log(`   ✅ Child process exited cleanly`);
          resolve({ success: true });
        } else {
          console.error(`   ❌ Child process exited with code ${code}`);
          reject(new Error(`Child process exited ${code}`));
        }
      });
      
      child.on('error', reject);
    });
  }

  async logIdle(triggerType, context) {
    const queueLen = context.queue?.length || 0;
    const autonomousReady = (context.queue || []).filter(t => 
      t.Modality === '🤖 Autonomous' && t.Status === '🟡 Ready'
    ).length;
    
    console.log(`😴 Idle: ${queueLen} queued, ${autonomousReady} autonomous ready`);
    
    // Could write to journal
  }

  async checkHealthPressure() {
    if (this.running) return;
    
    try {
      const context = await this.contextService.ingestForScheduler();
      const decision = await this.selectTask(context);
      
      if (decision.action !== 'IDLE') {
        console.log(`🏥 Health check triggered run: ${decision.reason}`);
        await this.executeRun(decision, 'health-check');
      }
    } catch (e) {
      console.error('Health check failed:', e.message);
    }
  }

  shutdown() {
    console.log('\n🛑 Shutting down scheduler...');
    
    if (this.cronJob) {
      if (typeof this.cronJob.stop === 'function') this.cronJob.stop();
      else clearInterval(this.cronJob);
    }
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.triggerWatcher) this.triggerWatcher.close();
    
    process.exit(0);
  }

  getStatus() {
    return {
      running: this.running,
      currentRun: this.currentRun,
      cronExpression: this.config.cronExpression,
      config: this.config
    };
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const scheduler = new AloneTimeScheduler();
  
  if (args[0] === 'status') {
    console.log(JSON.stringify(scheduler.getStatus(), null, 2));
    return;
  }
  
  if (args[0] === 'run') {
    await scheduler.maybeRun('manual');
    return;
  }
  
  await scheduler.start();
  
  // Keep alive
  console.log('Scheduler running. Press Ctrl+C to stop.');
}

main().catch(console.error);