/**
 * pipeline/explore.mjs — Stage 1: LLM Exploration Prompt + Working Brief Generator.
 *
 * Entry point for AI-driven knowledge graph generation.
 * Takes a seed string → returns a validated "working brief" in the library JSON schema.
 *
 * Stages:
 *   Stage 1  → LLM structured prompt → raw brief JSON
 *   Stage 4a → completion.scanStoryBeats()   — add missing node stubs
 *   Stage 4b → completion.attachEnrichment() — merge adapter data into nodes
 *   Stage 4c → completion.addEdgeStubs()     — add missing edges from enrichment
 *
 * The explore.mjs file governs Stage 1 + validation only.
 * completion.mjs handles Stages 4a–4c.
 *
 * LLM resolution order:
 *   1. window.kaaro_llm — host-injected function (highest priority)
 *   2. gateway config from localStorage (kv.llm) — BYOM via pipeline/gateway/
 *   3. Legacy: localStorage.gemini_api_key — backward compat
 *   4. Throw with a clear setup message
 *
 * BYOM setup:
 *   import { saveLLMConfig } from './pipeline/gateway/index.mjs';
 *   saveLLMConfig({ provider: 'anthropic', apiKey: 'sk-ant-...', model: 'claude-haiku-4-5-20251001' });
 *   // or: { provider: 'gemini', apiKey: 'AIza...' }
 *   // or: { provider: 'custom', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3' }
 *
 * Usage:
 *   import { explore, rethink } from './pipeline/explore.mjs';
 *   const brief = await explore('Trunk-Based Development vs GitFlow');
 *   const revised = await rethink(brief, enrichedPatches);
 */

import { log } from '../logger.mjs';
import { routeToProvider, loadLLMConfig } from './gateway/index.mjs';

// ── LLM interface ─────────────────────────────────────────────────────────────

/**
 * Call the configured LLM. Resolution order:
 *   1. window.kaaro_llm (host-injected — highest priority, stays for compat)
 *   2. Gateway config stored in localStorage (kv.llm)
 *   3. Legacy localStorage.gemini_api_key
 *
 * The _fetchFn parameter is injectable for unit tests.
 */
async function _callLLM(prompt, { temperature = 0.7, maxTokens = 8192 } = {}, _fetchFn = fetch) {
  // 1. Host-injected function (e.g. art-of-intent integration, test mocks)
  if (typeof window !== 'undefined' && typeof window.kaaro_llm === 'function') {
    console.log('[kaaro/explore] _callLLM → path 1: window.kaaro_llm (host-injected)');
    return window.kaaro_llm(prompt, { temperature, maxTokens });
  }

  // 2. Gateway BYOM config
  const config = loadLLMConfig();
  console.log('[kaaro/explore] _callLLM → path 2: loadLLMConfig() =', config ? `provider=${config.provider} apiKey=${config.apiKey ? '***' : 'MISSING'}` : 'null');
  if (config?.provider && config?.apiKey) {
    log('ENRICHER', `[explore] using gateway provider: ${config.provider} model=${config.model ?? 'auto'}`);
    const result = await routeToProvider(config.provider, prompt, config, _fetchFn);
    return result.text;
  }

  // 3. Legacy Gemini key fallback
  const legacyKey = (() => { try { return localStorage.getItem('gemini_api_key'); } catch { return null; } })();
  if (legacyKey) {
    console.log('[kaaro/explore] _callLLM → path 3: legacy gemini_api_key');
    log('ENRICHER', '[explore] using legacy gemini_api_key — migrate to saveLLMConfig() for full BYOM');
    const result = await routeToProvider('gemini', prompt, { apiKey: legacyKey }, _fetchFn);
    return result.text;
  }

  console.error('[kaaro/explore] _callLLM → no provider configured. localStorage kv.llm =', localStorage.getItem('kv.llm'));
  throw new Error(
    'No LLM provider configured. Options:\n' +
    '  • window.kaaro.registerLLM(fn) — inject any async function\n' +
    '  • saveLLMConfig({ provider, apiKey }) — BYOM via settings UI\n' +
    '  • localStorage.gemini_api_key — legacy Gemini key'
  );
}

// ── Prompt builder ────────────────────────────────────────────────────────────

const TENSION_LEVELS   = ['low', 'medium', 'high', 'climax'];
const SENTIMENT_VALUES = ['positive', 'negative', 'neutral', 'contested'];
const TIER_VALUES      = ['spine', 'primary', 'secondary', 'anchor'];
const HINT_VALUES      = ['oppose', 'anchor', 'timeline_axis', 'push_peripheral'];
const PRIORITY_VALUES  = ['high', 'medium', 'low'];

/**
 * Build the Stage 1 exploration prompt.
 * @param {string} seed            — topic, person, URL, or concept
 * @param {object} [rethinkContext] — enriched patches from Stage 3, passed during RETHINK flow
 */
function _buildPrompt(seed, rethinkContext = null) {
  // Compact schema reference — field names + allowed values only (~300 tokens vs ~1000 for full example).
  const rethinkBlock = rethinkContext
    ? `\n\n## ENRICHMENT CONTEXT (RETHINK MODE)\nReal-world API data for entities below. Use it to correct or expand the narrative:\n\`\`\`json\n${JSON.stringify(rethinkContext, null, 2).slice(0, 3000)}\n\`\`\`\n`
    : '';

  return `You are a knowledge cartographer. Generate a "working brief" — a richly connected JSON knowledge graph with a narrative arc — for:

**SEED**: "${seed}"
${rethinkBlock}
Return ONLY raw JSON (no markdown fences, no extra text). Schema:

{
  meta: { id(kebab), title, subtitle, domain, year, tags[], tone(analytical|investigative|narrative|critical|celebratory) },
  report_card: { summary(2-4 sent), key_stats:[{label,value}], spine:[node-id], protagonists:[id], antagonists:[id], themes:[] },
  story: [{ id, title, node(id), nodes:[id], narration(80+ words), tension(low|medium|high|climax), focus(wide|tight) }],
  insights: [{ id, title, body(2-4 sent, non-obvious), type(finding|warning|pattern|conclusion|paradox|opportunity), severity(high|medium|low), evidence:[id] }],
  clusters: [{ id, label, color(#hex), nodes:[id], description }],
  nodes: [{ id(kebab), label, type(person|software|concept|algorithm|milestone|issue|event|organisation|location), tier(spine|primary|secondary|anchor), sentiment(positive|negative|neutral|contested), description(2-3 sent), confidence(0-1), metrics:{}, wikidata(Qid|null) }],
  edges: [{ from(id), to(id), rel(causes|enables|mitigates|derives_from|supersedes|creates|opposes|association|precedes|features|implements|prohibits), weight(1-5), directed(bool), label? }],
  enrichment_targets: [{ node_id, priority(high|medium|low) }],
  layout_hints: [{ node_id, hint(oppose|anchor|timeline_axis|push_peripheral), pair?(id) }]
}

RULES:
- Nodes: 8-32 total. 1-3 spine, 3-8 primary, 3-15 secondary, 0-3 anchor. All IDs unique kebab-case.
- confidence = probability entity exists (0-1). wikidata = real QID if confidence >= 0.85, else null.
- Story: 5-12 beats. Exactly 1 tension="climax". Beat.node + beat.nodes[] must be real node IDs.
- Insights: 3-8. Non-obvious. evidence[] must be real node IDs.
- Edges: >=12. from+to must be real node IDs. directed=true for causal/temporal. weight 1-5.
- enrichment_targets: high for spine, medium for primary, low for secondary.
- layout_hints: oppose(needs pair), anchor(most central spine node), timeline_axis(temporal), push_peripheral(anchor-tier).

Generate for: **"${seed}"**`;
}


// ── Brief validator ───────────────────────────────────────────────────────────

/**
 * Validate minimum structural requirements for a working brief.
 * This is NOT a quality gate — just a schema sanity check.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateBrief(brief) {
  const errors = [];

  if (!brief || typeof brief !== 'object') {
    return { valid: false, errors: ['Brief is not an object'] };
  }

  // meta
  if (!brief.meta?.id)    errors.push('meta.id is missing');
  if (!brief.meta?.title) errors.push('meta.title is missing');

  // nodes
  const nodes = brief.nodes ?? [];
  if (nodes.length < 1)   errors.push('Brief has no nodes');

  const nodeIds = new Set(nodes.map(n => n.id));

  // edges — all endpoints must exist
  for (const e of (brief.edges ?? [])) {
    if (!nodeIds.has(e.from)) errors.push(`Edge from unknown node: ${e.from}`);
    if (!nodeIds.has(e.to))   errors.push(`Edge to unknown node: ${e.to}`);
  }

  // story beats must reference valid nodes
  for (const beat of (brief.story ?? [])) {
    if (beat.node && !nodeIds.has(beat.node)) {
      errors.push(`Beat "${beat.id}" references unknown node: ${beat.node}`);
    }
  }

  // spine must exist
  const spine = brief.report_card?.spine ?? [];
  for (const s of spine) {
    if (!nodeIds.has(s)) errors.push(`Spine node not found in nodes: ${s}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── JSON extractor ────────────────────────────────────────────────────────────

/**
 * Robustly extract a JSON object from LLM output.
 * Handles: raw JSON, JSON in ```json fences, stray text before/after.
 * Exported for unit tests.
 */
export function _extractJSON(raw) {
  // Try direct parse first
  try { return JSON.parse(raw); } catch { /* fall through */ }

  // Strip markdown fences
  const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '');
  try { return JSON.parse(stripped); } catch { /* fall through */ }

  // find first { … last }
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ }
  }

  throw new Error('Could not extract JSON from LLM response');
}

// ── Post-processing ───────────────────────────────────────────────────────────

/**
 * Clean and normalise a raw brief to ensure schema consistency.
 * Does not validate — call validateBrief() for that.
 */
function _normaliseBrief(brief, seed) {
  // Ensure meta defaults
  brief.meta = brief.meta ?? {};
  if (!brief.meta.id)    brief.meta.id    = `explore-${Date.now()}`;
  if (!brief.meta.title) brief.meta.title = seed.slice(0, 80);
  if (!brief.meta.year)  brief.meta.year  = new Date().getFullYear().toString();

  // Normalise node fields
  for (const node of (brief.nodes ?? [])) {
    node.tier      = TIER_VALUES.includes(node.tier)      ? node.tier      : 'primary';
    node.sentiment = SENTIMENT_VALUES.includes(node.sentiment) ? node.sentiment : 'neutral';
    node.metrics   = node.metrics ?? {};
    node.confidence = typeof node.confidence === 'number' ? node.confidence : 0.5;
  }

  // Normalise edges
  for (const edge of (brief.edges ?? [])) {
    edge.weight   = typeof edge.weight === 'number' ? Math.min(5, Math.max(1, edge.weight)) : 2;
    edge.directed = edge.directed !== false;
  }

  // Normalise story
  for (const beat of (brief.story ?? [])) {
    beat.tension = TENSION_LEVELS.includes(beat.tension) ? beat.tension : 'medium';
    beat.nodes   = beat.nodes ?? [];
  }

  // Normalise enrichment_targets
  if (!brief.enrichment_targets?.length) {
    const spineSet = new Set(brief.report_card?.spine ?? []);
    brief.enrichment_targets = (brief.nodes ?? []).map(n => ({
      node_id:  n.id,
      priority: spineSet.has(n.id) ? 'high'
              : n.tier === 'primary' ? 'medium' : 'low',
    }));
  }

  // Build node lookup for canvas consumption
  brief.nodeLookup = {};
  for (const n of (brief.nodes ?? [])) brief.nodeLookup[n.id] = n;

  return brief;
}

// ── Main entry points ─────────────────────────────────────────────────────────

/**
 * Stage 1: Generate a working brief from a seed string.
 *
 * @param {string}   seed           — topic, person, or concept
 * @param {object}  [opts]
 * @param {number}  [opts.retries=2] — retry count on parse failure
 * @param {boolean} [opts.validate=true]
 * @returns {Promise<object>}        — working brief
 */
export async function explore(seed, opts = {}) {
  const { retries = 2, validate = true } = opts;
  seed = seed.trim();
  if (!seed) throw new Error('explore() requires a non-empty seed string');

  log('ENRICHER', `[explore] Stage 1 starting — seed: "${seed}"`);

  const prompt = _buildPrompt(seed);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const t0  = performance.now();
      const raw = await _callLLM(prompt, { temperature: attempt === 0 ? 0.7 : 0.5 });
      const ms  = Math.round(performance.now() - t0);
      log('ENRICHER', `[explore] LLM responded in ${ms}ms (attempt ${attempt + 1})`);

      const parsed = _extractJSON(raw);
      const brief  = _normaliseBrief(parsed, seed);

      if (validate) {
        const { valid, errors } = validateBrief(brief);
        if (!valid && errors.length > 3) {
          // More than 3 errors → retry
          log('ERROR', `[explore] Brief validation: ${errors.length} errors`, { errors });
          lastError = new Error(`Brief validation failed: ${errors.join('; ')}`);
          continue;
        }
        if (!valid) {
          // Minor errors → log and continue
          log('ENRICHER', `[explore] Brief has ${errors.length} minor validation issue(s)`, { errors });
        }
      }

      log('ENRICHER', `[explore] Stage 1 complete`, {
        id:      brief.meta.id,
        nodes:   brief.nodes?.length ?? 0,
        edges:   brief.edges?.length ?? 0,
        beats:   brief.story?.length ?? 0,
        targets: brief.enrichment_targets?.length ?? 0,
      });

      // Emit event for canvas + UI
      document.dispatchEvent(new CustomEvent('explore:brief-ready', {
        detail: { brief, seed },
        bubbles: true,
      }));

      return brief;

    } catch (err) {
      lastError = err;
      log('ERROR', `[explore] attempt ${attempt + 1} failed`, { message: err.message });
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error('explore() failed after retries');
}

/**
 * Stage 1 (RETHINK): Re-generate brief with enrichment context injected.
 * Called when user confirms [ RETHINK ] after Stage 3 delta detection.
 *
 * @param {object} originalBrief   — the working brief from the first explore() call
 * @param {object} enrichedPatches — patches from runEnrichment().patches
 * @returns {Promise<object>}       — revised working brief
 */
export async function rethink(originalBrief, enrichedPatches) {
  const seed = originalBrief.meta?.title ?? 'unknown topic';
  log('ENRICHER', `[rethink] re-generating brief for "${seed}" with enrichment context`);

  // Subset the patches to only high-signal data for the prompt
  const rethinkContext = {};
  for (const [nodeId, patch] of Object.entries(enrichedPatches ?? {})) {
    if (!patch?.sources?.length) continue;
    rethinkContext[nodeId] = {
      sources:    patch.sources,
      summary:    patch.summary?.slice(0, 200) ?? null,
      metrics:    patch.metrics ?? {},
      related_ids: (patch.related_ids ?? []).slice(0, 5),
    };
  }

  const prompt = _buildPrompt(seed, rethinkContext);

  log('ENRICHER', `[rethink] calling LLM with ${Object.keys(rethinkContext).length} enriched nodes`);
  const t0  = performance.now();
  const raw = await _callLLM(prompt, { temperature: 0.5 });
  const ms  = Math.round(performance.now() - t0);
  log('ENRICHER', `[rethink] LLM responded in ${ms}ms`);

  const parsed = _extractJSON(raw);
  const brief  = _normaliseBrief(parsed, seed);

  log('ENRICHER', `[rethink] complete — ${brief.nodes?.length ?? 0} nodes, ${brief.edges?.length ?? 0} edges`);

  document.dispatchEvent(new CustomEvent('explore:brief-ready', {
    detail: { brief, seed, isRethink: true },
    bubbles: true,
  }));

  return brief;
}

/**
 * Register the host LLM function.
 * Call this from main.mjs or the app shell with the actual AI SDK.
 * @param {Function} fn — async (prompt: string, opts: object) => string
 */
export function registerLLM(fn) {
  window.kaaro_llm = fn;
  log('SYSTEM', '[explore] LLM provider registered');
}

/**
 * Register the NED++ LLM disambiguation hook (used by ned-resolver.mjs).
 * @param {Function} fn — async (label: string, candidates: object[]) => object|null
 */
export function registerLLMDisambiguate(fn) {
  window.kaaro_llm_disambiguate = fn;
  log('SYSTEM', '[explore] LLM disambiguate hook registered');
}
