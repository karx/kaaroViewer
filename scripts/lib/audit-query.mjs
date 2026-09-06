#!/usr/bin/env node
/**
 * Audit Query CLI — Query orchestration events
 */

import { getAuditBus } from './audit-bus.mjs';

async function main() {
  const args = process.argv.slice(2);
  const bus = getAuditBus();
  
  // Parse filter args
  const filter = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      filter[key] = value;
    }
  }
  
  // Convert string values
  if (filter.limit) filter.limit = parseInt(filter.limit);
  if (filter.since) filter.since = new Date(filter.since).toISOString();
  if (filter.until) filter.until = new Date(filter.until).toISOString();
  if (filter.success) filter.success = filter.success === 'true';
  
  const events = await bus.query(filter);
  
  if (events.length === 0) {
    console.log('No events found matching filter');
    return;
  }
  
  console.log(`Found ${events.length} events:\n`);
  
  for (const e of events) {
    const time = new Date(e.timestamp).toLocaleTimeString();
    const status = e.success === true ? '✅' : e.success === false ? '❌' : '⏳';
    console.log(`${time} ${status} [${e.orchestrator}] ${e.event} ${e.taskType ? `(${e.taskType})` : ''} ${e.runId || ''}`);
    if (e.error) console.log(`    Error: ${e.error}`);
    if (e.duration) console.log(`    Duration: ${e.duration}ms`);
  }
  
  // Also show stats
  const stats = await bus.getStats(filter);
  console.log('\n--- Stats ---');
  console.log(`Total: ${stats.totalEvents}`);
  console.log(`Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`Avg Duration: ${stats.avgDuration.toFixed(0)}ms`);
  console.log('\nBy Orchestrator:', stats.byOrchestrator);
  console.log('By Event:', stats.byEvent);
  console.log('By Task Type:', stats.byTaskType);
}

main().catch(console.error);