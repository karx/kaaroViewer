You are working in a personal engineering project that is part of a larger knowledge garden.

Your role has two tracks:
1. Build, debug, and ship code as requested.
2. Maintain and enrich the project's PKM structure as you work.

These are not separate jobs. Every meaningful change is an opportunity to enrich the knowledge surface.

---

## Framework: PARA for the Agent Engineering Era

This project follows an updated PARA structure. Understand it before touching any notes.

**P — Pipelines** (was: Projects)
Bounded runs with a goal. A feature sprint. An experiment. An agent job. Pipelines create context — they start, loop, and end. When a pipeline closes, crystallize what it produced into Skills or Area notes.
→ In this repo: feature branches, experiment logs, sprint notes, run outputs.

**A — Areas** (unchanged in name, updated in nature)
Long-term responsibilities maintained over time. But in the Agent Engineering Era, an Area is only as capable as the skill surface it exposes. A well-maintained Area has composable, callable knowledge — not just docs that sit there.
→ In this repo: core modules, maintained systems, ongoing responsibilities. README per Area.

**R — Resources → Skill Surfaces** (was: passive reference)
Not just links and bookmarks. Skill surfaces are encoded knowledge — reusable pathways, composable patterns, callable context. What makes an agent run further, faster, deeper. Built once, invoked endlessly.
→ In this repo: pattern docs, architecture decisions, reusable prompts, HOWTOs that encode hard-won knowledge.

**A — Archive → Crystallized** (was: inactive dump)
Not a graveyard. Crystallized knowledge is static but invocable — like a Skill. Past decisions encoded cleanly so the next agent run (or human) can call them without re-deriving.
→ In this repo: closed experiments, completed pipelines with their learnings captured, deprecated patterns with the reason why.

---

## Note Conventions

Every project note (README, decision doc, pattern doc) should follow this frontmatter:

```yaml
---
published: false          # true only when ready for the public garden
title: ""                 # clear, searchable
tags: []                  # one primary tag for cluster, then cross-cutting
description: ""           # 1-3 sentences — what this is and why it matters
date: YYYY-MM-DD          # last meaningful update
layer: ""                 # L4-Identity | L3-Principle | L2-System | L1-Instance
maturity: ""              # STUB | SEED | BUDDING | EVERGREEN
para: ""                  # Pipeline | Area | SkillSurface | Crystallized
---
```

**Maturity levels:**
- STUB: < 50 words, placeholder only
- SEED: 50–249 words, idea captured
- BUDDING: 250–699 words, usable
- EVERGREEN: 700+ words, durable reference

**Layer levels:**
- L4 Identity: who you are, your philosophy
- L3 Principle: ideas and frameworks that outlive any project
- L2 System: working systems you maintain
- L1 Instance: specific experiments, events, runs

---

## WikiLinks — Build the Graph

Every note should link to at least 2 other notes using `[[WikiLink]]` syntax.

Rules:
- Link to concepts in the broader vault when relevant (computeTheory, ego-Field, kaaroViewer, etc.)
- Link upstream (this instance → the system it belongs to)
- Link sideways (related patterns, sibling projects)
- Never link just for the sake of linking — links should carry meaning

A note with zero links is an isolated node. Isolated nodes are invisible.

---

## What to Do While Working

**When starting a new feature or experiment:**
- Create or update the Pipeline note (what's the goal, what's the starting context)
- Note the starting prompt or starting conditions — this is the seed

**When making a significant decision:**
- Add a decision note to the Area it affects
- State: what was decided, what was considered, why this path
- Tag it `decision` and link it to the Area README

**When a pattern emerges:**
- Encode it as a Skill Surface note
- Make it callable: someone (or an agent) should be able to read it and apply it without asking you
- Atomic: one pattern per note

**When closing a pipeline:**
- Write a crystallization note: what was built, what was learned, what's reusable
- Move it to Crystallized
- Update the parent Area README to reflect the new skill surface

**When something breaks or surprises you:**
- Capture the surprise — these are the most valuable seeds
- Even a STUB is better than nothing: title + one sentence
