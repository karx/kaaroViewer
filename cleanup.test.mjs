import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));

const LEGACY_DIRS = ['components', 'controller', 'pod_modules'];
const LEGACY_FILES = ['entity-test.html'];

describe('phase 1 — legacy cleanup verification', () => {
  it('components/, controller/, pod_modules/ directories no longer exist', () => {
    for (const dir of LEGACY_DIRS) {
      expect(existsSync(resolve(ROOT, dir))).toBe(false);
    }
  });

  it('entity-test.html no longer exists', () => {
    expect(existsSync(resolve(ROOT, 'entity-test.html'))).toBe(false);
  });

  it('no .mjs file imports from legacy directories', () => {
    const violations = [];
    function scan(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          scan(full);
        } else if (entry.name.endsWith('.mjs')) {
          const src = readFileSync(full, 'utf-8');
          for (const legacy of LEGACY_DIRS) {
            if (src.includes(`/${legacy}/`) || src.includes(`'./${legacy}/`) || src.includes(`"./${legacy}/`)) {
              violations.push(`${full} → references ${legacy}/`);
            }
          }
        }
      }
    }
    scan(ROOT);
    expect(violations).toEqual([]);
  });

  it('vitest.config.mjs does not mention pod_modules', () => {
    const src = readFileSync(resolve(ROOT, 'vitest.config.mjs'), 'utf-8');
    expect(src).not.toContain('pod_modules');
  });

  it('package.json vitest.exclude does not mention pod_modules', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    const exclude = pkg?.vitest?.exclude ?? [];
    expect(exclude).not.toContain('pod_modules');
  });

  it('DEVELOPER_GUIDE.md and PRODUCT_ROADMAP.md have no *active* references to removed artifacts', () => {
    // Filenames of removed artifacts. A doc may mention a filename ONLY inside an
    // explicit "removed in v3 cleanup" / "Removed in v3 cleanup" historical note —
    // any other mention is a regression.
    const removedArtifacts = [
      'components/alongpath', 'components/rain-of-entities', 'components/rain-of-posts',
      'components/sky-canvas', 'components/tcgcard', 'components/wikidata-entity',
      'controller/index.html', 'controller/speech-to-text-to-mqtt', 'controller/style.css',
      'pod_modules/await-request', 'pod_modules/wiki',
      'entity-test.html',
    ];
    const docs = ['DEVELOPER_GUIDE.md', 'PRODUCT_ROADMAP.md'];
    const violations = [];
    const isHistoricalNote = (line) =>
      /removed in v3 cleanup|was `|Removed in v3 cleanup/i.test(line);
    for (const doc of docs) {
      const lines = readFileSync(resolve(ROOT, doc), 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isHistoricalNote(line)) continue;
        for (const artifact of removedArtifacts) {
          if (line.includes(artifact)) {
            violations.push(`${doc}:${i + 1} → references ${artifact}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
