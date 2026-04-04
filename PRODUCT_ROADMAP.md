# KaaroViewer — Product Roadmap

**Prepared**: March 29, 2026
**Revised**: March 30, 2026
**Status**: Active Planning
**Vision**: A real-time immersive knowledge graph platform — speak or type anything, explore it in 3D VR

---

## Reality Check (Intern Report vs. Codebase)

> This section corrects assumptions in the original intern report before planning forward.

| Item | Intern Said | Reality |
|------|------------|---------|
| Instagram "v1" | Live integration ready to polish | Hardcoded fixture data (`instagram.js`). No live API — Meta deprecated third-party access |
| Twitter/Reddit/GitHub | WIP integrations | Not in codebase at all |
| A-Frame version | Needs upgrade to 1.4+ | Confirmed: still on **0.9.2** (released 2018) |
| Error logging | Needed | **Done** — `logger.mjs` is solid, ring-buffered, DOM-rendered, downloadable |
| Streaming pipeline | Not mentioned | Active focus: `kaaro/stream` branch, `kaaro_stream.mjs` (currently empty — in progress) |
| CORS proxy | Not mentioned | **Critical risk** — `cors-anywhere.herokuapp.com` is a public, rate-limited proxy used for OpenTapioca. Will fail in production |
| Team size | 5–10 people | Evidence of 1–2 person team |

---

## What Actually Works Today

The **core pipeline** is functional end-to-end:

```
Text / Speech → OpenTapioca (NLP entity detection) → Wikidata SPARQL → A-Frame 3D scene
```

Supporting systems:
- `entity_matching.mjs` — OpenTapioca NLP (via fragile CORS proxy)
- `fetch_knowledge.mjs` — Wikidata SPARQL image + entity data
- `logger.mjs` — structured session logging with DOM display and JSON export
- `context_wordmap.mjs` — Google WordTree for phrase context
- `controller/` — mobile speech-to-MQTT controller
- Visualization pages: gig economy India, gig worker projects, 3D tools specs — real domain use cases

---

## Strategic Pillars (Revised)

### 1. Core Pipeline Reliability
Fix the infrastructure that the whole product depends on — before adding anything new.

### 2. Streaming Architecture
Complete `kaaro_stream.mjs` — the active development direction and the product's real-time differentiation.

### 3. Domain Visualization
The gig economy pages show a viable path: curated, domain-specific knowledge graphs. Lean into this before chasing social media APIs.

### 4. Platform Stability
A-Frame upgrade, testing, CI/CD — the baseline for sustainable development.

### 5. Content Source Abstraction
Rather than deep integrations with specific social platforms (whose APIs are restricted/expensive), build a generic "content source" pattern that can plug in any text feed.

---

## Roadmap by Phase

### PHASE 0: FIX THE FOUNDATION (2–3 weeks)
*Unblock the pipeline from infrastructure fragility*

#### Critical Infrastructure Fixes
- [x] **Remove cors-anywhere proxy** — both Wikidata and OpenTapioca support CORS natively. All direct fetches now go straight to their APIs. Also fixed `encodeURI` → `encodeURIComponent` in OpenTapioca query string.
- [ ] Migrate stale `console.log` calls in `fetch_knowledge.mjs` to `logger.mjs`
- [ ] Fix `fetch_knowledge.mjs` null return bug (line 59 returns `null` instead of `[]`)
- [ ] Audit all `fetch` calls for missing error handling

#### A-Frame Upgrade
- [ ] Upgrade A-Frame from **0.9.2 → 1.6** (latest stable)
- [ ] Audit component compatibility: `aframe-look-at-component`, rain-of-entities, rain-of-posts, sky-canvas, tcgcard
- [ ] Verify VR mode still works post-upgrade

---

### PHASE 1: STREAMING PIPELINE (3–4 weeks)
*Complete the `kaaro/stream` work — this is the active branch*

- [ ] Implement `kaaro_stream.mjs` — real-time text stream → entity pipeline
- [ ] Define stream protocol: MQTT message format, batching, deduplication
- [ ] Add stream source abstraction (any text feed, not platform-specific)
- [ ] Add backpressure handling (don't flood the 3D scene)
- [ ] Log stream events via `logger.mjs` (MQTT type already defined)
- [ ] Test with live MQTT controller (`controller/speech-to-text-to-mqtt.js`)

---

### PHASE 2: DOMAIN KNOWLEDGE GRAPHS (4–5 weeks)
*Build on the gig economy work — prove the product's real value*

The three viz pages (`viz-gig-economy-india.html`, `viz-gig-worker-projects.html`, `viz-3d-printed-tools-specs.html`) show a pattern: curated knowledge graphs for specific domains.

- [ ] Extract shared visualization template from the three viz pages
- [ ] Define JSON/CSV schema for "knowledge graph seeds"
- [ ] Build a seed loader that populates a scene from a data file
- [ ] Create 2–3 polished domain demos (gig economy, maker tools, one more)
- [ ] Add Wikipedia/Wikidata deep-links from each entity node
- [ ] Document the seed format so others can contribute domains

---

### PHASE 3: PLATFORM STABILITY (3–4 weeks)
*Make the codebase sustainable for more than one contributor*

#### Testing
- [ ] Set up Vitest (works without bundler, ESM native)
- [ ] Unit tests for `entity_matching.mjs`, `fetch_knowledge.mjs`, `logger.mjs`
- [ ] Integration test: mock OpenTapioca → verify entity pipeline end-to-end
- [ ] Coverage target: 60%+ on core modules (80% is aspirational for now)

#### CI/CD
- [ ] GitHub Actions: lint + test on every PR
- [ ] Auto-deploy to GitHub Pages or Netlify on merge to master

#### Code Quality
- [ ] Add ESLint config (ES2022, browser env)
- [ ] Clean up stray files in root (`First`, `Gig`, `In`, `New`, etc. — appear to be accidental commits)
- [ ] Consolidate `2viewr_functions.mjs` and `gviewr_functions.mjs` if there's overlap

---

### PHASE 4: CONTENT SOURCES (4–5 weeks)
*Generic content ingestion — not platform-locked*

Rather than building Twitter/Reddit/GitHub-specific integrations (API costs, ToS restrictions, rate limits), build a **content source interface**:

```
interface ContentSource {
  name: string
  fetch(params): Promise<TextItem[]>
  describe(): string
}
```

Implementations (lowest friction first):
- [ ] RSS/Atom feed source (open, no auth)
- [ ] Plain text / paste input
- [ ] CSV import (captions, transcripts, etc.)
- [ ] Webhook receiver (any service can POST text)
- [ ] GitHub README/issues (public repos, no auth needed)
- [ ] Reddit public JSON API (no auth for public posts)

This architecture avoids locking the product to any single platform and sidesteps Instagram/Twitter API restrictions entirely.

---

### PHASE 5: EXPERIENCE & DISTRIBUTION (ongoing)
*Only after Phase 0–3 are solid*

- [ ] Redesign onboarding (3-minute guided tour of a demo scene)
- [ ] Offline demo mode (preloaded Wikidata responses, no network needed)
- [ ] Mobile VR controller UX improvements
- [ ] Landing page + 2-minute demo video
- [ ] Self-hosted deployment guide (Docker or single-file serve)

---

## What to Deprioritize (Compared to Intern Report)

| Item | Why to Defer |
|------|-------------|
| Instagram live integration | Meta API is dead for third parties. Not worth engineering time. |
| Twitter/X integration | API costs $100+/month for basic access. Premature. |
| SaaS / Stripe billing | Need users first. No market validation yet. |
| Enterprise RBAC, SAML, GDPR | Premature for current stage. |
| AR/VR headset optimization | Nice to have, not a blocker for proving value. |
| Admin dashboard, analytics | Add after there are users to analyze. |
| 5–10 person team structure | Plan for a 2-person team. Hire when revenue justifies it. |

---

## Success Metrics (Realistic)

### Phase 0–1 (Technical Health)
| Metric | Target |
|--------|--------|
| CORS proxy removed | Done |
| A-Frame version | 1.6 |
| `kaaro_stream.mjs` functional | End-to-end demo working |
| Zero unhandled promise rejections | In core pipeline |

### Phase 2–3 (Product Quality)
| Metric | Target |
|--------|--------|
| Domain demos | 3 polished, shareable scenes |
| Test coverage (core modules) | 60%+ |
| CI passing | Every PR |
| FPS in demo scenes | ≥ 30 FPS |

### Phase 4–5 (Growth Signal)
| Metric | Target |
|--------|--------|
| External contributors | 1+ domain seed PRs |
| Demo sessions (tracked via logger) | 100+/month |
| User-reported bugs | < 5 open at any time |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| cors-anywhere.herokuapp.com goes down | **High** | Phase 0 fix — self-host proxy |
| OpenTapioca accuracy too low | Medium | Log scores, tune threshold, consider fallback to Wikidata search API |
| A-Frame ecosystem stagnates | Medium | Core pipeline doesn't depend on A-Frame internals; swap renderer if needed |
| Wikidata SPARQL rate limits | Low | Add caching layer; logged queries make it easy to identify repeated lookups |

---

## Immediate Next Steps (This Week)

1. **Audit cors-anywhere usage** — decide: self-host CORS proxy or move to backend Node.js relay
2. **Start A-Frame 1.6 upgrade** — test branch, fix component breakage
3. **Define `kaaro_stream.mjs` API** — agree on message format before implementing
4. **Clean up root directory** — delete or organize stray files (`First`, `Gig`, etc.)
5. **Fix the null return bug** in `fetch_knowledge.mjs` line 59

---

**Last Updated**: March 30, 2026
**Next Review**: April 30, 2026
**Owner**: Technical Lead
