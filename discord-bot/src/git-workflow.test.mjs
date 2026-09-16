import { describe, it, expect, vi } from 'vitest';
import {
  slugify, makeBranchName, prepareWorktree, commitAndPush,
  removeWorktree, openPullRequest,
} from './git-workflow.mjs';

function mockSpawn(exitCode = 0, stdout = '', stderr = '') {
  return vi.fn().mockResolvedValue({ stdout, stderr, exitCode, timedOut: false });
}

function mockFetch(body, status = 201) {
  return vi.fn().mockResolvedValue({
    ok:   status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('slugify', () => {
  it('lowercases, hyphenates, and strips non-alphanumerics', () => {
    expect(slugify('Poker Tooling: Compliance Report!')).toBe('poker-tooling-compliance-report');
  });

  it('caps length without trailing hyphen', () => {
    expect(slugify('a'.repeat(50), 10)).toBe('a'.repeat(10));
  });
});

describe('makeBranchName', () => {
  it('produces a discord/visualize-<slug>-<timestamp> branch name', () => {
    const now = new Date('2026-09-08T03:15:00.000Z');
    expect(makeBranchName('Poker Tooling', now)).toBe('discord/visualize-poker-tooling-20260908T031500Z');
  });
});

describe('prepareWorktree', () => {
  it('fetches origin/master then adds a worktree on a new branch', async () => {
    const spawnFn = mockSpawn(0);
    await prepareWorktree(
      { repoDir: '/repo', worktreesRoot: '/repo/discord-bot/.worktrees', branchName: 'discord/visualize-x-1' },
      spawnFn,
    );

    expect(spawnFn).toHaveBeenNthCalledWith(1, 'git', ['fetch', 'origin', 'master'], expect.objectContaining({ cwd: '/repo' }));
    const secondCallArgs = spawnFn.mock.calls[1];
    expect(secondCallArgs[1]).toEqual(
      expect.arrayContaining(['worktree', 'add', '-f', expect.any(String), '-b', 'discord/visualize-x-1', 'origin/master']),
    );
  });

  it('throws with stderr context when a git command fails', async () => {
    const spawnFn = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: 'network down', exitCode: 1, timedOut: false });
    await expect(prepareWorktree(
      { repoDir: '/repo', worktreesRoot: '/repo/.worktrees', branchName: 'b' }, spawnFn,
    )).rejects.toThrow(/network down/);
  });
});

describe('commitAndPush', () => {
  it('runs add, commit, push in order', async () => {
    const spawnFn = mockSpawn(0);
    await commitAndPush({ worktreeDir: '/wt', branchName: 'b', message: 'msg' }, spawnFn);
    expect(spawnFn.mock.calls.map(c => c[1][0])).toEqual(['add', 'commit', 'push']);
  });
});

describe('removeWorktree', () => {
  it('force-removes the worktree from the main repo', async () => {
    const spawnFn = mockSpawn(0);
    await removeWorktree({ repoDir: '/repo', worktreeDir: '/repo/.worktrees/x' }, spawnFn);
    expect(spawnFn).toHaveBeenCalledWith(
      'git', ['worktree', 'remove', '--force', '/repo/.worktrees/x'], expect.objectContaining({ cwd: '/repo' }),
    );
  });
});

describe('openPullRequest', () => {
  it('posts to the GitHub REST API and returns number + html_url', async () => {
    const fetchFn = mockFetch({ number: 7, html_url: 'https://github.com/karx/kaaroViewer/pull/7' });
    const result = await openPullRequest(
      { owner: 'karx', repo: 'kaaroViewer', branch: 'discord/visualize-x-1', title: 't', body: 'b', token: 'tok' },
      fetchFn,
    );

    expect(result).toEqual({ number: 7, htmlUrl: 'https://github.com/karx/kaaroViewer/pull/7' });
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/karx/kaaroViewer/pulls');
    expect(opts.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(opts.body)).toMatchObject({ head: 'discord/visualize-x-1', base: 'master' });
  });

  it('throws with the GitHub error message on failure', async () => {
    const fetchFn = mockFetch({ message: 'Validation failed' }, 422);
    await expect(openPullRequest(
      { owner: 'karx', repo: 'kaaroViewer', branch: 'b', title: 't', body: 'b', token: 'tok' }, fetchFn,
    )).rejects.toThrow(/HTTP 422/);
  });
});
