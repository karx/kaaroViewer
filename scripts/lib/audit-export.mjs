#!/usr/bin/env node
/**
 * Audit Export CLI — Export events for kaaroSessions ingestion
 */

import { getAuditBus } from './audit-bus.mjs';

async function main() {
  const args = process.argv.slice(2);
  const bus = getAuditBus();
  
  let outputPath = 'orchestration-export.json';
  let format = 'json';
  const filter = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output' || arg === '-o') {
      outputPath = args[++i];
    } else if (arg === '--format' || arg === '-f') {
      format = args[++i];
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      filter[key] = value;
    }
  }
  
  if (filter.limit) filter.limit = parseInt(filter.limit);
  if (filter.since) filter.since = new Date(filter.since).toISOString();
  if (filter.until) filter.until = new Date(filter.until).toISOString();
  if (filter.success) filter.success = filter.success === 'true';
  
  console.log(`Exporting events to ${outputPath}...`);
  console.log(`Filter:`, filter);
  
  await bus.exportForKaaroSessions(outputPath, filter);
  console.log('Done!');
}

main().catch(console.error);