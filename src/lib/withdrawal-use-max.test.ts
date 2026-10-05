// @ts-expect-error Vitest executes this page wiring check in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import {
  computeWithdrawalMaximum,
  formatWithdrawalRatioPercent,
  resolveWithdrawalUseMax,
} from "./withdrawal-use-max";

describe("withdrawal use-max action", () => {
  it("derives the authoritative 8 maximum from a 10 balance and the D5 80 percent ratio", () => {
    expect(computeWithdrawalMaximum(10, 0.8)).toBe(8);
  });

  it("does not round a configured fractional percentage in the explanation", () => {
    expect(formatWithdrawalRatioPercent(0.805)).toBe("80.5");
  });

  it("does not fill an amount that can never pass the server minimum", () => {
    expect(resolveWithdrawalUseMax(8, 20)).toEqual({
      amount: null,
      reason: "below-minimum",
      shortfall: 12,
    });
  });

  it("fills the exact server withdrawable maximum once it reaches the minimum", () => {
    expect(resolveWithdrawalUseMax(20, 20)).toEqual({
      amount: "20.00",
      reason: null,
      shortfall: 0,
    });
  });

  it("signals the caller to preserve an existing input when use-max is below the minimum", () => {
    const existingInput = "6.50";
    const decision = resolveWithdrawalUseMax(computeWithdrawalMaximum(10, 0.8), 20);
    const nextInput = decision.amount ?? existingInput;

    expect(nextInput).toBe(existingInput);
  });

  it.each([
    [161.57922, "161.57"],
    [20.009999, "20.00"],
    [20.999999, "20.99"],
    [1.0099999999999998, "1.00"],
    [100.09999999999998, "100.09"],
  ])("truncates the maximum %s to a submit-safe cent amount", (maximum, expected) => {
    const decision = resolveWithdrawalUseMax(maximum, 0);
    expect(decision).toEqual({ amount: expected, reason: null, shortfall: 0 });
    expect(Number(decision.amount)).toBeLessThanOrEqual(maximum);
  });

  it.each([
    [0.29, "0.29"],
    [0.58, "0.58"],
    [1.15, "1.15"],
    [8.03, "8.03"],
    [100.1, "100.10"],
    [161.57, "161.57"],
    [20, "20.00"],
    [1e-7, "0.00"],
    [1e21, "1000000000000000000000.00"],
  ])("does not lose a valid cent when the maximum is %s", (maximum, expected) => {
    expect(resolveWithdrawalUseMax(maximum, 0).amount).toBe(expected);
  });

  it.each([
    [20.006, 20.005, 0.005],
    [20.000001, 20.000001, 0.000001],
    [19.9999995, 20, 0.01],
  ])("rejects a cent amount below minimum even when raw maximum %s is close to %s", (maximum, minimum, shortfall) => {
    const decision = resolveWithdrawalUseMax(maximum, minimum);
    expect(decision.amount).toBeNull();
    expect(decision.reason).toBe("below-minimum");
    expect(decision.shortfall).toBeCloseTo(shortfall, 10);
  });
});

function realUseMax(maximum: number, minimum: number) {
  const source = readFileSync(new URL("../pages/me/wallet-withdraw.vue", import.meta.url), "utf8");
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Withdrawal SFC script missing");
  const ast = ts.createSourceFile("withdraw.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === "useMax");
  if (!node) throw new Error("Withdrawal useMax handler missing");
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const amount = { value: "6.50" }, info = vi.fn();
  const scope = {
    inputsLocked: { value: false }, withdrawalActionsFresh: { value: true }, amount,
    resolveWithdrawalUseMax, maxWithdrawable: { value: maximum }, minWithdrawable: { value: minimum },
    toast: { info }, t: { value: { wallet: { useMaxBelowMinimum: "below minimum" } } }, fmt: vi.fn(),
  };
  new Function(...Object.keys(scope), `${code}; useMax();`)(...Object.values(scope));
  return { amount: amount.value, info };
}

it("the real use-max click fills a cap-safe amount for the observed fractional maximum", () => {
  const result = realUseMax(161.57922, 20);
  expect(result.amount).toBe("161.57");
  expect(result.info).not.toHaveBeenCalled();
});

it("the real use-max click preserves input when its cent amount cannot reach the minimum", () => {
  const result = realUseMax(20.006, 20.005);
  expect(result.amount).toBe("6.50");
  expect(result.info).toHaveBeenCalledTimes(1);
});
