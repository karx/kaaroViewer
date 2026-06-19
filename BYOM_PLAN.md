# kaaroViewer BYOM (Bring Your Own Model) — Architecture & Implementation Plan

## Overview

**Goal**: Allow users to configure any LLM provider (Google Gemini, OpenAI, Anthropic, or custom OpenAI-compatible endpoints like Ollama/LM Studio) via a browser-based settings UI. The config persists in `localStorage` and is used by the exploration pipeline (`pipeline/explore.mjs`) for AI-driven knowledge graph generation.

---

## System Components

### 1. Gateway Layer (`pipeline/gateway/`)

| File | Role |
|------|------|
| `index.mjs` | Central dispatcher: `routeToProvider()`, config persistence (`saveLLMConfig`, `loadLLMConfig`, `clearLLMConfig`), provider registry |
| `gemini.mjs` | Google Gemini API adapter with model cascade (2.5-flash → 2.0-flash-lite → 2.0-flash → 1.5-flash) and 429 retry logic |
| `openai.mjs` | OpenAI Chat Completions adapter (default: `gpt-4o-mini`) |
| `anthropic.mjs` | Anthropic Messages API adapter (default: `claude-haiku-4-5-20251001`) |
| `custom.mjs` | OpenAI-compatible adapter for local models (Ollama, LM Studio, vLLM, proxies) |

**Key API**:
```js
import { routeToProvider, loadLLMConfig, saveLLMConfig, PROVIDERS } from './pipeline/gateway/index.mjs';

// Provider dispatch
const result = await routeToProvider('anthropic', prompt, { apiKey: 'sk-ant-...', model: 'claude-sonnet-4-6' });

// Config persistence
saveLLMConfig({ provider: 'openai', apiKey: 'sk-...', model: 'gpt-4o' });
const cfg = loadLLMConfig(); // → { provider, apiKey, endpoint?, model? }
```

---

### 2. Exploration Pipeline Integration (`pipeline/explore.mjs`)

LLM resolution order (priority ↓):
1. **`window.kaaro_llm`** — Host-injected function (highest priority, for embedding/SSO)
2. **Gateway config** — `localStorage.getItem('kv.llm')` via `loadLLMConfig()`
3. **Legacy** — `localStorage.gemini_api_key` (backward compat)

```js
// In _callLLM():
if (window.kaaro_llm) return window.kaaro_llm(prompt, opts);           // 1. Host-injected
const config = loadLLMConfig();
if (config?.provider && config?.apiKey) return routeToProvider(...);  // 2. BYOM
if (legacyKey) return routeToProvider('gemini', prompt, { apiKey: legacyKey }); // 3. Legacy
throw new Error('No LLM provider configured...');
```

---

### 3. Settings UI (`canvas/settings.mjs`)

A modal drawer (`#settings-wrap`) mounted at startup via `mountSettings()`.

**Features**:
- Provider selector dropdown (Gemini, OpenAI, Anthropic, Custom)
- Dynamic form fields based on provider:
  - API Key (password input, with provider-specific help text + placeholder)
  - Endpoint URL (only for **Custom** provider)
  - Model name (optional, with provider-specific default + help)
- **Save** → persists to `localStorage` via `saveLLMConfig()`
- **Test connection** → sends "Reply with exactly the word PONG" via `routeToProvider()`, validates response
- **Clear** → removes `kv.llm` from localStorage
- **Scene Painter image key** — separate Gemini key for image generation (P-key feature)

**Provider metadata** (`PROVIDER_META`):
```js
const PROVIDER_META = {
  gemini: {
    label: 'Google Gemini',
    keyLabel: 'API Key',
    keyPlaceholder: 'AIza...',
    keyHelp: 'Get a free key at aistudio.google.com',
    needsEndpoint: false,
    defaultModel: 'gemini-2.5-flash',
    modelHelp: 'Leave blank to use the auto-cascade',
  },
  openai: { ... },
  anthropic: { ... },
  custom: {
    label: 'Custom / Local (OpenAI-compatible)',
    needsEndpoint: true,
    keyPlaceholder: '(leave blank for local Ollama)',
    keyHelp: 'Bearer token, or blank for unauthenticated',
    defaultModel: '',
    modelHelp: 'e.g. llama3, mistral, phi3',
  },
};
```

---

### 4. UI Integration (`main.mjs` + `index.html`)

- **Settings button**: `<button id="settings-btn">⚙ MODEL</button>` in action bar
- Click handler: `toggleSettings()` from `canvas/settings.mjs`
- Mounted in `main.mjs` after scene init (skipped in `EMBED_MODE`)

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User clicks ⚙ MODEL button in action bar                        │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Settings drawer opens (mountSettings → _render())               │
│  - Loads existing config from localStorage kv.llm               │
│  - Shows provider selector, API key, [endpoint], model fields   │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ User selects provider, fills fields, clicks "Save"              │
│  → _readForm() → saveLLMConfig(cfg) → localStorage kv.llm       │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ User clicks "Test connection"                                   │
│  → routeToProvider(cfg.provider, "PONG prompt", cfg)            │
│  → Shows success/failure with token counts & model name         │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ User types a topic in Explore input → runExploration()          │
│  → pipeline/explore.mjs → _callLLM()                            │
│  → loadLLMConfig() → routeToProvider() → LLM API                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration Schema

```json
// localStorage key: "kv.llm"
{
  "provider": "gemini" | "openai" | "anthropic" | "custom",
  "apiKey": "string (required, except custom can be blank)",
  "endpoint": "string (required only for custom)",
  "model": "string (optional, provider-specific defaults apply)"
}
```

**Examples**:
```js
// Gemini (uses auto-cascade if model omitted)
saveLLMConfig({ provider: 'gemini', apiKey: 'AIzaSy...' });

// OpenAI
saveLLMConfig({ provider: 'openai', apiKey: 'sk-...', model: 'gpt-4o' });

// Anthropic
saveLLMConfig({ provider: 'anthropic', apiKey: 'sk-ant-...', model: 'claude-sonnet-4-6' });

// Custom (Ollama local)
saveLLMConfig({ 
  provider: 'custom', 
  endpoint: 'http://localhost:11434/v1/chat/completions', 
  model: 'llama3', 
  apiKey: '' // optional for local
});

// Custom (OpenAI proxy)
saveLLMConfig({ 
  provider: 'custom', 
  endpoint: 'https://api.my-proxy.com/v1/chat/completions', 
  apiKey: 'sk-proxy-...', 
  model: 'gpt-4o' 
});
```

---

## Provider-Specific Behavior

| Provider | Auth | Default Model | Special Handling |
|----------|------|---------------|------------------|
| **Gemini** | `key=` query param | `gemini-2.5-flash` | Model cascade on 429; thinking budget = 0 for JSON tasks |
| **OpenAI** | `Authorization: Bearer` | `gpt-4o-mini` | Standard chat completions |
| **Anthropic** | `x-api-key` + `anthropic-version` | `claude-haiku-4-5-20251001` | Messages API |
| **Custom** | `Authorization: Bearer` (optional) | User-specified | Any OpenAI-compatible endpoint |

---

## Testing

### Unit Tests (`pipeline/gateway/gateway.test.mjs`)
- `callGemini` → extracts text, includes API key, uses specified model, throws on 400, retries on 429, cascade advances
- `callOpenAI` → success, auth error, missing key
- `callAnthropic` → success, auth error, custom endpoint
- `callCustom` → success, error, blank API key allowed
- `routeToProvider` → dispatches correctly, throws on unknown

### Run tests:
```bash
pnpm test                          # All tests
pnpm test pipeline/gateway/gateway.test.mjs  # Gateway only
```

---

## Migration Path for Existing Users

| Legacy Method | Status | Migration |
|---------------|--------|-----------|
| `localStorage.gemini_api_key` | Supported (fallback #3) | Click **Test** in settings → auto-saves as Gemini config |
| `window.kaaro.registerLLM(fn)` | Supported (highest priority) | No change needed — continues to work |

---

## Extensibility

### Adding a New Provider
1. Create `pipeline/gateway/<provider>.mjs` with `call<Provider>(prompt, config, fetchFn)` signature
2. Export from `pipeline/gateway/index.mjs`:
   ```js
   import { callNewProvider } from './newprovider.mjs';
   const ADAPTERS = { ..., newprovider: callNewProvider };
   export const PROVIDERS = ['...', 'newprovider'];
   ```
3. Add entry to `PROVIDER_META` in `canvas/settings.mjs`

### Host-Injected LLM (for embedding/SSO)
```js
// In parent app before loading kaaroViewer
window.kaaro = { registerLLM: (fn) => { window.kaaro_llm = fn; } };
// Or directly:
window.kaaro_llm = async (prompt, { temperature, maxTokens }) => {
  const response = await mySSOClient.complete(prompt, { temperature, maxTokens });
  return response.text;
};
```

---

## Security Notes

- **API keys stored in `localStorage`** — accessible to any script on the same origin
- **No server-side proxy** — calls go directly from browser to provider APIs
- **CORS** — providers must allow browser requests (all major providers do)
- **Custom provider** — use HTTPS in production; HTTP allowed for `localhost` (Ollama)

---

## Related Files

```
/Users/arshigoyal/kaaro/src/kaaroViewer/
├── pipeline/gateway/
│   ├── index.mjs          # Dispatcher + config helpers
│   ├── gemini.mjs
│   ├── openai.mjs
│   ├── anthropic.mjs
│   ├── custom.mjs
│   └── gateway.test.mjs   # 18 tests
├── pipeline/explore.mjs           # _callLLM() resolution logic
├── canvas/settings.mjs            # Settings drawer UI + test connection
├── canvas/explore-ui.mjs          # Explore input (triggers pipeline)
├── canvas/exploration-pipeline.mjs # runExploration() orchestrator
└── main.mjs                       # App bootstrap + settings mount
```

---

## Quick Reference for Agents

| Task | Code |
|------|------|
| Register host LLM | `window.kaaro.registerLLM(async (prompt, opts) => '...')` |
| Save BYOM config programmatically | `import { saveLLMConfig } from './pipeline/gateway/index.mjs'; saveLLMConfig({...})` |
| Load current config | `import { loadLLMConfig } from './pipeline/gateway/index.mjs'; const cfg = loadLLMConfig()` |
| Test a provider config | `import { routeToProvider } from './pipeline/gateway/index.mjs'; await routeToProvider('openai', 'PONG', {apiKey: 'sk-...'})` |
| Open settings UI | `import { toggleSettings } from './canvas/settings.mjs'; toggleSettings(true)` |

---

*Generated: 2026-06-13 — kaaroViewer 3.0.0*