import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { resolveTradeinCheckoutPreflight } from "@/domain/tradein-checkout-preflight";
import { CheckoutRouteFence } from "@/lib/checkout-route-fence";

const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const ast = ts.createSourceFile("checkout.ts", script, ts.ScriptTarget.Latest, true);
const selected = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && ["reAddTradein", "fireTradeinIntercept"].includes(node.name?.text ?? ""))
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === "reAddingTradein")),
).map(node => node.getText(ast)).join("\n");
const javascript = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const eligible = (allowed = true) => ({ eligible: allowed, sources: [{ eligible: allowed, sourceDeviceId: 1157 }] });
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function scenario() {
  const result = deferred<ReturnType<typeof eligible>>();
  const fence = new CheckoutRouteFence();
  const identity = { accountKey: "user:1051", accountEpoch: 1, productNo: "stellarbox-pro-v2" };
  let visible = true;
  fence.begin(identity);
  const captureCheckoutRoute = () => fence.capture(identity);
  const isCurrentCheckoutRoute = (scope: ReturnType<typeof captureCheckoutRoute>) => visible && fence.isCurrent(scope, identity);
  const tradein = {
    state: { kind: "none" }, appliedTradein: null,
    showChoice: vi.fn(() => { tradein.state = { kind: "choice" }; }),
    showCanonicalReplace: vi.fn(() => { tradein.state = { kind: "replace" }; }),
    showReplace: vi.fn(),
  };
  const deviceE3Api = {
    eligibility: vi.fn(() => result.promise),
    capacityQuote: vi.fn(async () => ({ decision: "CAPACITY_AVAILABLE" })),
  };
  const deps = {
    ref, tradein, deviceE3Api, remoteApiEnabled: true, tradeinAvailable: ref(false),
    remoteTradeinRecoveryRequired: ref(false), removedTradein: ref(true),
    toast: { warn: vi.fn() }, t: ref({ tradein: { errPleaseRetry: "Please retry", errNoActiveDevice: "No active device" }, store: { coCapacityUnavailable: "Unable to check activation slots" } }),
    trialConversionMode: ref(false), productId: ref(identity.productNo),
    getProduct: () => ({ id: identity.productNo, price: 2639 }), KNOWN_KINDS: [identity.productNo],
    captureCheckoutRoute, isCurrentCheckoutRoute,
    captureAccountScope: () => ({ ...identity }),
    isCurrentAccountScope: (scope: typeof identity) => scope.accountEpoch === identity.accountEpoch,
    remoteCapacityGate: { resolve: (read: () => Promise<unknown>) => read() },
    resolveTradeinCheckoutPreflight,
    app: { refreshRemoteFleet: vi.fn(async () => true) },
    handleNoActiveDeviceDecision: vi.fn(async ({ notify }: { notify: () => void }) => { notify(); }),
  };
  const page = new Function(...Object.keys(deps), `let checkoutCapacityRead=null, interceptFired=false; ${javascript}; return {reAddTradein,fireTradeinIntercept};`)(...Object.values(deps));
  return { result, deps, page, switchAccount() { identity.accountKey = "user:1058"; identity.accountEpoch++; },
    leave() { visible = false; fence.invalidate(); } };
}

describe("actual checkout trade-in re-add async result", () => {
  it("keeps the retry entry without premature error while the server read is pending", async () => {
    const s = scenario(); const operation = s.page.reAddTradein();
    expect(s.deps.toast.warn).not.toHaveBeenCalled();
    expect(s.deps.removedTradein.value).toBe(true);
    s.result.resolve(eligible()); await operation; await settle();
  });
  it("waits for success, opens the exact source choice and then removes the retry entry", async () => {
    const s = scenario(); const operation = s.page.reAddTradein();
    s.result.resolve(eligible()); await operation; await settle();
    expect(s.deps.tradein.showChoice).toHaveBeenCalledExactlyOnceWith("stellarbox-pro-v2", 2639, ["1157"]);
    expect(s.deps.removedTradein.value).toBe(false);
    expect(s.deps.toast.warn).not.toHaveBeenCalled();
  });
  it.each(["ineligible", "eligibility-error", "capacity-error"])("retains retry with one honest error for %s", async outcome => {
    const s = scenario();
    if (outcome === "capacity-error") s.deps.deviceE3Api.capacityQuote.mockRejectedValueOnce(new Error("capacity unavailable"));
    const operation = s.page.reAddTradein();
    if (outcome === "eligibility-error") s.result.reject(new Error("eligibility unavailable")); else s.result.resolve(eligible(outcome !== "ineligible"));
    await operation; await settle();
    expect(s.deps.tradein.state.kind).toBe("none");
    expect(s.deps.removedTradein.value).toBe(true);
    expect(s.deps.toast.warn).toHaveBeenCalledExactlyOnceWith(outcome === "capacity-error" ? "Unable to check activation slots" : "Please retry");
  });
  it("coalesces repeated clicks while a re-add is pending", async () => {
    const s = scenario(); const first = s.page.reAddTradein(); const second = s.page.reAddTradein();
    expect(s.deps.deviceE3Api.eligibility).toHaveBeenCalledTimes(1);
    s.result.resolve(eligible()); await Promise.all([first, second]); await settle();
    expect(s.deps.tradein.showChoice).toHaveBeenCalledTimes(1);
  });
  it.each(["account", "leave"])("ignores a successful response after %s changes", async change => {
    const s = scenario(); const operation = s.page.reAddTradein();
    if (change === "account") s.switchAccount(); else s.leave();
    s.result.resolve(eligible()); await operation; await settle();
    expect(s.deps.tradein.state.kind).toBe("none");
    expect(s.deps.removedTradein.value).toBe(true);
    expect(s.deps.toast.warn).not.toHaveBeenCalled();
  });
  it("does not show an automatic preflight error after leaving the checkout", async () => {
    const s = scenario(); s.deps.deviceE3Api.capacityQuote.mockRejectedValueOnce(new Error("offline"));
    const operation = s.page.fireTradeinIntercept(); s.leave(); s.result.resolve(eligible());
    await operation; await settle(); expect(s.deps.toast.warn).not.toHaveBeenCalled();
  });
  it("keeps unresolved previous-trade recovery ahead of new preflight", async () => {
    const s = scenario(); s.deps.remoteTradeinRecoveryRequired.value = true;
    await s.page.reAddTradein();
    expect(s.deps.deviceE3Api.eligibility).not.toHaveBeenCalled();
    expect(s.deps.removedTradein.value).toBe(true);
    expect(s.deps.toast.warn).toHaveBeenCalledExactlyOnceWith("Please retry");
  });
  it("preserves the server no-active-device feedback without adding a second error", async () => {
    const s = scenario(); s.deps.deviceE3Api.capacityQuote.mockResolvedValueOnce({ decision: "NO_ACTIVE_DEVICE" });
    const operation = s.page.reAddTradein(); s.result.resolve(eligible(false)); await operation; await settle();
    expect(s.deps.tradein.state.kind).toBe("none");
    expect(s.deps.removedTradein.value).toBe(true);
    expect(s.deps.toast.warn).toHaveBeenCalledExactlyOnceWith("No active device");
  });
  it("retains the mandatory canonical replacement branch when capacity is full", async () => {
    const s = scenario(); s.deps.deviceE3Api.capacityQuote.mockResolvedValueOnce({ decision: "REPLACE_REQUIRED" });
    const operation = s.page.reAddTradein(); s.result.resolve(eligible(false)); await operation; await settle();
    expect(s.deps.tradein.showCanonicalReplace).toHaveBeenCalledOnce();
    expect(s.deps.tradein.state.kind).toBe("replace");
    expect(s.deps.removedTradein.value).toBe(false);
    expect(s.deps.toast.warn).not.toHaveBeenCalled();
  });
  it("allows a fresh read after an unsuccessful re-add without reopening the page", async () => {
    const s = scenario(); const first = s.page.reAddTradein();
    s.result.resolve(eligible(false)); await first; await settle();
    expect(s.deps.removedTradein.value).toBe(true);
    s.deps.deviceE3Api.eligibility.mockResolvedValueOnce(eligible());
    await s.page.reAddTradein(); await settle();
    expect(s.deps.tradein.showChoice).toHaveBeenCalledOnce();
    expect(s.deps.removedTradein.value).toBe(false);
    expect(s.deps.toast.warn).toHaveBeenCalledTimes(1);
  });
});

it('initial checkout validates capacity but never opens an unsolicited sheet', async () => {
  const s=scenario();const operation=s.page.fireTradeinIntercept();s.result.resolve(eligible());await operation;await settle();
  expect(s.deps.tradeinAvailable.value).toBe(true);expect(s.deps.tradein.showChoice).not.toHaveBeenCalled();expect(s.deps.tradein.showCanonicalReplace).not.toHaveBeenCalled();
});
