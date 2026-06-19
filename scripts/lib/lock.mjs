/**
 * Lock file utilities for preventing concurrent runs
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Acquire a lock file. Returns lock object if successful, null if already locked.
 * @param {string} lockPath - Path to lock file (relative to project root)
 * @param {string} ownerId - Unique identifier for this run
 * @returns {Promise<{lockPath: string, ownerId: string, acquiredAt: string} | null>}
 */
export async function acquireLock(lockPath, ownerId) {
  const fullPath = resolve(process.cwd(), lockPath);
  
  if (existsSync(fullPath)) {
    const existing = JSON.parse(readFileSync(fullPath, 'utf-8'));
    console.log(`🔒 Lock held by ${existing.ownerId} since ${existing.acquiredAt}`);
    return null;
  }
  
  const lock = {
    lockPath,
    ownerId,
    acquiredAt: new Date().toISOString(),
    pid: process.pid
  };
  
  writeFileSync(fullPath, JSON.stringify(lock, null, 2));
  console.log(`✅ Lock acquired: ${lockPath} by ${ownerId}`);
  return lock;
}

/**
 * Release a lock file. Only releases if owned by this process.
 * @param {{lockPath: string, ownerId: string}} lock - Lock object from acquireLock
 * @returns {Promise<boolean>} - True if released, false if not owned
 */
export async function releaseLock(lock) {
  if (!lock) return false;
  
  const fullPath = resolve(process.cwd(), lock.lockPath);
  
  if (!existsSync(fullPath)) return true;
  
  const existing = JSON.parse(readFileSync(fullPath, 'utf-8'));
  if (existing.ownerId !== lock.ownerId) {
    console.warn(`⚠️ Lock owned by ${existing.ownerId}, not releasing`);
    return false;
  }
  
  unlinkSync(fullPath);
  console.log(`🔓 Lock released: ${lock.lockPath}`);
  return true;
}

/**
 * Force release a lock (for cleanup/recovery)
 * @param {string} lockPath 
 * @returns {Promise<void>}
 */
export async function forceReleaseLock(lockPath) {
  const fullPath = resolve(process.cwd(), lockPath);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
    console.log(`🔓 Force released: ${lockPath}`);
  }
}