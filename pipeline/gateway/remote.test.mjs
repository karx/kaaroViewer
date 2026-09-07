/**
 * pipeline/gateway/remote.test.mjs — Unit tests for the shared Kaaro gateway
 * client adapter. Uses an injectable `callable` fake — no real Firebase
 * project or network calls, matching the fetchFn-injection pattern used by
 * the local provider adapters in gateway.test.mjs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callSharedGateway, saveSharedGatewaySettings } from './remote.mjs';
import { isSharedGatewayEnabled, setSharedGatewayEnabled } from './index.mjs';

describe('callSharedGateway', () => {
  it('calls the callable with product + prompts and unwraps the response', async () => {
    const callable = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: { text: 'a haiku', inputTokens: 120, outputTokens: 18, finishReason: 'STOP' },
      },
    });

    const result = await callSharedGateway('sys prompt', 'user prompt', { sessionId: 'sess1' }, callable);

    expect(callable).toHaveBeenCalledWith({
      product: 'kaaroViewer',
      systemPrompt: 'sys prompt',
      userPrompt: 'user prompt',
      sessionId: 'sess1',
    });
    expect(result).toEqual({
      text: 'a haiku', inputTokens: 120, outputTokens: 18, finishReason: 'STOP',
    });
  });

  it('throws a clear error when the response has no payload', async () => {
    const callable = vi.fn().mockResolvedValue({ data: {} });
    await expect(
      callSharedGateway('sys', 'user', {}, callable)
    ).rejects.toThrow('unexpected response');
  });

  it('works without sessionId', async () => {
    const callable = vi.fn().mockResolvedValue({
      data: { success: true, data: { text: 'ok', inputTokens: 1, outputTokens: 1, finishReason: 'STOP' } },
    });
    await callSharedGateway('sys', 'user', {}, callable);
    expect(callable).toHaveBeenCalledWith({
      product: 'kaaroViewer', systemPrompt: 'sys', userPrompt: 'user', sessionId: undefined,
    });
  });
});

describe('saveSharedGatewaySettings', () => {
  it('forwards product + settings to the callable', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { success: true } });

    const result = await saveSharedGatewaySettings(
      { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      callable
    );

    expect(callable).toHaveBeenCalledWith({
      product: 'kaaroViewer', provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini',
    });
    expect(result).toEqual({ success: true });
  });

  it('supports clearing settings with provider: null', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { success: true, cleared: true } });
    const result = await saveSharedGatewaySettings({ provider: null }, callable);
    expect(callable).toHaveBeenCalledWith({ product: 'kaaroViewer', provider: null });
    expect(result).toEqual({ success: true, cleared: true });
  });
});

describe('shared gateway opt-in flag', () => {
  beforeEach(() => { localStorage.clear(); });

  it('defaults to disabled', () => {
    expect(isSharedGatewayEnabled()).toBe(false);
  });

  it('persists enable/disable across calls', () => {
    setSharedGatewayEnabled(true);
    expect(isSharedGatewayEnabled()).toBe(true);
    setSharedGatewayEnabled(false);
    expect(isSharedGatewayEnabled()).toBe(false);
  });
});
