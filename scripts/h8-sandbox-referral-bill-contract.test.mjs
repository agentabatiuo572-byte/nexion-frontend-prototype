import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

const billStore = read("src/store/bills.ts");
const projection = read("src/store/referral-reward-bills.ts");
const api = read("src/api/referral-reward-api.ts");

assert.match(billStore, /referralRewardApi\.snapshot\(\)/);
assert.match(billStore, /projectReferralRewardBills/);
assert.match(projection, /settlementNo/);
assert.match(projection, /source: "mock"/);
assert.match(projection, /sourceEnvironment: "SANDBOX"/);
assert.match(projection, /type: "refer"/);
assert.match(api, /nx_h8_sandbox_referral_ledger/);
