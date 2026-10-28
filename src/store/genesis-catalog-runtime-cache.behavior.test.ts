import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { createPinia, disposePinia, getActivePinia, setActivePinia } from "pinia";
const f=vi.hoisted(()=>({config:null as any,vault:null as any,genesis:null as any,catalog:null as any}));
vi.mock("@/api/runtime",()=>({remoteApiEnabled:true,get apiRuntimeConfig(){return f.config},get sessionVault(){return f.vault},get genesisApi(){return f.genesis},get productCatalogApi(){return f.catalog}}));
vi.mock("@/mock/products",()=>({clearProductCatalog:vi.fn(),replaceProductCatalog:vi.fn()}));
const provenance={serverCanonical:true,sourceEnvironment:"PRODUCTION",runId:""};
const series={seriesCode:"genesis-main",name:"Genesis",totalSupply:1000,soldSupply:0,remainingSupply:1000,priceUsdt:9999,royaltyPct:2.5,dailyEmissionRatePct:0};
const sale={serverCanonical:true,available:true,eligibilityEnabled:true,maxPerUser:5,minAccountAgeDays:0,presaleEnabled:false,showCountdown:false,unitPriceUsdt:9999,open:true};
const eligibility=(stale=false)=>({...provenance,eligible:stale,reasons:[],ownedCount:0,maxPerUser:5,remainingCap:5,minAccountAgeDays:0,accountAgeDays:1,status:stale?"READY":"NOT_ELIGIBLE",reservedAllocation:null,reservedAllocationUnit:"NEX",priorityRank:null,priorityTier:"NONE",qualificationReasonCodes:[],asOf:"2026-10-27T20:00:00Z",serverTime:"2026-10-27T20:00:00Z",provenance:{source:"server",environment:"PRODUCTION",runId:""}});
const publicState=(stale=false)=>({...provenance,halted:false,revision:stale?"old-body":"current-body",source:"nx_emergency_control_setting:killswitch.genesis",series:{...series,...(stale?{soldSupply:999,remainingSupply:1}:{})},market:{enabled:true},emission:{open:false},sale,listings:[],transactions:[],tiers:[{id:"t1",from:0,to:1000,priceUSDT:9999}],tiersVersion:1,marketOpenState:"open",marketOpenStateVersion:1,closedNoticeKey:"default",showcaseEnabled:true,catalogAvailable:true,tradeAvailable:true,tradeBlockedReason:"NONE",marketStats:{floorUsdt:null,volume24hUsdt:null,owners:null,floorDeltaPct:null,lastSaleUsdt:null}});
const account=(stale=false)=>({...provenance,series,sale,marketEnabled:true,emissionOpen:false,holdings:[],emissions:[],orders:[],eligibility:eligibility(stale),walletBalanceUsdt:0});
const product=()=>({id:"device",name:"Fixture device",tier:"Entry",tagline:"",dailyEarn:0,dailyEarnNEX:0,price:10,sold:0,productType:"DEVICE",inventoryMode:"FINITE",stock:4,features:[],available:true});
let catalogBody:any,held:Promise<void>|null,staleBody:boolean,requests:string[],completed:string[];
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
beforeEach(async()=>{
  vi.resetModules();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(0);setActivePinia(createPinia());vi.stubGlobal("uni",{getStorageSync:()=>"",setStorageSync:()=>{}});
  catalogBody={...provenance,source:"nx_product",revision:"same-revision",products:[product()]};held=null;staleBody=false;requests=[];completed=[];f.config=reactive({environment:"dev",baseUrl:"https://test.invalid"});
  const {createSessionVault}=await import("@/api/session-vault"),{createRuntimeApiClient}=await import("@/api/runtime-client"),{createGenesisApi}=await import("@/api/genesis-api"),{createProductCatalogApi}=await import("@/api/product-catalog-api");
  f.vault=createSessionVault();f.vault.save({accessToken:"fixture",refreshToken:"fixture-refresh",tokenType:"Bearer",user:{userId:42,countryCode:"+84",phone:"12345678",nickname:"Fixture",onboardingComplete:true}});
  const client=createRuntimeApiClient({config:f.config,vault:f.vault,development:true,transport:{request:async request=>{
    const url=new URL(request.url),path=url.pathname;requests.push(path);const data=path==="/api/store/catalog"?structuredClone(catalogBody):url.searchParams.has("history")?{...provenance,items:[],nextCursor:null}:path==="/api/genesis/state"?publicState(staleBody):path==="/api/genesis/account"?account(staleBody):eligibility(staleBody);
    if(path.startsWith("/api/genesis/")&&held)await held;completed.push(path);return{status:200,headers:{},data:{code:0,message:"ok",data}};
  }}});f.genesis=createGenesisApi(client,"prod");f.catalog=createProductCatalogApi(client);
});
afterEach(()=>{const pinia=getActivePinia();if(pinia)disposePinia(pinia);vi.useRealTimers();vi.unstubAllGlobals();});
async function setup(){const catalog=await import("./product-catalog"),runtime=await import("@/api/order-api"),helper=await import("@/lib/passive-tab-read"),{useGenesis}=await import("./genesis"),{remoteAccountScope}=await import("@/lib/remote-account-epoch");remoteAccountScope.bind("user:42");
  await catalog.refreshProductCatalog(true);const genesis=useGenesis();genesis.bindAccount("user:42");await flush();expect(genesis.remotePublicReadState).toBe("ready");expect(genesis.remoteAccountReadState).toBe("ready");expect(genesis.remoteEligibility?.eligible).toBe(false);requests=[];completed=[];helper.notifyPageActivation("home");
  const read=()=>helper.runPassiveTabRead("genesis-state",()=>genesis.syncRemote());
  const burst=()=>{for(const tab of ["earn","store","team"])helper.notifyPageActivation(tab,{tabSwitch:true});};
  return{catalog,runtime,helper,genesis,read,burst};}
const genesisCount=()=>requests.filter(path=>path.startsWith("/api/genesis/")).length;

it("an identical actual catalog snapshot does not publish and a confirmed protected Genesis cache adds zero GET",async()=>{
  const r=await setup();expect(await r.read()).toBe(true);expect(genesisCount()).toBe(7);const epoch=r.runtime.captureRuntimeRevision().epoch,scope=r.helper.passiveTabReadScope();
  await r.catalog.refreshProductCatalog(true);expect(r.runtime.captureRuntimeRevision().epoch).toBe(epoch);expect(r.helper.passiveTabReadScope()).toBe(scope);r.burst();
  for(const tab of ["me","home","earn","store","team","me"]){r.helper.notifyPageActivation(tab,{tabSwitch:true});expect(await r.read()).toBe(true);}
  expect(genesisCount()).toBe(7);expect(r.genesis.remoteEligibility?.eligible).toBe(false);
});
it("an unchanged catalog does not orphan a pending actual aggregate and every protected visit joins its seven valid GET",async()=>{
  const r=await setup();let release!:()=>void;held=new Promise<void>(done=>{release=done});const old=r.read(),epoch=r.runtime.captureRuntimeRevision().epoch;
  await r.catalog.refreshProductCatalog(true);expect(r.runtime.captureRuntimeRevision().epoch).toBe(epoch);r.burst();const joined=r.read();expect(genesisCount()).toBe(3);
  held=null;release();expect(await old).toBe(true);expect(await joined).toBe(true);expect(genesisCount()).toBe(7);r.helper.notifyPageActivation("me",{tabSwitch:true});expect(await r.read()).toBe(true);expect(genesisCount()).toBe(7);
});
it.each(["price","stock"])("a same-revision catalog %s change publishes, rejects old successful bodies, then one current protected aggregate succeeds and all later visits hit",async field=>{
  const r=await setup(),scope=r.helper.passiveTabReadScope(),epoch=r.runtime.captureRuntimeRevision().epoch,publicRevision=r.genesis.remotePublicSuccessRevision,accountRevision=r.genesis.remoteAccountSuccessRevision;
  let release!:()=>void;held=new Promise<void>(done=>{release=done});staleBody=true;const old=r.read();expect(genesisCount()).toBe(3);
  catalogBody.products[0][field]=field==="price"?11:3;await r.catalog.refreshProductCatalog(true);expect(r.runtime.captureRuntimeRevision().epoch).toBe(epoch+1);expect(r.helper.passiveTabReadScope()).toBe(scope);
  held=null;staleBody=false;release();expect(await old).toBe(false);expect(genesisCount()).toBe(7);expect(completed.filter(path=>path.startsWith("/api/genesis/"))).toHaveLength(7);
  // Every transport response was HTTP200/code0 and strictly decoded. Runtime
  // ownership alone rejects stale eligible=true and 999-sold public bodies.
  expect(r.genesis.remoteEligibility?.eligible).toBe(false);expect(r.genesis.soldSlots).toBe(0);expect(r.genesis.remotePublicSuccessRevision).toBe(publicRevision);expect(r.genesis.remoteAccountSuccessRevision).toBe(accountRevision);
  r.burst();expect(await r.read()).toBe(true);expect(genesisCount()).toBe(14);expect(r.genesis.remoteEligibility?.eligible).toBe(false);expect(r.genesis.remotePublicReadState).toBe("ready");expect(r.genesis.remoteAccountReadState).toBe("ready");
  for(const tab of ["me","home","earn","store","team","me","home","earn","store","team"]){r.helper.notifyPageActivation(tab,{tabSwitch:true});expect(await r.read()).toBe(true);}
  expect(genesisCount()).toBe(14);expect(r.helper.passiveTabReadScope()).toBe(scope);
});
