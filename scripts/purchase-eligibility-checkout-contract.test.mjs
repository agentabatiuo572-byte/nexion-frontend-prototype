import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

function slice(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source slice: ${start}`);
  return source.slice(from, to);
}

test("checkout maps remote denial/error copy from server eligibility state only", () => {
  const page = read("src/pages/store/checkout.vue");
  assert.match(page, /resolvePurchaseEligibilityMessage/);
  assert.match(page, /remotePurchaseEligibilityStatus\.value = "error"/);
  assert.match(page, /function remotePurchaseEligibilityFailureCopy\(\)/);

  const onLoadGate = slice(page, "const eligibility = trialConversion ? \"eligible\" : await refreshPurchaseEligibility(routeScope);", "// Resuming a local pending invoice");
  assert.match(onLoadGate, /eligibility === \"stale\"/);
  assert.match(onLoadGate, /purchaseEligibilityFailureCopy\(\)/);
  assert.match(onLoadGate, /quotaDepleted/);
  assert.match(onLoadGate, /pages\/store\/detail/);
  assert.doesNotMatch(onLoadGate, /purchaseGate\.value\.soldOut/);

  const submitGate = slice(page, "async function submitRemoteOrder()", "let canonicalOrderCommitted");
  assert.match(submitGate, /refreshPurchaseEligibility\(submissionScope\)/);
  assert.match(submitGate, /eligibility === \"ineligible\"/);
  assert.match(submitGate, /purchaseEligibilityFailureCopy\(\)/);
  assert.doesNotMatch(submitGate, /purchaseGate\.value\.soldOut/);
});
