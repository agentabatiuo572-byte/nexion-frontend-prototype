import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDirectReferralApi, parseDirectReferralEvent } from "./direct-referral-api";

export const policy = () => ({ source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
  configured: true, policyVersion: 3, effectiveAt: "2026-10-01T00:00:00Z", nexUsdtPrice: .01,
  purchase: { enabled: true, totalRatePct: 12.3456, usdtSharePct: 60, coolingDays: 7 },
  deviceEarning: { enabled: true, totalRatePct: 5, usdtSharePct: 70, coolingDays: 0 } });
export const directEvent = (id = "source-1", kind = "direct_purchase") => ({ id, kind, sourceUserName: "B***b", sourceRef: `ORDER-${id}`,
  sourceDeviceId: kind === "direct_device_earning" ? "DEVICE-1" : null, policyVersion: 3, basisUsdt: 1000, nexUsdtPrice: .01,
  amountUSDT: 60, amountNEX: 4000, ts: 1790812800000, unlockAt: 1790812800000, status: "unlocked", recoveryPendingUSDT: 0, recoveryPendingNEX: 0 });
export const snapshot = (events = [directEvent()]) => ({ source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
  period: "month", page: 1, pageSize: 20, totalRows: events.length, events,
  split: { purchase: { amountUSDT: 60, amountNEX: 4000, count: events.filter(event => event.kind === "direct_purchase").length }, deviceEarning: { amountUSDT: 0, amountNEX: 0, count: events.filter(event => event.kind === "direct_device_earning").length } },
  generatedAt: "2026-10-05T00:00:00Z", snapshotAt: "2026-10-05T00:00:00Z" });
const api = (payload: unknown) => createDirectReferralApi({ request: vi.fn().mockResolvedValue(payload) } as unknown as ApiClient);
describe("direct referral public boundary", () => {
  it("rejects a group count that disagrees with totalRows without summing gross event money into net", async () => {
    const payload = snapshot(); payload.split.purchase.count = 2;
    await expect(api(payload).snapshot("month")).rejects.toMatchObject({kind: "protocol"});
  });
  it("rejects a continuation that changes the issued snapshot cutoff", async () => {
    await expect(api(snapshot()).snapshot("month", 1, 20, "2026-10-04T00:00:00Z")).rejects.toMatchObject({kind: "protocol"});
  });
  it("accepts server net zero while retaining all terminal groups in the counts", async () => {
    const payload = snapshot([directEvent("recovery"), directEvent("reversed"), directEvent("rejected")]);
    payload.events[0].status = "recovery_pending"; payload.events[0].recoveryPendingUSDT = 10;
    payload.events[1].status = "reversed";
    Object.assign(payload.events[2], {status: "rejected", amountUSDT: 0, amountNEX: 0});
    payload.split.purchase.amountUSDT = 0; payload.split.purchase.amountNEX = 0;
    const result = await api(payload).snapshot("month");
    expect(result.totalRows).toBe(3); expect(result.split.purchase).toEqual({amountUSDT: 0, amountNEX: 0, count: 3});
    expect(result.events[0].amountUSDT).toBe(60);
  });
  it("accepts independent configured rates without a fixed L1 rule", async () => {
    await expect(api(policy()).policy()).resolves.toMatchObject({ purchase: { totalRatePct: 12.3456 }, deviceEarning: { usdtSharePct: 70 } });
  });
  it("accepts unpublished disabled placeholders and absent price", async () => {
    const payload = { ...policy(), configured: false, policyVersion: 0, effectiveAt: null, nexUsdtPrice: null,
      purchase: { enabled: false, totalRatePct: 0, usdtSharePct: 50, coolingDays: 0 }, deviceEarning: { enabled: false, totalRatePct: 0, usdtSharePct: 50, coolingDays: 0 } };
    await expect(api(payload).policy()).resolves.toMatchObject({ configured: false, nexUsdtPrice: null });
  });
  it.each([0, 100, -1, 101, NaN, "60"])("rejects enabled invalid split %s", async share => {
    const payload = policy(); Object.assign(payload.purchase, { usdtSharePct: share });
    await expect(api(payload).policy()).rejects.toMatchObject({ kind: "protocol" });
  });
  it.each([{ sourceEnvironment: "SANDBOX" }, { runId: "other-run" }, { runId: null }, { serverCanonical: false }, { nexUsdtPrice: 0 }, { policyVersion: 1.5 }, { configured: false }])("rejects invalid authority and policy %j", async mutation => {
    await expect(api({ ...policy(), ...mutation }).policy()).rejects.toMatchObject({ kind: "protocol" });
  });
  it("keeps the complete aggregate independently of page data and carries snapshotAt", async () => {
    const payload = { ...snapshot([directEvent("last")]), page: 2, totalRows: 21,
      split: {purchase: {amountUSDT: 60, amountNEX: 4000, count: 21}, deviceEarning: {amountUSDT: 0, amountNEX: 0, count: 0}} };
    const request = vi.fn().mockResolvedValue(payload);
    const result = await createDirectReferralApi({ request } as unknown as ApiClient).snapshot("month", 2, 20, payload.snapshotAt);
    expect(result.split.purchase.amountNEX).toBe(4000);
    expect(request.mock.calls[0][0].path).toContain("page=2&pageSize=20&snapshotAt=2026-10-05T00%3A00%3A00Z");
  });
  it.each(["cooling", "unlocked", "frozen", "reversed", "recovery_pending"])("retains paired amounts for %s", status => {
    expect(parseDirectReferralEvent({ ...directEvent(), status, recoveryPendingUSDT: 3, recoveryPendingNEX: 4 })).toMatchObject({ status, amountUSDT: 60, amountNEX: 4000, recoveryPendingUSDT: 3, recoveryPendingNEX: 4 });
  });
  it.each([{ sourceUserId: "private-member" }, { kind: "unilevel" }, { sourceRef: "" }, { status: "paid" }, { policyVersion: 0 }, { nexUsdtPrice: 0 }, { amountNEX: -1 }, { ts: NaN }])("rejects malformed or private event %j", mutation => {
    expect(() => parseDirectReferralEvent({ ...directEvent(), ...mutation })).toThrow();
  });
  it("rejects missing device proof, invalid pages and duplicate records", async () => {
    expect(() => parseDirectReferralEvent({ ...directEvent(), kind: "direct_device_earning" })).toThrow();
    await expect(api(snapshot()).snapshot("month", 0)).rejects.toMatchObject({ kind: "protocol" });
    await expect(api(snapshot([directEvent(), directEvent()])).snapshot("month")).rejects.toMatchObject({ kind: "protocol" });
  });
  it("keeps an unissued rejection record with no effective price or policy without treating it as paid", () => {
    expect(parseDirectReferralEvent({ ...directEvent(), status: "rejected", nexUsdtPrice: null, policyVersion: 0, basisUsdt: 0, amountUSDT: 0, amountNEX: 0 }))
      .toMatchObject({ status: "rejected", nexUsdtPrice: null, policyVersion: 0, amountUSDT: 0 });
  });
  it("accepts immediate or delayed settlement whose source-based release precedes record creation", () => {
    const event = { ...directEvent(), unlockAt: directEvent().ts - 3600000 };
    expect(parseDirectReferralEvent(event)).toMatchObject({ unlockAt: event.unlockAt, status: "unlocked" });
  });
  it.each(["amountUSDT", "amountNEX", "recoveryPendingUSDT", "recoveryPendingNEX"])("rejects a rejected audit record with a positive %s", field => {
    expect(() => parseDirectReferralEvent({ ...directEvent(), status: "rejected", amountUSDT: 0, amountNEX: 0, [field]: 1 })).toThrow();
  });
});
