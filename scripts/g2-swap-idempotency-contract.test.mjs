import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("G2 App swap 使用账号隔离的持久 pending key、同键重放和权威 GET 对账", () => {
  const page = read("src/pages/me/wallet-exchange.vue");
  const pending = read("src/lib/exchange-pending-mutation.ts");

  assert.match(page, /executeExchangeSwap/);
  assert.match(page, /createExchangePendingMutationStore/);
  assert.match(page, /accountKey:\s*snap\.account/);
  assert.doesNotMatch(page, /G2-SWAP-[^\n]*Date\.now/);
  assert.match(pending, /nexgrid-exchange-pending-mutations-v1/);
  assert.match(pending, /accountKey/);
  assert.match(pending, /fingerprint/);
  assert.match(pending, /fetchState/);
  assert.match(pending, /pending\.forget/);
});
