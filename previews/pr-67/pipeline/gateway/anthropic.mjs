/**
 * pipeline/gateway/anthropic.mjs — Anthropic provider adapter.
 *
 * Endpoint: https://api.anthropic.com/v1/messages
 * Auth: x-api-key header + anthropic-version
 * Default model: claude-haiku-4-5-20251001 (fastest, lowest cost)
 *
 * @param {string} prompt
 * @param {{ apiKey: string, model?: string, endpoint?: string }} config
 * @param {typeof fetch} fetchFn — injectable for tests
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, finishReason: string }>}
 */

const DEFAULT_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL     = 'claude-haiku-4-5-20251001';

export async function callAnthropic(prompt, config, fetchFn = fetch) {
  const { apiKey, model = DEFAULT_MODEL } = config;
  if (!apiKey) throw new Error('Anthropic: apiKey is required');

  const endpoint = config.endpoint?.includes('/messages')
    ? config.endpoint
    : (config.endpoint ? config.endpoint.replace(/\/+$/, '') + '/messages' : DEFAULT_ENDPOINT);

  const res = await fetchFn(endpoint, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    let errorBody = {};
    try { errorBody = await res.json(); } catch {}
    const err = new Error(`Anthropic API error ${res.status}`);
    err.httpStatus      = res.status;
    err.providerStatus  = errorBody?.error?.type ?? String(res.status);
    err.providerMessage = errorBody?.error?.message ?? '';
    throw err;
  }

  const data         = await res.json();
  const text         = data.content?.find(b => b.type === 'text')?.text ?? '';
  const inputTokens  = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  const finishReason = data.stop_reason ?? 'UNKNOWN';

  return { text, inputTokens, outputTokens, finishReason };
}
