import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./stake-sheet.vue?raw";
import { RemoteIntentKeyRegistry, type RemoteIntentStorage } from "@/lib/g-remote-intent";
import { normalizeCommandAmount } from "@/lib/command-amount";

// Execute the component's actual remote submit branch without DOM or real funds.
const leaseFunction = source.slice(source.indexOf("function intentLease("), source.indexOf("// Seed the amount"));
const remoteSubmit = source.slice(source.indexOf("async function submit()"), source.indexOf("  const billRef = `STAKE-OPEN-"));
const compiled = ts.transpileModule(`${leaseFunction}\n${remoteSubmit}\n}\nreturn submit;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness(storage?: RemoteIntentStorage) {
  let saved: unknown;
  const persistent = storage ?? {
    read: () => saved,
    write: (next: unknown) => { saved = structuredClone(next); },
  };
  let finishRisk!: () => void;
  const gate = new Promise<void>((resolve) => { finishRisk = resolve; });
  const dependencies = {
    props: { term: 30 },
    amount: { value: 100.001 },
    minAmount: { value: 10 },
    canOpen: { value: true },
    app: { accountKey: "user:1", accountBindingEpoch: 1 },
    remotePending: { value: false },
    remoteGate: new RemoteIntentKeyRegistry("G1", persistent),
    risk: { checkGate: vi.fn(() => gate) },
    staking: {
      isMockMode: false,
      pools: [{ termDays: 30, tierKey: "usdt30d", enabled: true, killed: false }],
      openRemote: vi.fn().mockResolvedValue({}),
      syncRemote: vi.fn().mockResolvedValue(true),
    },
    t: { value: { stakingV3: { toast: {} } } },
    toast: { error: vi.fn(), success: vi.fn() },
    emitClose: vi.fn(),
    navTo: vi.fn(),
    fmt: vi.fn(),
    ApiError: class extends Error {},
    normalizeCommandAmount,
  };
  const submit = new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies)) as () => Promise<void>;
  return { ...dependencies, submit, finishRisk, storage: persistent };
}

describe("stake sheet remote command boundaries", () => {
  it("never dispatches a stopped pool", async () => {
    const h = harness();
    h.canOpen.value = false;
    await h.submit();
    expect(h.risk.checkGate).not.toHaveBeenCalled();
    expect(h.staking.openRemote).not.toHaveBeenCalled();
  });
  it("uses the exact original amount when the input changes during risk verification", async () => {
    const h = harness();
    const pending = h.submit();
    h.amount.value = 900;
    h.finishRisk();
    await pending;

    expect(h.staking.openRemote).toHaveBeenCalledWith("usdt30d", 100.001, expect.any(String));
    expect(h.toast.success).toHaveBeenCalledOnce();
  });

  it.each(["account", "binding"])("does not dispatch after the %s changes during risk verification", async (kind) => {
    const h = harness();
    const pending = h.submit();
    if (kind === "account") h.app.accountKey = "user:2";
    else h.app.accountBindingEpoch += 1;
    h.finishRisk();
    await pending;

    expect(h.staking.openRemote).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.emitClose).not.toHaveBeenCalled();
    expect(h.remotePending.value).toBe(false);
  });

  it("reuses the original key after an ambiguous command and page reconstruction", async () => {
    const first = harness();
    first.staking.openRemote.mockRejectedValue(new Error("timeout"));
    first.finishRisk();
    await first.submit();
    const key = first.staking.openRemote.mock.calls[0][2];

    const reloaded = harness(first.storage);
    reloaded.finishRisk();
    await reloaded.submit();
    expect(reloaded.staking.openRemote).toHaveBeenCalledWith("usdt30d", 100.001, key);
    expect(first.staking.syncRemote).toHaveBeenCalledOnce();
  });
});
