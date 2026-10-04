import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = fs.readFileSync(path.join(root, "src/api/earnings-release-api.ts"), "utf8");
const withdraw = fs.readFileSync(path.join(root, "src/pages/me/wallet-withdraw.vue"), "utf8");
const releaseStore = fs.readFileSync(path.join(root, "src/store/earning-release.ts"), "utf8");
const accountScope = fs.readFileSync(path.join(root, "src/lib/account-scope.ts"), "utf8");
const completeSignIn = fs.readFileSync(path.join(root, "src/auth/complete-sign-in.ts"), "utf8");

test("K1 release status rejects a missing/non-boolean cluster restriction", () => {
  assert.match(api, /typeof row\.clusterRestricted !== "boolean"/);
  assert.match(api, /clusterRestricted: row\.clusterRestricted/);
});

test("K1 restricted cluster is visibly non-withdrawable before the server submit check", () => {
  assert.match(withdraw, /earningsReleaseSnapshot\.value\?\.clusterRestricted\) return 0/);
});

test("K1 release snapshot is cleared on account rebind, rejects stale callers, and drops stale responses", () => {
  assert.match(releaseStore, /export function bindEarningsReleaseAccount\(accountKey: string\)/);
  assert.match(releaseStore, /earningsReleaseSnapshot\.value = null/);
  assert.match(
    releaseStore,
    /if \(activeEarningsReleaseAccountKey !== requestedAccountKey\) \{\s*throw new Error\("EARNINGS_RELEASE_ACCOUNT_CHANGED"\);\s*\}/,
    "an obsolete account must be rejected before it can start a financial read",
  );
  assert.match(
    releaseStore,
    /if \(activeEarningsReleaseAccountKey !== requestedAccountKey\s*\|\|\s*!isCurrentRuntimeRevision\(runScope\)\s*\|\|\s*refreshSequence !== earningsReleaseRefreshSequence\) return status;/,
    "a response that becomes stale after dispatch must not replace the current account snapshot",
  );
  assert.match(accountScope, /bindEarningsReleaseAccount\(accountKey\)/);
});

test("K1 authoritative snapshot refreshes immediately after a successful sign-in", () => {
  assert.match(completeSignIn, /refreshEarningsReleaseStatus\(options\.identity\)/);
});
