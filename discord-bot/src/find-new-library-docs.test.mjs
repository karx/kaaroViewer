import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { snapshotLibraryDocs, findNewLibraryDocs } from './find-new-library-docs.mjs';

describe('snapshotLibraryDocs / findNewLibraryDocs', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('detects a doc written after the snapshot was taken', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    await mkdir(path.join(dir, 'library'));
    await writeFile(path.join(dir, 'library', 'existing.json'), '{}');

    const before = await snapshotLibraryDocs(dir);
    await writeFile(path.join(dir, 'library', 'new-doc.json'), '{}');

    expect(await findNewLibraryDocs(dir, before)).toEqual(['new-doc']);
  });

  it('returns an empty array when nothing new was written', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    await mkdir(path.join(dir, 'library'));
    await writeFile(path.join(dir, 'library', 'existing.json'), '{}');

    const before = await snapshotLibraryDocs(dir);
    expect(await findNewLibraryDocs(dir, before)).toEqual([]);
  });

  it('does not throw when library/ does not exist yet', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaaro-'));
    const before = await snapshotLibraryDocs(dir);
    expect(before.size).toBe(0);
    expect(await findNewLibraryDocs(dir, before)).toEqual([]);
  });
});
