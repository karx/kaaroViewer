# Cloud Sync + In-Browser Gemma — TDD Plan

> Concrete instance of `TDD_HANDOFF_KAARO.md`. Read that schema first, then
> `CLAUDE.md`, then the memory index (`project_arch`, `paint_architecture`,
> `visualize_skill_design`).
>
> **Stack note:** this project uses **vitest**, not pytest. Wherever the
> handoff schema says `pytest`, read `pnpm test`. Baseline: **168 tests, all
> green.** No build step — browser-native ESM via import map.

## Why this work exists

kaaroViewer persists everything **device-local and unpartitioned**: one
`kaaroViewer` IndexedDB (`explorations`), a painter IDB, and a few
`localStorage` keys. There is no notion of a user, so explorations cannot
follow a person across devices and two people on one browser see each other's
data. Separately, every LLM call is a **remote** `fetch` through
`pipeline/gateway/` — there is no offline / zero-key inference path.

This change adds (1) per-user identity with cloud sync so a user's sessions,
briefs, and paints follow them, and (2) a local Gemma provider that runs
in-browser so exploration works with no API key and no network.

The two are independent: local Gemma touches only the gateway + settings;
cloud sync touches only the storage paths. They ship in either order.

## Decisions locked

Agents must not relitigate these.

| ID | Decision | Rationale |
|---|---|---|
| D1 | In-browser LLM runtime is **web-llm (MLC)** | OpenAI-compatible API, mature WebGPU streaming, Cache-API model caching, Gemma in catalog. User-selected. |
| D2 | Backend is **Firebase** (Auth + Firestore + Storage) | Prior Firebase context from art-of-intent; Firestore maps to the session/brief documents; offline persistence built in. User-selected. |
| D3 | **Offline-first.** IndexedDB stays the local source of truth; Firestore is the sync layer (write-through). | Preserves the snappy no-network UX; sync is additive, not a rewrite of the read path. |
| D4 | **Auth = Google sign-in + anonymous fallback.** | App must keep working logged-out; anon account can be upgraded later without data loss. |
| D5 | **Paint images live in Firebase Storage**, not Firestore. Metadata (uuid, pos, target, slideIdx) stays in Firestore. | Data-URL images exceed Firestore's 1 MB doc cap. |
| D6 | **API keys never sync.** `kv.llm` secrets stay device-local. Only non-secret prefs (chosen provider/model) may sync. | Secrets in a synced store is an exfiltration risk. |
| D7 | **Conflict resolution = last-write-wins on `savedAt`.** | Single-user-multi-device; no concurrent-editor semantics needed. |
| D8 | Local IndexedDB is **namespaced by `uid`** (incl. an `anon` namespace). | Per-user isolation must hold even for the offline cache on a shared browser. |
| D9 | web-llm and Firebase SDKs load via **CDN ESM / import map**. No bundler. | Honors the project's no-build constraint. |
| D10 | Firebase web config is **committed** (public by design). Isolation is enforced by **security rules**, not key secrecy. | Standard Firebase web posture. |

## Handoff protocol (binding for every WP)

Adapted from `TDD_HANDOFF_KAARO.md` §3 for vitest:

1. `pnpm test` is green (**168**) **before** the WP starts. If not, stop and report.
2. **Test-first.** Write the named failing test(s) first; confirm red for the
   right reason; implement to green.
3. Pure modules → unit tests with fakes (no network/IDB-of-record/WebGPU).
   Adapters (web-llm, Firebase) → **unit-with-fakes**; real-SDK behavior is
   verified manually / via emulator and kept **out** of `pnpm test`.
4. Keep the **full suite** green at the end of the WP. Never weaken or delete
   an existing assertion to pass — fix the cause.
5. Respect `Decisions locked` and project principles.
6. One WP = one working-tree change set. **No commit/branch/push by the agent.**
   The orchestrator commits checkpoints.
7. Stay inside the WP's file allowlist. Any out-of-scope touch is reported with
   rationale.
8. Report back (≤250 words): tests added, red-before/green-after, final public
   surface, files touched, deviations, final suite total.

DOM-only UI wiring that vitest/jsdom cannot meaningfully assert is verified
**manually in a browser** and called out as such — but each such WP must still
extract and unit-test its pure logic (config/meta/branching).

## Target contracts

**web-llm adapter** — `pipeline/gateway/webllm.mjs`
```js
// Matches the existing adapter contract (see anthropic.mjs / openai.mjs).
// fetchFn is accepted for signature parity but unused (no network at inference).
export async function callWebLLM(prompt, config, fetchFn) {
  // config: { model?: string, onProgress?: (report) => void }
  // → { text, inputTokens, outputTokens, finishReason, model }
}
```

**Firebase init** — `pipeline/firebase.mjs`
```js
export function initFirebase();                 // idempotent; returns { app, auth, db, storage }
export function getAuthInstance();               // throws if not init
export function getDb();
export function getStorageBucket();
```

**Cloud store** — `pipeline/cloud-store.mjs` (the write-through seam)
```js
// uid resolved from app-state; 'anon' when signed out.
export async function putDoc(collection, id, data);   // IDB + Firestore mirror (if signed in)
export async function getDoc(collection, id);
export async function listDocs(collection);           // newest-first by savedAt
export async function deleteDoc(collection, id);
export async function putBlob(path, dataUrl);         // Firebase Storage (+ local IDB cache)
export async function getBlobUrl(path);
export async function migrateAnonToUser(uid);         // one-time claim of local 'anon' data
```

**app-state additions** — `canvas/app-state.mjs`
```js
export function getUser();        // { uid, name, photo, isAnonymous } | null
export function setUser(user);
export function getUid();         // user?.uid ?? 'anon'
```

## Work packages

### WP-A1 — web-llm gateway adapter  ·  status: ☐  ·  depends: —
- Goal: a `webllm` provider that runs Gemma in-browser and returns the standard adapter shape.
- Test first: `pipeline/gateway/webllm.test.mjs` — cases: (a) returns `{text,inputTokens,outputTokens,finishReason,model}` from a **mocked engine**; (b) reuses one engine instance across two calls with the same model (singleton); (c) creates a new engine when `config.model` changes; (d) throws a clear error when `navigator.gpu` is undefined; (e) `routeToProvider('webllm', …)` dispatches to it.
- Impl: `pipeline/gateway/webllm.mjs` (lazy `import()` of web-llm from CDN, engine singleton keyed by model, map `usage`→tokens, WebGPU guard); register `'webllm'` in `PROVIDERS` + `ADAPTERS` in `pipeline/gateway/index.mjs`. Inject the engine factory so tests pass a fake.
- Accept: named cases green + full suite green (≥168).
- Type: unit-with-fakes.
- Files: `pipeline/gateway/webllm.mjs`, `pipeline/gateway/index.mjs`, `pipeline/gateway/webllm.test.mjs`.

### WP-A2 — Settings UI for the local-LLM provider  ·  status: ☐  ·  depends: WP-A1
- Goal: users pick `web-llm`, choose a Gemma build, and see download progress; no API-key field.
- Test first: `canvas/settings.test.mjs` — cases: (a) `webllm` provider meta reports `needsKey:false`; (b) `_readForm()`/save accepts a `webllm` config with no key (today `_onSave` blocks empty key for non-`custom`); (c) model list is non-empty for `webllm`. Extract the key-required + provider-meta logic into pure functions to test them.
- Impl: add `PROVIDER_META.webllm` (no key, model `<select>` of known WebGPU Gemma builds, progress-bar element wired to web-llm `initProgressCallback`); relax the key-required guard for `webllm`; import-map / dynamic-import entry per D9. DOM progress wiring verified **manually** (WebGPU unavailable in jsdom).
- Accept: named cases green + full suite green; manual browser check: select Gemma, see download progress, "Test connection" returns PONG.
- Type: unit-with-fakes (+ manual UI).
- Files: `canvas/settings.mjs`, `canvas/settings.test.mjs`, `index.html`.

### WP-B1 — Firebase init module  ·  status: ☐  ·  depends: —
- Goal: idempotent Firebase bootstrap returning `{app,auth,db,storage}`.
- Test first: `pipeline/firebase.test.mjs` — cases: (a) `initFirebase()` initializes once (singleton across two calls); (b) accessors throw before init; (c) reads committed config. Mock the Firebase modular SDK.
- Impl: `pipeline/firebase.mjs` (modular SDK via import map, enable Firestore offline persistence), committed `firebase.config.mjs` placeholder. Inject SDK for tests.
- Accept: named cases green + full suite green.
- Type: unit-with-fakes.
- Files: `pipeline/firebase.mjs`, `firebase.config.mjs`, `pipeline/firebase.test.mjs`, `index.html`.

### WP-B2 — Auth state + sign-in UI  ·  status: ☐  ·  depends: WP-B1
- Goal: current user lives in app-state; a sign-in button drives Google + anon-fallback auth.
- Test first: `canvas/app-state.test.mjs` — cases: (a) `getUid()` returns `'anon'` when no user; (b) `setUser`/`getUser` round-trip; (c) `getUid()` returns `user.uid` when set.
- Impl: app-state user accessors; `canvas/auth-ui.mjs` (action-bar button, `onAuthStateChanged` → `setUser`, Google sign-in, anonymous fallback). Auth DOM/redirect verified **manually**.
- Accept: named cases green + full suite green; manual: sign in with Google, uid appears; reload stays signed in.
- Type: pure-unit-TDD (+ manual UI).
- Files: `canvas/app-state.mjs`, `canvas/app-state.test.mjs`, `canvas/auth-ui.mjs`, `index.html`.

### WP-B3 — Cloud-store write-through seam  ·  status: ☐  ·  depends: WP-B1
- Goal: a storage facade that writes IDB locally and mirrors to Firestore when signed in, namespaced by uid (D3, D7, D8).
- Test first: `pipeline/cloud-store.test.mjs` — cases: (a) signed-out → writes IDB only, no Firestore call; (b) signed-in → writes both; (c) `listDocs` newest-first by `savedAt`; (d) read prefers local, falls back to Firestore; (e) records namespaced by uid (user A cannot read user B's docs); (f) last-write-wins on `savedAt`. Fake Firestore + fake IDB.
- Impl: `pipeline/cloud-store.mjs` per the Target contract; uid from app-state.
- Accept: named cases green + full suite green.
- Type: unit-with-fakes.
- Files: `pipeline/cloud-store.mjs`, `pipeline/cloud-store.test.mjs`.

### WP-B4 — Route sessions through cloud-store  ·  status: ☐  ·  depends: WP-B3
- Goal: `sessions.mjs` save/load/list/delete go through cloud-store with uid namespacing; behavior unchanged when signed out.
- Test first: extend `pipeline/sessions` coverage (new `pipeline/sessions.test.mjs` if absent) — cases: (a) `saveSession` persists via cloud-store under the current uid; (b) `listSessions` returns only the current uid's sessions; (c) signed-out path is IDB-only and matches today's shape.
- Impl: refactor `pipeline/sessions.mjs` to delegate to `cloud-store`; preserve the public function signatures `session-manager.mjs` already imports.
- Accept: named cases green + `canvas/session-manager.test.mjs` still green + full suite green.
- Type: unit-with-fakes.
- Files: `pipeline/sessions.mjs`, `pipeline/sessions.test.mjs`.

### WP-B5 — Paint images → Firebase Storage  ·  status: ☐  ·  depends: WP-B3
- Goal: paint image blobs go to Storage; metadata records carry the storage path (D5).
- Test first: extend `canvas/painter-storage.test.mjs` — cases: (a) signed-in → image written via `cloud-store.putBlob`, metadata holds the path; (b) signed-out → IDB-only as today; (c) `MAX_FREE_ROAM_RECORDS` pruning still holds.
- Impl: refactor `canvas/painter-storage.mjs` `_idbSave`/`_idbLoad`/`_storeProjectionRecord` to delegate blob writes to `cloud-store`; keep IDB as local cache.
- Accept: named cases green + full suite green.
- Type: unit-with-fakes.
- Files: `canvas/painter-storage.mjs`, `canvas/painter-storage.test.mjs`.

### WP-B6 — One-time anon→user migration  ·  status: ☐  ·  depends: WP-B3, WP-B4, WP-B5
- Goal: on first sign-in, the user can claim existing local `anon` sessions/paints into their cloud space.
- Test first: `pipeline/cloud-store.test.mjs` (extend) — cases: (a) `migrateAnonToUser(uid)` copies all `anon`-namespaced docs to `uid` and uploads referenced blobs; (b) idempotent (re-run copies nothing new); (c) leaves originals intact unless claimed.
- Impl: `migrateAnonToUser` in `cloud-store.mjs`; trigger + "claim local data" prompt in `auth-ui.mjs`.
- Accept: named cases green + full suite green; manual: sign in, accept claim, prior local sessions appear cloud-backed.
- Type: data-migration (unit-with-fakes) + manual UI.
- Files: `pipeline/cloud-store.mjs`, `pipeline/cloud-store.test.mjs`, `canvas/auth-ui.mjs`.

### WP-B7 — Security rules  ·  status: ☐  ·  depends: WP-B1
- Goal: every `users/{uid}/**` doc and Storage object is readable/writable only by its owner.
- Test first: `firestore.rules` + `storage.rules` validated with the **Firebase emulator** rules-test (kept out of `pnpm test`; documented run command). Cases: owner read/write allowed; other-uid denied; unauthenticated denied.
- Impl: `firestore.rules`, `storage.rules`, and a short README note on applying them.
- Accept: emulator rules-tests pass; `pnpm test` unchanged (rules tests are not in the default run).
- Type: script / data.
- Files: `firestore.rules`, `storage.rules`, `firebase.json` (emulator config).

## Dependency order

```
WP-A1 ──▶ WP-A2                         (Workstream A — fully parallel to B)

WP-B1 ──┬─▶ WP-B2
        ├─▶ WP-B3 ──┬─▶ WP-B4 ──┐
        │           └─▶ WP-B5 ──┼─▶ WP-B6
        └─▶ WP-B7   (parallel)  ┘
```

Parallelizable (disjoint allowlists, deps met):
- All of **A** runs concurrently with all of **B**.
- After WP-B1: **WP-B2**, **WP-B3**, **WP-B7** run in parallel.
- After WP-B3: **WP-B4** and **WP-B5** run in parallel.

## Definition of done

- `pnpm test` green with **net-new tests** added by every WP; zero weakened assertions.
- A user with no API key can pick **web-llm → a Gemma build**, watch it download/compile once, and run a full exploration offline thereafter.
- A signed-in user's sessions, briefs, and paints persist to Firebase and reappear on a second device; signed-out use still works against local IDB.
- Two users on one browser never see each other's data (local or cloud).
- On first sign-in, prior local explorations can be claimed into the account.
- Security rules deny cross-user and unauthenticated access (emulator-verified).
- API keys never leave the device.
