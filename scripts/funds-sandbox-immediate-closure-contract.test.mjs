import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("explicit Sandbox exposes all simulated recharge rails while remote production stays fail-closed", () => {
  const page = read("src/pages/me/wallet-topup.vue");

  assert.match(page, /import\s*\{[^}]*fundsSandboxEnabled[^}]*remoteApiEnabled[^}]*\}\s*from\s*["']@\/api\/runtime["']/s);
  assert.match(page, /<DepositBankPane\s+v-if=["']remoteApiEnabled\s*&&\s*!fundsSandboxEnabled["']/);
  assert.match(page, /<template\s+v-if=["']!remoteApiEnabled\s*\|\|\s*fundsSandboxEnabled["']/);
  assert.match(page, /<DepositUsdtPane\s+v-if=["']seg\s*===\s*'crypto'["']/);
  assert.match(page, /<DepositBankPane\s+v-else-if=["']seg\s*===\s*'bank'["']/);
  assert.match(page, /<TopupCardForm\s+v-else/);
});

test("chain Sandbox recharge accepts the entered amount instead of a fixed demo credit", () => {
  const pane = read("src/components/me/deposit-usdt-pane.vue");

  assert.match(pane, /v-model=["']sandboxAmount["']/);
  assert.match(pane, /createSandboxTopup\(["']CREGIS_USDT_BEP20["'],\s*amount/);
  assert.doesNotMatch(pane, /createSandboxTopup\(["']CREGIS_USDT_BEP20["'],\s*25\b/);
});

test("a terminal withdrawal response closes the pending mutation without a manual callback CTA", () => {
  const store = read("src/store/app.ts");
  const tracking = read("src/pages/me/wallet-withdraw-tracking.vue");
  const sandboxBranch = store.slice(
    store.indexOf("if (fundsSandboxEnabled) {", store.indexOf("async function submitWithdrawal")),
    store.indexOf("const submission = await withdrawalApi.submit", store.indexOf("async function submitWithdrawal")),
  );

  assert.match(sandboxBranch, /order\.status\s*===\s*["']CONFIRMED["']/);
  assert.match(sandboxBranch, /finishPendingFundsMutationByOrder\(acct,\s*["']SANDBOX["'],\s*order\.orderNo\)/);
  assert.doesNotMatch(tracking, /confirmSandboxCallback|SANDBOX:\s*confirm server callback/);
});
