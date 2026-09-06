/**
 * Context Service — Unified Context Ingestion
 * 
 * Single source of truth for all orchestrator context ingestion.
 * Eliminates duplication between Alone-Time, Dream Loop, Health Check.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve as pathResolve } from 'path';
import { getLatestHandoff, readLastJournalEntries } from './artifacts.mjs';

export class ContextService {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
  }

  // ===== CORE INGESTION METHODS =====

  /**
   * Ingest context for Alone-Time orchestrator
   */
  async ingestForAloneTime() {
    const [health, queue, threads, strategy, lastHandoff, journal, evals, metrics] = await Promise.all([
      this.readHealth(),
      this.readQueue(),
      this.readThreads(),
      this.readStrategy(),
      this.readLastHandoff('alone-time'),
      this.readJournal(5),
      this.readEvals(),
      this.readMetrics()
    ]);

    return {
      health,
      queue,
      threads,
      strategy,
      lastHandoff,
      journal,
      evals,
      metrics,
      ingestedAt: new Date().toISOString()
    };
  }

  /**
   * Ingest context for Dream Loop orchestrator
   */
  async ingestForDreamLoop() {
    const [handoffs, genesis, journal, library, proposals, health] = await Promise.all([
      this.readRecentHandoffs(10),
      this.readGenesis(),
      this.readJournal(20),
      this.readLibraryIndex(),
      this.readProposals(),
      this.readHealth()
    ]);

    return {
      handoffs,
      genesis,
      journal,
      library,
      proposals,
      health,
      ingestedAt: new Date().toISOString()
    };
  }

  /**
   * Ingest context for Health Check
   */
  async ingestForHealthCheck() {
    const [library, evals, metrics, git] = await Promise.all([
      this.readLibraryIndex(),
      this.readEvals(),
      this.readMetrics(),
      this.readGitMetrics()
    ]);

    return {
      library,
      evals,
      metrics,
      git,
      ingestedAt: new Date().toISOString()
    };
  }

  /**
   * Ingest context for Scheduler decisions
   */
  async ingestForScheduler() {
    const [health, queue, threads, journal] = await Promise.all([
      this.readHealth(),
      this.readQueue(),
      this.readThreads(),
      this.readJournal(3)
    ]);

    return {
      health,
      queue,
      threads,
      journal,
      ingestedAt: new Date().toISOString()
    };
  }

  // ===== LOW-LEVEL READERS =====

  async readHealth() {
    const path = pathResolve(this.cwd, 'health.json');
    if (!existsSync(path)) return { generated: null, library: [], counts: {} };
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  async readQueue() {
    const content = await this.readFile('library/handoffs/work-queue.md');
    return this.parseMarkdownTable(content, 'Queue');
  }

  async readThreads() {
    const content = await this.readFile('library/handoffs/work-queue.md');
    return this.parseMarkdownTable(content, 'Active Threads');
  }

  async readStrategy() {
    return await this.readFile('STRATEGY.md');
  }

  async readGenesis() {
    return await this.readFile('genesis.md');
  }

  async readJournal(n = 5) {
    return await readLastJournalEntries(n);
  }

  async readEvals() {
    // TODO: Implement when eval polling is active
    return { available: false, issues: [] };
  }

  async readMetrics() {
    // TODO: Implement metrics aggregation
    return {};
  }

  async readGitMetrics() {
    const { stdout } = await this.runCommandCapture('git', ['log', '--oneline', '-20']);
    const commits = stdout.trim().split('\n').filter(Boolean);
    return {
      recentCommits: commits.length,
      lastCommit: commits[0] || null
    };
  }

  async readLibraryIndex() {
    const libraryDir = pathResolve(this.cwd, 'library');
    if (!existsSync(libraryDir)) return [];
    
    const files = readdirSync(libraryDir)
      .filter(f => f.endsWith('.json') && !f.includes('-retrospective'))
      .map(f => {
        try {
          const content = readFileSync(pathResolve(libraryDir, f), 'utf-8');
          const data = JSON.parse(content);
          return {
            id: data.meta?.id || f.replace('.json', ''),
            title: data.meta?.title || 'Unknown',
            domain: data.meta?.domain || 'Unknown',
            year: data.meta?.year || 'Unknown',
            nodes: data.nodes?.length || 0,
            edges: data.edges?.length || 0,
            density: data.nodes?.length ? (data.edges?.length || 0) / data.nodes.length : 0,
            beats: data.story?.length || 0,
            insights: data.insights?.length || 0,
            clusters: data.clusters?.length || 0,
            file: f
          };
        } catch (e) {
          return { file: f, error: e.message };
        }
      });
    
    return files;
  }

  async readProposals() {
    const propDir = pathResolve(this.cwd, '.claude/proposals');
    if (!existsSync(propDir)) return [];
    
    return readdirSync(propDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const content = readFileSync(pathResolve(propDir, f), 'utf-8');
        return { file: f, content: content.slice(0, 2000) }; // Truncate for context
      });
  }

  async readLastHandoff(prefix) {
    return await getLatestHandoff(prefix);
  }

  async readRecentHandoffs(n = 10) {
    const handoffDir = pathResolve(this.cwd, 'library/handoffs');
    if (!existsSync(handoffDir)) return [];
    
    const files = readdirSync(handoffDir)
      .filter(f => (f.startsWith('alone-time') || f.startsWith('dream-loop')) && f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, n);
    
    const handoffs = [];
    for (const file of files) {
      const content = readFileSync(pathResolve(handoffDir, file), 'utf-8');
      handoffs.push({ file, content: content.slice(0, 3000) }); // Truncate
    }
    return handoffs;
  }

  async readFile(relativePath) {
    const fullPath = pathResolve(this.cwd, relativePath);
    if (!existsSync(fullPath)) return '';
    return readFileSync(fullPath, 'utf-8');
  }

  parseMarkdownTable(content, sectionName) {
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

  async runCommandCapture(cmd, args) {
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());
      child.on('close', code => resolve({ stdout, stderr, code }));
      child.on('error', reject);
    });
  }
}