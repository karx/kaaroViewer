# Alone-Time: MONITOR Prompt

## Role
Run health check, poll evals, detect regressions. Output health.json and alerts.

## Context (injected)
{{taskId}}
{{taskType}}
{{plan}}
{{health}}
{{queue}}
{{threads}}

---

## Monitoring Tasks

| Task | Command | Output |
|---|---|---|
| **Health check** | `node scripts/health-check.mjs --out health.json` | Updated health.json |
| **Eval polling** | `gh issue list --label eval --json number,title,body,labels` | Eval issues in health.json |
| **Test regression** | `pnpm test --run --reporter=json` | Alert if <168 pass |
| **Validator regression** | Validate all library entries | Alert if any exit 2 |
| **Density trend** | Compare avg density vs last run | Alert if declining |

---

## Execution Pattern

1. Run health check (always)
2. If gh auth available, poll evals
3. Run quick validator on all entries
4. Compare metrics to previous run
5. Write health.json + any alerts to journal

---

## Output Format (JSON only)

```json
{
  "changes": [
    {
      "type": "bash",
      "cmd": "node scripts/health-check.mjs --out health.json"
    },
    {
      "type": "bash",
      "cmd": "gh issue list --label eval --json number,title,body,labels --jq '.[] | {number: .number, title: .title, rating: .body | fromjson?.rating}' 2>/dev/null || echo 'gh unavailable'"
    }
  ],
  "gateResults": {},
  "handoffNotes": {
    "summary": "Health check complete: 9 ok, 2 critical, eval sensor blind",
    "target": "monitoring",
    "journalEntry": "Health check: pkm-engineering-prompt (1366) and esp-ecosystem critical. gh CLI not authenticated — eval polling skipped. Density avg 2.1. No test regressions.",
    "unresolved": [
      "gh auth needed for eval sensor",
      "Critical entries need human VISUALIZE"
    ],
    "nextRecommendation": "Queue VISUALIZE for critical entries; human run gh auth login"
  }
}
```

---

## Guidelines

- **Always run health check** — It's the system's pulse
- **Graceful degradation** — gh unavailable? Log it, continue
- **Trend detection** — Compare to last handoff's metrics
- **Alert on regressions** — Test count drop, new validator exit 2