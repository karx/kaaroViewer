# Agent Harness Model Requirements Document

**Version:** 1.0  
**Date:** 2026-06-19  
**Status:** Active — feeds into `scripts/lib/llm-gateway.mjs` → `AgentHarness` integration

---

## Overview

The kaaro orchestrator (Alone-Time, Dream Loop, Scheduler) requires **three model tiers** mapped to specific task archetypes. Each tier has distinct latency, reasoning depth, context, and cost requirements. The LLM Gateway manages fallback chains within each tier.

---

## Model Tier Specifications

### TIER 1: FAST — "Selector / Curator"
**Tasks:** `SELECT`, `CURATE_SOURCE`, `MONITOR`, `EVALUATE`  
**SLA:** ≤ 90s wall time | ≤ 8k output tokens | Low cost/token

| Requirement | Spec |
|-------------|------|
| Latency (first token) | < 2s |
| Reasoning | Structured extraction, classification, ranking — no chain-of-thought needed |
| Context window | ≥ 32k input (full codebase + queue + health) |
| Output format | Strict JSON (schema-enforced) |
| Tool use | Read-only (file read, grep, glob) |
| Availability | 99.9% (multi-region) |
| Cost target | < $0.10 / 1M tokens |

**Primary Candidates:**
- `google/gemini-1.5-flash` — 1M context, 300 RPM free tier, JSON mode
- `anthropic/claude-3.5-haiku` — 200k context, fast JSON, tool use

**Fallback Chain:** gemini-1.5-flash → claude-3.5-haiku

---

### TIER 2: SMART — "Builder / Optimizer"
**Tasks:** `IMPROVE_PIPELINE`, `OPTIMIZE_COMPUTE`, `SYNTHESIZE`, `DREAM_LOOP_APPLY`  
**SLA:** ≤ 5min wall time | ≤ 32k output tokens | Medium cost

| Requirement | Spec |
|-------------|------|
| Latency (first token) | < 5s |
| Reasoning | Multi-step code modification, refactoring, architecture decisions |
| Context window | ≥ 128k (full repo + test output + specs) |
| Output format | Diff/patch + JSON summary |
| Tool use | Read + Write + Edit + Bash (full agent) |
| Availability | 99.5% |
| Cost target | < $3.00 / 1M tokens |

**Primary Candidates:**
- `nvidia/Nemotron-3-Ultra-550b-a55b` (via Nebius) — 128k context, strong coding, competitive $
- `anthropic/claude-3.5-sonnet` — 200k context, excellent diff quality, tool use

**Fallback Chain:** Nemotron-3-Ultra → claude-3.5-sonnet

---

### TIER 3: REASONING — "Architect / Scientist"
**Tasks:** `DETECT_ONTOLOGY_GAPS`, `INNOVATE`, `DREAM_LOOP_ANALYZE`, `DREAM_LOOP_PROPOSE`  
**SLA:** ≤ 10min wall time | ≤ 32k output tokens | High cost acceptable

| Requirement | Spec |
|-------------|------|
| Latency (first token) | < 30s (reasoning overhead) |
| Reasoning | Deep chain-of-thought, cross-domain synthesis, ontology design, gap detection |
| Context window | ≥ 200k (full library + validator logs + research corpus) |
| Output format | Structured proposals (Markdown + JSON) |
| Tool use | Read + Search (web/local) — no write |
| Availability | 99% (can queue) |
| Cost target | < $15.00 / 1M tokens |

**Primary Candidates:**
- `openai/o1-preview` — native reasoning, 128k output, best for novel synthesis
- `nvidia/Nemotron-3-Ultra-550b-a55b` — strong reasoning at lower cost, 128k context

**Fallback Chain:** o1-preview → Nemotron-3-Ultra

---

## Task → Tier Mapping (Canonical)

```javascript
export const TASK_MODEL_MAP = {
  // Fast tier
  SELECT: 'fast',
  CURATE_SOURCE: 'fast',
  MONITOR: 'fast',
  EVALUATE: 'fast',

  // Smart tier
  IMPROVE_PIPELINE: 'smart',
  OPTIMIZE_COMPUTE: 'smart',
  SYNTHESIZE: 'smart',
  DREAM_LOOP_APPLY: 'smart',

  // Reasoning tier
  DETECT_ONTOLOGY_GAPS: 'reasoning',
  INNOVATE: 'reasoning',
  DREAM_LOOP_ANALYZE: 'reasoning',
  DREAM_LOOP_PROPOSE: 'reasoning',
};
```

---

## Agent Harness Integration Requirements

### 1. Provider Interface
```typescript
interface ModelProvider {
  // Auth & config
  name: string;
  configure(apiKey: string, baseUrl?: string): Promise<void>;
  
  // Invocation
  invoke(params: InvocationParams): Promise<InvocationResult>;
  
  // Streaming (for SSE observability)
  stream(params: InvocationParams): AsyncIterable<StreamChunk>;
  
  // Capabilities
  getCapabilities(): ModelCapabilities;
}

interface InvocationParams {
  model: string;                    // e.g., "gemini-1.5-flash"
  prompt: string;                   // Rendered prompt
  systemPrompt?: string;
  maxTokens: number;
  temperature: number;              // 0 for structured, 0.3-0.7 for reasoning
  tools?: ToolDefinition[];         // JSON schema for function calling
  toolChoice?: 'auto' | 'required' | 'none';
  responseFormat?: 'json' | 'text'; // Force JSON mode
  timeoutMs: number;
  metadata: {
    runId: string;
    taskType: string;
    tier: 'fast' | 'smart' | 'reasoning';
    attempt: number;
  };
}

interface InvocationResult {
  success: boolean;
  content: string;
  structuredOutput?: any;           // Parsed JSON if responseFormat='json'
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  toolCalls?: ToolCall[];
}
```

### 2. Required Provider Implementations

| Provider | Models | Auth Method | Notes |
|----------|--------|-------------|-------|
| **Google** | gemini-1.5-flash, gemini-1.5-pro | API Key (Bearer) | Vertex AI compatible |
| **Anthropic** | claude-3.5-haiku, claude-3.5-sonnet, claude-3-opus | API Key (x-api-key) | Tool use native |
| **OpenAI** | o1-preview, o1-mini, gpt-4o | API Key (Bearer) | o1 = reasoning tier |
| **Nebius** | Nemotron-3-Ultra, Qwen2.5-Coder | API Key (Bearer) | OpenAI-compatible endpoint |
| **Local (Ollama/vLLM)** | Any GGUF/llama.cpp | None / local | For dev/air-gap |

### 3. Gateway Responsibilities (Already Implemented)
- ✅ Fallback chain per tier (try next on 429, 5xx, timeout, parse failure)
- ✅ Timeout enforcement per model config
- ✅ Token tracking (input/output per call)
- ✅ kaaroSessions event emission (JSONL + SSE)
- ✅ Prompt template rendering (`{{variable}}` → JSON)
- ✅ Structured output extraction (```json blocks)
- ✅ Dry-run mode (skip invocation, return mock)

---

## Configuration Schema (Agent Harness)

```json
{
  "providers": {
    "google": {
      "enabled": true,
      "apiKeyEnv": "GEMINI_API_KEY",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "models": {
        "gemini-1.5-flash": { "tier": "fast", "rpm": 300, "rpd": 1500 },
        "gemini-1.5-pro": { "tier": "smart", "rpm": 60, "rpd": 50 }
      }
    },
    "anthropic": {
      "enabled": true,
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "baseUrl": "https://api.anthropic.com/v1",
      "models": {
        "claude-3.5-haiku": { "tier": "fast", "rpm": 50 },
        "claude-3.5-sonnet": { "tier": "smart", "rpm": 50 },
        "claude-3-opus": { "tier": "reasoning", "rpm": 20 }
      }
    },
    "openai": {
      "enabled": true,
      "apiKeyEnv": "OPENAI_API_KEY",
      "baseUrl": "https://api.openai.com/v1",
      "models": {
        "o1-preview": { "tier": "reasoning", "rpm": 20 },
        "o1-mini": { "tier": "reasoning", "rpm": 50 },
        "gpt-4o": { "tier": "smart", "rpm": 100 }
      }
    },
    "nebius": {
      "enabled": true,
      "apiKeyEnv": "NEBIUS_API_KEY",
      "baseUrl": "https://api.studio.nebius.ai/v1",
      "models": {
        "nvidia/Nemotron-3-Ultra-550b-a55b": { "tier": "reasoning", "rpm": 30 },
        "Qwen/Qwen2.5-Coder-32B-Instruct": { "tier": "smart", "rpm": 50 }
      }
    }
  },
  "defaults": {
    "temperature": {
      "fast": 0,
      "smart": 0.2,
      "reasoning": 0.3
    },
    "maxRetriesPerTier": 2
  }
}
```

---

## Environment Variables Required

```bash
# Tier 1 (Fast)
GEMINI_API_KEY=           # Google AI Studio / Vertex
ANTHROPIC_API_KEY=        # Anthropic Console

# Tier 2 (Smart) - at least ONE required
NEBIUS_API_KEY=           # Nebius AI Studio (Nemotron, Qwen)
ANTHROPIC_API_KEY=        # Reused for Sonnet

# Tier 3 (Reasoning) - at least ONE required
OPENAI_API_KEY=           # OpenAI Platform (o1 models)
NEBIUS_API_KEY=           # Reused for Nemotron-3-Ultra

# Optional local fallback
OLLAMA_BASE_URL=http://localhost:11434
```

---

## Observability Events (kaaroSessions)

Every invocation emits:

```jsonl
{"event":"llm_invocation","runId":"alone-time-2026-06-19-abc","taskType":"CURATE_SOURCE","model":"google/gemini-1.5-flash","attempt":1,"tier":"fast","durationMs":1234,"tokensInput":4521,"tokensOutput":892,"success":true,"finishReason":"stop"}
{"event":"llm_invocation","runId":"alone-time-2026-06-19-abc","taskType":"DETECT_ONTOLOGY_GAPS","model":"openai/o1-preview","attempt":1,"tier":"reasoning","durationMs":18421,"tokensInput":28451,"tokensOutput":12094,"success":true,"finishReason":"stop"}
```

---

## Acceptance Criteria

| Criterion | Test |
|-----------|------|
| Fast tier < 90s p99 | `npm run alone-time:dry-run` completes SELECT+CURATE in < 3min |
| Smart tier produces valid diffs | `IMPROVE_PIPELINE` generates git-applicable patches |
| Reasoning tier detects gaps | `DETECT_ONTOLOGY_GAPS` outputs ≥ 5 valid ontology proposals |
| Fallback works | Kill primary provider → gateway retries secondary → succeeds |
| Token tracking accurate | Events match provider billing |
| SSE stream works | `npm run audit:stream` shows live events |

---

## Migration Path for Agent Harness

1. **Implement Provider base class** with standard interface above
2. **Add 4 providers**: Google, Anthropic, OpenAI, Nebius (OpenAI-compatible)
3. **Register in gateway** via `window.kaaro.registerLLM(fn)` or config file
4. **Validate** with existing test suite: `pnpm test` (178 tests pass)
5. **Configure env vars** in deployment (GitHub Actions, server, local)

---

## Cost Estimate (Monthly, Moderate Usage)

| Tier | Calls/day | Avg tokens | Est. $/mo |
|------|-----------|------------|-----------|
| Fast | 50 | 15k | ~$5 |
| Smart | 10 | 50k | ~$15 |
| Reasoning | 3 | 100k | ~$45 |
| **Total** | | | **~$65/mo** |

*Assumes Nebius for smart/reasoning where available; OpenAI o1 only for reasoning peak.*