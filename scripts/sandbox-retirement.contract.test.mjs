import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const source = read("src/api/runtime.ts");
const auth = readFileSync(new URL("../src/api/auth-api.ts", import.meta.url), "utf8");
const support = readFileSync(new URL("../src/api/support-api.ts", import.meta.url), "utf8");
const activeAuthority = [
  "src/api/runtime.ts",
  "src/api/genesis-api.ts",
  "src/api/legal-terms-api.ts",
  "src/api/learning-api.ts",
  "src/pages/store/checkout.vue",
  "src/store/app.ts",
  "src/store/bills.ts",
  "src/store/deposits.ts",
  "src/store/genesis.ts",
  "src/store/repurchase.ts",
  "src/store/staking.ts",
].map(read).join("\n");

assert.match(source, /export const developmentPaymentEnabled = false/);
assert.doesNotMatch(source, /Only the checkout command is simulated|development-only UI until a real PSP/);
assert.doesNotMatch(activeAuthority,
  /developmentFundsEnabled|developmentCommercePaymentEnabled|fundsSandboxApi|commercePaymentApi|expectedSandboxRunId|sandboxMarket/);
assert.doesNotMatch(activeAuthority, /\/api\/app\/wallet\/sandbox|\/api\/orders\/\$\{[^}]+\}\/pay/);
for (const retired of [
  "src/api/funds-sandbox-api.ts",
  "src/api/commerce-payment-api.ts",
  "src/store/funds-sandbox-ledger.ts",
  "src/lib/funds-sandbox-request-scope.ts",
]) assert.equal(existsSync(path.join(root, retired)), false, `${retired} must stay deleted`);
assert.doesNotMatch(auth, /\/auth\/users\/oauth\/sandbox\/challenge/);
assert.match(auth, /\/auth\/users\/oauth\/development\/passkey\/challenge/);
assert.doesNotMatch(support, /\/api\/app\/support\/acceptance/);
assert.doesNotMatch(support, /acceptanceRunId/);

console.log("UNIAPP_SANDBOX_RETIREMENT_CONTRACT: PASS");
