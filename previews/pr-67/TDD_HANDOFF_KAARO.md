# TDD Agent Handoff Schema

> The recommended structure for planning and executing a multi-step change in
> this project as a sequence of test-driven work packages handed to agents.
> `RUNTIME_PLAN.md` is the first concrete instance of this schema.

## Why this exists

Large changes are decomposed into **work packages (WPs)**: small,
independently verifiable units, each implemented test-first by a single
agent, then verified by the orchestrator before the next begins. This keeps
every step green, reviewable, and safe to roll back.

---

## 1. The plan document

One markdown file at the repo root (e.g. `RUNTIME_PLAN.md`). Structure:

| Section | Content |
|---|---|
| Header | What this change is; what to read first (VISION, the spec, relevant memory) |
| Why this work exists | The problem in 3–5 sentences. The root cause, not the symptom |
| Decisions locked | A table of binding decisions (`D1`, `D2`, …) with rationale. Agents must not relitigate these |
| Handoff protocol | The rules every WP follows (see §3) |
| Target contracts | Concrete signatures/models the WPs converge on |
| Work packages | The ordered WP list (see §2) |
| Dependency order | Explicit DAG; which WPs parallelize |
| Definition of done | What "the whole change is finished" means, observably |

## 2. Work package schema

Every WP is one block with exactly these fields:

```
### WP<N> — <short title>  ·  status: ☐ | ☑ DONE  ·  depends: <WP ids | —>
- Goal:        one sentence — the observable outcome
- Test first:  the exact test file + the cases to write BEFORE impl
- Impl:        what to build, in which files
- Accept:      the green-bar condition (named tests + full suite)
- Type:        pure-unit-TDD | unit-with-fakes | integration | script | data-migration
- Files:       the allowlist this WP may touch
```

Rules for good WPs:

- **Small enough to verify in one sitting.** If you can't state the
  acceptance test in one line, split it.
- **Test-named.** The plan names the test file; the agent writes those
  tests first and must see them fail for the right reason.
- **File-scoped.** An explicit allowlist. Two WPs that parallelize must
  have disjoint allowlists.
- **Dependency-honest.** `depends:` lists only true ordering constraints.
  Independent WPs with disjoint files run in parallel.

## 3. Handoff protocol (binding for every WP)

1. `pytest` (unit) is green **before** the WP starts. If not, stop and report.
2. **Test-first.** Write the named failing test(s) first; confirm red for
   the right reason; implement to green.
3. Pure modules: unit tests with fakes, no Docker/network/FS-of-record.
   Adapters: unit-with-fakes **plus** a separate `@pytest.mark.integration`
   test. Integration stays out of the default `pytest` run.
4. Keep the **full unit suite** green at the end of the WP. Never weaken or
   delete an existing assertion to pass; fix the cause.
5. Respect `Decisions locked` and project principles (e.g. never mutate map
   content to compensate for an environment problem).
6. One WP = one working-tree change set. **No commit/branch/push by the
   agent.** The orchestrator commits checkpoints.
7. Stay inside the WP's file allowlist. Any out-of-scope touch must be
   reported explicitly with rationale.
8. Report back (≤250 words): tests added, red-before/green-after, final
   public surface, files touched, deviations, final suite totals.

## 4. The orchestration loop

For each WP, the orchestrator (not the agent):

1. **Dispatch** a self-contained agent brief: the WP, the context an agent
   with zero prior knowledge needs, the contract, the TDD steps, the file
   allowlist, and the reporting format. Pin the model.
2. **Trust but verify.** The agent's report states intent, not fact.
   Independently run: the new test file, the full unit suite, integration
   collection, and any artifact the WP claims to produce.
3. **Mark** the WP `☑ DONE` in the plan only after verification passes.
4. **Checkpoint.** Commit at natural boundaries (a cluster of green WPs),
   never with a red suite.
5. **Integration checkpoint** at the spot where a real-environment
   regression contract exists (e.g. after schema/IO changes, run the Docker
   e2e). The pre-existing integration suite *is* the executable contract.

### Parallelization

Dispatch multiple agents in one turn only when their file allowlists are
disjoint and their `depends:` are satisfied. Warn each about its siblings so
a sibling's mid-flight test file isn't misread as a regression.

## 5. Agent brief template

```
You are implementing WP<N> from <PLAN>.md at <repo>. Work test-first. Do
exactly this WP.

## Parallel note (if any)
<sibling agents + files they own; do not touch>

## Context
<what a cold agent needs: what landed already, the relevant contracts,
which files to read first, the current green baseline count>

## What to build
<the contract, exactly; locked decisions that constrain it>

## TDD steps (in order)
1. Confirm baseline green.
2. Write <named test file> first; cases: <…>; confirm red.
3. Implement <files>; green.
4. Full unit suite green, zero regressions.

## Constraints & reporting
<no commit; file allowlist; principles; ≤250-word report format>
```

## 6. Anti-patterns

- A WP with no named test → not a WP, it's a wish.
- "Implement based on your findings" → delegates understanding; the
  orchestrator must already know the change and specify it.
- Committing with a red or unverified suite.
- Agents committing/pushing, or editing outside their allowlist silently.
- Relitigating a `Decisions locked` entry inside a WP.
- Mutating content/data to dodge an environment mismatch instead of fixing
  the environment or the contract.
