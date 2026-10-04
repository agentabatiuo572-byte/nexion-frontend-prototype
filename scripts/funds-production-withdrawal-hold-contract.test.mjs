import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const source = await readFile(resolve(root, "src/store/app.ts"), "utf8");
const body = source.slice(source.indexOf("async function submitWithdrawal("), source.indexOf("function advanceWithdrawalArrival("));

assert.match(body, /if \(!developmentFundsEnabled\) \{[\s\S]*FUNDS_PRODUCTION_WITHDRAWAL_HOLD/,
  "production withdrawal must stop before a request is constructed");
assert.doesNotMatch(body, /createProductionFundsRequestKey\(\)/,
  "a production retry must never mint a fresh idempotency key without terminal readback");
assert.match(body, /fundsSandboxApi\.createWithdrawal\(amount, address, idempotencyKey\)/,
  "the durable sandbox idempotency path remains intact");

console.log("funds production withdrawal hold contract: PASS");
