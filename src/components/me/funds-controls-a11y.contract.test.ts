// @ts-nocheck -- source-contract test runs in Node; the app tsconfig intentionally omits Node globals.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("funds controls keyboard and assistive semantics", () => {
  it("exposes the top-up form fields and money action as named controls", () => {
    const source = read("./topup-card-form.vue");
    expect(source).toContain(':aria-label="t.topupChrome.youReceive"');
    expect(source).toContain(':aria-label="t.wallet.ffCardholder"');
    expect(source).toContain(':aria-label="t.wallet.ffZip"');
    expect(source).toContain(':aria-disabled="isValid ? \'false\' : \'true\'"');
    expect(source).toContain('@keydown.enter.prevent="handleSubmit"');
  });

  it("exposes withdrawal recovery, amount, network radio group and submit action", () => {
    const source = read("../../pages/me/wallet-withdraw.vue");
    expect(source).toContain(':aria-label="t.walletV3.withdrawAbandonAttemptCta"');
    expect(source).toContain(':aria-label="t.wallet.amountLabel"');
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role="radio"');
    expect(source).toContain(':aria-busy="submitting"');
    expect(source).toContain('@keydown.enter.prevent="handleSubmit"');
  });

  it("rechecks remote withdrawal decisions when authoritative policy facts change", () => {
    const source = read("../../pages/me/wallet-withdraw.vue");
    expect(source).toContain("watch([amountNum, network, boundAddress, maxWithdrawable, dailyFacts, withdrawalActionsFresh, () => app.accountKey, () => withdrawalPolicy.value?.policyVersion]");
    expect(source).toContain("watch([smallAmountLine, network, boundAddress, maxWithdrawable, dailyFacts, withdrawalActionsFresh, () => app.accountKey, () => withdrawalPolicy.value?.policyVersion]");
    expect(source.match(/const epoch = \+\+remote(?:SmallLine)?EligibilityEpoch;/g)).toHaveLength(2);
  });

  it("announces theme choices as a radio group", () => {
    const source = read("./theme-row.vue");
    expect(source).toContain('role="radiogroup"');
    expect(source.match(/role="radio"/g)).toHaveLength(2);
    expect(source.match(/:aria-checked=/g)).toHaveLength(2);
  });
});
