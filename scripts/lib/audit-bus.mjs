/**
 * Audit Bus — Event Emission & kaaroSessions Integration
 * 
 * Centralized event logging for all orchestration activities.
 * Emits to JSONL for kaaroSessions consumption and optional SSE.
 */

import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { resolve as pathResolve } from 'path';

const EVENT_LOG = 'library/handoffs/orchestration-events.jsonl';
const FLUSH_INTERVAL = 10000; // 10 seconds

export class AuditBus {
  constructor(options = {}) {
    this.events = [];
    this.flushInterval = options.flushInterval || FLUSH_INTERVAL;
    this.sseClients = new Set();
    this.eventLogPath = options.eventLogPath || EVENT_LOG;
    this.autoFlushTimer = null;
    this.startAutoFlush();
  }

  /**
   * Emit an orchestration event
   */
  emit(event) {
    const enriched = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      eventId: `${event.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
    
    this.events.push(enriched);
    
    // Also write to local file immediately for crash recovery
    this.writeEventLog(enriched);
    
    // Notify SSE clients
    this.notifySSE(enriched);
  }

  /**
   * Start periodic flush to JSONL
   */
  startAutoFlush() {
    this.autoFlushTimer = setInterval(() => this.flush(), this.flushInterval);
    // Don't prevent exit
    this.autoFlushTimer.unref?.();
  }

  /**
   * Flush buffered events to JSONL
   */
  async flush() {
    if (this.events.length === 0) return;
    
    const lines = this.events.map(e => JSON.stringify(e)).join('\n') + '\n';
    
    try {
      appendFileSync(this.eventLogPath, lines);
      this.events = [];
    } catch (e) {
      console.warn('⚠️ Failed to flush event log:', e.message);
    }
  }

  /**
   * Write single event to log (immediate, for crash recovery)
   */
  writeEventLog(event) {
    try {
      // Ensure directory exists
      const dir = pathResolve(this.eventLogPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      appendFileSync(this.eventLogPath, JSON.stringify(event) + '\n');
    } catch (e) {
      // Non-fatal
    }
  }

  /**
   * Register SSE client for real-time events
   */
  registerSSE(response) {
    const clientId = Math.random().toString(36).slice(2);
    this.sseClients.add({ id: clientId, response, connectedAt: new Date() });
    
    // Send initial connection event
    response.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
    
    // Cleanup on disconnect
    response.on('close', () => {
      this.sseClients.delete(clientId);
    });
    
    console.log(`📡 SSE client connected: ${clientId} (total: ${this.sseClients.size})`);
  }

  /**
   * Notify all SSE clients of new event
   */
  notifySSE(event) {
    if (this.sseClients.size === 0) return;
    
    const data = `data: ${JSON.stringify(event)}\n\n`;
    
    for (const client of this.sseClients) {
      try {
        client.response.write(data);
      } catch (e) {
        // Client disconnected, will be cleaned up
      }
    }
  }

  /**
   * Query events from log
   */
  async query(filter = {}) {
    const { readFileSync } = await import('fs');
    
    if (!existsSync(this.eventLogPath)) return [];
    
    const content = readFileSync(this.eventLogPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    let events = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    // Apply filters
    if (filter.orchestrator) {
      events = events.filter(e => e.orchestrator === filter.orchestrator);
    }
    if (filter.event) {
      events = events.filter(e => e.event === filter.event);
    }
    if (filter.taskType) {
      events = events.filter(e => e.taskType === filter.taskType);
    }
    if (filter.runId) {
      events = events.filter(e => e.runId === filter.runId);
    }
    if (filter.since) {
      const since = new Date(filter.since).getTime();
      events = events.filter(e => new Date(e.timestamp).getTime() >= since);
    }
    if (filter.until) {
      const until = new Date(filter.until).getTime();
      events = events.filter(e => new Date(e.timestamp).getTime() <= until);
    }
    if (filter.success !== undefined) {
      events = events.filter(e => e.success === filter.success);
    }
    
    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (filter.limit) {
      events = events.slice(0, filter.limit);
    }
    
    return events;
  }

  /**
   * Get aggregated stats for dashboards
   */
  async getStats(filter = {}) {
    const events = await this.query(filter);
    
    const stats = {
      totalEvents: events.length,
      byOrchestrator: {},
      byEvent: {},
      byTaskType: {},
      byModel: {},
      successRate: 0,
      avgDuration: 0,
      totalDuration: 0,
      timeRange: { earliest: null, latest: null }
    };
    
    let successCount = 0;
    let durationSum = 0;
    let durationCount = 0;
    
    for (const e of events) {
      // By orchestrator
      if (e.orchestrator) {
        stats.byOrchestrator[e.orchestrator] = (stats.byOrchestrator[e.orchestrator] || 0) + 1;
      }
      
      // By event type
      if (e.event) {
        stats.byEvent[e.event] = (stats.byEvent[e.event] || 0) + 1;
      }
      
      // By task type
      if (e.taskType) {
        stats.byTaskType[e.taskType] = (stats.byTaskType[e.taskType] || 0) + 1;
      }
      
      // By model
      if (e.model) {
        stats.byModel[e.model] = (stats.byModel[e.model] || 0) + 1;
      }
      
      // Success rate
      if (e.success === true) successCount++;
      if (e.success !== undefined) {
        // Only count events with explicit success field
      }
      
      // Duration
      if (typeof e.duration === 'number') {
        durationSum += e.duration;
        durationCount++;
      }
      
      // Time range
      const ts = new Date(e.timestamp).getTime();
      if (!stats.timeRange.earliest || ts < stats.timeRange.earliest) {
        stats.timeRange.earliest = ts;
      }
      if (!stats.timeRange.latest || ts > stats.timeRange.latest) {
        stats.timeRange.latest = ts;
      }
    }
    
    stats.successRate = events.length > 0 ? successCount / events.length : 0;
    stats.avgDuration = durationCount > 0 ? durationSum / durationCount : 0;
    stats.timeRange.earliest = stats.timeRange.earliest ? new Date(stats.timeRange.earliest).toISOString() : null;
    stats.timeRange.latest = stats.timeRange.latest ? new Date(stats.timeRange.latest).toISOString() : null;
    
    return stats;
  }

  /**
   * Export events for kaaroSessions ingestion
   */
  async exportForKaaroSessions(outputPath, filter = {}) {
    const events = await this.query(filter);
    const { writeFileSync } = await import('fs');
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      eventCount: events.length,
      events
    };
    
    writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    console.log(`📤 Exported ${events.length} events to ${outputPath}`);
    
    return exportData;
  }

  /**
   * Stop auto-flush timer
   */
  stop() {
    if (this.autoFlushTimer) {
      clearInterval(this.autoFlushTimer);
      this.autoFlushTimer = null;
    }
    this.flush(); // Final flush
  }
}

// Global singleton
let globalAuditBus = null;

export function getAuditBus(options) {
  if (!globalAuditBus) {
    globalAuditBus = new AuditBus(options);
  }
  return globalAuditBus;
}

export function emitEvent(event) {
  const bus = getAuditBus();
  bus.emit(event);
}