# Agent Loops Architecture — Orchestrator + Agent Sessions

> **Status:** Design Document — Implementation Ready  
> **Date:** 2026-06-17  
> **Authority:** This doc defines how Alone-Time and Dream Loop execute as **harness-backed agentic sessions**, not single LLM calls.

---

## Core Concept: Two-Layer Execution Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR (Deterministic Skeleton)                │
│  scripts/alone-time.mjs  |  scripts/dream-loop.mjs                         │
│  - File I/O, git, gates, locking, checkpointing, scheduling                │
│  - Zero LLM calls. Pure TypeScript/Node.                                    │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ spawns
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT SESSION (Harness-Backed, Multi-Turn)               │
│  pi coding agent session with full tool access                              │
│  - Multiple LLM calls in an agent loop                                      │
│  - Tool use: read, write, edit, bash, grep, task, etc.                      │
│  - Can run sub-agents, delegate, iterate until done                         │
│  - Context: prompt template + injected runtime context                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Distinction:** The orchestrator doesn't call an LLM directly. It **launches a full agent session** (pi harness) that runs until the task is complete, then returns control to the orchestrator for gating/commit/handoff.

---

## Alone-Time Orchestrator (`scripts/alone-time.mjs`)

```typescript
#!/usr/bin/env node
// scripts/alone-time.mjs
// Deterministic orchestrator for Alone-Time loop

import { acquireLock, releaseLock } from './lib/lock.mjs';
import { loadCheckpoint, saveCheckpoint, clearCheckpoint } from './lib/checkpoint.mjs';
import { runAgentSession } from './lib/agent-session.mjs';
import { runGates } from './lib/gates.mjs';
import { writeHandoff, updateQueue, appendJournal } from './lib/artifacts.mjs';

interface AloneTimeConfig {
  resume?: boolean;
  humanPresent?: boolean;
  maxAgentTurns?: number;
}

async function main(config: AloneTimeConfig) {
  const runId = `alone-time-${new Date().toISOString().split('T')[0]}`;
  const lock = await acquireLock('.alone-time.lock', runId);
  if (!lock) {
    console.error('Another Alone-Time run in progress');
    process.exit(1);
  }

  try {
    // 1. LOAD CHECKPOINT (for resume)
    let checkpoint = config.resume ? await loadCheckpoint('.alone-time-checkpoint.json') : null;
    let phase = checkpoint?.phase || 'INGEST';

    // 2. INGEST PHASE
    if (phase === 'INGEST') {
      const context = await ingestContext();
      await saveCheckpoint({ phase: 'SELECT', context, runId });
      phase = 'SELECT';
    }

    // 3. SELECT PHASE - Agent Session for task selection + planning
    if (phase === 'SELECT') {
      const { context } = await loadCheckpoint('.alone-time-checkpoint.json');
      const agentResult = await runAgentSession({
        promptTemplate: '.claude/prompts/alone-time-select.md',
        context: { ...context, humanPresent: config.humanPresent },
        maxTurns: config.maxAgentTurns || 10,
        allowedTools: ['read', 'bash', 'grep', 'task'], // no write/edit in SELECT
      });
      
      const { taskId, taskType, plan, modality } = parseAgentOutput(agentResult);
      
      if (modality === 'HITL' && !config.humanPresent) {
        // Skip HITL tasks when human absent - select next autonomous
        await appendJournal({ observation: `Skipped HITL task ${taskId} (human absent)` });
        // Re-run SELECT with updated queue
        return main({ ...config, resume: true }); // tail recursion via checkpoint
      }

      await saveCheckpoint({ phase: 'MUTATE', context, taskId, taskType, plan });
      phase = 'MUTATE';
    }

    // 4. MUTATE PHASE - Agent Session executes the plan
    if (phase === 'MUTATE') {
      const { context, taskId, taskType, plan } = await loadCheckpoint('.alone-time-checkpoint.json');
      
      const agentResult = await runAgentSession({
        promptTemplate: `.claude/prompts/alone-time-${taskType.toLowerCase()}.md`,
        context: { ...context, taskId, taskType, plan },
        maxTurns: config.maxAgentTurns || 30,
        allowedTools: 'all', // full tool access for mutation
      });

      const { changes, gateResults, handoffNotes } = parseAgentOutput(agentResult);
      
      await saveCheckpoint({ phase: 'GATE', context, taskId, changes, gateResults, handoffNotes });
      phase = 'GATE';
    }

    // 5. GATE PHASE - Deterministic validation
    if (phase === 'GATE') {
      const { changes, gateResults } = await loadCheckpoint('.alone-time-checkpoint.json');
      const gateResult = await runGates(changes); // validator + tests
      
      if (!gateResult.passed) {
        await appendJournal({ 
          observation: `Gate failed for ${taskId}`, 
          details: gateResult,
          action: 'requeue'
        });
        await releaseLock(lock);
        process.exit(1); // orchestrator exits, human/agent reviews handoff
      }

      await saveCheckpoint({ phase: 'COMMIT', ... });
      phase = 'COMMIT';
    }

    // 6. COMMIT + HANDOFF + QUEUE UPDATE + JOURNAL
    if (phase === 'COMMIT') {
      const { changes, taskId, handoffNotes } = await loadCheckpoint('.alone-time-checkpoint.json');
      
      await gitCommit(changes, `alone-time: ${taskId} — ${handoffNotes.summary}`);
      await writeHandoff(runId, { taskId, changes, gateResults, handoffNotes });
      await updateQueue(taskId, 'complete');
      await appendJournal({ observation: handoffNotes.journalEntry });
      
      await clearCheckpoint('.alone-time-checkpoint.json');
      console.log(`✅ Alone-Time ${runId} complete`);
    }

  } finally {
    await releaseLock(lock);
  }
}

async function ingestContext() {
  return {
    health: await readJSON('health.json'),
    queue: await readMarkdownTable('library/handoffs/work-queue.md', 'Queue'),
    threads: await readMarkdownTable('library/handoffs/work-queue.md', 'Active Threads'),
    strategy: await readFile('STRATEGY.md'),
    lastHandoff: await readLatestHandoff('alone-time'),
    journal: await readLastNEntries('library/handoffs/garden-journal.md', 5),
  };
}

main(parseArgs(process.argv.slice(2)));
```

---

## Dream Loop Orchestrator (`scripts/dream-loop.mjs`)

```typescript
#!/usr/bin/env node
// scripts/dream-loop.mjs
// Deterministic orchestrator for Dream Loop

import { acquireLock, releaseLock } from './lib/lock.mjs';
import { runAgentSession } from './lib/agent-session.mjs';
import { runGates } from './lib/gates.mjs';

async function main() {
  const runId = `dream-loop-${new Date().toISOString().split('T')[0]}`;
  const lock = await acquireLock('.dream-loop.lock', runId);
  if (!lock) { process.exit(1); }

  try {
    // 1. INGEST: Last 10 handoffs + genesis.md + garden-journal.md
    const context = await ingestDreamContext();

    // 2. PATTERN ANALYSIS - Agent Session
    const analysis = await runAgentSession({
      promptTemplate: '.claude/prompts/dream-loop-analyze.md',
      context,
      maxTurns: 15,
      allowedTools: ['read', 'grep', 'task'],
    });

    // 3. PROPOSAL GENERATION - Agent Session
    const proposals = await runAgentSession({
      promptTemplate: '.claude/prompts/dream-loop-propose.md',
      context: { ...context, analysis },
      maxTurns: 10,
      allowedTools: ['read', 'write', 'edit'], // writes proposal file
    });

    // 4. HUMAN ONTOLOGY_REVIEW - Pause for human
    const proposalFile = `.claude/proposals/ontology-${runId}.md`;
    await writeFile(proposalFile, proposals);
    
    console.log(`📋 Proposal written to ${proposalFile}`);
    console.log('⏸ Waiting for human ONTOLOGY_REVIEW...');
    console.log('Run `node scripts/dream-loop.mjs --approve` after review');
    
    // Exit here - human reviews, edits, then re-runs with --approve
    await releaseLock(lock);
    process.exit(0);

  } catch (e) {
    await releaseLock(lock);
    throw e;
  }
}

// --approve path: human has reviewed and approved
async function approvePath() {
  const lock = await acquireLock('.dream-loop.lock', 'approve');
  
  // 5. ATOMIC UPDATE - Apply proposals to 3 artifacts
  const proposals = await readFile('.claude/proposals/ontology-*.md');
  await runAgentSession({
    promptTemplate: '.claude/prompts/dream-loop-apply.md',
    context: { proposals },
    maxTurns: 20,
    allowedTools: ['read', 'write', 'edit'],
  });

  // 6. GENERATIONAL GATE - All library entries + tests
  const gateResult = await runGates({ fullRegression: true });
  if (!gateResult.passed) {
    console.error('❌ Generational gate failed - rolling back');
    await gitRollback();
    process.exit(1);
  }

  // 7. COMMIT + GENERATIONS.md + VERSION TAG
  await gitCommitAll(`dream-loop: ontology extension — ${proposals.summary}`);
  await updateGenerationsMD(proposals);
  await gitTag(`v${proposals.version}`);

  await releaseLock(lock);
  console.log(`✅ Dream Loop complete — ${proposals.version}`);
}

main(process.argv.includes('--approve') ? approvePath() : main());
```

---

## Agent Session Library (`scripts/lib/agent-session.mjs`)

```typescript
// scripts/lib/agent-session.mjs
// Spawns a pi coding agent session with prompt + context
// Returns structured output when agent signals completion

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';

interface AgentSessionConfig {
  promptTemplate: string;        // Path to .md prompt template
  context: Record<string, any>;  // Injected context variables
  maxTurns: number;              // Safety limit
  allowedTools: string[] | 'all'; // Tool allowlist
  workingDir?: string;
}

interface AgentResult {
  success: boolean;
  output: string;           // Full agent transcript
  structuredOutput?: any;  // Parsed JSON from agent's final message
  turnsUsed: number;
  error?: string;
}

/**
 * Launch a pi agent session with the given prompt template and context.
 * The agent runs until it emits a completion signal or maxTurns reached.
 */
export async function runAgentSession(config: AgentSessionConfig): Promise<AgentResult> {
  const { promptTemplate, context, maxTurns, allowedTools, workingDir } = config;
  
  // 1. Read and render prompt template with context
  const prompt = renderPrompt(promptTemplate, context);
  
  // 2. Write prompt to temp file for agent consumption
  const promptFile = `/tmp/agent-prompt-${Date.now()}.md`;
  writeFileSync(promptFile, prompt);
  
  // 3. Build agent invocation command
  // Uses pi's CLI to start a session with the prompt as initial context
  // The agent has full tool access (filtered by allowedTools)
  const args = [
    'run',                          // pi subcommand
    '--prompt', promptFile,         // Initial prompt
    '--max-turns', String(maxTurns),
    '--tools', allowedTools === 'all' ? '*' : allowedTools.join(','),
    '--output-format', 'json',      // Structured output on completion
    '--session-id', `alone-time-${Date.now()}`,
  ];
  
  if (workingDir) args.push('--cwd', workingDir);
  
  // 4. Spawn pi agent process
  return new Promise((resolve) => {
    const child = spawn('pi', args, { 
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workingDir || process.cwd(),
      env: { ...process.env, PI_AGENT_MODE: 'autonomous' }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, output: stdout + stderr, turnsUsed: 0, error: stderr });
        return;
      }
      
      // Parse structured output from agent's final JSON emission
      const structuredOutput = parseAgentStructuredOutput(stdout);
      resolve({ success: true, output: stdout, structuredOutput, turnsUsed: countTurns(stdout) });
    });
    
    // Timeout safety
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ success: false, output: stdout, turnsUsed: maxTurns, error: 'timeout' });
    }, 5 * 60 * 1000); // 5 min max
  });
}

function renderPrompt(templatePath: string, context: Record<string, any>): string {
  let template = readFileSync(templatePath, 'utf-8');
  // Simple {{variable}} replacement
  for (const [key, value] of Object.entries(context)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    template = template.replace(placeholder, JSON.stringify(value, null, 2));
  }
  return template;
}

function parseAgentStructuredOutput(transcript: string): any {
  // Agent emits JSON wrapped in ```json ... ``` on completion
  const match = transcript.match(/```json\n([\s\S]*?)\n```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { return null; }
  }
  return null;
}

function countTurns(transcript: string): number {
  return (transcript.match(/^Turn \d+/gm) || []).length;
}
```

---

## Prompt Templates Structure (`.claude/prompts/`)

```
.claude/prompts/
├── alone-time-select.md          # Task selection + planning (read-only tools)
├── alone-time-improve_pipeline.md # Pipeline mutation (full tools)
├── alone-time-detect_ontology_gaps.md # Gap scanning (read + grep)
├── alone-time-optimize_compute.md    # Layout/perf prototypes (full tools)
├── alone-time-innovate.md          # New capability prototypes (full tools)
├── alone-time-synthesize.md        # Cross-entry analysis (read-only)
├── alone-time-monitor.md           # Health check + eval poll (bash)
├── alone-time-curate_source.md     # Source file organization (full tools)
├── dream-loop-analyze.md           # Pattern detection (read + grep)
├── dream-loop-propose.md           # Ontology proposal generation (write)
├── dream-loop-apply.md             # Atomic update to 3 artifacts (full tools)
```

### Example: `alone-time-select.md`

```markdown
# Alone-Time: SELECT Phase Prompt

## Role
You are the Alone-Time Gardener. Select the next autonomous task and create an execution plan.

## Context (injected)
{{health}}
{{queue}}
{{threads}}
{{strategy}}
{{lastHandoff}}
{{journal}}
{{humanPresent}}

## Modality Rules (CRITICAL)
- **Autonomous tasks only** — You improve machinery (pipeline, ontology, compute)
- **Never VISUALIZE** — Human runs `/visualize` for library entries
- **Skip HITL tasks** if humanPresent === false

## Task Types You Can Execute
| Type | Description | Output Artifacts |
|---|---|---|
| IMPROVE_PIPELINE | Fix/enhance encoding pipeline, validator, gates | pipeline/*, .claude/hooks/* |
| DETECT_ONTOLOGY_GAPS | Scan handoffs/validator → propose missing types/rels | .claude/proposals/ontology-gaps.md |
| OPTIMIZE_COMPUTE | Prototype layout, rendering, search improvements | canvas/*, benchmarks/ |
| INNOVATE | New capability: clustering, causal inference, etc. | prototypes/*, docs/ |
| SYNTHESIZE | Read-only cross-entry analysis | analysis/*.md |
| MONITOR | Run health check, poll evals, detect regressions | health.json, alerts |
| CURATE_SOURCE | Organize source .md files (no encoding) | library/*.md |

## Output Format (JSON only, emitted at completion)
```json
{
  "taskId": "T-004",
  "taskType": "IMPROVE_PIPELINE",
  "modality": "Autonomous",
  "plan": [
    "Add density ≥2.0 pre-check to /visualize skill",
    "Test gate on pkm-engineering-prompt (current density 1.47)"
  ],
  "estimatedTurns": 8,
  "rationale": "Pipeline improvement prevents future low-density entries — highest leverage"
}
```
```

### Example: `dream-loop-analyze.md`

```markdown
# Dream Loop: ANALYZE Phase Prompt

## Role
You are the Dream Loop Meta-Agent. Detect recurring signals from handoffs and journal.

## Context (injected)
{{handoffs}}        // Last 10 alone-time + dream-loop handoffs
{{genesis}}         // genesis.md
{{journal}}         // Last 20 garden-journal entries

## Signal Categories
1. **Encoder Habit** — Same mistake repeated across VISUALIZE runs
2. **Missing Ontology** — Type/rel not in VALID_TYPES/VALID_RELS but used ≥3×
3. **SOP Blind Spot** — Encoder confusion not covered in sop-reference.md
4. **Compression Artifact** — Information lost in 3-pass encoding
5. **Stagnation** — Density/climax/insights not improving over 5+ runs

## Output Format (JSON only)
```json
{
  "patterns": [
    {
      "category": "Missing Ontology",
      "signal": "type 'framework' used in 12 nodes across 4 entries",
      "count": 12,
      "entries": ["pkm-engineering-prompt", "esp-ecosystem", "..."],
      "severity": "high"
    },
    {
      "category": "Encoder Habit",
      "signal": "report_card.protagonists references non-existent nodes",
      "count": 5,
      "entries": [...],
      "severity": "high"
    }
  ],
  "recommendation": "PROPOSE_ONTOLOGY_EXTENSION",
  "proposalPreview": {
    "types": ["framework", "prompt", "process", "system", "tool"],
    "rels": ["enforces", "transforms", "creates", "maps_to", "visualizes", "renders"]
  }
}
```
```

---

## Checkpoint Format (`.alone-time-checkpoint.json`)

```json
{
  "runId": "alone-time-2026-06-17",
  "phase": "MUTATE",
  "startedAt": "2026-06-17T02:00:00Z",
  "lastUpdated": "2026-06-17T02:15:00Z",
  "context": { /* ingested context */ },
  "taskId": "T-004",
  "taskType": "IMPROVE_PIPELINE",
  "plan": [...],
  "completedSteps": ["edit pipeline/visualize-skill.md"],
  "agentTurnsUsed": 12
}
```

---

## Lock Files

| Lock File | Purpose | TTL |
|---|---|---|
| `.alone-time.lock` | Prevent concurrent Alone-Time runs | Released on exit |
| `.dream-loop.lock` | Prevent concurrent Dream Loops | Released on exit |
| `.alone-time-checkpoint.json` | Resume state | Cleared on completion |

---

## Invocation Commands

```bash
# Alone-Time: nightly cron (no human)
0 2 * * * cd /path/to/kaaroViewer && node scripts/alone-time.mjs --resume >> logs/alone-time.log 2>&1

# Alone-Time: manual with human present (drains HITL queue too)
node scripts/alone-time.mjs --human-present=true

# Alone-Time: resume from crash
node scripts/alone-time.mjs --resume

# Dream Loop: weekly cron (analysis only - pauses for human)
0 3 * * 0 cd /path/to/kaaroViewer && node scripts/dream-loop.mjs >> logs/dream-loop.log 2>&1

# Dream Loop: human approves proposal, then applies
node scripts/dream-loop.mjs --approve
```

---

## Integration with pi Harness

The `runAgentSession` function uses **pi's CLI** to launch a full agent session:

```bash
# What the orchestrator effectively runs:
pi run \
  --prompt /tmp/agent-prompt-123.md \
  --max-turns 30 \
  --tools read,write,edit,bash,grep,task \
  --output-format json \
  --session-id alone-time-456 \
  --cwd /path/to/kaaroViewer
```

**pi Agent Session provides:**
- Multi-turn reasoning loop
- All tool access (read, write, edit, bash, grep, task, etc.)
- Sub-agent delegation (`task` tool)
- Context window management
- Structured JSON output on completion
- Turn limiting and timeout safety

---

## Evolution Path

| Phase | Implementation |
|---|---|
| **v1 (Now)** | Two orchestrator scripts + prompt templates + pi CLI sessions |
| **v2** | GitHub Actions workflow for scheduled runs |
| **v3** | Webhook-triggered runs (GitHub Issue labeled `alone-time`) |
| **v4** | In-browser dashboard for monitoring agent sessions |
| **v5** | Self-modifying prompt templates (Dream Loop updates alone-time prompts) |

---

## Summary: What Gets Written Where

| File | Written By | Purpose |
|---|---|---|
| `scripts/alone-time.mjs` | Human (once) | Orchestrator skeleton |
| `scripts/dream-loop.mjs` | Human (once) | Orchestrator skeleton |
| `scripts/lib/agent-session.mjs` | Human (once) | pi session launcher |
| `.claude/prompts/alone-time-*.md` | Human + Dream Loop | Gardener brain (evolvable) |
| `.claude/prompts/dream-loop-*.md` | Human + Dream Loop | Meta-agent brain (evolvable) |
| `.alone-time-checkpoint.json` | Orchestrator (auto) | Resume state |
| `.alone-time.lock` / `.dream-loop.lock` | Orchestrator (auto) | Concurrency control |
| `library/handoffs/alone-time-*.md` | Agent Session (via orchestrator) | Run record |
| `library/handoffs/dream-loop-*.md` | Agent Session (via orchestrator) | Meta-run record |

**The orchestrator is immutable infrastructure. The prompts are the evolvable genome.**