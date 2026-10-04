import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LOCK_NAME = "verify-chain.lock";

export function verifyRunLockPath(root) {
  return path.join(root, ".verify-cache", LOCK_NAME);
}

function readOwner(lockPath) {
  try {
    const owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    return Number.isInteger(owner?.pid) && owner.pid > 0 && typeof owner.runId === "string" ? owner : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

// A hard link is an atomic "create if absent" operation. The candidate already
// contains complete owner metadata before the shared lock pathname appears, so
// another runner can never observe an initializing/metadata-less live lock.
function createLockAtomically(cacheDir, lockPath, owner) {
  const candidate = path.join(cacheDir, `${LOCK_NAME}.candidate-${owner.runId}`);
  fs.writeFileSync(candidate, JSON.stringify(owner, null, 2), { flag: "wx" });
  try {
    fs.linkSync(candidate, lockPath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    fs.rmSync(candidate, { force: true });
  }
}

// Move the known-dead owner's lock out of the contested pathname before
// deleting it. Only one recovery contender can win the rename; others retry.
function reclaimDeadLock(lockPath, runId) {
  const stalePath = `${lockPath}.stale-${runId}`;
  try {
    fs.renameSync(lockPath, stalePath);
    fs.rmSync(stalePath, { force: true });
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EEXIST" || error?.code === "EPERM") return false;
    throw error;
  }
}

/**
 * Acquire the process-wide verify-chain mutex. The lock lives beside the
 * historical artifacts, leaving existing npm commands and artifact readers
 * unchanged. A second runner exits before it can truncate shared status/logs.
 */
export function acquireVerifyRunLock(root, options = {}) {
  const pid = options.pid ?? process.pid;
  const runId = options.runId ?? randomUUID();
  const startedAt = options.startedAt ?? new Date().toISOString();
  const isPidAlive = options.isPidAlive ?? processIsAlive;
  const cacheDir = path.join(root, ".verify-cache");
  const lockPath = verifyRunLockPath(root);
  const owner = { pid, runId, startedAt };
  fs.mkdirSync(cacheDir, { recursive: true });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (createLockAtomically(cacheDir, lockPath, owner)) {
      let released = false;
      return {
        acquired: true,
        lockPath,
        owner,
        release() {
          if (released) return false;
          released = true;
          const current = readOwner(lockPath);
          if (!current || current.runId !== runId) return false;
          fs.rmSync(lockPath, { force: true });
          return true;
        },
      };
    }

    const existing = readOwner(lockPath);
    if (!existing) return { acquired: false, lockPath, owner: null, reason: "unknown-owner" };
    if (isPidAlive(existing.pid)) return { acquired: false, lockPath, owner: existing, reason: "active-owner" };
    if (!reclaimDeadLock(lockPath, runId)) continue;
  }

  return { acquired: false, lockPath, owner: readOwner(lockPath), reason: "contended-recovery" };
}
