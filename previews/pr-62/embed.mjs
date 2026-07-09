/**
 * embed.mjs — kaaroViewer iframe embed bridge.
 *
 * Imported by main.mjs. When ?embed=1 is present in the URL this module:
 *   1. Installs window.kaaro_llm as a postMessage proxy so all LLM calls
 *      route through the parent frame (art-of-intent Cloud Function).
 *   2. Listens for kaaro:explore messages from the parent to seed exploration.
 *   3. Exports notifyBriefReady(brief) so main.mjs can signal completion.
 *
 * postMessage protocol (parent ↔ iframe):
 *   parent → iframe  { type: 'kaaro:explore', seed: string }
 *   iframe → parent  { type: 'kaaro:llm-request',  requestId, prompt }
 *   parent → iframe  { type: 'kaaro:llm-response', requestId, text?, error? }
 *   iframe → parent  { type: 'kaaro:brief-ready',  brief }
 *   iframe → parent  { type: 'kaaro:ready' }
 *
 * Security note: postMessage target origin is intentionally '*'.
 * kaaroViewer is a publicly embeddable widget — restricting the origin would
 * break arbitrary host projects. No PII flows through these messages (prompts are
 * search terms; briefs are knowledge-graph metadata). Inbound messages are
 * guarded by ALLOWED_ORIGINS, which is the correct security boundary.
 */

const _params = new URLSearchParams(location.search);

export const EMBED_MODE = _params.has('embed');

// Allowed parent origins — add production domain when deploying
const ALLOWED_ORIGINS = new Set([
  'https://art-of-intent.netlify.app',
  'https://art-of-intent.web.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
]);

// Pending LLM calls awaiting a kaaro:llm-response
const _pending = new Map(); // requestId → { resolve, reject }

if (EMBED_MODE) {
  // Bridge all LLM calls through the parent frame
  window.kaaro_llm = (prompt) => {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      _pending.set(requestId, { resolve, reject });
      window.parent.postMessage({ type: 'kaaro:llm-request', requestId, prompt }, '*');
    });
  };

  window.addEventListener('message', (e) => {
    if (!ALLOWED_ORIGINS.has(e.origin)) return;

    if (e.data?.type === 'kaaro:llm-response') {
      const { requestId, text, error } = e.data;
      const p = _pending.get(requestId);
      if (!p) return;
      _pending.delete(requestId);
      error ? p.reject(new Error(error)) : p.resolve(text);
    }

    if (e.data?.type === 'kaaro:explore' && e.data.seed) {
      // Queue the seed — main.mjs picks it up after init
      window.__kaaro_embed_seed = e.data.seed;
    }
  });
}

/**
 * Called by main.mjs after the full pipeline completes.
 * Sends the finished brief to the parent frame for persistence.
 */
export function notifyBriefReady(brief) {
  if (!EMBED_MODE) return;
  window.parent.postMessage({ type: 'kaaro:brief-ready', brief }, '*');
}

/**
 * Called by main.mjs once the canvas and init sequence are done.
 */
export function signalReady() {
  if (!EMBED_MODE) return;
  window.parent.postMessage({ type: 'kaaro:ready' }, '*');
}
