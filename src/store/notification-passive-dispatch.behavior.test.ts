import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, disposePinia, getActivePinia, setActivePinia } from "pinia";
import { watch } from "vue";
import type { HttpResponse } from "@/api/api-client";
const fixture=vi.hoisted(()=>({api:null as any,vault:null as any,config:{environment:"dev",baseUrl:"https://test.invalid"}}));
vi.mock("@/api/runtime",()=>({remoteApiEnabled:true,notificationApi:fixture.api,apiRuntimeConfig:fixture.config,sessionVault:fixture.vault}));
let calls=0, mode:"ready"|"failed"="ready", pending:Promise<HttpResponse>|null=null;
const response=(id=0):HttpResponse=>({status:200,headers:{},data:{code:0,message:"ok",data:{items:id?[{id,kind:"system",priority:"normal",title:"Confirmed",body:"",ctaLabel:"",ctaHref:"",createdAt:id,readAt:null}]:[],unread:id?1:0,nextCursor:null}}});
function deferred(){let resolve!:(value:HttpResponse)=>void;const promise=new Promise<HttpResponse>(done=>{resolve=done});return{promise,resolve};}
beforeEach(async()=>{
  vi.resetModules();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(0);setActivePinia(createPinia());calls=0;mode="ready";pending=null;
  const {createSessionVault}=await import("@/api/session-vault"),{createApiClient}=await import("@/api/api-client"),{createNotificationApi}=await import("@/api/notification-api");
  fixture.vault=createSessionVault();fixture.vault.save({accessToken:"a",refreshToken:"r",tokenType:"Bearer",user:{userId:1,countryCode:"+84",phone:"12345678",nickname:"Fixture",onboardingComplete:true}});
  fixture.api=createNotificationApi(createApiClient({baseUrl:fixture.config.baseUrl,vault:fixture.vault,transport:{request:async()=>{calls+=1;if(pending)return pending;if(mode==="failed")return{status:503,headers:{},data:{code:503,message:"unavailable",data:null}};return response();}}}));
});
afterEach(()=>{const pinia=getActivePinia();if(pinia)disposePinia(pinia);vi.useRealTimers();});
async function setup(){const {useNotifications}=await import("./notifications"),passive=await import("@/lib/passive-tab-read");const store=useNotifications();return{store,...passive,
  page:()=>passive.runPassiveTabRead("notifications",()=>store.refreshRemote(),undefined,()=>store.hasRemoteSnapshot&&!store.loading&&!store.error),
  burst:()=>{passive.notifyPageActivation("home");for(const route of ["earn","team","store"]){passive.notifyPageActivation(route,{tabSwitch:true});}}};}

it("remembers a successful actual raw poll with legally absent actionable summary during protection",async()=>{
  const r=await setup();expect(r.store.hasRemoteSnapshot).toBe(false);await r.store.refreshRemote();
  expect(r.store.hasRemoteSnapshot).toBe(true);expect(r.store.actionableUnread).toBeNull();r.burst();await r.page();expect(calls).toBe(1);
  r.notifyPageActivation("me",{tabSwitch:true});await r.page();expect(calls).toBe(1);
});
it("a raw poll's actual successful dispatch is also shared by an existing summary-optional visitor",async()=>{
  const r=await setup();await r.store.refreshRemote();r.burst();
  await r.runPassiveTabRead("notifications",()=>r.store.refreshRemote(),undefined,()=>!r.store.loading&&!r.store.error);
  expect(calls).toBe(1);
});
it("merges raw poll pending across visits and leaves the new visit ready",async()=>{
  const r=await setup(),held=deferred();pending=held.promise;r.notifyPageActivation("home");const raw=r.store.refreshRemote();r.notifyPageActivation("me");const page=r.page();
  expect(calls).toBe(1);held.resolve(response());await Promise.all([raw,page]);expect(r.store.hasRemoteSnapshot).toBe(true);await r.page();expect(calls).toBe(1);
});
it("pre-registers raw dispatch before synchronous loading watchers reenter a page read",async()=>{
  const r=await setup();let nested!:Promise<void>;const off=watch(()=>r.store.loading,value=>{if(value)nested=r.page();},{flush:"sync"});
  await r.store.refreshRemote();await nested;expect(calls).toBe(1);expect(r.store.hasRemoteSnapshot).toBe(true);off();
});
it("keeps manual reads real and replaces an old successful promise after failure",async()=>{
  const r=await setup();await r.store.refreshRemote();r.burst();await r.store.refreshRemote();expect(calls).toBe(2);
  mode="failed";await r.store.refreshRemote();expect(calls).toBe(3);expect(r.store.hasRemoteSnapshot).toBe(false);expect(r.store.error).not.toBeNull();
  mode="ready";r.notifyPageActivation("me",{tabSwitch:true});await r.page();expect(calls).toBe(4);expect(r.store.hasRemoteSnapshot).toBe(true);expect(r.store.error).toBeNull();
});
it("does not mistake a cold cancelled void page read for a successful cache",async()=>{
  const r=await setup(),held=deferred();pending=held.promise;r.notifyPageActivation("home");const first=r.page();r.store.cancelRefresh();held.resolve(response());await first;
  expect(r.store.hasRemoteSnapshot).toBe(false);expect(r.store.error).toBeNull();pending=null;r.burst();await r.page();expect(calls).toBe(2);expect(r.store.hasRemoteSnapshot).toBe(true);
});
it("starts a current protected visit before a cancelled cold transport settles",async()=>{
  const r=await setup(),held=deferred();pending=held.promise;r.burst();const old=r.page();r.store.cancelRefresh();
  expect(r.store.hasRemoteSnapshot).toBe(false);expect(r.store.error).toBeNull();
  pending=null;r.notifyPageActivation("me",{tabSwitch:true});await r.page();
  expect(calls).toBe(2);expect(r.store.hasRemoteSnapshot).toBe(true);
  held.resolve(response(1));await old;expect(r.store.items).toEqual([]);expect(r.store.hasRemoteSnapshot).toBe(true);
});
it("a previous account's pending success cannot confirm a current cold owner",async()=>{
  const r=await setup(),old=deferred(),current=deferred();pending=old.promise;const first=r.store.refreshRemote();pending=current.promise;r.store.bindAccount("other");
  old.resolve(response(1));await first;expect(r.store.hasRemoteSnapshot).toBe(false);expect(r.store.items).toEqual([]);
  current.resolve(response(2));await r.page();expect(calls).toBe(2);expect(r.store.hasRemoteSnapshot).toBe(true);expect(r.store.items.map(row=>row.id)).toEqual(["2"]);
});
it("a raw read cancelled before dispatch does not seed a successful empty snapshot",async()=>{
  const r=await setup();await r.store.refreshRemote(undefined,()=>false);expect(calls).toBe(0);expect(r.store.hasRemoteSnapshot).toBe(false);
  r.burst();await r.page();expect(calls).toBe(1);expect(r.store.hasRemoteSnapshot).toBe(true);
});
