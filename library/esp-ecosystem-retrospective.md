# Encoding Retrospective: ESP Microcontroller Ecosystem

**Source**: `2 Resources/Hardware/ESP/README.md` (kaaroBrain)  
**Output**: `library/esp-ecosystem.json`  
**Encoded**: 2026-05-22

## What Went Well
- Clearly captured the multi-paradigm nature of the ESP ecosystem as a strength rather than fragmentation.
- OTA was correctly elevated as the key production feature.
- Good separation between Hardware, Frameworks, Tooling, and Deployment clusters.
- Strong spine (ESP chips + major frameworks + OTA).

## What Could Have Been Better
- Edge density landed slightly below 2.0 (acceptable for a reference document, but noted).
- Limited causal depth in the source made some edges lighter than ideal.
- Could benefit from a simple comparison diagram of Arduino vs MicroPython vs Espruino trade-offs in future.

## Summary Table

| Dimension                    | Grade | Notes |
|-----------------------------|-------|-------|
| Node coverage               | A-    | Good coverage of hardware, frameworks, and tooling |
| Edge density                | B     | Slightly below target; acceptable for reference material |
| Story arc quality           | B+    | Solid progression from hardware → ecosystem → deployment |
| Insight quality             | A-    | Clear `warning` on Arduino's long-term cost + strong findings |
| Cluster design              | A     | Functional clusters (Hardware, Frameworks, Tooling, OTA) |
| Entity visual-model opportunity | B  | Hardware nodes could benefit from real board images/models |

## Skill-Level Notes
- Reference/overview documents benefit from relaxed density expectations.
- Consider adding a lightweight "ecosystem comparison" visual when the source discusses multiple competing frameworks/tools.

## Re-encode 2026-09-17 — ontology conformance + density

**Trigger:** health-check flagged `validator-exit2` (5 cross-reference errors, 15 warnings, density 1.57).

| Change | Before | After |
|---|---|---|
| Nodes / edges / density | 14 / 22 / 1.57 | 18 / 44 / 2.44 |
| `report_card` protagonists/antagonists | free-text labels | node ids |
| `meta.tone` | `reference` (invalid) | `analytical` |
| Node types outside ontology | `hardware`, `framework`, `tool`, `process` | `platform`, `software`, `solution` |
| Rels outside ontology | `supports`, `updates`, `simplifies` | `enables` (labelled) |
| Climax beat | none | beat-5 "OTA Becomes Non-Negotiable" |

**Encoding decisions**
- The three antagonists the original named as strings (physical access, maintenance burden, framework lock-in) became `issue` nodes. Making them entities let every tooling choice carry an explicit `mitigates` / `causes` edge, which is where most of the new density came from and is also the report's actual argument.
- Added `esp-idf` as a `software` node. The source names it in the framework list, and it is the substrate the Arduino core, PlatformIO and Mongoose OS derive from; without it the `derives_from` edges had no target.
- `ota-updates` is a `solution`, not a `concept`: it is the thing that resolves the physical-access issue.

**Skill-level note:** the earlier "relaxed density for reference documents" suggestion is withdrawn. The density was low because the antagonists were prose, not because the source was thin.
