#!/usr/bin/env python3
"""
validate-library-json.py
========================
kaaroViewer post-write hook and standalone validator.

Usage (hook — called by settings.json after every Write tool call):
    python3 .claude/hooks/validate-library-json.py

    Reads the PostToolUse JSON event from stdin.
    Only validates files under library/*.json — silently exits 0 for all other writes.

Usage (standalone — called from the visualize skill):
    python3 .claude/hooks/validate-library-json.py library/my-doc.json

Exit codes:
    0  — valid (or not a library file)
    1  — warnings: structural issues that should be fixed but don't block
    2  — error: cross-reference failures that will break the loader
"""

import sys
import json
import os
import re

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


# ── Required top-level sections ───────────────────────────────────────────────

REQUIRED_SECTIONS = ['meta', 'nodes', 'edges', 'report_card', 'story', 'insights', 'clusters']

VALID_TYPES = {
    'person', 'player', 'place', 'country', 'organization', 'company', 'government',
    'platform', 'issue', 'solution', 'union', 'metric', 'video', 'channel', 'post',
    'subreddit', 'team', 'tournament', 'civ', 'dlc', 'insight', 'milestone',
    'conflict', 'event', 'concept', 'species', 'software', 'sport', 'artwork',
    'award', 'law', 'academic', 'religion', 'language', 'film', 'book', 'music',
    # Legal / institutional
    'ruling', 'regulation',
    # Technical knowledge
    'algorithm', 'standard', 'dataset', 'model',
}

VALID_RELS = {
    'causes', 'mitigates', 'disrupts', 'opposes', 'enables', 'precedes',
    'governs', 'membership', 'leadership', 'employment', 'ownership',
    'creation', 'location', 'competes', 'association', 'qualifies',
    'features', 'broadcasts', 'temporal', 'reveals', 'default',
    # Structural / technical
    'implements', 'supersedes', 'permits', 'prohibits',
    'derives_from', 'achieves', 'cites', 'contradicts',
}

VALID_TIERS      = {'spine', 'primary', 'secondary', 'anchor', 'insight'}
VALID_SENTIMENTS = {'positive', 'negative', 'contested', 'neutral'}
VALID_TENSIONS   = {'low', 'medium', 'high', 'climax'}
VALID_INS_TYPES  = {'finding', 'warning', 'pattern', 'conclusion', 'paradox', 'opportunity'}
VALID_SEVERITIES = {'low', 'medium', 'high'}
VALID_TONES      = {'investigative', 'analytical', 'narrative', 'critical', 'celebratory'}


def _col(code, text):
    """ANSI colour helper (degrades gracefully on Windows)."""
    try:
        return f'\033[{code}m{text}\033[0m'
    except Exception:
        return text

RED    = lambda t: _col('31', t)
YELLOW = lambda t: _col('33', t)
GREEN  = lambda t: _col('32', t)
CYAN   = lambda t: _col('36', t)
BOLD   = lambda t: _col('1',  t)


def validate(file_path: str) -> tuple[list, list]:
    """
    Validate the library JSON at `file_path`.
    Returns (errors, warnings).
    Errors cause exit 2. Warnings cause exit 1.
    """
    errors   = []
    warnings = []

    # ── Load ──────────────────────────────────────────────────────────────────
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            doc = json.load(f)
    except json.JSONDecodeError as e:
        errors.append(f'JSON syntax error: {e}')
        return errors, warnings
    except FileNotFoundError:
        errors.append(f'File not found: {file_path}')
        return errors, warnings

    # ── Required sections ─────────────────────────────────────────────────────
    for key in REQUIRED_SECTIONS:
        if key not in doc:
            errors.append(f'Missing required section: "{key}"')

    if errors:
        return errors, warnings  # can't continue without all sections

    meta        = doc.get('meta', {})
    nodes       = doc.get('nodes', [])
    edges       = doc.get('edges', [])
    report_card = doc.get('report_card', {})
    story       = doc.get('story', [])
    insights    = doc.get('insights', [])
    clusters    = doc.get('clusters', [])

    # ── Build node ID set ─────────────────────────────────────────────────────
    node_ids = {n.get('id') for n in nodes if n.get('id')}
    dup_ids  = [n.get('id') for n in nodes if nodes.count(n) > 1]

    # ── meta validation ───────────────────────────────────────────────────────
    for field in ('id', 'title', 'domain', 'year', 'tone'):
        if not meta.get(field):
            warnings.append(f'meta.{field} is missing or empty')

    if meta.get('tone') and meta['tone'] not in VALID_TONES:
        warnings.append(f'meta.tone "{meta["tone"]}" is not a recognised tone; valid: {sorted(VALID_TONES)}')

    # ── Node validation ───────────────────────────────────────────────────────
    for n in nodes:
        nid = n.get('id', '(no id)')

        if not n.get('description'):
            warnings.append(f'node "{nid}" has no description')

        if n.get('type', 'default') == 'default':
            warnings.append(f'node "{nid}" uses type "default" — classify it properly')

        if n.get('type') and n['type'] not in VALID_TYPES:
            warnings.append(f'node "{nid}" has unknown type "{n["type"]}"')

        if n.get('tier') and n['tier'] not in VALID_TIERS:
            warnings.append(f'node "{nid}" has unknown tier "{n["tier"]}"')

        if n.get('sentiment') and n['sentiment'] not in VALID_SENTIMENTS:
            warnings.append(f'node "{nid}" has unknown sentiment "{n["sentiment"]}"')

    # ── Edge validation ───────────────────────────────────────────────────────
    for i, e in enumerate(edges):
        eid = f'edge[{i}] {e.get("from", "?")}→{e.get("to", "?")}'

        if e.get('from') not in node_ids:
            errors.append(f'{eid}: "from" references unknown node "{e.get("from")}"')

        if e.get('to') not in node_ids:
            errors.append(f'{eid}: "to" references unknown node "{e.get("to")}"')

        if e.get('rel') and e['rel'] not in VALID_RELS:
            warnings.append(f'{eid}: unknown rel type "{e["rel"]}"')

        w = e.get('weight', 1)
        if not (isinstance(w, (int, float)) and 1 <= w <= 5):
            warnings.append(f'{eid}: weight {w!r} is outside 1–5')

    # ── Story validation ──────────────────────────────────────────────────────
    climax_count = 0
    for beat in story:
        bid = beat.get('id', '(no id)')

        if beat.get('node') and beat['node'] not in node_ids:
            errors.append(f'story beat "{bid}": "node" references unknown node "{beat["node"]}"')

        for nid in beat.get('nodes', []):
            if nid not in node_ids:
                errors.append(f'story beat "{bid}": "nodes" references unknown node "{nid}"')

        if beat.get('tension') == 'climax':
            climax_count += 1

        if beat.get('tension') and beat['tension'] not in VALID_TENSIONS:
            warnings.append(f'story beat "{bid}": unknown tension "{beat["tension"]}"')

        if not beat.get('narration') or len(beat.get('narration', '')) < 20:
            warnings.append(f'story beat "{bid}": narration is missing or too short')

    if climax_count == 0 and len(story) >= 4:
        warnings.append('No story beat has tension "climax" — the arc has no peak')
    elif climax_count > 2:
        warnings.append(f'{climax_count} beats have tension "climax" — should be exactly 1')

    beat_count = len(story)
    if beat_count < 5:
        warnings.append(f'Only {beat_count} story beat(s) — aim for 7–12')

    # ── Insight validation ────────────────────────────────────────────────────
    insight_types_used = set()
    for ins in insights:
        iid = ins.get('id', '(no id)')

        for eid in ins.get('evidence', []):
            if eid not in node_ids:
                errors.append(f'insight "{iid}": evidence references unknown node "{eid}"')

        if ins.get('type') and ins['type'] not in VALID_INS_TYPES:
            warnings.append(f'insight "{iid}": unknown type "{ins["type"]}"')
        else:
            insight_types_used.add(ins.get('type'))

        if ins.get('severity') and ins['severity'] not in VALID_SEVERITIES:
            warnings.append(f'insight "{iid}": unknown severity "{ins["severity"]}"')

        if not ins.get('title') or len(ins.get('title', '')) < 15:
            warnings.append(f'insight "{iid}": title is missing or too short')

        if not ins.get('body'):
            warnings.append(f'insight "{iid}": body is empty')

    if 'warning' not in insight_types_used and len(insights) >= 3:
        warnings.append('No insight of type "warning" — consider what risks or dangers the report surfaces')

    if 'finding' not in insight_types_used and len(insights) >= 3:
        warnings.append('No insight of type "finding" — consider what empirical facts the report establishes')

    # ── Cluster validation ────────────────────────────────────────────────────
    all_clustered = set()
    for cl in clusters:
        clid = cl.get('id', '(no id)')

        for nid in cl.get('nodes', []):
            if nid not in node_ids:
                errors.append(f'cluster "{clid}": references unknown node "{nid}"')
            all_clustered.add(nid)

        if not cl.get('description'):
            warnings.append(f'cluster "{clid}": description is empty')

    unclustered = node_ids - all_clustered
    if unclustered:
        warnings.append(f'{len(unclustered)} node(s) not assigned to any cluster: {sorted(unclustered)[:8]}')

    # ── report_card validation ────────────────────────────────────────────────
    for pid in report_card.get('protagonists', []):
        if pid not in node_ids:
            errors.append(f'report_card.protagonists: references unknown node "{pid}"')

    for aid in report_card.get('antagonists', []):
        if aid not in node_ids:
            errors.append(f'report_card.antagonists: references unknown node "{aid}"')

    for sid in report_card.get('spine', []):
        if sid not in node_ids:
            errors.append(f'report_card.spine: references unknown node "{sid}"')

    if not report_card.get('summary'):
        warnings.append('report_card.summary is empty')

    stat_count = len(report_card.get('key_stats', []))
    if stat_count < 4:
        warnings.append(f'Only {stat_count} key_stat(s) — aim for 5–8')

    # ── Quality checks ────────────────────────────────────────────────────────
    #    These warn on encoding quality rather than schema errors.

    # Edge density
    if len(nodes) > 5 and edges:
        density = len(edges) / len(nodes)
        if density < 2.0:
            warnings.append(
                f'Edge density {density:.1f}x ({len(edges)} edges / {len(nodes)} nodes) — '
                f'aim for ≥2.0; run cross-cluster sweep to find missing connections'
            )

    # Temporal chain: beats reference years but no event/milestone nodes
    year_beats = sum(
        1 for b in story if re.search(r'\b(19|20)\d{2}\b', b.get('narration', ''))
    )
    temporal_nodes = [n for n in nodes if n.get('type') in ('event', 'milestone')]
    if year_beats >= 3 and not temporal_nodes:
        warnings.append(
            f'{year_beats} story beat(s) reference year numbers but there are no event/milestone '
            f'nodes — add a temporal chain with precedes edges'
        )

    # Named individuals in narration but no person nodes
    PERSON_TRIGGERS = (
        'founded by', 'justice ', 'judge ', 'minister ', 'senator ',
        'president ', 'director ', 'chief ', 'secretary '
    )
    person_mentions = sum(
        1 for b in story
        if any(t in b.get('narration', '').lower() for t in PERSON_TRIGGERS)
    )
    person_nodes = [n for n in nodes if n.get('type') == 'person']
    if person_mentions >= 2 and not person_nodes:
        warnings.append(
            f'{person_mentions} beat(s) mention named roles (justice, minister, founder…) '
            f'but there are no person nodes — key individuals should be nodes'
        )

    # reveals in raw edges (auto-generated by loader — encoding it causes duplicate/conflicting edges)
    for i, e in enumerate(edges):
        if e.get('rel') == 'reveals':
            eid = f'edge[{i}] {e.get("from", "?")}→{e.get("to", "?")}'
            errors.append(
                f'{eid}: rel "reveals" is auto-generated by the loader — NEVER write it in edges[] '
                f'(use association, causes, or another explicit rel instead)'
            )

    # governs / permits / prohibits edges without a label
    LABEL_REQUIRED = {'governs', 'permits', 'prohibits'}
    for i, e in enumerate(edges):
        if e.get('rel') in LABEL_REQUIRED and not e.get('label', '').strip():
            eid = f'edge[{i}] {e.get("from", "?")}→{e.get("to", "?")}'
            warnings.append(
                f'{eid}: rel "{e["rel"]}" should carry a "label" describing the permission or scope'
            )

    # Insight title quality (< 6 words likely a topic label, not a claim)
    for ins in insights:
        iid   = ins.get('id', '(no id)')
        title = ins.get('title', '')
        if title and len(title.split()) < 6:
            warnings.append(
                f'insight "{iid}": title "{title}" reads as a topic label (< 6 words) — '
                f'rewrite as a declarative claim'
            )

    return errors, warnings


def _resolve_path_from_stdin() -> str | None:
    """
    Parse the PostToolUse event JSON from stdin and extract the file_path
    if the Write tool was used on a library JSON file.
    Returns the path string, or None if this write is not a library file.
    """
    try:
        data = json.load(sys.stdin)
        tool = data.get('tool_name', data.get('tool', ''))
        if tool not in ('Write', 'write'):
            return None
        path = data.get('tool_input', {}).get('file_path', '')
        if not path:
            # Some events nest it differently
            path = data.get('file_path', '')
        return path if path else None
    except (json.JSONDecodeError, AttributeError):
        return None


def _is_library_json(path: str) -> bool:
    if not path:
        return False
    norm = path.replace('\\', '/')
    return '/library/' in norm and norm.endswith('.json')


def main():
    # ── Determine mode ────────────────────────────────────────────────────────
    if len(sys.argv) >= 2:
        # Standalone: path passed as argument
        file_path = sys.argv[1]
    else:
        # Hook mode: read event from stdin
        if sys.stdin.isatty():
            print(f'{YELLOW("Usage:")} python3 validate-library-json.py library/file.json', file=sys.stderr)
            sys.exit(0)

        file_path = _resolve_path_from_stdin()

        if not file_path:
            sys.exit(0)  # stdin was empty or not a Write event

        if not _is_library_json(file_path):
            sys.exit(0)  # not a library JSON file — ignore silently

    # ── Validate ──────────────────────────────────────────────────────────────
    errors, warnings = validate(file_path)

    fname = os.path.basename(file_path)

    if not errors and not warnings:
        # Try to load basic stats
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                doc = json.load(f)
            title  = doc.get('meta', {}).get('title', fname)
            nn     = len(doc.get('nodes', []))
            ne     = len(doc.get('edges', []))
            nb     = len(doc.get('story', []))
            ni     = len(doc.get('insights', []))
            print(GREEN(f'✅  {title}'))
            print(f'    {fname}  —  {nn} nodes · {ne} edges · {nb} beats · {ni} insights')
        except Exception:
            print(GREEN(f'✅  {fname} — valid'))
        sys.exit(0)

    # ── Print errors ──────────────────────────────────────────────────────────
    if errors:
        print(RED(f'❌  {fname} — {len(errors)} cross-reference error(s):'))
        for e in errors:
            print(f'    {RED("•")} {e}')

    if warnings:
        label = RED(fname) if errors else YELLOW(fname)
        print(f'{YELLOW("⚠")}   {label} — {len(warnings)} warning(s):')
        for w in warnings:
            print(f'    {YELLOW("·")} {w}')

    if errors:
        print()
        print(RED('Cross-reference errors will break the kaaroViewer loader.'))
        print('Fix every ❌ before loading. Re-run the validator after editing.')
        sys.exit(2)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
