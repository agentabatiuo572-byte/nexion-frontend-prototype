import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
async function load(relative) {
  const out = await build({ entryPoints: [path.join(root, relative)], bundle: true, write: false, format: "esm", platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}

test("G1 intent gate coalesces double-clicks, reuses unknown keys and separates payloads", async () => {
  let stored;
  globalThis.uni = {
    getStorageSync: () => stored,
    setStorageSync: (_key, value) => { stored = value; },
  };
  const { createRemoteIntentGate } = await load("src/lib/g-remote-intent.ts");
  let sequence = 0;
  const gate = createRemoteIntentGate("G1", () => String(++sequence));
  const first = gate.acquire("user:7", "open", { tierKey: "usdt30d", amountUsdt: 20 });
  const double = gate.acquire("user:7", "open", { tierKey: "usdt30d", amountUsdt: 20 });
  assert.equal(double.pending, true);
  assert.equal(double.key, first.key);
  gate.complete(first, false); // unknown response: retry same request key
  assert.equal(gate.acquire("user:7", "open", { tierKey: "usdt30d", amountUsdt: 20 }).key, first.key);
  assert.notEqual(gate.acquire("user:7", "open", { tierKey: "usdt30d", amountUsdt: 21 }).key, first.key);
  delete globalThis.uni;
});

test("G1/G2 malformed canonical responses fail closed before a success snapshot", async () => {
  const { createStakingApi } = await load("src/api/staking-api.ts");
  const { createExchangeApi } = await load("src/api/exchange-api.ts");
  const bad = { request: async () => ({ serverCanonical: true }) };
  await assert.rejects(createStakingApi(bad).fetchStakingPositions());
  await assert.rejects(createExchangeApi(bad).fetchState());
});
