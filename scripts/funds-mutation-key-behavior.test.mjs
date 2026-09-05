import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import vm from "node:vm";

const result = buildSync({
  entryPoints: ["src/lib/funds-mutation-key.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
vm.runInNewContext(`(function(module,exports,require){${result.outputFiles[0].text}\n})(module,module.exports,require)`, {
  module,
  require,
});
const { FundsMutationKeyRegistry, createProductionFundsRequestKey } = module.exports;

function memoryStorage(seed) {
  let value = seed;
  return {
    read: () => value,
    write: (next) => { value = structuredClone(next); },
    snapshot: () => structuredClone(value),
  };
}

const withdrawal = {
  accountKey: "User-A",
  environment: "SANDBOX",
  method: "WITHDRAWAL:CREGIS_USDT_BEP20",
  fingerprint: '{"amount":"4.000000","address":"0xabc"}',
};

test("lost response and reload reuse one mutation key", () => {
  const storage = memoryStorage();
  const first = new FundsMutationKeyRegistry(storage).getOrCreate(withdrawal);
  // Response was lost: no finish call. A fresh app process reads the same storage.
  const retried = new FundsMutationKeyRegistry(storage).getOrCreate(withdrawal);
  assert.equal(retried, first);
  assert.equal(Object.keys(storage.snapshot().pending).length, 1);
});

test("only an authoritative terminal result advances the intent generation", () => {
  const storage = memoryStorage();
  const registry = new FundsMutationKeyRegistry(storage);
  const first = registry.getOrCreate(withdrawal);
  registry.bindOrder(withdrawal, first, "FSW-1");
  assert.equal(registry.finishByOrder("user-a", "SANDBOX", "FSW-1"), true);
  const next = registry.getOrCreate(withdrawal);
  assert.notEqual(next, first);
});

test("account and changed payload are isolated", () => {
  const registry = new FundsMutationKeyRegistry(memoryStorage());
  const original = registry.getOrCreate(withdrawal);
  assert.notEqual(registry.getOrCreate({ ...withdrawal, accountKey: "user-b" }), original);
  assert.notEqual(registry.getOrCreate({ ...withdrawal, fingerprint: '{"amount":"5.000000","address":"0xabc"}' }), original);
});

test("production is outside the sandbox registry and a later command gets a fresh key", () => {
  const registry = new FundsMutationKeyRegistry(memoryStorage());
  assert.throws(() => registry.getOrCreate({ ...withdrawal, environment: "PRODUCTION" }),
    /FUNDS_MUTATION_IDENTITY_INVALID/);
  const first = createProductionFundsRequestKey(() => "production-nonce-0001");
  const second = createProductionFundsRequestKey(() => "production-nonce-0002");
  assert.notEqual(second, first);
  assert.notEqual(first, registry.getOrCreate(withdrawal));
});
