# Test Smells Report

**Date:** 2026-06-19
**Scope:** 14 test files, 2088 lines, 178 tests
**Branch audited:** `kaaro/cleanup-paint-sessions`
**Suite result at audit time:** 177 pass, 1 fail (pre-existing `paint-indicator.test.mjs`)

---

## Summary

| Severity | Count | Category |
|----------|-------|----------|
| Critical | 3     | Time-dependent tests, fragile cache-busting, order-dependent re-mocks |
| High     | 3     | Mock duplication, magic numbers, redundant dynamic imports |
| Medium   | 5     | Duplicate tests, shadowing, leaky naming, low-signal assertions, global mutation |
| Low      | 4     | Singleton coupling, underscore-private API access, inconsistent conventions |

**Top 3 priorities for cleanup:**

1. Replace `setTimeout(r, 10|20)` sleeps with `vi.useFakeTimers()` or `vi.waitFor()` (9 tests, CI flake risk)
2. Extract shared `20` cap constant between `painter-storage.mjs` and its test (silent contract drift)
3. Deduplicate ~80 lines of `vi.mock()` blocks shared across `paint-orchestrator.test.mjs` and `paint-indicator.test.mjs`

---

## Critical

### 1. Time-dependent tests with arbitrary sleeps — flaky test risk

**Files:**
- `canvas/paint-orchestrator.test.mjs` (5 occurrences: lines 67, 81, 96, 111, 134)
- `canvas/paint-indicator.test.mjs` (4 occurrences: lines 67, 83, 99, 117)

**Pattern:**

```js
document.dispatchEvent(new CustomEvent('slides:paint-scene', { detail: {...} }));
await new Promise(r => setTimeout(r, 20));   // "let async handlers run"
expect(notifySceneResult).toHaveBeenCalled();
```

**Why it smells:**
- The 10ms/20ms delay is a guess at how long the async handler takes. On a slow CI runner, the handler may not have run by the time the assertion fires — flake city.
- On a fast machine, the test waits longer than necessary — suite slowdown.

**Fix:**
- For time-controlled tests: `vi.useFakeTimers()` + `vi.runAllTimers()`.
- For event-driven async: `await vi.waitFor(() => expect(notifySceneResult).toHaveBeenCalled())`.
- For promise-based waits: just `await` the promise the handler returns (if exposed).

---

### 2. `Math.random()` in import URL as cache-busting — fragile

**File:** `canvas/painter-storage.test.mjs:14`

```js
async function getStorage() {
  return await import('./painter-storage.mjs?t=' + Math.random());
}
```

**Why it smells:**
- Hidden behavior: the query string `?t=` is a browser cache-busting trick that has no meaning to vitest's module loader. It works by accident because some bundlers treat each query string as a different module ID.
- Couples test correctness to a bundler implementation detail.
- The actual intent (force a fresh module instance to reset the `_idb` singleton) is undocumented.

**Fix:**
- Use `vi.resetModules()` followed by a normal `import()` inside `beforeEach`.
- Add a comment explaining why: "// Re-import to reset the `_idb` module-level singleton."
- Or restructure `painter-storage.mjs` so the IDB connection is injected, not module-scoped.

---

### 3. Test depends on a non-deterministic singleton's order

**File:** `canvas/session-manager.test.mjs:32`

```js
beforeEach(async () => {
  resetDOM();
  vi.resetModules();

  // Re-mock after resetModules so fresh module state
  vi.mock('../pipeline/sessions.mjs', () => ({...}));   // <-- duplicate of top-of-file mock

  const mod = await import('./session-manager.mjs');
  ...
});
```

**Why it smells:**
- The same `vi.mock('../pipeline/sessions.mjs', () => ({...}))` appears at the top of the file AND inside `beforeEach`. The inner one is needed because `vi.resetModules()` cleared the mock state, but if anyone ever updates only the top-of-file version, the test will silently use stale mocks.
- Brittle to refactoring.

**Fix:**
- Extract the mock factory to a function:

  ```js
  function makeSessionsMock() {
    return {
      saveSession:   vi.fn().mockResolvedValue({ id: 's1', name: 'Test' }),
      listSessions:  vi.fn().mockResolvedValue([]),
      loadSession:   vi.fn().mockResolvedValue(null),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    };
  }
  vi.mock('../pipeline/sessions.mjs', () => makeSessionsMock());
  ```
- Use `vi.doMock` inside `beforeEach` instead of `vi.mock`, since `vi.resetModules()` was called.

---

## High

### 4. Massive mock duplication across files — copy-paste smell

**Files:**
- `canvas/paint-orchestrator.test.mjs` (lines 4-32): 28 lines of mocks
- `canvas/paint-indicator.test.mjs` (lines 4-32): 28 lines of mocks
- Near-identical setup repeated across these two files for: `logger.mjs`, `graph.mjs`, `paint-context.mjs`, `paint-strategies.mjs`, `scene-painter.mjs`, `scene.mjs`, `nodes.mjs`, `slides.mjs`, `detail.mjs`, `app-state.mjs`

**Why it smells:**
- Any change to a paint-orchestrator dependency requires updating two files in lockstep.
- A divergence between the two copies would silently cause one suite to pass and the other to fail on the same code.

**Fix:**
- Extract to `canvas/__test-helpers__/paint-mocks.mjs` exporting `setupPaintOrchestratorMocks()`.
- Each test file does:

  ```js
  import { setupPaintOrchestratorMocks } from './__test-helpers__/paint-mocks.mjs';
  setupPaintOrchestratorMocks();
  ```

---

### 5. Magic number `20` in tests — undocumented intent

**File:** `canvas/painter-storage.test.mjs:89`

```js
it('caps free-roam records at 20 (push 22, read back 20)', async () => {
  ...
  for (let i = 0; i < 22; i++) {
    _storeProjectionRecord(docId, null, `uuid-${i}`, ...);
  }
  const freeRecords = records.filter(r => r.slideIdx == null);
  expect(freeRecords).toHaveLength(20);   // <-- matches production hardcode
});
```

**Why it smells:**
- The `20` is duplicated in the production code (`painter-storage.mjs`). If someone bumps the cap to 30, this test silently goes green at 20 even when the actual cap is 30.
- No shared constant.

**Fix:**
- Export `FREE_ROAM_CAP = 20` from `painter-storage.mjs`.
- Test asserts: `expect(freeRecords).toHaveLength(FREE_ROAM_CAP)`.
- Or better: assert the property "free-roam records are capped" with a relative check, not the exact number.

---

### 6. Re-importing module-under-test inside each test — slow + confusing

**Files:**
- `canvas/paint-orchestrator.test.mjs`: every `it()` does `const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs')`
- `canvas/paint-indicator.test.mjs`: same pattern

**Why it smells:**
- With `vi.mock()` hoisted to the top of the file, top-level `await import('./paint-orchestrator.mjs')` works fine. The dynamic import inside each test is unnecessary.
- Slows the suite (N imports instead of 1).
- Hints the author wasn't sure whether `vi.mock` hoisting applies — suggests uncertainty, not intent.

**Fix:**
- Move the `import` to the top of the file (after the `vi.mock` calls).
- If the intent is to defeat module caching, use `vi.resetModules()` + dynamic import, and add a comment explaining.

---

## Medium

### 7. Two near-identical tests in `painter-storage.test.mjs`

**File:** `canvas/painter-storage.test.mjs:28-37`

```js
it('returns null for a missing key', async () => {
  const { _idbLoad } = await getStorage();
  const result = await _idbLoad('nonexistent-uuid');
  expect(result).toBeNull();
});

it('returns null for a missing key (resilience check)', async () => {
  const { _idbLoad } = await getStorage();
  const result = await _idbLoad('never-stored');
  expect(result).toBeNull();
});
```

**Why it smells:**
- Both tests exercise the same code path with different input strings.
- The "(resilience check)" suffix is meaningless.

**Fix:**
- Delete one. Or merge into a single `it.each` table.

---

### 8. `describe.each` parameter shadowing — minor smell

**File:** `canvas/paint-strategies.test.mjs:101`

```js
describe.each(BUILT_INS.map(name => [name]))('strategy: %s', (name) => {...});
```

**Why it smells:**
- Wrapping a single-arg array in another array (`[name] => [[name]]`) is the legacy vitest/jest pattern for a tuple. Modern vitest accepts the bare value.

**Fix:**
- `describe.each(BUILT_INS)('strategy: %s', (name) => {...})`

---

### 9. Phase-jargon leaking into test names

**File:** `canvas/paint-indicator.test.mjs:46`

```js
describe('paint progress indicator (2a)', () => {
```

**Why it smells:**
- `(2a)` is `IMPLEMENTATION_PLAN.md` phase jargon. A new contributor reading the test won't know what 2a is without grepping the plan doc.
- Couples test names to a planning artifact that may be renamed or removed.

**Fix:**
- `describe('paint progress indicator', () => {` — drop the phase marker, or replace with a stable feature name like `describe('paint progress indicator (Phase 2)', ...)`.

---

### 10. Test relies on a registered-then-activated sentinel strategy — low signal

**File:** `canvas/paint-strategies.test.mjs:122-126`

```js
it('calls the active strategy and returns its output', () => {
  const sentinel = 'SENTINEL_OUTPUT_12345';
  registerStrategy('sentinel-test', () => sentinel);
  setActiveStrategy('sentinel-test');
  expect(buildPrompt(makeCtx())).toBe(sentinel);
  setActiveStrategy('cinematic');  // cleanup
});
```

**Why it smells:**
- Tests `buildPrompt` indirectly through the registry mechanism. The real contract — "buildPrompt calls the active strategy and returns its output" — could be tested by exposing a `buildPrompt(strategy, ctx)` form, which would be a cleaner unit.
- Manual cleanup at the end (`setActiveStrategy('cinematic')`) — easy to forget if the assertion throws.

**Fix:**
- Extract `buildPrompt(strategy, ctx)` so the test passes a strategy directly:

  ```js
  const sentinel = () => 'SENTINEL_OUTPUT_12345';
  expect(buildPrompt(sentinel, makeCtx())).toBe('SENTINEL_OUTPUT_12345');
  ```
- Or use `beforeEach`/`afterEach` to register and clean up, instead of mid-test.

---

### 11. `beforeEach` doing global mutation — order-dependent across files

**File:** `canvas/painter-storage.test.mjs:7-9`

```js
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.resetModules();
});
```

**Why it smells:**
- Mutates `globalThis.indexedDB`. If a different test file (or future test in this file) also touches it, ordering matters.
- Vitest runs files in separate workers by default, so this is currently isolated, but a `--no-isolate` config flip or shared-worker setup would break it.

**Fix:**
- Move `globalThis.indexedDB = new IDBFactory()` to a `beforeAll` or a `setup` file (`vitest.config.mjs` -> `setupFiles`).
- Or use vitest's built-in `environmentOptions` for jsdom + IDB injection.

---

### 12. Negative/low-signal assertion in paint-orchestrator test

**File:** `canvas/paint-orchestrator.test.mjs:78-86`

```js
it('slides:paint-scene with image key calls generateScene', async () => {
  getImageKey.mockReturnValue('test-key-123');
  ...
  expect(generateScene).toHaveBeenCalled();
});
```

**Why it smells:**
- Asserts only that `generateScene` was called. Doesn't verify what it was called with, what the result was, or what side effects occurred.
- Compare to the neighboring test (lines 90-103) which already verifies the same call path AND checks `notifySceneResult('done', ...)`.

**Fix:**
- Strengthen the assertion: `expect(generateScene).toHaveBeenCalledWith(expect.objectContaining({...}))`.
- Or delete this test as redundant — the "done" test below already proves `generateScene` was called.

---

## Low

### 13. Test relies on `app-state` singleton leaking between files

**Files:**
- `app-state.test.mjs:88-92` deliberately proves singleton-ness
- `session-manager.test.mjs` and `exploration-pipeline.test.mjs` mock it (correct)
- Any FUTURE test that forgets to mock `app-state` will silently inherit state from previous tests in the same file.

**Why it smells:**
- The singleton is a design choice (`taste.md`: "prefer shared state modules over callback injection or circular imports for cross-module state") — not a smell per se.
- But the test suite doesn't enforce isolation, so future drift is silent.

**Fix:**
- Document the singleton contract in `app-state.mjs`'s file header.
- Add a vitest setup file that calls `setActiveBrief(null)`, etc., before each test as a belt-and-braces measure.
- OR inject the state module — but this would break the taste preference.

---

### 14. `_extractJSON` import name starts with underscore — convention violation

**File:** `pipeline/explore.test.mjs:7`

```js
import { validateBrief, _extractJSON, explore, registerLLM } from './explore.mjs';
```

**Why it smells:**
- Underscore prefix conventionally signals "private — do not import". Tests reaching into private API will break on every refactor.
- Either intentional (and worth a comment explaining why) or accidental.

**Fix:**
- Either rename to `extractJSON` (export it) or document why the test deliberately couples to the private function.

---

### 15. Test files have inconsistent mock patterns

**Inconsistency observed:**
- `exploration-pipeline.test.mjs` and `brief-controller.test.mjs`: use top-level `await import(...)` after `vi.mock()` hoisting (correct).
- `paint-orchestrator.test.mjs` and `paint-indicator.test.mjs`: use dynamic `await import(...)` inside each `it()` (unnecessary, see smell #6).

**Fix:**
- Pick one convention across the suite. Top-level imports are simpler and faster.
- Add a `docs/testing-conventions.md` (or extend `DEVELOPER_GUIDE.md` with a Testing section) so future tests follow the pattern.

---

## Recommended Cleanup Order

| Priority | Smell(s) | Effort | Risk Reduction |
|----------|----------|--------|----------------|
| **P0** | #1 flaky sleeps | Low (~15 min, 9 tests) | High — CI flakes today |
| **P0** | #5 magic `20` | Trivial (~5 min) | Medium — silent contract drift |
| **P1** | #4 mock duplication | Medium (~1 hr) | Medium — test isolation |
| **P1** | #7 duplicate test | Trivial | Low |
| **P2** | #6 dynamic imports in `it()` | Low (~15 min) | Low — speed |
| **P2** | #11 global mutation in `beforeEach` | Low (~10 min) | Low — depends on vitest config |
| **P3** | #2 `Math.random` cache-busting | Low (~15 min) | Low — fragile workaround |
| **P3** | #3 order-dependent re-mocks | Low (~20 min) | Low |
| **P3** | #8 `describe.each` shadowing | Trivial | Cosmetic |
| **P3** | #9 phase-jargon in test names | Trivial | Cosmetic |
| **P3** | #10 sentinel strategy pattern | Medium (~30 min) | Low |
| **P3** | #12 weak assertion | Trivial | Low |
| **P3** | #13-15 | Various | Low — polish |

**Suggested first WP:** replace `setTimeout(r, 10|20)` with `vi.useFakeTimers()` across both paint-orchestrator and paint-indicator tests. This is the only smell that can cause a real failure today.

---

## What is NOT a smell (intentional patterns)

These look like smells but are deliberate and good:

- **Singleton `app-state`**: per `taste.md` ("prefer shared state modules over callback injection").
- **`resetDOM()` in `beforeEach`**: required because jsdom tests mutate DOM; the helper exists for this purpose.
- **`vi.mock()` hoisting**: vitest's documented pattern.
- **Module-private function (`_heroNode`, `_supportingCast`) tested via strategy outputs**: in `paint-strategies.test.mjs`. Tests behavior, not implementation. Good.
- **`describe.each(BUILT_INS)` for parameterized strategy tests**: clean pattern, just needs the syntax cleanup in #8.

---

*Audit performed by orchestrator on branch `kaaro/cleanup-paint-sessions`. No tests modified during audit — this is a read-only report.*