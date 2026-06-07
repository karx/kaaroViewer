# Genesis Handoff — kaaroViewer Life Architecture

**Type:** TDD Hypotheses Document  
**Date:** 2026-06-07  
**Branch:** `kaaro/breathe-life`  
**Status:** Pre-implementation — all hypotheses unverified  
**Author:** Architecture session, informed by `life-DNA-seed.md`

---

> This document is the system's first self-statement. It records what we *believe* to be true before a single loop has run. Each hypothesis is a test that the implementation must pass or falsify. The Dream Loop will read this document as part of its genesis context.

---

## Telemetry Snapshot (Pre-Life Baseline)

| Metric | Value | Source |
|---|---|---|
| Library entries | 9 | `pipeline/local-graph.mjs` |
| Test suite | 168 passing, 0 failing | `pnpm test` |
| Validator coverage | Manual only | `.claude/hooks/validate-library-json.py` |
| Open evals | Unknown — eval slide just shipped | GitHub Issues `label:eval` |
| Health-check module | Does not exist | — |
| Alone-Time runs | 0 | — |
| Dream Loop runs | 0 | — |
| Generational tags | 0 | — |
| Edge density (avg) | Unknown — unmeasured at system level | — |
| Weakest entry | Unknown — no automated ranking yet | — |

---

## Hypotheses

Each hypothesis follows the TDD pattern: **given / when / then / falsified by**.

---

### H1 — The Mirror Hypothesis

> *The system's health state is already latent in the data. Making it explicit will immediately reveal at least one degraded library entry.*

**Given:** 9 library entries exist, encoded at different times by different sessions of `/visualize` with varying rigor.  
**When:** `scripts/health-check.mjs` runs for the first time.  
**Then:** At least 1 entry will be flagged `watch` or `degraded` (validator warnings > 0 OR edge density < 2.0 OR eval rating ≤ 2).  
**Falsified by:** All 9 entries score `ok` on first health check run. Would indicate either the validator is too lenient, the health-check thresholds are too loose, or the library is already in excellent shape.  
**Confidence:** High. Encoding quality naturally varies across sessions. The validator's existing warnings are the canary.

---

### H2 — The Selection Hypothesis

> *A combined health score (validator exit code + edge density + eval signal + days since last touch) will unambiguously identify a single entry as the highest-priority re-encode target.*

**Given:** The health report from H1.  
**When:** The Alone-Time agent reads it and must select one entry.  
**Then:** The selection is deterministic given the same inputs. The agent's reasoning will cite the same entry that a human reviewer would identify as weakest.  
**Falsified by:** Two entries score equally, causing the agent to make an arbitrary choice, OR the agent selects an `ok` entry due to misreading the health report structure.  
**Confidence:** Medium. The scoring formula needs calibration. First run may require human override.  
**Dependency:** Requires H1 to produce at least one non-`ok` entry.

---

### H3 — The Mutation Hypothesis

> *Re-encoding via `/visualize` with explicit gap targeting (informed by eval feedback + validator warnings) will improve edge density by ≥ 0.3 and resolve all validator warnings for the selected entry.*

**Given:** A `degraded` entry selected by H2. Specific gaps identified in its health record (e.g., "missing causal links", "3 validator warnings").  
**When:** `/visualize` is run with the original source + gap-targeting context from the health report.  
**Then:**  
- Validator exits 0 (was 1 or 2)  
- Edge density increases by ≥ 0.3 (e.g., 1.7 → 2.0+)  
- Story beats: 7–12 (if previously outside range)  
- Insights: 4–7 with at least one `warning` + one `finding`  

**Falsified by:** Re-encoded entry has the same or lower edge density. Validator still warns. Indicates either the source material is genuinely sparse or the gap-targeting prompt is insufficient.  
**Confidence:** Medium-high. `/visualize` is already library-grade. The marginal gain from explicit gap targeting is the untested variable.

---

### H4 — The Memory Hypothesis

> *Three consecutive handoff documents, each reading the previous, will accumulate enough structured signal to make a Dream Loop decision without re-reading any source library documents.*

**Given:** Three Alone-Time runs have completed and written handoff documents.  
**When:** A Dream Loop agent reads only the three handoff docs (not the library JSONs, not the source material).  
**Then:** The agent can correctly identify: (a) which entry types are chronically problematic, (b) which ontology gaps are recurring, (c) whether the Alone-Time loop is improving or stagnating.  
**Falsified by:** The Dream Loop agent cannot make a confident recommendation without also reading the library JSONs or health reports. Indicates the handoff schema is too sparse — needs richer fields.  
**Confidence:** Medium. Handoff schema design is the critical variable. The genesis handoff schema in LIFE.md §3 is a first attempt — likely needs iteration.

---

### H5 — The Ontology Signal Hypothesis

> *Within 5 Alone-Time runs, the handoff documents will surface at least one entity type or relationship that appears in eval feedback or source material but is absent from VALID_TYPES / VALID_RELS.*

**Given:** 5 Alone-Time runs have completed.  
**When:** The Dream Loop performs meta-analysis of the handoff set.  
**Then:** At least one concrete ontology gap is named (e.g., "the word 'platform' appears 4 times across eval confused-fields but there is no `platform` VALID_TYPE").  
**Falsified by:** No ontology gaps surface after 5 runs. Would indicate either the current ontology is already comprehensive, the source material is narrow, or the Alone-Time loop isn't capturing signal granularly enough.  
**Confidence:** High. The current VALID_TYPES set was defined for specific early use cases. As diverse library content grows, gaps are structurally expected.

---

### H6 — The Immune System Hypothesis

> *The validator + test suite gate will catch every mutation that would degrade the system, even when the mutation is generated entirely by an LLM agent with no human in the loop.*

**Given:** An Alone-Time agent produces a re-encoded library JSON and attempts to commit it.  
**When:** The gate runs: `validate-library-json.py` then `pnpm test`.  
**Then:** Either (a) the entry passes both gates and is safely committed, OR (b) the entry fails a gate and is NOT committed — the handoff records the failure and the next run retries with corrected targeting.  
**Falsified by:** A semantically corrupted entry passes both gates and is committed. Would indicate the validator has a blind spot or the test suite doesn't cover the failure mode.  
**Confidence:** High. The validator was designed specifically as the LLM mutation guard. The test suite covers the pipeline deterministically. The primary risk is semantic drift (a valid-schema entry that is factually wrong) — which the validator cannot catch by design, only evals can.

---

### H7 — The Compounding Hypothesis

> *The baseline quality of the library will measurably improve with each Alone-Time generation. Average edge density and validator-clean entry count will increase monotonically across the first 10 runs.*

**Given:** 10 completed Alone-Time runs with handoff docs.  
**When:** Health-check is run after runs 1, 5, and 10.  
**Then:**  
- `degraded` entry count: run 0 > run 5 > run 10  
- Average edge density: run 0 < run 5 < run 10  
- Validator-clean entries (exit 0): run 0 < run 5 < run 10  

**Falsified by:** Quality plateaus or regresses after run 5. Would indicate the Alone-Time loop is hitting local minima — a classic Dream Loop trigger condition per the seed directive (§4: "typically occurring after 10–20 continuous runs").  
**Confidence:** Medium. Early runs should show clear gains (low-hanging fruit). Later runs will face diminishing returns — this is expected and is the Dream Loop's job to resolve.

---

### H8 — The Generational Integrity Hypothesis

> *A generational schema change (new VALID_TYPE or VALID_REL) will not break any existing library entry's validator score.*

**Given:** The Dream Loop proposes a new entity type and all three artifacts are updated atomically (validator + SOP + renderer).  
**When:** All 9 existing library JSONs are re-validated against the new validator.  
**Then:** No existing entry regresses. New type additions are additive, not breaking.  
**Falsified by:** An existing entry fails validation after the schema update. Indicates the new type definition conflicts with an existing type mapping, or the validator update introduced a regression.  
**Confidence:** High. Adding to VALID_TYPES is additive by design — it does not invalidate entries that don't use the new type. Risk is only if a type is renamed or a constraint is tightened.

---

## Open Questions (Unresolved at Genesis)

These are not hypotheses — they are unknowns that the first few Alone-Time runs should resolve.

**Q1:** What is the actual average edge density across the current 9 library entries?  
*Resolves in:* Phase 1 (health-check first run)

**Q2:** Is there already a library entry that would fail the current validator?  
*Resolves in:* Phase 1 (health-check first run)

**Q3:** Are there open GitHub Issues with `label:eval` already?  
*Resolves in:* Phase 1 (health-check GitHub poll)

**Q4:** Which entry is the weakest? Is it the same one a human reviewer would pick?  
*Resolves in:* Phase 2 (Alone-Time pilot run, human comparison)

**Q5:** Does the handoff schema capture enough context to be useful across runs without becoming a bloated log?  
*Resolves in:* Phase 3 (after 3 handoff docs exist, Dream Loop assessment)

**Q6:** Is the Alone-Time loop's select-mutate-gate cycle fast enough to complete in a single nightly window (< 20 min)?  
*Resolves in:* Phase 2 (pilot run timing)

**Q7:** Will the eval slide (just shipped) generate organic user evals, or will the first few evals need to be seeded manually to test the loop?  
*Resolves in:* Phase 2 (check GitHub Issues after 1 week of eval slide exposure)

---

## Success Criteria for This Branch

This branch (`kaaro/breathe-life`) is considered successful if:

- [ ] `scripts/health-check.mjs` runs without error and produces valid JSON
- [ ] At least one library entry is correctly identified as `degraded` or `watch`
- [ ] At least one Alone-Time run completes: select → mutate → gate → commit → handoff
- [ ] The committed re-encode improves validator score and/or edge density
- [ ] The handoff document is structured and machine-readable
- [ ] All 168 tests still pass after every commit on this branch
- [ ] H6 (immune system) holds: no semantically broken entry passes the gate

Hypotheses H3–H8 are **deferred** to Phase 2+ and tracked in subsequent handoff documents.

---

## Falsification Log

*Populated as hypotheses are tested. Each entry records the hypothesis, the actual result, and what was updated.*

| Run | Hypothesis | Result | Action |
|---|---|---|---|
| Phase 1 pilot | H1 — Mirror: at least 1 degraded entry surfaces | ✅ CONFIRMED — 3 degraded, 1 watch on first run. `aoe-2-redbull` (score 212), `poker-tooling` (score 132), `gig-worker-projects` (score 88) | H1 holds. Thresholds calibrated. |
| Phase 1 pilot | H2 — Selection: ranking unambiguously picks worst entry | ✅ CONFIRMED — `aoe-2-redbull-april-2026` (4 validator warnings + density 1.40 + 3 climax beats) ranked first unambiguously | Scoring formula validated on real data. |
| Phase 2 pilot | H3 — Mutation: re-encode improves density ≥ 0.3 and clears validator | ✅ CONFIRMED — density 1.40 → 2.50 (+1.10), validator exit 1 → exit 0, climax 3 → 1, unclustered 12 → 0. All four health signals resolved in one run. | Gap-targeting via explicit signal list is effective. |
| Alone-Time run 2 | H3 — Mutation (poker-tooling): density 1.32 → 2.10, validator exit 1 → exit 0 | ✅ CONFIRMED — cross-cluster sweep (+33 edges) and event node addition cleared all gaps. | H3 holds on a second, distinct domain (gaming vs poker). |

---

*This document is the system's memory of what it expected before it became aware of itself. The Dream Loop should read this alongside the accumulated handoff history to evaluate whether the system's self-model was accurate.*
