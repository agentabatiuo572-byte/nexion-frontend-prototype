import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./staking.vue?raw";

const handler = source.slice(source.indexOf("function openRecovery()"), source.indexOf("function openSheet("));
const compiled = ts.transpileModule(handler + "\nreturn openRecovery;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
describe("staking independent original-intent recovery entry", () => {
  it("opens only the recovery sheet with no pool/balance or business call dependency", () => {
    const staking = { isMockMode: false, remoteReady: false, walletBalanceUsdt: 0, pools: [],
      pendingOpenCount: 1, refreshPendingOpen: vi.fn(), openRemote: vi.fn(), syncRemote: vi.fn() };
    const sheetTerm = { value: 30 as number | null };
    const sheetOpen = { value: false };
    new Function("staking", "sheetTerm", "sheetOpen", compiled)(staking, sheetTerm, sheetOpen)();
    expect(sheetOpen.value).toBe(true);
    expect(sheetTerm.value).toBe(null);
    expect(staking.refreshPendingOpen).toHaveBeenCalledOnce();
    expect(staking.openRemote).not.toHaveBeenCalled();
    expect(staking.syncRemote).not.toHaveBeenCalled();
    expect(source).toContain('v-if="staking.pendingOpenCount !== 0"');
    expect(source).toContain('@click="openRecovery"');
  });
  it.each([true, false])("cannot present a new lock command when no original pending intent exists (mock=%s)", (mock) => {
    const staking = { isMockMode: mock, pendingOpenCount: 0, refreshPendingOpen: vi.fn() };
    const sheetTerm = { value: null }, sheetOpen = { value: false };
    new Function("staking", "sheetTerm", "sheetOpen", compiled)(staking, sheetTerm, sheetOpen)();
    expect(sheetOpen.value).toBe(false);
  });
});
