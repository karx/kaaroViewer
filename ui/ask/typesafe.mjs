/**
 * ui/ask/typesafe.mjs — askBatch adapter for TypeSafe's System One API (Jev).
 *
 * One routing decision = one POST with every hop as a typed question:
 *   layout / slot  → choice   (criteria: { optionId: description })
 *   capacity       → score    (criteria: [level descriptions, low → high])
 *   promote        → noul     (criteria: { true, false })
 *
 * The state sent is the descriptor with item arrays stripped: counts, ids and
 * booleans only. No narration, no node descriptions.
 *
 *   const askBatch = createTypesafeAsk({ apiKey });
 *   const { answers, confidence } = await askBatch(hops, descriptor);
 */

export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const TYPESAFE_MODEL    = 'jev-latest';

/** Question ids must be plain identifiers; keep a reversible map. */
export function questionKey(hopId) {
  return hopId.replace(/[^A-Za-z0-9_]/g, '__');
}

/** Descriptor → state payload: drop per-item arrays, keep everything scalar. */
export function stateForJev(d) {
  const strip = (o) => {
    if (Array.isArray(o)) return o.length <= 12 && o.every(x => typeof x !== 'object') ? o : `[${o.length} items]`;
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).filter(([k]) => !['items', 'chains', 'bridges', 'spine', 'protagonists', 'antagonists'].includes(k)).map(([k, v]) => [k, strip(v)]));
    return o;
  };
  return strip(d);
}

export function hopsToQuestions(hops) {
  const questions = {}, keyToHop = {};
  for (const hop of hops) {
    const key = questionKey(hop.id);
    keyToHop[key] = hop.id;
    if (hop.kind === 'capacity') {
      questions[key] = { type: 'score', instructions: hop.question, criteria: hop.options.map(o => `${o.label}: ${o.description}`) };
    } else if (hop.kind === 'promote') {
      questions[key] = { type: 'noul', instructions: hop.question, criteria: { true: hop.options[0].description, false: hop.options[1].description } };
    } else {
      questions[key] = { type: 'choice', instructions: hop.question, criteria: Object.fromEntries(hop.options.map(o => [o.id, o.description || null])) };
    }
  }
  return { questions, keyToHop };
}

/** Map one API answer back to { answer: optionId, confidence }. */
export function decodeAnswer(hop, a) {
  if (!a) return { answer: null, confidence: 0 };
  if (hop.kind === 'capacity') {
    const level = Math.round(Number(a.score ?? 0));
    const opt = hop.options[Math.max(0, Math.min(hop.options.length - 1, level))];
    return { answer: opt?.id ?? null, confidence: Number(a.confidence ?? 0) };
  }
  if (hop.kind === 'promote') {
    const p = Number(a.noul ?? 0.5);
    return { answer: p >= 0.5 ? 'yes' : 'no', confidence: Math.abs(p - 0.5) * 2 };
  }
  return { answer: a.choice ?? null, confidence: Number(a.confidence ?? 0) };
}

export function createTypesafeAsk({ apiKey, model = TYPESAFE_MODEL, endpoint = TYPESAFE_ENDPOINT, fetchFn = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (!apiKey) throw new Error('createTypesafeAsk: apiKey is required');
  return async function askBatch(hops, descriptor) {
    if (!hops.length) return { answers: {}, confidence: {}, usage: null, raw: null };
    const { questions, keyToHop } = hopsToQuestions(hops);
    const body = { state: stateForJev(descriptor), model, questions };
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl?.signal,
      });
    } finally { if (timer) clearTimeout(timer); }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`typesafe ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const byId = Object.fromEntries(hops.map(h => [h.id, h]));
    const answers = {}, confidence = {};
    for (const [key, a] of Object.entries(json.answers ?? {})) {
      const hopId = keyToHop[key];
      if (!hopId) continue;
      const d = decodeAnswer(byId[hopId], a);
      answers[hopId] = d.answer;
      confidence[hopId] = d.confidence;
    }
    return { answers, confidence, usage: json.usage ?? null, raw: json };
  };
}

/** Node-only convenience: key from env (loads .env if present). Returns null when unset. */
export function typesafeFromEnv(opts = {}) {
  try { if (typeof process !== 'undefined' && process.loadEnvFile) process.loadEnvFile(opts.envFile ?? '.env'); } catch { /* no .env */ }
  const apiKey = typeof process !== 'undefined' ? process.env.TYPESAFE_API_KEY : null;
  return apiKey ? createTypesafeAsk({ apiKey, ...opts }) : null;
}
