import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function load(relative) {
  const out = await build({
    entryPoints: [path.join(root, relative)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}

function memoryStorage() {
  let value;
  return {
    read: () => value,
    write: (next) => { value = structuredClone(next); },
  };
}

const intent = { direction: "USDT_TO_NEX", fromAmount: 10, queueIfCapped: true };
const baseline = { orders: [] };
const committed = {
  orders: [{
    exchangeNo: "EX-COMMITTED-0001",
    fromAsset: "USDT",
    toAsset: "NEX",
    fromAmount: 10,
    toAmount: 100,
    rate: 0.1,
    status: "COMPLETED",
  }],
};

test("服务端已提交但响应丢失时，以权威 GET 对账并清除 pending key", async () => {
  const mod = await load("src/lib/exchange-pending-mutation.ts");
  const storage = memoryStorage();
  const pending = mod.createExchangePendingMutationStore(storage, () => "key-1");
  const usedKeys = [];

  const result = await mod.executeExchangeSwap({
    pending,
    accountKey: "account-a",
    intent,
    baseline,
    swap: async (key) => {
      usedKeys.push(key);
      throw new mod.ExchangeOutcomeUnknownError();
    },
    fetchState: async () => committed,
  });

  assert.equal(result.recovered, true);
  assert.equal(result.order.exchangeNo, "EX-COMMITTED-0001");
  assert.deepEqual(usedKeys, ["key-1"]);
  assert.equal(pending.peek("account-a", intent), null);
});

test("响应与首次回读都丢失后，刷新页面仍以同 key 重放并在权威终态后 forget", async () => {
  const mod = await load("src/lib/exchange-pending-mutation.ts");
  const storage = memoryStorage();
  const firstPage = mod.createExchangePendingMutationStore(storage, () => "stable-key");
  const firstKeys = [];

  await assert.rejects(mod.executeExchangeSwap({
    pending: firstPage,
    accountKey: "account-a",
    intent,
    baseline,
    swap: async (key) => {
      firstKeys.push(key);
      throw new mod.ExchangeOutcomeUnknownError();
    },
    fetchState: async () => { throw new Error("GET_LOST"); },
  }), (error) => error instanceof mod.ExchangeOutcomeUnknownError);

  const refreshedPage = mod.createExchangePendingMutationStore(storage, () => "must-not-be-used");
  const retryKeys = [];
  const result = await mod.executeExchangeSwap({
    pending: refreshedPage,
    accountKey: "account-a",
    intent,
    baseline: committed,
    swap: async (key) => {
      retryKeys.push(key);
      return { ...committed, order: committed.orders[0] };
    },
    fetchState: async () => committed,
  });

  assert.deepEqual(firstKeys, ["stable-key"]);
  assert.deepEqual(retryKeys, ["stable-key"]);
  assert.equal(result.recovered, false);
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

test("请求途中换号导致结果未知时保留原账号 key，重新登录后仍同键重放", async () => {
  const mod = await load("src/lib/exchange-pending-mutation.ts");
  const storage = memoryStorage();
  let sequence = 0;
  const page = mod.createExchangePendingMutationStore(storage, () => `switch-key-${++sequence}`);

  await assert.rejects(mod.executeExchangeSwap({
    pending: page,
    accountKey: "account-a",
    intent,
    baseline,
    swap: async () => { throw new Error("SESSION_CHANGED_DURING_REQUEST"); },
    fetchState: async () => { throw new Error("ACCOUNT_A_NOT_ACTIVE"); },
  }), (error) => error instanceof mod.ExchangeOutcomeUnknownError);

  const accountAKey = page.peek("account-a", intent)?.key;
  const accountBKey = page.acquire("account-b", intent, []).key;
  const relogin = mod.createExchangePendingMutationStore(storage, () => "must-not-be-used");
  assert.equal(accountAKey, "switch-key-1");
  assert.equal(accountBKey, "switch-key-2");
  assert.equal(relogin.acquire("account-a", intent, committed.orders).key, accountAKey);
});
