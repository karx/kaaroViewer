# Encoding Retrospective: The Digital Bedrock — Minecraft Redstone Computation

**Source**: `library/minecraft-redstone.md`
**Output**: `library/minecraft-redstone-computation.json`
**Encoded**: 2026-04-15

---

## What Went Well

**Named-entity sweep was comprehensive.** The source document contains a dense set of named components, builders, architectural concepts, and version milestones. All were captured: 5 named builders, 10 Redstone component blocks, 9 circuit/architecture concepts, 6 version milestones, 3 named projects, and 2 historical reference anchors. No named entities were compressed into category nodes.

**The BPE narrative thread held the graph together.** Identifying Block Space Efficiency (BPE) as a spine node rather than a secondary concept was the right call. It appears in edges from 6 different nodes (tick-rate-limit, ripple-carry-adder, copper-bulb, observer, java-1-21, java-1-11, deep-thought, n00b-asaurus) and makes the causal architecture of the report immediately legible in the graph layer.

**Quasi-Connectivity treated as primary.** QC is a named concept that deserves primary tier — not a footnote to the Piston node. Its dual permit/prohibit edges to Java and Bedrock editions encode the platform divide cleanly and generate a visible structural split in the graph.

**Design extinction pattern encoded causally.** Rather than narrating design extinction events only in story beats, they were encoded structurally as `causes` edges from java-1-11 and java-1-21 to `bpe`, letting the graph layer carry the argument independently of the story layer.

**Tension arc landed correctly.** The climax at beat 7 (SethBling's Atari emulator) is the right narrative peak — it proves Turing completeness while simultaneously proving the tick-rate ceiling makes it impractical. The dual revelation of universality AND futility is the central paradox of the source, and it hit at the correct arc position.

---

## What the Skill Could Have Done Better

**Salaja and Laurens Weyn are underrepresented.** Both are primary milestones in the stored-program evolution but ended up as secondary nodes with only `association` edges. A dedicated milestone node for Salaja's machine (April 2011) would have strengthened the temporal chain between internetftw-cpu and deep-thought. The source table lists them as explicit milestones and they deserved event nodes, not just person nodes.

**`command-blocks` disruption edge is weakly grounded.** The `disrupts` edge from command-blocks to redstone-computation captures the philosophical divide, but the source only mentions it in passing. A stronger encoding would have added a `concept` node for the "Pure Redstone vs. Hybrid" debate and given it a proper story beat, rather than encoding it as a side effect of command-blocks.

**No dedicated `java-1-17` milestone node.** The Sculk Sensor (1.17, 2021) was introduced without its own version milestone node because I capped at 6 version nodes. This means the temporal chain skips from java-1-11 (2016) to java-1-21 (2024), losing an 8-year gap that included the Sculk Sensor introduction. A 7th version milestone would have made the timeline complete.

**Wikidata coverage is sparse for circuit concepts.** SR Latch (Q185778), D-Flip-Flop (Q2030309), Von Neumann Architecture (Q186302), and ALU (Q173661) were populated, but Ripple-Carry Adder (Q1088097), Finite-State Machine (Q183164), and Turing Completeness (Q131928) should have been verified against live Wikidata before committing — they were populated from memory, not verified lookup.

---

## How This Topic Could Have Been Better Visualized

**Temporal chain deserved milestone nodes for builder events.** The CPU development table in the source (Table 2) lists 5 milestones with dates. All 5 should have been `event` nodes in a dedicated timeline cluster, with `precedes` edges forming an explicit chain. Currently 3 of them are nodes (internetftw-cpu, deep-thought, atari-emulator) but Salaja's machine and Laurens Weyn's Redgame are only person nodes, breaking the visual timeline.

**A "bit-width progression" metric axis would help.** The source tracks architectural bit-width as a progression dimension (4-bit → 8-bit → 16-bit → 32-bit → 64-bit). Encoding these as `metric` nodes with `achieves` edges from key projects would let the graph show the computational scale progression orthogonally to the BPE axis.

**Two-cluster split for Architecture vs. Theory.** The current "Logic and Memory Architecture" cluster mixes implementation circuits (SR Latch, T-FF, D-FF, ALU) with theoretical constructs (Turing Completeness, Von Neumann Architecture). Splitting into "Circuit Implementations" and "Computational Theory" would make the visual grouping more semantically precise.

---

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A | All 5 named builders, all 10 named Redstone components, all named circuit types captured. Salaja/Laurens Weyn slightly underserved. |
| Edge density | A | 91 edges / 42 nodes = 2.17 — above the 2.0 gate. Cross-cluster sweep found 12+ inter-cluster edges. |
| Story arc quality | A | 9 beats, correct tension pattern (low→low→med→med→high→high→climax→med→low). Climax correctly placed on the Atari emulator / Turing-completeness paradox. |
| Insight title quality | A- | All 6 titles are declarative claims with named subjects and stated directions. One title (ins-mojang-validation) is slightly long but accurately reflects the argument. |
| Cluster design | B+ | 5 clusters cover all 42 nodes with no orphans. "Platform and Engineering Limits" bundles too many conceptually distinct nodes (BPE, tick rate, Mojang, historical references). Splitting would improve visual clarity. |

---

## Skill-Level Recommendations

1. **For technical history documents:** Always create dedicated milestone/event nodes for every named dated achievement in summary tables. The source's Table 2 (CPU milestones) and Appendix timeline should produce a 1:1 event node mapping, not selective coverage.

2. **For game-engine computational topics:** The `software` type is the correct choice for named in-game components. Do not compress multiple game blocks into category abstraction nodes — each named block deserves its own node.

3. **For dual-theme climaxes** (achievement + limitation simultaneously): The paradox insight type is correct. The story beat's narration should state both the achievement metric AND the limitation metric in the same sentence to maximize the tension.

4. **Wikidata policy:** For technical concepts (circuit types, algorithms, architectures), always add a note in the retrospective flagging which QIDs were populated from memory vs. verified lookup. Memory-populated QIDs should be treated as provisional.
