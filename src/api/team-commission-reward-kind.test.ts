import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTeamInsightsApi } from "./team-insights-api";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import page from "@/pages/team/commissions.vue?raw";

function snapshot(kind: string) {
  const ts=Date.parse("2026-10-06T07:23:14Z"), unlockAt=Date.parse("2026-11-05T07:23:14Z");
  const byKind: Record<string, {usdt:number;nex:number;count:number}> = Object.fromEntries(
    ["unilevel","binary","peer","cultivation","leadership","genesis"].map(k=>[k,{usdt:0,nex:0,count:0}]));
  byKind[kind]={usdt:100,nex:50,count:2};
  return {source:"server",serverCanonical:true,sourceEnvironment:"PRODUCTION",runId:"",
    events:[{id:"CM-389",kind,sourceUserName:"Rank V1",orderId:"PROMOTION-1",amountUSDT:100,amountNEX:0,ts,unlockAt,status:"cooling",withdrawable:false},
      {id:"CM-390",kind,sourceUserName:"Rank V1",orderId:"PROMOTION-1",amountUSDT:0,amountNEX:50,ts,unlockAt,status:"cooling",withdrawable:false}],
    page:1,pageSize:20,totalRows:2,generatedAt:"2026-10-16T00:00:00Z",
    aggregate:{totalUSDT:100,totalNEX:50,directUSDT:0,extendedUSDT:100,contributorCount:1,
      monthUSDT:100,monthNEX:50,todayUSDT:0,unlockedUSDT:0,unlockedNEX:0,coolingUSDT:100,eventCount:2,nextUnlockAt:unlockAt,byKind}};
}
function api(value: unknown) {return createTeamInsightsApi({request:vi.fn().mockResolvedValue(value)} as unknown as ApiClient);}
describe("commission reward classifications",()=>{
  it.each(["promotion","other","genesis","unilevel"])("preserves %s events, both currencies, cooling and references",async kind=>{
    const raw=snapshot(kind);const value=await api(raw).commissions();
    expect(value.events).toMatchObject(raw.events);
    expect(value.aggregate.byKind[kind as keyof typeof value.aggregate.byKind]).toEqual({usdt:100,nex:50,count:2});
    if(kind!=="genesis")expect(value.aggregate.byKind.genesis).toEqual({usdt:0,nex:0,count:0});
  });
  it("rejects a missing category bucket when the page actually includes that category",async()=>{
    const raw=snapshot("promotion");delete raw.aggregate.byKind.promotion;
    await expect(api(raw).commissions()).rejects.toMatchObject({message:"TEAM_INSIGHTS_RESPONSE_INVALID"});
  });
  it("rejects arbitrary wire kinds rather than silently relabeling client-side",async()=>{
    await expect(api(snapshot("future_wire_kind")).commissions()).rejects.toMatchObject({message:"TEAM_INSIGHTS_RESPONSE_INVALID"});
  });
  it("exposes separate translated promotion and other filters through the actual commission page",()=>{
    for(const locale of [en,zh,vietnamese]){
      expect(locale.commissions.kind).toHaveProperty("promotion");expect(locale.commissions.kind).toHaveProperty("other");
      const labels=locale.commissions.kind as Record<string,string>;
      expect(labels.promotion).not.toEqual(labels.genesis);expect(labels.other).not.toEqual(labels.genesis);
    }
    expect(page).toMatch(/KIND_ORDER[^;]+"promotion"/);expect(page).toMatch(/KIND_ORDER[^;]+"other"/);
    expect(page).toContain("events.value.filter((e) => e.kind === filter.value)");
  });
});
