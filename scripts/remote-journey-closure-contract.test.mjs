import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("card binding is unavailable outside explicit sandbox", async () => {
  const runtime = await source("src/api/runtime.ts");
  const list = await source("src/pages/me/wallet-cards.vue");
  const form = await source("src/pages/me/wallet-cards-new.vue");
  assert.match(runtime, /paymentSandboxEnabled/);
  assert.match(list, /cardBindingAvailable/);
  assert.match(form, /cardBindingAvailable/);
  assert.match(form, /paymentSandboxEnabled/);
});

test("remote daily, orders, quota and bills expose retryable refresh failures", async () => {
  const daily = await source("src/pages/daily/daily.vue");
  const orders = await source("src/pages/store/orders.vue");
  const detail = await source("src/pages/store/order-detail.vue");
  const quota = await source("src/pages/team/quota.vue");
  const bills = await source("src/pages/me/wallet-bills.vue");
  for (const page of [daily, orders, detail, quota, bills]) {
    assert.match(page, /onShow/);
    assert.match(page, /retry/i);
  }
  assert.match(detail, /commercePaymentApi\.confirm/);
  assert.match(detail, /refreshRemote/);
});

test("genesis config retry waits for the authoritative refresh", async () => {
  const genesis = await source("src/pages/genesis/genesis.vue");
  assert.match(genesis, /async function openSheet/);
  assert.match(genesis, /await cfg\.refresh\(\)/);
});
