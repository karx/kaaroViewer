import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTypesafeAsk, hopsToQuestions, decodeAnswer, stateForJev, questionKey, TYPESAFE_ENDPOINT } from './typesafe.mjs';
import { buildFullQuestionnaire } from '../questionnaire.mjs';
import { describeBrief } from '../state-descriptor.mjs';

const kaaro = JSON.parse(readFileSync('library/kaaro-viewer.json', 'utf8'));

describe('question encoding', () => {
  it('maps hop kinds to choice / score / noul with registry ids as criteria keys', () => {
    const d = describeBrief(kaaro);
    const hops = buildFullQuestionnaire(d, { mode: 'slides' });
    const { questions, keyToHop } = hopsToQuestions(hops);
    const layoutQ = questions[questionKey('layout')];
    expect(layoutQ.type).toBe('choice');
    expect(Object.keys(layoutQ.criteria)).toEqual(expect.arrayContaining(['slide-deck', 'compact-deck']));
    const capKey = Object.keys(questions).find(k => questions[k].type === 'score');
    expect(capKey).toBeTruthy();
    expect(Array.isArray(questions[capKey].criteria)).toBe(true);
    expect(keyToHop[capKey]).toMatch(/^capacity:/);
    for (const k of Object.keys(questions)) expect(k).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it('strips item arrays and free text from the state', () => {
    const s = stateForJev(describeBrief(kaaro));
    expect(s.story.items).toBeUndefined();
    expect(s.analytics.chains).toBeUndefined();
    expect(s.nodes.count).toBe(kaaro.nodes.length);
    expect(JSON.stringify(s)).not.toContain(kaaro.story[0].narration.slice(0, 20));
  });

  it('decodes each answer type back to an option id + confidence', () => {
    const choice = { kind: 'slot', options: [{ id: 'a' }, { id: 'b' }] };
    expect(decodeAnswer(choice, { choice: 'b', confidence: 0.8 })).toEqual({ answer: 'b', confidence: 0.8 });
    const cap = { kind: 'capacity', options: [{ id: '1' }, { id: '3' }, { id: '5' }, { id: 'all' }] };
    expect(decodeAnswer(cap, { score: 2.4, confidence: 0.6 }).answer).toBe('5');
    expect(decodeAnswer(cap, { score: 9, confidence: 0.6 }).answer).toBe('all');
    const promote = { kind: 'promote', options: [{ id: 'yes' }, { id: 'no' }] };
    expect(decodeAnswer(promote, { noul: 0.9 })).toEqual({ answer: 'yes', confidence: 0.8 });
    expect(decodeAnswer(promote, { noul: 0.1 }).answer).toBe('no');
    expect(decodeAnswer(choice, undefined)).toEqual({ answer: null, confidence: 0 });
  });
});

describe('createTypesafeAsk', () => {
  it('posts one batched request and maps answers back by hop id', async () => {
    const d = describeBrief(kaaro);
    const hops = buildFullQuestionnaire(d, { mode: 'slides' });
    let captured = null;
    const fetchFn = async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      const answers = {};
      for (const [k, q] of Object.entries(captured.body.questions)) {
        if (q.type === 'choice') answers[k] = { type: 'choice', choice: Object.keys(q.criteria)[0], confidence: 0.9, probabilities: {} };
        if (q.type === 'score')  answers[k] = { type: 'score', score: 1, confidence: 0.7, probabilities: {}, legend: {} };
        if (q.type === 'noul')   answers[k] = { type: 'noul', noul: 0.2 };
      }
      return { ok: true, json: async () => ({ model: 'jev-latest', answers, usage: { input_tokens: 10, output_tokens: 2 } }) };
    };
    const askBatch = createTypesafeAsk({ apiKey: 'k', fetchFn });
    const r = await askBatch(hops, d);
    expect(captured.url).toBe(TYPESAFE_ENDPOINT);
    expect(captured.init.headers.Authorization).toBe('Bearer k');
    expect(captured.body.model).toBe('jev-latest');
    expect(Object.keys(captured.body.questions).length).toBe(hops.length);
    expect(r.answers.layout).toBe(hops.find(h => h.id === 'layout').options[0].id); // stub picks the first criteria key
    expect(r.confidence.layout).toBe(0.9);
    expect(r.usage.input_tokens).toBe(10);
    const cap = hops.find(h => h.kind === 'capacity');
    expect(r.answers[cap.id]).toBe('3');
  });

  it('throws on non-2xx so the caller can fall back', async () => {
    const askBatch = createTypesafeAsk({ apiKey: 'k', fetchFn: async () => ({ ok: false, status: 401, text: async () => 'nope' }) });
    await expect(askBatch([{ id: 'layout', kind: 'layout', question: 'q', options: [{ id: 'a' }] }], {})).rejects.toThrow(/401/);
  });

  it('requires an api key and returns empty for no hops', async () => {
    expect(() => createTypesafeAsk({})).toThrow(/apiKey/);
    const askBatch = createTypesafeAsk({ apiKey: 'k', fetchFn: async () => { throw new Error('should not be called'); } });
    expect(await askBatch([], {})).toEqual({ answers: {}, confidence: {}, usage: null, raw: null });
  });
});
