// @ts-expect-error These page contracts execute in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { fmt } from "@/i18n/format";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const withdrawal = read("./wallet-withdraw.vue");

function handler(name: string, scope: Record<string, unknown>) {
  const script = withdrawal.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Withdrawal script missing");
  const ast = ts.createSourceFile("withdraw.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node) throw new Error(`Missing actual handler: ${name}`);
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${code}; return ${name};`)(...Object.values(scope));
}

describe("withdrawal warning requires withdrawal intent", () => {
  it("keeps Me and the wallet overview free of unsolicited minimum warnings", () => {
    for (const name of ["./me.vue", "./wallet.vue", "../../components/me/wallet-card.vue"]) {
      expect(read(name), name).not.toMatch(/WithdrawalLockedWarning|showWithdrawalLocked|withdrawalLockedBody|MIN_WITHDRAWAL_USD/);
    }
    expect(read("../../components/me/wallet-card.vue")).toMatch(/href="\/pages\/me\/wallet-withdraw(?:-method)?"/);
    expect(read("./wallet.vue")).toContain("/pages/me/wallet-withdraw");
  });

  it.each([10, 35])("checks the current minimum %s inside the real withdrawal handler", minimum => {
    const reason = handler("disabledReasonFor", {
      withdrawalActionsFresh: { value: true }, withdrawalPolicyError: { value: "" },
      NETWORKS: { value: [{ id: "USDT-TRC20" }] }, feeConfigUsable: { value: true },
      withdrawalPolicy: { value: { withdrawalEnabled: true } },
      boundAddress: { value: "T-valid-test-address" }, remoteApiEnabled: false,
      frozenNow: { value: false }, minWithdrawable: { value: minimum },
      t: { value: { walletV3: { submitReasonMinAmount: "Minimum {n}", submitReasonAmountRequired: "Enter amount" } } }, fmt,
    });
    const decision = { dailyLimitReached: false, maxWithdrawableUsdt: 100, canSubmit: true };
    expect(reason(minimum - 1, decision)).toBe(`Minimum ${minimum}`);
    expect(reason(minimum, decision)).toBe("");
    expect(reason(0, decision)).toBe("Enter amount");
  });

  it("gives the minimum feedback on an attempted submission before confirmation or any debit", async () => {
    const info = vi.fn();
    const submit = handler("handleSubmit", {
      submitting: { value: false }, confirmingSubmit: { value: false },
      readWithdrawAttempt: () => null, app: { accountKey: "test-only" },
      canSubmit: { value: false }, submitDisabledReason: { value: "Minimum 35" },
      toast: { info }, t: { value: { walletV3: {} } },
    });
    await submit();
    expect(info).toHaveBeenCalledExactlyOnceWith("Minimum 35");
    // No confirmation/API dependencies are provided; accessing them fails this test.
  });
});
