import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, setActivePinia, type Pinia } from "pinia";
import { advanceRuntimeRevision } from "@/api/order-api";
import type { CanonicalBinaryState, CanonicalCommissionConfig } from "@/api/commission-config-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "dev", mode: "dev" },
  commissionConfigApi: { rates: vi.fn(), binary: vi.fn() },
  teamInsightsApi: { commissions: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);

const { useCommission } = await import("./commission");

const config = (): CanonicalCommissionConfig => ({
  source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null,
  unilevelUsdt: { 1: 0.1, 2: 0.05, 3: 0.03, 4: 0.02, 5: 0.01, 6: 0.005, 7: 0.005 },
  unilevelNex: { 1: 50, 2: 20, 3: 10, 4: 5, 5: 2.5, 6: 1, 7: 1 },
  unilevelPaused: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false },
  partnerThresholds: { standard: 0, verified: 5000, premium: 50000, diamond: 500000 },
  influenceClampMin: 1, influenceClampMax: 5, coolingDays: 30, promoMultiplier: 1,
});

const binary = (): CanonicalBinaryState => ({
  source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null,
  asOfDate: "2026-09-07", trackA: 0, trackB: 0, trackAMembers: 0, trackBMembers: 0,
  autoPlacedMembers: 0, matchRate: 0.13, threshold: 1000, dailyCap: 5000, periodCap: 150000,
  estimatedAmountUsdt: 0, settlePeriod: "monthly", residualPolicy: "monthlyClear",
  spilloverEnabled: true, gvReset: "monthly", paused: false,
  blockedReason: "BINARY_LEG_ASSIGNMENT_INCOMPLETE", recentMatches: [],
});

let testPinia: Pinia;
beforeEach(() => {
  testPinia = createPinia();
  setActivePinia(testPinia);
  vi.clearAllMocks();
  remote.commissionConfigApi.rates.mockResolvedValue(config());
  remote.commissionConfigApi.binary.mockResolvedValue(binary());
  remote.teamInsightsApi.commissions.mockResolvedValue({ events: [], page: 1, totalRows: 0 });
  advanceRuntimeRevision();
});
afterEach(() => disposePinia(testPinia));

describe("commission runtime-revision recovery", () => {
  it("keeps confirmed aggregate only through a same-account refresh, never after failure or rebind", async () => {
    const store = useCommission();
    store.bindAccount("account-a");
    await vi.waitFor(() => expect(store.eventsStatus).toBe("ready"));
    const previous = store.eventsEvidence;
    let reject!: (error: Error) => void;
    remote.teamInsightsApi.commissions.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const read = store.refreshCanonicalEvents();
    expect(store.eventsStatus).toBe("loading");
    expect(store.eventsEvidence).toBe(previous);
    reject(new Error("network")); await read;
    expect(store.eventsStatus).toBe("error");
    expect(store.eventsEvidence).toBeNull();
    await store.refreshCanonicalEvents();
    remote.teamInsightsApi.commissions.mockReturnValue(new Promise(() => {}));
    store.bindAccount("account-a");
    expect(store.eventsEvidence).toBeNull();
  });
  it("reloads canonical binary and rate state after a product-catalog revision", async () => {
    const store = useCommission();

    // Boot/default scope has no authenticated account and must not issue a
    // canonical request merely because the catalogue runtime changes.
    advanceRuntimeRevision();
    expect(remote.commissionConfigApi.rates).not.toHaveBeenCalled();
    expect(remote.commissionConfigApi.binary).not.toHaveBeenCalled();

    store.bindAccount("account-a");
    await vi.waitFor(() => expect(store.binaryStatus).toBe("ready"));

    advanceRuntimeRevision();

    await vi.waitFor(() => {
      expect(remote.commissionConfigApi.rates).toHaveBeenCalledTimes(2);
      expect(remote.commissionConfigApi.binary).toHaveBeenCalledTimes(2);
      expect(store.configStatus).toBe("ready");
      expect(store.binaryStatus).toBe("ready");
    });
  });
});
