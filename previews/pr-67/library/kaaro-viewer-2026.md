---
published: false
title: "kaaroViewer: The Evolution of a Spatial Intelligence Platform"
tags: [kaaroViewer, narrative, evolution, architecture, knowledge-graph, ontology, llm]
description: "A causal narrative tracing kaaroViewer from a voice-driven entity pipeline to a self-improving 3D knowledge platform — centred on the project's core unsolved problem: how to maintain a personalized ontology for private knowledge visualization."
date: 2026-06-07
layer: L2-System
maturity: EVERGREEN
para: Area
---

# kaaroViewer: The Evolution of a Spatial Intelligence Platform

*A narrative document for /visualize encoding. Source for `library/kaaro-viewer.json`.*

---

## The Open-World Assumption and Where It Breaks

The earliest version of kaaroViewer was built on an implicit assumption: that the knowledge a user wants to visualize exists in the open world. Type a topic, OpenTapioca matches the text to Wikidata QIDs, SPARQL fetches structured facts for each entity — descriptions, images, relationships, linked identifiers. The system could render those entities as TCG-style cards, and later as A-Frame primitives, because Wikidata already knew what those entities were.

This worked. For public subjects — a tournament, a company, a piece of legislation — it still works. The Wikidata graph is vast, and SPARQL is a precise tool for querying it.

But a user's actual information is seldom entirely from the open world.

Personal knowledge vaults. Project notes. Research documents. Session retrospectives. Drafts, observations, analyses written for no one but the author. These texts have no QIDs. OpenTapioca cannot match them to anything. SPARQL has nothing to retrieve. The open-world assumption fails at exactly the boundary where personal knowledge begins.

---

## The Personalized Ontology Problem

What the open-world pipeline could not handle, an LLM could. Feed it a wall of text — a personal note, a research document, a session log — and ask it to impose a structure: identify the entities, name their types, trace the relationships between them, construct a narrative arc, surface the insights. The LLM does not need to match against an existing database. It reads the text and *constructs* an ontology from scratch.

This was the initial use: not to query knowledge that already existed in structured form, but to encode knowledge that existed only in prose.

The result was the intelligence brief format — a seven-layer JSON document (meta, nodes, edges, story, insights, clusters, report_card) that became the system's lingua franca. Every node has a type. Every edge has a relationship. Every piece of knowledge has a place in a schema that the visualization layer can render.

But the LLM's freedom to construct is also its liability. Left unconstrained, it invents types, creates relationships that the renderer doesn't understand, varies its encoding decisions from run to run. Two documents on the same topic, encoded a week apart, might produce incompatible schemas. The graph becomes unnavigable not because the knowledge is sparse but because the ontology has drifted.

**Maintaining a stable, evolvable, personalized ontology is the project's central unsolved problem.**

Every architectural decision since the LLM's introduction has been, in part, an attempt to address it.

---

## The Current Answer: A Three-Part Lock

The project's current approach to ontology maintenance is a three-component lock that must update atomically:

**The validator** (`validate-library-json.py`) holds the canonical vocabulary: `VALID_TYPES` and `VALID_RELS` — the complete set of node types and edge relationships the system recognizes. Any encoding that uses a type or relationship outside these sets is rejected. The validator is the ontology's enforcement point.

**The SOP** (`sop-reference.md`) holds the semantic and visual explanation for every type and relationship: what it means, when to use it, how the renderer will display it. It is the encoder's reference — the bridge between the formal vocabulary and the human (or LLM) deciding how to apply it.

**The renderer** (Three.js canvas geometry and style switches) holds the visual contract: every type in `VALID_TYPES` maps to a geometry, a colour, a scale rule. An ontology extension that adds a type without wiring it into the renderer produces nodes that render as fallback primitives — technically valid but visually anonymous.

These three must change together. Update the validator without updating the SOP, and encoders encode blindly. Update the SOP without updating the renderer, and the visual contract breaks. The atomicity requirement is the ontology's integrity rule.

The **Dream Loop** is the governance mechanism for when this vocabulary needs to evolve. It reads accumulated encoding signals across multiple runs, identifies patterns — recurring types that don't exist yet, relationships that encoders keep reaching for and finding absent — and proposes controlled vocabulary extensions. One Dream Loop run has been executed: it upgraded the treatment of `reveals`, a relationship the encoder repeatedly used from memory despite it being reserved for the loader's auto-generation. The fix was a constraint tightening, not a vocabulary addition. The vocabulary extension problem — adding genuinely new types for new knowledge domains — remains ahead.

This is still a refinement in progress. The current `VALID_TYPES` set was seeded by the project's early use cases. As the library grows into new domains, gaps will surface. The Dream Loop is the mechanism for addressing them deliberately rather than ad hoc.

---

## Two Interaction Paths

The LLM's role in encoding is exposed through two distinct paths, designed for different users and different purposes.

**The UI input box — the explore pipeline.** A user types a topic directly into the browser interface. The explore pipeline sends a prompt to Gemini (or a user-registered LLM via `window.kaaro.registerLLM()`), receives a brief JSON response, validates its structure, and renders it to the Three.js canvas. This happens in seconds. The result is a draft — a first-pass spatial encoding of the topic, suitable for exploration and orientation. It does not go into the library. It does not undergo quality gating. The ontology constraints are approximated, not enforced. This path is for anyone who wants to explore a subject spatially, immediately, without ceremony.

**The `/visualize` skill — the Claude CLI path.** A power user invokes the skill with a source document or inline text. The skill executes a structured three-pass process: a full entity sweep to produce `nodes[]`, a cross-cluster sweep to produce `edges[]`, then the narrative pass for story beats, insights, and clusters. The validator runs and must exit 0. Edge density must reach ≥ 2.0. Story beats must include exactly one climax. Insights must include at least one warning and one finding. The SOP's personalized ontology — `VALID_TYPES`, `VALID_RELS`, the full encoding rules — is the skill's operating context. Only entries that pass these gates reach the permanent library.

The distinction between the two paths is not merely quality. It is how much of the personalized ontology is enforced. The explore pipeline approximates the ontology. The skill enforces it. The library is the record of everything that passed enforcement.

---

## The Three.js Canvas and What It Renders

The move from A-Frame to a direct Three.js canvas was driven by control requirements that the declarative WebXR layer could not satisfy. Force-directed layout, tier-scaled geometry, sentiment aura rings, animated transitions between story beats, per-node paint textures — each of these required direct access to Three.js primitives that A-Frame wrapped too loosely.

A-Frame remains in the codebase as a historical artifact and the precedent for WebXR immersive mode. The canvas is now direct Three.js.

What the canvas renders is a function of the ontology. Each `type` in `VALID_TYPES` maps to a geometry: persons and players render as spheres; platforms as tori; events and conflicts as octahedra; concepts as tetrahedra; laws as icosahedra. Each `sentiment` maps to an aura ring colour. Each `tier` maps to a scale factor. The ontology is not only a data schema — it is a visual capability manifest. When the vocabulary expands, the canvas's expressivity expands with it.

---

## The Paint System and the Image Layer

Geometric primitives communicate structure. They do not communicate substance. A torus labelled "Blinkit" tells you it is a platform node. It does not tell you it is a dark warehouse, a ten-minute timer, a contested valuation. A sphere labelled "Hera" places a player in the graph. It does not evoke a competitor, a psychological profile, the moment a tournament turned.

Human comprehension at a glance runs on images and infographics, not on labelled shapes. This is the motivation for the paint system: to build an experience where a user can look at the canvas and *immediately understand what they are looking at* — before they read a single label, before they click into any node. Images do this work that geometry cannot.

The hard problem is prompt construction. Image models — Gemini, Stable Diffusion variants — are sensitive to prompt phrasing in ways that are not intuitive. However, the stable diffusion community has accumulated deep knowledge of what makes an image prompt work: seed phrases for photorealism, for cinematic composition, for documentary style, for technical diagram rendering. These patterns are well-known and transferable.

kaaroViewer's paint system constructs its prompts from three inputs:

**Spatial positioning** — the geometric layout of the canvas at the moment of painting. Which nodes are visible in the camera frustum. Which node is selected or slide-central. The relative positions of cluster members. The graph's spatial arrangement is a compositional input, not just a data source — it informs what should be in the foreground, what should recede, what relationship should be visually prominent.

**Textual context** — the active story beat's narration, the current node's description and metrics, the cluster's label and role in the report. This is the semantic layer: it tells the image model *what* is being depicted, not just *where* things are. The slide's narration is particularly rich — it is already a curated, human-readable summary of what matters at this moment in the brief.

**Cinematic camera angle** — the actual Three.js camera position and orientation at the time the paint is triggered. The camera angle determines the composition and perspective of the generated image. A low-angle camera looking up at a dominant node produces a different image — and a different emotional register — than a wide establishing shot from above. The camera is not incidental to the image; it is part of the prompt.

These three inputs are assembled by `PaintContext` and passed through a named strategy. The strategies are essentially disciplined prompt engineering patterns for different visual registers:

- **Cinematic**: draws on established prompt seeds for dramatic lighting, shallow depth of field, wide-angle establishing compositions. Produces images that feel like film stills. Effective for high-tension beats and protagonist nodes.
- **Documentary**: factual, journalistic framing. No artificial drama. Produces images that feel like photojournalism or infographic frames. Effective for data-heavy nodes and regulatory or economic subjects.
- **Abstract**: conceptual, non-representational. Geometric forms, colour fields, metaphoric composition. Effective for concept nodes and structural relationships that have no literal visual referent.
- **Blueprint**: technical diagram register. Engineering drawings, wireframes, annotated schematics. Effective for software architecture nodes, algorithm nodes, and system-level subjects.

Shift+P cycles the active strategy. The same canvas state, the same node, produces four genuinely different images depending on which visual register is active — because the strategy is not a filter applied after the fact, it shapes the prompt before the image model is called.

The result is applied as a texture to the Three.js mesh. The geometry remains; the image wraps it. The sphere that was a player becomes a portrait. The torus that was a platform becomes a visual identity. The canvas acquires the kind of immediate legibility that makes a brief comprehensible before a single word is read.

---

## What Remains Open

Ontology maintenance is the project's core ongoing work. The current vocabulary covers the use cases that have been encoded so far. It will not cover the next domain without deliberate extension. The Dream Loop is the mechanism; the signal accumulation process is the method; the three-part lock is the integrity rule. None of these are finished.

The eval loop — user ratings and structured observations flowing back as health signals — is designed to surface the gap between ontological correctness (does the entry pass the validator?) and ontological quality (does the encoding actually represent what the document says?). That gap is where the next generation of vocabulary extensions will come from.

Nine library entries. Fifteen knowledge domains touched. One vocabulary extension mechanism proven across one run. The ontology problem is named, partially constrained, and actively being worked.

---

*9 library entries · 168 tests · VALID_TYPES: 38 · VALID_RELS: 29 · Dream Loop runs: 1*
