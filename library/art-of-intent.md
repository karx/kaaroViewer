http://art-of-intent.netlify.app/
---
## CODEBASE INVENTORY: Art of Intent
**Project Size:** 7.1MB | **Total Files:** ~91 markdown docs + 35+ source files
---
## 1. ALL FILES AND THEIR PURPOSES
### **Frontend (No build step - plain HTML/CSS/JS served from repo root)**
#### HTML Files (628 lines)
- **`index.html`** (628 lines) — Main game interface with meta tags, schema.org JSON-LD, splash screen, modals (leaderboard, welcome), input area, game trail, results panel
- **`history.html`** (9,076 lines) — Historical game sessions view
- **`insights.html`** (9,076 lines) — Analytics/insights dashboard
- **`cheat-the-code.html`** (23,036 lines) — Easter egg cheat code interface
#### CSS Files (3,626 total lines)
- **`src/css/dos-theme.css`** (3,161 lines) — Primary MS-DOS themed stylesheet with Solarized CRT colors, scanline animations, grid system, all semantic variables
- **`src/css/themes.css`** (465 lines) — Additional theme variations
#### JavaScript Files (10,838 total lines)
**Core Game Logic:**
- **`src/js/game.js`** (2,602 lines) — Game orchestrator: state management, prompt submission, API integration, word matching, creep system, token tracking, UI updates, event listeners
**Firebase Backend Integration:**
- **`src/js/firebase-config.js`** (110 lines) — Firebase SDK initialization (Auth, Firestore, Functions), database ID 'alpha' setup, offline persistence
- **`src/js/firebase-auth.js`** (468 lines) — Anonymous/Google OAuth login flows, user sign-out
- **`src/js/firebase-db.js`** (434 lines) — Firestore CRUD operations for users, sessions, leaderboards
- **`src/js/firebase-integration.js`** (345 lines) — High-level integration glue between game state and Firestore
**UI Components:**
- **`src/js/ui-components.js`** (517 lines) — Leaderboard modal, profile display, user stats rendering
- **`src/js/welcome-modal.js`** (133 lines) — First-time user welcome/onboarding modal
- **`src/js/header-toggle.js`** (190 lines) — Side navigation toggle, mobile menu control
**Share/Social Features:**
- **`src/js/share-card-generator.js`** (572 lines) — Master card generation dispatcher; calls v3, v4, or v5 generators
- **`src/js/share-card-v3.js`** (231 lines) — Share card format v3 (legacy)
- **`src/js/share-card-v4.js`** (357 lines) — Share card format v4
- **`src/js/share-card-v5.js`** (275 lines) — Share card format v5 (current default); canvas-based PNG generation
- **`src/js/leaderboard-card-generator.js`** (405 lines) — OG image generator for leaderboard shares
**Analytics & Tracking:**
- **`src/js/analytics.js`** (226 lines) — Firebase GA4 event tracking (gameStart, gameComplete, promptSubmit, blacklistViolation, targetHit, apiError, sharing)
- **`src/js/leaderboard-data.js`** (357 lines) — Leaderboard queries (daily, weekly, all-time)
- **`src/js/insights.js`** (574 lines) — Game statistics aggregation and visualization
**Theming & UI Enhancement:**
- **`src/js/theme-manager.js`** (444 lines) — Theme persistence, voice settings (rate, pitch, volume), system preference detection
- **`src/js/theme-picker.js`** (383 lines) — Theme selector UI
- **`src/js/sound-effects.js`** (132 lines) — Audio feedback for game events
**Utilities:**
- **`src/js/ascii-charts.js`** (301 lines) — ASCII bar/chart rendering for stats display
- **`src/js/prompt-purify.js`** (249 lines) — Input validation/sanitization to prevent XSS
- **`src/js/cheat-codes.js`** (241 lines) — Easter egg cheat code system
- **`src/js/icon-generator.js`** (271 lines) — Dynamic icon generation
- **`src/js/version.js`** (38 lines) — Version tracking
- **`src/js/config.js`** (26 lines) — Configuration constants
- **`src/js/huggin-interface.js`** (17 lines) — Hugging Face model interface stub
#### Data Files
- **`src/data/arty-remarks.json`** — 35 quirky contemplation remarks Arty displays while generating haikus
---
### **Backend (Firebase Cloud Functions)**
#### Node.js Functions (983 total lines)
- **`functions/index.js`** (803 lines) — Two Cloud Functions:
  - **`artyGenerateHaiku`** (Callable, HTTPS) — Core game loop: validates auth, reads today's dailyWords from Firestore, builds system prompt server-side, calls Gemini API, maps errors to typed HttpsError with structured details (retry seconds, quota metric)
  - **`generateDailyWords`** (Scheduled, daily midnight UTC) — Date-seeded deterministic RNG generates 3 target words + 5-7 blacklist words, stores to `dailyWords/{YYYY-MM-DD}`
- **`functions/test-local.js`** (180 lines) — Local test harness for Cloud Functions
#### Configuration
- **`functions/package.json`** — Node.js 20, dependencies: firebase-admin, firebase-functions
- **`functions/.env.example`** — Template for `GEMINI_API_KEY` and `GEMINI_API_URL`
---
### **Configuration Files**
- **`firebase.json`** — Hosting (repo root `.`), functions deployment config
- **`firestore.rules`** (3,832 bytes) — Security rules (public read, owner write for sessions/users)
- **`firestore.indexes.json`** — Composite index definitions
- **`.firebaserc`** — Firebase project ID
- **`package.json`** — Frontend test scripts (Jest for JS modules, legacy Node.js tests for card generators)
- **`.env_example`** — Environment variable template
- **`site.webmanifest`** — PWA manifest
- **`generate-icons.cjs`** — Icon generation script
- **`generate-og-image.js`** — OG image generation utility
---
### **Tests (964 total lines)**
- **`tests/analytics.test.js`** (327 lines) — Jest unit tests for analytics module
- **`tests/share-card-generator.test.js`** (312 lines) — Card generator tests (Node.js test runner)
- **`tests/leaderboard-card-generator.test.js`** (325 lines) — Leaderboard card tests
- **`src/js/share-card-generator.test.js`** — Duplicate/alternative test
**HTML Test Files (various sizes):**
- `test-firebase.html` — Firebase integration testing
- `test-functions.html` — Cloud Functions testing
- `test-prompt-injection.html` — Security testing (prompt injection prevention)
- `test-xss.html` — XSS vulnerability testing
- `test-security-signals.html` — Security signals integration testing
---
### **Documentation (91 markdown files, well-organized)**
#### Main Guides
- **`CLAUDE.md`** (5,077 bytes) — Architecture guide for Claude Code: commands, deployment, data flow, error handling, environment setup
- **`docs/README.md`** — PARA method documentation structure
- **`docs/DAILY_WORDS_SYSTEM.md`** — Daily word generation mechanics
- **`docs/CREEP_SYSTEM.md`** — Game-ending "creep" mechanic
#### Active Projects (in `docs/projects/`)
- `SHARE_CARD_FEATURE.md` — Share card implementation
- `ANALYTICS_INTEGRATION.md` — Analytics setup
- `OPENGRAPH_TESTING.md` — OG image testing
- `LEADERBOARD_OG_IMAGE.md` — Leaderboard card generation
- `MOBILE_LAYOUT_REDESIGN.md` — Mobile UX improvements
#### Architecture & Design (in `docs/areas/`)
- `FIREBASE_ARCHITECTURE.md` — Backend structure
- `ANALYTICS_STRATEGY.md` — Tracking approach
- `SCHEMA_ORG.md` — Semantic markup
- `DOS_THEME_GUIDELINES.md` — Visual design standards
- `AI_EVALUATION.md` — AI benchmark system
- `VALIDATION.md` — Input validation specs
- `DATA_PIPELINE.md` — Data flow
#### Resources (in `docs/resources/`)
- `SETUP.md` — Developer setup
- `FIREBASE_SETUP.md` — Firebase project configuration
- `FIRESTORE_RULES_DEPLOYMENT.md` — Rules deployment guide
- `OPENGRAPH.md` — OG metadata specs
- `ICONS.md` — Icon generation
- `IMAGES.md` — Asset management
#### Deployment Docs (root + archived)
- `DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_STATUS.md`, `DEPLOYMENT_SUCCESS.md`, `FINAL_DEPLOYMENT_SUMMARY.md` — Deployment workflows
- `FIREBASE_FUNCTIONS_ARCHITECTURE.md`, `FIREBASE_RULES_UPDATE.md` — Firebase-specific deployments
- `FEEDBACK_SYSTEM_MAINTAINER_GUIDE.md` — User feedback system
- `LAUNCH_CHECKLIST.md`, `LAUNCH_MESSAGES.md` — Launch planning
#### Archives
- `docs/archives/` — 15+ historical documentation files from v1.0.0 development
#### Misc
- `docs/future-work.md` — Scoped upcoming items (Result URL hash sharing, streak counter)
- `next.md` — Next steps placeholder
- `CHANGELOG.md` — Version history (16,480 bytes)
---
## 2. OVERALL ARCHITECTURE
### **Frontend Stack**
- **No build step** — Plain HTML/CSS/JS served from repo root via Firebase Hosting
- **Module system** — ES6 `type="module"` for Firebase modules, classic scripts for rest
- **Load order matters:** share-card generators → firebase-config → auth/db → ui-components → welcome-modal → firebase-integration → game.js
- **State management** — Single `gameState` object in memory (localStorage fallback)
- **Theme system** — CSS variables in `dos-theme.css`, runtime switching via `theme-manager.js`, localStorage persistence
- **Analytics** — Firebase GA4 integrated via `analytics.js`
### **Backend Stack**
- **Firebase Cloud Functions v2** (Node.js 20, `us-central1`)
- **Firestore** — Database ID `alpha` (non-default)
- **Authentication** — Anonymous + Google OAuth via Firebase Auth
- **Gemini API** — Called server-side (API key kept secure in Cloud Functions environment)
### **Data Flow**
```
game.js (UI) 
  → callArtyAPI() 
  → httpsCallable(functions, 'artyGenerateHaiku')
  → Cloud Function validates auth, reads dailyWords from Firestore
  → Builds system prompt server-side (unhackable)
  → Calls Gemini API with prompt
  → Returns fullResponse object (text, tokens, usage)
  → game.js processResponse() extracts haiku, checks target/blacklist words
  → Updates UI, saves session state to Firestore
```
### **Game Mechanics**
- **Daily reset** — New 3 target words + 5-7 blacklist words generated daily (midnight UTC, seeded RNG)
- **Player goal** — Write prompts to guide "Arty" (Gemini haiku bot) to include all 3 target words in response while avoiding blacklist words
- **Scoring** — Token efficiency (fewer tokens = better score); attempts count against score
- **Limits** — 10 attempts max before game over
- **Creep system** — Blacklist violations add "creep" (darkness/risk); 100 creep = game over
- **Haiku format** — Bot must respond with exactly 5-7-5 syllable haiku (enforced server-side)
---
## 3. EXISTING DOCUMENTATION
**Extensive (91 markdown files):**
- **Quick start:** `CLAUDE.md` (main reference for Claude Code)
- **Active work:** `docs/projects/` (current features)
- **Standards:** `docs/areas/` (architecture, design, validation)
- **Reference:** `docs/resources/` (setup, Firebase, icons, OG)
- **History:** `docs/archives/` (completed phases, v1.0.0 work)
**Quality:** Well-organized using PARA method (Projects, Areas, Resources, Archives). Actionable with linked cross-references.
---
## 4. GAME MECHANICS IN DETAIL
**Title:** Art of Intent — Haiku Challenge
**Core Loop (10 turns per session):**
1. Player sees 3 **target words** (e.g., "mountain", "river", "stone")
2. Player sees 5-7 **blacklist words** (forbidden in prompts)
3. Player writes a prompt to Arty (Gemini bot)
4. Arty responds with a haiku (5-7-5 syllables, enforced server-side)
5. Game checks:
   - Does haiku contain target words? (hit = +1 matched)
   - Does prompt contain blacklist words? (violation = +25 creep, -1 HP)
   - Token count tracked (prompt + output tokens)
6. Repeat until:
   - All 3 targets matched → **Victory** (score calculated from tokens + attempts)
   - 10 attempts used → **Defeat**
   - Creep reaches 100 → **Game Over**
**Scoring:**
- Primary metric: **Token efficiency** (tokens used per attempt, lower is better)
- Secondary: **Attempt count** (10 is max)
- Rating bands: <40 tokens/attempt = Excellent (★★★), <50 = Good (★★☆), <60 = Average (★☆☆), >60 = Needs Work (☆☆☆)
**Word Generation:**
- Daily rotation of 11 word pools (nature, weather, time, seasons, emotions, elements, creatures, plants, cosmos, structures, abstract, textures)
- 3 targets randomly selected from different categories
- 5-7 blacklist words from remaining pool
**Unique Features:**
- **AI-driven** — Uses Gemini API (not hardcoded bot)
- **Prompt engineering gameplay** — Players learn to craft indirect prompts to "sneak" target words past constraints
- **Leaderboard** — Global daily/weekly/all-time rankings by efficiency
- **Share cards** — PNG card generation (v5 canvas-based) showing score, haiku, stats
- **DOS aesthetic** — 1990s terminal/CRT styling with scanlines, Solarized colors
- **Streaks** — (Planned feature) Day-over-day retention mechanic
---
## 5. EXISTING TESTS
**Jest Unit Tests (3 files, ~964 lines):**
- `tests/analytics.test.js` (327 lines) — Event tracking, GA4 integration
- `tests/share-card-generator.test.js` (312 lines) — Card PNG generation
- `tests/leaderboard-card-generator.test.js` (325 lines) — Leaderboard OG images
**HTML Test Pages (5 files):**
- `test-firebase.html` — Firestore/Auth integration tests
- `test-functions.html` — Cloud Functions callable tests
- `test-prompt-injection.html` — Injection attack prevention (system prompt unhackable)
- `test-xss.html` — XSS vulnerability checks
- `test-security-signals.html` — Security monitoring integration
**Run commands:**
```bash
npm test              # Jest tests
npm test:analytics    # Analytics-only
npm test:share        # Share card tests
npm test:leaderboard  # Leaderboard tests
```
---
## 6. PACKAGE FILES
### **Root `package.json`** (1,757 bytes)
```json
{
  "name": "art-of-intent",
  "version": "2.0.1-alpha",
  "type": "module",
  "scripts": {
    "test": "NODE_OPTIONS=--experimental-vm-modules jest",
    "test:watch": "NODE_OPTIONS=--experimental-vm-modules jest --watch",
    "test:coverage": "NODE_OPTIONS=--experimental-vm-modules jest --coverage",
    "test:analytics": "NODE_OPTIONS=--experimental-vm-modules jest tests/analytics.test.js",
    "test:legacy": "node tests/share-card-generator.test.js && node tests/leaderboard-card-generator.test.js",
    "generate:og": "node generate-og-image.js",
    "serve": "python3 -m http.server 8000",
    "dev": "python3 -m http.server 8000"
  },
  "dependencies": {
    "firebase-admin": "^13.5.0",
    "google-auth-library": "^10.4.2"
  },
  "devDependencies": {
    "@jest/globals": "^30.2.0",
    "jest": "^30.2.0"
  }
}
```
### **`functions/package.json`** (1,043 bytes)
```json
{
  "name": "art-of-intent-functions",
  "version": "1.0.0",
  "main": "index.js",
  "engines": { "node": "20" },
  "scripts": {
    "deploy": "firebase deploy --only functions",
    "serve": "firebase emulators:start --only functions",
    "logs": "firebase functions:log"
  },
  "dependencies": {
    "firebase-admin": "^13.5.0",
    "firebase-functions": "^6.6.0",
    "dotenv": "^17.2.3"
  }
}
```
---
## KEY STATISTICS
| Metric | Count |
|--------|-------|
| **JavaScript Files** | 35+ |
| **CSS Files** | 2 (3,626 lines) |
| **HTML Files** | 4 main + 5 test |
| **Backend Functions** | 2 (Cloud Functions) |
| **Firestore Collections** | 4 (dailyWords, users, sessions, leaderboard) |
| **Word Pools** | 12 categories |
| **Tests** | 3 Jest + 5 HTML test pages |
| **Docs** | 91 markdown files |
| **Total Project Size** | 7.1MB |
---
## DEPLOYMENT SUMMARY
**Hosting:** Firebase Hosting (static, served from repo root)
**Backend:** Firebase Cloud Functions (Node.js 20, auto-deployed)
**Database:** Firestore (database ID: `alpha`)
**Authentication:** Firebase Auth (anonymous + Google OAuth)
**Deploy Commands:**
```bash
firebase deploy              # Everything
firebase deploy --only functions  # Cloud Functions only (most common dev)
firebase deploy --only hosting    # Frontend only
firebase deploy --only firestore  # Rules/indexes only
```
---
## FUTURE WORK (From docs/future-work.md)
**High Priority:**
1. **Result URL** — Encode score in `#r=<base64>` hash for shareable read-only result links
2. **Streak counter** — Day-over-day retention feature
This codebase is a full-stack LLM-based word puzzle game with thoughtful architecture, extensive tests, and production-grade deployment via Firebase.

http://art-of-intent.netlify.app/