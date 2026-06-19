/**
 * Checkpoint utilities for resume capability
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { resolve as pathResolve } from 'path';

const DEFAULT_CHECKPOINT = '.alone-time-checkpoint.json';

/**
 * Save checkpoint state
 * @param {Object} state - Checkpoint state object
 * @param {string} [checkpointPath] - Custom checkpoint path
 */
export async function saveCheckpoint(state, checkpointPath = DEFAULT_CHECKPOINT) {
  const fullPath = pathResolve(process.cwd(), checkpointPath);
  const data = {
    ...state,
    lastUpdated: new Date().toISOString()
  };
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
  console.log(`💾 Checkpoint saved: ${checkpointPath} (phase: ${state.phase})`);
}

/**
 * Load checkpoint state
 * @param {string} [checkpointPath] - Custom checkpoint path
 * @returns {Promise<Object | null>} - Checkpoint state or null if not found
 */
export async function loadCheckpoint(checkpointPath = DEFAULT_CHECKPOINT) {
  const fullPath = pathResolve(process.cwd(), checkpointPath);
  
  if (!existsSync(fullPath)) {
    console.log(`📭 No checkpoint found at ${checkpointPath}`);
    return null;
  }
  
  const data = JSON.parse(readFileSync(fullPath, 'utf-8'));
  console.log(`📂 Checkpoint loaded: ${checkpointPath} (phase: ${data.phase}, updated: ${data.lastUpdated})`);
  return data;
}

/**
 * Clear checkpoint file
 * @param {string} [checkpointPath] - Custom checkpoint path
 */
export async function clearCheckpoint(checkpointPath = DEFAULT_CHECKPOINT) {
  const fullPath = pathResolve(process.cwd(), checkpointPath);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
    console.log(`🗑️ Checkpoint cleared: ${checkpointPath}`);
  }
}

/**
 * Check if checkpoint exists
 * @param {string} [checkpointPath]
 * @returns {Promise<boolean>}
 */
export async function hasCheckpoint(checkpointPath = DEFAULT_CHECKPOINT) {
  const fullPath = pathResolve(process.cwd(), checkpointPath);
  return existsSync(fullPath);
}