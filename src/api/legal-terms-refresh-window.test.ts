import { describe,expect,it,vi } from "vitest";
import { createApiClient, type HttpResponse } from "./api-client";
import { createSessionVault } from "./session-vault";
import { createLegalTermsApi } from "./legal-terms-api";
const user={userId:7,countryCode:"+86",phone:"13800000007",nickname:"Fixture",onboardingComplete:true};
const session=(token:string)=>({accessToken:token,refreshToken:"",refreshCredentialMode:"cookie" as const,tokenType:"Bearer",user});
const envelope=(data:unknown):HttpResponse=>({status:200,data:{code:0,message:"success",data},headers:{}});
const rejected:HttpResponse={status:200,data:{code:401,message:"USER_AUTH_REQUIRED",data:null},headers:{}};
const snapshot=(acknowledged:boolean)=>({source:"server",sourceEnvironment:"PRODUCTION",runId:"",version:"v6",requestedLocale:"zh",resolvedLocale:"zh",requestedJurisdiction:"GLOBAL",resolvedJurisdiction:"GLOBAL",provenance:"exact",title:"Fixture terms",summary:"Fixture",effectiveAt:"2026-09-01 00:00:00",sections:[{key:"a",title:"Fixture",body:"Fixture only",sortOrder:0}],acknowledged,acknowledgedAt:acknowledged?"2026-09-18 11:38:00":null});
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
describe("legal read during refresh response window",()=>{
 it("waits for the single refresh and replays invalid-identity current with the new bearer",async()=>{
  const vault=createSessionVault();vault.save(session("old"));const revision=vault.revision();const refresh=deferred<HttpResponse>();
  const request=vi.fn(async (r:any)=>r.url.endsWith("/auth/users/refresh")?refresh.promise:r.headers.Authorization==="Bearer old"?rejected:envelope(snapshot(true)));
  const client=createApiClient({baseUrl:"https://fixture.invalid",vault,transport:{request},refreshCredentialMode:"cookie"});
  const probing=client.refreshSession();const current=createLegalTermsApi(client).current("zh","GLOBAL",true);
  await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
  refresh.resolve(envelope({...session("new"),refreshToken:null}));await probing;
  expect(await current).toMatchObject({version:"v6",acknowledged:true});
  expect(request.mock.calls.filter(([r])=>r.url.endsWith("/auth/users/refresh"))).toHaveLength(1);
  expect(request.mock.calls.at(-1)?.[0].headers.Authorization).toBe("Bearer new");
  expect(vault.isRefreshContinuation(revision)).toBe(true);
 });
 it("documents why anonymous success cannot trigger ApiClient's auth recovery",async()=>{
  const vault=createSessionVault();vault.save(session("old"));const request=vi.fn(async()=>envelope(snapshot(false)));
  const client=createApiClient({baseUrl:"https://fixture.invalid",vault,transport:{request},refreshCredentialMode:"cookie"});
  expect(await createLegalTermsApi(client).current("zh","GLOBAL",true)).toMatchObject({acknowledged:false});
  expect(request).toHaveBeenCalledTimes(1);
 });
 it.each(["request","upload"])("never borrows same-user re-login credentials to retry an old %s",async mode=>{
  const vault=createSessionVault();vault.save(session("old"));const first=deferred<HttpResponse>();
  const send=vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(envelope({ok:true}));
  const client=createApiClient({baseUrl:"https://fixture.invalid",vault,transport:{request:send,upload:send},refreshCredentialMode:"cookie"});
  const pending=mode==="request"?client.request({path:"/api/legal/terms/acknowledgment",method:"POST"}):client.upload({path:"/upload",filePath:"fixture"});
  const rejectedPromise=expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_REQUEST");
  vault.clear();vault.save(session("same-user-new-login"));first.resolve(rejected);
  await rejectedPromise;expect(send).toHaveBeenCalledTimes(1);
 });
});
