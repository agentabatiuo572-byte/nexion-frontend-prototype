import { describe, expect, it } from "vitest";
import { computed, reactive, ref } from "vue";
import ts from "typescript";
import { fmt } from "@/i18n/format";
import { formatCommandAmount } from "@/lib/command-amount";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
// @ts-expect-error Node is used only by this contract test.
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./wallet-repurchase.vue", import.meta.url), "utf8");
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
const ast = ts.createSourceFile("repurchase.ts", script, ts.ScriptTarget.ES2022, true);
const names = ["canSubmit", "insufficientBalance", "submitHint"];
const statements = ast.statements.filter(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(ast))));
const code = ts.transpileModule(statements.map(statement => statement.getText(ast)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(words = zh.repurchase) {
  const amount = ref(25);
  const confirming = ref(false);
  const recovering = ref(false);
  const remoteReady = ref(true);
  const repurchase = reactive({ config: { enabled: true, minAmountUsdt: 37.123456 }, walletBalanceUsdt: 25, submitting: false });
  const view = new Function("computed", "isRemote", "remoteReady", "repurchase", "confirming", "recovering", "amount", "displayBalance", "w", "fmt", "formatCommandAmount", `${code}; return {canSubmit, insufficientBalance, submitHint};`)(
    computed, ref(true), remoteReady, repurchase, confirming, recovering, amount,
    computed(() => repurchase.walletBalanceUsdt), ref(words), fmt, formatCommandAmount,
  );
  return { ...view, amount, confirming, recovering, remoteReady, repurchase };
}

describe("repurchase disabled-action feedback", () => {
  it.each([zh.repurchase, en.repurchase, vi.repurchase])("shows the exact configured minimum with sufficient balance in every locale", words => {
    const page = setup(words);
    expect(page.canSubmit.value).toBe(false);
    expect(page.insufficientBalance.value).toBe(false);
    expect(page.submitHint.value).toBe(fmt(words.belowMinimumHint, { amount: "37.123456" }));
    page.repurchase.config.minAmountUsdt = 25;
    expect(page.canSubmit.value).toBe(true);
    expect(page.submitHint.value).toBe("");
    page.repurchase.config.minAmountUsdt = 12.5;
    expect(page.canSubmit.value).toBe(true);
  });

  it("distinguishes invalid amounts, product suspension, balance and busy states", () => {
    const page = setup();
    for (const amount of [0, -1, NaN]) {
      page.amount.value = amount;
      expect(page.canSubmit.value).toBe(false);
      expect(page.submitHint.value).toBe(zh.repurchase.invalidAmountHint);
    }
    page.amount.value = 50;
    expect(page.insufficientBalance.value).toBe(true);
    expect(page.submitHint.value).toBe("");
    page.repurchase.config.enabled = false;
    expect(page.insufficientBalance.value).toBe(false);
    expect(page.submitHint.value).toBe(zh.repurchase.pausedHint);
    page.confirming.value = true;
    expect(page.submitHint.value).toBe(zh.repurchase.confirmingHint);
    page.confirming.value = false;
    page.repurchase.submitting = true;
    expect(page.submitHint.value).toBe(zh.repurchase.submittingHint);
  });

  it("preserves pending-order recovery despite paused product, low amount or balance", () => {
    const page = setup();
    page.repurchase.config.enabled = false;
    page.repurchase.walletBalanceUsdt = 0;
    page.recovering.value = true;
    expect(page.canSubmit.value).toBe(true);
    expect(page.insufficientBalance.value).toBe(false);
    expect(page.submitHint.value).toBe("");
    page.recovering.value = false;
    page.remoteReady.value = false;
    expect(page.canSubmit.value).toBe(false);
    expect(page.submitHint.value).toBe("");
  });

  it("renders the configured minimum and live reason next to the disabled action", () => {
    expect(statements).toHaveLength(3);
    expect(source).toContain("fmt(w.minimumAmount, { amount: repurchaseDisplayable && repurchase.config ? formatCommandAmount(repurchase.config.minAmountUsdt) : '—' })");
    expect(source).toContain('v-if="submitHint"');
    expect(source).toContain('aria-live="polite">{{ submitHint }}');
    expect(source).toContain(':aria-disabled="canSubmit ? \'false\' : \'true\'"');
  });
});
