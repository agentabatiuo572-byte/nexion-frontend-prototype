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

test("remote checkout refreshes server Gen-2 eligibility before any order command", () => {
  const page = read("src/pages/store/checkout.vue");
  const submit = slice(page, "async function submitRemoteOrder()", "function stopRemoteOrderPolling()");
  const eligibility = submit.indexOf("await refreshPurchaseEligibility()");
  const order = submit.indexOf("orderApi.");
  assert.ok(eligibility >= 0, "submit must refresh server eligibility");
  assert.ok(order < 0 || eligibility < order, "eligibility must precede the first order side effect");
  assert.match(page, /remoteApiEnabled\s*\?\s*remotePurchaseEligibility\.value\?\.eligible !== true/);
});

test("withdrawal abandon receives a server verdict before the local attempt is retired", () => {
  const page = read("src/pages/me/wallet-withdraw.vue");
  const abandon = slice(page, "async function abandonPendingAttempt()", "const sandboxWithdrawalPolicy");
  const request = abandon.indexOf("await withdrawalApi.abandonAttempt");
  const retire = abandon.indexOf("forgetWithdrawAttempt", request);
  assert.ok(request >= 0 && retire > request, "production attempt must be retired only after server readback");
  assert.match(abandon, /result\.state === "COMMITTED"/);
  assert.match(abandon, /remoteApiEnabled && !fundsSandboxEnabled/);
});
