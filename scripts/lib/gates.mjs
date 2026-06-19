/**
 * Gate validation - runs validator and tests
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Run all quality gates
 * @param {Object} options
 * @param {string[]} [options.changedFiles] - Files to validate (default: all library/*.json)
 * @param {boolean} [options.fullRegression] - Validate all library entries
 * @returns {Promise<{passed: boolean, details: Object}>}
 */
export async function runGates(options = {}) {
  const { changedFiles, fullRegression = false } = options;
  
  const results = {
    validator: { passed: false, details: [] },
    tests: { passed: false, details: '' },
    overall: false
  };

  console.log('🚪 Running quality gates...');

  // 1. Validator gate
  console.log('  📋 Validator...');
  const validatorResult = await runValidator(changedFiles, fullRegression);
  results.validator = validatorResult;
  console.log(`  ${validatorResult.passed ? '✅' : '❌'} Validator: ${validatorResult.passed ? 'PASSED' : 'FAILED'}`);
  if (!validatorResult.passed) {
    validatorResult.details.forEach(d => console.log(`     - ${d}`));
  }

  // 2. Test suite gate
  console.log('  🧪 Test suite...');
  const testResult = await runTests();
  results.tests = testResult;
  console.log(`  ${testResult.passed ? '✅' : '❌'} Tests: ${testResult.passed ? 'PASSED' : 'FAILED'}`);
  if (!testResult.passed) {
    console.log(`     ${testResult.details}`);
  }

  // 3. Overall
  results.overall = results.validator.passed && results.tests.passed;
  console.log(`  ${results.overall ? '✅' : '❌'} Overall: ${results.overall ? 'ALL GATES PASSED' : 'GATES FAILED'}`);

  return results;
}

/**
 * Run Python validator on library files
 */
async function runValidator(changedFiles, fullRegression) {
  const filesToCheck = fullRegression 
    ? getAllLibraryFiles() 
    : (changedFiles || getAllLibraryFiles());

  const details = [];
  let allPassed = true;

  for (const file of filesToCheck) {
    const result = await runValidatorOnFile(file);
    if (!result.passed) {
      allPassed = false;
      details.push(`${file}: ${result.error}`);
      if (result.warnings.length) {
        details.push(`  Warnings: ${result.warnings.join(', ')}`);
      }
    }
  }

  return { passed: allPassed, details };
}

function getAllLibraryFiles() {
  const { readdirSync } = fs;
  const { resolve } = path;
  const libraryDir = resolve(process.cwd(), 'library');
  
  try {
    return readdirSync(libraryDir)
      .filter(f => f.endsWith('.json') && !f.includes('-retrospective'))
      .map(f => `library/${f}`);
  } catch {
    return [];
  }
}

function runValidatorOnFile(filePath) {
  return new Promise((resolve) => {
    const child = spawn('python3', ['.claude/hooks/validate-library-json.py', filePath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    child.on('close', (code) => {
      // Exit codes: 0=valid, 1=warnings, 2=cross-ref errors
      const passed = code === 0;
      const warnings = stdout.match(/⚠.*?warning.*?:/gi) || [];
      const error = code === 2 ? 'Cross-reference errors (exit 2)' : (code === 1 ? 'Warnings (exit 1)' : stderr);
      resolve({ passed, exitCode: code, error, warnings, output: stdout });
    });
  });
}

/**
 * Run pnpm test
 */
async function runTests() {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['test', '--run', '--reporter=json'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    child.on('close', (code) => {
      let passed = code === 0;
      let details = '';

      try {
        const testResult = JSON.parse(stdout);
        passed = testResult.numFailedTests === 0;
        details = `${testResult.numPassedTests} passed, ${testResult.numFailedTests} failed`;
      } catch {
        details = stdout || stderr || `exit code ${code}`;
      }

      resolve({ passed, details, exitCode: code, rawOutput: stdout });
    });
  });
}