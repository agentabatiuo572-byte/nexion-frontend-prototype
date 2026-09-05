import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("Gen-2 product card uses remote eligibility as the only remote unlock", () => {
  const page = read("src/components/store/product-card.vue");
  assert.match(page, /useRemotePurchaseEligibility/);
  assert.match(page, /status === "ready" && eligibility\.value\.eligible/);
  assert.match(page, /status === "error"\) void retryEligibility\(\)/);
  assert.match(page, /remoteApiEnabled \? null : usePurchaseGate/);
});

test("Gen-2 detail hides the sticky buy CTA until the server decision is ready", () => {
  const page = read("src/pages/store/detail.vue");
  assert.match(page, /useRemotePurchaseEligibility/);
  assert.match(page, /remoteApiEnabled && eligibility\.value\.status !== "ready"/);
  assert.match(page, /remoteApiEnabled && !eligibility\.value\.eligible/);
  assert.match(read("src/lib/account-scope.ts"), /purchaseEligibilityStore\.clear/);
});
