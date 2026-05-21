# Cognitive Test Driven Development — kaaroViewer UI Facelift

Cognitive TDD: write what the user *should perceive / understand / feel* at each UI
moment before writing any CSS. Implementation must make these tests pass.
Each test follows: GIVEN → PERCEIVE → UNDERSTAND → FEEL → FAIL IF.

---

## CT-01 · Boot / Zero State

**GIVEN** User opens kaaroViewer for the first time (zero state visible)

**PERCEIVE**
- A serious, professional data terminal — not a website
- One clear focus point: the `explore` input
- The brand mark (◆ kaaroViewer) reads immediately at a glance
- A subtle grid texture behind the zero state (depth without distraction)

**UNDERSTAND**
- "I type something and something happens"
- The seed buttons offer me examples without forcing a choice
- `L` loads from a saved library

**FEEL** Curious. Invited. Not overwhelmed.

**FAIL IF**
- [ ] The tagline is invisible or borderline-readable
- [ ] The input box doesn't draw the eye first
- [ ] The brand mark competes with other elements for attention
- [ ] `box-shadow` glow breaks the flat terminal aesthetic
- [ ] The seed buttons look like web checkboxes

**STATUS**: PASSING — tagline `#445544`, box-shadow removed, placeholder lightened

---

## CT-02 · Keyboard Grammar — fnkey bar

**GIVEN** User is looking at any state of the app (fnkey bar visible at bottom)

**PERCEIVE**
- A dim row of keyboard shortcut hints along the very bottom edge
- Key labels `F1 F2 F3…` pop in orange; descriptions follow in muted text
- The bar recedes — it's a reference strip, not a navigation element

**UNDERSTAND** "I can press these keys to do things" — even without reading the manual

**FEEL** Informed. Not nagged.

**FAIL IF**
- [ ] The fnkey text is invisible (current `#1e1e00` is effectively black-on-black)
- [ ] Key labels don't stand out from descriptions
- [ ] The bar demands visual attention equal to content

**STATUS**: PASSING — fnk color `#334422`; key labels stay orange

---

## CT-03 · Navigation Trail — breadcrumb

**GIVEN** User has clicked one or more entities (breadcrumb has items)

**PERCEIVE**
- A horizontal trail of entity names across the top bar
- Current entity is amber, past entities are dim but legible
- `›` separators clearly indicate left-to-right traversal order

**UNDERSTAND** "I can click a past entity to return to it"

**FEEL** Oriented. The trail is my session memory.

**FAIL IF**
- [ ] The `bc-empty` placeholder is invisible (current `#2a2a10`)
- [ ] Past breadcrumb items are unreadable (current `#667755` — acceptable but dim)
- [ ] Separator `›` is invisible (current `#222200`)

**STATUS**: PASSING — bc-empty `#334422`, bc-sep `#2a2a10`

---

## CT-04 · Detail Panel — Entity Grammar

**GIVEN** User has clicked a node; detail panel is open

**PERCEIVE**
- Entity type label in orange (orange = action/type in Register A)
- QID/identifier in amber (amber = labels/identifiers)
- Key-value rows are scannable: key dim-left, value readable-right
- Section headers are visible but recede behind data

**UNDERSTAND** What type this entity is, what its key facts are, how to navigate away

**FEEL** Informed. Like reading a terminal data record.

**FAIL IF**
- [ ] dp-section-hdr `#2a2a10` makes sections invisible
- [ ] dp-footer `#1e1e00` is entirely invisible
- [ ] dp-key contrast too low to read labels

**STATUS**: PASSING — dp-section-hdr `#3a3a18`, dp-footer `#2a2a10`

---

## CT-05 · Loading Ritual

**GIVEN** User has submitted a query; canvas-loader is shown

**PERCEIVE**
- Three pulsing dots (▪▪▪ cadence) — system is thinking, not broken
- A label names the stage: "exploring…" / "building graph…" / "linking…"
- A progress track shows approximate completion

**UNDERSTAND** "The system is working — not frozen"

**FEEL** Patient. Expectant.

**FAIL IF**
- [ ] No visual indication of progress stage
- [ ] The dots look like a generic web spinner
- [ ] The loader disappears before the graph appears (jarring jump)

**STATUS**: PASSING (cl-dots animation exists; progress track exists)

---

## CT-06 · Action Bar Legibility

**GIVEN** User looks at the action bar (between canvas and fnkey bar)

**PERCEIVE**
- A row of labeled buttons: F1 MIC, F2 SAVE, F8 SSNS, L LIB, F9 BRIEF, ⚙ MODEL
- Source toggles on the left; control buttons on the right
- Active source toggles glow orange; inactive are dim

**UNDERSTAND** Which data sources are on; what global actions are available

**FEEL** In control. Not cluttered.

**FAIL IF**
- [ ] Buttons are styled inconsistently with each other
- [ ] Source toggle `.src-on` uses `box-shadow` glow (anti-pattern)
- [ ] `box-shadow` on sessions/library drawers

**STATUS**: PASSING — all box-shadow removed; src-on uses border only; drawers use accent borders

---

## CT-07 · Semantic Color Consistency

**GIVEN** User reads any panel or row across the entire UI

**PERCEIVE** Consistent color grammar: orange=action, amber=identifier, yellow=data, cyan=selected, green=geographic/success

**FAIL IF**
- [ ] Same color used for two different semantic roles on screen simultaneously
- [ ] `rgba()` dynamic tinting replaces named color tokens
- [ ] `border-radius > 2px` on any non-circular decorative element
- [ ] `.cl-pill` or tooltip uses `box-shadow`

**STATUS**: PASSING — all box-shadow removed; rgba() converted to hex (texture uses exempt)

---

## Implementation Checklist (derived from failing tests)

### Anti-pattern removals
- [ ] Replace all `box-shadow` with `border: 1px solid` alternatives
- [ ] Replace `linear-gradient` + `backdrop-filter` on report toggle bar with flat bg
- [ ] Replace `rgba()` backgrounds with explicit named hex tokens
- [ ] Remove `text-shadow` from zs-pulse animation
- [ ] Set `border-radius: 0` on all non-circular (decorative) elements — dots may stay as circles

### Contrast fixes (failing CT-01, CT-02, CT-03, CT-04)
- [ ] `bc-empty`: `#2a2a10` → `#334422` (still dim, but perceptible)
- [ ] `bc-sep`: `#222200` → `#2a2a10`
- [ ] `.fnk` text: `#1e1e00` → `#334422` (readable, still recedes)
- [ ] `.fnk em` (key labels): stays `#ff6600` — already correct
- [ ] `dp-section-hdr`: `#2a2a10` → `#3a3a18` (visible, still secondary)
- [ ] `dp-footer`: `#1e1e00` → `#2a2a10`
- [ ] `zs-tagline`: `#334433` → `#445544` (readable dim)

### Grammar / consistency
- [ ] Sessions header: change `#667755` label color to `#445544` (dim/metadata)
- [ ] Library header accent: `#00ff66` (off-brand) → keep as geographic green `#00ff88` (canonical)
- [ ] Remove `opacity: 0.6` on rp-cl-cnt — use explicit `#667755` instead
- [ ] Unify all drawer headers to same padding/font pattern

### Zero state polish
- [x] Remove `box-shadow` from `zs-input-wrap` — use `border: 1px solid #ff6600` (already there) only
- [x] `zs-tagline` contrast fix (above)
- [x] Remove `text-shadow` from `zs-pulse`

---

## CT-08 · Color Connectivity — PASSING

**GIVEN** User clicks a node and traverses entities

**PERCEIVE**
- The entity type color from the canvas node appears as a `border-left` accent on the breadcrumb chip
- The same color appears as the `border-left` on the detail panel header and colors the type label

**UNDERSTAND** "This color means this type — everywhere I see it"

**IMPLEMENTATION**
- `ontology.mjs`: added `colorToCSS(hex)` to convert Three.js color ints to CSS strings
- `breadcrumb.mjs`: `pushCrumb(qid, label, type)` now stores type; `_render()` inlines `border-left-color` per crumb
- `detail.mjs`: `dp-header` gets `border-left: 3px solid <typeColor>`, `dp-type-label` gets `color: <typeColor>`
- `main.mjs` + `garden-main.mjs`: all `pushCrumb` call sites thread `node.type`

---

## CT-09 · Boot Ritual — PASSING

**GIVEN** User opens kaaroViewer for the first time

**PERCEIVE** A terminal boot sequence: version line → init steps with [OK] → READY █

**UNDERSTAND** "This is a system. It initialized. It's ready for me."

**FEEL** The handshake before the tool. Professional, intentional.

**IMPLEMENTATION**
- `index.html`: `#zs-boot` block with 7 lines (`.zs-bl-0` through `.zs-bl-6`)
- `style.css`: staggered `animation-delay` on each line (0→700ms); `.zs-boot-out` fades it away; `.zs-body-hidden` → `.zs-body-visible` reveals explore UI
- `main.mjs`: boot sequence times out at 1100ms → cross-fades to explore UI → focuses input
