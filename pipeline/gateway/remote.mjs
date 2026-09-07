/**
 * pipeline/gateway/remote.mjs — Shared Kaaro Gateway client adapter.
 *
 * Calls art-of-intent's `gatewayCall`/`saveUserSettings` Cloud Functions
 * instead of hitting a provider directly from the browser (pipeline/gateway/
 * index.mjs's local adapters). Trades local-only/offline operation for
 * server-side encrypted key storage and cross-session traceability
 * (Firestore gateway_logs + daily JSONL export) — see kaaroBrain:
 * 1 Projects/Kaaro Gateway/Shared BYOM Gateway.md.
 *
 * This is an additive, opt-in path — the local adapters in ./index.mjs are
 * unchanged and remain the default/offline fallback.
 *
 * `callable` is injectable on every export for unit tests — pass a fake
 * instead of the real Firebase httpsCallable to test without a live
 * project, matching the fetchFn-injection pattern used by the local
 * provider adapters.
 */

const PRODUCT_ID = 'kaaroViewer';

async function defaultCallable(name) {
  const { getKaaroCallable, ensureKaaroAuth } = await import('../../canvas/kaaro-firebase.mjs');
  await ensureKaaroAuth();
  return getKaaroCallable(name);
}

/**
 * Generate via the shared gateway. Same return shape as the local adapters
 * in ./index.mjs: { text, inputTokens, outputTokens, finishReason }.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {{ sessionId?: string }} [opts]
 * @param {(data: object) => Promise<{ data: object }>} [callable] - injectable httpsCallable
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, finishReason: string }>}
 */
export async function callSharedGateway(systemPrompt, userPrompt, opts = {}, callable) {
  const { sessionId } = opts;
  const invoke = callable || await defaultCallable('gatewayCall');

  const response = await invoke({ product: PRODUCT_ID, systemPrompt, userPrompt, sessionId });
  const payload = response?.data?.data;
  if (!payload) {
    throw new Error('Shared Kaaro gateway returned an unexpected response');
  }

  return {
    text: payload.text,
    inputTokens: payload.inputTokens,
    outputTokens: payload.outputTokens,
    finishReason: payload.finishReason,
  };
}

/**
 * Save this browser's BYOM settings for kaaroViewer to the shared gateway
 * (server-side AES-256-GCM encrypted — see art-of-intent/functions/crypto.js).
 * Pass `{ provider: null }` to clear.
 *
 * @param {{ provider: string|null, apiKey?: string, endpoint?: string, model?: string }} settings
 * @param {(data: object) => Promise<{ data: object }>} [callable] - injectable httpsCallable
 */
export async function saveSharedGatewaySettings(settings, callable) {
  const invoke = callable || await defaultCallable('saveUserSettings');
  const response = await invoke({ product: PRODUCT_ID, ...settings });
  return response?.data;
}
