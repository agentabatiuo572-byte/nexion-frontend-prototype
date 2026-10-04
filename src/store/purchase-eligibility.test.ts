import { expect, test, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { bindPurchaseEligibility, createPurchaseEligibilityStore } from "./purchase-eligibility";

const snapshot = (productNo: string, eligible: boolean) => ({
  productNo,
  eligible,
  decisionCode: eligible ? "ELIGIBLE" : "PURCHASE_GATE_NOT_MET",
  policies: [
    { policy: "E1" as const, eligible, decisionCode: eligible ? "ELIGIBLE" : "PURCHASE_GATE_NOT_MET", mode: "ALL" as const, conditions: [] },
    { policy: "F4B" as const, eligible: true, decisionCode: "F4B_NOT_CONFIGURED", mode: "ALL" as const, conditions: [] },
  ],
  evaluatedAt: 1786856400000,
  source: "nx_product + nx_admin_device_sku + nx_user" as const,
  sourceEnvironment: "PRODUCTION" as const,
  runId: null,
  serverCanonical: true as const,
});

test("deduplicates remote eligibility requests and caches only within the account", async () => {
  const scope = createRemoteAccountEpoch("user:one");
  const get = vi.fn(async (productNo: string) => snapshot(productNo, true));
  const store = createPurchaseEligibilityStore({ get }, scope);

  const first = store.ensure("stellarbox-pro-v2");
  const second = store.ensure("stellarbox-pro-v2");
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);

  expect(get).toHaveBeenCalledTimes(1);
  expect(store.state("stellarbox-pro-v2")).toMatchObject({ status: "ready", eligible: true });
  await expect(store.ensure("stellarbox-pro-v2")).resolves.toBe(true);
  expect(get).toHaveBeenCalledTimes(1);

  scope.bind("user:two");
  store.clear();
  expect(store.state("stellarbox-pro-v2")).toMatchObject({ status: "idle", eligible: false });
});

test("drops a late response after an account switch and stays fail-closed", async () => {
  const scope = createRemoteAccountEpoch("user:one");
  let resolve!: (value: ReturnType<typeof snapshot>) => void;
  const get = vi.fn(() => new Promise<ReturnType<typeof snapshot>>((done) => { resolve = done; }));
  const store = createPurchaseEligibilityStore({ get }, scope);
  const pending = store.ensure("stellarbox-pro-v2");

  expect(store.state("stellarbox-pro-v2")).toMatchObject({ status: "loading", eligible: false });
  scope.bind("user:two");
  store.clear();
  resolve(snapshot("stellarbox-pro-v2", true));
  await pending;

  expect(store.state("stellarbox-pro-v2")).toMatchObject({ status: "idle", eligible: false });
});

test("records errors as retryable and never exposes eligibility until a retry succeeds", async () => {
  const scope = createRemoteAccountEpoch("user:one");
  const get = vi.fn()
    .mockRejectedValueOnce(new Error("NETWORK_UNAVAILABLE"))
    .mockResolvedValueOnce(snapshot("stellarbox-pro-v2", true));
  const store = createPurchaseEligibilityStore({ get }, scope);

  await expect(store.ensure("stellarbox-pro-v2")).resolves.toBe(false);
  expect(store.state("stellarbox-pro-v2")).toMatchObject({
    status: "error", eligible: false, error: "NETWORK_UNAVAILABLE",
  });

  await expect(store.ensure("stellarbox-pro-v2", true)).resolves.toBe(true);
  expect(store.state("stellarbox-pro-v2")).toMatchObject({ status: "ready", eligible: true, error: "" });
  expect(get).toHaveBeenCalledTimes(2);
});

test("mounted SKU reloads after account rebind without automatically retrying errors", async () => {
  const scope = createRemoteAccountEpoch("user:one");
  const get = vi.fn().mockResolvedValueOnce(snapshot("stellarbox-pro", true))
    .mockRejectedValueOnce(new Error("OFFLINE"))
    .mockResolvedValueOnce(snapshot("stellarbox-pro", false));
  const store = createPurchaseEligibilityStore({ get }, scope);
  const component = effectScope();
  try {
    const binding = component.run(() => bindPurchaseEligibility(ref("stellarbox-pro"), store, true))!;
    await store.ensure("stellarbox-pro");
    await nextTick();
    expect(binding.eligibility.value).toMatchObject({ status: "ready", eligible: true });
    scope.bind("user:two");
    store.clear();
    await nextTick();
    expect(get).toHaveBeenCalledTimes(2);
    await store.ensure("stellarbox-pro");
    await nextTick();
    expect(binding.eligibility.value).toMatchObject({ status: "error", eligible: false });
    expect(get).toHaveBeenCalledTimes(2);
    await nextTick();
    expect(get).toHaveBeenCalledTimes(2);
    await binding.retry();
    expect(binding.eligibility.value).toMatchObject({ status: "ready", eligible: false });
    expect(get).toHaveBeenCalledTimes(3);
  } finally { component.stop(); }
});

test.each(["resolve", "reject"] as const)("older forced request cannot %s over newer denial", async (completion) => {
  const scope = createRemoteAccountEpoch("user:one");
  let resolve!: (value: ReturnType<typeof snapshot>) => void;
  let reject!: (reason: Error) => void;
  const get = vi.fn().mockImplementationOnce(() => new Promise((ok, fail) => { resolve = ok; reject = fail; }))
    .mockResolvedValueOnce(snapshot("stellarbox-pro", false));
  const store = createPurchaseEligibilityStore({ get }, scope);
  const previous = store.ensure("stellarbox-pro");
  await store.ensure("stellarbox-pro", true);
  if (completion === "resolve") resolve(snapshot("stellarbox-pro", true));
  else reject(new Error("LATE_OFFLINE"));
  await previous;
  expect(store.state("stellarbox-pro")).toMatchObject({ status: "ready", eligible: false, error: "" });
});
