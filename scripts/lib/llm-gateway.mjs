/**
 * LLM Gateway — Agent Harness Interface
 * 
 * Manages LLM invocations with model tiers, timeouts, retries, and fallbacks.
 * Emits kaaroSessions events for full observability.
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, mkdtempSync, rmSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export const MODEL_TIERS = {
  fast: [
    { provider: 'google', model: 'gemini-1.5-flash', timeout: 90000, maxTokens: 8192, costTier: 'low' },
    { provider: 'anthropic', model: 'claude-3.5-haiku', timeout: 120000, maxTokens: 8192, costTier: 'low' },
  ],
  smart: [
    { provider: 'nebius', model: 'nvidia/Nemotron-3-Ultra-550b-a55b', timeout: 300000, maxTokens: 32768, costTier: 'medium' },
    { provider: 'anthropic', model: 'claude-3.5-sonnet', timeout: 300000, maxTokens: 8192, costTier: 'medium' },
  ],
  reasoning: [
    { provider: 'openai', model: 'o1-preview', timeout: 600000, maxTokens: 32768, costTier: 'high' },
    { provider: 'nebius', model: 'nvidia/Nemotron-3-Ultra-550b-a55b', timeout: 600000, maxTokens: 32768, costTier: 'medium' },
  ]
};

export const TASK_MODEL_MAP = {
  SELECT: 'fast',
  CURATE_SOURCE: 'fast',
  MONITOR: 'fast',
  IMPROVE_PIPELINE: 'smart',
  OPTIMIZE_COMPUTE: 'smart',
  SYNTHESIZE: 'smart',
  DETECT_ONTOLOGY_GAPS: 'reasoning',
  INNOVATE: 'reasoning',
  DREAM_LOOP_ANALYZE: 'reasoning',
  DREAM_LOOP_PROPOSE: 'reasoning',
  DREAM_LOOP_APPLY: 'smart',
};

const EVENT_LOG = 'library/handoffs/orchestration-events.jsonl';

/**
 * Render prompt template with context variables
 */
function renderPrompt(templatePath, context) {
  let template = readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(context)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    template = template.replace(placeholder, JSON.stringify(value, null, 2));
  }
  return template;
}

/**
 * Parse structured JSON output from agent transcript
 */
function parseStructuredOutput(transcript) {
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
 * Emit orchestration event to JSONL log (for kaaroSessions)
 */
function emitEvent(event) {
  const line = JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n';
  try {
    appendFileSync(EVENT_LOG, line);
  } catch (e) {
    console.warn('⚠️ Failed to write event log:', e.message);
  }
}

/**
 * Main gateway invocation with model fallback chain
 */
export async function invokeLLM(config) {
  const {
    taskType,
    promptTemplate,
    context,
    maxTurns = 20,
    allowedTools = 'all',
    workingDir = process.cwd(),
    sessionId = `agent-${taskType.toLowerCase()}-${Date.now().toString(36)}`,
    runId = sessionId,
    customModelTier = null
  } = config;

  const modelTier = customModelTier || TASK_MODEL_MAP[taskType] || 'smart';
  const models = MODEL_TIERS[modelTier];
  
  if (!models || models.length === 0) {
    throw new Error(`No models configured for tier: ${modelTier}`);
  }

  // Render prompt once
  let prompt;
  try {
    prompt = renderPrompt(promptTemplate, context);
  } catch (e) {
    throw new Error(`Prompt render failed: ${e.message}`);
  }

  const promptHash = hashString(prompt).slice(0, 16);
  const startTime = Date.now();

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    const attemptId = `${runId}-${model.provider}-${model.model.replace(/[^a-z0-9]/gi, '-')}-attempt${attempt + 1}`;
    
    console.log(`🤖 LLM Gateway: ${taskType} → ${model.provider}/${model.model} (attempt ${attempt + 1}/${models.length})`);
    
    const attemptStart = Date.now();
    
    try {
      const result = await invokeWithModel({
        model,
        prompt,
        promptTemplate,
        promptHash,
        taskType,
        allowedTools,
        workingDir,
        sessionId: attemptId,
        maxTurns,
        timeout: model.timeout
      });

      const duration = Date.now() - attemptStart;
      const totalDuration = Date.now() - startTime;

      // Emit success event
      emitEvent({
        event: 'llm_invocation',
        runId,
        taskType,
        model: `${model.provider}/${model.model}`,
        attempt: attempt + 1,
        duration,
        totalDuration,
        success: result.success,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        promptHash,
        contextKeys: Object.keys(context),
        error: result.error
      });

      if (result.success) {
        console.log(`✅ LLM success: ${model.provider}/${model.model} (${duration}ms)`);
        return result;
      }

      // Log failure, continue to next model
      console.warn(`⚠️ ${model.provider}/${model.model} failed: ${result.error}`);

    } catch (e) {
      const duration = Date.now() - attemptStart;
      emitEvent({
        event: 'llm_invocation',
        runId,
        taskType,
        model: `${model.provider}/${model.model}`,
        attempt: attempt + 1,
        duration,
        success: false,
        error: e.message
      });
      console.error(`💥 ${model.provider}/${model.model} error: ${e.message}`);
    }
  }

  // All models failed
  const totalDuration = Date.now() - startTime;
  emitEvent({
    event: 'llm_invocation',
    runId,
    taskType,
    model: 'ALL_FAILED',
    attempt: models.length,
    duration: totalDuration,
    success: false,
    error: `All ${models.length} models in tier '${modelTier}' failed`
  });
  
  throw new Error(`All ${models.length} models in tier '${modelTier}' failed for ${taskType}`);
}

/**
 * Invoke a single model via pi
 */
async function invokeWithModel({ model, prompt, promptTemplate, promptHash, taskType, allowedTools, workingDir, sessionId, maxTurns, timeout }) {
  return new Promise((resolve) => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'agent-prompt-'));
    const promptFile = join(tmpDir, 'prompt.md');
    writeFileSync(promptFile, prompt);

    const piArgs = [
      'run',
      '--print',
      '--mode', 'json',
      '--session', sessionId,
      '--no-session',
      '--provider', model.provider,
      '--model', model.model,
      '--verbose',
    ];

    if (allowedTools !== 'all') {
      piArgs.push('--tools', allowedTools.join(','));
    }
    piArgs.push('@' + promptFile);

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
    let tokensInput = 0;
    let tokensOutput = 0;

    child.stdout.on('data', (data) => { 
      stdout += data.toString(); 
      process.stdout.write(data);
    });
    child.stderr.on('data', (data) => { 
      stderr += data.toString(); 
      process.stderr.write(data);
      
      // Try to extract token usage from pi stderr
      const tokenMatch = data.toString().match(/tokens[:\s]+(\d+)[\s,]+(\d+)/i);
      if (tokenMatch) {
        tokensInput = parseInt(tokenMatch[1]);
        tokensOutput = parseInt(tokenMatch[2]);
      }
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      cleanup();
      resolve({ 
        success: false, 
        output: stdout + stderr, 
        structuredOutput: null,
        tokensInput,
        tokensOutput,
        error: `timeout after ${timeout}ms` 
      });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      cleanup();
      
      if (code !== 0) {
        resolve({ 
          success: false, 
          output: stdout + stderr, 
          structuredOutput: null,
          tokensInput,
          tokensOutput,
          error: stderr || `exit code ${code}` 
        });
        return;
      }

      const structuredOutput = parseStructuredOutput(stdout);
      
      // Estimate tokens if not captured
      if (tokensInput === 0) {
        tokensInput = estimateTokens(prompt);
      }
      if (tokensOutput === 0) {
        tokensOutput = estimateTokens(stdout);
      }

      resolve({ 
        success: true, 
        output: stdout, 
        structuredOutput,
        tokensInput,
        tokensOutput,
        error: null
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      resolve({ 
        success: false, 
        output: '', 
        structuredOutput: null,
        tokensInput,
        tokensOutput,
        error: `spawn failed: ${err.message}` 
      });
    });

    function cleanup() {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    }
  });
}

function estimateTokens(text) {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Quick single-shot invocation (for simple tasks)
 */
export async function quickInvoke(config) {
  return invokeLLM({
    ...config,
    maxTurns: 1,
    allowedTools: config.allowedTools || ['read']
  });
}

/**
 * Get model info for a task type
 */
export function getModelForTask(taskType) {
  const tier = TASK_MODEL_MAP[taskType] || 'smart';
  return {
    tier,
    models: MODEL_TIERS[tier].map(m => `${m.provider}/${m.model}`),
    timeout: Math.max(...MODEL_TIERS[tier].map(m => m.timeout))
  };
}

export default { invokeLLM, quickInvoke, getModelForTask, MODEL_TIERS, TASK_MODEL_MAP };