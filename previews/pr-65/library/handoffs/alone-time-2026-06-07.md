## Alone-Time Run — 2026-06-07

### Telemetry Snapshot
- Library: 6 ok  1 watch  2 degraded  0 critical
- Open evals: unknown (gh CLI unavailable — `gh auth login` needed for eval polling)
- Tests: 168/168 passing
- Health report: regenerate with `pnpm health:json`

### Entry Selected
- ID: `aoe-2-redbull-april-2026`
- Degradation score: 212 (pre-run)
- Reason for selection: Highest combined score in library — 3 climax beats, density 1.40, 12 unclustered nodes, and 4 validator warnings including a `reveals` rel. Score unambiguously separated it from rank-2 `poker-tooling-2026` (score 132).
- Pre-run health: `degraded`
- Pre-run metrics: density 1.40, 45N 63E, 10 beats, 3 climax, 12 unclustered

### Mutation Applied
- Source: `library/aoe-2-redbull-april-2026.md`
- Gap targets addressed:
  - climax:3 → 1 (Royal Albert Hall as sole climax; Score Victory demoted to `high`)
  - unclustered:12 → 0 (all 34 nodes placed in 6 functional clusters)
  - density:1.40 → 2.50 (cross-cluster sweep added ~22 inter-cluster edges)
  - validator:4w → 0w (replaced `reveals` rel; fixed `product`/`location` node types → `software`/`dlc`/`place`)
- Validator: exit 1 → exit 0
- Edge density: 1.40 → 2.50
- Node count: 45 → 34 (abstract intermediates folded into edges/descriptions)
- Climax beats: 3 → 1
- Unclustered nodes: 12 → 0
- Key structural improvement: The cross-cluster sweep — systematically asking "what connects any node in cluster A to any node in cluster B?" — accounted for the majority of edge gain and the entire density improvement.

### Gate Result
- Validator: PASS — exit 0, 0 warnings, 0 errors
- Tests: PASS — 168/168 passing
- Committed: YES — `efbe355` on `kaaro/breathe-life`

### What Could Not Be Resolved
- Broadcast co-stream infrastructure (Twitch, YouTube, Kick, SteamTV, Watch Parties) is not in the graph — the document describes it in detail but the graph has no `platform` or `channel` nodes to capture distribution reach.
- AoE4 Wam01 vs VortiX Semifinal result is not in the source document (scheduled but not recorded as completed). The Grand Final matchup is implied but unresolved in the source.
- No esports-specific encoding profile exists in the SOP — players, tournament formats, venue escalation, and DLC cycles recur across esports documents but have no dedicated checklist. The current encoding required hand-mapping to generic types (`software` for games, `place` for venues).

### Dream Loop Signal
- Consecutive runs with same unresolved signal: 1 — "missing esports encoding profile in SOP"
- Trigger Dream Loop if: same signal appears in 2 more handoffs (threshold: 3 total)

### Next Run Recommendation
- Top priority: `poker-tooling-2026` (score: 150 post-this-run)
- Key gap to target: density 1.32 (53 edges / 40 nodes) + 3 validator warnings. Cross-cluster sweep identical to this run should resolve density. Validator warnings need reading first — likely similar type/rel issues.
- Secondary: `gig-worker-projects` (score unknown post-run — climax:2, density:1.78)
