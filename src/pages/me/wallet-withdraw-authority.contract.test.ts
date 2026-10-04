// @ts-expect-error Vitest executes this page wiring contract in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

const source = readFileSync(new URL("./wallet-withdraw.vue", import.meta.url), "utf8");

describe("withdrawal authoritative-facts display", () => {
  it("keeps unknown balances and daily counts out of zero-valued projections", () => {
    expect(source).toContain('v-if="withdrawalFactsDisplayable"');
    expect(source).toContain('v-if="dailyFactsDisplayable && limitFacts.dailyLimitConfigured"');
    expect(source).toContain("remoteWithdrawalListHasSnapshot");
    expect(source).toContain("|| dailyFactsState.value === \"unavailable\"");
  });

  it("uses fresh authoritative facts before use-max or a new submission", () => {
    expect(source).toContain("const withdrawalActionsFresh");
    expect(source).toContain("if (!withdrawalActionsFresh.value) return withdrawalActionStatusText.value;");
    expect(source).toContain("if (!withdrawalActionsFresh.value) {");
  });

  it("keeps a confirmed quote visible during background refresh without making actions fresh", () => {
    expect(source).toContain('const withdrawalFactsRefreshing');
    expect(source).toContain('const withdrawalQuoteRefreshing');
    expect(source).toContain('withdrawalFactsRefreshing.value || dailyFactsRefreshing.value');
    expect(source).toContain('const quoteDisplayBlocked');
    expect(source).toContain('quoteDisplayBlocked.value || !withdrawalFactsDisplayable.value');
    expect(source).toContain('v-if="withdrawalFactsRefreshing"');
    expect(source).toContain('!withdrawalActionsFresh.value');
  });

  it("uses the shared account, runtime, and request-sequence fence for policy and both eligibility reads", () => {
    expect(source).toContain("const requestedAccountKey = app.accountKey;");
    expect(source).toContain('from "@/lib/withdrawal-facts-request-fence"');
    expect(source).toContain("isCurrentWithdrawalFactsScope(");
    expect(source).toContain("remoteEligibilityEpoch");
    expect(source).toContain("remoteSmallLineEligibilityEpoch");
    expect(source).toContain("subscribeRuntimeRevision");
    expect(source).toContain("invalidateWithdrawalFacts();");
    expect(source).toContain("watch(() => [app.accountKey, app.accountBindingEpoch] as const");
    expect(source).toContain("void retryWithdrawalFacts();");
  });

  it("does not render a zero minimum while the current policy is unknown", () => {
    expect(source).toContain("const withdrawalPolicyCurrent");
    expect(source).toContain('v-if="withdrawalPolicyCurrent" class="block"');
  });
});

// Execute the real SFC functions: these checks prove the guards run before
// max-amount calculation or a new submission, rather than matching source text.
function handler(name: string, scope: Record<string, unknown>) {
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("SFC script missing");
  const ast = ts.createSourceFile("withdraw.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node) throw new Error(`Missing real handler ${name}`);
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${code}; return ${name};`)(...Object.values(scope));
}

it("executes the real use-max guard before calculating from stale facts", () => {
  const amount = { value: "12" }, fresh = { value: false };
  const calculate = vi.fn(() => ({ amount: "90.00" }));
  const info = vi.fn();
  const useMax = handler("useMax", {
    inputsLocked: { value: false }, withdrawalActionsFresh: fresh,
    withdrawalActionStatusText: { value: "retry facts" }, amount,
    resolveWithdrawalUseMax: calculate, maxWithdrawable: { value: 90 }, minWithdrawable: { value: 10 },
    toast: { info },
  });
  useMax();
  expect(amount.value).toBe("12"); expect(calculate).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith("retry facts");
  fresh.value = true; useMax();
  expect(calculate).toHaveBeenCalledWith(90, 10); expect(amount.value).toBe("90.00");
});

it("executes the real disabled-reason and submit guards before a fresh command", async () => {
  const reason = handler("disabledReasonFor", {
    withdrawalActionsFresh: { value: false }, withdrawalActionStatusText: { value: "stale daily limit" },
  })(50, {});
  expect(reason).toBe("stale daily limit");
  const readAttempt = vi.fn(() => null), info = vi.fn();
  const submit = handler("handleSubmit", {
    submitting: { value: false }, confirmingSubmit: { value: false },
    readWithdrawAttempt: readAttempt, app: { accountKey: "user:test" },
    canSubmit: { value: false }, submitDisabledReason: { value: reason }, toast: { info },
  });
  await submit();
  expect(readAttempt).toHaveBeenCalledWith("user:test");
  expect(info).toHaveBeenCalledWith(reason);
  // Any access to confirmation or API dependencies would throw: none were
  // supplied, so a successful return proves no new command reaches them.
});

it.each(["confirm", "response", "same-account-rebind", "stable"])("does not abandon or clear another account after %s", async boundary => {
  const app = { accountKey: "user:old", accountBindingEpoch: 1, refreshRemoteFleet: vi.fn() };
  const rotate = () => { if (boundary === "same-account-rebind") app.accountBindingEpoch++; else app.accountKey = "user:new"; };
  const abandon = vi.fn(async () => { if (boundary !== "confirm" && boundary !== "stable") rotate(); return { state: "ABANDONED" }; });
  const forget = vi.fn(), info = vi.fn();
  const run = handler("abandonPendingAttempt", {
    app, readWithdrawAttempt: () => ({ key: "old-key", amount: 50, network: "USDT-TRC20", address: "old-address", policyVersion: 1, offset: false }),
    abandoningAttempt: { value: false }, submitting: { value: false }, confirmingSubmit: { value: false },
    uiConfirm: async () => { if (boundary === "confirm") rotate(); return true; },
    t: { value: { walletV3: {} } }, remoteApiEnabled: true, withdrawalApi: { abandonAttempt: abandon },
    forgetWithdrawAttempt: forget, refreshPendingAttempt: vi.fn(), toast: { info, error: vi.fn() },
    captureRuntimeRevision: () => ({ epoch: 1 }), isCurrentRuntimeRevision: () => true,
  });
  await run();
  if (boundary === "confirm") expect(abandon).not.toHaveBeenCalled();
  if (boundary === "stable") {
    expect(abandon).toHaveBeenCalledTimes(1); expect(forget).toHaveBeenCalledWith("user:old"); expect(info).toHaveBeenCalledTimes(1);
  } else {
    expect(forget).not.toHaveBeenCalled(); expect(info).not.toHaveBeenCalled();
  }
});
