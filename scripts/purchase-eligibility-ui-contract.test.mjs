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

// Since f7dbfc91 the qualification lives in the bottom action instead of a separate policy-facts card.
test("Gen-2 detail disables the sticky buy CTA until the server decision is ready", () => {
  const page = read("src/pages/store/detail.vue");
  assert.match(page, /useRemotePurchaseEligibility/);
  const pending = page.slice(page.indexOf('if (remoteApiEnabled && (eligibility.value.status !== "ready" || purchaseEligibilityMessage.value === "error")) {'));
  assert.ok(pending.length > 0, "pending/failed eligibility must have its own bottom-action branch");
  assert.match(pending.slice(0, 600), /t\.value\.store\.purchaseEligibilityLoading[\s\S]{0,200}disabled: true,[\s\S]{0,80}return;/);
  const ineligible = page.slice(page.indexOf("if (remoteApiEnabled && !eligibility.value.eligible) {"));
  assert.match(ineligible.slice(0, 900), /purchaseEligibilityUnlockHref\(eligibility\.value\.snapshot!, product\.value\.id\)[\s\S]*purchaseEligibilityQuotaDepleted[\s\S]*disabled: quotaDepleted,[\s\S]{0,80}return;/);
  assert.doesNotMatch(ineligible.slice(0, 900), /pages\/store\/checkout/);
  assert.match(page, /toast\.error\(t\.value\.store\.purchaseEligibilityError\)/);
  assert.doesNotMatch(page, /\{\{ policy\.decisionCode \}\}/);
  assert.doesNotMatch(page, /\{\{ condition\.kind \}\}/);
  assert.match(read("src/lib/account-scope.ts"), /purchaseEligibilityStore\.clear/);
});
