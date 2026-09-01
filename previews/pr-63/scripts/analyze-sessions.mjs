#!/usr/bin/env node
/**
 * scripts/analyze-sessions.mjs
 *
 * Deterministic analysis of all Claude Code JSONL session files.
 * Input:  C:/Users/karx0/.claude/projects/ (all *.jsonl files)
 * Output: scripts/sessions-data.json
 *
 * Run:  node scripts/analyze-sessions.mjs
 *
 * Schema of sessions-data.json:
 *   {
 *     meta:     { generated_at, total_sessions, total_projects, source_dir }
 *     projects: [ { id, label, session_count, total_tokens, ... } ]
 *     sessions: [ { ... one record per session ... } ]
 *     rollup:   { tools, skills, models, tokens, errors }
 *   }
 */

import fs   from 'fs';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const PROJECTS_ROOT = 'C:/Users/karx0/.claude/projects';
const OUT_FILE      = new URL('./sessions-data.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// Built-in Claude Code slash commands (not custom skills)
const BUILTIN_COMMANDS = new Set([
  'exit', 'clear', 'compact', 'context', 'model', 'help', 'voice',
  'plan', 'fast', 'config', 'review', 'memory', 'doctor', 'status',
  'rate-limit-options', 'mcp', 'cost', 'log',
]);

// Map directory names to human labels
const PROJECT_LABELS = {
  'C--Users-karx0-kaaro-codepractice': 'Code Practice',
  'D--src-art-of-intent':              'Art of Intent',
  'D--src-kaaroCatalogue':             'kaaroCatalogue',
  'D--src-kaaroExcalidraw':            'kaaroExcalidraw',
  'D--src-kaaroPoker':                 'kaaroPoker',
  'D--src-kaaroViewer':                'kaaroViewer',
  'D--src-karx-github-io':             'karx.github.io',
};

// ── Path normaliser ───────────────────────────────────────────────────────────

function normPath(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.replace(/\\/g, '/').replace(/\/\//g, '/').trim() || null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJsonlFile(filePath) {
  const raw   = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  const records = [];
  for (const line of lines) {
    try { records.push(JSON.parse(line)); } catch { /* skip malformed lines */ }
  }
  return records;
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content))    return '';
  return content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join(' ');
}

function extractSkills(text) {
  // Match /command-name from Claude Code skill invocations
  const matches = [...text.matchAll(/<command-name>\/?([\w-]+)<\/command-name>/g)];
  return matches.map(m => m[1]);
}

// ── Per-session analysis ──────────────────────────────────────────────────────

function analyzeSession(projectId, filePath) {
  const records = parseJsonlFile(filePath);
  const sessionId = path.basename(filePath, '.jsonl');
  const fileSize  = fs.statSync(filePath).size;

  const session = {
    session_id:   sessionId,
    project_id:   projectId,
    project_label: PROJECT_LABELS[projectId] || projectId,
    file_size_bytes: fileSize,

    // Timestamps
    first_timestamp: null,
    last_timestamp:  null,

    // From system/turn_duration record
    slug:          null,
    duration_ms:   null,
    message_count: null,
    version:       null,
    entrypoint:    null,
    git_branch:    null,
    cwd:           null,
    permission_mode: null,

    // Model
    model: null,

    // Counts
    user_turns:      0,
    assistant_turns: 0,
    tool_calls:      0,
    tool_errors:     0,

    // Tokens (summed across all assistant turns)
    tokens: {
      input:        0,
      cache_create: 0,
      cache_read:   0,
      output:       0,
    },

    // Tool breakdown: { ToolName: { calls, errors } }
    tools: {},

    // File operations: { normalised_path: { read, write, edit } }
    file_ops: {},

    // Bash command categories: { git, npm, npx, node, python, fs, curl, other }
    bash_categories: {},

    // Content block type counts (thinking, text, tool_use)
    content_blocks: {},

    // Stop reason counts (tool_use, end_turn, stop_sequence, max_tokens)
    stop_reasons: {},

    // Custom skills invoked
    skills: [],
    // Built-in /commands used
    builtin_commands: [],

    // Content block types seen in assistant messages
    assistant_content_types: {},

    // First user message text (truncated)
    first_user_message: null,
  };

  let firstUserSeen = false;

  for (const rec of records) {
    // Timestamps from any timestamped record
    if (rec.timestamp) {
      if (!session.first_timestamp || rec.timestamp < session.first_timestamp)
        session.first_timestamp = rec.timestamp;
      if (!session.last_timestamp || rec.timestamp > session.last_timestamp)
        session.last_timestamp = rec.timestamp;
    }

    // permission-mode
    if (rec.type === 'permission-mode') {
      session.permission_mode = rec.permissionMode;
    }

    // system/turn_duration — carries slug, duration, version, entrypoint
    if (rec.type === 'system' && rec.subtype === 'turn_duration') {
      if (rec.durationMs != null) session.duration_ms   = rec.durationMs;
      if (rec.messageCount != null) session.message_count = rec.messageCount;
      if (rec.slug)        session.slug       = rec.slug;
      if (rec.version)     session.version    = rec.version;
      if (rec.entrypoint)  session.entrypoint = rec.entrypoint;
      if (rec.gitBranch)   session.git_branch = rec.gitBranch;
      if (rec.cwd)         session.cwd        = rec.cwd;
    }

    // user messages
    if (rec.type === 'user' && rec.message) {
      session.user_turns++;

      // Capture metadata from user records
      if (!session.version    && rec.version)    session.version    = rec.version;
      if (!session.entrypoint && rec.entrypoint) session.entrypoint = rec.entrypoint;
      if (!session.git_branch && rec.gitBranch)  session.git_branch = rec.gitBranch;
      if (!session.cwd        && rec.cwd)        session.cwd        = rec.cwd;

      const text = extractTextFromContent(rec.message.content);

      // First real user message — strip tags, skip boilerplate/commands
      if (!firstUserSeen) {
        // Strip XML/HTML-like tags and collapse whitespace
        const stripped = text
          .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '')  // remove tag+content pairs
          .replace(/<[^>]+>/g, '')                     // remove self-closing tags
          .replace(/\s+/g, ' ')
          .trim();
        const isBoilerplate = stripped.length < 8
          || stripped.startsWith('Base directory for this skill')
          || stripped.startsWith('Caveat:');
        if (!isBoilerplate) {
          session.first_user_message = stripped.slice(0, 200);
          firstUserSeen = true;
        }
      }

      // Skill invocations — split custom vs built-in
      const skills = extractSkills(text);
      for (const s of skills) {
        const bucket = BUILTIN_COMMANDS.has(s) ? 'builtin_commands' : 'skills';
        if (!session[bucket].includes(s)) session[bucket].push(s);
      }

      // Tool results (errors)
      if (Array.isArray(rec.message.content)) {
        for (const block of rec.message.content) {
          if (block.type === 'tool_result' && block.is_error) {
            session.tool_errors++;
          }
        }
      }
    }

    // assistant messages
    if (rec.type === 'assistant' && rec.message) {
      session.assistant_turns++;

      // Model
      if (!session.model && rec.message.model) session.model = rec.message.model;

      // Token usage
      const u = rec.message.usage || {};
      session.tokens.input        += u.input_tokens                  || 0;
      session.tokens.cache_create += u.cache_creation_input_tokens   || 0;
      session.tokens.cache_read   += u.cache_read_input_tokens       || 0;
      session.tokens.output       += u.output_tokens                 || 0;

      // Stop reason
      if (rec.message.stop_reason) {
        const sr = rec.message.stop_reason;
        session.stop_reasons[sr] = (session.stop_reasons[sr] || 0) + 1;
      }

      // Content blocks
      for (const block of (rec.message.content || [])) {
        const bt = block.type || 'unknown';
        session.assistant_content_types[bt] = (session.assistant_content_types[bt] || 0) + 1;
        session.content_blocks[bt] = (session.content_blocks[bt] || 0) + 1;

        // Tool calls
        if (bt === 'tool_use') {
          session.tool_calls++;
          const name = block.name || 'unknown';

          if (!session.tools[name]) session.tools[name] = { calls: 0, errors: 0 };
          session.tools[name].calls++;

          // Track file paths for Read / Write / Edit
          const FILE_OP = { Read: 'read', Write: 'write', Edit: 'edit' };
          if (FILE_OP[name] && block.input?.file_path) {
            const fp = normPath(block.input.file_path);
            if (fp) {
              if (!session.file_ops[fp]) session.file_ops[fp] = { read: 0, write: 0, edit: 0 };
              session.file_ops[fp][FILE_OP[name]]++;
            }
          }

          // Categorise Bash commands
          if (name === 'Bash' && block.input?.command) {
            const cmd = block.input.command.trimStart();
            const cat = cmd.startsWith('git ')  ? 'git'
                      : cmd.startsWith('npm ')  ? 'npm'
                      : cmd.startsWith('npx ')  ? 'npx'
                      : cmd.startsWith('node ') ? 'node'
                      : cmd.startsWith('py ')   || cmd.startsWith('python') ? 'python'
                      : /^(ls|cat|head|tail|mkdir|rm |cp |mv )/.test(cmd) ? 'fs'
                      : cmd.startsWith('curl ')  ? 'curl'
                      : 'other';
            session.bash_categories[cat] = (session.bash_categories[cat] || 0) + 1;
          }
        }
      }
    }
  }

  // Match tool errors back to the last tool call (approximate — errors are on tool_result side)
  // We already counted tool_errors from tool_result is_error; attribute them globally
  // (can't easily match per-tool without pairing UUIDs)

  // Fallback slug for sessions missing a turn_duration record
  if (!session.slug) session.slug = session.session_id.slice(0, 8);

  return session;
}

// ── Project rollup ────────────────────────────────────────────────────────────

function buildProjectSummary(projectId, sessions) {
  const s = {
    id:            projectId,
    label:         PROJECT_LABELS[projectId] || projectId,
    session_count: sessions.length,
    tokens:        { input: 0, cache_create: 0, cache_read: 0, output: 0 },
    tool_calls:    0,
    tool_errors:   0,
    skills:          [],
    builtin_commands: [],
    models:          {},
    git_branches:  [],
    total_bytes:   0,
    duration_ms:   0,
  };

  for (const sess of sessions) {
    s.tokens.input        += sess.tokens.input;
    s.tokens.cache_create += sess.tokens.cache_create;
    s.tokens.cache_read   += sess.tokens.cache_read;
    s.tokens.output       += sess.tokens.output;
    s.tool_calls          += sess.tool_calls;
    s.tool_errors         += sess.tool_errors;
    s.total_bytes         += sess.file_size_bytes;
    if (sess.duration_ms) s.duration_ms += sess.duration_ms;

    for (const sk of sess.skills) {
      if (!s.skills.includes(sk)) s.skills.push(sk);
    }
    for (const cmd of (sess.builtin_commands || [])) {
      if (!s.builtin_commands.includes(cmd)) s.builtin_commands.push(cmd);
    }

    if (sess.model) s.models[sess.model] = (s.models[sess.model] || 0) + 1;

    if (sess.git_branch && !s.git_branches.includes(sess.git_branch))
      s.git_branches.push(sess.git_branch);
  }

  s.git_branches.sort();
  s.skills.sort();
  s.builtin_commands.sort();

  return s;
}

// ── Global rollup ─────────────────────────────────────────────────────────────

function buildGlobalRollup(sessions) {
  const tools  = {};
  const skills = {};
  const models = {};
  const tokens = { input: 0, cache_create: 0, cache_read: 0, output: 0 };
  let   errors = 0;

  for (const sess of sessions) {
    tokens.input        += sess.tokens.input;
    tokens.cache_create += sess.tokens.cache_create;
    tokens.cache_read   += sess.tokens.cache_read;
    tokens.output       += sess.tokens.output;
    errors              += sess.tool_errors;

    for (const [name, data] of Object.entries(sess.tools)) {
      if (!tools[name]) tools[name] = { calls: 0, errors: 0 };
      tools[name].calls += data.calls;
    }
    tools['__errors__'] = { calls: errors, errors: 0 }; // aggregate

    for (const sk of sess.skills) {
      skills[sk] = (skills[sk] || 0) + 1;
    }

    if (sess.model) models[sess.model] = (models[sess.model] || 0) + 1;
  }

  delete tools['__errors__']; // remove temp key

  // Sort tools by call count
  const sortedTools = Object.entries(tools)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([name, data]) => ({ name, ...data }));

  const sortedSkills = Object.entries(skills)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Global file aggregation
  const fileMap = {};
  for (const sess of sessions) {
    for (const [fp, ops] of Object.entries(sess.file_ops || {})) {
      if (!fileMap[fp]) fileMap[fp] = { path: fp, read: 0, write: 0, edit: 0, sessions: [] };
      fileMap[fp].read  += ops.read;
      fileMap[fp].write += ops.write;
      fileMap[fp].edit  += ops.edit;
      if (!fileMap[fp].sessions.includes(sess.session_id))
        fileMap[fp].sessions.push(sess.session_id);
    }
  }
  const sortedFiles = Object.values(fileMap)
    .sort((a, b) => (b.write + b.edit + b.read) - (a.write + a.edit + a.read));

  return { tools: sortedTools, skills: sortedSkills, models, tokens, total_errors: errors, files: sortedFiles };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('Scanning', PROJECTS_ROOT, '...');

  const allSessions = [];
  const projectDirs = fs.readdirSync(PROJECTS_ROOT)
    .filter(d => fs.statSync(path.join(PROJECTS_ROOT, d)).isDirectory())
    .sort();

  for (const projectId of projectDirs) {
    const pdir  = path.join(PROJECTS_ROOT, projectId);
    const files = fs.readdirSync(pdir)
      .filter(f => f.endsWith('.jsonl'))
      .sort();

    console.log(`  ${projectId}: ${files.length} sessions`);

    for (const file of files) {
      const filePath = path.join(pdir, file);
      try {
        const sess = analyzeSession(projectId, filePath);
        allSessions.push(sess);
      } catch (err) {
        console.error(`  !! Error processing ${file}:`, err.message);
      }
    }
  }

  // Sort sessions chronologically
  allSessions.sort((a, b) => {
    const ta = a.first_timestamp || '';
    const tb = b.first_timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  // Build project summaries (one per unique project)
  const projectMap = {};
  for (const sess of allSessions) {
    if (!projectMap[sess.project_id]) projectMap[sess.project_id] = [];
    projectMap[sess.project_id].push(sess);
  }

  const projects = Object.entries(projectMap)
    .sort(([a], [b]) => a < b ? -1 : 1)
    .map(([id, sessions]) => buildProjectSummary(id, sessions));

  // Global rollup
  const rollup = buildGlobalRollup(allSessions);

  // Compute derived per-session fields
  for (const sess of allSessions) {
    const t = sess.tokens;
    t.total = t.input + t.cache_create + t.cache_read + t.output;

    const inputSide = t.input + t.cache_create + t.cache_read;
    sess.cache_hit_rate = inputSide > 0
      ? +(t.cache_read / inputSide * 100).toFixed(1)
      : 0;

    sess.duration_min = sess.duration_ms != null
      ? +(sess.duration_ms / 60000).toFixed(1)
      : null;

    sess.tool_diversity = Object.keys(sess.tools).length;

    if (sess.first_timestamp) {
      const d = new Date(sess.first_timestamp);
      sess.day_of_week   = d.getUTCDay();     // 0=Sun … 6=Sat
      sess.hour_of_day   = d.getUTCHours();   // 0–23 UTC
      sess.date_str      = sess.first_timestamp.slice(0, 10);
    }
  }

  const output = {
    meta: {
      generated_at:   new Date().toISOString(),
      source_dir:     PROJECTS_ROOT,
      total_sessions: allSessions.length,
      total_projects: projects.length,
      date_range: {
        first: allSessions.find(s => s.first_timestamp)?.first_timestamp ?? null,
        last:  [...allSessions].reverse().find(s => s.last_timestamp)?.last_timestamp ?? null,
      },
    },
    projects,
    sessions: allSessions,
    rollup,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  // Print summary to console
  const t = rollup.tokens;
  const totalTokens = t.input + t.cache_create + t.cache_read + t.output;

  console.log('\n── Summary ──────────────────────────────────────────');
  console.log(`Sessions:       ${allSessions.length}`);
  console.log(`Projects:       ${projects.length}`);
  console.log(`Total tokens:   ${totalTokens.toLocaleString()}`);
  console.log(`  input:        ${t.input.toLocaleString()}`);
  console.log(`  cache_create: ${t.cache_create.toLocaleString()}`);
  console.log(`  cache_read:   ${t.cache_read.toLocaleString()}`);
  console.log(`  output:       ${t.output.toLocaleString()}`);
  console.log(`Tool errors:    ${rollup.total_errors}`);
  console.log('\nTop tools:');
  for (const tool of rollup.tools.slice(0, 10))
    console.log(`  ${tool.name.padEnd(25)} ${tool.calls} calls`);
  console.log('\nSkills invoked:');
  for (const sk of rollup.skills)
    console.log(`  /${sk.name.padEnd(24)} ${sk.count}x`);
  console.log(`\nOutput: ${OUT_FILE}`);
}

main();
