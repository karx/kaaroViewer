import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFile, rm, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { resolveSource, normalizeSourceUrl, SOURCE_FILENAME } from './resolve-source.mjs';

function mockFetch(body, status = 200, contentType = 'text/plain') {
  return vi.fn().mockResolvedValue({
    ok: status < 300, status,
    text: async () => body,
    headers: { get: h => (h.toLowerCase() === 'content-type' ? contentType : null) },
  });
}

describe('normalizeSourceUrl', () => {
  it('rewrites a github.com blob URL to raw.githubusercontent.com', () => {
    expect(normalizeSourceUrl('https://github.com/karx/alfred-buildathon/blob/main/DISCORD_INTEGRATION.md'))
      .toBe('https://raw.githubusercontent.com/karx/alfred-buildathon/main/DISCORD_INTEGRATION.md');
  });

  it('rewrites a bare repo-root URL to the raw README on HEAD', () => {
    expect(normalizeSourceUrl('https://github.com/karx/alfred-buildathon'))
      .toBe('https://raw.githubusercontent.com/karx/alfred-buildathon/HEAD/README.md');
  });

  it('rewrites a repo-root URL with a trailing slash the same way', () => {
    expect(normalizeSourceUrl('https://github.com/karx/alfred-buildathon/'))
      .toBe('https://raw.githubusercontent.com/karx/alfred-buildathon/HEAD/README.md');
  });

  it('leaves non-github URLs untouched', () => {
    expect(normalizeSourceUrl('https://example.com/report.md')).toBe('https://example.com/report.md');
  });

  it('leaves an already-raw github URL untouched', () => {
    const url = 'https://raw.githubusercontent.com/karx/alfred-buildathon/main/README.md';
    expect(normalizeSourceUrl(url)).toBe(url);
  });
});

describe('resolveSource', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('writes inline text straight to the source file', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    const p = await resolveSource({ text: '# hello' }, dir);
    expect(p).toBe(path.join(dir, SOURCE_FILENAME));
    expect(await readFile(p, 'utf8')).toBe('# hello');
  });

  it('prefers an attachment over a source_url when both are somehow present', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    const fetchFn = mockFetch('attachment body');
    await resolveSource({ sourceUrl: 'https://example.com/a', attachmentUrl: 'https://cdn.discord.com/a.md' }, dir, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('https://cdn.discord.com/a.md');
  });

  it('normalizes a github.com source_url before fetching', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    const fetchFn = mockFetch('# README');
    await resolveSource({ sourceUrl: 'https://github.com/karx/alfred-buildathon' }, dir, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('https://raw.githubusercontent.com/karx/alfred-buildathon/HEAD/README.md');
  });

  it('warns when a source_url returns text/html', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    const log = vi.fn();
    await resolveSource({ sourceUrl: 'https://example.com/page' }, dir, mockFetch('<html></html>', 200, 'text/html'), log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('text/html'));
  });

  it('does not warn for plain text responses', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    const log = vi.fn();
    await resolveSource({ sourceUrl: 'https://example.com/a.md' }, dir, mockFetch('# hi', 200, 'text/markdown'), log);
    expect(log).not.toHaveBeenCalled();
  });

  it('throws when nothing is provided', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    await expect(resolveSource({}, dir)).rejects.toThrow(/one of text, sourceUrl, or attachmentUrl/);
  });

  it('surfaces a clear error on a failed fetch', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    await expect(resolveSource({ sourceUrl: 'https://example.com/missing' }, dir, mockFetch('', 404)))
      .rejects.toThrow(/HTTP 404/);
  });
});
