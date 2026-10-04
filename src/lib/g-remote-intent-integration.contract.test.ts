import { describe, expect, it } from "vitest";
import stakeSheetSource from "../components/staking/stake-sheet.vue?raw";
import stakingPageSource from "../pages/staking/staking.vue?raw";

describe("staking durable remote intent integration", () => {
  it("scopes every remote money command to the current account", () => {
    expect(stakeSheetSource).toContain('remoteGate.acquire(app.accountKey, "open"');
    expect(stakingPageSource).toContain("remoteMutationGate.acquire(app.accountKey, kind");
  });

  it("freezes the amount and account before the asynchronous risk gate", () => {
    const frozenAmount = "const submittedAmount = normalizeCommandAmount(amount.value);";
    const freezeAt = stakeSheetSource.indexOf(frozenAmount);
    const riskGateAt = stakeSheetSource.indexOf('await risk.checkGate("staking", lease.key);');

    expect(freezeAt).toBeGreaterThan(0);
    expect(riskGateAt).toBeGreaterThan(freezeAt);
    expect(stakeSheetSource).toContain("const expectedBindingEpoch = app.accountBindingEpoch");
    expect(stakeSheetSource).toContain("expectedAccountKey !== app.accountKey");
    expect(stakeSheetSource).toContain("expectedBindingEpoch !== app.accountBindingEpoch");
    expect(stakeSheetSource).toContain("intentLease(pool.tierKey, submittedAmount)");
    expect(stakeSheetSource).toContain("staking.openRemote(pool.tierKey, submittedAmount, lease.key)");
    expect(stakeSheetSource).not.toContain("amountUsdt: amountUsdt.toFixed(2)");
  });

  it("retires keys only after an authoritative mutation succeeds", () => {
    expect(stakeSheetSource).toMatch(/await staking\.openRemote[\s\S]*remoteGate\.complete\(lease, true\)/);
    expect(stakingPageSource).toMatch(/await staking\.(?:claimRemote|earlyWithdrawRemote)[\s\S]*remoteMutationGate\.complete\(lease, true\)/);
    expect(stakeSheetSource).toContain("remoteGate.complete(lease, false)");
    expect(stakingPageSource).toContain("remoteMutationGate.complete(lease, false)");
  });

  it("does not keep page-memory-only idempotency maps", () => {
    expect(stakeSheetSource).not.toContain("const remoteIntent = ref");
    expect(stakingPageSource).not.toContain("const remoteMutationKeys = new Map");
  });
});
