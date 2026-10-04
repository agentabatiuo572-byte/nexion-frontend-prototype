import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
async function load(relative) {
  const out = await build({ entryPoints: [path.join(root, relative)], bundle: true, write: false, format: "esm", platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}
function memoryStorage() {
  let value;
  return { read: () => value, write: next => { value = structuredClone(next); } };
}
const intent = { direction: "USDT_TO_NEX", fromAmount: 10, queueIfCapped: true };
const baseline = { orders: [] };
const committed = { orders: [{ exchangeNo: "EX-COMMITTED-0001", fromAsset: "USDT", toAsset: "NEX",
  fromAmount: 10, toAmount: 100, rate: 0.1, status: "COMPLETED" }] };

test("服务端已提交但响应丢失时，以原键 GET 收据及当前快照恢复并清除 pending key", async () => {
  const mod = await load("src/lib/exchange-pending-mutation.ts");
  const pending = mod.createExchangePendingMutationStore(memoryStorage(), () => "key-1");
  const usedKeys = [], recoveryKeys = [];
  const result = await mod.executeExchangeSwap({
    pending, accountKey: "account-a", intent, baseline, isCurrent: () => true,
    swap: async key => { usedKeys.push(key); throw new mod.ExchangeOutcomeUnknownError(); },
    recover: async lease => { recoveryKeys.push(lease.key); return { status: "SUCCEEDED", order: committed.orders[0] }; },
    fetchState: async () => committed,
  });
  assert.equal(result.recovered, true);
  assert.equal(result.order.exchangeNo, "EX-COMMITTED-0001");
  assert.deepEqual(usedKeys, ["key-1"]);
  assert.deepEqual(recoveryKeys, ["key-1"]);
  assert.equal(pending.peek("account-a", intent), null);
});

test("响应与首次回读都丢失后，刷新页面只读原 key 收据，不再次 POST", async () => {
  const mod = await load("src/lib/exchange-pending-mutation.ts");
  const storage = memoryStorage();
  const firstPage = mod.createExchangePendingMutationStore(storage, () => "stable-key");
  const firstKeys = [], recoveryKeys = [];
  await assert.rejects(mod.executeExchangeSwap({
    pending: firstPage, accountKey: "account-a", intent, baseline, isCurrent: () => true,
    swap: async key => { firstKeys.push(key); throw new mod.ExchangeOutcomeUnknownError(); },
    recover: async lease => { recoveryKeys.push(lease.key); throw new Error("GET_LOST"); },
    fetchState: async () => { throw new Error("STATE_MUST_NOT_RUN_WITHOUT_RECEIPT"); },
  }), error => error instanceof mod.ExchangeOutcomeUnknownError);
  assert.equal(firstPage.peek("account-a", intent)?.key, "stable-key");
  const refreshedPage = mod.createExchangePendingMutationStore(storage, () => { throw new Error("MUST_NOT_CREATE_NEW_KEY"); });
  let retriedPosts = 0;
  const result = await mod.executeExchangeSwap({
    pending: refreshedPage, accountKey: "account-a", intent, baseline: committed, isCurrent: () => true,
    swap: async () => { retriedPosts++; throw new Error("MUST_NOT_REPEAT_POST"); },
    recover: async lease => { recoveryKeys.push(lease.key); return { status: "SUCCEEDED", order: committed.orders[0] }; },
    // The exact original order may have moved beyond the first history page.
    fetchState: async () => baseline,
  });
  assert.deepEqual(firstKeys, ["stable-key"]);
  assert.deepEqual(recoveryKeys, ["stable-key", "stable-key"]);
  assert.equal(retriedPosts, 0);
  assert.equal(result.recovered, true);
  assert.equal(result.order.exchangeNo, "EX-COMMITTED-0001");
  assert.deepEqual(result.snapshot.orders, []);
  assert.equal(refreshedPage.peek("account-a", intent), null);
});

test("pending mutation 按账号隔离，同输入换号不继承 key", async () => {
  const mod = await load("src/lib/exchange-pending-mutation.ts");
  const storage = memoryStorage();
  let sequence = 0;
  const firstPage = mod.createExchangePendingMutationStore(storage, () => `key-${++sequence}`);
  const accountA = firstPage.acquire("account-a", intent, []);
  const accountB = firstPage.acquire("account-b", intent, []);
  const refreshedPage = mod.createExchangePendingMutationStore(storage, () => `key-${++sequence}`);
  assert.notEqual(accountA.key, accountB.key);
  assert.equal(refreshedPage.acquire("account-a", intent, committed.orders).key, accountA.key);
  assert.equal(refreshedPage.acquire("account-b", intent, committed.orders).key, accountB.key);
});

test("请求途中换号保留原账号 key，重新登录后只回读原请求且保留另一账号记录", async () => {
  const mod = await load("src/lib/exchange-pending-mutation.ts");
  const storage = memoryStorage();
  let sequence = 0, current = true, staleRecoveryCalls = 0;
  const page = mod.createExchangePendingMutationStore(storage, () => `switch-key-${++sequence}`);
  await assert.rejects(mod.executeExchangeSwap({
    pending: page, accountKey: "account-a", intent, baseline, isCurrent: () => current,
    swap: async () => { current = false; throw new Error("SESSION_CHANGED_DURING_REQUEST"); },
    recover: async () => { staleRecoveryCalls++; throw new Error("ACCOUNT_A_NOT_ACTIVE"); },
    fetchState: async () => { throw new Error("ACCOUNT_A_NOT_ACTIVE"); },
  }), error => error instanceof mod.ExchangeOutcomeUnknownError);
  assert.equal(staleRecoveryCalls, 0);
  const accountAKey = page.peek("account-a", intent)?.key;
  const accountBKey = page.acquire("account-b", intent, []).key;
  assert.equal(accountAKey, "switch-key-1");
  assert.equal(accountBKey, "switch-key-2");
  const relogin = mod.createExchangePendingMutationStore(storage, () => { throw new Error("MUST_NOT_CREATE_NEW_KEY"); });
  current = true;
  let retriedPosts = 0;
  const result = await mod.executeExchangeSwap({
    pending: relogin, accountKey: "account-a", intent, baseline, isCurrent: () => current,
    swap: async () => { retriedPosts++; throw new Error("MUST_NOT_REPEAT_POST"); },
    recover: async lease => { assert.equal(lease.key, accountAKey); return { status: "SUCCEEDED", order: committed.orders[0] }; },
    fetchState: async () => committed,
  });
  assert.equal(result.recovered, true);
  assert.equal(retriedPosts, 0);
  assert.equal(relogin.peek("account-a", intent), null);
  assert.equal(relogin.peek("account-b", intent)?.key, accountBKey);
});
