/**
 * pipeline/gateway/custom.mjs — Custom / OpenAI-compatible provider adapter.
 *
 * For local models (Ollama, LM Studio, vLLM) or any proxy that speaks
 * the OpenAI Chat Completions API shape. The endpoint is used as-is.
 * Auth: Authorization: Bearer <key>  (ignored by most local servers)
 *
 * @param {string} prompt
 * @param {{ apiKey?: string, endpoint: string, model?: string }} config
 * @param {typeof fetch} fetchFn — injectable for tests
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, finishReason: string }>}
 */

export async function callCustom(prompt, config, fetchFn = fetch) {
  const { apiKey = '', model = 'default', endpoint } = config;
  if (!endpoint) throw new Error('Custom provider: endpoint is required');

  const res = await fetchFn(endpoint, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    let errorBody = {};
    try { errorBody = await res.json(); } catch {}
    const err = new Error(`Custom provider API error ${res.status}`);
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
