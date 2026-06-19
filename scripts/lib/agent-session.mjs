/**
 * Agent Session Launcher - Spawns pi coding agent sessions
 * 
 * The orchestrator calls this to run agentic sessions with prompt templates.
 * The agent session runs until completion or maxTurns, then returns structured output.
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * @typedef {Object} AgentSessionConfig
 * @property {string} promptTemplate - Path to .md prompt template
 * @property {Record<string, any>} context - Context variables for template
 * @property {number} maxTurns - Maximum agent turns (informational, pi doesn't enforce)
 * @property {string[] | 'all'} allowedTools - Tool allowlist
 * @property {string} [workingDir] - Working directory
 * @property {string} [sessionId] - Custom session ID
 * @property {string} [provider] - LLM provider (e.g., 'google', 'anthropic', 'openai')
 * @property {string} [model] - Model ID (e.g., 'gemini-1.5-flash', 'claude-3.5-haiku', 'gpt-4o-mini')
 */

/**
 * @typedef {Object} AgentResult
 * @property {boolean} success
 * @property {string} output - Full transcript
 * @property {any} [structuredOutput] - Parsed JSON from agent completion
 * @property {number} turnsUsed
 * @property {string} [error]
 */

/**
 * Render prompt template with context variables
 * @param {string} templatePath
 * @param {Record<string, any>} context
 * @returns {string}
 */
function renderPrompt(templatePath, context) {
  let template = readFileSync(templatePath, 'utf-8');
  
  // Replace {{variable}} with JSON stringified context
  for (const [key, value] of Object.entries(context)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    template = template.replace(placeholder, JSON.stringify(value, null, 2));
  }
  
  return template;
}

/**
 * Parse structured JSON output from agent transcript
 * @param {string} transcript
 * @returns {any | null}
 */
function parseStructuredOutput(transcript) {
  // Look for ```json ... ``` block at the end
  const matches = transcript.match(/```json\n([\s\S]*?)\n```/g);
  if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const jsonStr = lastMatch.replace(/```json\n|```/g, '');
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn('⚠️ Failed to parse agent structured output:', e.message);
    }
  }
  return null;
}

/**
 * Run a pi agent session with the given prompt template and context
 * Uses pi's --print mode for non-interactive execution
 * @param {AgentSessionConfig} config
 * @returns {Promise<AgentResult>}
 */
export async function runAgentSession(config) {
  const {
    promptTemplate,
    context,
    maxTurns = 20,
    allowedTools = 'all',
    workingDir = process.cwd(),
    sessionId = `agent-${Date.now()}`,
    provider = 'nebius',
    model = 'nvidia/Nemotron-3-Ultra-550b-a55b'
  } = config;

  console.log(`🤖 Launching agent session: ${sessionId}`);
  console.log(`   Template: ${promptTemplate}`);
  console.log(`   Max turns (guidance): ${maxTurns}`);
  console.log(`   Tools: ${allowedTools === 'all' ? '*' : allowedTools.join(',')}`);
  console.log(`   Model: ${provider}/${model}`);
  console.log(`   Verbose: true`);

  // 1. Render prompt
  let prompt;
  try {
    prompt = renderPrompt(promptTemplate, context);
  } catch (e) {
    return { success: false, output: '', turnsUsed: 0, error: `Prompt render failed: ${e.message}` };
  }

  // 2. Write prompt to temp file
  const tmpDir = mkdtempSync(join(tmpdir(), 'agent-prompt-'));
  const promptFile = join(tmpDir, 'prompt.md');
  writeFileSync(promptFile, prompt);

  // 3. Build pi command - use --print for non-interactive, --mode json for JSON output
  const piArgs = [
    'run',
    '--print',                    // Non-interactive: process and exit
    '--mode', 'json',             // JSON output format
    '--session', sessionId,       // Session ID for tracking
    '--no-session',               // Don't save session (we manage checkpoints ourselves)
    '--provider', provider,
    '--model', model,
    '--verbose',                  // Verbose logging
  ];

  // Tools allowlist
  if (allowedTools !== 'all') {
    piArgs.push('--tools', allowedTools.join(','));
  }

  // Add prompt file as argument (using @file syntax or just pass content via stdin)
  // pi accepts @file to include file contents in the prompt
  piArgs.push('@' + promptFile);

  // 4. Spawn pi agent process
  console.log(`   Command: pi ${piArgs.join(' ')}`);
  console.log(`   Prompt file: ${promptFile}`);
  return new Promise((resolve) => {
    const child = spawn('pi', piArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workingDir,
      env: { 
        ...process.env, 
        PI_AGENT_MODE: 'autonomous',
        PI_SESSION_ID: sessionId
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { 
      stdout += data.toString(); 
      // Stream output for visibility
      process.stdout.write(data);
    });
    child.stderr.on('data', (data) => { 
      stderr += data.toString(); 
      process.stderr.write(data);
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      // Cleanup temp dir
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      resolve({ 
        success: false, 
        output: stdout + stderr, 
        turnsUsed: maxTurns, 
        error: 'timeout after 10 minutes' 
      });
    }, 10 * 60 * 1000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      // Cleanup temp dir
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      
      if (code !== 0) {
        resolve({ 
          success: false, 
          output: stdout + stderr, 
          turnsUsed: 1, // pi --print runs as single turn
          error: stderr || `exit code ${code}` 
        });
        return;
      }

      const structuredOutput = parseStructuredOutput(stdout);
      resolve({ 
        success: true, 
        output: stdout, 
        structuredOutput, 
        turnsUsed: 1 
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      resolve({ 
        success: false, 
        output: stdout + stderr, 
        turnsUsed: 0, 
        error: `spawn failed: ${err.message}` 
      });
    });
  });
}

/**
 * Run a simpler "single-shot" agent call for quick tasks
 * Uses pi with --print flag for non-interactive output
 * @param {Object} config
 * @returns {Promise<AgentResult>}
 */
export async function runAgentQuick(config) {
  const { promptTemplate, context, workingDir = process.cwd(), provider = 'nebius', model = 'nvidia/Nemotron-3-Ultra-550b-a55b' } = config;
  
  const prompt = renderPrompt(promptTemplate, context);
  const tmpDir = mkdtempSync(join(tmpdir(), 'agent-quick-'));
  const promptFile = join(tmpDir, 'prompt.md');
  writeFileSync(promptFile, prompt);

  return new Promise((resolve) => {
    const child = spawn('pi', [
      'run',
      '--print',
      '--mode', 'json',
      '--provider', provider,
      '--model', model,
      '--verbose',
      '@' + promptFile
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workingDir,
      env: { ...process.env, PI_AGENT_MODE: 'quick' }
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    child.on('close', (code) => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      if (code !== 0) {
        resolve({ success: false, output: stdout + stderr, turnsUsed: 1, error: stderr });
        return;
      }
      const structuredOutput = parseStructuredOutput(stdout);
      resolve({ success: true, output: stdout, structuredOutput, turnsUsed: 1 });
    });
  });
}