import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("only a run-fenced Sandbox account projection may overlay its isolated supply", () => {
  const source = fs.readFileSync(path.join(root, "src/store/genesis.ts"), "utf8");
  const start = source.indexOf("function applyAccountState(");
  const end = source.indexOf("function applyCommittedPurchaseReceipt(", start);
  assert.ok(start >= 0 && end > start, "applyAccountState boundary is unavailable");
  const accountProjection = source.slice(start, end);
  assert.doesNotMatch(accountProjection, /\b(?:totalSlots|soldSlots)\.value\s*=/);
  assert.doesNotMatch(accountProjection, /\b(?:nexListed|remoteHalted)\.value\s*=/);
  assert.doesNotMatch(accountProjection, /sourceEnvironment\s*===\s*"PRODUCTION"/);
  assert.match(source, /function applyCommittedPurchaseReceipt[\s\S]*totalSlots\.value = state\.series\.totalSupply;[\s\S]*soldSlots\.value = state\.series\.soldSupply;/);
});

test("eligibility projection cannot overwrite the public Genesis halt state", () => {
  const source = fs.readFileSync(path.join(root, "src/store/genesis.ts"), "utf8");
  const start = source.indexOf("async function syncRemote(");
  const end = source.indexOf("function persist()", start);
  assert.ok(start >= 0 && end > start, "syncRemote boundary is unavailable");
  const syncProjection = source.slice(start, end);
  const eligibilityStart = syncProjection.indexOf("applyEligibility:");
  const eligibilityEnd = syncProjection.indexOf("},", eligibilityStart);
  assert.ok(eligibilityStart >= 0 && eligibilityEnd > eligibilityStart, "eligibility projection is unavailable");
  assert.doesNotMatch(syncProjection.slice(eligibilityStart, eligibilityEnd), /remoteHalted\.value\s*=/);
  assert.doesNotMatch(syncProjection, /remoteEligibility\.value\?\.halted/);
});

test("standard H5 development startup stays on the canonical Genesis rail", () => {
  const runtime = fs.readFileSync(path.join(root, "src/api/runtime.ts"), "utf8");
  const launcher = fs.readFileSync(path.join(root, "scripts/start-dev-h5.ps1"), "utf8");
  assert.doesNotMatch(runtime, /expectedGenesisSandboxRunId/);
  assert.match(runtime, /createGenesisApi\(apiClient, expectedApiEnvironment\)/);
  assert.doesNotMatch(launcher, /VITE_NEXGRID_ACCEPTANCE_RUN_ID/);
  assert.doesNotMatch(launcher, /nexion-local-dev/);
});
