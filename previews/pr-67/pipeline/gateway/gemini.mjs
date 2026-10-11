/**
 * pipeline/gateway/gemini.mjs — Gemini provider adapter.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
 * Auth: key= query param
 *
 * Model cascade (by real-world free-tier performance, best first):
 *   gemini-2.5-flash  — most capable; thinking disabled to preserve output budget
 *   gemini-2.0-flash-lite — fast, reliable on free tier, no thinking tokens
 *   gemini-2.0-flash  — rate-limited on free tier; kept as third option
 *   gemini-1.5-flash  — oldest fallback
 *
 * gemini-2.5-flash note: thinking tokens count against maxOutputTokens, so
 * thinkingConfig.thinkingBudget is set to 0 for pure JSON generation tasks.
 * maxOutputTokens is 16384 to give the JSON room to breathe.
 *
 * Each model gets up to 2 retries on 429 (30s then 60s backoff) before
 * the cascade advances to the next model.
 *
 * Note: responseMimeType:'application/json' intentionally omitted — it hits a
 * separate, tighter quota bucket. Plain-text output is parsed by the caller.
 *
 * @param {string} prompt
 * @param {{ apiKey: string, model?: string, endpoint?: string, maxOutputTokens?: number }} config
 * @param {typeof fetch} fetchFn — injectable for tests
 * @returns {Promise<{ text, inputTokens, outputTokens, finishReason, model }>}
 */

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MODEL_CASCADE = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const RATE_LIMIT_WAITS = [30_000, 60_000];

// Models that use thinking tokens — we suppress thinking for JSON-generation tasks.
const THINKING_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);

export async function callGemini(prompt, config, fetchFn = fetch) {
  const { apiKey, model } = config;
  if (!apiKey) throw new Error('Gemini: apiKey is required');

  const cascade       = model ? [model] : MODEL_CASCADE;
  const maxOutTokens  = config.maxOutputTokens ?? 16384;
  const _log          = typeof console !== 'undefined' ? console : null;

  for (let ci = 0; ci < cascade.length; ci++) {
    const m        = cascade[ci];
    const endpoint = config.endpoint ?? `${DEFAULT_BASE}/${m}:generateContent`;
    let   attempts = 0;

    const genConfig = { temperature: 0.7, maxOutputTokens: maxOutTokens };
    if (THINKING_MODELS.has(m)) {
      genConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    while (attempts <= RATE_LIMIT_WAITS.length) {
      const t0  = Date.now();
      const res = await fetchFn(`${endpoint}?key=${apiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents:         [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: genConfig,
        }),
      });

      const body = await res.text();

      if (res.ok) {
        const data         = JSON.parse(body);
        const text         = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const inputTokens  = data.usageMetadata?.promptTokenCount  ?? 0;
        const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
        const finishReason = data.candidates?.[0]?.finishReason ?? 'UNKNOWN';
        const cascadeNote  = ci > 0 ? ` (cascade step ${ci})` : '';
        _log?.info?.(`[gemini] ${m} ok — ${Date.now() - t0}ms, ${inputTokens}in/${outputTokens}out, ${finishReason}${cascadeNote}`);
        if (finishReason === 'MAX_TOKENS') {
          _log?.warn?.(`[gemini] ${m} MAX_TOKENS — response truncated; consider raising maxOutputTokens`);
        }
        return { text, inputTokens, outputTokens, finishReason, model: m };
      }

      if (res.status === 429) {
        const wait = RATE_LIMIT_WAITS[attempts];
        if (wait === undefined) {
          _log?.warn?.(`[gemini] ${m} rate-limited, exhausted retries — advancing cascade`);
          break;
        }
        _log?.warn?.(`[gemini] ${m} 429 rate-limit (attempt ${attempts + 1}) — waiting ${wait / 1000}s`);
        await new Promise(r => setTimeout(r, wait));
        attempts++;
        continue;
      }

      const err = new Error(`Gemini ${m} HTTP ${res.status}`);
      err.httpStatus  = res.status;
      try { err.providerMessage = JSON.parse(body)?.error?.message ?? ''; } catch {}
      _log?.error?.(`[gemini] ${m} error ${res.status}: ${err.providerMessage}`);
      throw err;
    }
  }

  throw new Error(
    'Gemini rate limit exhausted across all cascade models. ' +
    'Wait a minute and retry, or switch to a different provider.'
  );
}
