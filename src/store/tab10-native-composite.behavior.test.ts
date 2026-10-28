import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, disposePinia, getActivePinia, setActivePinia } from "pinia";
import { reactive, watch } from "vue";
import type { HttpRequest, HttpResponse } from "@/api/api-client";
const fixture=vi.hoisted(()=>({config:null as any,vault:null as any,genesis:null as any,quest:null as any,notifications:null as any,platform:null as any,rank:null as any}));
vi.mock("@/api/runtime",()=>({remoteApiEnabled:true,get apiRuntimeConfig(){return fixture.config},
  apiRuntimeClientOrigin:{baseUrl:"https://test.invalid",environment:"dev"},
  get sessionVault(){return fixture.vault},get genesisApi(){return fixture.genesis},get questApi(){return fixture.quest},
  get networkRankApi(){return fixture.rank},
  get notificationApi(){return fixture.notifications},get platformConfigApi(){return fixture.platform}}));
const publicState=()=>({serverCanonical:true,sourceEnvironment:"PRODUCTION",runId:"",halted:false,revision:"fixture",source:"nx_emergency_control_setting:killswitch.genesis",
  series:{seriesCode:"genesis-main",name:"Genesis",totalSupply:1000,soldSupply:0,remainingSupply:1000,priceUsdt:9999,royaltyPct:2.5,dailyEmissionRatePct:0},
  market:{enabled:false},emission:{open:false},sale:{serverCanonical:true,available:false,eligibilityEnabled:true,maxPerUser:5,minAccountAgeDays:0,presaleEnabled:false,showCountdown:false,unitPriceUsdt:9999,open:false},
  listings:[],transactions:[],tiers:[{id:"t1",from:0,to:1000,priceUSDT:9999}],tiersVersion:1,marketOpenState:"closed",marketOpenStateVersion:1,
  closedNoticeKey:"default",showcaseEnabled:true,catalogAvailable:true,tradeAvailable:false,tradeBlockedReason:"SALE_POLICY_UNAVAILABLE",
  marketStats:{floorUsdt:null,volume24hUsdt:null,owners:null,floorDeltaPct:null,lastSaleUsdt:null}});
const questState=()=>({serverCanonical:true,sourceEnvironment:"PRODUCTION",runId:"",source:"nx_mission+nx_user_mission",quests:[],questBonusMultiplier:1,dayOneRewardNex:0,rhythmMonth:1,
  dayOneRequiredTaskCount:0,dayOneSnapshotStatus:"EMPTY"});
const platformState=()=>({featureFlags:{computeShareEnabled:true,homeNewcomerTasksEnabled:true,homeWeeklyPromoEnabled:false},
  share:{baseUrl:"https://example.test/ref/",channels:[{key:"zalo",intentType:"scheme",textTemplate:"Join {link}",enabled:true}],
    appDownload:{officialUrl:"https://example.test/app.apk",iosUrl:"",androidUrl:"",apkUrl:"",version:"1",releaseNotes:{zh:"fixture",en:"fixture"},source:"official"}},
  publicStats:{version:1,serverCanonical:true,source:"server:nx_config_item,nx_user",sourceEnvironment:"PRODUCTION",runId:"",realUserCount:2,
    values:{fleetDevices:20,onlineRatePct:90,onlineJitter:20,registeredUsersBase:10,registeredUsersMonthlyGrowthPct:2,registeredUsersAnchorAt:1756684800000,virtualUserCount:8,hashratePercentileTable:[{tops:0,cumPct:0},{tops:100,cumPct:100}]}},
  onlineBonus:{h5BaseFactor:0.6,continuityFullHours:24},computerCompute:{domain:"E6",flags:[{key:"computeShareEnabled",enabled:true}],coefficients:[{key:"h5BaseFactor",value:0.6},{key:"continuityFullHours",value:24}],
    yieldEstimate:[{key:"topsBaseline",value:100},{key:"dailyUsdtPerBaseline",value:0.24},{key:"nexPerUsdt",value:10}],gpuTiers:["G1","G2","G3","G4","G5","G6"].map((id,index)=>({id,label:id,tops:(index+1)*100,keywords:[{slot:"keyword1",value:id}]})),
    download:{url:"",zhTitle:"",zhGuide:"",enTitle:"",enGuide:""},sources:["e6.compute_config"]},updatedAt:"2026-09-01T00:00:00Z"});
const referralState=()=>({enabled:false,welcomeGift:{lockMode:"direct",usdtAmount:0,nexAmount:0},inviterReward:{nexAmount:0},rhythmMonth:1,newcomerMultiplier:1,inviterMultiplier:1,effectiveAt:"2026-09-01T00:00:00Z",sources:["nx_user.sponsor_user_id"]});
const configResponse=(request:HttpRequest):HttpResponse=>({status:200,headers:{},data:{code:0,message:"ok",data:request.url.includes("/api/config/platform")?platformState():referralState()}});
const rankState=()=>({source:"SIMULATED_DEVICE_DISTRIBUTION",sourceEnvironment:"PRODUCTION",runId:"",serverCanonical:true,currentRank:2,state:"ranked",population:100,deviceTops:10,modelVersion:1,generatedAt:"2026-10-28T00:00:00Z"});
let requests:HttpRequest[]=[],heldPlatform:((request:HttpRequest)=>Promise<HttpResponse>)|null=null,failedQuest=false,failedPlatform=true,heldRank:Promise<void>|null=null,failedRank=false,rank429=false,rankRetryAfter:number|undefined;
beforeEach(async()=>{
  vi.resetModules();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(0);setActivePinia(createPinia());requests=[];heldPlatform=null;failedQuest=false;failedPlatform=true;heldRank=null;failedRank=false;rank429=false;rankRetryAfter=undefined;fixture.config=reactive({baseUrl:"https://test.invalid",environment:"dev"});
  const [{createApiClient},{createSessionVault},{createGenesisApi},{createQuestApi},{createNotificationApi},{createPlatformConfigApi},{createNetworkRankApi}]=await Promise.all([
    import("@/api/api-client"),import("@/api/session-vault"),import("@/api/genesis-api"),import("@/api/quest-api"),import("@/api/notification-api"),import("@/api/platform-config-api"),import("@/api/network-rank-api")]);
  fixture.vault=createSessionVault();fixture.vault.save({accessToken:"access",refreshToken:"refresh",tokenType:"Bearer",user:{userId:1,countryCode:"+84",phone:"12345678",nickname:"Fixture",onboardingComplete:true}});
  const client=createApiClient({baseUrl:"https://test.invalid",vault:fixture.vault,transport:{request:async request=>{
    requests.push(request);const path=request.url.replace("https://test.invalid","").split("?")[0];
    if(path.startsWith("/api/config/")){if(heldPlatform)return heldPlatform(request);return failedPlatform?{status:503,headers:{},data:{code:503,message:"unavailable",data:null}}:configResponse(request);}
    if(path==="/api/quests/state"&&failedQuest)return{status:503,headers:{},data:{code:503,message:"unavailable",data:null}};
    if(path==="/api/app/network/device-rank"){await heldRank;if(rank429)return{status:429,headers:rankRetryAfter===undefined?{}:{"Retry-After":String(rankRetryAfter/1000)},data:{code:429,message:"limited",data:null}};return failedRank?{status:503,headers:{},data:{code:503,message:"unavailable",data:null}}:{status:200,headers:{},data:{code:0,message:"ok",data:rankState()}};}
    const data=request.url.includes("?history=")?{serverCanonical:true,sourceEnvironment:"PRODUCTION",runId:"",items:[],nextCursor:null}:path==="/api/genesis/state"?publicState():path==="/api/quests/state"?questState():path==="/api/notifications"?{items:[],nextCursor:null,unread:0,actionableUnread:0}:null;
    return{status:200,headers:{},data:{code:0,message:"ok",data}};
  }}});
  fixture.genesis=createGenesisApi(client,"prod");fixture.quest=createQuestApi(client,"prod");fixture.notifications=createNotificationApi(client);fixture.platform=createPlatformConfigApi(client,"prod");
  fixture.rank=createNetworkRankApi(client,"prod");
});
afterEach(()=>{const pinia=getActivePinia();if(pinia)disposePinia(pinia);vi.useRealTimers();});
const counts=()=>Object.fromEntries([...new Set(requests.map(row=>row.url.split("?")[0]))].map(url=>[url.replace("https://test.invalid",""),requests.filter(row=>row.url.split("?")[0]===url).length]));
async function resources(){const {useGenesisConfig}=await import("./genesis-config"),{useQuest}=await import("./quest"),{useNotifications}=await import("./notifications"),passive=await import("@/lib/passive-tab-read");
  return{cfg:useGenesisConfig(),quest:useQuest(),notifications:useNotifications(),...passive};}

it("retains the raw Genesis/quest amplification counterexample while notification raw dispatches now seed passive visitors",async()=>{
  const r=await resources(),scope=r.passiveTabReadScope();
  const page=()=>Promise.all([r.runPassiveTabRead("genesis-config",()=>r.cfg.refresh()),r.runPassiveTabRead("quest",()=>r.quest.refreshRemote()),r.runPassiveTabRead("notifications",()=>r.notifications.refreshRemote(),undefined,()=>!r.notifications.loading&&!r.notifications.error&&r.notifications.actionableUnread!==null)]);
  await page();
  for(let round=0;round<4;round++){
    vi.setSystemTime((round+1)*500);
    // Replay the failed native source's raw calls. Genesis/quest still show
    // why descendants must use their passive entry; notification now remembers
    // each real raw dispatch, so the following passive visitor adds no request.
    await Promise.all([r.cfg.refresh(),r.quest.refreshRemote(),r.notifications.refreshRemote()]);
    await page();expect(r.passiveTabReadScope()).toBe(scope);
  }
  expect(counts()).toEqual({"/api/genesis/state":27,"/api/quests/state":9,"/api/notifications":5});
  expect(r.cfg.loaded).toBe(true);expect(r.quest.remoteStatus).toBe("ready");
});

it("reads actual normal visits fresh and protects successful recursive owners only after the third fast Tab change",async()=>{
  const r=await resources();const passive=()=>Promise.all([r.runPassiveTabRead("genesis-config",()=>r.cfg.refresh(),undefined,()=>r.cfg.loaded),r.runPassiveTabRead("quest",()=>r.quest.refreshRemote(),undefined,()=>r.quest.remoteStatus==="ready"),r.runPassiveTabRead("notifications",()=>r.notifications.refreshRemote(),undefined,()=>!r.notifications.loading&&!r.notifications.error&&r.notifications.actionableUnread!==null)]);
  r.notifyPageActivation("home");await passive();
  for(const [round,route] of ["earn","team","store","me"].entries()){vi.setSystemTime((round+1)*100);r.notifyPageActivation(route,{tabSwitch:true});await passive();await passive();}
  expect(counts()).toEqual({"/api/genesis/state":9,"/api/quests/state":3,"/api/notifications":3});
  expect(r.cfg.loaded).toBe(true);expect(r.quest.remoteStatus).toBe("ready");
  vi.setSystemTime(3_400);r.notifyPageActivation("home");await passive();expect(counts()).toEqual({"/api/genesis/state":12,"/api/quests/state":4,"/api/notifications":4});
});

it("joins an actual public-config startup composite without scheduling a second transport read",async()=>{
  let release!:(response:HttpResponse)=>void;const held=new Promise<HttpResponse>(done=>{release=done});heldPlatform=()=>held;
  const {useConfig}=await import("./config"),{runPassiveTabRead}=await import("@/lib/passive-tab-read");const cfg=useConfig();
  const startup=cfg.load();await Promise.resolve();
  const page=runPassiveTabRead("config",()=>cfg.load());
  heldPlatform=null;release({status:503,headers:{},data:{code:503,message:"unavailable",data:null}});
  await Promise.all([startup,page]);for(let tick=0;tick<10;tick++)await Promise.resolve();
  expect(counts()).toEqual({"/api/config/platform":1,"/api/config/referral-rewards":1});
  expect(cfg.configStatus).toBe("failed");
});

it("protects actual ready void configuration but retries cold failures on a new protected visit",async()=>{
  const {useConfig}=await import("./config"),{notifyPageActivation}=await import("@/lib/passive-tab-read");
  const cfg=useConfig();failedPlatform=false;notifyPageActivation("home");await cfg.revalidate();
  notifyPageActivation("earn",{tabSwitch:true});await cfg.revalidate();notifyPageActivation("team",{tabSwitch:true});await cfg.revalidate();
  notifyPageActivation("store",{tabSwitch:true});await cfg.revalidate();expect(requests).toHaveLength(6);
  failedPlatform=true;await cfg.load();expect(cfg.configStatus).toBe("failed");expect(requests).toHaveLength(8);
  notifyPageActivation("me",{tabSwitch:true});await cfg.revalidate();expect(requests).toHaveLength(10);
  failedPlatform=false;notifyPageActivation("home",{tabSwitch:true});await cfg.revalidate();expect(requests).toHaveLength(12);expect(cfg.configStatus).toBe("ready");
  notifyPageActivation("earn",{tabSwitch:true});await cfg.revalidate();expect(requests).toHaveLength(12);
});

it("joins a public-config startup across a new authentication chain through the explicit passive store entry",async()=>{
  let release!:(response:HttpResponse)=>void;const held=new Promise<HttpResponse>(done=>{release=done});heldPlatform=()=>held;
  const {useConfig}=await import("./config");const cfg=useConfig(),startup=cfg.load();await Promise.resolve();
  const snapshot=fixture.vault.read();fixture.vault.clear();fixture.vault.save(snapshot);
  const page=cfg.revalidate();heldPlatform=null;release({status:503,headers:{},data:{code:503,message:"unavailable",data:null}});
  await Promise.all([startup,page]);for(let tick=0;tick<10;tick++)await Promise.resolve();
  expect(counts()).toEqual({"/api/config/platform":1,"/api/config/referral-rewards":1});expect(cfg.configStatus).toBe("failed");
  await cfg.revalidate();expect(requests).toHaveLength(2);
  await cfg.load();expect(requests).toHaveLength(4);
});

it("shares failed quest callbacks in one activation, then retries a new visit",async()=>{
  failedQuest=true;
  const {reportDayOnePageObservation}=await import("@/lib/day-one-page-observation"),{useQuest}=await import("./quest");
  const submit=vi.fn();const input={scope:{accountKey:"user:1",epoch:1},session:fixture.vault.read(),visible:()=>true,isCurrent:()=>true,submit};
  for(let round=0;round<4;round++){vi.setSystemTime(round*500);await reportDayOnePageObservation("visit_earn",input);}
  expect(counts()).toEqual({"/api/quests/state":1});expect(useQuest().remoteStatus).toBe("error");expect(submit).not.toHaveBeenCalled();
  const {notifyPageActivation}=await import("@/lib/passive-tab-read");notifyPageActivation("earn");await reportDayOnePageObservation("visit_earn",input);expect(counts()).toEqual({"/api/quests/state":2});
});

it.each(["environment","baseUrl","environment-ABA","baseUrl-ABA"])("never joins or publishes the old public-config flight after %s",async boundary=>{
  failedPlatform=false;const {useConfig}=await import("./config");const cfg=useConfig();await cfg.revalidate();
  expect(cfg.configStatus).toBe("ready");expect(cfg.publicStatsAuthority).not.toBeNull();
  let release!:()=>void;const held=new Promise<void>(done=>{release=done});heldPlatform=async request=>{await held;return configResponse(request)};
  const old=cfg.load();await Promise.resolve();const calls=requests.length;
  const field=boundary.startsWith("environment")?"environment":"baseUrl",original=fixture.config[field];
  fixture.config[field]=field==="environment"?"prod":"https://other.invalid";
  if(boundary.endsWith("ABA"))fixture.config[field]=original;
  expect(cfg.configStatus).toBe("failed");expect(cfg.publicStatsAuthority).toBeNull();
  await cfg.revalidate();expect(requests).toHaveLength(calls);release();await old;
  expect(cfg.configStatus).toBe("failed");expect(cfg.publicStatsAuthority).toBeNull();expect(cfg.syncFailed).toBe(true);expect(cfg.loading).toBe(false);
});

it("cannot re-enable public configuration after a synchronous config assignment changes the origin",async()=>{
  failedPlatform=false;const {useConfig}=await import("./config");const cfg=useConfig();let fired=false;
  const off=watch(()=>cfg.config,()=>{if(!fired){fired=true;fixture.config.baseUrl="https://other.invalid"}},{flush:"sync"});
  await cfg.revalidate();expect(fired).toBe(true);expect(cfg.configStatus).toBe("failed");expect(cfg.publicStatsAuthority).toBeNull();expect(cfg.syncFailed).toBe(true);off();
});

it("does not adopt a changed mutable config as the immutable runtime client's origin when rebuilding Pinia",async()=>{
  failedPlatform=false;const {useConfig}=await import("./config");const first=useConfig();await first.revalidate();expect(first.configStatus).toBe("ready");
  fixture.config.baseUrl="https://other.invalid";const before=requests.length;disposePinia(getActivePinia()!);setActivePinia(createPinia());
  const next=useConfig();await next.revalidate();expect(next.configStatus).toBe("failed");expect(next.publicStatsAuthority).toBeNull();expect(requests).toHaveLength(before);
});

it("joins public pending across login, shares that visit and reads the next normal visit fresh",async()=>{
  failedPlatform=false;let release!:()=>void;const held=new Promise<void>(done=>{release=done});heldPlatform=async request=>{await held;return configResponse(request)};
  const {useConfig}=await import("./config");const cfg=useConfig(),startup=cfg.load();await Promise.resolve();
  vi.setSystemTime(5_000);const snapshot=fixture.vault.read();fixture.vault.clear();fixture.vault.save(snapshot);const joined=cfg.revalidate();
  vi.setSystemTime(6_000);heldPlatform=null;release();await Promise.all([startup,joined]);expect(cfg.configStatus).toBe("ready");expect(requests).toHaveLength(2);
  vi.setSystemTime(9_999);await cfg.revalidate();expect(requests).toHaveLength(2);
  const {notifyPageActivation}=await import("@/lib/passive-tab-read");notifyPageActivation("new-visit");await cfg.revalidate();expect(requests).toHaveLength(4);
});

it("shares rank completion across visits, reads normal reentry fresh and keeps manual fresh",async()=>{
  const {useNetworkRank}=await import("./network-rank");const rank=useNetworkRank();rank.bindAccount("user:1");let release!:()=>void;heldRank=new Promise<void>(done=>{release=done});
  const {notifyPageActivation}=await import("@/lib/passive-tab-read");notifyPageActivation("home");const first=rank.ensure();notifyPageActivation("earn");const joined=rank.ensure();vi.setSystemTime(300);heldRank=null;release();expect(await first).toBe(true);expect(await joined).toBe(true);expect(rank.status).toBe("ready");
  vi.setSystemTime(9_999);expect(await rank.ensure()).toBe(true);expect(requests).toHaveLength(1);
  notifyPageActivation("team");expect(await rank.ensure()).toBe(true);expect(requests).toHaveLength(2);
  vi.setSystemTime(10_001);expect(await rank.refresh()).toBe(true);expect(requests).toHaveLength(3);
  failedRank=true;vi.setSystemTime(10_002);expect(await rank.refresh()).toBe(false);expect(await rank.ensure()).toBe(false);expect(requests).toHaveLength(4);expect(rank.snapshot).toBeNull();
  notifyPageActivation("store");expect(await rank.ensure()).toBe(false);expect(requests).toHaveLength(5);
});

it.each([0,2_000,undefined])("network-rank respects its HTTP429 deadline without a fixed TTL floor %s",async delay=>{
  rank429=true;rankRetryAfter=delay;const {useNetworkRank}=await import("./network-rank"),rank=useNetworkRank();rank.bindAccount("user:1");expect(await rank.ensure()).toBe(false);
  const {notifyPageActivation}=await import("@/lib/passive-tab-read");const wait=delay??30_000;rank429=false;
  if(wait>0){vi.setSystemTime(wait-1);notifyPageActivation("earn");expect(await rank.ensure()).toBe(false);expect(requests).toHaveLength(1);}
  vi.setSystemTime(wait);notifyPageActivation("team");expect(await rank.ensure()).toBe(true);expect(requests).toHaveLength(2);expect(rank.status).toBe("ready");
});

it.each(["environment","baseUrl","environment-ABA","baseUrl-ABA"])("fences the actual pending network rank after %s",async boundary=>{
  const {useNetworkRank}=await import("./network-rank"),rank=useNetworkRank();rank.bindAccount("user:1");let release!:()=>void;heldRank=new Promise<void>(done=>{release=done});
  const old=rank.ensure();const field=boundary.startsWith("environment")?"environment":"baseUrl",original=fixture.config[field];fixture.config[field]=field==="environment"?"prod":"https://other.invalid";
  if(boundary.endsWith("ABA"))fixture.config[field]=original;
  expect(await rank.ensure()).toBe(false);expect(requests).toHaveLength(1);heldRank=null;release();expect(await old).toBe(false);expect(rank.snapshot).toBeNull();expect(rank.status).toBe("error");
  disposePinia(getActivePinia()!);setActivePinia(createPinia());if(!boundary.endsWith("ABA")){const next=useNetworkRank();expect(await next.ensure()).toBe(false);expect(requests).toHaveLength(1);}
});

it.each(["session-ABA","locale-ABA","write"])("starts a current rank read without joining the old private flight after %s",async boundary=>{
  const {useNetworkRank}=await import("./network-rank"),rank=useNetworkRank();rank.bindAccount("user:1");let release!:()=>void;heldRank=new Promise<void>(done=>{release=done});
  const old=rank.ensure();
  if(boundary==="session-ABA"){const snapshot=fixture.vault.read();fixture.vault.clear();fixture.vault.save(snapshot);}
  if(boundary==="locale-ABA"){const {useLocaleStore}=await import("./locale");useLocaleStore().setLocale("en");useLocaleStore().setLocale("zh");}
  if(boundary==="write"){const {invalidatePassiveTabReads}=await import("@/lib/passive-read-window");invalidatePassiveTabReads();}
  heldRank=null;expect(await rank.ensure()).toBe(true);expect(requests).toHaveLength(2);release();expect(await old).toBe(false);
  expect(rank.snapshot?.currentRank).toBe(2);expect(rank.status).toBe("ready");
});

it("never restores a ready rank after a synchronous snapshot observer changes origin",async()=>{
  const {useNetworkRank}=await import("./network-rank"),rank=useNetworkRank();let fired=false;
  const off=watch(()=>rank.snapshot,value=>{if(value&&!fired){fired=true;fixture.config.baseUrl="https://other.invalid"}},{flush:"sync"});
  expect(await rank.ensure()).toBe(false);expect(rank.snapshot).toBeNull();expect(rank.status).toBe("error");off();
});
