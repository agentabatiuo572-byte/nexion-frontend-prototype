import { effectScope, nextTick, reactive, ref, type EffectScope } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_TRIAL_CONFIG } from "@/store/trial-config";
import { useTrialPresentation } from "./use-trial-presentation";

const stores = vi.hoisted(() => ({ app: null as any, trial: null as any, config: null as any, now: null as any }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true }));
vi.mock("@/store/app", () => ({ useApp: () => stores.app }));
vi.mock("@/store/free-trial", () => ({
  useFreeTrial: () => stores.trial,
  liveShadowUSD: () => stores.trial.authoritativeShadowUSD,
  liveShadowNEX: () => stores.trial.authoritativeShadowNEX,
}));
vi.mock("@/store/trial-config", async (original) => ({
  ...await original<typeof import("@/store/trial-config")>(), useTrialConfig: () => stores.config,
}));
vi.mock("./use-now", () => ({ useNow: () => stores.now }));

const start = Date.UTC(2026, 9, 27);
const scopes: EffectScope[] = [];
beforeEach(() => {
  stores.app = reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  stores.config = reactive({ config: { ...DEFAULT_TRIAL_CONFIG, trialProductId: "trial-sku-b", trialProductName: "Server Trial B" } });
  stores.now = ref((start + 86_400_000) / 1000);
  stores.trial = reactive({
    authorityStatus: "unknown", authorityServerState: null, status: "none",
    startedAt: null, expiresAt: null, graceEndsAt: null, finishedAt: null,
    authoritativeShadowUSD: 0, authoritativeShadowNEX: 0, authoritativeOffsetUSD: null, authoritativeRemainderUSD: null,
    snapshot() { return { status: this.status, startedAt: this.startedAt, expiresAt: this.expiresAt,
      graceEndsAt: this.graceEndsAt, finishedAt: this.finishedAt, shadowFrozenAtUSD: 0, shadowFrozenAtNEX: 0, legacyCardMigrated: false }; },
    poll: vi.fn(async () => true),
  });
});
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));
function mount() {
  const scope = effectScope(); scopes.push(scope);
  return scope.run(() => useTrialPresentation())!;
}
function confirm(status = "active") {
  Object.assign(stores.trial, { authorityStatus: "ready", authorityServerState: status === "active" ? "ACTIVE" : "GRACE", status,
    startedAt: start, expiresAt: start + 3 * 86_400_000, graceEndsAt: start + 10 * 86_400_000,
    authoritativeShadowUSD: 7, authoritativeShadowNEX: 40, authoritativeOffsetUSD: 5, authoritativeRemainderUSD: 2 });
}

it("keeps a first read unknown rather than presenting default product, zero money or zero slots", () => {
  const view = mount();
  expect(view.status.value).toBeNull(); expect(view.config.value).toBeNull(); expect(view.deviceName.value).toBeNull();
  expect(view.reservedSlots.value).toBeNull(); expect(view.shadowUSD.value).toBeNull(); expect(view.offsetUSD.value).toBeNull();
  expect(view.estimatedOffsetUSD.value).toBeNull(); expect(view.actionsReady.value).toBe(false);
});

it("uses the selected product and the authority-pinned earning duration for its separate estimate", () => {
  confirm(); stores.config.config.trialDays = 3;
  const view = mount();
  expect(view.deviceName.value).toBe("Server Trial B"); expect(view.productId.value).toBe("trial-sku-b");
  expect(view.reservedSlots.value).toBe(1); expect(view.remainingMs.value).toBe(2 * 86_400_000);
  expect(view.shadowUSD.value).toBe(7); expect(view.offsetUSD.value).toBe(5); expect(view.remainderUSD.value).toBe(2);
  expect(view.estimatedUSD.value).toBe(21); expect(view.estimatedOffsetUSD.value).toBe(21);
  expect(view.offsetProgress.value).toBeCloseTo(5 / 21);
});

it("does not reconstruct remote credit from a changed promotion cap or a missing server amount", async () => {
  confirm(); stores.config.config.trialOffsetCapUSD = 1;
  const view = mount(); expect(view.offsetUSD.value).toBe(5);
  stores.trial.authoritativeOffsetUSD = null; stores.trial.authoritativeRemainderUSD = null;
  await nextTick();
  expect(view.shadowUSD.value).toBe(7); expect(view.offsetUSD.value).toBeNull(); expect(view.remainderUSD.value).toBeNull();
  expect(view.offsetProgress.value).toBeNull();
});

it("does not treat an extended purchase deadline as extra earning days", () => {
  confirm("grace");
  stores.trial.authorityServerState = "EXTENDED";
  stores.trial.expiresAt = start + 13 * 86_400_000;
  stores.config.config.trialOffsetCapUSD = 1000;
  const view = mount();
  expect(view.estimatedUSD.value).toBe(21);
  expect(view.estimatedOffsetUSD.value).toBe(21);
});

it("retains a confirmed trial during a refresh while keeping actions closed", async () => {
  confirm(); const view = mount();
  stores.trial.authorityStatus = "loading"; await nextTick();
  expect(view.active.value).toBe(true); expect(view.reservedSlots.value).toBe(1); expect(view.offsetUSD.value).toBe(5);
  expect(view.actionsReady.value).toBe(false);
});

it("retains only lifecycle identity after the store clears a failed read, with all figures unknown", async () => {
  confirm(); const view = mount();
  Object.assign(stores.trial, { status: "none", startedAt: null, expiresAt: null, graceEndsAt: null,
    authoritativeShadowUSD: 0, authoritativeOffsetUSD: null, authorityServerState: null, authorityStatus: "error" });
  await nextTick();
  expect(view.status.value).toBe("active"); expect(view.deviceName.value).toBe("Server Trial B"); expect(view.active.value).toBe(true);
  expect(view.remainingMs.value).toBeNull(); expect(view.shadowUSD.value).toBeNull(); expect(view.offsetUSD.value).toBeNull();
  expect(view.reservedSlots.value).toBeNull(); expect(view.actionsReady.value).toBe(false);
  await view.refresh(); expect(stores.trial.poll).toHaveBeenCalledTimes(1);
});

it.each(["active", "grace"])("reserves exactly one trial slot in %s and removes it after conversion", async status => {
  confirm(status); const view = mount(); expect(view.active.value).toBe(true); expect(view.reservedSlots.value).toBe(1);
  Object.assign(stores.trial, { status: "converted", authorityServerState: "REDEEMED" }); await nextTick();
  expect(view.active.value).toBe(false); expect(view.reservedSlots.value).toBe(0);
});

it("removes an ended trial from the active queue without simulating a new lifecycle when time passes", async () => {
  confirm(); const view = mount(); stores.now.value += 20 * 86_400;
  expect(view.remainingMs.value).toBe(0); expect(view.shadowUSD.value).toBe(7); expect(view.status.value).toBe("active");
  Object.assign(stores.trial, { status: "ended", authorityServerState: "FAILED" }); await nextTick();
  expect(view.active.value).toBe(false); expect(view.reservedSlots.value).toBe(0);
});

it.each(["account", "epoch"])("clears the retained trial across a %s binding change", async boundary => {
  confirm(); const view = mount(); stores.trial.authorityStatus = "error"; await nextTick();
  if (boundary === "account") stores.app.accountKey = "user:2"; else stores.app.accountBindingEpoch++;
  await nextTick();
  expect(view.status.value).toBeNull(); expect(view.deviceName.value).toBeNull(); expect(view.active.value).toBe(false);
  expect(view.reservedSlots.value).toBeNull();
});
