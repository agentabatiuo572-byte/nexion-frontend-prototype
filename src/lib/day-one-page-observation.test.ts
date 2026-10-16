import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ remoteStatus: "ready", remoteQuests: [] as {layer:string;questCode:string;instanceKey:string}[], refreshRemote: vi.fn() }));
vi.mock("@/store/quest", () => ({useQuest: () => state}));
import { reportDayOnePageObservation } from "./day-one-page-observation";
import { dayOneObservationRecovery } from "./day-one-observation-recovery";
import { ApiError } from "@/api/errors";
let epoch=10;
beforeEach(()=>{ epoch++; state.remoteStatus="ready";state.remoteQuests=[];state.refreshRemote.mockReset(); });
const row=()=>({layer:"DAY_ONE",questCode:"visit_earn",instanceKey:"DAY_ONE:adapter"});
function request() {return {scope:{accountKey:"user:7",epoch},session:{accessToken:"access",user:{userId:7}},visible:()=>true,isCurrent:()=>true,
 submit:vi.fn().mockRejectedValue(new ApiError({kind:"http",status:428,code:428,message:"USER_ONBOARDING_REQUIRED"}))};}
describe("production day-one observation adapter",()=>{
 it("loads the frozen task identity before reporting and makes its rejection visible",async()=>{
   const input=request(); state.remoteStatus="loading";
   state.refreshRemote.mockImplementation(async()=>{state.remoteQuests=[row()];state.remoteStatus="ready";});
   await reportDayOnePageObservation("visit_earn",input);
   expect(input.submit).toHaveBeenCalledTimes(1);
   expect(dayOneObservationRecovery.notice({...input,questCode:"visit_earn",instanceKey:row().instanceKey})).toBe("onboarding");
 });
 it("does not submit under a late snapshot after account departure",async()=>{
   const input=request(); let current=true;input.isCurrent=()=>current;state.remoteStatus="loading";
   state.refreshRemote.mockImplementation(async()=>{current=false;state.remoteQuests=[row()];});
   await reportDayOnePageObservation("visit_earn",input);expect(input.submit).not.toHaveBeenCalled();
 });
 it("never invents an instance when the requested frozen task is absent",async()=>{
   const input=request();await reportDayOnePageObservation("visit_earn",input);expect(input.submit).not.toHaveBeenCalled();
 });
});
