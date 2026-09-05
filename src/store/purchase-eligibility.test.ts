import { expect, test, vi } from "vitest";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { createPurchaseEligibilityStore } from "./purchase-eligibility";

const snapshot = (productNo: string, eligible: boolean) => ({
  productNo,
  eligible,
  decisionCode: eligible ? "ELIGIBLE" : "PURCHASE_GATE_NOT_MET",
  evaluatedAt: 1786856400000,
  source: "nx_admin_device_sku.purchase_gate_json + nx_user" as const,
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
