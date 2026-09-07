/**
 * pipeline/gateway/index.mjs — Browser-native LLM provider dispatcher.
 *
 * Ported from art-of-intent/functions/gateway/ and adapted for browser ESM.
 * No Firebase, no Node.js — runs in any modern browser or Vitest/jsdom.
 *
 * routeToProvider(provider, prompt, config, fetchFn?)
 *   → Promise<{ text, inputTokens, outputTokens, finishReason }>
 *
 * Supported providers: 'gemini' | 'openai' | 'anthropic' | 'custom'
 *
 * The fetchFn parameter is injectable for unit tests — pass a mock instead
 * of the global fetch to test without hitting real APIs.
 *
 * Usage:
 *   import { routeToProvider, PROVIDERS } from './pipeline/gateway/index.mjs';
 *   const result = await routeToProvider('anthropic', prompt, {
 *     apiKey: 'sk-ant-...',
 *     model: 'claude-haiku-4-5-20251001',
 *   });
 */

import { callGemini }    from './gemini.mjs';
import { callOpenAI }    from './openai.mjs';
import { callAnthropic } from './anthropic.mjs';
import { callCustom }    from './custom.mjs';

export const PROVIDERS = ['gemini', 'openai', 'anthropic', 'custom'];

const ADAPTERS = {
  gemini:    callGemini,
  openai:    callOpenAI,
  anthropic: callAnthropic,
  custom:    callCustom,
};

/**
 * Route a generation request to the appropriate provider adapter.
 *
 * @param {'gemini'|'openai'|'anthropic'|'custom'} provider
 * @param {string} prompt          — the user prompt (kaaroViewer uses single-turn)
 * @param {{ apiKey: string, endpoint?: string, model?: string }} config
 * @param {typeof fetch} [fetchFn] — injectable for tests; defaults to global fetch
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, finishReason: string }>}
 */
export async function routeToProvider(provider, prompt, config, fetchFn = fetch) {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`Unknown provider: "${provider}". Supported: ${PROVIDERS.join(', ')}`);
  }
  return adapter(prompt, config, fetchFn);
}

// ── localStorage config helpers ───────────────────────────────────────────────

const STORAGE_KEY = 'kv.llm';

/**
 * Load LLM config from localStorage.
 * Returns null if nothing is configured.
 * @returns {{ provider: string, apiKey: string, endpoint?: string, model?: string }|null}
 */
export function loadLLMConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/**
 * Save LLM config to localStorage.
 * @param {{ provider: string, apiKey: string, endpoint?: string, model?: string }} config
 */
export function saveLLMConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* localStorage unavailable */ }
}

/**
 * Clear stored LLM config.
 */
export function clearLLMConfig() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── Shared Kaaro Gateway opt-in flag ───────────────────────────────────────
// Independent of the local kv.llm config above: when enabled, calls route
// through art-of-intent's gatewayCall Cloud Function (server-side encrypted
// key, cross-session traceability) instead of directly from the browser.
// See ./remote.mjs and canvas/kaaro-firebase.mjs.

const SHARED_GATEWAY_KEY = 'kv.llm.shared';

/**
 * @returns {boolean} whether the shared Kaaro gateway is opted into
 */
export function isSharedGatewayEnabled() {
  try { return localStorage.getItem(SHARED_GATEWAY_KEY) === 'true'; } catch { return false; }
}

/**
 * @param {boolean} enabled
 */
export function setSharedGatewayEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(SHARED_GATEWAY_KEY, 'true');
    else localStorage.removeItem(SHARED_GATEWAY_KEY);
  } catch { /* localStorage unavailable */ }
}

/**
 * Build a gateway-compatible generate function from stored config.
 * Returns null if no provider is configured.
 * @param {typeof fetch} [fetchFn]
 * @returns {((prompt: string) => Promise<string>)|null}
 */
export function buildGenerateFn(fetchFn = fetch) {
  const config = loadLLMConfig();
  if (!config?.provider || !config?.apiKey) return null;

  return async (prompt) => {
    const result = await routeToProvider(config.provider, prompt, config, fetchFn);
    return result.text;
  };
}
