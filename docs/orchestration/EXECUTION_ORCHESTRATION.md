# Execution Orchestration Plan

## For: Alone-Time, HITL, Dream Loop & Compute Cycles

**Status**: Design — ready for implementation  
**Context**: Post-v3 cleanup, agent loops architecture operational, kaaroSessions observability live

---

## Executive Summary

The current Alone-Time orchestrator works but has critical pipeline breaks:
- **10-minute hard timeout** on LLM calls (Nemotron-3-Ultra via Nebius)
- **No scheduling** — manual invocation only
- **No observability** — logs to stdout only, no session graph
- **No model fallback** — single provider, no retry/alternative
- **HITL coordination** is ad-hoc (flag `--human-present`)

This document designs a **production-grade orchestration layer** that:
1. **Schedules** Alone-Time runs (cron + trigger-based)
2. **Manages LLM invocations** with timeouts, retries, fallbacks, model selection
3. **Coordinates HITL** via work-queue polling + human availability signals
4. **Gates Dream Loop** with generational integrity
5. **Emits kaaroSessions events** for full audit trail

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        EXECUTION ORCHESTRATION LAYER                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   SCHEDULER  │    │  LLM GATEWAY │    │  STATE STORE │    │   AUDIT BUS  │  │
│  │              │    │              │    │              │    │              │  │
│  │ • cron       │    │ • timeout    │    │ • checkpoints│    │ • event log  │  │
│  │ • triggers   │    │ • retries    │    │ • queue      │    │ • kaaroSesh  │  │
│  │ • backoff    │    │ • fallback   │    │ • locks      │    │ • metrics    │  │
│  │ • precedence │    │ • model sel  │    │ • journal    │    │ • traces     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │                   │          │
│         └───────────────────┼───────────────────┼───────────────────┘          │
│                             ▼                   ▼                              │
│                    ┌──────────────────────────────────────────┐               │
│                    │         ORCHESTRATOR CORE                 │               │
│                    │                                           │               │
│                    │  Alone-Time  │  HITL Coordinator  │ ...  │               │
│                    │  Dream Loop  │  Health Monitor    │      │               │
│                    │                                           │               │
│                    └──────────────────────────────────────────┘               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. SCHEDULER — Autonomous Run Orchestration

### 1.1 Run Triggers

| Trigger Type | Condition | Priority | Example |
|---|---|---|---|
| **Scheduled** | Cron (daily 02:00 UTC) | Low | Nightly health sweep |
| **Queue Pressure** | ≥3 autonomous tasks Ready | Medium | T-006, T-007, T-008 queued |
| **Signal Spike** | Same validator warning 3× across entries | High | Dream Loop trigger |
| **Critical Entry** | New entry with validator exit 2 | Critical | HITL VISUALIZE needed |
| **Manual** | `npm run alone-time` | User | Human initiates |

### 1.2 Scheduler Implementation

```javascript
// scripts/scheduler.mjs
export class AloneTimeScheduler {
  constructor(config) {
    this.config = {
      cronExpression: '0 2 * * *',           // Daily 02:00 UTC
      maxConcurrentRuns: 1,
      queuePressureThreshold: 3,
      signalSpikeThreshold: 3,
      ...config
    };
    this.running = false;
  }

  async start() {
    // Cron job
    this.cronJob = cron.schedule(this.config.cronExpression, () => this.maybeRun('scheduled'));
    
    // File watcher for trigger files
    this.watcher = chokidar.watch('.alone-time-triggers/', { persistent: true });
    this.watcher.on('add', (path) => this.handleTrigger(path));
    
    // Health check poller (every 15 min)
    this.healthInterval = setInterval(() => this.checkHealthPressure(), 15 * 60 * 1000);
  }

  async maybeRun(trigger) {
    if (this.running) return { skipped: true, reason: 'already running' };
    
    const context = await this.ingestContext();
    const decision = this.selectTask(context);
    
    if (decision.action === 'IDLE') {
      await this.logIdle(trigger, context);
      return { action: 'idle' };
    }
    
    return this.executeRun(decision.task, trigger);
  }

  selectTask(context) {
    // 1. Critical entries → HITL (if human present)
    if (context.health.critical.length > 0 && context.humanPresent) {
      return { action: 'RUN', task: context.health.critical[0], modality: 'HITL' };
    }
    
    // 2. Autonomous queue pressure
    const autonomousReady = context.queue.filter(t => 
      t.modality === '🤖 Autonomous' && t.status === 'Ready'
    );
    if (autonomousReady.length >= this.config.queuePressureThreshold) {
      return { action: 'RUN', task: autonomousReady[0], modality: 'AUTONOMOUS' };
    }
    
    // 3. Signal spike → Dream Loop
    if (this.detectSignalSpike(context)) {
      return { action: 'DREAM_LOOP', reason: 'signal spike detected' };
    }
    
    return { action: 'IDLE' };
  }
}
```

### 1.3 Run Precedence Rules

```
Priority 1 (Critical):  HITL VISUALIZE on critical entries (human present)
Priority 2 (High):      Dream Loop (signal spike 3×)
Priority 3 (Medium):    Autonomous queue pressure (≥3 ready)
Priority 4 (Low):       Scheduled cron (health sweep)
Priority 5 (Background): Idle → journal observation
```

---

## 2. LLM GATEWAY — Agent Harness Interface

### 2.1 Problem Statement

Current `runAgentSession()` in `scripts/lib/agent-session.mjs`:
- Spawns `pi run --print` with **10-minute hard timeout**
- Single model: `nebius/nvidia/Nemotron-3-Ultra-550b-a55b`
- No retry, no fallback, no model selection by task type
- No structured observability (just stdout)

### 2.2 Gateway Design

```javascript
// scripts/lib/llm-gateway.mjs
export class LLMGateway {
  constructor(config) {
    this.models = {
      // Fast models for SELECT/quick tasks
      fast: [
        { provider: 'google', model: 'gemini-1.5-flash', timeout: 60000, maxTokens: 8192 },
        { provider: 'anthropic', model: 'claude-3.5-haiku', timeout: 90000, maxTokens: 8192 },
      ],
      // Smart models for MUTATE/complex tasks
      smart: [
        { provider: 'nebius', model: 'nvidia/Nemotron-3-Ultra-550b-a55b', timeout: 300000, maxTokens: 32768 },
        { provider: 'anthropic', model: 'claude-3.5-sonnet', timeout: 300000, maxTokens: 8192 },
      ],
      // Reasoning models for DETECT_ONTOLOGY_GAPS / Dream Loop
      reasoning: [
        { provider: 'openai', model: 'o1-preview', timeout: 600000, maxTokens: 32768 },
        { provider: 'nebius', model: 'nvidia/Nemotron-3-Ultra-550b-a55b', timeout: 600000, maxTokens: 32768 },
      ]
    };
    
    this.taskModelMap = {
      SELECT: 'fast',
      CURATE_SOURCE: 'fast',
      MONITOR: 'fast',
      IMPROVE_PIPELINE: 'smart',
      OPTIMIZE_COMPUTE: 'smart',
      SYNTHESIZE: 'smart',
      DETECT_ONTOLOGY_GAPS: 'reasoning',
      INNOVATE: 'reasoning',
      DREAM_LOOP_ANALYZE: 'reasoning',
      DREAM_LOOP_PROPOSE: 'reasoning',
      DREAM_LOOP_APPLY: 'smart',
    };
  }

  async invoke(taskType, promptTemplate, context, options = {}) {
    const modelTier = this.taskModelMap[taskType] || 'smart';
    const models = this.models[modelTier];
    
    const runId = `${taskType.toLowerCase()}-${Date.now().toString(36)}`;
    const startTime = Date.now();
    
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      try {
        const result = await this.invokeWithModel(model, promptTemplate, context, {
          ...options,
          runId: `${runId}-attempt${i + 1}`,
          timeout: model.timeout
        });
        
        // Emit kaaroSessions event
        await this.emitSessionEvent({
          runId,
          taskType,
          model: `${model.provider}/${model.model}`,
          attempt: i + 1,
          duration: Date.now() - startTime,
          success: result.success,
          tokensUsed: result.tokensUsed,
          error: result.error
        });
        
        if (result.success) return result;
        
        // Log failure, try next model
        console.warn(`⚠️ ${model.provider}/${model.model} failed: ${result.error}`);
        
      } catch (e) {
        console.error(`💥 ${model.provider}/${model.model} error: ${e.message}`);
      }
    }
    
    // All models failed
    throw new Error(`All ${models.length} models in tier '${modelTier}' failed for ${taskType}`);
  }

  async invokeWithModel(model, promptTemplate, context, options) {
    // Use pi with proper timeout handling
    return new Promise((resolve) => {
      const child = spawn('pi', this.buildArgs(model, promptTemplate, context, options), {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PI_AGENT_MODE: 'autonomous' }
      });
      
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false, error: `timeout after ${options.timeout}ms` });
      }, options.timeout);
      
      // ... handle stdout/stderr, parse JSON output
    });
  }
}
```

### 2.3 Model Selection by Task

| Task Type | Model Tier | Timeout | Rationale |
|---|---|---|---|
| SELECT, MONITOR, CURATE_SOURCE | **fast** (gemini-1.5-flash) | 60s | Quick triage, low complexity |
| IMPROVE_PIPELINE, OPTIMIZE_COMPUTE, SYNTHESIZE | **smart** (Nemotron, Sonnet) | 5min | Code edits, multi-file reasoning |
| DETECT_ONTOLOGY_GAPS, DREAM_LOOP_* | **reasoning** (o1-preview, Nemotron) | 10min | Deep pattern analysis, schema design |
| HITL VISUALIZE (human runs) | N/A | N/A | Human uses `/visualize` skill directly |

### 2.4 Gateway Observability (kaaroSessions Events)

```javascript
// Every LLM invocation emits:
{
  "event": "llm_invocation",
  "runId": "alone-time-2026-06-19-v6lt-select",
  "taskType": "SELECT",
  "model": "google/gemini-1.5-flash",
  "attempt": 1,
  "duration": 3421,
  "success": true,
  "tokensInput": 4521,
  "tokensOutput": 892,
  "promptHash": "sha256:...",
  "contextKeys": ["health", "queue", "threads", "strategy"]
}
```

---

## 3. ALONE-TIME ORCHESTRATOR — Hardened

### 3.1 Phase Timeout Management

```javascript
// scripts/alone-time-hardened.mjs
const PHASE_TIMEOUTS = {
  INGEST: 30000,      // 30s
  SELECT: 120000,     // 2 min (fast model)
  MUTATE: 600000,     // 10 min (smart/reasoning model)
  GATE: 180000,       // 3 min (tests + validator)
  COMMIT: 60000,      // 1 min
  IDLE: 5000          // instant
};

export class HardenedAloneTime {
  async executePhase(phase, checkpoint) {
    const timeout = PHASE_TIMEOUTS[phase] || 300000;
    
    return Promise.race([
      this.runPhase(phase, checkpoint),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Phase ${phase} timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  async runPhase(phase, checkpoint) {
    // ... existing phase logic but with LLMGateway instead of direct runAgentSession
  }
}
```

### 3.2 Checkpoint Resilience

- **Atomic writes**: Write to `.tmp` then `rename()`
- **Schema versioning**: `checkpoint.schemaVersion = 1`
- **Corruption recovery**: Validate on load, auto-repair or reset
- **Cross-run continuity**: Carry forward `runId` for traceability

### 3.3 Failure Modes & Recovery

| Failure | Detection | Recovery |
|---|---|---|
| LLM timeout | Phase timeout | Retry with next model in tier |
| LLM error (API) | Non-zero exit | Retry with next model, exponential backoff |
| Gate failure | Validator/tests fail | Journal + requeue task with `retryCount++` |
| Git conflict | Commit fails | Stash, pull, retry merge |
| Lock stale | PID dead | Force release + journal |

---

## 4. HITL COORDINATOR — Human-Machine Sync

### 4.1 Problem

Current: `--human-present` flag is binary, no persistence, no scheduling.

### 4.2 Design

```javascript
// scripts/lib/hitl-coordinator.mjs
export class HITLCoordinator {
  constructor() {
    this.availabilityFile = '.hitl-availability.json';
    this.pollInterval = 30000; // 30s
  }

  // Human runs this when available
  async signalAvailable(durationMinutes = 120) {
    const expiry = Date.now() + durationMinutes * 60 * 1000;
    writeFileSync(this.availabilityFile, JSON.stringify({
      available: true,
      since: new Date().toISOString(),
      expires: new Date(expiry).toISOString(),
      source: 'manual'
    }));
  }

  // Human runs this when leaving
  async signalUnavailable() {
    if (existsSync(this.availabilityFile)) {
      unlinkSync(this.availabilityFile);
    }
  }

  // Orchestrator calls this
  async isHumanAvailable() {
    if (!existsSync(this.availabilityFile)) return false;
    const data = JSON.parse(readFileSync(this.availabilityFile));
    if (Date.now() > new Date(data.expires).getTime()) {
      await this.signalUnavailable(); // auto-expire
      return false;
    }
    return true;
  }

  // Get HITL tasks ready for human
  async getHITLReadyTasks() {
    const queue = await this.readQueue();
    return queue.filter(t => t.modality === '👤 HITL' && t.status === 'Ready');
  }
}
```

### 4.3 Human Workflow

```bash
# Human starts work session
npm run hitl:start -- --duration 120   # 2 hours

# Human checks what's ready
npm run hitl:status

# Human runs visualize (existing skill)
/visualize library/pkm-engineering-seed.md

# Human ends session
npm run hitl:stop
```

### 4.4 HITL Task Handoff Protocol

When Alone-Time detects HITL task + human available:
1. **Pause** autonomous run at SELECT phase
2. **Write** `.hitl-handoff.json` with task details + context
3. **Signal** human (notification, terminal message)
4. **Wait** for human to complete + signal done
5. **Resume** autonomous run with updated queue

---

## 5. DREAM LOOP — Generational Gate Orchestration

### 5.1 Current Flow (Two-Phase)

```
Phase 1 (Analyze + Propose)          Phase 2 (Apply + Gate + Commit)
├── ingestDreamContext()              ├── findLatestProposal()
├── ANALYZE (agent)                   ├── APPLY (agent) 
├── PROPOSE (agent)                   ├── runGates(fullRegression)
├── writeProposalFile()               ├── git add -A + commit
├── writeDreamLoopHandoff()           ├── updateGenerationsMD()
└── PAUSE for human review            └── git tag vX.Y.Z
```

### 5.2 Hardening Requirements

| Gap | Fix |
|---|---|
| No generational gate dry-run | Add `--dry-run` to validate before commit |
| Proposal file not versioned | Store in git: `.claude/proposals/ontology-<runId>.md` |
| No rollback on gate fail | Auto `git checkout -- .` on failure |
| No schema diff | Generate `VALID_TYPES`/`VALID_RELS` diff in proposal |
| Human review not tracked | Add `reviewedBy`, `reviewedAt`, `approvalNotes` to proposal |

### 5.3 Enhanced Gate

```javascript
async function runGenerationalGate(proposals, options = {}) {
  // 1. Apply to temp branch
  await runCommand('git', ['checkout', '-b', `dream-loop-${Date.now()}`]);
  
  // 2. Agent applies proposals
  const applyResult = await llmGateway.invoke('DREAM_LOOP_APPLY', ...);
  
  // 3. Run full regression
  const gateResults = await runGates({ fullRegression: true });
  
  if (!gateResults.overall) {
    // 4. Rollback
    await runCommand('git', ['checkout', 'main']);
    await runCommand('git', ['branch', '-D', `dream-loop-*`]);
    throw new Error('Generational gate failed — rolled back');
  }
  
  // 5. Merge + tag
  await runCommand('git', ['checkout', 'main']);
  await runCommand('git', ['merge', `dream-loop-*`]);
  await runCommand('git', ['tag', '-a', `v${version}`, '-m', `Generation ${version}`]);
  
  return { success: true, version };
}
```

---

## 6. CONTEXT INGESTION — Unified

### 6.1 Current: Duplicated in Alone-Time + Dream Loop

Both `ingestContext()` and `ingestDreamContext()` read similar files.

### 6.2 Unified Context Service

```javascript
// scripts/lib/context-service.mjs
export class ContextService {
  async ingestForAloneTime() {
    return {
      health: await this.readHealth(),
      queue: await this.readQueue(),
      threads: await this.readThreads(),
      strategy: await this.readStrategy(),
      lastHandoff: await this.readLastHandoff('alone-time'),
      journal: await this.readJournal(5),
      evals: await this.readEvals(),
      metrics: await this.readMetrics()
    };
  }

  async ingestForDreamLoop() {
    return {
      handoffs: await this.readRecentHandoffs(10),
      genesis: await this.readGenesis(),
      journal: await this.readJournal(20),
      library: await this.readLibraryIndex(),
      proposals: await this.readProposals()
    };
  }

  async ingestForHealthCheck() {
    return {
      library: await this.readLibraryIndex(),
      evals: await this.readEvals(),
      metrics: await this.readMetrics(),
      git: await this.readGitMetrics()
    };
  }
}
```

---

## 7. AUDIT & OBSERVABILITY — kaaroSessions Integration

### 7.1 Event Schema

Every orchestrator action emits to `kaaroSessions` event log:

```typescript
interface OrchestrationEvent {
  event: 'run_start' | 'run_complete' | 'phase_transition' 
       | 'llm_invocation' | 'gate_result' | 'task_complete' 
       | 'dream_loop_trigger' | 'human_handoff' | 'idle';
  
  runId: string;                    // alone-time-2026-06-19-v6lt
  orchestrator: 'alone-time' | 'dream-loop' | 'scheduler' | 'hitl';
  
  timestamp: string;                // ISO 8601
  duration?: number;                // ms
  
  // Context
  taskId?: string;                  // T-004
  taskType?: string;                // IMPROVE_PIPELINE
  phase?: string;                   // SELECT, MUTATE, GATE
  
  // LLM
  model?: string;                   // google/gemini-1.5-flash
  tokensIn?: number;
  tokensOut?: number;
  
  // Outcome
  success: boolean;
  error?: string;
  
  // Artifacts
  handoffPath?: string;
  commitHash?: string;
  
  // Metrics
  libraryHealth?: {
    ok: number;
    critical: number;
    avgDensity: number;
  };
}
```

### 7.2 Event Emission

```javascript
// scripts/lib/audit-bus.mjs
export class AuditBus {
  private events: OrchestrationEvent[] = [];
  private flushInterval = 10000; // 10s
  
  emit(event: OrchestrationEvent) {
    this.events.push(event);
    // Also write to local file for crash recovery
    this.writeEventLog(event);
  }
  
  async flush() {
    if (this.events.length === 0) return;
    
    // Write to kaaroSessions format (JSONL)
    const logPath = 'library/handoffs/orchestration-events.jsonl';
    const lines = this.events.map(e => JSON.stringify(e)).join('\n') + '\n';
    await appendFile(logPath, lines);
    
    // Emit to kaaroSessions if running (SSE)
    if (this.sseConnected) {
      this.sseSend({ type: 'orchestration', events: this.events });
    }
    
    this.events = [];
  }
  
  // Query for dashboards
  async query(filter: { orchestrator?; taskType?; since?; until? }) {
    // Read from JSONL, filter, return
  }
}
```

### 7.3 kaaroSessions Dashboard Views

| View | Query | Purpose |
|---|---|---|
| **Run Timeline** | `orchestrator=alone-time` | Gantt chart of runs, phases, durations |
| **LLM Performance** | `event=llm_invocation` | Model latency, success rate, token costs |
| **Gate Health** | `event=gate_result` | Validator/test pass rates over time |
| **Task Throughput** | `event=task_complete` | Tasks completed per day, by type |
| **Dream Loop Cycles** | `orchestrator=dream-loop` | Generational progression, schema changes |
| **HITL Latency** | `event=human_handoff` | Time from task ready → human complete |

---

## 8. COMPUTE CYCLES — Beyond Alone-Time

### 8.1 Scheduled Cycles

| Cycle | Frequency | Orchestrator | Purpose |
|---|---|---|---|
| **Health Check** | Every 15 min | `scripts/health-check.mjs` | Update `health.json` |
| **Eval Poll** | Every 30 min | `scripts/eval-poller.mjs` | Fetch GitHub issues → `health.json` |
| **Metric Rollup** | Hourly | `scripts/metrics-rollup.mjs` | Aggregate kaaroSessions metrics |
| **Index Rebuild** | Daily 03:00 | `scripts/rebuild-index.mjs` | Refresh search/graph indexes |

### 8.2 Triggered Cycles

| Trigger | Cycle | Action |
|---|---|---|
| Library entry added | `rebuild-index` | Update search |
| Validator warning pattern | `detect-ontology-gaps` | Queue DETECT task |
| Critical entry detected | `hitl-alert` | Notify human |
| Dream Loop complete | `re-encode-affected` | Queue VISUALIZE for affected entries |

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1: LLM Gateway + Hardened Alone-Time (Week 1)
- [ ] `scripts/lib/llm-gateway.mjs` with model tiers, timeouts, fallbacks
- [ ] `scripts/alone-time-hardened.mjs` with phase timeouts, checkpoint resilience
- [ ] Unit tests for gateway (mock pi, test fallback chain)
- [ ] Integration test: full Alone-Time run with mocked LLM

### Phase 2: Scheduler + HITL Coordinator (Week 2)
- [ ] `scripts/scheduler.mjs` with cron + triggers
- [ ] `scripts/lib/hitl-coordinator.mjs` with availability signaling
- [ ] `npm run hitl:start/stop/status` CLI commands
- [ ] Test: HITL handoff protocol end-to-end

### Phase 3: Dream Loop Hardening (Week 3)
- [ ] Generational gate with temp branch + rollback
- [ ] Proposal versioning in git
- [ ] Schema diff generation
- [ ] Test: Full Dream Loop cycle with injected failure

### Phase 4: Audit Bus + kaaroSessions Integration (Week 4)
- [ ] `scripts/lib/audit-bus.mjs` with event emission
- [ ] JSONL event log + SSE emitter
- [ ] kaaroSessions dashboard views for orchestration
- [ ] Test: Full trace from run_start → run_complete

### Phase 5: Unified Context + Compute Cycles (Week 5)
- [ ] `scripts/lib/context-service.mjs` consolidation
- [ ] `scripts/health-check.mjs` → eval poller, metric rollup
- [ ] Triggered cycles wiring
- [ ] Load test: 7 days simulated runs

---

## 10. OPERATIONAL COMMANDS

```bash
# Scheduler
npm run scheduler:start          # Start background scheduler
npm run scheduler:stop           # Stop scheduler
npm run scheduler:status         # Show next run, queue state

# Alone-Time (manual)
npm run alone-time               # Single run (uses gateway)
npm run alone-time:resume        # Resume from checkpoint
npm run alone-time:force         # Force lock release + run

# HITL
npm run hitl:start -- --duration 120   # Signal availability (2hr)
npm run hitl:stop                      # Signal unavailable
npm run hitl:status                    # Show ready HITL tasks
npm run hitl:handoff                   # Show current handoff details

# Dream Loop
npm run dream-loop                 # Phase 1: analyze + propose
npm run dream-loop:approve         # Phase 2: apply + gate + commit
npm run dream-loop:dry-run         # Validate proposals without commit

# Health/Metrics
npm run health                     # Summary
npm run health:json                # Full JSON for dashboards
npm run metrics:rollup             # Hourly aggregation

# Audit
npm run audit:query -- --since 2026-06-19 --orchestrator alone-time
npm run audit:export -- --format jsonl --output orchestration.jsonl
```

---

## 11. SUCCESS METRICS

| Metric | Target | Measurement |
|---|---|---|
| **Alone-Time success rate** | ≥ 95% | `audit:query` success/complete |
| **LLM gateway fallback rate** | < 5% | `audit:query` event=llm_invocation |
| **Phase timeout rate** | < 1% | Phase timeout / total phases |
| **HITL task latency** | < 4 hrs (when human available) | hitl_handoff → hitl_complete |
| **Dream Loop cycle time** | < 3 Alone-Time runs | handoff dates |
| **Generational gate pass rate** | 100% | Gate failures = 0 |
| **kaaroSessions event latency** | < 5s | Event timestamp → SSE delivery |

---

## 12. RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM provider outage | Medium | High | 3-model fallback per tier |
| Checkpoint corruption | Low | High | Schema validation + auto-repair |
| Human never available for HITL | Medium | Medium | Auto-escalate to Dream Loop after 48h |
| Generational gate false negative | Low | Critical | Dry-run mode, manual override |
| kaaroSessions SSE disconnect | Medium | Low | Local JSONL buffer, replay on reconnect |
| Scheduler drift (cron overlap) | Low | Medium | Lock file + maxConcurrentRuns=1 |

---

## Appendix: File Map

```
scripts/
├── scheduler.mjs              # Cron + trigger scheduler
├── alone-time-hardened.mjs    # Production Alone-Time
├── dream-loop-hardened.mjs    # Production Dream Loop
├── health-check.mjs           # Enhanced health check
├── eval-poller.mjs            # GitHub eval polling
├── metrics-rollup.mjs         # Hourly metrics aggregation
├── rebuild-index.mjs          # Search/graph index rebuild
├── lib/
│   ├── llm-gateway.mjs        # LLM invocation with fallbacks
│   ├── hitl-coordinator.mjs   # Human availability + handoff
│   ├── context-service.mjs    # Unified context ingestion
│   ├── audit-bus.mjs          # Event emission + kaaroSessions
│   ├── lock.mjs               # File-based locking
│   ├── checkpoint.mjs         # Atomic checkpoint I/O
│   ├── artifacts.mjs          # Handoff/queue/journal I/O (existing)
│   └── gates.mjs              # Validator + test runner (existing)

.claude/prompts/
├── alone-time-*.md            # 8 task prompts (existing)
├── dream-loop-*.md            # 3 prompts (existing)
└── alone-time-select-hardened.md  # Enhanced SELECT with model awareness
```

---

*This orchestration plan transforms the current manual/fragile Alone-Time into a production-grade autonomous agent lifecycle with full observability via kaaroSessions.*