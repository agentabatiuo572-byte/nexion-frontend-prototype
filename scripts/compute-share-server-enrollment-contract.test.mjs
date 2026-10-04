import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../src/pages/compute-share/download.vue", import.meta.url), "utf8");
const flow = fs.readFileSync(new URL("../src/pages/compute-share/enrollment-flow.ts", import.meta.url), "utf8");

test("remote compute share creates a server pairing enrollment instead of a local device", () => {
  assert.match(page, /computeShareApi\.create/);
  assert.match(page, /remoteApiEnabled/);
  assert.match(page, /status\s*===\s*["']CONNECTED["']/);
  assert.doesNotMatch(page, /if\s*\(remoteApiEnabled\)[\s\S]{0,500}connectComputeShareDevice/);
});

test("remote enrollment journals the original key and verifies the canonical enrollment before showing it", () => {
  assert.match(page, /runComputeShareEnrollmentFlow/);
  assert.match(flow, /options\.journal\.save\(options\.accountKey, intent\)/);
  assert.match(flow, /options\.journal\.attachEnrollmentNo\(options\.accountKey, receipt\.enrollmentNo\)/);
  assert.match(flow, /await options\.status\(receipt\.enrollmentNo\)/);
  assert.match(flow, /await options\.status\(intent\.enrollmentNo\)[\s\S]*?await options\.create\(intent\.requestedGpuModel, intent\.idempotencyKey\)/);
  assert.doesNotMatch(page, /localStorage/);
});

test("polling is bound to both account and page lifecycle generations", () => {
  assert.match(page, /let lifecycleGeneration = 0/);
  assert.match(page, /onUnmounted\(\(\) => \{\s*suspendRemoteWork\(\)/);
  assert.match(page, /function suspendRemoteWork\(\) \{\s*lifecycleGeneration \+= 1/);
  assert.match(page, /expectedLifecycle === lifecycleGeneration/);
  assert.match(page, /navReplace\("\/pages\/me\/devices"\)/);
});
