/**
 * pipeline/gateway/openai.mjs — OpenAI provider adapter.
 *
 * Endpoint: https://api.openai.com/v1/chat/completions
 * Auth: Authorization: Bearer <key>
 * Default model: gpt-4o-mini
 *
 * @param {string} prompt
 * @param {{ apiKey: string, model?: string, endpoint?: string }} config
 * @param {typeof fetch} fetchFn — injectable for tests
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, finishReason: string }>}
 */

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL     = 'gpt-4o-mini';

export async function callOpenAI(prompt, config, fetchFn = fetch) {
  const { apiKey, model = DEFAULT_MODEL } = config;
  if (!apiKey) throw new Error('OpenAI: apiKey is required');

  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;

  const res = await fetchFn(endpoint, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
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
    const err = new Error(`OpenAI API error ${res.status}`);
    err.httpStatus      = res.status;
    err.providerMessage = errorBody?.error?.message ?? '';
    throw err;
  }

  const data         = await res.json();
  const text         = data.choices?.[0]?.message?.content ?? '';
  const inputTokens  = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const finishReason = data.choices?.[0]?.finish_reason ?? 'UNKNOWN';

  return { text, inputTokens, outputTokens, finishReason };
}
