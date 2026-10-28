import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref, watch, reactive } from "vue";
import { createPinia, disposePinia, getActivePinia, setActivePinia } from "pinia";
import ts from "typescript";
import teamSource from "@/pages/team/team.vue?raw";
import inviteSource from "@/components/team/invite-earn-card.vue?raw";
const f=vi.hoisted(()=>({config:null as any,api:null as any,vault:null as any}));
vi.mock("@/api/runtime",()=>({remoteApiEnabled:true,get apiRuntimeConfig(){return f.config},get productCatalogApi(){return f.api},get sessionVault(){return f.vault}}));
vi.mock("@/mock/products",()=>({clearProductCatalog:vi.fn(),replaceProductCatalog:vi.fn()}));
const snapshot={products:[],source:"nx_product",sourceEnvironment:"PRODUCTION",runId:"",serverCanonical:true,revision:"confirmed"};
const user={userId:1,countryCode:"+84",phone:"12345678",nickname:"Fixture",onboardingComplete:true};
const session=(accessToken="fixture")=>({accessToken,refreshToken:"fixture-refresh",tokenType:"Bearer",user});
let mode="ready", held:any, requests:string[]=[],client:any;
beforeEach(async()=>{
  vi.resetModules();setActivePinia(createPinia());mode="ready";held=null;requests=[];f.config=reactive({environment:"dev",baseUrl:"https://test.invalid"});
  vi.stubGlobal("crypto",{randomUUID:()=>"00000000-0000-4000-8000-000000000001"});
  vi.stubGlobal("uni",{getStorageSync:()=>"",setStorageSync:()=>{},request:(request:any)=>{requests.push(request.url);
    const send=()=>{if(mode==="offline"||mode==="timeout")request.fail({errMsg:mode==="timeout"?"request:fail timeout":"request:fail network unavailable"});
      else if(mode==="503")request.success({statusCode:503,header:{},data:{code:503,message:"unavailable",data:null}});
      else if(mode==="403"||mode==="401")request.success({statusCode:Number(mode),header:{},data:{code:Number(mode),message:"denied",data:null}});
      else if(mode==="invalid")request.success({statusCode:200,header:{},data:{code:0,message:"ok",data:{...snapshot,serverCanonical:false}}});
      else request.success({statusCode:200,header:{},data:{code:0,message:"ok",data:request.url.includes("/auth/users/refresh")?session("rotated"):snapshot}});};
    if(mode==="held")held=send;else send();return{abort:()=>{}};}});
  const {createSessionVault}=await import("@/api/session-vault"),{createUniHttpTransport}=await import("@/api/api-client"),{createRuntimeApiClient}=await import("@/api/runtime-client"),{createProductCatalogApi}=await import("@/api/product-catalog-api");
  f.vault=createSessionVault();f.vault.save(session());client=createRuntimeApiClient({config:f.config,vault:f.vault,transport:createUniHttpTransport(),development:true,nativeRefreshRecovery:true});f.api=createProductCatalogApi(client);
});
afterEach(()=>{const pinia=getActivePinia();if(pinia)disposePinia(pinia);vi.unstubAllGlobals();});
function consumer(raw:string,c:any){const script=raw.split('<script setup lang="ts">')[1].split('</script>')[0],ast=ts.createSourceFile("consumer.ts",script,ts.ScriptTarget.Latest,true);
  let declaration:ts.VariableDeclaration|undefined;for(const node of ast.statements)if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)if(d.name.getText(ast)==="displayCatalogValid")declaration=d;
  expect(declaration?.initializer).toBeDefined();const js=ts.transpileModule("return "+declaration!.initializer!.getText(ast)+";",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function("computed","displayEnvironmentInvalidated","productCatalogDisplayProof","isProductCatalogDisplayCurrent","productCatalogState",js)(computed,ref(false),c.productCatalogDisplayProof,c.isProductCatalogDisplayCurrent,c.productCatalogState);
}
async function warm(){const c=await import("./product-catalog");expect(await c.refreshProductCatalog(true)).toBe(true);return c;}

it.each(["offline","timeout","503"])("actual native %s preserves both actual consumer predicates through repeated error/loading/error while authority stays unavailable",async failure=>{
  const c=await warm(),valid=[consumer(teamSource,c),consumer(inviteSource,c)],history=[ref(1313.69),ref(.02)],states:boolean[][]=[];
  const stops=valid.map((view,i)=>watch(view,(okay:boolean)=>{if(!okay)history[i].value=null as any;},{flush:"sync"}));
  const stop=watch(()=>[c.productCatalogState.status,c.productCatalogDisplayProof.value],()=>states.push(valid.map(v=>v.value)),{flush:"sync"});
  mode=failure;for(let visit=0;visit<3;visit++){const read=c.refreshProductCatalog(true);expect(valid.every(v=>v.value)).toBe(true);expect(await read).toBe(false);expect(history.map(v=>v.value)).toEqual([1313.69,.02]);}
  expect(states.every(row=>row.every(Boolean))).toBe(true);expect(c.productCatalogState).toMatchObject({status:"error",serverCanonical:false,sourceEnvironment:"",revision:null});expect(c.isProductCatalogDisplayCurrent()).toBe(true);expect(requests.filter(p=>p.endsWith("/api/store/catalog"))).toHaveLength(4);stop();stops.forEach(fn=>fn());
});
it.each(["403","401","invalid"])("actual strict %s revokes current display proof instead of retaining it as temporary",async failure=>{
  const c=await warm(),valid=[consumer(teamSource,c),consumer(inviteSource,c)];mode=failure;expect(await c.refreshProductCatalog(true)).toBe(false);expect(valid.map(v=>v.value)).toEqual([false,false]);expect(c.productCatalogDisplayProof.value).toBeNull();expect(c.productCatalogState.serverCanonical).toBe(false);
});
it.each(["prepare","write","environment","baseUrl"])("current proof cannot cross %s or be restored by its old native response",async boundary=>{
  const c=await warm(),valid=[consumer(teamSource,c),consumer(inviteSource,c)];mode="held";const old=c.refreshProductCatalog(true);const finish=held;
  if(boundary==="prepare")c.prepareProductCatalog();if(boundary==="write")(await import("@/api/order-api")).advanceRuntimeRevision("write");if(boundary==="environment")f.config.environment="prod";if(boundary==="baseUrl")f.config.baseUrl="https://other.invalid";
  expect(valid.map(v=>v.value)).toEqual([false,false]);mode="ready";finish();expect(await old).toBe(false);expect(c.productCatalogDisplayProof.value).toBeNull();expect(c.productCatalogState.serverCanonical).toBe(false);
});
it("native refresh network failures leave vault revision, bearer and passive auth binding unchanged; a legitimate rotation continues that binding",async()=>{
  const {passiveTabReadScope}=await import("@/lib/passive-tab-read"),scope=passiveTabReadScope(),revision=f.vault.revision(),current=f.vault.read();mode="offline";
  await expect(client.refreshSession()).rejects.toMatchObject({kind:"network",message:"NETWORK_UNAVAILABLE"});await expect(client.refreshSession()).rejects.toMatchObject({kind:"network"});
  expect(f.vault.revision()).toBe(revision);expect(f.vault.read()).toEqual(current);expect(passiveTabReadScope()).toBe(scope);
  mode="ready";await client.refreshSession();expect(f.vault.revision()).toBe(revision+1);expect(f.vault.isRefreshContinuation(revision)).toBe(true);expect(passiveTabReadScope()).toBe(scope);
  mode="401";await expect(client.refreshSession()).rejects.toMatchObject({kind:"auth"});expect(f.vault.read()).toBeNull();expect(passiveTabReadScope()).not.toBe(scope);
});
