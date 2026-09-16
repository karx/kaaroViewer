import { describe, it, expect } from 'vitest';
import { parseSkillReport, buildEmbedData } from './embed.mjs';

const SAMPLE_REPORT = `
some agent chatter before the report

✅  Poker Tooling Compliance Report
    library/poker-tooling.json  —  24 nodes · 51 edges · 9 beats · 5 insights · 4 clusters
    Spine: solver-x, ecosystem

    Run F5 LIB in kaaroViewer to load.
`;

describe('parseSkillReport', () => {
  it('extracts title, docId, and counts from the skill Step 7 report block', () => {
    const report = parseSkillReport(SAMPLE_REPORT);
    expect(report.title).toBe('Poker Tooling Compliance Report');
    expect(report.docId).toBe('poker-tooling');
    expect(report).toMatchObject({ nodes: 24, edges: 51, beats: 9, insights: 5, clusters: 4 });
  });

  it('falls back to a bare docId when the counts line is missing/reshaped', () => {
    const report = parseSkillReport('wrote library/some-doc.json, done.');
    expect(report.docId).toBe('some-doc');
    expect(report.nodes).toBeNull();
  });

  it('returns nulls when nothing matches', () => {
    const report = parseSkillReport('nothing useful here');
    expect(report.docId).toBeNull();
    expect(report.title).toBeNull();
  });
});

describe('buildEmbedData', () => {
  it('builds a success embed with counts, validator status, PR and preview links', () => {
    const data = buildEmbedData({
      stdout: SAMPLE_REPORT,
      validation: { status: 'ok' },
      prNumber: 42,
      prUrl: 'https://github.com/karx/kaaroViewer/pull/42',
    });

    expect(data.title).toContain('Poker Tooling Compliance Report');
    expect(data.color).toBe(0x3fa76b);
    expect(data.fields.find(f => f.name === 'Encoded').value)
      .toBe('24 nodes · 51 edges · 9 beats · 5 insights · 4 clusters');
    expect(data.fields.find(f => f.name === 'Preview').value)
      .toBe('https://karx.github.io/kaaroViewer/previews/pr-42/?lib=poker-tooling');
  });

  it('marks breaking validator errors distinctly from a clean pass', () => {
    const data = buildEmbedData({ stdout: SAMPLE_REPORT, validation: { status: 'errors' } });
    expect(data.color).toBe(0xd64545);
    expect(data.fields.find(f => f.name === 'Status').value).toMatch(/breaking errors/);
  });

  it('prefers an explicit docId (ground truth from a directory diff) over stdout parsing', () => {
    const data = buildEmbedData({
      stdout: 'agent got killed before printing any report',
      validation: { status: 'warnings' },
      docId: 'discord-bot-integrations-learnings',
      note: 'The encoder hit the timeout after writing this doc.',
      prNumber: 9, prUrl: 'https://github.com/karx/kaaroViewer/pull/9',
    });

    expect(data.fields.find(f => f.name === 'Preview').value)
      .toBe('https://karx.github.io/kaaroViewer/previews/pr-9/?lib=discord-bot-integrations-learnings');
    expect(data.fields.find(f => f.name === 'Note').value)
      .toBe('The encoder hit the timeout after writing this doc.');
  });

  it('builds a failure embed when the run produced nothing', () => {
    const data = buildEmbedData({
      stdout: '', validation: { status: 'unknown' }, failure: 'no library JSON produced',
    });
    expect(data.title).toBe('❌ /visualize failed');
    expect(data.description).toBe('no library JSON produced');
    expect(data.fields).toEqual([]);
  });
});
