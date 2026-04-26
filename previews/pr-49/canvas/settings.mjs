/**
 * canvas/settings.mjs — BYOM (Bring Your Own Model) settings panel.
 *
 * Renders a drawer where users can pick their LLM provider, enter API key /
 * endpoint / model, persist via saveLLMConfig(), and run a live ping test.
 *
 * Public API:
 *   mountSettings()          — call once after DOM ready; attaches to #settings-wrap
 *   toggleSettings(force?)   — open / close the drawer
 */

import { routeToProvider, loadLLMConfig, saveLLMConfig, clearLLMConfig, PROVIDERS }
  from '../pipeline/gateway/index.mjs';
import { getImageKey, setImageKey } from './scene-painter.mjs';
import { log } from '../logger.mjs';

// ── Provider metadata ─────────────────────────────────────────────────────────

const PROVIDER_META = {
  gemini: {
    label:         'Google Gemini',
    keyLabel:      'API Key',
    keyPlaceholder:'AIza...',
    keyHelp:       'Get a free key at aistudio.google.com',
    needsEndpoint: false,
    defaultModel:  'gemini-2.5-flash',
    modelHelp:     'Leave blank to use the auto-cascade',
  },
  openai: {
    label:         'OpenAI',
    keyLabel:      'API Key',
    keyPlaceholder:'sk-...',
    keyHelp:       'platform.openai.com → API keys',
    needsEndpoint: false,
    defaultModel:  'gpt-4o-mini',
    modelHelp:     'e.g. gpt-4o, gpt-4o-mini',
  },
  anthropic: {
    label:         'Anthropic Claude',
    keyLabel:      'API Key',
    keyPlaceholder:'sk-ant-...',
    keyHelp:       'console.anthropic.com → API keys',
    needsEndpoint: false,
    defaultModel:  'claude-haiku-4-5-20251001',
    modelHelp:     'e.g. claude-sonnet-4-6, claude-haiku-4-5-20251001',
  },
  custom: {
    label:         'Custom / Local (OpenAI-compatible)',
    keyLabel:      'API Key',
    keyPlaceholder:'(leave blank for local Ollama)',
    keyHelp:       'Bearer token, or blank for unauthenticated',
    needsEndpoint: true,
    defaultModel:  '',
    modelHelp:     'e.g. llama3, mistral, phi3',
  },
};

// ── State ─────────────────────────────────────────────────────────────────────

let _open      = false;
let _mounted   = false;
let _testAbort = null;

// ── DOM helpers ───────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _q(sel) { return document.querySelector(sel); }

// ── Render ────────────────────────────────────────────────────────────────────

function _render() {
  const wrap = document.getElementById('settings-wrap');
  if (!wrap) return;
  const cfg      = loadLLMConfig() ?? {};
  const provider = cfg.provider ?? 'gemini';
  const meta     = PROVIDER_META[provider] ?? PROVIDER_META.gemini;

  const providerOptions = PROVIDERS.map(p =>
    `<option value="${p}"${p === provider ? ' selected' : ''}>${PROVIDER_META[p].label}</option>`
  ).join('');

  const endpointRow = `
    <div class="set-row" id="set-endpoint-row" style="${meta.needsEndpoint ? '' : 'display:none'}">
      <label for="set-endpoint">Endpoint URL</label>
      <input id="set-endpoint" type="url" autocomplete="off"
             placeholder="http://localhost:11434/v1/chat/completions"
             value="${_esc(cfg.endpoint ?? '')}">
    </div>`;

  wrap.querySelector('.settings-body').innerHTML = `
    <div class="set-row">
      <label for="set-provider">Provider</label>
      <select id="set-provider">${providerOptions}</select>
    </div>

    <div class="set-row">
      <label for="set-apikey">${_esc(meta.keyLabel)}</label>
      <input id="set-apikey" type="password" autocomplete="off"
             placeholder="${_esc(meta.keyPlaceholder)}"
             value="${_esc(cfg.apiKey ?? '')}">
      <span class="set-help">${_esc(meta.keyHelp)}</span>
    </div>

    ${endpointRow}

    <div class="set-row">
      <label for="set-model">Model <span class="set-opt">(optional)</span></label>
      <input id="set-model" type="text" autocomplete="off"
             placeholder="${_esc(meta.defaultModel || meta.modelHelp)}"
             value="${_esc(cfg.model ?? '')}">
      <span class="set-help">${_esc(meta.modelHelp)}</span>
    </div>

    <div class="set-actions">
      <button id="set-save-btn"  class="set-btn set-btn-primary">Save</button>
      <button id="set-test-btn"  class="set-btn">Test connection</button>
      <button id="set-clear-btn" class="set-btn set-btn-danger">Clear</button>
    </div>

    <div id="set-status" class="set-status"></div>

    <div class="set-section-hdr">◆ SCENE PAINTER</div>

    <div class="set-row">
      <label for="set-img-key">Gemini Image Key</label>
      <input id="set-img-key" type="password" autocomplete="off"
             placeholder="AIza… (leave blank to reuse Gemini LLM key above)"
             value="${_esc(getImageKey())}">
      <span class="set-help">Powers ◆ PAINT on each slide. Uses gemini-2.5-flash-image — ~1 290 tokens / image.</span>
    </div>

    <div class="set-actions">
      <button id="set-img-save-btn" class="set-btn set-btn-primary">Save image key</button>
    </div>

    <div id="set-img-status" class="set-status"></div>
  `;

  _bindEvents();
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function _bindEvents() {
  _q('#set-provider')?.addEventListener('change', e => {
    const meta = PROVIDER_META[e.target.value] ?? PROVIDER_META.gemini;
    const endpointRow = _q('#set-endpoint-row');
    if (endpointRow) endpointRow.style.display = meta.needsEndpoint ? '' : 'none';
  });

  _q('#set-save-btn')?.addEventListener('click', _onSave);
  _q('#set-test-btn')?.addEventListener('click', _onTest);
  _q('#set-clear-btn')?.addEventListener('click', _onClear);
  _q('#set-img-save-btn')?.addEventListener('click', _onImgSave);
}

function _readForm() {
  return {
    provider: _q('#set-provider')?.value ?? 'gemini',
    apiKey:   _q('#set-apikey')?.value?.trim() ?? '',
    endpoint: _q('#set-endpoint')?.value?.trim() || undefined,
    model:    _q('#set-model')?.value?.trim()    || undefined,
  };
}

function _setStatus(msg, type = 'info') {
  const el = _q('#set-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = `set-status set-status-${type}`;
}

function _onSave() {
  const cfg = _readForm();
  if (!cfg.apiKey && cfg.provider !== 'custom') {
    _setStatus('API key is required.', 'error'); return;
  }
  saveLLMConfig(cfg);
  _setStatus('Saved.', 'ok');
  log('SYSTEM', `[settings] LLM config saved — provider: ${cfg.provider}`);
  setTimeout(() => _setStatus(''), 3000);
}

async function _onTest() {
  const cfg = _readForm();
  if (!cfg.apiKey && cfg.provider !== 'custom') {
    _setStatus('Enter an API key first.', 'error'); return;
  }
  if (cfg.provider === 'custom' && !cfg.endpoint) {
    _setStatus('Endpoint URL is required for custom provider.', 'error'); return;
  }

  _setStatus('Testing…', 'info');
  const btn = _q('#set-test-btn');
  if (btn) btn.disabled = true;

  try {
    const result = await routeToProvider(
      cfg.provider,
      'Reply with exactly the word PONG and nothing else.',
      cfg
    );
    const pong = result.text.trim().toUpperCase().includes('PONG');
    _setStatus(
      pong
        ? `Connected — ${result.model ?? cfg.provider}, ${result.inputTokens}in/${result.outputTokens}out`
        : `Unexpected response: "${result.text.slice(0, 60)}"`,
      pong ? 'ok' : 'warn'
    );
    log('SYSTEM', `[settings] test ${pong ? 'passed' : 'unexpected'} — ${result.model ?? cfg.provider}`);
  } catch (e) {
    _setStatus(`Error: ${e.message.slice(0, 120)}`, 'error');
    log('ERROR', `[settings] test failed: ${e.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function _onClear() {
  clearLLMConfig();
  _setStatus('Config cleared.', 'warn');
  log('SYSTEM', '[settings] LLM config cleared');
  setTimeout(() => { _setStatus(''); _render(); }, 1500);
}

function _onImgSave() {
  const key = _q('#set-img-key')?.value?.trim() ?? '';
  setImageKey(key);
  const el = _q('#set-img-status');
  if (el) { el.textContent = key ? 'Image key saved.' : 'Image key cleared (will use Gemini LLM key).'; el.className = 'set-status set-status-ok'; }
  log('SYSTEM', `[settings] image key ${key ? 'saved' : 'cleared'}`);
  setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function mountSettings() {
  if (_mounted) return;
  _mounted = true;

  const wrap = document.getElementById('settings-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="settings-header">
      <span class="settings-title">⚙ MODEL SETTINGS</span>
      <button id="settings-close" aria-label="Close settings">✕</button>
    </div>
    <div class="settings-body"></div>
  `;

  document.getElementById('settings-close')
    ?.addEventListener('click', () => toggleSettings(false));

  _render();
}

export function toggleSettings(force) {
  _open = force !== undefined ? Boolean(force) : !_open;
  const wrap = document.getElementById('settings-wrap');
  if (!wrap) return;
  if (_open) {
    _render();
    wrap.classList.add('open');
    wrap.setAttribute('aria-hidden', 'false');
    _q('#set-apikey')?.focus();
  } else {
    wrap.classList.remove('open');
    wrap.setAttribute('aria-hidden', 'true');
  }
}

export function isSettingsOpen() { return _open; }
