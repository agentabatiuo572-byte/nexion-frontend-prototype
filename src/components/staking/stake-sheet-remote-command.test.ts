import { StakingOpenRejectedError } from '@/api/staking-open-rejection';
import { formatAmount } from "@/lib/amount-display";
import { describe, expect, it, vi } from "vitest";
import { reactive, watch } from "vue";
import ts from "typescript";
import source from "./stake-sheet.vue?raw";
import { RemoteIntentKeyRegistry, type RemoteIntentStorage } from "@/lib/g-remote-intent";
import { normalizeCommandAmount } from "@/lib/command-amount";
import { compile } from "@vue/compiler-dom";
import * as Vue from "vue";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

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
  const owned = new Map<string, { fingerprint: string }>();
  const gate = new Promise<void>((resolve) => { finishRisk = resolve; });
  const dependencies = {
    props: reactive({ open: true, term: 30 }),
    amount: { value: 100.001 },
    minAmount: { value: 10 },
    canOpen: { value: true },
    app: { accountKey: "user:1", accountBindingEpoch: 1 },
    remotePending: { value: false },
    pendingOpen: { value: null },
    recoveryBlocked: { value: false },
    remoteGate: new RemoteIntentKeyRegistry("G1", persistent),
    risk: { checkGate: vi.fn(() => gate) },
    staking: {
      isMockMode: false,
      pools: [{ termDays: 30, tierKey: "usdt30d", enabled: true, killed: false }],
      openRemote: vi.fn().mockResolvedValue({}),
      openStatus: vi.fn().mockResolvedValue("UNKNOWN"),
      prepareOpen: vi.fn(),
      releasePreparedOpen: vi.fn(),
      refreshPendingOpen: vi.fn(),
      syncRemote: vi.fn().mockResolvedValue(true),
    },
    t: { value: { staking: { remoteUnavailableClosed: "Unavailable" }, stakingV3: { toast: {}, sheet: {} } } },
    toast: { error: vi.fn(), success: vi.fn() },
    emit: vi.fn(),
    watch,
    onBeforeUnmount: vi.fn((callback: () => void) => { unmount = callback; }),
    navTo: vi.fn(),
    fmt: vi.fn(),
    ApiError: class extends Error {}, StakingOpenRejectedError,
    normalizeCommandAmount,
  };
  dependencies.staking.prepareOpen.mockImplementation((tierKey, amountUsdt) => {
    const lease = dependencies.remoteGate.acquire(dependencies.app.accountKey, "open", { tierKey, amountUsdt });
    owned.set(lease.key, lease);
    return lease;
  });
  dependencies.staking.releasePreparedOpen.mockImplementation((lease) => {
    if (owned.get(lease.key)?.fingerprint !== lease.fingerprint) return false;
    owned.delete(lease.key);
    return dependencies.remoteGate.complete(lease, !dependencies.staking.openRemote.mock.calls.some(call => call[2] === lease.key));
  });
  dependencies.emit.mockImplementation((_event: string, open: boolean) => { dependencies.props.open = open; });
  const component = new Function("formatAmount", ...Object.keys(dependencies), compiled)(formatAmount, ...Object.values(dependencies)) as {
    submit: () => Promise<void>;
    emitClose: () => void;
  };
  dependencies.amount.value = 100.001;
  return { ...dependencies, ...component, finishRisk, unmount: () => unmount(), storage: persistent };
}

describe("stake sheet remote command boundaries", () => {
  it("blocks new commands on corrupt pending storage without inventing a key", async () => {
    const storage = { read: () => ({ schema: 1, pending: { invalid: "valid-key" } }), write: vi.fn() };
    const h = harness(storage);
    await h.submit();
    expect(h.recoveryBlocked.value).toBe(true);
    expect(h.staking.prepareOpen).not.toHaveBeenCalled();
    expect(h.staking.openRemote).not.toHaveBeenCalled();
    expect(h.staking.openStatus).not.toHaveBeenCalled();
    expect(storage.write).not.toHaveBeenCalled();
  });
  const template = source.split("<template>")[1].split("</template>")[0];
  const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true }).code)(Vue);
  function statusButton(h: ReturnType<typeof harness>) {
    const tree = render({ open: true, term: 30, recovering: true, pendingOpen: h.pendingOpen.value, staking: h.staking,
      pendingTerm: "30", t: h.t.value, remotePending: false, recoveryBlocked: false,
      formatAmount, fmt: () => "20 USDT / 30 days", submit: h.submit, emitClose: h.emitClose }, []);
    function find(node: unknown): Vue.VNode | undefined {
      if (Array.isArray(node)) return node.map(find).find(Boolean);
      if (!node || typeof node !== "object") return;
      const vnode = node as Vue.VNode;
      if (vnode.props?.class === "nx-staking-sheet-status-cta") return vnode;
      return find(vnode.children);
    }
    const button = find(tree);
    expect(button?.props?.onClick).toBe(h.submit);
    expect(button?.props?.["aria-disabled"]).toBe(false);
    return button!.props!.onClick as () => Promise<void>;
  }

  it.each([zh, en, vietnamese])("actual recovery button queries each owned state without risk/financial POST or maturity refresh", async (messages) => {
    for (const status of ["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"]) {
      const h = harness();
      h.t.value = messages as never;
      const original = { tierKey: "usdt30d", amountUsdt: 20 };
      const lease = h.remoteGate.acquire("user:1", "open", original);
      h.remoteGate.complete(lease, false);
      h.pendingOpen.value = original as never;
      h.amount.value = 99999; // Recovery ignores edited input, current balance, minimum and sale gates.
      h.canOpen.value = false;
      h.minAmount.value = 100;
      h.staking.pools = [];
      h.staking.openStatus.mockResolvedValue(status);
      await statusButton(h)();
      expect(h.staking.openStatus).toHaveBeenCalledWith("usdt30d", 20, lease.key);
      expect(h.staking.prepareOpen).not.toHaveBeenCalled();
      expect(h.staking.openRemote).not.toHaveBeenCalled();
      expect(h.risk.checkGate).not.toHaveBeenCalled();
      expect(h.staking.syncRemote).not.toHaveBeenCalled();
      const terminal = status === "SUCCEEDED" || status === "FAILED";
      expect(h.remoteGate.lookup("user:1", "open", original)?.key ?? null).toBe(terminal ? null : lease.key);
      if (status === "SUCCEEDED") expect(h.toast.success).toHaveBeenCalledWith(messages.stakingV3.toast.stakeSuccess);
      else if (status === "FAILED") expect(h.toast.error).toHaveBeenCalledWith(messages.stakingV3.sheet.failedTitle);
      else expect(h.toast.error).toHaveBeenCalledWith(messages.stakingV3.toast.openFailedTitle, messages.stakingV3.sheet.pendingHint);
    }
  });

  it.each(["account", "binding", "close", "reopen", "read-error"])("retains original key after %s during a status read", async (mode) => {
    const h = harness();
    const original = { tierKey: "usdt30d", amountUsdt: 20 };
    const lease = h.remoteGate.acquire("user:1", "open", original);
    h.remoteGate.complete(lease, false);
    let finish!: (value: string) => void;
    let fail!: (error: Error) => void;
    h.staking.openStatus.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    const query = h.submit();
    if (mode === "account") h.app.accountKey = "user:2";
    if (mode === "binding") h.app.accountBindingEpoch++;
    if (mode === "close" || mode === "reopen") h.emitClose();
    if (mode === "reopen") h.props.open = true;
    if (mode === "read-error") fail(new Error("private SQL must never reach toast"));
    else finish("SUCCEEDED");
    await query;
    expect(h.remoteGate.lookup("user:1", "open", original)?.key).toBe(lease.key);
    expect(h.staking.openRemote).not.toHaveBeenCalled();
    expect(h.staking.syncRemote).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
    if (mode !== "read-error") expect(h.toast.error).not.toHaveBeenCalled();
  });

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
    expect(reloaded.staking.openStatus).toHaveBeenCalledWith("usdt30d", 100.001, key);
    expect(reloaded.staking.openRemote).not.toHaveBeenCalled();
    expect(reloaded.risk.checkGate).not.toHaveBeenCalled();
    expect(first.staking.syncRemote).not.toHaveBeenCalled();
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

  it("cancels an unsent fresh gate after closing/reopening and permits a new preparation", async () => {
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
    expect(h.staking.openStatus).not.toHaveBeenCalled();
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

    expect(h.staking.syncRemote).not.toHaveBeenCalled();
    expect(h.props.open).toBe(true);
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(new RemoteIntentKeyRegistry("G1", h.storage).unresolved("user:1", "open")).toHaveLength(1);
    h.amount.value = 100.001;
    await h.submit();
    expect(h.staking.openRemote).toHaveBeenCalledTimes(1);
    expect(h.staking.openStatus).toHaveBeenCalledWith("usdt30d", 100.001, key);
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
