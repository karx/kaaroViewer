/**
 * pipeline/gateway/gateway.test.mjs — Unit tests for all provider adapters.
 * Uses injectable fetchFn — no real API calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { callGemini }    from './gemini.mjs';
import { callAnthropic } from './anthropic.mjs';
import { callOpenAI }    from './openai.mjs';
import { callCustom }    from './custom.mjs';
import { routeToProvider, PROVIDERS } from './index.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body, status = 200) {
  return vi.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    text:   async () => JSON.stringify(body),
    json:   async () => body,
  });
}

function mockFetchError(status, errorBody) {
  return vi.fn().mockResolvedValue({
    ok:     false,
    status,
    text:   async () => JSON.stringify(errorBody),
    json:   async () => errorBody,
  });
}

// ── Gemini ────────────────────────────────────────────────────────────────────

describe('callGemini', () => {
  const config = { apiKey: 'test-key' };

  it('extracts text from a successful response', async () => {
    const body = {
      candidates: [{ content: { parts: [{ text: 'hello world' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    };
    const result = await callGemini('test prompt', config, mockFetch(body));
    expect(result.text).toBe('hello world');
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.finishReason).toBe('STOP');
  });

  it('includes the API key in the query string', async () => {
    const fetchFn = mockFetch({
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      usageMetadata: {},
    });
    await callGemini('prompt', config, fetchFn);
    const calledUrl = fetchFn.mock.calls[0][0];
    expect(calledUrl).toContain('key=test-key');
  });

  it('throws on non-429 HTTP error', async () => {
    const fetchFn = mockFetchError(400, { error: { message: 'bad request' } });
    await expect(callGemini('prompt', config, fetchFn)).rejects.toThrow('HTTP 400');
  });

  it('throws with clear message when apiKey is missing', async () => {
    await expect(callGemini('prompt', {}, mockFetch({}))).rejects.toThrow('apiKey is required');
  });

  it('uses the specified model when config.model is set', async () => {
    const fetchFn = mockFetch({
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      usageMetadata: {},
    });
    await callGemini('prompt', { apiKey: 'k', model: 'gemini-1.5-pro' }, fetchFn);
    expect(fetchFn.mock.calls[0][0]).toContain('gemini-1.5-pro');
  });
});

// ── Anthropic ─────────────────────────────────────────────────────────────────

describe('callAnthropic', () => {
  const config = { apiKey: 'sk-ant-test' };

  it('extracts text from a successful response', async () => {
    const body = {
      content:    [{ type: 'text', text: 'answer text' }],
      usage:      { input_tokens: 20, output_tokens: 8 },
      stop_reason: 'end_turn',
    };
    const result = await callAnthropic('question', config, mockFetch(body));
    expect(result.text).toBe('answer text');
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(8);
    expect(result.finishReason).toBe('end_turn');
  });

  it('sends x-api-key and anthropic-version headers', async () => {
    const fetchFn = mockFetch({
      content: [{ type: 'text', text: '' }],
      usage: {},
    });
    await callAnthropic('p', config, fetchFn);
    const headers = fetchFn.mock.calls[0][1].headers;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('throws on API error with status and message', async () => {
    const fetchFn = mockFetchError(401, { error: { type: 'authentication_error', message: 'invalid key' } });
    await expect(callAnthropic('p', config, fetchFn)).rejects.toThrow('401');
  });

  it('appends /messages to endpoint when missing', async () => {
    const fetchFn = mockFetch({ content: [{ type: 'text', text: '' }], usage: {} });
    await callAnthropic('p', { apiKey: 'k', endpoint: 'https://proxy.example.com/v1' }, fetchFn);
    expect(fetchFn.mock.calls[0][0]).toContain('/messages');
  });
});

// ── OpenAI ────────────────────────────────────────────────────────────────────

describe('callOpenAI', () => {
  const config = { apiKey: 'sk-openai-test' };

  it('extracts text from a successful response', async () => {
    const body = {
      choices: [{ message: { content: 'openai response' }, finish_reason: 'stop' }],
      usage:   { prompt_tokens: 15, completion_tokens: 6 },
    };
    const result = await callOpenAI('question', config, mockFetch(body));
    expect(result.text).toBe('openai response');
    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(6);
  });

  it('sends Bearer auth header', async () => {
    const fetchFn = mockFetch({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {} });
    await callOpenAI('p', config, fetchFn);
    expect(fetchFn.mock.calls[0][1].headers['Authorization']).toBe('Bearer sk-openai-test');
  });

  it('throws when apiKey is missing', async () => {
    await expect(callOpenAI('p', {}, mockFetch({}))).rejects.toThrow('apiKey is required');
  });
});

// ── Custom ────────────────────────────────────────────────────────────────────

describe('callCustom', () => {
  const config = { apiKey: 'local', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3' };

  it('extracts text from OpenAI-compatible response', async () => {
    const body = {
      choices: [{ message: { content: 'local response' }, finish_reason: 'stop' }],
      usage:   { prompt_tokens: 8, completion_tokens: 3 },
    };
    const result = await callCustom('hi', config, mockFetch(body));
    expect(result.text).toBe('local response');
  });

  it('uses the provided endpoint as-is', async () => {
    const fetchFn = mockFetch({ choices: [{ message: { content: '' } }], usage: {} });
    await callCustom('p', config, fetchFn);
    expect(fetchFn.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('throws when endpoint is missing', async () => {
    await expect(callCustom('p', { apiKey: 'x' }, mockFetch({}))).rejects.toThrow('endpoint is required');
  });
});

// ── routeToProvider ───────────────────────────────────────────────────────────

describe('routeToProvider', () => {
  it('routes to the correct adapter by name', async () => {
    const body = {
      choices: [{ message: { content: 'routed' }, finish_reason: 'stop' }],
      usage:   { prompt_tokens: 1, completion_tokens: 1 },
    };
    const result = await routeToProvider(
      'openai', 'prompt',
      { apiKey: 'k', endpoint: 'https://api.openai.com/v1/chat/completions' },
      mockFetch(body)
    );
    expect(result.text).toBe('routed');
  });

  it('throws on unknown provider', async () => {
    await expect(
      routeToProvider('unknown', 'p', { apiKey: 'k' }, mockFetch({}))
    ).rejects.toThrow('Unknown provider: "unknown"');
  });

  it('exports all expected provider names', () => {
    expect(PROVIDERS).toEqual(expect.arrayContaining(['gemini', 'openai', 'anthropic', 'custom']));
  });
});
