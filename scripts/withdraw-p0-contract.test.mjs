import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), "utf8");

test("withdrawal parser accepts backend strong-review route as manual", () => {
  const source = read("src/api/withdrawal-api.ts");
  assert.match(source, /case\s+"strong-review"\s*:\s*return\s+"manual"/);
});

test("remote withdrawal refresh is account-generation safe and does not query production for sandbox", () => {
  const source = read("src/store/app.ts");
  assert.match(source, /if\s*\(!remoteApiEnabled\s*\|\|\s*fundsSandboxEnabled\)/);
  assert.match(source, /const\s+expectedAccountKey\s*=\s*accountKey\.value/);
  assert.match(source, /expectedAccountKey\s*!==\s*accountKey\.value/);
  assert.match(source, /nexRefundedChanged|remote\.nexRefunded/);
});

test("address policy is server-projected instead of a local zero fallback", () => {
  const api = read("src/api/payout-address-api.ts");
  const page = read("src/pages/me/wallet-address-rebind.vue");
  assert.match(api, /changeCooldownDays/);
  assert.match(page, /payout\.[A-Za-z]*changeCooldownDays|nextChangeAllowedAt/);
  assert.doesNotMatch(page, /remote[A-Za-z]*\s*\?\?\s*0/);
});

test("risk disclosure and withdrawal pages consume the remote policy contract", () => {
  const disclosure = read("src/pages/me/risk-disclosure.vue");
  const withdraw = read("src/pages/me/wallet-withdraw.vue");
  assert.match(disclosure, /withdrawalApi\.policy\(\)/);
  assert.match(withdraw, /withdrawalApi\.policy\(\)/);
  assert.match(withdraw, /smallAmountThresholdUsd/);
});
