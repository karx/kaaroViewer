---
published: false
title: "Project Structure & Digital Garden — Template for Developers"
tags: [template, structure, para, gardening, reference]
description: "A generalized template and set of recommendations for organizing a browser-based project using the PARA documentation method and Digital Garden philosophy. Derived from Art of Intent's structure."
date: 2026-05-17
layer: L2-System
maturity: EVERGREEN
para: SkillSurface
---

# Project Structure & Digital Garden — Template for Developers

A reusable template for structuring small-to-medium browser-based or full-stack projects. Includes file layout conventions, PARA-based documentation organization, version management, and a gardening workflow to keep docs alive over time.

---

## 1. Directory Layout

```
your-project/
├── src/                        # All source code
│   ├── js/                     # JavaScript modules (or ts/, lib/)
│   │   ├── version.js          # Centralized version — single source of truth
│   │   ├── config.js           # App-level configuration / environment
│   │   └── [feature].js        # One module per feature domain
│   ├── css/                    # Stylesheets
│   │   ├── theme.css           # Design tokens and base theme
│   │   └── styles.css          # Page / component styles
│   └── assets/                 # Static media: images, icons, fonts
│       └── og_image.png        # Open Graph / social preview image
├── tests/                      # Automated tests
│   └── [feature].test.js       # Mirror the src/ module name
├── docs/                       # PARA documentation (see §3)
│   ├── README.md               # Docs index — what lives where and why
│   ├── projects/               # Active pipelines
│   ├── areas/                  # Maintained standards
│   ├── resources/              # Callable HOWTOs (this file lives here)
│   └── crystallized/           # Closed pipelines with learnings
├── index.html                  # Primary entry point
├── package.json                # Metadata, scripts, deps
├── .gitignore
├── LICENSE
├── README.md                   # Human-facing project overview
└── CLAUDE.md                   # AI agent instructions (if using Claude Code)
```

**Principles:**
- One concern per directory — source, tests, docs, and root config never mix.
- Root stays shallow. Only files that tools or humans absolutely need at the top level live there.
- `src/assets/` for all binary/static media so it's easy to exclude from text search.

---

## 2. Centralized Version Management

Keep the version in exactly **one** place and derive it everywhere else.

```js
// src/js/version.js
const APP_VERSION = {
    major: 1,
    minor: 0,
    patch: 0,
    get full() { return `${this.major}.${this.minor}.${this.patch}`; },
    get display() { return `v${this.full}`; }
};
export default APP_VERSION;
```

Then reference it in:
- `package.json` — `"version": "1.0.0"`
- UI display elements — `import APP_VERSION from './version.js'`
- Share cards / generated assets
- Doc frontmatter `date:` (update on each release)

**Rule:** bump `version.js` first, then `package.json`. Never the other way around.

---

## 3. PARA Documentation Method

PARA organizes knowledge by **actionability**, not by topic.

| Folder | Role | Lifetime | When to write |
|---|---|---|---|
| `docs/projects/` | Active pipelines — bounded, goal-oriented | Short | At sprint/feature start |
| `docs/areas/` | Maintained standards — ongoing responsibilities | Long | When a system decision is made |
| `docs/resources/` | Callable HOWTOs — atomic, one pattern per doc | Permanent | When a pattern solidifies |
| `docs/crystallized/` | Closed pipelines — learnings encoded | Permanent | When a pipeline closes |

### Frontmatter (required on every doc)

```yaml
---
published: false
title: ""
tags: []
description: ""       # 1–3 sentences
date: YYYY-MM-DD
layer: ""             # L4-Identity | L3-Principle | L2-System | L1-Instance
maturity: ""          # STUB | SEED | BUDDING | EVERGREEN
para: ""              # Pipeline | Area | SkillSurface | Crystallized
---
```

**Layer guide:**
- `L4-Identity` — core philosophy or identity of the project
- `L3-Principle` — a durable design or architectural principle
- `L2-System` — a working system or subsystem
- `L1-Instance` — a specific instance, run, or event

**Maturity guide:**
- `STUB` — title + one sentence, placeholder only
- `SEED` — written but incomplete; needs more thought
- `BUDDING` — mostly complete, actively being refined
- `EVERGREEN` — stable, maintained, reusable as-is

---

## 4. Digital Garden Workflow

A digital garden treats documentation as a **living system**, not a changelog. Docs grow, get pruned, and cross-link over time.

### During a Feature

1. **Before you build** — create or update a Pipeline doc in `docs/projects/`:
   - Goal, scope, files in scope, success criterion
2. **When you decide something significant** — add a decision note to the relevant Area doc:
   - What was decided, what was considered, why this path
3. **When a pattern solidifies** — encode it as a Skill Surface in `docs/resources/`:
   - One doc, one pattern, callable by an agent or human later
4. **When you ship** — write a crystallization note in `docs/crystallized/`:
   - What was built, what was learned, what's reusable next time
5. **When something breaks or surprises** — capture it immediately:
   - Even a `STUB` (title + one sentence) is more valuable than nothing

### Pruning Rules

- **Remove** docs that only say what the code already says.
- **Mark STALE** on docs that describe a system you've changed but haven't updated yet. Never leave stale docs unmarked — they mislead future readers (and agents).
- **Crystallize, don't delete** — when a Pipeline closes, move its learnings to `crystallized/` rather than deleting the project doc.
- **Cross-link** freely: `[[other-doc-name]]` syntax (Obsidian-compatible). Links that don't resolve yet mark future work, not errors.

### Gardening Cadence (Recommended)

| Trigger | Action |
|---|---|
| Start of any new feature | Open or create a Pipeline doc |
| Significant architectural decision | Update the affected Area doc |
| PR merged | Verify no doc is now STALE |
| Sprint close / milestone | Crystallize closed pipelines |
| Quarterly | Full prune — review maturity labels, remove dead stubs |

---

## 5. Development Workflow

```bash
# Serve locally (no build step for vanilla JS projects)
npm run serve

# Run tests
npm test

# Release checklist
# 1. Bump src/js/version.js
# 2. Bump package.json version field to match
# 3. Update affected docs (date, maturity)
# 4. git commit -m "release: vX.Y.Z"
# 5. git tag vX.Y.Z
```

---

## 6. Testing Conventions

- Test files mirror source file names: `src/js/share-card.js` → `tests/share-card.test.js`
- Unit tests for pure functions and modules
- Integration tests for anything touching external services (databases, APIs)
- Manual test pages (e.g. `test-feature.html`) for visual/interactive verification during development — **delete them before release** or gate behind a flag

---

## 7. Recommended `.gitignore` Entries

```gitignore
# Dependencies
node_modules/

# Environment / secrets
.env
*.env.local
functions/.env

# Build output
dist/
build/
frontend/build/

# Editor artifacts
.DS_Store
Thumbs.db
*.swp
.idea/
.vscode/settings.json

# Test coverage
coverage/
```

---

## 8. README Checklist

A good `README.md` at the repo root covers:

- [ ] One-sentence description of what this is
- [ ] Live URL or install command
- [ ] Local setup (clone → install → serve)
- [ ] How to run tests
- [ ] High-level architecture (2–5 bullet points)
- [ ] Link to `docs/` for deeper context
- [ ] License

---

## References

- PARA Method — Tiago Forte: Projects, Areas, Resources, Archives
- Digital Garden philosophy — Maggie Appleton's essay on non-linear knowledge
- Art of Intent project structure: `docs/archives/PROJECT_STRUCTURE.md`
- Docs index for this project: `docs/README.md`
