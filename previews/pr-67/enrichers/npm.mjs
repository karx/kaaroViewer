/**
 * enrichers/npm.mjs — npm registry enrichment adapter.
 *
 * Completely free, no auth, generous rate limits.
 * Useful for: software, library, framework, tool entity types.
 *
 * Endpoints:
 *   Registry:  https://registry.npmjs.org/{package}         — metadata, version, homepage
 *   Downloads: https://api.npmjs.org/downloads/point/last-month/{package}
 *
 * CORS: Both endpoints support CORS from browser.
 */

import { log }        from '../logger.mjs';
import { makeResult, nullResult } from './index.mjs';

const NPM_REGISTRY  = 'https://registry.npmjs.org';
const NPM_DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-month';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _slug(label) {
  // Best-effort: "Three.js" → "three", "Socket.IO" → "socket.io"
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

async function _npmGet(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`npm HTTP ${res.status}`);
  return res.json();
}

// ── Adapter export ────────────────────────────────────────────────────────────

/**
 * @param {string}      entityId    — entity label, e.g. "React" or "three"
 * @param {string|null} packageName — npm package name from NED++ (if known)
 * @returns {Promise<AdapterResult>}
 */
export async function enrich(entityId, packageName) {
  // Try provided name first, then normalised slug
  const candidates = [
    packageName,
    _slug(entityId),
    entityId.trim(),
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  log('ENRICHER', `[npm] enriching "${entityId}"`, { candidates });

  let pkg = null;
  let resolvedName = null;

  for (const name of candidates) {
    try {
      const data = await _npmGet(`${NPM_REGISTRY}/${encodeURIComponent(name)}`);
      if (data && data.name) { pkg = data; resolvedName = name; break; }
    } catch (err) {
      log('ERROR', `[npm] fetch failed for "${name}"`, { message: err.message });
    }
  }

  if (!pkg) {
    log('ENRICHER', `[npm] no package found for "${entityId}"`);
    return nullResult('npm');
  }

  // ── Monthly downloads ─────────────────────────────────────────────────────
  let downloads = null;
  try {
    const dlData = await _npmGet(`${NPM_DOWNLOADS}/${encodeURIComponent(resolvedName)}`);
    downloads = dlData?.downloads ?? null;
  } catch (_) { /* non-critical */ }

  // ── Build metrics ─────────────────────────────────────────────────────────
  const latest  = pkg['dist-tags']?.latest ?? '';
  const latestMeta = latest ? pkg.versions?.[latest] : null;

  const metrics = {};
  if (latest)                          metrics['latest_version']   = latest;
  if (downloads !== null)              metrics['monthly_downloads'] = downloads;
  if (pkg.license)                     metrics['license']          = pkg.license;
  if (latestMeta?.engines?.node)       metrics['node_engine']      = latestMeta.engines.node;

  const deps    = Object.keys(latestMeta?.dependencies ?? {}).length;
  const devDeps = Object.keys(latestMeta?.devDependencies ?? {}).length;
  if (deps > 0)    metrics['dependencies']      = deps;
  if (devDeps > 0) metrics['dev_dependencies']  = devDeps;

  const links = [`https://www.npmjs.com/package/${resolvedName}`];
  if (pkg.homepage) links.push(pkg.homepage);
  if (pkg.repository?.url) {
    const repoUrl = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
    links.push(repoUrl);
  }

  const summary = pkg.description
    ? `${pkg.description} (npm: ${resolvedName}, v${latest})`
    : `npm package: ${resolvedName} v${latest}`;

  const dlFmt = downloads !== null
    ? ` · ${(downloads / 1000).toFixed(0)}k downloads/mo`
    : '';
  log('ENRICHER', `[npm] "${resolvedName}" v${latest}${dlFmt}`);

  return makeResult('npm', {
    metrics,
    links,
    related_ids: Object.keys(latestMeta?.dependencies ?? {}).slice(0, 10),
    summary,
    thumbnail: null,
  });
}
