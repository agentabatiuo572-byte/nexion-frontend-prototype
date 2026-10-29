import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, ref, watch } from "vue";
import ts from "typescript";
import stripSource from "@/composables/use-tradein-strip.ts?raw";
import deactivationSource from "@/composables/use-device-deactivation.ts?raw";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";

// The warehouse page and the device action sheet share these composables; run
// their actual bodies with injected dependencies.
function composableBody(source: string, name: string) {
  const file = ts.createSourceFile(`${name}.ts`, source, ts.ScriptTarget.Latest, true);
  const fn = file.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  return fn.body!.statements.map((node) => ({ node, text: node.getText(file) }));
}
const statements = [...composableBody(stripSource, "useTradeinStrip"), ...composableBody(deactivationSource, "useDeviceDeactivation")];
const selected = statements.filter(({ node, text }) => {
  return (ts.isVariableStatement(node) && /remoteEligib/.test(text))
    || (ts.isFunctionDeclaration(node) && ["refreshRemoteTradeinEligibility", "tradeinStrip", "runRemoteDeviceCommand"].includes(node.name?.text ?? ""))
    || (ts.isExpressionStatement(node) && text.startsWith("watch(") && text.includes("refreshRemoteTradeinEligibility"));
}).map(({ text }) => text).join("\n");
const javascript = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
async function settle() { for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); } }

function scenario(active = false) {
  const device = { id: "1157", kind: "stellarbox-s1", rowVersion: 1, activatedAt: active ? 1 : null,
    pendingDeactivate: false, currentTask: null as { id: string } | null, cumulativeEarningsUsdt: 0 };
  const app = reactive({ accountKey: "user:1051", devices: [device], slotCap: 3,
    refreshRemoteFleet: vi.fn(async () => true) });
  let eligible = active;
  const accountScope = createRemoteAccountEpoch(app.accountKey);
  const api = {
    eligibility: vi.fn(async () => ({ sources: [{ sourceDeviceId: 1157, eligible }] })),
    activate: vi.fn(async () => { eligible = true; app.devices[0].activatedAt = 2; app.devices[0].rowVersion++; }),
    deactivate: vi.fn(async () => { eligible = false; app.devices[0].activatedAt = null; app.devices[0].rowVersion++; }),
  };
  const deps = { ref, watch, app, enabled: () => true, remoteApiEnabled: true, refreshProductCatalog: vi.fn(async () => true),
    captureAccountScope: accountScope.snapshot, isCurrentAccountScope: accountScope.isCurrent,
    PRODUCTS: [{ id: "stellarbox-pro-v2" }], phase: ref("seed"), isProductAvailable: () => true,
    deviceE3Api: api, canControlDevice: () => true, acquireDeviceCommandKey: () => "original-device-command",
    finishDeviceCommand: vi.fn(), isSettledRejection: () => false,
    t: ref({ tradein: { remoteQuoteCreditLabel: "Quote", stripCta: "Trade in" }, myDevices: {} }),
    toast: { success: vi.fn(), error: vi.fn() }, fmt: () => "ok", deviceName: () => "S1" };
  const scope = effectScope(); scopes.push(scope);
  const page = scope.run(() => new Function(...Object.keys(deps), `${javascript}; return { tradeinStrip, runRemoteDeviceCommand, refreshRemoteTradeinEligibility };`)(...Object.values(deps)))!;
  return { app, api, page, deps, scope, rebind: () => { accountScope.bind(app.accountKey); }, eligible: (value: boolean) => { eligible = value; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result = (eligible: boolean) => ({ sources: [{ sourceDeviceId: 1157, eligible }] });

describe("warehouse authoritative trade-in eligibility refresh", () => {
  it("reveals the quote action after successful activation without reopening or changing account", async () => {
    const s = scenario(); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    expect(await s.page.runRemoteDeviceCommand(s.app.devices[0], "activate")).toBe(true); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
    expect(s.api.activate).toHaveBeenCalledExactlyOnceWith(1157, 1, 3, "original-device-command");
  });
  it("removes the action after successful deactivation on the same page", async () => {
    const s = scenario(true); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
    await s.page.runRemoteDeviceCommand(s.app.devices[0], "deactivate"); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
  });
  it("refreshes when a task ends while lifecycle stays active", async () => {
    const s = scenario(true); s.app.devices[0].currentTask = { id: "running" }; s.eligible(false); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    s.eligible(true); s.app.devices[0].currentTask = null; await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
  });
  it("does not refetch for an equivalent fleet snapshot or earnings tick", async () => {
    const s = scenario(true); await settle(); const reads = s.api.eligibility.mock.calls.length;
    s.app.devices = s.app.devices.map((device) => ({ ...device, rowVersion: 2, cumulativeEarningsUsdt: 3 })); await settle();
    expect(s.api.eligibility).toHaveBeenCalledTimes(reads);
  });
  it("invalidates immediately on a pending deactivation or a newly running task", async () => {
    const s = scenario(true); await settle();
    s.eligible(false); s.app.devices[0].pendingDeactivate = true; await settle();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    s.app.devices[0].pendingDeactivate = false; s.eligible(true); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
    s.eligible(false); s.app.devices[0].currentTask = { id: "new-task" }; await settle();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
  });
  it.each(["resolve", "reject"] as const)("ignores a superseded same-account request that later %ss", async (outcome) => {
    const s = scenario(true); await settle();
    const old = deferred<ReturnType<typeof result>>();
    s.api.eligibility.mockReturnValueOnce(old.promise);
    const stale = s.page.refreshRemoteTradeinEligibility(); await settle();
    await s.page.refreshRemoteTradeinEligibility();
    if (outcome === "resolve") old.resolve(result(false)); else old.reject(new Error("old failure"));
    await stale;
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
  });
  it("does not commit a response after A to B to A or a same-account rebind", async () => {
    const s = scenario(true); await settle();
    const old = deferred<ReturnType<typeof result>>(); s.api.eligibility.mockReturnValueOnce(old.promise);
    const stale = s.page.refreshRemoteTradeinEligibility(); await settle();
    s.app.accountKey = "user:other"; s.rebind(); await settle();
    s.app.accountKey = "user:1051"; s.rebind(); await settle();
    old.resolve(result(false)); await stale;
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
    const rebound = deferred<ReturnType<typeof result>>(); s.api.eligibility.mockReturnValueOnce(rebound.promise);
    const sameAccount = s.page.refreshRemoteTradeinEligibility(); await settle();
    s.rebind(); rebound.resolve(result(true)); await sameAccount;
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
  });
  it("does not commit after the actual Vue watcher scope is disposed", async () => {
    const s = scenario(true); await settle();
    const old = deferred<ReturnType<typeof result>>(); s.api.eligibility.mockReturnValueOnce(old.promise);
    const pending = s.page.refreshRemoteTradeinEligibility(); await settle(); s.scope.stop();
    old.resolve(result(true)); await pending;
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
  });
  it("keeps eligibility unavailable on a current read error and recovers on the next state change", async () => {
    const s = scenario(true); await settle();
    s.api.eligibility.mockRejectedValueOnce(new Error("unavailable"));
    s.app.devices[0].pendingDeactivate = true; await settle();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    s.app.devices[0].pendingDeactivate = false; await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
  });
});
