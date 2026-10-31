import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, onScopeDispose, reactive, ref, watch } from "vue";
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
const stripFile = ts.createSourceFile("strip.ts", stripSource, ts.ScriptTarget.Latest, true);
const stripFunction = stripFile.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
  && node.name?.text === "useTradeinStrip")!.getText(stripFile).replace("export ", "");
const statements = composableBody(deactivationSource, "useDeviceDeactivation");
const selected = statements.filter(({ node, text }) => {
  return (ts.isVariableStatement(node) && /remoteEligib/.test(text))
    || (ts.isFunctionDeclaration(node) && ["refreshRemoteTradeinEligibility", "tradeinStrip", "runRemoteDeviceCommand"].includes(node.name?.text ?? ""))
    || (ts.isExpressionStatement(node) && text.startsWith("watch(") && text.includes("refreshRemoteTradeinEligibility"));
}).map(({ text }) => text).join("\n");
const javascript = ts.transpileModule(stripFunction + "\n" + selected, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
async function settle() { for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); } }

function scenario(active = false) {
  const device = { id: "1157", kind: "stellarbox-s1", rowVersion: 1, activatedAt: active ? 1 : null,
    pendingDeactivate: false, currentTask: null as { id: string } | null, cumulativeEarningsUsdt: 0 };
  const app = reactive({ accountKey: "user:1051", accountBindingEpoch: 1, devices: [device], slotCap: 3,
    refreshRemoteFleet: vi.fn(async () => true) });
  let eligible = active;
  const accountScope = createRemoteAccountEpoch(app.accountKey);
  const api = {
    eligibility: vi.fn(async (targetProductNo = "stellarbox-pro-v2") => ({ ...result(eligible), targetProductNo })),
    quote: vi.fn(async (sourceDeviceId = 1157, targetProductNo = "stellarbox-pro-v2") => ({ sourceDeviceId, targetProductNo,
      sourceRowVersion: app.devices.find(device => Number(device.id) === sourceDeviceId)?.rowVersion, discountUsdt: 240 })),
    activate: vi.fn(async () => { eligible = true; app.devices[0].activatedAt = 2; app.devices[0].rowVersion++; }),
    deactivate: vi.fn(async () => { eligible = false; app.devices[0].activatedAt = null; app.devices[0].rowVersion++; }),
  };
  const enabled = ref(true);
  const t = ref({ tradein: { remoteQuoteCreditLabel: "Quote", stripCta: "Trade in" }, myDevices: {} });
  const deps = { ref, watch, computed, nextTick, onScopeDispose, app, remoteApiEnabled: true, refreshProductCatalog: vi.fn(async () => true),
    useApp: () => app, useT: () => t, useTradeinSheet: () => ({}), useProductPhase: () => ref("seed"), getMonthsSince: () => 0,
    apiRuntimeConfig: reactive({ environment: "dev", baseUrl: "https://test.invalid" }),
    productCatalogState: reactive({ status: "ready", revision: "1" }),
    captureAccountScope: accountScope.snapshot, isCurrentAccountScope: accountScope.isCurrent,
    PRODUCTS: [{ id: "stellarbox-pro-v2" }], phase: ref("seed"), isProductAvailable: () => true,
    deviceE3Api: api, canControlDevice: () => true, acquireDeviceCommandKey: () => "original-device-command",
    finishDeviceCommand: vi.fn(), isSettledRejection: () => false,
    t,
    toast: { success: vi.fn(), error: vi.fn() }, fmt: () => "ok", deviceName: () => "S1" };
  const scope = effectScope(); scopes.push(scope);
  const page = scope.run(() => new Function(...Object.keys(deps), "enabled", `${javascript}; return { ...useTradeinStrip(() => enabled.value), runRemoteDeviceCommand };`)(...Object.values(deps), enabled))!;
  return { app, api, page, deps, scope, enabled, rebind: () => { app.accountBindingEpoch++; accountScope.bind(app.accountKey); }, eligible: (value: boolean) => { eligible = value; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result = (eligible: boolean) => ({ enabled: true, eligible, targetProductNo: "stellarbox-pro-v2", targetPriceUsdt: 1200,
  sources: [{ sourceDeviceId: 1157, eligible }] });

describe("warehouse authoritative trade-in eligibility refresh", () => {
  it("waits for a shared pending catalog without forcing it or launching duplicate eligibility reads", async () => {
    const s = scenario(true), catalog = deferred<boolean>();
    s.deps.refreshProductCatalog.mockReturnValue(catalog.promise);
    s.deps.productCatalogState.status = "loading"; await settle();
    expect(s.api.eligibility).not.toHaveBeenCalled();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    s.deps.productCatalogState.status = "ready"; catalog.resolve(true); await settle();
    expect(s.api.eligibility).toHaveBeenCalledExactlyOnceWith("stellarbox-pro-v2");
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(240);
    expect(s.deps.refreshProductCatalog.mock.calls.every(args => args.length === 0)).toBe(true);
  });
  it("discards a quote from an earlier earnings refresh without hiding its authorized entry", async () => {
    const s = scenario(true); await settle();
    const old = deferred<Awaited<ReturnType<typeof s.api.quote>>>(); s.api.quote.mockReturnValueOnce(old.promise);
    s.app.devices[0].cumulativeEarningsUsdt = 1;
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
    s.api.quote.mockResolvedValueOnce({ sourceDeviceId: 1157, sourceRowVersion: 1, targetProductNo: "stellarbox-pro-v2", discountUsdt: 180 });
    s.app.devices[0].cumulativeEarningsUsdt = 2; await settle();
    old.resolve({ sourceDeviceId: 1157, sourceRowVersion: 1, targetProductNo: "stellarbox-pro-v2", discountUsdt: 999 }); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(180);
  });
  it("publishes an eligible source before another SKU finishes or fails", async () => {
    const s = scenario(true); await settle();
    s.deps.PRODUCTS.push({ id: "slow-target" });
    const slow = deferred<ReturnType<typeof result>>();
    s.api.eligibility.mockImplementation(target => target === "slow-target" ? slow.promise
      : Promise.resolve({ ...result(true), targetProductNo: target }));
    const refresh = s.page.refreshRemoteTradeinEligibility(); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(240);
    slow.reject(new Error("one SKU unavailable")); await refresh;
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
  });
  it("publishes each source quote without waiting for another source", async () => {
    const s = scenario(true); await settle();
    s.app.devices.push({ ...s.app.devices[0], id: "1158" }); await settle();
    const slow = deferred<Awaited<ReturnType<typeof s.api.quote>>>();
    s.api.eligibility.mockResolvedValue({ ...result(true), sources: [
      { sourceDeviceId: 1157, eligible: true }, { sourceDeviceId: 1158, eligible: true },
    ] });
    s.api.quote.mockImplementation((sourceDeviceId, targetProductNo) => sourceDeviceId === 1157 ? slow.promise
      : Promise.resolve({ sourceDeviceId, sourceRowVersion: 1, targetProductNo, discountUsdt: 180 }));
    const refresh = s.page.refreshRemoteTradeinEligibility(); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBeUndefined();
    expect(s.page.tradeinStrip(s.app.devices[1]).tradeinQuoteAmount).toBe(180);
    slow.reject(new Error("one source unavailable")); await refresh;
    expect(s.page.tradeinStrip(s.app.devices[1]).tradeinQuoteAmount).toBe(180);
  });
  it("keeps every authorized entry and the other row's amount while earnings refresh one quote", async () => {
    const s = scenario(true); await settle();
    s.api.eligibility.mockResolvedValue({ ...result(true), sources: [
      { sourceDeviceId: 1157, eligible: true }, { sourceDeviceId: 1158, eligible: true },
    ] });
    s.app.devices.push({ ...s.app.devices[0], id: "1158" }); await settle();
    const slow = deferred<Awaited<ReturnType<typeof s.api.quote>>>();
    const eligibilityReads = s.api.eligibility.mock.calls.length, quoteReads = s.api.quote.mock.calls.length;
    s.api.quote.mockReturnValueOnce(slow.promise);
    s.app.devices[0].cumulativeEarningsUsdt = 300;
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBeUndefined();
    expect(s.page.tradeinStrip(s.app.devices[1]).tradeinQuoteAmount).toBe(240);
    expect(s.api.eligibility).toHaveBeenCalledTimes(eligibilityReads);
    expect(s.api.quote).toHaveBeenCalledTimes(quoteReads + 1);
    slow.resolve({ sourceDeviceId: 1157, sourceRowVersion: 1, targetProductNo: "stellarbox-pro-v2", discountUsdt: 180 }); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(180);
    expect(s.deps.refreshProductCatalog.mock.calls.every(args => args.length === 0)).toBe(true);
  });
  it("invalidates only the changed source version and discards its old quote", async () => {
    const s = scenario(true); await settle();
    s.api.eligibility.mockResolvedValue({ ...result(true), sources: [
      { sourceDeviceId: 1157, eligible: true }, { sourceDeviceId: 1158, eligible: true },
    ] });
    s.app.devices.push({ ...s.app.devices[0], id: "1158" }); await settle();
    const old = deferred<Awaited<ReturnType<typeof s.api.quote>>>(), authority = deferred<ReturnType<typeof result>>();
    s.api.quote.mockReturnValueOnce(old.promise); s.app.devices[0].cumulativeEarningsUsdt = 1;
    s.api.eligibility.mockReturnValueOnce(authority.promise); s.app.devices[0].rowVersion++;
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    expect(s.page.tradeinStrip(s.app.devices[1]).tradeinQuoteAmount).toBe(240);
    await settle(); old.resolve({ sourceDeviceId: 1157, sourceRowVersion: 1, targetProductNo: "stellarbox-pro-v2", discountUsdt: 999 });
    await settle(); expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    authority.resolve(result(true)); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(240);
    expect(s.page.tradeinStrip(s.app.devices[1]).tradeinQuoteAmount).toBe(240);
  });
  it.each(["hidden", "environment", "catalog", "removed"])("rejects old eligibility after %s and recovers with a new read", async change => {
    const s = scenario(true); await settle();
    const old = deferred<ReturnType<typeof result>>(); s.api.eligibility.mockReturnValueOnce(old.promise);
    const refresh = s.page.refreshRemoteTradeinEligibility(); await settle();
    if (change === "hidden") { s.enabled.value = false; s.enabled.value = true; }
    if (change === "environment") s.deps.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    if (change === "catalog") s.deps.productCatalogState.revision = "2";
    if (change === "removed") { const device = s.app.devices.pop()!; s.app.devices.push(device); }
    s.eligible(false); await settle(); old.resolve(result(true)); await refresh;
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    s.eligible(true); await s.page.refreshRemoteTradeinEligibility();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
  });
  it.each(["target", "version"])("never displays a quote for a mismatched %s", async change => {
    const s = scenario(true); await settle();
    s.api.quote.mockResolvedValueOnce({ sourceDeviceId: 1157, sourceRowVersion: change === "version" ? 0 : 1,
      targetProductNo: change === "target" ? "different" : "stellarbox-pro-v2", discountUsdt: 999 });
    await s.page.refreshRemoteTradeinEligibility();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBeUndefined();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
  });
  it("previews the lowest-priced eligible target rather than catalog order", async () => {
    const s = scenario(true); await settle();
    s.deps.PRODUCTS.push({ id: "lower-price" });
    s.api.eligibility.mockImplementation(async targetProductNo => ({ ...result(true), targetProductNo: targetProductNo!,
      targetPriceUsdt: targetProductNo === "lower-price" ? 1000 : 1200 }));
    await s.page.refreshRemoteTradeinEligibility();
    expect(s.api.quote).toHaveBeenLastCalledWith(1157, "lower-price");
  });
  it("does not restore a stale quote after a newer read or accept a mismatched source", async () => {
    const s = scenario(true); await settle();
    const old = deferred<{ sourceDeviceId: number; sourceRowVersion: number; targetProductNo: string; discountUsdt: number }>();
    s.api.quote.mockReturnValueOnce(old.promise);
    const stale = s.page.refreshRemoteTradeinEligibility(); await settle();
    await s.page.refreshRemoteTradeinEligibility();
    old.resolve({ sourceDeviceId: 1157, sourceRowVersion: 1, targetProductNo: "stellarbox-pro-v2", discountUsdt: 999 }); await stale;
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(240);
    s.api.quote.mockResolvedValueOnce({ sourceDeviceId: 9999, sourceRowVersion: 1, targetProductNo: "stellarbox-pro-v2", discountUsdt: 999 });
    await s.page.refreshRemoteTradeinEligibility();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBeUndefined();
  });
  it("shows an authoritative quote and keeps the upgrade available when only quoting fails", async () => {
    const s = scenario(true); await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(240);
    s.api.quote.mockRejectedValueOnce(new Error("quote unavailable"));
    await s.page.refreshRemoteTradeinEligibility();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBeUndefined();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinCtaLabel).toBe("Trade in");
  });
  it.each(["disabled", "no-target", "no-source"])("hides upgrade and does not quote when eligibility is %s", async (state) => {
    const s = scenario(true); await settle(); const quotes = s.api.quote.mock.calls.length;
    s.api.eligibility.mockResolvedValueOnce({ ...result(true), enabled: state !== "disabled", eligible: state !== "no-target",
      sources: [{ sourceDeviceId: 1157, eligible: state !== "no-source" }] });
    await s.page.refreshRemoteTradeinEligibility();
    expect(s.page.tradeinStrip(s.app.devices[0])).toEqual({});
    expect(s.api.quote).toHaveBeenCalledTimes(quotes);
  });
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
  it("keeps equivalent fleet snapshots cached and refreshes only the quote when cumulative earnings change", async () => {
    const s = scenario(true); await settle(); const reads = s.api.eligibility.mock.calls.length;
    s.app.devices = s.app.devices.map((device) => ({ ...device })); await settle();
    expect(s.api.eligibility).toHaveBeenCalledTimes(reads);
    s.api.quote.mockResolvedValueOnce({ sourceDeviceId: 1157, sourceRowVersion: 1, targetProductNo: "stellarbox-pro-v2", discountUsdt: 180 });
    s.app.devices[0].cumulativeEarningsUsdt = 300; await settle();
    expect(s.page.tradeinStrip(s.app.devices[0]).tradeinQuoteAmount).toBe(180);
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
    s.rebind(); s.eligible(false); rebound.resolve(result(true)); await sameAccount; await settle();
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
