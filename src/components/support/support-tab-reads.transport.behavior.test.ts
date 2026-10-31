// @ts-expect-error Node filesystem is provided only by the test runner.
import { readFileSync } from 'node:fs';
import * as Vue from 'vue';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import bubbleSource from './support-bubble.vue?raw';
import gateSource from '@/composables/use-genesis-sale-gate.ts?raw';
import pulseSource from '@/components/home/network-pulse-card.vue?raw';
import snapshotSource from '@/components/home/network-snapshot.vue?raw';
import { createNetworkRankApi } from '@/api/network-rank-api';
import { useNetworkRank } from '@/store/network-rank';
import * as stats from '@/lib/platform-stats';
import rulesSource from '@/components/team/invite-rule-content.vue?raw';
import detailSource from '@/components/team/invite-detail-sheet.vue?raw';
import { useConfig } from '@/store/config';
import { useReferralReward } from '@/store/referral-reward';
import { useLocaleStore } from '@/store/locale';
import { createPlatformConfigApi } from '@/api/platform-config-api';
import { createReferralRewardApi } from '@/api/referral-reward-api';
import { teamRedesignCopy, referralSettlementStatus } from '@/i18n/team-redesign';
import { formatDisplayDate } from '@/lib/display-date';
import { formatAmount } from '@/lib/amount-display';
import { fmt } from '@/i18n/format';
import appSource from '@/App.vue?raw';
import { createApiClient } from '@/api/api-client';
import { createSessionVault } from '@/api/session-vault';
import { createGenesisApi } from '@/api/genesis-api';
import { createNotificationApi } from '@/api/notification-api';
import { createSupportApi } from '@/api/support-api';
import { createQuestApi } from '@/api/quest-api';
import { useGenesisConfig, isPreSale, genesisPurchaseBlock, genesisShowsUrgency, genesisSecondaryBlock } from '@/store/genesis-config';
import { useConversations } from '@/store/conversations';
import { useNotifications } from '@/store/notifications';
import { useQuest } from '@/store/quest';
import { useGenesis } from '@/store/genesis';
import { remoteAccountScope } from '@/lib/remote-account-epoch';
import { runPassiveTabRead, passiveTabReadScope } from '@/lib/passive-tab-read';
import { invalidatePassiveTabReads, notifyPageActivation } from '@/lib/passive-read-window';
import { installSupportStorage } from '@/test/storage-setup';
import { zh } from '@/i18n/messages/zh';
import tabsSource from '@/pages/tabs/tabs.vue?raw';
import tabContentSource from '@/components/native-tab-content.vue?raw';
import * as navigation from '@/lib/native-tab-navigation';
import * as tabLifecycle from '@/composables/use-tab-page-lifecycle';
import meSource from '@/pages/me/me.vue?raw';

const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, apiRuntimeClientOrigin: Object.freeze({ environment: 'dev', baseUrl: 'https://transport.invalid' }), apiRuntimeConfig: { environment: 'dev', baseUrl: 'https://transport.invalid' }, sessionVault: null as any, apiClient: null as any, genesisApi: null as any, notificationApi: null as any, supportApi: null as any, questApi: null as any, networkRankApi: null as any, platformConfigApi:null as any, referralRewardApi:null as any }));
vi.mock('@/api/runtime', () => runtime);
installSupportStorage();
declare const process: { env: Record<string, string | undefined> };
const legacy = process.env.TAB10_COMPARE_08E === '1';
const original = (kind: string, fallback: string) => legacy ? readFileSync(`D:/workspace/output/app-native-full-click-20261026/tab10-nativefix-${kind}-08e.${kind === 'genesis-gate' ? 'ts' : 'vue'}`, 'utf8') : fallback;
let visitSerial = 0;
const newVisit = () => notifyPageActivation(`/fixture/${++visitSerial}`);
const protect = () => { for (const tab of ['index/index','earn/earn','store/store','team/team']) notifyPageActivation('/pages/'+tab, { tabSwitch: true }); };
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); await Vue.nextTick(); };
type Host = { text: string; props: Record<string, any>; children: Host[]; parent: Host | null; style: Record<string, string> };
const node = (text = ''): Host => ({ text, props: {}, children: [], parent: null, style: {} });
const renderer = Vue.createRenderer<Host, Host>({ createElement: () => node(), createText: node, createComment: () => node(), setText: (n,t) => { n.text=t; }, setElementText: (n,t) => { n.text=t;n.children=[]; }, patchProp: (n,k,_p,v) => { n.props[k]=v; }, parentNode:n=>n.parent, nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null, insert:(n,p,a)=>{ if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=p;const i=a?p.children.indexOf(a):-1;p.children.splice(i<0?p.children.length:i,0,n); }, remove:n=>{if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);} });
let pinia: ReturnType<typeof createPinia>, paths: string[], mounted: Vue.App[], rankFails = true, questStatus = 200, notificationStatus = 200, genesisMode = '';
const genesisState = { serverCanonical:true,sourceEnvironment:'PRODUCTION',runId:'',halted:false,revision:'stable',source:'nx_emergency_control_setting:killswitch.genesis',series:{seriesCode:'genesis-main',name:'Genesis',totalSupply:1000,soldSupply:0,remainingSupply:1000,priceUsdt:9999,royaltyPct:2.5,dailyEmissionRatePct:0},market:{enabled:true},emission:{open:false},sale:{serverCanonical:true,available:true,eligibilityEnabled:true,maxPerUser:5,minAccountAgeDays:0,presaleEnabled:false,showCountdown:false,unitPriceUsdt:9999,open:true},listings:[],transactions:[],tiers:[{id:'t1',from:0,to:1000,priceUSDT:9999}],tiersVersion:1,marketOpenState:'open',marketOpenStateVersion:1,closedNoticeKey:'default',showcaseEnabled:true,catalogAvailable:true,tradeAvailable:true,tradeBlockedReason:'NONE',marketStats:{floorUsdt:null,volume24hUsdt:null,owners:null,floorDeltaPct:null,lastSaleUsdt:null} };
beforeEach(() => {
  vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(0); newVisit(); vi.setSystemTime(100_000); newVisit(); pinia=createPinia();setActivePinia(pinia); paths=[];mounted=[];rankFails=true;questStatus=200;notificationStatus=200;genesisMode='';invalidatePassiveTabReads();remoteAccountScope.bind('user:42');
  runtime.sessionVault=createSessionVault();runtime.sessionVault.save({accessToken:'fixture',refreshToken:'fixture-refresh',tokenType:'Bearer',user:{userId:42,countryCode:'+84',phone:'912345678',nickname:'Fixture',onboardingComplete:true}});
  const request=vi.fn(async (input:any) => { const path=new URL(input.url).pathname;paths.push(path);if(path.startsWith('/api/config/')||path==='/api/app/referral-rewards'||(path==='/api/app/network/device-rank'&&rankFails))return{status:503,headers:{},data:{code:503,message:'unavailable',data:null}};let data:any={};
    if(path==='/api/quests/state'&&questStatus!==200)return {status:questStatus,headers:{},data:{code:questStatus,message:'unavailable',data:null}};
    if(path==='/api/notifications'&&notificationStatus!==200)return {status:notificationStatus,headers:{},data:{code:notificationStatus,message:'unavailable',data:null}};
    if(path.startsWith('/api/genesis/')&&(genesisMode==='all-fail'||(genesisMode==='closed-partial'&&path!=='/api/genesis/state')))return {status:503,headers:{},data:{code:503,message:'unavailable',data:null}};
    if(path==='/api/app/network/device-rank')data={source:'SIMULATED_DEVICE_DISTRIBUTION',sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true,state:'ranked',currentRank:4,population:100,deviceTops:31.3,modelVersion:2,generatedAt:'2026-10-25T11:00:00Z'};
    if(path==='/api/genesis/state')data=input.url.includes('?history=')?{serverCanonical:true,sourceEnvironment:'PRODUCTION',runId:'',items:[],nextCursor:null}:genesisState;
    if(path==='/api/genesis/state'&&!input.url.includes('?history=')&&genesisMode==='closed-partial')data={...genesisState,market:{enabled:false},sale:{...genesisState.sale,available:false,open:false},marketOpenState:'closed',tradeAvailable:false,tradeBlockedReason:'SALE_POLICY_UNAVAILABLE'};
    if(path==='/api/notifications')data={items:[],unread:0,nextCursor:null};
    if(path.endsWith('/conversations/cursor'))data={records:[],total:0,pageSize:100};
    if(path.endsWith('/conversation-dismissals'))data=[];
    if(path.endsWith('/conversation-management'))data={clearUserHistory:true,clearedPeers:[]};
    if(path==='/api/quests/state')data={serverCanonical:true,sourceEnvironment:'PRODUCTION',runId:'',quests:[],dayOneRewardNex:0,dayOneRequiredTaskCount:0,dayOneSnapshotStatus:'EMPTY',questBonusMultiplier:1,rhythmMonth:1,source:'nx_mission+nx_user_mission',promoBanner:null};
    return {status:200,headers:{},data:{code:0,message:'ok',data}};
  });
  runtime.apiClient=createApiClient({baseUrl:runtime.apiRuntimeConfig.baseUrl,vault:runtime.sessionVault,transport:{request,upload:vi.fn()}});
  runtime.genesisApi=createGenesisApi(runtime.apiClient,'dev');runtime.notificationApi=createNotificationApi(runtime.apiClient);runtime.supportApi=createSupportApi(runtime.apiClient);runtime.questApi=createQuestApi(runtime.apiClient,'dev');runtime.networkRankApi=createNetworkRankApi(runtime.apiClient,'dev');runtime.platformConfigApi=createPlatformConfigApi(runtime.apiClient,'dev');runtime.referralRewardApi=createReferralRewardApi(runtime.apiClient,'dev');
  useConversations().bindAccount('user:42');
});
afterEach(()=>{mounted.forEach(app=>app.unmount());disposePinia(pinia);vi.useRealTimers();});
function selectedGate() {
  const modules:Record<string,any>={vue:Vue,'@/lib/passive-tab-read':{runPassiveTabRead},'@/store/genesis-config':{useGenesisConfig,isPreSale,genesisPurchaseBlock,genesisShowsUrgency,genesisSecondaryBlock},'@/store/genesis':{useGenesis:()=>({remoteSupplyKnown:false,totalSlots:1000,soldSlots:0})},'@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/api/runtime':runtime};
  const exports:any={};new Function('require','exports',ts.transpileModule(original('genesis-gate',gateSource),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)((id:string)=>modules[id],exports);return exports.useGenesisSaleGate;
}
function bubble() {
  const modules:Record<string,any>={vue:Vue,'@/lib/passive-tab-read':{runPassiveTabRead},'@/api/runtime':runtime,'@/store/genesis-config':{useGenesisConfig},'@/composables/use-genesis-sale-gate':{useGenesisSaleGate:selectedGate()},'@/store/notifications':{useNotifications},'@/store/conversations':{useConversations},'@/store/config':{useConfig:()=>({isEnabled:()=>false})},'@/store/message-drawer':{useMessageDrawer:()=>({show:vi.fn()})},'@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/i18n/format':{fmt:()=>''},'@/lib/amount-display':{formatAmount:String},'@/lib/unread-badge':{formatUnreadBadge:String},'@/store/theme':{useTheme:()=>({resolved:'dark'})}};
  const compiled=compileScript(parse(original('nova',bubbleSource)).descriptor,{id:'native-nova-real-transport',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text'].includes(tag)}}});const exports:any={};
  new Function('require','exports',ts.transpileModule(compiled.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)((id:string)=>id.endsWith('.vue')?{default:{render:()=>null}}:modules[id],exports);
  const app=renderer.createApp(exports.default,{dimmed:false});app.use(pinia);app.mount(node());mounted.push(app);return()=>{app.unmount();mounted.splice(mounted.indexOf(app),1);};
}
it('actual support bubble remounts use real conversation store/API/ApiClient once and issue no unused notification or Genesis GET',async()=>{
  for(let i=0;i<9;i++){const unmount=bubble();await flush();unmount();}
  expect(paths.filter(path=>path==='/api/genesis/state')).toHaveLength(0);expect(paths.filter(path=>path==='/api/notifications')).toHaveLength(0);
  for(const endpoint of ['conversation-management','conversations/cursor','conversation-dismissals'])expect(paths.filter(path=>path.endsWith('/'+endpoint))).toHaveLength(1);
  expect(useConversations().error).toBeNull();await runPassiveTabRead('conversations',()=>useConversations().refresh(),{owner:useConversations().scopeInvalidated},()=>!useConversations().loading&&!useConversations().error);expect(paths).toHaveLength(3);
  newVisit();const unmount=bubble();await flush();unmount();expect(paths).toHaveLength(6);
});
it('actual Genesis gate consumers share raw config refresh despite its real invalidation, then refresh once on the next normal visit',async()=>{
  const gate=selectedGate();
  for(let i=0;i<8;i++){const app=renderer.createApp({setup(){gate();return()=>null;}});app.use(pinia);app.mount(node());mounted.push(app);await flush();}
  expect(useGenesisConfig().loaded).toBe(true);expect(paths.filter(path=>path==='/api/genesis/state')).toHaveLength(3);
  newVisit();const app=renderer.createApp({setup(){gate();return()=>null;}});app.use(pinia);app.mount(node());mounted.push(app);await flush();expect(paths.filter(path=>path==='/api/genesis/state')).toHaveLength(6);
});
it('actual App route hook and Home consumer share real quest store/API/ApiClient reads across five Tab changes',async()=>{
  const raw=original('App',appSource).split('<script setup lang="ts">')[1].split('</script>')[0], ast=ts.createSourceFile('App.ts',raw,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='checkQuestRoute')!.getText(ast);let route='pages/index/index';
  const deps={runPassiveTabRead,useQuest,remoteApiEnabled:true,readCurrentRoute:()=>route,resolveRetiredRoute:()=>null,isStaticReviewRoute:()=>false,checkAuthGuard:()=>false,bootstrapAccountSession:()=>{},checkSession:()=>false,refreshBusinessCalendar:()=>{},ensureBusinessLoopsRunning:()=>true,flushNativePushClick:()=>{}};
  const code=ts.transpileModule('let lastQuestRoute="",lastPlatformConfigLoadAt=Date.now();'+fn+';exports.check=checkQuestRoute;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:any={};new Function('deps','exports',`const {${Object.keys(deps).join(',')}}=deps;${code}`)(deps,exports);
  notifyPageActivation('/'+route);
  for(let round=0;round<4;round++)for(const tab of ['index/index','earn/earn','store/store','team/team','me/me']){const next='pages/'+tab;notifyPageActivation('/'+next,{tabSwitch:route!==next});route=next;exports.check();await flush();await runPassiveTabRead('quest',()=>useQuest().refreshRemote(),undefined,()=>useQuest().remoteStatus==='ready');}
  expect(useQuest().remoteStatus).toBe('ready');expect(paths.filter(path=>path==='/api/quests/state')).toHaveLength(3);
  vi.setSystemTime(Date.now()+3000);route='pages/index/index';notifyPageActivation('/'+route,{tabSwitch:true});exports.check();await flush();expect(paths.filter(path=>path==='/api/quests/state')).toHaveLength(4);expect(passiveTabReadScope()).toContain('user:42');
});

it.each([true,false])('actual NetworkSnapshot warm loading preserves node identity and real rank attempt window; failure=%s',async(failed)=>{
  rankFails=failed;
  const cfg=Vue.reactive({loading:false,syncFailed:false,config:{publicStats:{registeredUsersBase:100,registeredUsersAnchorAt:Date.now()-9000,registeredUsersTickIntervalSec:10,registeredUsersTickStepMin:1,registeredUsersTickStepMax:1},networkPulse:{registeredUsers:100,onlineDevices:200}}});
  const modules:Record<string,any>={vue:Vue,'@/lib/passive-tab-read':{runPassiveTabRead},'@/store/config':{useConfig:()=>cfg},'@/store/app':{useApp:()=>({accountKey:'user:42',accountBindingEpoch:1})},'@/store/network-rank':{useNetworkRank},'@/api/runtime':runtime,'@/components/ui/nx-section.vue':{default:{setup:(_p:any,ctx:any)=>()=>Vue.h('view',ctx.attrs,ctx.slots.default?.())}},'@/lib/platform-stats':stats,'@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/i18n/audit-ui':{useAuditUiCopy:()=>Vue.ref({})},'@/store/ui':{confirm:vi.fn()},'@/lib/route':{navTo:vi.fn()},'@/composables/use-tab-page-lifecycle':{onShow:Vue.onMounted,onHide:Vue.onUnmounted},'@/store/data-visibility':{useDataVisibility:()=>({hidden:false,mask:(value:unknown)=>value})}};
  function compile(source:string){const script=compileScript(parse(source).descriptor,{id:'network-real-rank',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text'].includes(tag)}}});const exports:any={};new Function('require','exports',ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)((id:string)=>id in modules?modules[id]:{default:{render:()=>null}},exports);return exports.default;}
  modules['./network-pulse-card.vue']={default:compile(original('network-pulse',pulseSource))};const root=node(),app=renderer.createApp(compile(snapshotSource));app.use(pinia);app.mount(root);mounted.push(app);await flush();
  const all=(n:Host):Host[]=>[n,...n.children.flatMap(all)];const card=()=>all(root).find(n=>String(n.props.class??'').split(' ').includes('network-compact'));const first=card();if(!failed)expect(first).toBeDefined();
  for(let i=0;i<5;i++){cfg.loading=true;await flush();if(!failed)expect(card()).toBe(first);cfg.loading=false;await flush();if(!failed)expect(card()).toBe(first);}
  expect(useNetworkRank().status).toBe(failed?'error':'ready');expect(paths.filter(path=>path==='/api/app/network/device-rank')).toHaveLength(1);
  newVisit();cfg.loading=true;await flush();cfg.loading=false;await flush();expect(paths.filter(path=>path==='/api/app/network/device-rank')).toHaveLength(2);
  await useNetworkRank().refresh();expect(paths.filter(path=>path==='/api/app/network/device-rank')).toHaveLength(3);
  cfg.syncFailed=true;await flush();expect(card()).toBeUndefined();
});

it('actual closed InviteDetail never mounts rules, while repeated real rule mounts share config/referral attempts and manual retry remains fresh',async()=>{
  const modules:Record<string,any>={vue:Vue,'@/api/runtime':runtime,'@/store/config':{useConfig},'@/store/referral-reward':{useReferralReward},'@/store/locale':{useLocaleStore},'@/store/app':{useApp:()=>({accountKey:'user:42',accountBindingEpoch:1})},'@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/i18n/team-redesign':{teamRedesignCopy,referralSettlementStatus},'@/lib/amount-display':{formatAmount},'@/lib/display-date':{formatDisplayDate},'@/i18n/format':{fmt,dateLocale:()=>useLocaleStore().code},'@/lib/route':{navTo:vi.fn()},'@/composables/use-dialog-a11y':{useDialogA11y:()=>{}},'@/store/data-visibility':{useDataVisibility:()=>({hidden:false,mask:(value:unknown)=>value})}};
  function compile(source:string){const script=compileScript(parse(source).descriptor,{id:'invite-real-rules',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text'].includes(tag)}}});const exports:any={};new Function('require','exports',ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)((id:string)=>id in modules?modules[id]:{default:{render:()=>null}},exports);return exports.default;}
  modules['./invite-rule-content.vue']={default:compile(original('invite-rules',rulesSource))};const props=Vue.reactive({open:false,mode:'rules'});const detail=compile(detailSource);const app=renderer.createApp({setup:()=>()=>Vue.h(detail,props)});app.use(pinia);app.mount(node());mounted.push(app);await flush();expect(paths).toHaveLength(0);
  props.open=true;await flush();const first=[...paths];expect(first.filter(path=>path.startsWith('/api/config/'))).toHaveLength(2);expect(first.filter(path=>path==='/api/app/referral-rewards')).toHaveLength(1);
  for(let i=0;i<4;i++){props.open=false;await flush();props.open=true;await flush();}expect(paths).toEqual(first);
  newVisit();props.open=false;await flush();props.open=true;await flush();expect(paths.filter(path=>path.startsWith('/api/config/'))).toHaveLength(4);expect(paths.filter(path=>path==='/api/app/referral-rewards')).toHaveLength(2);
  await Promise.all([useConfig().load(),useReferralReward().refresh()]);expect(paths.filter(path=>path.startsWith('/api/config/'))).toHaveLength(6);expect(paths.filter(path=>path==='/api/app/referral-rewards')).toHaveLength(3);
});

it('actual retained five-Tab host announces fast changes before child show reads through real quest store/API/transport', async () => {
  const loaded: Array<(query: Record<string, string>) => void> = [], shown: Array<() => void> = [], hidden: Array<() => void> = [];
  const page = { route: 'pages/tabs/tabs' };
  vi.stubGlobal('getCurrentPages', () => [page]);
  const callbacks: Promise<unknown>[] = [];
  const child = () => Vue.defineComponent({ setup() {
    tabLifecycle.onShow(() => { callbacks.push(runPassiveTabRead('quest', () => useQuest().refreshRemote(), undefined, () => useQuest().remoteStatus === 'ready')); });
    return () => Vue.h('view');
  } });
  const modules: Record<string, any> = {
    vue: Vue, '@/lib/native-tab-navigation': navigation, '@/composables/use-tab-page-lifecycle': tabLifecycle,
    '@/lib/passive-read-window': { notifyPageActivation }, '@/api/runtime': runtime,
    '@/store/app': { useApp: () => ({ accountKey: 'user:42', accountBindingEpoch: 1 }) }, '@/store/locale': { useLocaleStore },
    '@dcloudio/uni-app': { onLoad: (fn: typeof loaded[number]) => loaded.push(fn), onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    '@/components/app-chassis.vue': { default: { setup: (_props: unknown, ctx: any) => () => Vue.h('view', ctx.slots.default?.()) } },
    ...Object.fromEntries(Object.values(navigation.TAB_PATHS).map(path => [`@${path}.vue`, { default: child() }])),
  };
  function compile(source: string) {
    const script = compileScript(parse(source).descriptor, { id: 'burst-real-tab-host', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => tag === 'view' } } });
    const exports: any = {};
    new Function('require', 'exports', ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)((id: string) => modules[id], exports);
    return exports.default;
  }
  modules['@/components/native-tab-content.vue'] = { default: compile(tabContentSource) };
  const app = renderer.createApp(compile(tabsSource)); app.use(pinia); app.mount(node()); mounted.push(app); loaded[0]({}); await flush();
  const count = () => paths.filter(path => path === '/api/quests/state').length;
  expect(count()).toBe(1);
  for (const tab of ['earn', 'store', 'team', 'me', 'home'] as const) {
    vi.setSystemTime(Date.now() + 1500); navigation.switchNativeTab(navigation.TAB_PATHS[tab]); await flush();
  }
  expect(count()).toBe(6); // Normal visits really refresh, including a retained page.
  for (const tab of ['earn', 'store', 'team'] as const) { vi.setSystemTime(Date.now() + 100); navigation.switchNativeTab(navigation.TAB_PATHS[tab]); await flush(); }
  expect(count()).toBe(7); // Previous Home plus Earn is two changes; Store is the third and already protected.
  for (const tab of ['me', 'home', 'earn'] as const) { navigation.switchNativeTab(navigation.TAB_PATHS[tab]); await flush(); }
  expect(count()).toBe(7);
  navigation.switchNativeTab(navigation.TAB_PATHS.earn); shown[0](); await flush(); expect(count()).toBe(7);
  // An isolated slow transition does not extend protection; expiry performs no background flush.
  vi.setSystemTime(Date.now() + 2000); navigation.switchNativeTab(navigation.TAB_PATHS.team); await flush(); expect(count()).toBe(7);
  vi.setSystemTime(Date.now() + 1000); await flush(); expect(count()).toBe(7);
  navigation.switchNativeTab(navigation.TAB_PATHS.me); await flush(); expect(count()).toBe(8);
  // A real child-page return creates a visit before retained child show, without becoming a Tab change.
  notifyPageActivation('/pages/me/preferences'); hidden[0](); await flush(); shown[0](); await flush(); expect(count()).toBe(9);
  expect(useQuest().remoteStatus).toBe('ready'); await Promise.all(callbacks);
});

it('protected visits keep real successful quest data, retry cold failures, and a manual strict failure cannot replay old success', async () => {
  const quest = useQuest();
  const read = () => runPassiveTabRead('quest', () => quest.refreshRemote(), undefined, () => quest.remoteStatus === 'ready');
  await read(); expect(quest.remoteStatus).toBe('ready'); expect(paths).toHaveLength(1);
  protect(); await read(); expect(paths).toHaveLength(1);
  questStatus = 503; expect(await quest.refreshRemote()).toBe(false); expect(paths).toHaveLength(2); quest.reset();
  notifyPageActivation('/pages/me/me', { tabSwitch: true }); await read(); expect(paths).toHaveLength(3);
  await read(); expect(paths).toHaveLength(3); // Failed duplicate in one visit still joins.
  notifyPageActivation('/pages/earn/earn', { tabSwitch: true }); await read(); expect(paths).toHaveLength(4);
  questStatus = 200; await quest.refreshRemote(); expect(quest.remoteStatus).toBe('ready'); expect(paths).toHaveLength(5);
  // The manual read removed the old failure. A new passive cold read is permitted and cannot replay it.
  notifyPageActivation('/pages/store/store', { tabSwitch: true }); await read(); expect(quest.remoteStatus).toBe('ready'); expect(paths).toHaveLength(6);
  questStatus = 401; expect(await quest.refreshRemote()).toBe(false);
  const afterStrict = paths.length;
  notifyPageActivation('/pages/team/team', { tabSwitch: true }); expect(await read()).toBe(false); expect(paths.length).toBeGreaterThan(afterStrict);
});

it('actual Me notification loader treats a successful empty page without optional actionable summary as warm, while real failure stays cold', async () => {
  const script = meSource.split('<script setup lang="ts">')[1].split('</script>')[0];
  const ast = ts.createSourceFile('me.ts', script, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  let loader = '';
  const find = (n: ts.Node) => { if (ts.isArrayLiteralExpression(n) && n.elements[0] && ts.isStringLiteral(n.elements[0]) && n.elements[0].text === 'notifications') loader = n.elements[1].getText(ast); ts.forEachChild(n, find); };
  find(ast); expect(loader).not.toBe('');
  const notifications = useNotifications();
  const read = new Function('runPassiveTabRead', 'notifications', `return (${loader});`)(runPassiveTabRead, notifications);
  await read(); expect(notifications.items).toEqual([]); expect(notifications.unread).toBe(0); expect(notifications.actionableUnread).toBeNull(); expect(notifications.error).toBeNull();
  const count = () => paths.filter(path => path === '/api/notifications').length;
  expect(count()).toBe(1); protect(); await read(); expect(count()).toBe(1);
  notifyPageActivation('/pages/me/me', { tabSwitch: true }); await read(); expect(count()).toBe(1);
  notificationStatus = 503; await notifications.refreshRemote(); expect(count()).toBe(2); expect(notifications.error).not.toBeNull();
  notifyPageActivation('/pages/earn/earn', { tabSwitch: true }); await read(); expect(count()).toBe(3); expect(notifications.error).not.toBeNull();
  await read(); expect(count()).toBe(3);
  notificationStatus = 200; await notifications.refreshRemote(); expect(count()).toBe(4); expect(notifications.error).toBeNull();
  notifyPageActivation('/pages/store/store', { tabSwitch: true }); await read(); expect(count()).toBe(4); expect(notifications.error).toBeNull();
});

it('actual Me Genesis loader preserves successful closed public projection with unavailable protected projection, without granting eligibility or caching total failure', async () => {
  genesisMode = 'closed-partial';
  const genesis = useGenesis(); genesis.bindAccount('user:42'); await flush(); paths = [];
  const script = meSource.split('<script setup lang="ts">')[1].split('</script>')[0];
  const ast = ts.createSourceFile('me.ts', script, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  let loader = '';
  const find = (n: ts.Node) => { if (ts.isArrayLiteralExpression(n) && n.elements[0] && ts.isStringLiteral(n.elements[0]) && n.elements[0].text === 'genesis') loader = n.elements[1].getText(ast); ts.forEachChild(n, find); };
  find(ast); expect(loader).not.toBe('');
  const read = new Function('runPassiveTabRead', 'genesis', `return (${loader});`)(runPassiveTabRead, genesis);
  expect(await read()).toBe(true); expect(genesis.remotePublicReadState).toBe('ready'); expect(genesis.remoteAccountReadState).toBe('unavailable'); expect(genesis.remoteEligibility).toBeNull();
  const cold = [...paths]; expect(cold.filter(path => path === '/api/genesis/state')).toHaveLength(3); expect(cold).toHaveLength(5);
  protect(); expect(await read()).toBe(true); expect(paths).toEqual(cold);
  notifyPageActivation('/pages/me/me', { tabSwitch: true }); expect(await read()).toBe(true); expect(paths).toEqual(cold); expect(genesis.remoteEligibility).toBeNull();
  genesisMode = 'all-fail'; expect(await genesis.syncRemote()).toBe(false); expect(genesis.remotePublicReadState).toBe('unavailable');
  const failed = paths.length;
  notifyPageActivation('/pages/earn/earn', { tabSwitch: true }); expect(await read()).toBe(false); expect(paths.length).toBe(failed + 3); expect(genesis.remoteEligibility).toBeNull();
});
