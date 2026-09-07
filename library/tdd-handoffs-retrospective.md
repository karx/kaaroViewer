# Encoding Retrospective: TDD Handoffs: Tests as Agent Contracts

**Source**: `Inbox/TDD Handoffs.md`
**Output**: `library/tdd-handoffs.json`
**Encoded**: 2026-06-09

## What Went Well

- **The three spine nodes (TDD Handoff / Seam / Fake) directly encode the causal triad at the heart of the source.** The graph makes the argument visible: naming the seam enables the fake; the fake enables the fast unit layer and therefore the handoff itself. Tracing `seam → fake → unit-test-layer → fast-feedback-loop` recovers the core insight without reading the prose.
- **All four named seams became first-class nodes (Extractor, Deployer, HookBus, WorldRegistry) typed as software.** This followed the "never compress named tools/products into categories" rule from the Toolkit profile (even though this source is primarily reflective). The membership edges back to the abstract `seam` node plus the four `fake` implements edges give the specific seams both identity and context.
- **Story beats mapped cleanly onto the explicit "How to Do the Handoff" steps plus the taxonomy and reliability extensions.** Nine beats, clean low→medium→high→climax→low arc, with the actual handoff moment (tests + seams only, agent fills core/) as the single climax containing the key numbers (4 seams, 5 steps, <2 s loop).
- **Edge density cleared the gate comfortably (43 / 18 ≈ 2.39).** The cross-cluster sweep added the necessary bridges (handoff-practice ↔ seam-architecture, contract-layer ↔ grounding-reliability, plus the concrete-io-dependency antagonist mitigated by the rule). Several high-weight (4–5) causal and enabling edges landed on the defining relationships (fake enables fast loop, seam-test-rule governs unit layer, crash-here causes atomic patterns).
- **Insight titles are declarative claims.** Each names a subject (seam, I/O pollution, fixture, crash-here test, living spec, five-step sequence), a mechanism, and a direction or consequence. The required `warning` + `finding` are present; the mix also includes pattern, conclusion, and opportunity.
- **The antagonist node `concrete-io-dependency` (typed issue, negative sentiment) plus its `disrupts` and `mitigates` edges makes the "what not to test" rule visually active** rather than a footnote. It sits in the handoff-practice cluster as the thing the seam-test-rule exists to exclude.

## What the Skill Could Have Done Better

- **The source is extremely short (< 700 words).** Hitting 18 nodes and 43 edges required expanding every named seam, every layer, the rule, the fixture, the reliability dimension, the living-spec meta, and two "negative space" nodes (orchestration-tests, concrete-io-dependency). The encoding is faithful but the source itself is more of a checklist than a rich narrative; some edges feel like they were mined from implication rather than explicit statement.
- **No temporal or person entities at all.** The reflective profile correctly told us to mark datable-events / named-people / laws as N/A, but the Step 1 template still asks for them. A small amount of friction remains.
- **"Orchestration tests" was added late to satisfy an edge.** The source mentions them ("orchestration tests could be written without Docker...") but they were not elevated to a first-class named thing in the initial node pass. The cross-cluster / density sweep caught the gap and the node was inserted. This is the correct process, but it shows that even a short prescriptive text can hide secondary concepts that only become visible once edges are drawn.
- **The four specific seams were typed `software`.** This is defensible (they are the concrete modules of the Art of Mine(craft) project), but `concept` would also have been valid. The choice makes them larger in the layout; a reviewer could argue they should be smaller supporting nodes. Either works; the ontology does not force a distinction for internal architectural seams.

## How This Topic Could Have Been Better Visualized

- **A small state-machine or sequence diagram for the five-step handoff would carry more than the graph alone.** The numbered list in the source ("1. Name the module boundary... 5. The agent fills in core/") is inherently procedural. A horizontal flow (seam → fake → failing test → handoff → implemented) with the tests as the arrow labels would be a natural companion asset in `library/diagrams/tdd-handoffs/`.
- **The "crash-here" question is a powerful mental model.** Visualising a deploy seam with a "die here" probe and the resulting staging-dir + rename arrows would make the reliability extension visceral. The current graph only shows the resulting `atomic-write-patterns` node.
- **The tiny_world fixture is a concrete artifact.** A screenshot or even a tiny thumbnail of the committed world save (or a before/after of "live server required" vs "fixture only") would reinforce why the 1 MB committed file is load-bearing for agent usability.

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A- | 18 nodes for a very short source. All four named seams, the full taxonomy, the reliability dimension, the rule, the meta ("tests as spec"), and an explicit antagonist. Only modest expansion beyond the source's explicit nouns. |
| Edge density | A | 43 edges / 18 nodes = 2.39×. Cross-cluster sweep and "what does each primary do to the spine?" pass both succeeded. High-weight edges concentrated on the causal spine (seam enables fake enables fast loop). |
| Story arc quality | A | 9 beats, exactly one climax at the actual handoff moment, proper tension ramp, present-tense narration naming entities and numbers where appropriate. The "what not" and "living spec" beats close the loop cleanly. |
| Insight title quality | A | All six titles are publishable headlines with subject + mechanism + direction. Required warning and finding present; good mix of finding/pattern/conclusion/opportunity. |
| Cluster design | A- | 5 clusters, every node assigned exactly once. Cluster names describe function (The TDD Handoff Practice, Explicit Seams, Fakes and the Fast Contract Layer, Three-Layer Test Taxonomy, Determinism and Partial-Failure Resilience). The antagonist lives with the rule that excludes it. |
| Entity visual-model opportunity | B | The four seams (Extractor etc.) and the tiny_world fixture are the strongest candidates for 2D/3D assets or icons. The rest are pure concepts; they will render as geometric primitives. No real product logos or portraits in the source. |
| Slide / narrative surface | A- | The 9 beats map almost 1:1 onto a horizontal slide deck (one slide per beat or merge the two "low" openers). The climax beat would benefit from a small companion diagram of "tests + seams → agent → core/". The living-spec closer is a natural end slide. |

## Skill-Level Recommendations

1. **The Reflective / Essay profile is now battle-tested on two documents.** The profile guidance in the SOP (skip forced datable/law sweeps, treat named concepts/tools/metaphors as mandatory nodes, cluster by argumentative role, key_stats as counts + before/after shifts) worked well here and on the agents essay. Consider promoting the profile notes from "if the source is reflective..." to a top-level checklist the encoder must run.

2. **Short prescriptive sources still need the full three-pass discipline.** It would have been tempting to collapse nodes+edges because the text is a numbered list. Forcing the entity pass first, then the density gate, then narrative prevented under-connected "just the seams" graph. Keep the gate strict even for checklist-length sources.

3. **Consider a lightweight "procedure / checklist" story-beat pattern for future handoff-style or SOP sources.** The current narrative arc (low → ... → climax) still worked, but the beats ended up being "step 1", "step 2", ... plus context. A variant that allows a "procedure" tension label or a horizontal process cluster might reduce the slight narrative forcing.

4. **Add a one-line note in the validator output or SOP when edge density is achieved only after late node additions.** In this case `orchestration-tests` was inserted purely for an edge; flagging "X secondary nodes were added during the density sweep" would help future encoders (and retrospectives) see the cost of thin sources.

Run F5 LIB in kaaroViewer to load.
