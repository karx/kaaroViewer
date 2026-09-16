# kaaroViewer Discord bot

Discord front door for the `/visualize` skill. Anyone in a server this bot is
invited to can run `/visualize` on a document; the bot runs the real encoding
skill headlessly, validates the result, and **opens a PR** — nothing ever
lands on `master` without a human reviewing and merging it.

## How it works

```
/visualize text|attachment|source_url [class: B (default) | A]
  → deferred ack
  → git worktree off origin/master, new branch
  → agent-service runs the /visualize SOP (claude-code or pi-coding-agent)
  → re-run the repo's own validator for an authoritative pass/fail
  → commit, push, open a PR via the GitHub REST API
  → reply with an embed: counts, validator status, PR link, live preview link
```

`class` defaults to **B — the minimalistic flow**: 6–15 nodes, single pass,
no mandatory retrospective, no edge-density/story-arc/insight-mix gates. It
exists because the full class-A flow (below) took 7.5+ minutes on a real run
and still hadn't finished when it hit a Claude session limit — too slow and
too fragile for a chat command. Pass `class: A` explicitly for the full
library-grade three-pass encoding instead. Both classes produce the same
JSON schema, go through the same validator, and open a real PR — see
SKILL.md's "B-class: minimalistic flow" section for exactly what's relaxed.

The preview link works because `.github/workflows/preview.yml` already deploys
every PR to `https://<owner>.github.io/kaaroViewer/previews/pr-<N>/`, and
`main.mjs` already supports a `?lib=<id>` deeplink — no frontend changes were
needed for this to work.

## Setup

### 1. Discord application (slash command — no privileged intents needed)

This is a **slash command bot**, not a mention-gateway bot — much simpler
than a bot that reads channel messages:

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token** → copy into `DISCORD_BOT_TOKEN`. No
   privileged intents (Message Content, etc.) need to be enabled — slash
   commands don't require them.
3. **General Information** → copy the **Application ID** into
   `DISCORD_CLIENT_ID`.
4. Invite it with the minimal scope — `applications.commands` is what makes
   `/visualize` show up, `bot` is what lets it reply:
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=0
   ```
   Pick a server in the picker. A "success" page with no guild picker means
   the bot did **not** actually join anything — retry.

### 2. GitHub

Create a PAT (classic, `repo` scope, or fine-grained with Contents +
Pull-requests write on this repo) → `GITHUB_TOKEN`. `gh` CLI is **not**
required — PRs are opened via a direct REST call.

### 3. Configure and run

```
cp .env.example .env      # fill in the values above — .env is gitignored, never commit it
pnpm install
pnpm run register-commands   # one-shot; re-run whenever the command's options change
pnpm start                   # long-lived process
```

Set `DISCORD_GUILD_ID` in `.env` while iterating — guild-scoped commands
propagate in seconds; global commands (unset) can take up to an hour.

**Always-on**: `pnpm start` is a plain foreground Node process. Wrap it with
whatever process supervisor you'd use for any other always-on local process
on this machine (pm2, NSSM as a Windows service, a Scheduled Task that
restarts it, etc.) — that's an ops choice outside this repo's code.

## Agent backend (configurable)

`AGENT_BACKEND` selects which engine actually runs the encoding SOP —
`src/agent-service/index.mjs` is the only file that knows about this switch:

- **`claude-code`** (default) — spawns the `claude` CLI already installed
  and logged in on this machine, running `/visualize` for real: the exact
  three-pass SOP, edge-density gate, and mandatory retrospective in
  `.claude/skills/visualize/SKILL.md`. This is the library-grade path.
- **`pi-coding-agent`** — spawns `pi` (`@earendil-works/pi-coding-agent`;
  install it globally — `npm install -g --ignore-scripts
  @earendil-works/pi-coding-agent`). `pi` doesn't know about Claude Code's
  skill loader, so this backend reads `SKILL.md` + `sop-reference.md` fresh
  on every run and feeds them to `pi` as one literal prompt — the SOP text
  itself still lives in exactly one place. Needs `PI_API_KEY` (+ optionally
  `PI_PROVIDER`/`PI_MODEL`) in `.env`.

Adding a third backend later is one new file exporting a `run(job)` function
with the same shape as the two above, plus one new entry in `BACKENDS` in
`src/agent-service/index.mjs` — nothing in `src/discord/` or
`src/git-workflow.mjs` needs to change.

## Validator

`src/validate.mjs` re-runs `.claude/hooks/validate-library-json.py` itself
after the agent finishes, rather than trusting the agent's own claim. Exit
codes: `0` clean, `1` warnings (still opened for review), `2` breaking
cross-reference errors (still opened — the PR review is the fix point, not
this bot). The validator script also exposes an importable `validate(path)`
function returning `(errors, warnings)` lists if finer-grained counts are
ever needed instead of just the exit code.

## Observability

The first real run (session `d0b79095`, 2026-09-08 — inspected via `/agent-log`)
sat silent in Discord for ~8 minutes, then reported "no library JSON produced"
for a run that had, in fact, produced a good one (30 nodes, 67 edges). Two
things caused that, both fixed now:

- **`python3` was broken on this machine.** Windows' "python3" App Execution
  Alias stub shadows the real interpreter unless you've disabled it in
  Settings, and — this is the subtle part — a `.cmd` shim placed earlier on
  `PATH` does **not** fix it for Claude Code's own Bash tool, because that
  tool resolves commands through Git Bash (MSYS), and MSYS's bare-name PATH
  search ignores `.cmd`/`.bat` files entirely; only an extensionless
  executable script resolves. Separately, Node's own `child_process.spawn`
  (used by this bot to re-run the validator) does **not** apply Windows'
  PATHEXT/`.cmd` resolution without `shell: true`, so it needed the opposite
  fix — the literal resolved command, not a `python3` shim at all.
  `src/python-shim.mjs` now generates both kinds of shim once at startup and
  hands `validate.mjs` the resolved command directly; see that file's header
  comment for the full story if this ever needs revisiting on a different
  machine.
- **A GitHub repo URL isn't raw text.** `source_url:
  https://github.com/karx/alfred-buildathon` fetched GitHub's rendered
  React page, and the agent burned most of its time budget reverse-
  engineering the embedded JSON payload for a README before it could start
  encoding. `src/resolve-source.mjs` now rewrites `github.com/.../blob/...`
  and bare repo-root URLs to `raw.githubusercontent.com` before fetching,
  and logs a warning (to the job's log file) if a fetch still comes back
  `text/html`.

On top of those fixes, every job now gets:

- **Live Discord progress** — the deferred reply is edited at each stage
  (worktree ready → resolving source → running the encoder, with a heartbeat
  every 30s while that's in flight → validating → committing/pushing →
  opening the PR), so the channel shows real progress instead of silence.
- **A per-job log file** at `discord-bot/logs/<job-id>.log` (gitignored) —
  every lifecycle line plus the full raw stdout/stderr of the encoder run.
  The failure embed always names its own log file.
- **Directory-diff doc detection** — `src/find-new-library-docs.mjs` snapshots
  `library/*.json` before the run and diffs after, instead of relying solely
  on regex-parsing the agent's own "Step 7" report text. This means a run
  that got killed by the timeout *after* writing its JSON but *before*
  printing that report still gets committed and opened as a PR (with a note
  in the embed saying so), rather than being silently discarded.
- **A longer default timeout** (`AGENT_TIMEOUT_MS`, 15 min) — the original
  8-minute default was tight enough that a run untangling a bad source URL
  could get killed before it ever reached encoding.

## Manual smoke test

1. `pnpm run register-commands`, then `pnpm start`.
2. In your test server: `/visualize text:"# A tiny test doc\n\nJust checking the pipeline."`
3. Expect a sequence of status edits on the same message (preparing →
   resolving → running → validating → committing → opening PR), then a final
   embed with a working PR link and a working `previews/pr-<N>/?lib=<id>`
   link that renders the graph.
4. Check `discord-bot/logs/<job-id>.log` has the full run, and
   `discord-bot/.worktrees/` is empty again after the job finishes, whether
   it succeeded or failed.
5. To exercise the timeout-recovery path deliberately, set `AGENT_TIMEOUT_MS`
   very low (e.g. `60000`) for one run against a large document and confirm
   the bot still opens a PR with a "hit the timeout... recovered anyway" note
   rather than reporting failure, as long as a library JSON was written
   before the cutoff.

## Secrets hygiene

- `.env` is gitignored — never commit it, and rotate any token that leaks
  into a chat log or screenshot.
- `DISCORD_BOT_TOKEN` (three dot-separated segments) is not the same thing as
  an OAuth2 client secret — don't put the wrong one in `.env`.
- The bot never pushes to `master` and never merges a PR. If you want it to
  do more autonomously, that's a deliberate follow-up decision, not a
  default.
