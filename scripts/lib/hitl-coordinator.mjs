/**
 * HITL Coordinator — Human-Machine Sync
 * 
 * Manages human availability signaling and HITL task handoff protocol.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { resolve as pathResolve } from 'path';

const AVAILABILITY_FILE = '.hitl-availability.json';
const HANDOFF_FILE = '.hitl-handoff.json';

export class HITLCoordinator {
  constructor(options = {}) {
    this.availabilityFile = options.availabilityFile || AVAILABILITY_FILE;
    this.handoffFile = options.handoffFile || HANDOFF_FILE;
    this.pollInterval = options.pollInterval || 30000;
  }

  /**
   * Signal human availability for HITL tasks
   * @param {number} durationMinutes - How long human will be available
   * @param {string} source - Source of signal (manual, calendar, etc.)
   */
  async signalAvailable(durationMinutes = 120, source = 'manual') {
    const expiry = Date.now() + durationMinutes * 60 * 1000;
    const data = {
      available: true,
      since: new Date().toISOString(),
      expires: new Date(expiry).toISOString(),
      source,
      signaledAt: new Date().toISOString()
    };
    
    writeFileSync(this.availabilityFile, JSON.stringify(data, null, 2));
    console.log(`✅ HITL availability signaled for ${durationMinutes} minutes (expires ${data.expires})`);
    return data;
  }

  /**
   * Signal human unavailable
   */
  async signalUnavailable() {
    if (existsSync(this.availabilityFile)) {
      unlinkSync(this.availabilityFile);
      console.log('✅ HITL availability cleared');
    }
  }

  /**
   * Check if human is currently available for HITL
   */
  async isHumanAvailable() {
    if (!existsSync(this.availabilityFile)) return false;
    
    try {
      const data = JSON.parse(readFileSync(this.availabilityFile, 'utf-8'));
      
      // Check expiry
      if (Date.now() > new Date(data.expires).getTime()) {
        await this.signalUnavailable(); // Auto-expire
        return false;
      }
      
      return data.available === true;
    } catch (e) {
      console.warn('⚠️ Failed to parse HITL availability:', e.message);
      return false;
    }
  }

  /**
   * Get availability status with details
   */
  async getAvailabilityStatus() {
    if (!existsSync(this.availabilityFile)) {
      return { available: false, reason: 'no_signal' };
    }
    
    try {
      const data = JSON.parse(readFileSync(this.availabilityFile, 'utf-8'));
      const now = Date.now();
      const expires = new Date(data.expires).getTime();
      
      if (now > expires) {
        await this.signalUnavailable();
        return { available: false, reason: 'expired' };
      }
      
      const remainingMinutes = Math.max(0, Math.ceil((expires - now) / 60000));
      
      return {
        available: true,
        since: data.since,
        expires: data.expires,
        remainingMinutes,
        source: data.source
      };
    } catch (e) {
      return { available: false, reason: 'parse_error', error: e.message };
    }
  }

  /**
   * Load current HITL handoff (created by Alone-Time SELECT phase)
   */
  async loadHandoff() {
    if (!existsSync(this.handoffFile)) return null;
    
    try {
      return JSON.parse(readFileSync(this.handoffFile, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ Failed to parse HITL handoff:', e.message);
      return null;
    }
  }

  /**
   * Mark HITL task as complete (called by human after /visualize)
   */
  async completeHandoff(commitHash, outcome = 'Completed') {
    if (!existsSync(this.handoffFile)) return false;
    
    try {
      const handoff = JSON.parse(readFileSync(this.handoffFile, 'utf-8'));
      handoff.status = 'COMPLETED';
      handoff.completedAt = new Date().toISOString();
      handoff.commitHash = commitHash;
      handoff.outcome = outcome;
      
      writeFileSync(this.handoffFile, JSON.stringify(handoff, null, 2));
      console.log(`✅ HITL handoff marked complete: ${handoff.taskId}`);
      return true;
    } catch (e) {
      console.error('❌ Failed to complete HITL handoff:', e.message);
      return false;
    }
  }

  /**
   * Get HITL tasks ready for human from work queue
   */
  async getHITLReadyTasks(queue) {
    return queue.filter(t => t.Modality === '👤 HITL' && t.Status === '🟡 Ready');
  }
}

/**
 * CLI for human interaction
 */
export async function hitlCLI() {
  const args = process.argv.slice(2);
  const coordinator = new HITLCoordinator();
  const command = args[0];
  
  switch (command) {
    case 'start': {
      const duration = parseInt(args[1]) || 120;
      const source = args[2] || 'manual';
      await coordinator.signalAvailable(duration, source);
      break;
    }
    case 'stop':
      await coordinator.signalUnavailable();
      break;
    case 'status': {
      const status = await coordinator.getAvailabilityStatus();
      console.log(JSON.stringify(status, null, 2));
      break;
    }
    case 'handoff': {
      const handoff = await coordinator.loadHandoff();
      if (handoff) {
        console.log(JSON.stringify(handoff, null, 2));
      } else {
        console.log('No active HITL handoff');
      }
      break;
    }
    case 'complete': {
      const commitHash = args[1];
      const outcome = args.slice(2).join(' ') || 'Completed';
      if (!commitHash) {
        console.error('Usage: hitl complete <commit-hash> [outcome]');
        process.exit(1);
      }
      await coordinator.completeHandoff(commitHash, outcome);
      break;
    }
    default:
      console.log(`
HITL Coordinator CLI

Usage:
  npm run hitl:start -- [duration-minutes] [source]
  npm run hitl:stop
  npm run hitl:status
  npm run hitl:handoff
  npm run hitl:complete <commit-hash> [outcome]

Examples:
  npm run hitl:start -- 120 manual          # Available for 2 hours
  npm run hitl:start -- 60 calendar         # Available for 1 hour (calendar)
  npm run hitl:status                       # Check availability
  npm run hitl:handoff                      # Show current handoff
  npm run hitl:complete abc1234 "Done T-001" # Mark complete
`);
  }
}

// Run CLI if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  hitlCLI().catch(console.error);
}