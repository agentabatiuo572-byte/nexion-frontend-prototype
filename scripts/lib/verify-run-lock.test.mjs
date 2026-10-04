import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { acquireVerifyRunLock, verifyRunLockPath } from "./verify-run-lock.mjs";

function tempRoot(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "verify-run-lock-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("active verify-chain owner excludes a second runner without changing owner metadata", (t) => {
  const root = tempRoot(t);
  const first = acquireVerifyRunLock(root, {
    pid: 41001,
    runId: "first-run",
    startedAt: "2026-09-02T00:00:00.000Z",
  });
  assert.equal(first.acquired, true);

  const before = readFileSync(verifyRunLockPath(root), "utf8");
  const second = acquireVerifyRunLock(root, {
    pid: 41002,
    runId: "second-run",
    isPidAlive: (pid) => pid === 41001,
  });

  assert.equal(second.acquired, false);
  assert.equal(second.reason, "active-owner");
  assert.equal(readFileSync(verifyRunLockPath(root), "utf8"), before);
  assert.equal(first.release(), true);
});

test("a dead verify-chain owner is reclaimed before a new runner starts", (t) => {
  const root = tempRoot(t);
  const lockPath = verifyRunLockPath(root);
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, JSON.stringify({ pid: 41003, runId: "crashed-run", startedAt: "2026-09-02T00:00:00.000Z" }));

  const recovered = acquireVerifyRunLock(root, {
    pid: 41004,
    runId: "recovered-run",
    isPidAlive: () => false,
  });

  assert.equal(recovered.acquired, true);
  assert.match(readFileSync(lockPath, "utf8"), /recovered-run/);
  assert.equal(recovered.release(), true);
});

test("a malformed lock fails closed rather than risking an active owner", (t) => {
  const root = tempRoot(t);
  const lockPath = verifyRunLockPath(root);
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, "not-json");

  const blocked = acquireVerifyRunLock(root, {
    pid: 41005,
    runId: "blocked-run",
  });

  assert.equal(blocked.acquired, false);
  assert.equal(blocked.reason, "unknown-owner");
});
