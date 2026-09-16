/**
 * embed.mjs — turns a finished job into a Discord embed payload.
 *
 * Pure functions, no discord.js import — bot.mjs wraps the plain object
 * this returns in an EmbedBuilder. Keeps this file testable without a
 * Discord client.
 */

const REPORT_TITLE_RE = /✅\s+(.+)/;
const REPORT_COUNTS_RE =
  /library\/([\w-]+)\.json\s*[—-]+\s*(\d+)\s*nodes?\s*[·•]\s*(\d+)\s*edges?\s*[·•]\s*(\d+)\s*beats?\s*[·•]\s*(\d+)\s*insights?\s*[·•]\s*(\d+)\s*clusters?/;
const FALLBACK_DOC_ID_RE = /library\/([\w-]+)\.json/;

/**
 * Extracts the skill's own "Step 7 — Report back" block from agent stdout.
 * Tolerant of a missing/reshaped report — falls back to whatever it can find.
 */
export function parseSkillReport(stdout = '') {
  const titleMatch  = stdout.match(REPORT_TITLE_RE);
  const countsMatch = stdout.match(REPORT_COUNTS_RE);

  if (countsMatch) {
    const [, docId, nodes, edges, beats, insights, clusters] = countsMatch;
    return {
      title: titleMatch?.[1]?.trim() ?? null,
      docId, nodes: +nodes, edges: +edges, beats: +beats, insights: +insights, clusters: +clusters,
    };
  }

  const fallbackId = stdout.match(FALLBACK_DOC_ID_RE)?.[1] ?? null;
  return {
    title: titleMatch?.[1]?.trim() ?? null,
    docId: fallbackId,
    nodes: null, edges: null, beats: null, insights: null, clusters: null,
  };
}

const STATUS_EMOJI = { ok: '✅', warnings: '⚠️', errors: '❌', unknown: '❔' };
const STATUS_LABEL = {
  ok:       'Validator: clean',
  warnings: 'Validator: warnings (still opened for review)',
  errors:   'Validator: breaking errors — needs a fix before merge',
  unknown:  'Validator: could not run',
};

/**
 * @param {{ stdout: string, validation: { status: string },
 *           prNumber?: number, prUrl?: string, docId?: string,
 *           owner?: string, repo?: string, failure?: string, note?: string }} job
 *   docId, when given, is ground truth (e.g. from a library/ directory diff)
 *   and overrides whatever parseSkillReport found in stdout — the agent's
 *   own "Step 7" report block can be missing (killed by a timeout) even when
 *   it already wrote a perfectly good library JSON.
 */
export function buildEmbedData({
  stdout, validation, prNumber, prUrl, docId, owner = 'karx', repo = 'kaaroViewer', failure, note,
}) {
  const report = { ...parseSkillReport(stdout), ...(docId ? { docId } : {}) };

  if (failure) {
    return {
      title: '❌ /visualize failed',
      description: failure,
      color: 0xd64545,
      fields: [],
    };
  }

  const fields = [];
  if (report.nodes !== null) {
    fields.push({
      name: 'Encoded',
      value: `${report.nodes} nodes · ${report.edges} edges · ${report.beats} beats · ` +
             `${report.insights} insights · ${report.clusters} clusters`,
    });
  }
  fields.push({ name: 'Status', value: STATUS_LABEL[validation.status] ?? STATUS_LABEL.unknown });
  if (note) fields.push({ name: 'Note', value: note });
  if (prUrl) fields.push({ name: 'Pull request', value: prUrl });

  if (report.docId && prNumber) {
    const previewUrl = `https://${owner}.github.io/${repo}/previews/pr-${prNumber}/?lib=${report.docId}`;
    fields.push({ name: 'Preview', value: previewUrl });
  }

  return {
    title: `${STATUS_EMOJI[validation.status] ?? '❔'} ${report.title ?? report.docId ?? 'Encoding complete'}`,
    url: prUrl,
    color: validation.status === 'ok' ? 0x3fa76b
         : validation.status === 'warnings' ? 0xd6a545
         : 0xd64545,
    fields,
  };
}
