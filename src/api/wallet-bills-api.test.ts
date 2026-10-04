import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createWalletBillsApi, parseWalletBillsSnapshot, parseWalletBillsSummary } from "./wallet-bills-api";
const summary = () => ({source:"server",sourceEnvironment:"PRODUCTION",asOf:"2026-08-31T10:00:00Z",timeZone:"Asia/Shanghai",rewardsUsdt:"12.000001",rewardsNex:2202,latestRewardAt:null,todayNexEarn:-1,pendingNex:3,monthBillCount:1101,recentNexBills:[]});
describe("wallet summary and paginated API contract", () => {
  const snapshot = () => ({source:"server",sourceEnvironment:"PRODUCTION",bills:[],page:1,pageSize:50,total:0,nextPage:null,nextCursor:null});
  it.each([{page:"1"},{page:0},{pageSize:0},{pageSize:101},{total:-1},{total:null},{nextPage:"2"},{nextPage:1},{nextCursor:""}])("rejects malformed pagination instead of truncating history %s", fields => {
    expect(() => parseWalletBillsSnapshot({...snapshot(),...fields})).toThrow("WALLET_BILLS_RESPONSE_INVALID");
  });
  it("preserves an opaque cursor's bytes without trimming", () => {
    expect(parseWalletBillsSnapshot({...snapshot(),nextCursor:" opaque-token "}).nextCursor).toBe(" opaque-token ");
  });
  it("keeps the controlled category, presentation code and public reference", () => {
    const parsed = parseWalletBillsSnapshot({...snapshot(), total: 1, bills: [{
      id: "WL-1", bizNo: "ORD-42", bizType: "ORDER_PURCHASE", asset: "USDT", direction: "OUT", amount: "12.5",
      balanceAfter: "37.5", status: "SUCCESS", remark: "internal settlement", createdAt: "2026-09-07T10:00:00Z",
      category: "purchase", presentationCode: "purchase", publicReference: "ORD-42",
    }]});
    expect(parsed.bills[0]).toMatchObject({ category: "purchase", presentationCode: "purchase", publicReference: "ORD-42" });
  });
  it("parses exact server totals and allows signed earnings", () => {
    expect(parseWalletBillsSummary(summary())).toMatchObject({rewardsUsdt:12.000001,rewardsNex:2202,todayNexEarn:-1,asOf:Date.parse("2026-08-31T10:00:00Z")});
  });
  it("keeps settled Daily totals separate from gross rewards and supports older servers as unknown", () => {
    expect(parseWalletBillsSummary(summary())).toMatchObject({ settledRewardsNex: null, withdrawalOffsetNexSpent: null });
    expect(parseWalletBillsSummary({ ...summary(), settledRewardsNex: "199", withdrawalOffsetNexSpent: "18" }))
      .toMatchObject({ rewardsNex: 2202, settledRewardsNex: 199, withdrawalOffsetNexSpent: 18 });
  });
  it.each(["", true, "NaN", Infinity, -1])("rejects malformed Daily totals %s", value => {
    for (const key of ["settledRewardsNex", "withdrawalOffsetNexSpent"]) {
      expect(() => parseWalletBillsSummary({ ...summary(), [key]: value })).toThrow("WALLET_BILLS_RESPONSE_INVALID");
    }
  });
  it.each([null, "", true, "NaN", Infinity])("rejects a malformed required amount %s", value => {
    expect(() => parseWalletBillsSummary({...summary(),rewardsNex:value})).toThrow("WALLET_BILLS_RESPONSE_INVALID");
  });
  it.each([{monthBillCount:1.5},{latestRewardAt:"invalid"},{timeZone:""},{asOf:"invalid"},{recentNexBills:null},{sourceEnvironment:"SANDBOX"}])("fails closed for malformed metadata %s", fields => {
    expect(() => parseWalletBillsSummary({...summary(),...fields})).toThrow("WALLET_BILLS_RESPONSE_INVALID");
  });
  it("encodes cursor and server filters; summary is a separate endpoint", async () => {
    const request = vi.fn().mockResolvedValueOnce({source:"server",sourceEnvironment:"PRODUCTION",bills:[],page:2,pageSize:50,total:0,nextPage:null,nextCursor:null}).mockResolvedValueOnce(summary());
    const api = createWalletBillsApi({request} as unknown as ApiClient);
    await api.list(2,50,{asset:"NEX",direction:"IN",category:"REWARD",cursor:"a+b/=x"}); await api.summary();
    const url = new URL(request.mock.calls[0][0].path,"http://local");
    const query: Record<string, string> = {}; url.searchParams.forEach((value, key) => { query[key] = value; });
    expect(query).toEqual({page:"2",pageSize:"50",asset:"NEX",direction:"IN",category:"REWARD",cursor:"a+b/=x"});
    expect(request.mock.calls[1][0].path).toBe("/api/app/wallet/bills/summary");
  });
});
