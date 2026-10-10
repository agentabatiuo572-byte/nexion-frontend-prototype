import { describe, expect, it, vi } from "vitest";
import { reactive, watch } from "vue";
import ts from "typescript";
import source from "./stake-sheet.vue?raw";
import { RemoteIntentKeyRegistry, type RemoteIntentStorage } from "@/lib/g-remote-intent";
import { normalizeCommandAmount } from "@/lib/command-amount";

// Execute the component's actual remote submit branch without DOM or real funds.
const lifecycle = source.slice(source.indexOf("let sheetOpenGeneration"), source.indexOf("const titleText"));
const closeFunction = source.slice(source.indexOf("function emitClose()"), source.indexOf("async function submit()"));
const remoteSubmit = source.slice(source.indexOf("async function submit()"), source.indexOf("  const billRef = `STAKE-OPEN-"));
const compiled = ts.transpileModule(`${lifecycle}\n${closeFunction}\n${remoteSubmit}\n}\nreturn { submit, emitClose };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness(storage?: RemoteIntentStorage) {
  let saved: unknown;
  const persistent = storage ?? {
    read: () => saved,
    write: (next: unknown) => { saved = structuredClone(next); },
  };
  let finishRisk!: () => void;
  let unmount = () => {};
  const gate = new Promise<void>((resolve) => { finishRisk = resolve; });
  const dependencies = {
    props: reactive({ open: true, term: 30 }),
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
    emit: vi.fn(),
    watch,
    onBeforeUnmount: vi.fn((callback: () => void) => { unmount = callback; }),
    navTo: vi.fn(),
    fmt: vi.fn(),
    ApiError: class extends Error {},
    normalizeCommandAmount,
  };
  dependencies.emit.mockImplementation((_event: string, open: boolean) => { dependencies.props.open = open; });
  const component = new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies)) as {
    submit: () => Promise<void>;
    emitClose: () => void;
  };
  return { ...dependencies, ...component, finishRisk, unmount: () => unmount(), storage: persistent };
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
    expect(h.emit).not.toHaveBeenCalled();
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

  it("does not dispatch when the sheet closes before disclosure verification finishes", async () => {
    const h = harness();
    const pending = h.submit();
    h.emitClose();
    h.finishRisk();
    await pending;

    expect(h.props.open).toBe(false);
    expect(h.staking.openRemote).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.remotePending.value).toBe(false);
  });

  it("rejects an old gate after closing and reopening, then permits the new sheet", async () => {
    const h = harness();
    const pending = h.submit();
    h.emitClose();
    h.props.open = true;
    h.finishRisk();
    await pending;
    expect(h.staking.openRemote).not.toHaveBeenCalled();
    expect(h.props.open).toBe(true);

    h.amount.value = 100.001;
    await h.submit();
    expect(h.staking.openRemote).toHaveBeenCalledOnce();
    expect(h.toast.success).toHaveBeenCalledOnce();
  });

  it("rejects a previous term's disclosure gate", async () => {
    const h = harness();
    const pending = h.submit();
    h.props.term = 90;
    h.finishRisk();
    await pending;
    expect(h.staking.openRemote).not.toHaveBeenCalled();
  });

  it("rejects a disclosure result after the sheet unmounts", async () => {
    const h = harness();
    const pending = h.submit();
    h.unmount();
    h.finishRisk();
    await pending;
    expect(h.staking.openRemote).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("never submits an already closed sheet or a below-minimum amount", async () => {
    const h = harness();
    h.props.open = false;
    await h.submit();
    h.props.open = true;
    h.amount.value = 1;
    await h.submit();
    expect(h.risk.checkGate).not.toHaveBeenCalled();
    expect(h.staking.openRemote).not.toHaveBeenCalled();
  });

  it("keeps an already dispatched unknown intent and reconciles without closing a newer sheet", async () => {
    const h = harness();
    let failCommand!: (cause: Error) => void;
    h.staking.openRemote.mockImplementationOnce(() => new Promise((_resolve, reject) => { failCommand = reject; }));
    const pending = h.submit();
    h.finishRisk();
    await Promise.resolve();
    expect(h.staking.openRemote).toHaveBeenCalledOnce();
    const key = h.staking.openRemote.mock.calls[0][2];
    h.emitClose();
    h.props.open = true;
    failCommand(new Error("timeout"));
    await pending;

    expect(h.staking.syncRemote).toHaveBeenCalledOnce();
    expect(h.props.open).toBe(true);
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(new RemoteIntentKeyRegistry("G1", h.storage).unresolved("user:1", "open")).toHaveLength(1);
    h.amount.value = 100.001;
    await h.submit();
    expect(h.staking.openRemote).toHaveBeenNthCalledWith(2, "usdt30d", 100.001, key);
  });

  it("settles a dispatched success without closing or notifying a reopened sheet", async () => {
    const h = harness();
    let finishCommand!: () => void;
    h.staking.openRemote.mockImplementationOnce(() => new Promise(resolve => { finishCommand = () => resolve({}); }));
    const pending = h.submit();
    h.finishRisk();
    await Promise.resolve();
    h.emitClose();
    h.props.open = true;
    finishCommand();
    await pending;

    expect(h.props.open).toBe(true);
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(new RemoteIntentKeyRegistry("G1", h.storage).unresolved("user:1", "open")).toHaveLength(0);
  });
});
