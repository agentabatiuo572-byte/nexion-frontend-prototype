import { describe, expect, it } from "vitest";
import { canShowExchangeToast } from "@/lib/exchange-scope-toast";
import { canonicalExchangeAmount, sanitizeExchangeAmountInput } from "@/lib/exchange-input-amount";

const source = (import.meta.glob("./wallet-exchange.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./wallet-exchange.vue"] ?? "") as string;

describe("wallet exchange stale notification fences", () => {
  it.each([
    ["mounted account/run scope", true, true, true, true],
    ["unmounted page", false, true, true, false],
    ["changed account scope", true, false, true, false],
    ["changed commerce run scope", true, true, false, false],
  ])("allows a toast only for the current %s", (_label, mounted, accountScopeCurrent, runScopeCurrent, expected) => {
    expect(canShowExchangeToast({ mounted, accountScopeCurrent, runScopeCurrent })).toBe(expected);
  });

  it("keeps the original account/run scope through confirmation and submit stale branches", () => {
    expect(source).toMatch(/async function syncRemoteState\(\s*scope = captureExchangeScope\(\),\s*runScope = captureRuntimeRevision\(\)/);
    expect(source).toMatch(/const requestScope = captureExchangeScope\(\);[\s\S]*const requestRunScope = captureRuntimeRevision\(\);/);
    expect(source).toMatch(/syncRemoteState\(requestScope, requestRunScope\)/);
    expect(source).toMatch(/const applied = await syncRemoteState\(requestScope, requestRunScope\)\.catch\(\(\) => false\);[\s\S]{0,200}if \(!applied\) return;/);
    expect(source).toMatch(/if \(!applied\) return;/);
    expect(source).toContain("canShowExchangeToast");
    expect(source).toMatch(/function toastIfRemoteScopeCurrent\(/);
  });

  it("preserves an in-progress decimal and normalizes only on blur or confirmation", () => {
    let input = "";
    for (const character of "1.2") input = sanitizeExchangeAmountInput(input + character);
    expect(input).toBe("1.2");
    expect(canonicalExchangeAmount(input)).toBe("1.2");
    expect(source).toContain('@blur="onInputBlur"');
    expect(source).toContain("input.value = sanitizeExchangeAmountInput(detailVal(e));");
    expect(source).toContain("input.value = canonicalExchangeAmount(input.value);");
  });
});
