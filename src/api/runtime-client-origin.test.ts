import { afterEach, expect, it, vi } from "vitest";
import { createRuntimeApiClient } from "./runtime-client";
import { createSessionVault } from "./session-vault";
import { ApiError } from "./errors";
import type { ApiRuntimeConfig } from "./runtime-config";
import type { HttpResponse } from "./api-client";

const response=(data:unknown):HttpResponse=>({status:200,headers:{},data:{code:0,message:"OK",data}});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(cause:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject};}
function setup(){
  const config:ApiRuntimeConfig={environment:"dev",baseUrl:"https://fixture.invalid"},vault=createSessionVault();
  vault.save({accessToken:"fixture",refreshToken:"refresh",tokenType:"Bearer",user:{userId:7,countryCode:"+84",phone:"900000007",nickname:"fixture",onboardingComplete:true}});
  const request=vi.fn().mockResolvedValue(response("read")),upload=vi.fn().mockResolvedValue(response({receipt:"uploaded"})),download=vi.fn().mockResolvedValue({status:200,filePath:"/fixture/file"});
  return{config,request,upload,download,client:createRuntimeApiClient({config,vault,transport:{request,upload,download},development:true})};
}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

it.each(["environment","baseUrl"])("blocks all new transport methods after %s changes",async field=>{
  const f=setup();if(field==="environment")f.config.environment="prod";else f.config.baseUrl="https://other.invalid";
  for(const method of ["GET","POST"] as const)await expect(f.client.request({path:"/api/fixture",method})).rejects.toMatchObject({kind:"configuration",message:"API_RUNTIME_ORIGIN_CHANGED"});
  await expect(f.client.upload({path:"/api/upload",filePath:"/fixture/input"})).rejects.toMatchObject({kind:"configuration"});
  await expect(f.client.download!({path:"/api/download"})).rejects.toMatchObject({kind:"configuration"});
  expect(f.request).not.toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled();expect(f.download).not.toHaveBeenCalled();
});

it.each(["environment","baseUrl"])("rejects a pending GET success after %s changes",async field=>{
  const f=setup(),held=deferred<HttpResponse>();f.request.mockReturnValueOnce(held.promise);const pending=f.client.request({path:"/api/fixture"});
  if(field==="environment")f.config.environment="prod";else f.config.baseUrl="https://other.invalid";
  held.resolve(response({accepted:true}));await expect(pending).rejects.toMatchObject({kind:"configuration",message:"API_RUNTIME_ORIGIN_CHANGED"});expect(f.request).toHaveBeenCalledTimes(1);
});

it("rejects an old GET even after an observed B-to-A return while accepting new same-origin reads",async()=>{
  const f=setup(),held=deferred<HttpResponse>();f.request.mockReturnValueOnce(held.promise);const old=f.client.request({path:"/api/old"});
  f.config.baseUrl="https://other.invalid";await expect(f.client.request({path:"/api/blocked"})).rejects.toMatchObject({kind:"configuration"});
  f.config.baseUrl="https://fixture.invalid";expect(await f.client.request({path:"/api/new"})).toBe("read");
  held.resolve(response("old"));await expect(old).rejects.toMatchObject({kind:"configuration"});expect(f.request).toHaveBeenCalledTimes(2);
});

it("checks failed GET settlement too, but preserves its original error under an unchanged origin",async()=>{
  const f=setup(),held=deferred<HttpResponse>(),failure=new ApiError({kind:"network",message:"original",retryable:true});
  f.request.mockReturnValueOnce(held.promise);const old=f.client.request({path:"/api/old"});f.config.environment="prod";held.reject(failure);
  await expect(old).rejects.toMatchObject({kind:"configuration",message:"API_RUNTIME_ORIGIN_CHANGED"});
  f.config.environment="dev";f.request.mockRejectedValueOnce(failure);await expect(f.client.request({path:"/api/current"})).rejects.toBe(failure);
});

it("does not turn concurrent same-origin GETs into a latest-request-only stream or response cache",async()=>{
  const f=setup(),first=deferred<HttpResponse>(),second=deferred<HttpResponse>();f.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const a=f.client.request({path:"/api/fixture"}),b=f.client.request({path:"/api/fixture"});second.resolve(response("second"));expect(await b).toBe("second");first.resolve(response("first"));expect(await a).toBe("first");
  expect(await f.client.request({path:"/api/fixture"})).toBe("read");expect(f.request).toHaveBeenCalledTimes(3);
});

it.each(["POST","PUT","PATCH","DELETE"] as const)("preserves a submitted %s success receipt through later origin drift",async method=>{
  const f=setup(),held=deferred<HttpResponse>(),receipt={receipt:"committed",amount:7};f.request.mockReturnValueOnce(held.promise);
  const pending=f.client.request({path:"/api/command",method,body:{amount:7},idempotencyKey:"one-command"});expect(f.request).toHaveBeenCalledTimes(1);
  f.config.baseUrl="https://other.invalid";await expect(f.client.request({path:"/api/blocked"})).rejects.toMatchObject({kind:"configuration"});held.resolve(response(receipt));
  await expect(pending).resolves.toBe(receipt);expect(f.request).toHaveBeenCalledTimes(1);expect(f.request.mock.calls[0][0]).toMatchObject({method,headers:{"Idempotency-Key":"one-command"},body:{amount:7}});
});

it("preserves the original submitted POST failure rather than replacing it with an origin error",async()=>{
  const f=setup(),held=deferred<HttpResponse>();f.request.mockReturnValueOnce(held.promise);const pending=f.client.request({path:"/api/command",method:"POST"});
  f.config.environment="prod";held.resolve({status:503,headers:{},data:{code:503,message:"UNKNOWN_COMMAND_RESULT",data:null}});
  await expect(pending).rejects.toMatchObject({kind:"http",status:503,message:"UNKNOWN_COMMAND_RESULT"});expect(f.request).toHaveBeenCalledTimes(1);
});

it("keeps an already submitted upload receipt intact but rejects old download bytes",async()=>{
  const f=setup(),upload=deferred<HttpResponse>(),download=deferred<{status:number;filePath:string}>();f.upload.mockReturnValueOnce(upload.promise);f.download.mockReturnValueOnce(download.promise);
  const write=f.client.upload({path:"/api/upload",filePath:"/fixture/input"}),read=f.client.download!({path:"/api/download"});
  f.config.baseUrl="https://other.invalid";const receipt={receipt:"uploaded"};upload.resolve(response(receipt));download.resolve({status:200,filePath:"/old/file"});
  await expect(write).resolves.toBe(receipt);await expect(read).rejects.toMatchObject({kind:"configuration"});expect(f.upload).toHaveBeenCalledTimes(1);expect(f.download).toHaveBeenCalledTimes(1);
});

it("keeps an observed ABA old download fenced and a current same-origin download usable",async()=>{
  const f=setup(),held=deferred<{status:number;filePath:string}>();f.download.mockReturnValueOnce(held.promise);const old=f.client.download!({path:"/api/download"});
  f.config.environment="prod";await expect(f.client.upload({path:"/api/upload",filePath:"/fixture/input"})).rejects.toMatchObject({kind:"configuration"});
  f.config.environment="dev";expect(await f.client.download!({path:"/api/download"})).toBe("/fixture/file");held.resolve({status:200,filePath:"/old/file"});await expect(old).rejects.toMatchObject({kind:"configuration"});expect(f.download).toHaveBeenCalledTimes(2);
});

it("does not log a refused read as a real transport dispatch",async()=>{
  vi.stubEnv("MODE","development");vi.stubEnv("VITE_NEXGRID_TAB_READ_TRACE","1");const log=vi.spyOn(console,"info").mockImplementation(()=>{}),f=setup();
  f.config.baseUrl="https://other.invalid";await expect(f.client.request({path:"/api/blocked"})).rejects.toMatchObject({kind:"configuration"});expect(log).not.toHaveBeenCalled();
  f.config.baseUrl="https://fixture.invalid";await f.client.request({path:"/api/current?private=hidden"});expect(log).toHaveBeenCalledTimes(1);expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({sequence:1,method:"GET",path:"/api/current"});
});
