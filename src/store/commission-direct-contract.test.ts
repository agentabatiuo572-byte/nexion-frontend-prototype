import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {createPinia, disposePinia, setActivePinia, type Pinia} from "pinia";
import {createTeamInsightsApi} from "@/api/team-insights-api";
import type {ApiClient} from "@/api/api-client";
const remote = vi.hoisted(() => ({remoteApiEnabled: true, apiRuntimeConfig: {environment: "dev", mode: "dev"},
  commissionConfigApi: {rates: vi.fn(), binary: vi.fn()}, teamInsightsApi: {commissions: vi.fn()}}));
vi.mock("@/api/runtime", () => remote);
const {useCommission} = await import("./commission");
const request = vi.fn(), api = createTeamInsightsApi({request} as unknown as ApiClient);
const at = "2026-10-05T00:00:00Z";
const kinds = ["unilevel", "binary", "peer", "cultivation", "leadership", "genesis", "direct_purchase", "direct_device_earning"];
const pair = () => [
  {id: "CM-USDT", kind: "direct_purchase", sourceUserName: "A***8", amountUSDT: 6, amountNEX: 0,
    sourceRef: "ORD-8", recoveryPendingUSDT: 1, recoveryPendingNEX: 30, sourceDeviceId: null,
    status: "recovery_pending", ts: 1791158400000, unlockAt: 1791158400000, settlementState: "CANONICAL", withdrawable: false},
  {id: "CM-NEX", kind: "direct_device_earning", sourceUserName: "A***8", amountUSDT: 0, amountNEX: 400,
    sourceRef: "EARN-8", recoveryPendingUSDT: 0, recoveryPendingNEX: 0, sourceDeviceId: "DEVICE-8",
    status: "cooling", ts: 1791158400000, unlockAt: 1791158400000, settlementState: "CANONICAL", withdrawable: false},
];
function response(page = 1) {
  const byKind = Object.fromEntries(kinds.map(kind => [kind, {usdt: 0, nex: 0, count: 0}]));
  byKind.unilevel = {usdt: 20, nex: 0, count: 20};
  byKind.direct_purchase = {usdt: 6, nex: 0, count: 1}; byKind.direct_device_earning = {usdt: 0, nex: 400, count: 1};
  const old = Array.from({length: 20}, (_, n) => ({id: `OLD-${n}`, kind: "unilevel", sourceUserName: "A***8", layer: 1,
    amountUSDT: 1, amountNEX: 0, status: "unlocked", ts: 1791158400000, unlockAt: 1791158400000}));
  return {source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    page, pageSize: 20, totalRows: 22, generatedAt: at, snapshotAt: at, events: page === 1 ? old : pair(),
    aggregate: {totalUSDT: 26, totalNEX: 400, directUSDT: 20, extendedUSDT: 6, contributorCount: 1,
      monthUSDT: 26, monthNEX: 400, todayUSDT: 0, unlockedUSDT: 20, unlockedNEX: 0, coolingUSDT: 0,
      eventCount: 22, nextUnlockAt: null, byKind}};
}
let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia(); setActivePinia(pinia); vi.clearAllMocks();
  remote.commissionConfigApi.rates.mockRejectedValue(new Error("isolated rates"));
  remote.commissionConfigApi.binary.mockRejectedValue(new Error("isolated binary"));
  remote.teamInsightsApi.commissions.mockImplementation((page: number, size: number, stamp: string | null) => api.commissions(page, size, stamp));
  request.mockResolvedValue(response());
});
afterEach(() => disposePinia(pinia));
describe("upstream eight CM canonical contract", () => {
  it("accepts full-history new buckets on an old-only first page and never reclassifies server directUSDT", async () => {
    const data = await api.commissions();
    expect(data.events.every(event => event.kind === "unilevel")).toBe(true);
    expect(data.aggregate.byKind.direct_purchase.count).toBe(1); expect(data.aggregate.totalNEX).toBe(400);
    expect(data.aggregate.directUSDT).toBe(20); expect(data.aggregate.extendedUSDT).toBe(6);
  });
  it("carries new source and pending amounts through actual adapter/store pagination while retaining single-currency CM rows", async () => {
    const store = useCommission(); store.bindAccount("user:8"); await vi.waitFor(() => expect(store.eventsStatus).toBe("ready"));
    expect(store.events).toHaveLength(20); expect(store.byKind().direct_device_earning).toEqual({usdt: 0, nex: 400, count: 1});
    request.mockResolvedValueOnce(response(2)); await store.loadMoreCanonicalEvents();
    expect(store.events).toHaveLength(22);
    expect(store.events.at(-2)).toMatchObject({id: "CM-USDT", amountNEX: 0, sourceRef: "ORD-8", recoveryPendingNEX: 30, status: "recovery_pending"});
    expect(store.events.at(-1)).toMatchObject({id: "CM-NEX", amountUSDT: 0, sourceDeviceId: "DEVICE-8"});
    expect(store.events.at(-1)).not.toHaveProperty("policyVersion"); expect(store.totalNEXLifetime()).toBe(400);
    expect(request.mock.calls.at(-1)?.[0].path).toContain("snapshotAt=2026-10-05T00%3A00%3A00Z");
    request.mockResolvedValueOnce({...response(), serverCanonical: false}); await store.refreshCanonicalEvents();
    expect(store.eventsEvidence).toBeNull(); expect(store.eventsStatus).toBe("error"); expect(store.events).toEqual([]);
  });
  it.each([{amountNEX: "400"}, {status: "simulated"}, {sourceUserId: "private"}, {recoveryPendingNEX: -1}])(
    "keeps existing strict CM source/amount/status checks for %#", async mutation => {
      request.mockResolvedValueOnce({...response(2), events: [{...pair()[0], ...mutation}, pair()[1]]});
      await expect(api.commissions(2)).rejects.toMatchObject({message: "TEAM_INSIGHTS_RESPONSE_INVALID"});
    });
});
