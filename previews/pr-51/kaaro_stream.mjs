/**
 * kaaro_stream.mjs — Event stream adapter for kaaroViewer.
 *
 * Opens persistent event streams (WebSocket, SSE, MQTT-over-WS, or custom)
 * and routes incoming text events into the unified inputBus, which dispatches
 * them through the full pipeline: source prefix detection → Wikidata resolve
 * → LLM exploration fallback.
 *
 * Usage:
 *   import { KaaroStream, WebSocketSource, SSESource, CustomSource } from './kaaro_stream.mjs';
 *
 *   const stream = new KaaroStream(new WebSocketSource('ws://localhost:1884/kaaro'), {
 *     debounce:  800,
 *     dedupe:    true,
 *     dedupeMs:  5000,
 *     transform: text => text.trim(),
 *   });
 *   stream.connect();
 *   stream.disconnect();
 *
 * Source contracts:
 *   Each source extends StreamSource (EventTarget) and emits 'text' events
 *   with a .text property. KaaroStream debounces + dedupes, then calls
 *   inputBus.push(text, 'stream').
 */

import { inputBus } from './pipeline/input.mjs';
import { log }      from './logger.mjs';

// ── Source base ───────────────────────────────────────────────────────────────

export class StreamSource extends EventTarget {
  connect()    { throw new Error(`${this.constructor.name}.connect() not implemented`); }
  disconnect() { throw new Error(`${this.constructor.name}.disconnect() not implemented`); }

  _emit(text) {
    if (typeof text !== 'string' || !text.trim()) return;
    this.dispatchEvent(Object.assign(new Event('text'), { text: text.trim() }));
  }
}

// ── WebSocket source ──────────────────────────────────────────────────────────

export class WebSocketSource extends StreamSource {
  constructor(url) {
    super();
    this._url = url;
    this._ws  = null;
  }

  connect() {
    if (this._ws) return;
    this._ws = new WebSocket(this._url);
    this._ws.addEventListener('open',    () => log('SYSTEM', `[stream] WebSocket connected: ${this._url}`));
    this._ws.addEventListener('close',   () => log('SYSTEM', `[stream] WebSocket closed: ${this._url}`));
    this._ws.addEventListener('error',   () => log('ERROR',  `[stream] WebSocket error: ${this._url}`));
    this._ws.addEventListener('message', e  => this._emit(typeof e.data === 'string' ? e.data : JSON.stringify(e.data)));
  }

  disconnect() {
    this._ws?.close();
    this._ws = null;
  }
}

// ── SSE source ────────────────────────────────────────────────────────────────

export class SSESource extends StreamSource {
  constructor(url, eventName = 'message') {
    super();
    this._url       = url;
    this._eventName = eventName;
    this._es        = null;
  }

  connect() {
    if (this._es) return;
    this._es = new EventSource(this._url);
    this._es.addEventListener(this._eventName, e => this._emit(e.data));
    this._es.addEventListener('error', () => log('ERROR', `[stream] SSE error: ${this._url}`));
    log('SYSTEM', `[stream] SSE connected: ${this._url}`);
  }

  disconnect() {
    this._es?.close();
    this._es = null;
  }
}

// ── Custom (function) source ──────────────────────────────────────────────────

export class CustomSource extends StreamSource {
  constructor(setupFn) {
    super();
    this._setupFn  = setupFn;
    this._teardown = null;
  }

  connect() {
    this._teardown = this._setupFn(text => this._emit(text)) ?? null;
    log('SYSTEM', '[stream] CustomSource connected');
  }

  disconnect() {
    if (typeof this._teardown === 'function') this._teardown();
    this._teardown = null;
  }
}

// ── KaaroStream orchestrator ──────────────────────────────────────────────────

export class KaaroStream {
  /**
   * @param {StreamSource} source
   * @param {object}      [opts]
   * @param {number}      [opts.debounce=500]  — ms to wait for burst to settle
   * @param {boolean}     [opts.dedupe=true]   — skip repeat payloads
   * @param {number}      [opts.dedupeMs=5000] — dedupe window in ms
   * @param {(t:string)=>string} [opts.transform] — pre-process text before pipeline
   */
  constructor(source, opts = {}) {
    this._source    = source;
    this._debounce  = opts.debounce  ?? 500;
    this._dedupe    = opts.dedupe    !== false;
    this._dedupeMs  = opts.dedupeMs  ?? 5000;
    this._transform = opts.transform ?? (t => t);
    this._timer     = null;
    this._pending   = null;
    this._seen      = new Map(); // text → timestamp
    this._handler   = this._onText.bind(this);
  }

  connect() {
    this._source.addEventListener('text', this._handler);
    this._source.connect();
    log('SYSTEM', `[stream] KaaroStream connected (debounce=${this._debounce}ms, dedupe=${this._dedupe})`);
  }

  disconnect() {
    clearTimeout(this._timer);
    this._timer   = null;
    this._pending = null;
    this._source.removeEventListener('text', this._handler);
    this._source.disconnect();
    log('SYSTEM', '[stream] KaaroStream disconnected');
  }

  _onText(e) {
    const text = this._transform(e.text);
    if (!text) return;
    this._pending = text;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), this._debounce);
  }

  _flush() {
    const text = this._pending;
    this._pending = null;
    if (!text) return;

    if (this._dedupe) {
      const now  = Date.now();
      const last = this._seen.get(text);
      if (last && (now - last) < this._dedupeMs) {
        log('SYSTEM', `[stream] dedupe suppressed: "${text.slice(0, 60)}"`);
        return;
      }
      this._seen.set(text, now);
      for (const [k, t] of this._seen) {
        if (now - t > this._dedupeMs) this._seen.delete(k);
      }
    }

    log('SYSTEM', `[stream] → pipeline: "${text.slice(0, 80)}"`);
    inputBus.push(text, 'stream');
  }
}

// ── Singleton registry ────────────────────────────────────────────────────────

const _streams = new Map();

export function registerStream(name, stream) {
  if (_streams.has(name)) _streams.get(name).disconnect();
  _streams.set(name, stream);
  return stream;
}

export function getStream(name)  { return _streams.get(name) ?? null; }
export function disconnectAll()  { for (const s of _streams.values()) s.disconnect(); _streams.clear(); }
export function listStreams()    { return [..._streams.keys()]; }
