import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const api = read("src/api/funds-sandbox-api.ts");
const app = read("src/store/app.ts");
const page = read("src/pages/me/wallet-withdraw.vue");

// Journey: after a server-settled sandbox top-up, a signed-in user can use the
// same authoritative wallet balance on the isolated BEP20 withdrawal rail.
// Negative contract: an absent, stale, or mismatched sandbox policy never
// falls through to the production withdrawal policy or a local balance.
assert.match(api, /export interface FundsSandboxWithdrawalPolicy/);
assert.match(api, /withdrawalPolicy:\s*FundsSandboxWithdrawalPolicy/);
assert.match(api, /channel:\s*"CREGIS_USDT_BEP20"/);
assert.match(api, /sourceEnvironment:\s*"SANDBOX"/);
assert.match(api, /mode:\s*"LOCAL_SANDBOX"/);
assert.match(api, /function withdrawalPolicy\(/);

assert.match(app, /FUNDS_SANDBOX_WITHDRAWAL_POLICY_REQUIRED/);
assert.match(app, /FUNDS_SANDBOX_WITHDRAWAL_CHANNEL_DISABLED/);
assert.match(app, /FUNDS_SANDBOX_INSUFFICIENT_BALANCE/);

assert.match(page, /const sandboxWithdrawalPolicy = computed/);
assert.match(page, /app\.user\.usdtBalance \* sandboxPolicy\.balanceMaxRatio/);
const sandboxBranch = page.indexOf("if (fundsSandboxEnabled) {");
const productionPolicyRead = page.indexOf("withdrawalApi.policy()");
assert.ok(sandboxBranch >= 0 && productionPolicyRead > sandboxBranch,
  "sandbox policy projection must branch before the production policy request");
assert.ok(page.slice(sandboxBranch, productionPolicyRead).includes("sandboxWithdrawalPolicy.value"),
  "the sandbox branch must consume the authenticated sandbox policy");
assert.ok(page.slice(sandboxBranch, productionPolicyRead).includes("return;"),
  "the sandbox branch must not fall through into production policy loading");
assert.match(page, /fundsSandboxEnabled \? \[\{ id: "USDT-BEP20", label: "BEP20" \}\]/);

console.log("funds sandbox withdrawal contract: PASS");
