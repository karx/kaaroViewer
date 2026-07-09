/**
 * vid/tts.mjs — narration synthesis with pluggable providers.
 *
 * Provider resolution order (first available wins):
 *   1. piper   — neural TTS. Needs the `piper` binary plus a voice model:
 *                set KAARO_PIPER_VOICE=/path/to/voice.onnx (its .onnx.json
 *                config must sit beside it). Best quality, fully offline.
 *   2. command — bring-your-own: KAARO_TTS_CMD is a shell template with
 *                {text} and {out} placeholders (e.g. a curl to a cloud TTS).
 *                {text} is shell-escaped for you.
 *   3. espeak  — espeak-ng, robotic but dependency-light and always
 *                installable offline (`apt-get install espeak-ng`).
 *
 * All providers must produce a WAV at the requested path. Duration is
 * probed afterwards by the caller — never estimated from text length.
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function sh(cmd, { input } = {}) {
  return new Promise((res, rej) => {
    const child = spawn('sh', ['-c', cmd], { stdio: [input != null ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', rej);
    child.on('close', code => code === 0 ? res() : rej(new Error(`tts command exit ${code}: ${stderr.slice(-800)}`)));
    if (input != null) { child.stdin.write(input); child.stdin.end(); }
  });
}

function binExists(bin) {
  return new Promise(res => {
    const child = spawn('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
    child.on('error', () => res(false));
    child.on('close', code => res(code === 0));
  });
}

const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

export const PROVIDERS = {
  piper: {
    async available() {
      const voice = process.env.KAARO_PIPER_VOICE;
      return !!voice && existsSync(voice) && await binExists('piper');
    },
    async synthesize(text, out) {
      await sh(`piper -m ${shq(process.env.KAARO_PIPER_VOICE)} -f ${shq(out)}`, { input: text });
    },
  },
  command: {
    async available() { return !!process.env.KAARO_TTS_CMD; },
    async synthesize(text, out) {
      const cmd = process.env.KAARO_TTS_CMD
        .replaceAll('{text}', shq(text))
        .replaceAll('{out}', shq(out));
      await sh(cmd);
    },
  },
  espeak: {
    async available() { return binExists('espeak-ng'); },
    async synthesize(text, out) {
      // tuned for narration: slightly slow, lower pitch, en-us
      await sh(`espeak-ng -v en-us -s 150 -p 38 -a 175 -w ${shq(out)} ${shq(text)}`);
    },
  },
};

/** Name of the first available provider, or null. */
export async function detectProvider() {
  for (const name of ['piper', 'command', 'espeak']) {
    if (await PROVIDERS[name].available()) return name;
  }
  return null;
}

/**
 * Synthesize text to a WAV at `out`. provider 'auto' (default) picks the
 * best available. Returns { out, provider }.
 */
export async function synthesize(text, out, { provider = 'auto' } = {}) {
  const name = provider === 'auto' ? await detectProvider() : provider;
  if (!name) throw new Error('no TTS provider available — install espeak-ng, set KAARO_PIPER_VOICE, or set KAARO_TTS_CMD');
  const impl = PROVIDERS[name];
  if (!impl) throw new Error(`unknown TTS provider "${name}" (piper|command|espeak)`);
  if (provider !== 'auto' && !(await impl.available())) {
    throw new Error(`TTS provider "${name}" is not available in this environment`);
  }
  await mkdir(dirname(resolve(out)), { recursive: true });
  await impl.synthesize(text, out);
  if (!existsSync(out)) throw new Error(`TTS provider "${name}" produced no file at ${out}`);
  return { out, provider: name };
}
