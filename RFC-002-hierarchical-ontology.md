# RFC-002: Hierarchical Ontology with Similarity & Governance

**Status**: SPIKE — design exploration, not yet approved  
**Depends on**: RFC-001 (Skeleton + Hydration pipeline)  
**Author**: Gardener (alone-time)  
**Date**: 2026-06-19  

---

## Problem Statement

Current ontology (`VALID_TYPES`, `VALID_RELS` in `validate-library-json.py`) is **flat, opaque, and rigid**:

| Limitation | Impact |
|------------|--------|
| No sub-typing | `labor-platform` forced into `platform` — loses domain nuance |
| No rel hierarchy | `enforces` ≠ `governs` even though `enforces ⊑ governs` |
| No similarity | `software`/`tool`/`platform` visually distinct despite shared "instrument" semantics |
| No deprecation | `creation` → `creates` breaks all 11 entries at once |
| No computed facets | `tier:spine` + `type:person` = `protagonist` but encoded manually |
| No cross-cutting queries | "All things that enforce" requires full scan + string match |

As library grows (>20 entries), these become **encoding debt** — every new domain (esports, hardware, PKM, legal) stretches flat vocabulary.

---

## Design Goals

1. **Backward compatible** — existing 11 entries validate without changes
2. **Human-authorable** — ontology edits stay in plain Python/JSON, no DSL
3. **Render-aware** — hierarchy drives visual encoding (palette, shape inheritance)
4. **Queryable** — "subtype of X", "relatives of Y", "all enforcing rels" at validator time
5. **Governance** — deprecation aliases, migration hints, change audit trail

---

## Proposed Data Model

### 1. Type Registry with Inheritance

```python
# .claude/hooks/validate-library-json.py

VALID_TYPES = {
    # ── Core hierarchy ─────────────────────────────────────────────────────
    'entity':       { 'abstract': True, 'facets': ['id', 'label', 'type', 'tier', 'sentiment'] },
    'agent':        { 'parent': 'entity', 'abstract': True, 'facets': ['tier', 'sentiment'] },
    'person':       { 'parent': 'agent', 'facets': ['tier', 'sentiment', 'role'] },
    'player':       { 'parent': 'person', 'facets': ['tier', 'team', 'civ'] },
    'organization': { 'parent': 'agent', 'facets': ['tier', 'domain'] },
    'company':      { 'parent': 'organization', 'facets': ['tier', 'domain', 'stage'] },
    
    'artifact':     { 'parent': 'entity', 'abstract': True, 'facets': ['tier', 'description'] },
    'standard':     { 'parent': 'artifact', 'facets': ['tier', 'version', 'enforces'] },
    'framework':    { 'parent': 'standard', 'facets': ['tier', 'enforces', 'transforms'] },  # NEW Tier 1
    'prompt':       { 'parent': 'standard', 'facets': ['tier', 'enforces', 'renders'] },    # NEW Tier 1
    'software':     { 'parent': 'artifact', 'facets': ['tier', 'version', 'renders'] },
    'tool':         { 'parent': 'software', 'facets': ['tier', 'operator', 'visualizes'] }, # NEW Tier 1
    'platform':     { 'parent': 'artifact', 'facets': ['tier', 'hosts', 'governs'] },
    'labor_platform': { 'parent': 'platform', 'facets': ['tier', 'worker_type', 'algorithm'] },
    'tournament_platform': { 'parent': 'platform', 'facets': ['tier', 'game', 'format'] },
    
    'process':      { 'parent': 'entity', 'abstract': False, 'facets': ['tier', 'stages', 'creates'] }, # NEW Tier 1
    'concept':      { 'parent': 'entity', 'facets': ['tier', 'abstractness'] },
    'event':        { 'parent': 'entity', 'facets': ['tier', 'date', 'precedes'] },
    'milestone':    { 'parent': 'event', 'facets': ['tier', 'significance'] },
    'insight':      { 'parent': 'entity', 'facets': ['type', 'severity', 'evidence'] },
    
    # Legal / institutional (existing)
    'ruling':       { 'parent': 'concept' },
    'regulation':   { 'parent': 'standard' },
    'law':          { 'parent': 'standard' },
    
    # Technical (existing)
    'algorithm':    { 'parent': 'concept' },
    'dataset':      { 'parent': 'artifact' },
    'model':        { 'parent': 'artifact' },
    'system':       { 'parent': 'entity', 'facets': ['tier', 'components', 'underpins'] }, # NEW Tier 2
}

# Computed: all concrete (non-abstract) types for validation
def concrete_types():
    return {k for k, v in VALID_TYPES.items() if not v.get('abstract')}

# Computed: lineage for any type
def lineage(type_id: str) -> list[str]:
    path = []
    while type_id in VALID_TYPES:
        path.insert(0, type_id)
        type_id = VALID_TYPES[type_id].get('parent')
    return path

# Example: lineage('framework') → ['entity', 'artifact', 'standard', 'framework']
# Example: lineage('labor_platform') → ['entity', 'artifact', 'platform', 'labor_platform']
```

### 2. Rel Registry with Hierarchy + Properties

```python
VALID_RELS = {
    # ── Structural hierarchy ───────────────────────────────────────────────
    'relation':     { 'abstract': True, 'symmetric': False, 'cardinality': 'N:M' },
    'structural':   { 'parent': 'relation', 'abstract': True },
    'causal':       { 'parent': 'relation', 'abstract': True },
    'semantic':     { 'parent': 'relation', 'abstract': True },
    'temporal':     { 'parent': 'relation', 'abstract': True },
    
    # ── Concrete rels ──────────────────────────────────────────────────────
    # Causal
    'causes':       { 'parent': 'causal', 'inverse': 'caused_by', 'cardinality': '1:N', 'weight_range': [3,5] },
    'enables':      { 'parent': 'causal', 'inverse': 'enabled_by', 'cardinality': '1:N' },
    'prevents':     { 'parent': 'causal', 'inverse': 'prevented_by', 'cardinality': '1:1' },
    
    # Structural (NEW Tier 1)
    'enforces':     { 'parent': 'structural', 'inverse': 'enforced_by', 'cardinality': '1:N', 'label_required': True },  # governs + validates
    'transforms':   { 'parent': 'structural', 'inverse': 'transformed_by', 'cardinality': '1:1' },       # input → new form
    'creates':      { 'parent': 'structural', 'inverse': 'created_by', 'cardinality': '1:N' },            # process → artifact
    'maps_to':      { 'parent': 'structural', 'inverse': 'mapped_from', 'cardinality': 'N:M', 'symmetric': True }, # structural correspondence
    'underpins':    { 'parent': 'structural', 'inverse': 'grounded_by', 'cardinality': '1:N' },           # foundation
    'visualizes':   { 'parent': 'structural', 'inverse': 'visualized_by', 'cardinality': '1:1' },        # tool → target
    'renders':      { 'parent': 'structural', 'inverse': 'rendered_by', 'cardinality': '1:1' },          # spec-driven output
    
    # Semantic (existing + NEW)
    'supports':     { 'parent': 'semantic', 'inverse': 'supported_by', 'cardinality': 'N:M' },           # evidence → claim (NEW Tier 1)
    'cites':        { 'parent': 'semantic', 'inverse': 'cited_by', 'cardinality': 'N:M' },
    'contradicts':  { 'parent': 'semantic', 'inverse': 'contradicted_by', 'cardinality': 'N:M' },
    'derives_from': { 'parent': 'semantic', 'inverse': 'derives_into', 'cardinality': '1:1' },
    
    # Temporal
    'precedes':     { 'parent': 'temporal', 'inverse': 'follows', 'cardinality': '1:N' },
    'supersedes':   { 'parent': 'temporal', 'inverse': 'superseded_by', 'cardinality': '1:1' },
    
    # Governance (existing)
    'governs':      { 'parent': 'structural', 'inverse': 'governed_by', 'cardinality': '1:N', 'label_required': True },
    'permits':      { 'parent': 'structural', 'inverse': 'permitted_by', 'cardinality': '1:N', 'label_required': True },
    'prohibits':    { 'parent': 'structural', 'inverse': 'prohibited_by', 'cardinality': '1:N', 'label_required': True },
    
    # Association (existing)
    'association':  { 'parent': 'relation', 'symmetric': True, 'cardinality': 'N:M' },
    'location':     { 'parent': 'association', 'inverse': 'located_at', 'cardinality': 'N:1' },
    'membership':   { 'parent': 'association', 'inverse': 'member_of', 'cardinality': 'N:1' },
    'ownership':    { 'parent': 'association', 'inverse': 'owned_by', 'cardinality': 'N:1' },
    'employment':   { 'parent': 'association', 'inverse': 'employer_of', 'cardinality': 'N:1' },
    'leadership':   { 'parent': 'association', 'inverse': 'led_by', 'cardinality': 'N:1' },
    'features':     { 'parent': 'association', 'inverse': 'featured_in', 'cardinality': 'N:M' },
    'broadcasts':   { 'parent': 'association', 'inverse': 'broadcast_on', 'cardinality': '1:N' },
    'creation':     { 'parent': 'structural', 'deprecated': True, 'replaced_by': 'creates' },  # alias
    'reveals':      { 'parent': 'causal', 'forbidden': True, 'reason': 'auto-generated by loader' },
    'default':      { 'parent': 'relation', 'deprecated': True, 'reason': 'use explicit rel' },
}

# Query helpers
def rels_by_category(category: str) -> list[str]:
    return [k for k, v in VALID_RELS.items() if lineage_rel(k)[1] == category]

def is_subrel_of(child: str, ancestor: str) -> bool:
    return ancestor in lineage_rel(child)

def concrete_rels():
    return {k for k, v in VALID_RELS.items() if not v.get('abstract') and not v.get('forbidden')}

def lineage_rel(rel_id: str) -> list[str]:
    path = []
    while rel_id in VALID_RELS:
        path.insert(0, rel_id)
        rel_id = VALID_RELS[rel_id].get('parent')
    return path
```

### 3. Similarity Clusters (Visual + Semantic)

```python
# Cross-cutting similarity groups — not hierarchy, but shared rendering / query
SIMILARITY_CLUSTERS = {
    'instrument': {
        'types': ['software', 'tool', 'platform', 'framework'],
        'shared_facets': ['version', 'operator'],
        'visual': { 'palette': 'blue-teal', 'shape_family': 'rectangular' },
        'query': "SELECT * WHERE type IN ('software','tool','platform','framework')"
    },
    'agentive': {
        'types': ['person', 'player', 'organization', 'company', 'government'],
        'shared_facets': ['tier', 'sentiment'],
        'visual': { 'palette': 'amber-orange', 'shape_family': 'circular' },
    },
    'informational': {
        'types': ['concept', 'standard', 'algorithm', 'dataset', 'model', 'prompt', 'framework', 'regulation', 'law', 'ruling'],
        'shared_facets': ['version', 'abstractness'],
        'visual': { 'palette': 'green-emerald', 'shape_family': 'hexagonal' },
    },
    'temporal': {
        'types': ['event', 'milestone', 'process'],
        'shared_facets': ['date', 'precedes'],
        'visual': { 'palette': 'red-rose', 'shape_family': 'diamond' },
    },
    'insightful': {
        'types': ['insight', 'finding', 'warning', 'pattern', 'conclusion', 'paradox', 'opportunity'],
        'shared_facets': ['severity', 'evidence'],
        'visual': { 'palette': 'purple-violet', 'shape_family': 'star' },
    },
}

# Rel similarity
REL_SIMILARITY = {
    'governance': ['governs', 'permits', 'prohibits', 'enforces'],
    'causal_chain': ['causes', 'enables', 'prevents', 'precedes'],
    'structural_mapping': ['maps_to', 'transforms', 'creates', 'underpins'],
    'evidential': ['cites', 'supports', 'contradicts', 'derives_from'],
    'visual_output': ['visualizes', 'renders', 'features', 'broadcasts'],
}
```

---

## Validator Integration (Backward Compatible)

```python
# In validate() — replace flat checks with hierarchy-aware checks

def validate_type(node_type: str) -> tuple[bool, str | None]:
    """Returns (valid, warning_msg). Accepts concrete + deprecated types."""
    if node_type in VALID_TYPES:
        spec = VALID_TYPES[node_type]
        if spec.get('abstract'):
            return False, f'type "{node_type}" is abstract — use a concrete subtype'
        if spec.get('deprecated'):
            return True, f'type "{node_type}" is deprecated; use {spec.get("replaced_by")}'
        return True, None
    return False, f'unknown type "{node_type}"'

def validate_rel(rel: str) -> tuple[bool, str | None]:
    if rel in VALID_RELS:
        spec = VALID_RELS[rel]
        if spec.get('forbidden'):
            return False, spec.get('reason', f'rel "{rel}" is forbidden')
        if spec.get('abstract'):
            return False, f'rel "{rel}" is abstract — use a concrete sub-rel'
        if spec.get('deprecated'):
            return True, f'rel "{rel}" is deprecated; use {spec.get("replaced_by")}'
        return True, None
    return False, f'unknown rel "{rel}"'

# Hierarchy-aware quality checks
def suggest_specific_type(generic_type: str, context: dict) -> list[str]:
    """Given a generic type + node context, suggest concrete subtypes."""
    candidates = []
    for tid, spec in VALID_TYPES.items():
        if spec.get('abstract') or spec.get('deprecated'):
            continue
        if is_subtype_of(tid, generic_type):
            # Score by facet match
            score = sum(1 for f in spec.get('facets', []) if f in context)
            candidates.append((score, tid))
    return [tid for _, tid in sorted(candidates, reverse=True)]

def is_subtype_of(child: str, ancestor: str) -> bool:
    return ancestor in lineage(child)
```

---

## Renderer Integration (Inheritance-Driven)

```javascript
// canvas/paint-strategies.mjs

const TYPE_STYLE_REGISTRY = {
  // Base styles inherited by subtypes
  'entity':      { shape: 'circle',    color: '#888888', strokeWidth: 1 },
  'agent':       { shape: 'circle',    color: '#f59e0b', strokeWidth: 1.5 },
  'artifact':    { shape: 'hexagon',   color: '#10b981', strokeWidth: 1.5 },
  'standard':    { shape: 'hexagon',   color: '#059669', strokeWidth: 2 },
  'software':    { shape: 'square',    color: '#3b82f6', strokeWidth: 2 },
  'platform':    { shape: 'square',    color: '#2563eb', strokeWidth: 2 },
  
  // Concrete overrides (merge with parent)
  'person':      { shape: 'circle',    color: '#fbbf24', icon: 'user' },
  'player':      { shape: 'circle',    color: '#f59e0b', icon: 'trophy' },
  'framework':   { shape: 'hexagon',   color: '#a855f7', icon: 'layers', strokeDash: [5,5] },
  'prompt':      { shape: 'hexagon',   color: '#d946ef', icon: 'bolt' },
  'tool':        { shape: 'square',    color: '#06b6d4', icon: 'wrench' },
  'labor_platform': { shape: 'square', color: '#0891b2', icon: 'users' },
  'process':     { shape: 'diamond',   color: '#ef4444', icon: 'git-branch' },
  'system':      { shape: 'octagon',   color: '#ec4899', icon: 'cube' },
};

// Resolve style by walking lineage
function resolveStyle(typeId) {
  const lineage = getTypeLineage(typeId); // ['entity', 'artifact', 'standard', 'framework']
  let style = {};
  for (const t of lineage) {
    if (TYPE_STYLE_REGISTRY[t]) {
      style = { ...style, ...TYPE_STYLE_REGISTRY[t] };
    }
  }
  return style;
}

// Similarity cluster fallback
function resolveStyleByCluster(typeId) {
  for (const [cluster, spec] of Object.entries(SIMILARITY_CLUSTERS)) {
    if (spec.types.includes(typeId)) {
      return { ...spec.visual, ...resolveStyle(typeId) };
    }
  }
  return resolveStyle(typeId);
}
```

---

## Governance & Migration

```python
# .claude/hooks/validate-library-json.py

ONTOLOGY_CHANGELOG = [
    { 'version': '2026-06-19', 'action': 'add', 'type': 'framework', 'parent': 'standard', 'rfc': 'RFC-001' },
    { 'version': '2026-06-19', 'action': 'add', 'type': 'prompt', 'parent': 'standard', 'rfc': 'RFC-001' },
    { 'version': '2026-06-19', 'action': 'add', 'rel': 'enforces', 'parent': 'structural', 'rfc': 'RFC-001' },
    # ... future entries
]

# Migration hints for deprecated items
MIGRATION_HINTS = {
    'creation': { 'to': 'creates', 'note': 'Process creates artifact; use "creates" for active generation' },
    'reveals':  { 'to': None, 'note': 'Auto-generated by loader — delete from edges[]' },
    'default':  { 'to': None, 'note': 'Use explicit rel (association, causes, enables, etc.)' },
}

# Deprecation policy:
# 1. Mark deprecated in VALID_TYPES/VALID_RELS
# 2. Add migration hint
# 3. Validator emits WARNING (exit 1) for deprecated usage
# 4. After 3 Alone-Time runs with zero deprecated usage → promote to ERROR (exit 2)
# 5. Remove from registry
```

---

## Query API (for future tooling)

```python
# Not in validator yet — for CLI/analysis scripts

def query_types(predicate):
    """Filter types by any predicate on spec."""
    return {k: v for k, v in VALID_TYPES.items() if predicate(k, v)}

def all_subtypes_of(parent):
    return [k for k, v in VALID_TYPES.items() if parent in lineage(k)]

def all_supertypes_of(child):
    return lineage(child)[:-1]  # exclude self

def rels_with_property(prop, value):
    return [k for k, v in VALID_RELS.items() if v.get(prop) == value]

# Examples:
# all_subtypes_of('platform') → ['labor_platform', 'tournament_platform']
# all_supertypes_of('framework') → ['entity', 'artifact', 'standard']
# rels_with_property('inverse', 'visualized_by') → ['visualizes']
# rels_with_property('parent', 'governance') → ['governs', 'permits', 'prohibits', 'enforces']
```

---

## Migration Strategy (Phased)

| Phase | Scope | Risk |
|-------|-------|------|
| **0** (Now) | Tier 1 flat adds (framework, prompt, process, enforces, transforms, creates, maps_to, visualizes, renders, underpins) | Low — current RFC-001 proposal |
| **1** (Post-RFC-001) | Enable hierarchy in validator (parent/abstract fields) — **no migration needed**, existing types get implicit `entity` parent | Low — backward compatible |
| **2** | Add `similarity_clusters` → renderer uses cluster palette + shape family | Medium — visual changes |
| **3** | Deprecate `creation` → `creates` with alias period (3 runs) | Medium — coordinated re-encode |
| **4** | Add `platform` subtypes (`labor_platform`, `tournament_platform`) for existing entries | High — requires re-encoding aoe-2-redbull, gig-worker |
| **5** | Query API + CLI tooling (`kaaro ontology graph`, `kaaro ontology migrate`) | Low — tooling only |

---

## Open Questions

1. **Single vs. multiple inheritance**: `framework` = `standard` + `process` + `tool`. Current model: single parent. Allow mixin-style `traits`?
2. **Facet inheritance**: `framework` inherits `version` from `standard` but adds `enforces`, `transforms`. Validate facet compatibility?
3. **Rel cardinality enforcement**: `enforces` = `1:N`. Validator checks? Or just documentation?
4. **Abstract type instantiation**: Currently `entity`/`agent`/`artifact` are abstract. Should encoder be prohibited from using them? (Yes — warning)
5. **Similarity vs. hierarchy conflict**: `tool` parent=`software` but cluster=`instrument`. Which drives visual? Cluster as fallback?
6. **Ontology versioning**: Git tags? `VALID_TYPES` version in `meta.schema_version`?
7. **External alignment**: Map to schema.org / Wikidata? `framework` → `schema:SoftwareFramework`, `prompt` → `schema:CreativeWork`?

---

## Decision Required

| Option | Description |
|--------|-------------|
| **A: Minimal** | Land Tier 1 flat (RFC-001). Defer hierarchy to post-20-entries. |
| **B: Hierarchy-lite** | Add `parent`/`abstract` to validator now. No renderer/subtype changes. |
| **C: Full hierarchy** | Implement all above — types, rels, clusters, renderer, migration. |

**Recommendation**: **B** — hierarchy-lite in validator (phases 0→1) enables Tier 1 proposals AND future-proofs without visual disruption. Phase 2+ after Skeleton+Hydration (RFC-001) lands.

---

*Spike complete. Awaiting human signal to proceed with Phase 0 (RFC-001) or Phase 1 (hierarchy-lite).*