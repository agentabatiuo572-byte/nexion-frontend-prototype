import { notifyPageActivation } from '@/lib/passive-read-window';
import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import * as Vue from 'vue';
import { ApiError } from '@/api/errors';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { installSupportStorage } from '@/test/storage-setup';
import { refreshProductCatalog, productCatalogState, productCatalogDisplayProof, productCatalogPresentation, prepareProductCatalog, isProductCatalogDisplayCurrent } from '@/store/product-catalog';
import * as runtimeRevision from '@/api/order-api';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { formatAmount } from '@/lib/amount-display';
import { formatUsd, formatUsdOverviewParts } from '@/lib/usd-display';
import { formatComputePoints, sumComputePoints } from '@/i18n/compute-points';
import { fmt } from '@/i18n/format';
import { leadershipPoolFailureState } from '@/lib/leadership-pool-state';
import { nextRankProgress } from '@/store/v-rank';
import { rankLabel } from '@/lib/v-rank-copy';
import teamSource from './team.vue?raw';
import ledgerSource from '@/components/team/team-ledger-card.vue?raw';
import summarySource from '@/components/team/team-summary-card.vue?raw';
import inviteSource from '@/components/team/invite-earn-card.vue?raw';
import * as vizMotion from "@/composables/use-scroll-grow-progress";

vi.mock('@dcloudio/uni-app', () => ({ onLoad:vi.fn(),onShow:vi.fn(),onHide:vi.fn(),onUnload:vi.fn() }));
installSupportStorage();
const remote=vi.hoisted(()=>({remoteApiEnabled:true,apiRuntimeConfig:{environment:'dev',baseUrl:'https://test.invalid'},
 productCatalogApi:{catalog:vi.fn()},teamNetworkApi:{snapshot:vi.fn()},commissionConfigApi:{rates:vi.fn(),binary:vi.fn()},
 teamInsightsApi:{commissions:vi.fn(),leadershipPool:vi.fn()},referralRewardApi:{snapshot:vi.fn()},vRankApi:{ladder:vi.fn(),current:vi.fn()}}));
vi.mock('@/api/runtime',()=>remote);
const {useNetwork}=await import('@/store/network'),{useCommission}=await import('@/store/commission'),{useVRank}=await import('@/store/v-rank'),{useReferralReward}=await import('@/store/referral-reward');
const proof={source:'server',serverCanonical:true,sourceEnvironment:'PRODUCTION',runId:''};
const aggregate={totalUSDT:1313.69,totalNEX:4118.29,directUSDT:500,extendedUSDT:813.69,contributorCount:10,monthUSDT:1313.69,monthNEX:4118.29,unlockedUSDT:461.38,coolingUSDT:852.31};
const commissions=(amount=1313.69)=>({...proof,events:[],page:1,totalRows:0,aggregate:{...aggregate,monthUSDT:amount}});
const reward=(amount=.02)=>({source:'ledger',sourceEnvironment:'PRODUCTION',runId:null,referralCode:'CURRENT',rewardEnabled:true,inviterRewardNex:amount,invitedCount:2,pendingCount:1,settledCount:1,lifetimeInviterNex:7,walletNexAvailable:7,recentRewards:[],limit:10,factSources:[],refreshedAt:'2026-10-27T00:00:00Z'});
const ladder={...proof,prizeName:'Ranks',capabilities:{peer:false,genesis:false},ranks:Array.from({length:3},(_,v)=>({v,title:'V'+v,cnTitle:'V'+v,directBonus:0,unilevelDepth:0,peerBonus:0,leadershipVotes:0,cultivationBonus:0,rewards:[],visible:true}))};
const rank={...proof,rankCode:'V2',progress:{selfBuyUSD:0,directRefs:2,teamVolumeUSD:0,vDownlineCounts:{}}};
function deferred<T=any>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();await Vue.nextTick();};
type Host={tag:string;text:string;props:Record<string,any>;parent:Host|null;children:Host[]};
const node=(tag:string,text=''):Host=>({tag,text,props:{},parent:null,children:[]});
const renderer=Vue.createRenderer<Host,Host>({createElement:t=>node(t),createText:t=>node('#text',t),createComment:()=>node('#comment'),setText:(n,t)=>{n.text=t},setElementText:(n,t)=>{n.text=t;n.children=[]},patchProp:(n,k,_p,v)=>{n.props[k]=v},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,insert:(n,p,a)=>{if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=p;const i=a?p.children.indexOf(a):-1;p.children.splice(i<0?p.children.length:i,0,n)},remove:n=>{if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=null}});
const all=(n:Host):Host[]=>[n,...n.children.flatMap(all)],text=(n:Host):string=>n.text+n.children.map(text).join('');
let catalogVersion=0;
const mounted:Vue.App[]=[];let pinia:ReturnType<typeof createPinia>;
beforeEach(()=>{catalogVersion=0;pinia=createPinia();setActivePinia(pinia);vi.clearAllMocks();vi.stubGlobal('uni',{getStorageSync:()=>undefined,setStorageSync:vi.fn()});remote.apiRuntimeConfig=Vue.reactive({...remote.apiRuntimeConfig,environment:'dev',baseUrl:'https://test.invalid'});
remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});// These scenarios exercise actual catalog replacement, so each default fixture response carries a new revision.
remote.productCatalogApi.catalog.mockImplementation(async()=>({...proof,products:[],revision:'catalog-'+(++catalogVersion)}));remote.commissionConfigApi.rates.mockResolvedValue({});remote.commissionConfigApi.binary.mockResolvedValue({...proof,estimatedAmountUsdt:0,trackA:0,trackB:0});remote.teamInsightsApi.commissions.mockResolvedValue(commissions());remote.teamInsightsApi.leadershipPool.mockResolvedValue({...proof,myVotes:1,unlockRank:3,mySharePct:.1,projectedPayoutUSDT:17.25,currentWeekPoolUSDT:5000,injectRate:.05});remote.referralRewardApi.snapshot.mockResolvedValue(reward());remote.vRankApi.ladder.mockResolvedValue(ladder);remote.vRankApi.current.mockResolvedValue(rank);});
afterEach(()=>{mounted.splice(0).forEach(a=>a.unmount());disposePinia(pinia);vi.unstubAllGlobals();vi.useRealTimers();});
function compile(raw:string,modules:Record<string,any>){const script=compileScript(parse(raw).descriptor,{id:'warm-team',inlineTemplate:true,templateOptions:{compilerOptions:{hoistStatic:false,isCustomElement:t=>['view','text'].includes(t)}}});const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const exports={} as any;new Function('require','exports',code)((id:string)=>{if(id in modules)return modules[id];if(id.endsWith('.vue'))return{default:{render:()=>null}};throw new Error('Unexpected Team dependency '+id)},exports);return exports.default;}
async function screen(copy=en){notifyPageActivation('/pages/team/team');await refreshProductCatalog(true);const commission=useCommission(),vrank=useVRank(),rewards=useReferralReward();commission.bindAccount('user:fixture');vrank.bindAccount('user:fixture');rewards.bindAccount('user:fixture');await flush();
const app=Vue.reactive({accountKey:'user:fixture',accountBindingEpoch:1,user:{referralCode:'LOCAL'}}),locale=Vue.reactive({code:copy===zh?'zh':copy===vietnamese?'vi':'en'});
const network=useNetwork();network.bindAccount('user:fixture');await flush();
const navTo=vi.fn(),copyText=vi.fn(async()=>true);
const syncStates:Array<{events:string;visible:boolean;present:boolean;catalogValid:boolean;failed:boolean;loading:boolean;feedback:boolean;totalMembers:string;extendedMembers:string}>=[];
const ledgerStates:Array<{failed:boolean;loading:boolean}>=[];
const passive=createPassiveTabReadFixture(()=>JSON.stringify([app.accountKey,app.accountBindingEpoch,locale.code,remote.apiRuntimeConfig.environment,remote.apiRuntimeConfig.baseUrl]));
const activate=(route:string,tabSwitch=false)=>{notifyPageActivation(route,{tabSwitch});passive.notifyPageActivation(route,{tabSwitch});};
const normalVisit=()=>{activate('/pages/me/preferences');activate('/pages/team/team');};
const modules:Record<string,any>={'@/lib/passive-tab-read':passive,'@test/ledger-probe':{record:(state:any)=>ledgerStates.push(state)},'@test/team-probe':{record:(state:any)=>syncStates.push(state)},vue:Vue,'@/composables/use-tab-page-lifecycle':{onLoad:(fn:any)=>{const old=runtimeHooks.load;runtimeHooks.load=fn;void old},onShow:(fn:any)=>runtimeHooks.show.push(fn),onHide:(fn:any)=>runtimeHooks.hide.push(fn)},
 '@/lib/route':{navTo,takeNavigationQuery:()=>''},'@/composables/use-scroll-grow-progress':vizMotion,'@/i18n/use-t':{useT:()=>Vue.ref(copy)},'@/i18n/format':{fmt,dateLocale:()=>locale.code},'@/i18n/team-redesign':{teamRedesignCopy},'@/store/locale':{useLocaleStore:()=>locale},'@/store/app':{useApp:()=>app},'@/store/commission':{useCommission:()=>commission},'@/store/v-rank':{useVRank:()=>vrank,nextRankProgress},'@/store/network':{useNetwork:()=>network},'@/store/referral-reward':{useReferralReward:()=>rewards},'@/store/leadership-pool':{useLeadershipPool:()=>({})},'@/api/runtime':remote,'@/store/product-catalog':{productCatalogState,productCatalogDisplayProof,productCatalogPresentation,isProductCatalogDisplayCurrent},'@/api/order-api':runtimeRevision,
 '@/lib/account-scope':{captureAccountScope:()=>({account:app.accountKey,epoch:app.accountBindingEpoch}),isCurrentAccountScope:(s:any)=>s.account===app.accountKey&&s.epoch===app.accountBindingEpoch},'@/lib/leadership-pool-state':{leadershipPoolFailureState},'@/lib/v-rank-copy':{rankLabel},'@/i18n/compute-points':{formatComputePoints,sumComputePoints},'@/lib/amount-display':{formatAmount},'@/lib/usd-display':{formatUsd,formatUsdOverviewParts},'@/store/ui':{toast:{info:vi.fn(),success:vi.fn()}},'@/lib/share':{copyText,buildShareLink:(code:string)=>code?'https://test.invalid/'+code:'',recordShareEvent:vi.fn()},
 '@/components/tab-page-frame.vue':{default:{setup:(_:unknown,{slots}:any)=>()=>Vue.h('view',slots.default?.())}}};
const runtimeHooks={load:null as any,show:[] as Array<()=>void>,hide:[] as Array<()=>void>};
modules['@/store/data-visibility']={useDataVisibility};
modules['@/lib/team-rank-progress']=await import('@/lib/team-rank-progress');modules['@/i18n/audit-ui']=await import('@/i18n/audit-ui');modules['@/components/team/team-rank-emblem.vue']={default:{props:['rank','size'],setup:(props:any)=>()=>Vue.h('view',{class:'team-rank-emblem','data-rank':props.rank})}};
modules['@/components/ui/nx-button.vue']={default:{props:['label'],emits:['click'],setup:(props:any,{emit}:any)=>()=>Vue.h('button',{onClick:()=>emit('click')},props.label)}};
modules['@/components/team/team-summary-card.vue']={default:compile(summarySource,modules)};
modules['@/components/team/team-ledger-card.vue']={default:compile(ledgerSource.replace('<script setup lang="ts">','<script setup lang="ts">\nimport { watch } from "vue"; import { record } from "@test/ledger-probe";').replace('</script>','watch(() => ({failed:props.failed,loading:props.loading}),record,{immediate:true,flush:"sync"});\n</script>'),modules)};modules['@/components/team/invite-earn-card.vue']={default:compile(inviteSource,modules)};
const observedTeam=teamSource.replace('<script setup lang="ts">','<script setup lang="ts">\nimport { record } from "@test/team-probe";').replace('</script>', 'watch(() => ({events:commission.eventsStatus,visible:ledgerVisible.value,present:ledgerPresentation.value!==null,catalogValid:displayCatalogValid.value,failed:ledgerFailed.value,loading:ledgerLoading.value,feedback:ledgerFailureFeedback.value,totalMembers:totalMembersCountText.value,extendedMembers:extendedCountText.value}), record, {immediate:true,flush:"sync"});\n</script>');
const page=compile(observedTeam,modules),root=node('root'),view=renderer.createApp(page);view.mount(root);mounted.push(view);runtimeHooks.show.forEach(fn=>fn());await flush();
const find=(cls:string)=>all(root).find(n=>String(n.props.class??'').split(' ').includes(cls))!;
return{commission,vrank,rewards,app,locale,network,root,activate,normalVisit,syncStates,ledgerStates,navTo,copyText,hooks:runtimeHooks,find,amounts:()=>[text(find('team-ledger__amount')),text(find('team-ledger__nex')),...all(find('team-ledger__settlement')).filter(n=>String(n.props.class??'').includes('tabular-nums')).map(text)]};}
it.each([en,zh,vietnamese])('keeps actual income, settled, cooling, rank and invitation presentation while runtime authority is reset',async copy=>{const s=await screen(copy),before=s.amounts(),hero=s.find('team-ledger__amount');expect(before).toContain('+4118.29 UVT');expect(text(s.find('invite-card__amount'))).toBe('0.02');
const events=deferred(),binary=deferred(),current=deferred(),invite=deferred(),pool=deferred();remote.teamInsightsApi.commissions.mockReturnValue(events.promise);remote.commissionConfigApi.binary.mockReturnValue(binary.promise);remote.vRankApi.current.mockReturnValue(current.promise);remote.referralRewardApi.snapshot.mockReturnValue(invite.promise);remote.teamInsightsApi.leadershipPool.mockReturnValue(pool.promise);
await refreshProductCatalog(true);await Vue.nextTick();expect(s.commission.eventsEvidence).toBeNull();expect(s.commission.eventsStatus).toBe('loading');expect(s.commission.binarySnapshot).toBeNull();expect(s.vrank.remoteReady).toBe(false);expect(s.rewards.snapshot).toBeNull();expect(s.rewards.loading).toBe(true);
expect(s.amounts()).toEqual(before);expect(s.find('team-ledger__amount')).toBe(hero);expect(text(s.find('team-rank__level'))).toBe('V2');expect(text(s.find('invite-card__amount'))).toBe('0.02');
expect(s.find('team-ledger__breakdown').props.class).not.toContain('is-hidden');
expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');
expect(all(s.find('team-ledger__feedback')).filter(n=>String(n.props.class??'').split(' ').includes('is-active'))).toHaveLength(0);
const captions=all(s.find('invite-card__descriptions')).filter(n=>String(n.props.class??'').split(' ').includes('is-active'));
expect(captions).toHaveLength(1);expect(text(captions[0])).toBe(teamRedesignCopy(s.locale.code).qualifiedFriendReward);
const button=s.find('nx-team-copy-code');expect(button.props['aria-disabled']).toBe(true);button.props.onClick();expect(s.copyText).not.toHaveBeenCalled();
events.resolve(commissions(0));binary.resolve({...proof,estimatedAmountUsdt:0});current.resolve(rank);invite.resolve(reward(0));pool.resolve({...proof,myVotes:0,currentWeekPoolUSDT:0});await flush();expect(s.amounts()[0]).toContain('0');expect(text(s.find('invite-card__amount'))).toBe('0');expect(s.vrank.remoteReady).toBe(true);expect(s.commission.eventsStatus).toBe('ready');});
it('clears presentation on actual strict read failures and restores only confirmed retry results',async()=>{const s=await screen();remote.teamInsightsApi.commissions.mockRejectedValue(new Error('denied'));remote.referralRewardApi.snapshot.mockRejectedValue(new Error('denied'));remote.vRankApi.current.mockRejectedValue(new Error('denied'));await refreshProductCatalog(true);await flush();expect(s.commission.eventsStatus).toBe('error');expect(s.rewards.error).toBe('denied');expect(s.vrank.remoteReady).toBe(false);expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');expect(s.find('team-ledger__retry')).toBeDefined();});
it.each(['account','binding','environment','catalog'])('clears last presentation before a %s scope can show it',async boundary=>{const s=await screen();if(boundary==='account')s.app.accountKey='user:replacement';if(boundary==='binding')s.app.accountBindingEpoch++;if(boundary==='environment')remote.apiRuntimeConfig.environment='prod';if(boundary==='catalog')productCatalogState.serverCanonical=false;await Vue.nextTick();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');});

it.each(['success','failure'])('cannot refill the page from an old account read %s after rebind',async outcome=>{
 const s=await screen(),oldEvents=deferred(),oldRank=deferred(),oldReward=deferred(),freshEvents=deferred(),freshRank=deferred(),freshReward=deferred();
 remote.teamInsightsApi.commissions.mockReturnValueOnce(oldEvents.promise).mockReturnValue(freshEvents.promise);
 remote.vRankApi.current.mockReturnValueOnce(oldRank.promise).mockReturnValue(freshRank.promise);
 remote.referralRewardApi.snapshot.mockReturnValueOnce(oldReward.promise).mockReturnValue(freshReward.promise);
 await refreshProductCatalog(true);await Vue.nextTick();
 s.app.accountKey='user:replacement';s.app.accountBindingEpoch++;
 s.commission.bindAccount('user:replacement');s.network.bindAccount('user:replacement');s.vrank.bindAccount('user:replacement');s.rewards.bindAccount('user:replacement');
 await Vue.nextTick();expect(s.amounts()[0]).toBe('—');
 if(outcome==='success'){oldEvents.resolve(commissions(999));oldRank.resolve({...rank,rankCode:'V8'});oldReward.resolve(reward(999));}
 else {oldEvents.reject(new Error('old'));oldRank.reject(new Error('old'));oldReward.reject(new Error('old'));}
 await flush();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');
 freshEvents.resolve(commissions(23));freshRank.resolve(rank);freshReward.resolve(reward(.04));await flush();
 expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(text(s.find('team-rank__level'))).toBe('V2');
});

it('does not accept an old read into presentation after an unsupported live environment A-B-A change',async()=>{
 const s=await screen(),events=deferred(),current=deferred(),invite=deferred();
 remote.teamInsightsApi.commissions.mockReturnValue(events.promise);remote.vRankApi.current.mockReturnValue(current.promise);remote.referralRewardApi.snapshot.mockReturnValue(invite.promise);
 await refreshProductCatalog(true);remote.apiRuntimeConfig.environment='prod';remote.apiRuntimeConfig.environment='dev';
 events.resolve(commissions(999));current.resolve(rank);invite.resolve(reward(999));await flush();
 expect(s.commission.eventsStatus).toBe('idle');expect(s.vrank.remoteReady).toBe(false);
 expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');
});

it('retains confirmed income through rapid hidden/show visits, catalogue rotation and reversed actual store replies',async()=>{
 const s=await screen(),before=s.amounts(),networkReads=Array.from({length:3},()=>deferred()),eventReads=Array.from({length:3},()=>deferred());
 networkReads.forEach(read=>remote.teamNetworkApi.snapshot.mockReturnValueOnce(read.promise));
 eventReads.forEach(read=>remote.teamInsightsApi.commissions.mockReturnValueOnce(read.promise));
 const expectWarm=async()=>{await Vue.nextTick();expect(s.amounts()).toEqual(before);expect(all(s.find('team-ledger__feedback')).filter(n=>String(n.props.class??'').split(' ').includes('is-active'))).toHaveLength(0)};
 for(let i=0;i<3;i++){
  s.hooks.hide.forEach(fn=>fn());
  await refreshProductCatalog(true);
  s.hooks.show.forEach(fn=>fn());
  await expectWarm();
 }
 const net={...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0};
 expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(4);
 for(let i=networkReads.length-1;i>=0;i--){networkReads[i].resolve(net);await expectWarm()}
 for(let i=0;i<eventReads.length-1;i++){eventReads[i].resolve(commissions(999));await expectWarm()}
 eventReads[2].resolve(commissions(23));await flush();expect(s.amounts()[0]).toContain('23');
 expect(s.network.hasRemoteSnapshot).toBe(true);
});

it.each([en,zh,vietnamese])('keeps the actual SFC confirmed display visible at every synchronous runtime reset transition',async copy=>{
 const s=await screen(copy),events=deferred(),network=deferred();
 remote.teamInsightsApi.commissions.mockReturnValue(events.promise);remote.teamNetworkApi.snapshot.mockReturnValue(network.promise);
 const start=s.syncStates.length;
 await refreshProductCatalog(true);
 const transitions=s.syncStates.slice(start);
 expect(transitions.some(state=>state.events==='idle'&&state.present&&state.catalogValid)).toBe(true);
 expect(transitions.every(state=>state.visible)).toBe(true);
 expect(transitions.every(state=>!state.failed)).toBe(true);
 expect(s.commission.eventsEvidence).toBeNull();expect(s.commission.eventsStatus).toBe('loading');
 expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');
 events.resolve(commissions(23));network.resolve({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});await flush();
 expect(s.amounts()[0]).toContain('23');
});


it('joins current reads on repeated Team visits and keeps true 429 failure/retry semantics',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 const s=await screen(),before=s.amounts(),oldEvents=deferred(),oldNetwork=deferred();
 s.normalVisit();
 const eventCount=remote.teamInsightsApi.commissions.mock.calls.length,networkCount=remote.teamNetworkApi.snapshot.mock.calls.length;
 remote.teamInsightsApi.commissions.mockReturnValue(oldEvents.promise);remote.teamNetworkApi.snapshot.mockReturnValue(oldNetwork.promise);
 for(let visit=0;visit<6;visit++){s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Vue.nextTick();expect(s.amounts()).toEqual(before)}
 expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(eventCount+1);
 expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(networkCount+1);
 const freshEvents=deferred(),freshNetwork=deferred();remote.teamInsightsApi.commissions.mockReturnValue(freshEvents.promise);remote.teamNetworkApi.snapshot.mockReturnValue(freshNetwork.promise);
 await refreshProductCatalog(true);s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Vue.nextTick();
 expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(eventCount+2);
 expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(networkCount+2);
 oldEvents.reject(new Error('obsolete 429'));oldNetwork.reject(new Error('obsolete 429'));await flush();expect(s.amounts()).toEqual(before);
 freshEvents.reject(new Error('current 429'));freshNetwork.reject(new Error('current 429'));await flush();
 expect(s.commission.eventsStatus).toBe('error');expect(s.network.remoteStatus).toBe('error');expect(s.amounts()[0]).toBe('—');
 expect(s.find('team-ledger__retry').props.tabindex).toBe(0);
 remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});
 s.normalVisit();s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await flush();
 expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(eventCount+3);
 expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(networkCount+3);
 expect(s.amounts()[0]).toContain('23');
});

it.each([0,20_000,undefined])('retains read-only history through HTTP429 and respects Retry-After=%s on auto/runtime/manual reads',async retryAfterMs=>{
 vi.useFakeTimers({toFake:['Date']});
 const s=await screen(),before=s.amounts(),error=new ApiError({kind:'http',status:429,message:'rate limited',retryAfterMs});
 remote.teamInsightsApi.commissions.mockRejectedValue(error);remote.teamNetworkApi.snapshot.mockRejectedValue(error);
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);await flush();
 expect(s.commission.eventsStatus).toBe('error');expect(s.network.remoteStatus).toBe('error');expect(s.commission.eventsEvidence).toBeNull();
 expect(s.commission.eventsRateLimited).toBe(true);expect(s.network.remoteRateLimited).toBe(true);expect(s.amounts()).toEqual(before);
 expect(s.find('team-ledger__retry').props.tabindex).toBe(0);expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');
 const events=remote.teamInsightsApi.commissions.mock.calls.length,network=remote.teamNetworkApi.snapshot.mock.calls.length;
 const delay=retryAfterMs??30_000;
 if(delay>0){
  for(let visit=0;visit<3;visit++){s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);await refreshProductCatalog(true)}
  expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(events);expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(network);
  expect(s.commission.eventsStatus).toBe('error');expect(s.network.remoteStatus).toBe('error');expect(s.amounts()).toEqual(before);
  vi.setSystemTime(Date.now()+delay-1);await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);
  expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(events);expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(network);
  vi.setSystemTime(Date.now()+1);
 }
 remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);await flush();
 expect(s.commission.eventsStatus).toBe('ready');expect(s.network.remoteStatus).toBe('ready');expect(s.amounts()[0]).toContain('23');
 expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(events+1);expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(network+1);
});

it('reuses the same visit while normal returns, explicit refresh and runtime invalidation still reread',async()=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen();
 const counts=()=>[remote.teamInsightsApi.commissions.mock.calls.length,remote.teamNetworkApi.snapshot.mock.calls.length];
 const first=counts();for(let visit=0;visit<4;visit++){s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await flush()}
 expect(counts()).toEqual(first);vi.setSystemTime(Date.now()+9_999);
 await Promise.all([s.commission.ensureCanonicalEvents(),s.network.ensureCanonicalNetwork()]);expect(counts()).toEqual(first);
 s.normalVisit();await Promise.all([s.commission.ensureCanonicalEvents(),s.network.ensureCanonicalNetwork()]);expect(counts()).toEqual(first.map(n=>n+1));
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);expect(counts()).toEqual(first.map(n=>n+2));
 await refreshProductCatalog(true);await flush();expect(counts()).toEqual(first.map(n=>n+3));
});

it('keeps confirmed Team display during protected visits and reads a fresh pending result on the next normal return',async()=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),before=s.amounts();
 const counts=()=>[remote.teamInsightsApi.commissions.mock.calls.length,remote.teamNetworkApi.snapshot.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length];
 const first=counts();
 for(const path of ['/pages/index/index','/pages/earn/earn','/pages/team/team'])s.activate(path,true);
 s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await flush();expect(counts()).toEqual(first);expect(s.amounts()).toEqual(before);
 expect(s.commission.eventsStatus).toBe('ready');expect(s.rewards.error).toBeNull();
 vi.setSystemTime(Date.now()+2000);s.activate('/pages/store/store',true);
 vi.setSystemTime(Date.now()+1000);expect(counts()).toEqual(first);
 const pending=deferred();remote.teamInsightsApi.commissions.mockReturnValue(pending.promise);
 s.normalVisit();s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Vue.nextTick();
 expect(counts()).toEqual(first.map(n=>n+1));expect(s.amounts()).toEqual(before);expect(s.commission.eventsStatus).toBe('loading');
 expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');
 pending.resolve(commissions(23));await flush();expect(s.amounts()[0]).toContain('23');expect(s.commission.eventsStatus).toBe('ready');
});

it.each([
 new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'}),
 new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}),
 new ApiError({kind:'http',status:503,message:'HTTP_503'}),
])('retains actual Team and Invite nodes through repeated transient catalog error/loading/error %s while live actions stay blocked',async failure=>{
 const s=await screen(),before=s.amounts(),ledgerNode=s.find('team-ledger__amount'),inviteNode=s.find('invite-card__amount');
 remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.teamNetworkApi.snapshot.mockRejectedValue(failure);
 remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();
 expect(s.amounts()).toEqual(before);expect(text(inviteNode)).toBe('0.02');
 for(let attempt=0;attempt<2;attempt++){
  const pending=deferred();remote.productCatalogApi.catalog.mockReturnValueOnce(pending.promise);
  const refresh=refreshProductCatalog(true);await Vue.nextTick();
  expect(productCatalogState.status).toBe('loading');expect(productCatalogDisplayProof.value).not.toBeNull();expect(isProductCatalogDisplayCurrent()).toBe(true);
  expect(s.amounts()).toEqual(before);expect(s.find('team-ledger__amount')).toBe(ledgerNode);expect(s.find('invite-card__amount')).toBe(inviteNode);expect(text(inviteNode)).toBe('0.02');
  expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true);
  pending.reject(failure);expect(await refresh).toBe(false);await flush();
  expect(productCatalogState.status).toBe('error');expect(productCatalogState.serverCanonical).toBe(false);
  expect(s.amounts()).toEqual(before);expect(text(inviteNode)).toBe('0.02');expect(s.vrank.remoteReady).toBe(false);expect(s.rewards.snapshot).toBeNull();
  expect(s.find('team-ledger__retry')).toBeDefined();expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true);
 }
 remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.referralRewardApi.snapshot.mockResolvedValue(reward(.04));remote.vRankApi.current.mockResolvedValue(rank);
 remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[],revision:'offline-recovered'});expect(await refreshProductCatalog(true)).toBe(true);await flush();
 expect(s.amounts()[0]).toContain('23');expect(text(inviteNode)).toBe('0.04');expect(s.commission.eventsStatus).toBe('ready');expect(s.rewards.error).toBeNull();
});

it.each(['account','binding','environment','baseUrl','locale'])('clears rate-limited historical display on %s changes',async boundary=>{
 const s=await screen(),error=new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:20_000});
 remote.teamInsightsApi.commissions.mockRejectedValue(error);remote.teamNetworkApi.snapshot.mockRejectedValue(error);
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);await flush();expect(s.amounts()[0]).not.toBe('—');
 if(boundary==='account')s.app.accountKey='user:replacement';if(boundary==='binding')s.app.accountBindingEpoch++;
 if(boundary==='environment')remote.apiRuntimeConfig.environment='prod';if(boundary==='baseUrl')remote.apiRuntimeConfig.baseUrl='https://other.invalid';if(boundary==='locale')s.locale.code='vi';
 await Vue.nextTick();expect(s.amounts()[0]).toBe('—');
 if(boundary==='environment'||boundary==='baseUrl'){expect(s.network.hasRemoteSnapshot).toBe(false);expect(s.commission.eventsEvidence).toBeNull()}
});

it.each([401,403,'protocol','business','configuration'])('clears historical amounts on strict %s after rate limiting',async rejection=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),limited=new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:1});
 remote.teamInsightsApi.commissions.mockRejectedValue(limited);remote.teamNetworkApi.snapshot.mockRejectedValue(limited);
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);await flush();expect(s.amounts()[0]).not.toBe('—');
 vi.setSystemTime(Date.now()+1);const error=typeof rejection==='number'?new ApiError({kind:'http',status:rejection,message:'denied'}):new ApiError({kind:rejection as 'protocol'|'business'|'configuration',message:'denied'});
 remote.teamInsightsApi.commissions.mockRejectedValue(error);remote.teamNetworkApi.snapshot.mockRejectedValue(error);
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()]);await flush();
 expect(s.amounts()[0]).toBe('—');expect(s.network.hasRemoteSnapshot).toBe(false);expect(s.commission.eventsEvidence).toBeNull();
});

it('drops old 429 and old success at actual account rebind and lets the new owner read immediately',async()=>{
 const s=await screen(),oldEvents=deferred(),oldNetwork=deferred();
 remote.teamInsightsApi.commissions.mockReturnValueOnce(oldEvents.promise).mockResolvedValue(commissions(23));
 remote.teamNetworkApi.snapshot.mockReturnValueOnce(oldNetwork.promise).mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});
 const oldReads=[s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork()];
 s.app.accountKey='user:replacement';s.app.accountBindingEpoch++;
 s.commission.bindAccount('user:replacement');s.network.bindAccount('user:replacement');
 oldEvents.reject(new ApiError({kind:'http',status:429,message:'obsolete limited',retryAfterMs:60_000}));
 oldNetwork.resolve({...proof,totalMembers:99,members:[],monthVolumeUsdt:999,lifetimeVolumeUsdt:999});
 await Promise.all(oldReads);await flush();
 expect(s.commission.eventsRateLimited).toBe(false);expect(s.network.remoteRateLimited).toBe(false);
 expect(s.commission.eventsStatus).toBe('ready');expect(s.network.remoteStatus).toBe('ready');expect(s.network.totalMembers).toBe(0);expect(s.amounts()[0]).toContain('23');
});

it.each([en,zh,vietnamese])('retains only invitation reward history on 429 while all four live share entries remain blocked',async copy=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(copy),previous=text(s.find('invite-card__amount'));
 remote.referralRewardApi.snapshot.mockRejectedValue(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:20_000}));
 await s.rewards.refresh();await flush();expect(s.rewards.snapshot).toBeNull();expect(s.rewards.error).toBe('limited');expect(s.rewards.loading).toBe(false);
 expect(text(s.find('invite-card__amount'))).toBe(previous);
 for(const cls of ['nx-team-share-now','nx-team-share-poster','nx-team-copy-code','nx-team-copy-link']){const action=s.find(cls);expect(action.props['aria-disabled']).toBe(true);action.props.onClick()}
 expect(s.copyText).not.toHaveBeenCalled();
 const count=remote.referralRewardApi.snapshot.mock.calls.length;
 for(let visit=0;visit<3;visit++){s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await s.rewards.refresh();await refreshProductCatalog(true)}
 expect(remote.referralRewardApi.snapshot).toHaveBeenCalledTimes(count);expect(text(s.find('invite-card__amount'))).toBe(previous);
 vi.setSystemTime(Date.now()+20_000);remote.referralRewardApi.snapshot.mockResolvedValue(reward(0));await s.rewards.refresh();await flush();
 expect(text(s.find('invite-card__amount'))).toBe('0');expect(s.rewards.error).toBeNull();expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(false);
});

it('joins active invitation reads and refreshes on the next normal visit',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 const s=await screen(),before=text(s.find('invite-card__amount')),pending=deferred(),count=remote.referralRewardApi.snapshot.mock.calls.length;s.normalVisit();
 remote.referralRewardApi.snapshot.mockReturnValue(pending.promise);
 for(let visit=0;visit<6;visit++){s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Vue.nextTick();expect(text(s.find('invite-card__amount'))).toBe(before);expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true)}
 expect(remote.referralRewardApi.snapshot).toHaveBeenCalledTimes(count+1);
 pending.resolve(reward(.03));await flush();expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(false);
 s.normalVisit();const next=deferred();remote.referralRewardApi.snapshot.mockReturnValue(next.promise);s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());
 expect(remote.referralRewardApi.snapshot).toHaveBeenCalledTimes(count+2);expect(s.rewards.snapshot).toBeNull();await Vue.nextTick();expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true);
 next.resolve({...reward(.03),rewardEnabled:false});await flush();expect(text(s.find('invite-card__amount'))).toBe('—');
});

it.each([undefined,0])('applies referral 429 default/zero delay %s without a TTL for live codes',async retryAfterMs=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),limited=new ApiError({kind:'http',status:429,message:'limited',retryAfterMs});
 remote.referralRewardApi.snapshot.mockRejectedValue(limited);await s.rewards.refresh();await flush();const count=remote.referralRewardApi.snapshot.mock.calls.length;
 if(retryAfterMs===undefined){await s.rewards.refresh();await s.rewards.ensure();expect(remote.referralRewardApi.snapshot).toHaveBeenCalledTimes(count);vi.setSystemTime(Date.now()+30_000)}
 remote.referralRewardApi.snapshot.mockResolvedValue(reward(.04));await s.rewards.refresh();await flush();expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(remote.referralRewardApi.snapshot).toHaveBeenCalledTimes(count+1);
});

it.each(['account','binding','environment','baseUrl','locale',401,403,'protocol','business','configuration'])('clears rate-limited invitation history for %s',async boundary=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),limited=new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:1});
 remote.referralRewardApi.snapshot.mockRejectedValue(limited);await s.rewards.refresh();await flush();expect(text(s.find('invite-card__amount'))).toBe('0.02');
 if(boundary==='account')s.app.accountKey='user:replacement';if(boundary==='binding')s.app.accountBindingEpoch++;
 if(boundary==='environment')remote.apiRuntimeConfig.environment='prod';if(boundary==='baseUrl')remote.apiRuntimeConfig.baseUrl='https://other.invalid';if(boundary==='locale')s.locale.code='vi';
 if(typeof boundary==='number'||['protocol','business','configuration'].includes(String(boundary))){vi.setSystemTime(Date.now()+1);remote.referralRewardApi.snapshot.mockRejectedValue(typeof boundary==='number'?new ApiError({kind:'http',status:boundary,message:'denied'}):new ApiError({kind:boundary as 'protocol'|'business'|'configuration',message:'denied'}));await s.rewards.refresh()}
 await flush();expect(text(s.find('invite-card__amount'))).toBe('—');expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true);
});

it('does not let an old referral 429 poison a newly bound owner or recover the old share code',async()=>{
 const s=await screen(),old=deferred();remote.referralRewardApi.snapshot.mockReturnValueOnce(old.promise).mockResolvedValue({...reward(.04),referralCode:'NEW-CURRENT'});
 const request=s.rewards.refresh();s.app.accountKey='user:replacement';s.app.accountBindingEpoch++;s.rewards.bindAccount('user:replacement');
 old.reject(new ApiError({kind:'http',status:429,message:'obsolete limited',retryAfterMs:60_000}));await request;await flush();
 expect(s.rewards.rateLimited).toBe(false);expect(s.rewards.error).toBeNull();expect(s.rewards.snapshot?.referralCode).toBe('NEW-CURRENT');expect(text(s.find('invite-card__amount'))).toBe('0.04');
 s.find('nx-team-copy-code').props.onClick();expect(s.copyText).toHaveBeenCalledWith('NEW-CURRENT');
});

it.each(['success','429'])('fences pre-locale A-B-A %s and restores only new current live reads',async outcome=>{
 const s=await screen(),events=deferred(),network=deferred(),invite=deferred();
 remote.teamInsightsApi.commissions.mockReturnValueOnce(events.promise).mockResolvedValue(commissions(23));
 remote.teamNetworkApi.snapshot.mockReturnValueOnce(network.promise).mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});
 remote.referralRewardApi.snapshot.mockReturnValueOnce(invite.promise).mockResolvedValue({...reward(.04),referralCode:'POST-LOCALE'});
 const old=[s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork(),s.rewards.refresh()];
 s.locale.code='vi';s.locale.code='en';await Vue.nextTick();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true);
 if(outcome==='success'){events.resolve(commissions(999));network.resolve({...proof,totalMembers:99,members:[],monthVolumeUsdt:999,lifetimeVolumeUsdt:999});invite.resolve({...reward(999),referralCode:'PRE-LOCALE'})}
 else{const limited=new ApiError({kind:'http',status:429,message:'pre-locale limited',retryAfterMs:60_000});events.reject(limited);network.reject(limited);invite.reject(limited)}
 await Promise.all(old);await flush();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true);s.find('nx-team-copy-code').props.onClick();expect(s.copyText).not.toHaveBeenCalled();
 await Promise.all([s.commission.ensureCanonicalEvents(),s.network.ensureCanonicalNetwork(),s.rewards.ensure()]);await flush();
 expect(s.amounts()[0]).toContain('23');expect(s.network.totalMembers).toBe(0);expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(false);s.find('nx-team-copy-code').props.onClick();expect(s.copyText).toHaveBeenCalledWith('POST-LOCALE');
});

it('preserves same-account Retry-After across locale A-B-A without allowing new display or live code',async()=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),limited=new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:20_000});
 remote.teamInsightsApi.commissions.mockRejectedValue(limited);remote.teamNetworkApi.snapshot.mockRejectedValue(limited);remote.referralRewardApi.snapshot.mockRejectedValue(limited);
 await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork(),s.rewards.refresh()]);await flush();
 const counts=()=>[remote.teamInsightsApi.commissions.mock.calls.length,remote.teamNetworkApi.snapshot.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length],before=counts();
 s.locale.code='vi';s.locale.code='en';await Vue.nextTick();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');
 await Promise.all([s.commission.ensureCanonicalEvents(),s.network.ensureCanonicalNetwork(),s.rewards.ensure(),s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork(),s.rewards.refresh()]);await refreshProductCatalog(true);await flush();expect(counts()).toEqual(before);
 vi.setSystemTime(Date.now()+19_999);await Promise.all([s.commission.refreshCanonicalEvents(),s.network.refreshCanonicalNetwork(),s.rewards.refresh()]);expect(counts()).toEqual(before);
 vi.setSystemTime(Date.now()+1);remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.referralRewardApi.snapshot.mockResolvedValue({...reward(.04),referralCode:'POST-LOCALE'});
 await Promise.all([s.commission.ensureCanonicalEvents(),s.network.ensureCanonicalNetwork(),s.rewards.ensure()]);await flush();expect(counts()).toEqual(before.map(n=>n+1));expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');
});

it.each([en,zh,vietnamese])('keeps main-Team member counts through current Network 429 without granting navigation',async copy=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(copy);
 const member=(index:number)=>({id:String(index+1),name:'Member '+index,vRank:0,layer:index<3?1:2,leg:null,joinedAt:'2026-10-27T00:00:00Z',monthVolumeUsdt:0,lifetimeVolumeUsdt:0,status:'ACTIVE',region:null});
 const members={...proof,totalMembers:12,members:Array.from({length:12},(_,i)=>member(i)),monthVolumeUsdt:0,lifetimeVolumeUsdt:0};
 remote.teamNetworkApi.snapshot.mockResolvedValue(members);await s.network.refreshCanonicalNetwork();await flush();
 const count=s.find('team-summary__number'),card=s.find('team-summary'),direct=s.find('team-summary__direct');
 expect(text(count)).toBe('12');expect(text(direct)).toContain('3');expect(s.syncStates.at(-1)?.totalMembers).toBe('12');expect(s.syncStates.at(-1)?.extendedMembers).toBe('9');
 s.navTo.mockClear();remote.teamNetworkApi.snapshot.mockRejectedValue(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:20_000}));await s.network.refreshCanonicalNetwork();await flush();
 expect(s.network.remoteStatus).toBe('error');expect(s.network.remoteRateLimited).toBe(true);expect(s.network.hasRemoteSnapshot).toBe(true);
 expect(text(count)).toBe('12');expect(text(direct)).toContain('3');expect(s.syncStates.at(-1)?.totalMembers).toBe('12');expect(s.syncStates.at(-1)?.extendedMembers).toBe('9');
 expect(card.props.role).toBeUndefined();expect(s.find('team-summary__arrow').props.style.visibility).toBe('hidden');card.props.onClick();expect(s.navTo).not.toHaveBeenCalled();
 expect(text(s.find('team-summary__status'))).toContain(copy.team.summaryUnavailable);
 const retries=all(s.find('team-summary__status')).filter(n=>n.tag==='button');expect(retries).toHaveLength(1);const calls=remote.teamNetworkApi.snapshot.mock.calls.length;retries[0].props.onClick();await flush();expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(calls);
 vi.setSystemTime(Date.now()+20_000);remote.teamNetworkApi.snapshot.mockResolvedValue({...members,totalMembers:2,members:[member(0),member(4)]});retries[0].props.onClick();await flush();
 expect(text(count)).toBe('2');expect(text(direct)).toContain('1');expect(s.syncStates.at(-1)?.totalMembers).toBe('2');expect(s.syncStates.at(-1)?.extendedMembers).toBe('1');card.props.onClick();expect(s.navTo).toHaveBeenCalledWith('/pages/team/tree');
});

it.each(['auth','protocol','locale','account','binding','baseUrl'])('main-Team member history cannot survive strict/current-owner %s changes',async boundary=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),member={id:'1',name:'Member',vRank:0,layer:1,leg:null,joinedAt:'2026-10-27T00:00:00Z',monthVolumeUsdt:0,lifetimeVolumeUsdt:0,status:'ACTIVE',region:null};
 const confirmed={...proof,totalMembers:1,members:[member],monthVolumeUsdt:0,lifetimeVolumeUsdt:0};remote.teamNetworkApi.snapshot.mockResolvedValue(confirmed);await s.network.refreshCanonicalNetwork();await flush();
 remote.teamNetworkApi.snapshot.mockRejectedValue(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:1}));await s.network.refreshCanonicalNetwork();await flush();expect(text(s.find('team-summary__number'))).toBe('1');
 vi.setSystemTime(Date.now()+1);
 if(boundary==='auth'||boundary==='protocol'){remote.teamNetworkApi.snapshot.mockRejectedValue(new ApiError({kind:boundary as 'auth'|'protocol',message:'denied'}));await s.network.refreshCanonicalNetwork();await flush()}
 else{
  const old=deferred(),fresh=deferred();remote.teamNetworkApi.snapshot.mockReturnValueOnce(old.promise).mockReturnValue(fresh.promise);const pending=s.network.refreshCanonicalNetwork();
  if(boundary==='locale'){s.locale.code='vi';s.locale.code='en'}
  if(boundary==='account'||boundary==='binding'){s.app.accountKey=boundary==='account'?'user:new':s.app.accountKey;s.app.accountBindingEpoch++;s.network.bindAccount(s.app.accountKey)}
  if(boundary==='baseUrl'){remote.apiRuntimeConfig.baseUrl='https://other.invalid';remote.apiRuntimeConfig.baseUrl='https://test.invalid'}
  old.resolve({...confirmed,totalMembers:99,members:Array.from({length:99},(_,i)=>({...member,id:String(i+1)}))});await pending;await flush();
 }
 expect(text(s.find('team-summary__number'))).toBe('—');expect(text(s.find('team-summary__direct'))).toContain('—');expect(s.syncStates.at(-1)?.totalMembers).toBe('—');expect(s.syncStates.at(-1)?.extendedMembers).toBe('—');
 s.navTo.mockClear();s.find('team-summary').props.onClick();expect(s.navTo).not.toHaveBeenCalled();
});

it('retains only the confirmed Team rank numeral during current 429, without live rank authority',async()=>{
 const s=await screen();expect(text(s.find('team-rank__level'))).toBe('V2');
 remote.vRankApi.current.mockRejectedValue(new ApiError({kind:'http',status:429,message:'rank limited',retryAfterMs:20_000}));
 await s.vrank.refreshCanonicalVRank();await flush();
 expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.remoteError).not.toBeNull();expect(s.vrank.ladder).toEqual([]);expect(s.vrank.capabilities).toEqual({peer:false,genesis:false});
 expect(text(s.find('team-rank__level'))).toBe('V2');
});

it('joins a current pending rank pair on repeated Team shows instead of issuing two GETs per visit',async()=>{
 const s=await screen(),oldL=deferred(),oldR=deferred(),newL=deferred(),newR=deferred();
 const before=[remote.vRankApi.ladder.mock.calls.length,remote.vRankApi.current.mock.calls.length];
 remote.vRankApi.ladder.mockReturnValueOnce(oldL.promise).mockReturnValue(newL.promise);remote.vRankApi.current.mockReturnValueOnce(oldR.promise).mockReturnValue(newR.promise);
 const pending=s.vrank.refreshCanonicalVRank();for(let visit=0;visit<6;visit++){s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Vue.nextTick()}
 expect([remote.vRankApi.ladder.mock.calls.length,remote.vRankApi.current.mock.calls.length]).toEqual(before.map(n=>n+1));
 await refreshProductCatalog(true);newL.resolve(ladder);newR.resolve({...rank,rankCode:'V1'});await flush();expect(s.vrank.remoteReady).toBe(true);expect(text(s.find('team-rank__level'))).toBe('V1');
 oldL.resolve(ladder);oldR.resolve({...rank,rankCode:'V8'});await pending;await flush();expect(text(s.find('team-rank__level'))).toBe('V1');
});

it.each([undefined,0,20_000])('rank current429 Retry-After %s blocks show/runtime/manual and refreshes on a normal visit',async retryAfterMs=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),limited=new ApiError({kind:'http',status:429,message:'limited',retryAfterMs});
 remote.vRankApi.current.mockRejectedValue(limited);await s.vrank.refreshCanonicalVRank();await flush();
 expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.remoteRateLimited).toBe(true);expect(s.vrank.myRank).toBe(0);expect(s.vrank.ladder).toEqual([]);expect(text(s.find('team-rank__level'))).toBe('V2');expect(text(s.find('team-rank__status'))).toContain(en.rank.loadError);
 const counts=()=>[remote.vRankApi.ladder.mock.calls.length,remote.vRankApi.current.mock.calls.length],before=counts(),delay=retryAfterMs??30_000;
 if(delay>0){for(let visit=0;visit<3;visit++){s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());s.find('team-rank__retry').props.onClick({stopPropagation(){}});await s.vrank.refreshCanonicalVRank();await refreshProductCatalog(true)}expect(counts()).toEqual(before);expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.remoteError).not.toBeNull();vi.setSystemTime(Date.now()+delay-1);await s.vrank.refreshCanonicalVRank();expect(counts()).toEqual(before);vi.setSystemTime(Date.now()+1)}
 remote.vRankApi.current.mockResolvedValue({...rank,rankCode:'V1'});s.find('team-rank__retry').props.onClick({stopPropagation(){}});await flush();expect(counts()).toEqual(before.map(n=>n+1));expect(s.vrank.remoteReady).toBe(true);expect(text(s.find('team-rank__level'))).toBe('V1');
 s.normalVisit();const pending=deferred();remote.vRankApi.current.mockReturnValue(pending.promise);s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Vue.nextTick();expect(counts()).toEqual(before.map(n=>n+2));expect(s.vrank.remoteReady).toBe(false);expect(text(s.find('team-rank__level'))).toBe('V1');pending.resolve({...rank,rankCode:'V0'});await flush();expect(text(s.find('team-rank__level'))).toBe('V0');
});

it.each(['locale','account','binding','baseUrl'])('rejects old rank replies on %s A-B-A and recovers only a current owner',async boundary=>{
 const s=await screen(),old=deferred(),fresh=deferred();remote.vRankApi.current.mockReturnValueOnce(old.promise).mockReturnValue(fresh.promise);const pending=s.vrank.refreshCanonicalVRank();
 if(boundary==='locale'){s.locale.code='vi';s.locale.code='en'}
 if(boundary==='account'||boundary==='binding'){for(const key of boundary==='binding'?['user:fixture','user:fixture']:['user:B','user:fixture']){s.app.accountKey=key;s.app.accountBindingEpoch++;s.vrank.bindAccount(key)}}
 if(boundary==='baseUrl'){remote.apiRuntimeConfig.baseUrl='https://b.invalid';remote.apiRuntimeConfig.baseUrl='https://test.invalid'}
 old.resolve({...rank,rankCode:'V8'});await pending;await flush();expect(text(s.find('team-rank__level'))).toBe('V—');expect(s.vrank.remoteReady).toBe(false);
 if(boundary!=='baseUrl'){const current=s.vrank.ensureCanonicalVRank();fresh.resolve({...rank,rankCode:'V1'});await current;await flush();expect(text(s.find('team-rank__level'))).toBe('V1');expect(s.vrank.remoteReady).toBe(true)}
});

it('preserves rank429 cooldown across locale A-B-A and ignores a stale denial after runtime recovery',async()=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen();remote.vRankApi.current.mockRejectedValue(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:20_000}));await s.vrank.refreshCanonicalVRank();await flush();const count=remote.vRankApi.current.mock.calls.length;
 s.locale.code='vi';s.locale.code='en';await Promise.all([s.vrank.ensureCanonicalVRank(),s.vrank.refreshCanonicalVRank()]);await refreshProductCatalog(true);await flush();expect(remote.vRankApi.current).toHaveBeenCalledTimes(count);expect(text(s.find('team-rank__level'))).toBe('V—');
 vi.setSystemTime(Date.now()+20_000);const old=deferred();remote.vRankApi.current.mockReturnValueOnce(old.promise).mockResolvedValue({...rank,rankCode:'V1'});const pending=s.vrank.refreshCanonicalVRank();await refreshProductCatalog(true);await flush();expect(s.vrank.remoteReady).toBe(true);expect(text(s.find('team-rank__level'))).toBe('V1');old.reject(new ApiError({kind:'auth',status:403,message:'old actor denied'}));await pending;await flush();expect(s.vrank.remoteReady).toBe(true);expect(text(s.find('team-rank__level'))).toBe('V1');
});

it.each(['auth','protocol','business','configuration'])('clears historical Team rank on current strict %s denial',async kind=>{
 const s=await screen();remote.vRankApi.current.mockRejectedValue(new ApiError({kind:kind as 'auth'|'protocol'|'business'|'configuration',status:kind==='auth'?403:undefined,message:'denied'}));await s.vrank.refreshCanonicalVRank();await flush();expect(text(s.find('team-rank__level'))).toBe('V—');expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.remoteRateLimited).toBe(false);expect(s.vrank.ladder).toEqual([]);expect(s.vrank.capabilities).toEqual({peer:false,genesis:false});
});

it('clears readonly Team rank when the other current GET is strictly denied after the first GET returns429',async()=>{
 const s=await screen(),held=deferred();remote.vRankApi.ladder.mockReturnValue(held.promise);remote.vRankApi.current.mockRejectedValue(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:20_000}));await s.vrank.refreshCanonicalVRank();await flush();expect(text(s.find('team-rank__level'))).toBe('V2');
 held.reject(new ApiError({kind:'auth',status:403,message:'current role denied'}));await flush();expect(text(s.find('team-rank__level'))).toBe('V—');expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.remoteRateLimited).toBe(false);
});

it.each(['ladder','current'] as const)('server auth code403 in %s cannot use the local500ms retry or restore Team rank',async leg=>{
 const s=await screen();vi.useFakeTimers();const before=[remote.vRankApi.ladder.mock.calls.length,remote.vRankApi.current.mock.calls.length];
 remote.vRankApi[leg].mockRejectedValueOnce(new ApiError({kind:'auth',code:403,message:'AUTH_SESSION_REQUIRED'}));const pending=s.vrank.refreshCanonicalVRank();await flush();expect(vi.getTimerCount()).toBe(0);
 await vi.advanceTimersByTimeAsync(500);await pending;await flush();expect([remote.vRankApi.ladder.mock.calls.length,remote.vRankApi.current.mock.calls.length]).toEqual(before.map(n=>n+1));expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.remoteRateLimited).toBe(false);expect(s.vrank.ladder).toEqual([]);expect(s.vrank.capabilities).toEqual({peer:false,genesis:false});expect(text(s.find('team-rank__level'))).toBe('V—');
});

it.each([
 new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'}),
 new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}),
 new ApiError({kind:'http',status:503,message:'HTTP_503'}),
])('retains actual Team ledger and member numerals when only current Network has explicit transient %s',async failure=>{
 const s=await screen(),member=(i:number)=>({id:String(i),name:'Member',vRank:0,layer:i<3?1:2,leg:null,joinedAt:'2026-10-27T00:00:00Z',monthVolumeUsdt:0,lifetimeVolumeUsdt:0,status:'ACTIVE',region:null});
 remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:12,members:Array.from({length:12},(_,i)=>member(i)),monthVolumeUsdt:0,lifetimeVolumeUsdt:0});await s.network.refreshCanonicalNetwork();await flush();const before=s.amounts();
 remote.teamNetworkApi.snapshot.mockRejectedValue(failure);await s.network.refreshCanonicalNetwork();await flush();
 expect.soft(s.amounts()).toEqual(before);expect.soft(text(s.find('team-summary__number'))).toBe('12');expect.soft(text(s.find('team-summary__direct'))).toContain('3');expect.soft(s.syncStates.at(-1)?.extendedMembers).toBe('9');
 expect(s.network.remoteStatus).toBe('error');s.navTo.mockClear();s.find('team-summary').props.onClick();expect(s.navTo).not.toHaveBeenCalled();expect(text(s.find('team-summary__status'))).toContain(en.team.summaryUnavailable);expect(s.find('team-ledger__retry')).toBeDefined();expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');
 remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:1,members:[member(0)],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});await s.network.refreshCanonicalNetwork();await flush();expect(text(s.find('team-summary__number'))).toBe('1');expect(s.network.remoteStatus).toBe('ready');
});

it.each([
 new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'}),
 new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}),
 new ApiError({kind:'http',status:503,message:'HTTP_503'}),
])('retains actual Team/Invite/rank historical numerals on explicit current transient %s without live permissions',async failure=>{
 const s=await screen(),before=s.amounts();remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await Promise.all([s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();
 expect.soft(s.amounts()).toEqual(before);expect.soft(text(s.find('invite-card__amount'))).toBe('0.02');expect.soft(text(s.find('team-rank__level'))).toBe('V2');
 expect(s.commission.eventsStatus).toBe('error');expect(s.commission.eventsEvidence).toBeNull();expect(s.rewards.snapshot).toBeNull();expect(s.rewards.error).not.toBeNull();expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.ladder).toEqual([]);expect(s.vrank.capabilities).toEqual({peer:false,genesis:false});
 expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(true);s.find('nx-team-copy-code').props.onClick();expect(s.copyText).not.toHaveBeenCalled();expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');expect(s.find('team-ledger__retry')).toBeDefined();expect(text(s.find('team-rank__status'))).toContain(en.rank.loadError);
 remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.referralRewardApi.snapshot.mockResolvedValue({...reward(.04),referralCode:'RESTORED'});remote.vRankApi.current.mockResolvedValue({...rank,rankCode:'V1'});
 await Promise.all([s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(text(s.find('team-rank__level'))).toBe('V1');
});

it.each([
 ...(['auth','business','protocol','configuration'] as const).flatMap(kind=>[{kind,code:429},{kind,status:503}].map(options=>new ApiError({...options,message:'STRICT_REFUSAL'}))),
 new ApiError({kind:'http',status:401,message:'DENIED'}),new ApiError({kind:'http',code:403,message:'DENIED'}),
 new ApiError({kind:'http',status:404,message:'NOT_FOUND'}),new Error('UNKNOWN'),
])('all actual Team chains keep strict or unknown %s out of transient display/cooldown',async failure=>{
 const s=await screen();remote.teamNetworkApi.snapshot.mockRejectedValue(failure);remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();
 expect(s.network.remoteTransientFailure).toBe(false);expect(s.commission.eventsTransientFailure).toBe(false);expect(s.rewards.transientFailure).toBe(false);expect(s.vrank.remoteTransientFailure).toBe(false);
 expect(s.network.remoteRateLimited).toBe(false);expect(s.commission.eventsRateLimited).toBe(false);expect(s.rewards.rateLimited).toBe(false);expect(s.vrank.remoteRateLimited).toBe(false);
 expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');expect(s.network.hasRemoteSnapshot).toBe(false);
 remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.referralRewardApi.snapshot.mockResolvedValue(reward(.04));remote.vRankApi.current.mockResolvedValue({...rank,rankCode:'V1'});
 const counts=[remote.teamNetworkApi.snapshot.mock.calls.length,remote.teamInsightsApi.commissions.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length,remote.vRankApi.current.mock.calls.length];
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();
 expect([remote.teamNetworkApi.snapshot.mock.calls.length,remote.teamInsightsApi.commissions.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length,remote.vRankApi.current.mock.calls.length]).toEqual(counts.map(n=>n+1));
 expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(text(s.find('team-rank__level'))).toBe('V1');
});

it.each([en,zh,vietnamese])('cold unknown transient never invents numeric zero or live permissions',async copy=>{
 const failure=new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'});remote.teamNetworkApi.snapshot.mockRejectedValue(failure);remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 const s=await screen(copy);expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');expect(text(s.find('team-summary__number'))).toBe('—');expect(s.network.hasRemoteSnapshot).toBe(false);
 for(const cls of ['nx-team-share-now','nx-team-share-poster','nx-team-copy-code','nx-team-copy-link']){const action=s.find(cls);expect(action.props['aria-disabled']).toBe(true);await action.props.onClick()}
 expect(s.copyText).not.toHaveBeenCalled();s.navTo.mockClear();s.find('team-summary').props.onClick();expect(s.navTo).not.toHaveBeenCalled();
});

it.each(['first-transient','first-strict'])('late current rank pair denial stays strict regardless %s order',async order=>{
 const s=await screen(),late=deferred();remote.vRankApi.ladder.mockReturnValueOnce(late.promise);remote.vRankApi.current.mockRejectedValueOnce(order==='first-transient'?new ApiError({kind:'network',message:'TIMEOUT'}):new ApiError({kind:'business',code:429,message:'BUSINESS_REFUSED'}));
 await s.vrank.refreshCanonicalVRank();await flush();expect(text(s.find('team-rank__level'))).toBe(order==='first-transient'?'V2':'V—');
 late.reject(order==='first-transient'?new ApiError({kind:'auth',status:403,message:'DENIED'}):new ApiError({kind:'http',status:503,message:'HTTP_503'}));await flush();
 expect(text(s.find('team-rank__level'))).toBe('V—');expect(s.vrank.remoteTransientFailure).toBe(false);expect(s.vrank.remoteReady).toBe(false);expect(s.vrank.capabilities).toEqual({peer:false,genesis:false});
});

it.each(['locale','account','binding','environment','baseUrl'] as const)('clears transient history on %s and ignores delayed old-owner success',async boundary=>{
 const s=await screen(),failure=new ApiError({kind:'network',message:'TIMEOUT'});
 remote.teamNetworkApi.snapshot.mockRejectedValue(failure);remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();expect(s.amounts()[0]).not.toBe('—');expect(text(s.find('invite-card__amount'))).toBe('0.02');expect(text(s.find('team-rank__level'))).toBe('V2');
 const network=deferred(),events=deferred(),invite=deferred(),current=deferred();remote.teamNetworkApi.snapshot.mockReturnValueOnce(network.promise).mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.teamInsightsApi.commissions.mockReturnValueOnce(events.promise).mockResolvedValue(commissions(23));remote.referralRewardApi.snapshot.mockReturnValueOnce(invite.promise).mockResolvedValue(reward(.04));remote.vRankApi.current.mockReturnValueOnce(current.promise).mockResolvedValue({...rank,rankCode:'V1'});
 const old=[s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()];
 if(boundary==='locale'){s.locale.code='vi';s.locale.code='en'}
 if(boundary==='account'||boundary==='binding'){s.app.accountKey=boundary==='account'?'user:new':s.app.accountKey;s.app.accountBindingEpoch++;s.network.bindAccount(s.app.accountKey);s.commission.bindAccount(s.app.accountKey);s.rewards.bindAccount(s.app.accountKey);s.vrank.bindAccount(s.app.accountKey)}
 if(boundary==='environment')remote.apiRuntimeConfig.environment='prod';if(boundary==='baseUrl')remote.apiRuntimeConfig.baseUrl='https://other.invalid';
 await Vue.nextTick();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');
 network.resolve({...proof,totalMembers:999,members:[],monthVolumeUsdt:999,lifetimeVolumeUsdt:999});events.resolve(commissions(999));invite.resolve({...reward(999),referralCode:'OLD'});current.resolve({...rank,rankCode:'V8'});await Promise.all(old);await flush();
 expect(text(s.find('invite-card__amount'))).not.toBe('999');expect(s.amounts()[0]).not.toContain('999');expect(text(s.find('team-rank__level'))).not.toBe('V8');
 if(boundary==='locale'){await Promise.all([s.network.ensureCanonicalNetwork(),s.commission.ensureCanonicalEvents(),s.rewards.ensure(),s.vrank.ensureCanonicalVRank()]);await flush();expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(text(s.find('team-rank__level'))).toBe('V1')}
});

it.each([{status:429},{code:429}])('recognized network error carrying %s never creates an HTTP cooldown in any actual chain',async numbers=>{
 const s=await screen(),failure=new ApiError({kind:'network',...numbers,message:'REQUEST_TIMEOUT',retryAfterMs:60_000});remote.teamNetworkApi.snapshot.mockRejectedValue(failure);remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();
 expect([s.network.remoteRateLimited,s.commission.eventsRateLimited,s.rewards.rateLimited,s.vrank.remoteRateLimited]).toEqual([false,false,false,false]);expect(s.amounts()[0]).not.toBe('—');expect(text(s.find('invite-card__amount'))).toBe('0.02');
 const counts=[remote.teamNetworkApi.snapshot.mock.calls.length,remote.teamInsightsApi.commissions.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length,remote.vRankApi.current.mock.calls.length];
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);
 expect([remote.teamNetworkApi.snapshot.mock.calls.length,remote.teamInsightsApi.commissions.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length,remote.vRankApi.current.mock.calls.length]).toEqual(counts.map(n=>n+1));
});
it('explicit HTTP code429 alone respects current shared deadlines in all four stores',async()=>{
 vi.useFakeTimers({toFake:['Date']});const s=await screen(),failure=new ApiError({kind:'http',code:429,message:'LIMIT',retryAfterMs:2_000});remote.teamNetworkApi.snapshot.mockRejectedValue(failure);remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();
 expect([s.network.remoteRateLimited,s.commission.eventsRateLimited,s.rewards.rateLimited,s.vrank.remoteRateLimited]).toEqual([true,true,true,true]);const counts=()=>[remote.teamNetworkApi.snapshot.mock.calls.length,remote.teamInsightsApi.commissions.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length,remote.vRankApi.current.mock.calls.length],before=counts();
 await Promise.all([s.network.ensureCanonicalNetwork(),s.commission.ensureCanonicalEvents(),s.rewards.ensure(),s.vrank.ensureCanonicalVRank(),s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await refreshProductCatalog(true);await flush();expect(counts()).toEqual(before);
 vi.setSystemTime(Date.now()+2_000);remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.referralRewardApi.snapshot.mockResolvedValue(reward(.04));remote.vRankApi.current.mockResolvedValue({...rank,rankCode:'V1'});
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();expect(counts()).toEqual(before.map(n=>n+1));expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(text(s.find('team-rank__level'))).toBe('V1');
});

it.each([{status:404,code:429,keep:false},{status:503,code:429,keep:true},{status:429,code:403,keep:false}])('known HTTP transport status takes precedence over conflicting envelope %s in every actual chain',async numbers=>{
 const s=await screen(),failure=new ApiError({kind:'http',status:numbers.status,code:numbers.code,message:'CONFLICT',retryAfterMs:30_000});
 remote.teamNetworkApi.snapshot.mockRejectedValue(failure);remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();
 expect([s.network.remoteRateLimited,s.commission.eventsRateLimited,s.rewards.rateLimited,s.vrank.remoteRateLimited]).toEqual([false,false,false,false]);expect([s.network.remoteTransientFailure,s.commission.eventsTransientFailure,s.rewards.transientFailure,s.vrank.remoteTransientFailure]).toEqual(Array(4).fill(numbers.keep));
 expect(s.amounts()[0]==='—').toBe(!numbers.keep);expect(text(s.find('invite-card__amount'))).toBe(numbers.keep?'0.02':'—');expect(text(s.find('team-rank__level'))).toBe(numbers.keep?'V2':'V—');
 const counts=[remote.teamNetworkApi.snapshot.mock.calls.length,remote.teamInsightsApi.commissions.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length,remote.vRankApi.current.mock.calls.length];
 remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.referralRewardApi.snapshot.mockResolvedValue(reward(.04));remote.vRankApi.current.mockResolvedValue({...rank,rankCode:'V1'});
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()]);await flush();expect([remote.teamNetworkApi.snapshot.mock.calls.length,remote.teamInsightsApi.commissions.mock.calls.length,remote.referralRewardApi.snapshot.mock.calls.length,remote.vRankApi.current.mock.calls.length]).toEqual(counts.map(n=>n+1));expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(text(s.find('team-rank__level'))).toBe('V1');
});

it.each([
 new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'}),new ApiError({kind:'http',status:503,message:'HTTP_503'}),
])('catalog transient proof preserves actual Team/Invite numerals at every sync transition while all live reads fail %s',async failure=>{
 const s=await screen(),before=s.amounts(),start=s.syncStates.length;
 remote.productCatalogApi.catalog.mockRejectedValue(failure);remote.teamNetworkApi.snapshot.mockRejectedValue(failure);remote.teamInsightsApi.commissions.mockRejectedValue(failure);remote.referralRewardApi.snapshot.mockRejectedValue(failure);remote.vRankApi.current.mockRejectedValue(failure);
 await refreshProductCatalog(true);await flush();
 expect.soft(s.amounts()).toEqual(before);expect.soft(text(s.find('invite-card__amount'))).toBe('0.02');expect.soft(text(s.find('team-rank__level'))).toBe('V2');
 expect.soft(s.syncStates.slice(start).every(state=>state.visible&&state.catalogValid&&state.present)).toBe(true);
 expect(productCatalogState.status).toBe('error');expect(productCatalogState.serverCanonical).toBe(false);expect(s.network.remoteStatus).toBe('error');expect(s.commission.eventsStatus).toBe('error');expect(s.commission.eventsEvidence).toBeNull();expect(s.rewards.snapshot).toBeNull();expect(s.vrank.remoteReady).toBe(false);
 for(const cls of ['nx-team-share-now','nx-team-share-poster','nx-team-copy-code','nx-team-copy-link']){expect(s.find(cls).props['aria-disabled']).toBe(true);await s.find(cls).props.onClick()}
 expect(s.copyText).not.toHaveBeenCalled();expect(s.find('team-ledger__retry')).toBeDefined();expect(s.find('team-ledger__breakdown').props['data-state']).not.toBe('ready');
});

it.each(['auth','business','protocol','configuration'] as const)('strict catalog %s cannot retain history even though four chains only have temporary errors',async kind=>{
 const s=await screen(),temporary=new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'});remote.productCatalogApi.catalog.mockRejectedValue(new ApiError({kind,status:503,message:'STRICT_CATALOG'}));remote.teamNetworkApi.snapshot.mockRejectedValue(temporary);remote.teamInsightsApi.commissions.mockRejectedValue(temporary);remote.referralRewardApi.snapshot.mockRejectedValue(temporary);remote.vRankApi.current.mockRejectedValue(temporary);
 await refreshProductCatalog(true);await flush();expect(productCatalogDisplayProof.value).toBeNull();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');
});

it('external business runtime invalidates cached display and an older pending catalog cannot rebuild it',async()=>{
 const s=await screen(),offline=new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'});remote.productCatalogApi.catalog.mockRejectedValue(offline);remote.teamNetworkApi.snapshot.mockRejectedValue(offline);remote.teamInsightsApi.commissions.mockRejectedValue(offline);remote.referralRewardApi.snapshot.mockRejectedValue(offline);remote.vRankApi.current.mockRejectedValue(offline);
 await refreshProductCatalog(true);await flush();expect(s.amounts()[0]).not.toBe('—');expect(text(s.find('invite-card__amount'))).toBe('0.02');
 const old=deferred();remote.productCatalogApi.catalog.mockReturnValueOnce(old.promise);const pending=refreshProductCatalog(true);
 runtimeRevision.advanceRuntimeRevision('business-write');await flush();expect(text(s.find('team-summary__number'))).toBe('—');expect(s.syncStates.at(-1)?.totalMembers).toBe('—');expect(productCatalogDisplayProof.value).toBeNull();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');
 old.resolve({...proof,products:[],revision:'OLD'});expect(await pending).toBe(false);await flush();expect(productCatalogDisplayProof.value).toBeNull();expect(s.amounts()[0]).toBe('—');
 remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[],revision:'CURRENT'});remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));remote.referralRewardApi.snapshot.mockResolvedValue({...reward(.04),referralCode:'NEW-CURRENT'});remote.vRankApi.current.mockResolvedValue({...rank,rankCode:'V1'});
 await refreshProductCatalog(true);await flush();expect(productCatalogDisplayProof.value?.revision).toBe('CURRENT');expect(s.amounts()[0]).toContain('23');expect(text(s.find('invite-card__amount'))).toBe('0.04');expect(text(s.find('team-rank__level'))).toBe('V1');expect(s.vrank.remoteReady).toBe(true);expect(s.find('nx-team-copy-code').props['aria-disabled']).toBe(false);
});

it('locale ABA clears catalog-backed temporary history and pre-locale replies cannot repopulate it',async()=>{
 const s=await screen(),offline=new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'});remote.productCatalogApi.catalog.mockRejectedValue(offline);remote.teamNetworkApi.snapshot.mockRejectedValue(offline);remote.teamInsightsApi.commissions.mockRejectedValue(offline);remote.referralRewardApi.snapshot.mockRejectedValue(offline);remote.vRankApi.current.mockRejectedValue(offline);
 await refreshProductCatalog(true);await flush();expect(s.amounts()[0]).not.toBe('—');
 const events=deferred(),rewardRead=deferred(),current=deferred();remote.teamInsightsApi.commissions.mockReturnValueOnce(events.promise);remote.referralRewardApi.snapshot.mockReturnValueOnce(rewardRead.promise);remote.vRankApi.current.mockReturnValueOnce(current.promise);
 const old=[s.commission.refreshCanonicalEvents(),s.rewards.refresh(),s.vrank.refreshCanonicalVRank()];s.locale.code='vi';s.locale.code='en';await Vue.nextTick();
 expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');events.resolve(commissions(999));rewardRead.resolve({...reward(999),referralCode:'PRE-LOCALE'});current.resolve({...rank,rankCode:'V8'});await Promise.all(old);await flush();expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');s.find('nx-team-copy-code').props.onClick();expect(s.copyText).not.toHaveBeenCalled();
});


it.each(['write','prepare'] as const)('a synchronous catalog presentation observer %s cannot let its old response revive actual Team history',async action=>{
 const s=await screen(),temporary=new ApiError({kind:'network',message:'TIMEOUT'});remote.teamNetworkApi.snapshot.mockRejectedValue(temporary);remote.teamInsightsApi.commissions.mockRejectedValue(temporary);remote.referralRewardApi.snapshot.mockRejectedValue(temporary);remote.vRankApi.current.mockRejectedValue(temporary);remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[],revision:'OBSERVED'});
 const stop=Vue.watch(productCatalogPresentation,()=>{if(action==='write')runtimeRevision.advanceRuntimeRevision('observer-write');else prepareProductCatalog()},{flush:'sync',once:true});
 expect(await refreshProductCatalog(true)).toBe(false);stop();await flush();expect(productCatalogDisplayProof.value).toBeNull();expect(productCatalogState.serverCanonical).toBe(false);expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');
});
it('foreign runtime during catalog proof stamp cannot impersonate its own event or restore current Team history',async()=>{
 const s=await screen(),temporary=new ApiError({kind:'network',message:'TIMEOUT'});remote.teamNetworkApi.snapshot.mockRejectedValue(temporary);remote.teamInsightsApi.commissions.mockRejectedValue(temporary);remote.referralRewardApi.snapshot.mockRejectedValue(temporary);remote.vRankApi.current.mockRejectedValue(temporary);remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[],revision:'STAMPED'});
 const stop=Vue.watch(()=>productCatalogDisplayProof.value?.runtimeEpoch,epoch=>{if(epoch!==undefined)runtimeRevision.advanceRuntimeRevision('foreign-during-stamp')},{flush:'sync',once:true});
 expect(await refreshProductCatalog(true)).toBe(false);stop();await flush();expect(productCatalogDisplayProof.value).toBeNull();expect(productCatalogState.serverCanonical).toBe(false);expect(s.amounts()[0]).toBe('—');expect(text(s.find('invite-card__amount'))).toBe('—');expect(text(s.find('team-rank__level'))).toBe('V—');
});


it.each([en,zh,vietnamese])('keeps real ledger failure feedback through passive pending and another failure without a normal metadata frame',async copy=>{
 const s=await screen(copy),offline=new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'});
 remote.teamNetworkApi.snapshot.mockRejectedValue(offline);remote.teamInsightsApi.commissions.mockRejectedValue(offline);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents()]);await flush();
 expect(s.find('team-ledger__feedback-item').props.class).toContain('is-active');
 const network=deferred(),events=deferred();remote.teamNetworkApi.snapshot.mockReturnValueOnce(network.promise);remote.teamInsightsApi.commissions.mockReturnValueOnce(events.promise);
 vi.useFakeTimers({toFake:['Date']});s.normalVisit();
 const start=s.ledgerStates.length,syncStart=s.syncStates.length;s.hooks.hide.forEach(fn=>fn());s.hooks.show.forEach(fn=>fn());await Vue.nextTick();
 expect(s.network.remoteStatus).toBe('loading');expect(s.commission.eventsStatus).toBe('loading');
 expect(s.ledgerStates.slice(start).some(state=>state.loading)).toBe(true);expect(s.syncStates.slice(syncStart).some(state=>state.loading&&!state.failed)).toBe(true);
 expect(s.find('team-ledger__feedback-item').props.class).toContain('is-active');expect(s.find('team-ledger__breakdown').props.class).toContain('is-hidden');
 network.reject(offline);await flush();events.reject(offline);await flush();
 expect(s.ledgerStates.slice(start).every(state=>state.failed)).toBe(true);expect(s.syncStates.slice(syncStart).every(state=>state.feedback)).toBe(true);
 expect(s.find('team-ledger__feedback-item').props.class).toContain('is-active');
});

it.each(['network-first','commission-first'])('clears ledger feedback exactly once after both actual manual retry reads succeed: %s',async order=>{
 const s=await screen(),offline=new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'});
 remote.teamNetworkApi.snapshot.mockRejectedValue(offline);remote.teamInsightsApi.commissions.mockRejectedValue(offline);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents()]);await flush();
 const network=deferred(),events=deferred();remote.teamNetworkApi.snapshot.mockReturnValueOnce(network.promise);remote.teamInsightsApi.commissions.mockReturnValueOnce(events.promise);
 const start=s.ledgerStates.length,syncStart=s.syncStates.length;s.find('team-ledger__retry').props.onClick();await Vue.nextTick();
 expect(s.find('team-ledger__feedback-item').props.class).toContain('is-active');
 const finishNetwork=()=>network.resolve({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});
 if(order==='network-first')finishNetwork();else events.resolve(commissions(23));await flush();
 expect(s.find('team-ledger__feedback-item').props.class).toContain('is-active');expect(s.ledgerStates.slice(start).every(state=>state.failed)).toBe(true);
 if(order==='network-first')events.resolve(commissions(23));else finishNetwork();await flush();
 expect(s.network.remoteStatus).toBe('ready');expect(s.commission.eventsStatus).toBe('ready');
 expect(s.find('team-ledger__feedback-item').props.class).not.toContain('is-active');expect(s.find('team-ledger__breakdown').props.class).not.toContain('is-hidden');
 const sequence=s.ledgerStates.slice(start).map(state=>state.failed).filter((value,index,array)=>index===0||value!==array[index-1]);expect(sequence).toEqual([true,false]);
 const synchronous=s.syncStates.slice(syncStart).map(state=>state.feedback).filter((value,index,array)=>index===0||value!==array[index-1]);expect(synchronous).toEqual([true,false]);
});

it.each(['account','binding','environment','baseUrl','locale','write'])('revokes ledger feedback at a strict %s boundary and ignores old pending errors',async boundary=>{
 const s=await screen(),offline=new ApiError({kind:'network',message:'NETWORK_UNAVAILABLE'});
 remote.teamNetworkApi.snapshot.mockRejectedValue(offline);remote.teamInsightsApi.commissions.mockRejectedValue(offline);
 await Promise.all([s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents()]);await flush();
 const network=deferred(),events=deferred(),currentNetwork=deferred(),currentEvents=deferred();
 remote.teamNetworkApi.snapshot.mockReturnValueOnce(network.promise).mockReturnValue(currentNetwork.promise);remote.teamInsightsApi.commissions.mockReturnValueOnce(events.promise).mockReturnValue(currentEvents.promise);
 const pending=[s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents()];await Vue.nextTick();
 expect(s.find('team-ledger__feedback-item').props.class).toContain('is-active');
 if(boundary==='account'){s.app.accountKey='user:replacement';s.network.bindAccount(s.app.accountKey);s.commission.bindAccount(s.app.accountKey)}
 if(boundary==='binding'){s.app.accountBindingEpoch++;s.network.bindAccount(s.app.accountKey);s.commission.bindAccount(s.app.accountKey)}
 if(boundary==='environment')remote.apiRuntimeConfig.environment='prod';if(boundary==='baseUrl')remote.apiRuntimeConfig.baseUrl='https://other.invalid';if(boundary==='locale')s.locale.code='vi';
 if(boundary==='write')runtimeRevision.advanceRuntimeRevision('business-write');
 await Vue.nextTick();expect(s.find('team-ledger__feedback-item').props.class).not.toContain('is-active');expect(s.amounts()[0]).toBe('—');
 network.reject(offline);events.reject(offline);await Promise.all(pending);await flush();
 expect(s.find('team-ledger__feedback-item').props.class).not.toContain('is-active');
 if(boundary!=='environment'&&boundary!=='baseUrl'){
  const current=[s.network.refreshCanonicalNetwork(),s.commission.refreshCanonicalEvents()];currentNetwork.reject(offline);currentEvents.reject(offline);await Promise.all(current);await flush();
  expect(s.find('team-ledger__feedback-item').props.class).toContain('is-active');
  remote.teamNetworkApi.snapshot.mockResolvedValue({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});remote.teamInsightsApi.commissions.mockResolvedValue(commissions(23));
  s.find('team-ledger__retry').props.onClick();await flush();expect(s.network.remoteStatus).toBe('ready');expect(s.commission.eventsStatus).toBe('ready');expect(s.find('team-ledger__feedback-item').props.class).not.toContain('is-active');
 }
});

it.each([en,zh,vietnamese])('keeps first cold ledger pending silent and unknown without historical error feedback',async copy=>{
 const network=deferred(),events=deferred();remote.teamNetworkApi.snapshot.mockReturnValue(network.promise);remote.teamInsightsApi.commissions.mockReturnValue(events.promise);
 const s=await screen(copy);expect(s.amounts()[0]).toBe('—');expect(s.network.remoteStatus).toBe('loading');expect(s.commission.eventsStatus).toBe('loading');
 expect(s.find('team-ledger__feedback-item').props.class).not.toContain('is-active');expect(s.find('team-ledger__breakdown').props.class).toContain('is-hidden');expect(s.ledgerStates.every(state=>!state.failed)).toBe(true);
 network.resolve({...proof,totalMembers:0,members:[],monthVolumeUsdt:0,lifetimeVolumeUsdt:0});events.resolve(commissions(23));await flush();expect(s.amounts()[0]).toContain('23');expect(s.find('team-ledger__feedback-item').props.class).not.toContain('is-active');
});

// Team reward summaries: run the complete Team SFC and actual commission/catalog
// stores. The transport promises below do not bypass their canonical reset.
const binaryFacts=(amount=19.75)=>({...proof,runId:null,estimatedAmountUsdt:amount,trackA:500,trackB:300});
it.each([['en',en],['zh',zh],['vi',vietnamese]] as const)('keeps binary estimate and A/B visual through a legitimate catalog publication pending in %s',async(_language,copy)=>{
 remote.commissionConfigApi.binary.mockResolvedValue(binaryFacts());
 const s=await screen(copy),binaryText=text(s.find('nx-team-binary-link')),poolText=text(s.find('nx-team-leadership-pool-link'));
 expect(binaryText).toContain(formatUsd(19.75));expect(binaryText).not.toContain('A ·');
 const split=()=>all(s.find('nx-team-binary-link')).find(node=>String(node.props.class).includes('team-bento__split'))!;
 expect(split().children.map(node=>(node as Host).props.style.width)).toEqual(['61.25%','36.75%']);
 const binary=deferred(),pool=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(binary.promise);remote.teamInsightsApi.leadershipPool.mockReturnValueOnce(pool.promise);
 remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[],revision:'republished',publishedAt:'2026-10-29T00:00:00Z'});
 await refreshProductCatalog(true);await Vue.nextTick();
 expect(productCatalogDisplayProof.value).not.toBeNull();expect(s.commission.binarySnapshot).toBeNull();expect(s.commission.binaryStatus).toBe('loading');
 expect(text(s.find('nx-team-binary-link'))).toBe(binaryText);expect(text(s.find('nx-team-leadership-pool-link'))).toBe(poolText);
 s.find('nx-team-binary-link').props.onClick();expect(s.navTo).toHaveBeenLastCalledWith('/pages/team/binary');
 s.find('nx-team-leadership-pool-link').props.onClick();expect(s.navTo).toHaveBeenLastCalledWith('/pages/team/leadership-pool');
 expect(s.commission.binarySnapshot).toBeNull(); // Navigation/display never restores raw authority.
 binary.resolve({...binaryFacts(0),trackA:0,trackB:0});pool.resolve({...proof,myVotes:0,currentWeekPoolUSDT:0,unlockRank:3,injectRate:.05});await flush();
 expect(s.commission.binaryStatus).toBe('ready');expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(0));expect(split().children.map(node=>(node as Host).props.style.width)).toEqual(['0%','0%']);expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(19.75));
});
it('already keeps a normal binary refresh without clearing the actual store snapshot',async()=>{
 remote.commissionConfigApi.binary.mockResolvedValue(binaryFacts());const s=await screen(),before=text(s.find('nx-team-binary-link')),old=s.commission.binarySnapshot;
 const read=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(read.promise);const pending=s.commission.refreshCanonicalBinary();await Vue.nextTick();
 expect(s.commission.binarySnapshot).toBe(old);expect(s.commission.binaryStatus).toBe('loading');expect(text(s.find('nx-team-binary-link'))).toBe(before);
 read.resolve(binaryFacts(2.5));await pending;await flush();expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(2.5));
});
it.each([new ApiError({kind:'network',message:'offline'}),new ApiError({kind:'http',status:403,message:'denied'}),new ApiError({kind:'protocol',message:'invalid'})])('clears the binary presentation on actual %s and only a confirmed retry restores it',async cause=>{
 remote.commissionConfigApi.binary.mockResolvedValue(binaryFacts());const s=await screen(),read=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(read.promise);
 await refreshProductCatalog(true);await Vue.nextTick();expect(s.commission.binarySnapshot).toBeNull();read.reject(cause);await flush();
 expect(s.commission.binaryStatus).toBe('error');expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(19.75));expect(text(s.find('nx-team-binary-link'))).toContain('—');
 const retry=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(retry.promise);const pending=s.commission.refreshCanonicalBinary();await Vue.nextTick();
 expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(19.75));retry.resolve(binaryFacts(4.25));await pending;await flush();expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(4.25));
});
it('keeps the first binary read unknown instead of substituting zero',async()=>{
 const first=deferred();remote.commissionConfigApi.binary.mockReturnValue(first.promise);const s=await screen();
 expect(s.commission.binarySnapshot).toBeNull();expect(s.commission.binaryStatus).toBe('loading');expect(text(s.find('nx-team-binary-link'))).toContain('—');expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(0));
 first.resolve(binaryFacts(0));await flush();expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(0));
});
it.each(['account','binding','locale','environment','baseUrl','write','hidden-write','permission','prepare'])('revokes binary presentation at a strict %s boundary and ignores old facts',async boundary=>{
 remote.commissionConfigApi.binary.mockResolvedValue(binaryFacts());const s=await screen(),old=deferred(),current=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
 const pending=s.commission.refreshCanonicalBinary();await Vue.nextTick();
 if(boundary==='account'){s.app.accountKey='user:B';s.app.accountKey='user:fixture';s.app.accountBindingEpoch++;s.commission.bindAccount(s.app.accountKey)}
 if(boundary==='binding'){s.app.accountBindingEpoch++;s.commission.bindAccount(s.app.accountKey)}
 if(boundary==='locale'){s.locale.code='vi';s.locale.code='en'}
 if(boundary==='environment'){remote.apiRuntimeConfig.environment='prod';remote.apiRuntimeConfig.environment='dev'}
 if(boundary==='baseUrl'){remote.apiRuntimeConfig.baseUrl='https://other.invalid';remote.apiRuntimeConfig.baseUrl='https://test.invalid'}
 if(boundary==='hidden-write'){s.hooks.hide.forEach(fn=>fn());runtimeRevision.advanceRuntimeRevision('business-write')}
 if(boundary==='write')runtimeRevision.advanceRuntimeRevision('business-write');if(boundary==='permission')runtimeRevision.advanceRuntimeRevision('permission-change');if(boundary==='prepare')prepareProductCatalog();
 await Vue.nextTick();expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(19.75));expect(text(s.find('nx-team-binary-link'))).toContain('—');
 old.resolve(binaryFacts(999));await pending;await flush();expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(999));
 expect(text(s.find('nx-team-binary-link'))).toContain('—');
});
it.each(['price','stock','qualification','permission','source'])('clears binary display when catalog business %s changes even if its version string is unchanged',async field=>{
 const product={id:'device',name:'Device',price:1199,stock:8,purchaseBlocked:false,purchaseGate:{rankMin:2}};
 remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[product],revision:'SAME'});remote.commissionConfigApi.binary.mockResolvedValue(binaryFacts());
 const s=await screen();expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(19.75));const old=deferred(),fresh=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
 const previous=s.commission.refreshCanonicalBinary();
 const changed={...product,price:field==='price'?1499:product.price,stock:field==='stock'?0:product.stock,purchaseBlocked:field==='permission',purchaseGate:{rankMin:field==='qualification'?3:2}};
 remote.productCatalogApi.catalog.mockResolvedValue({...proof,source:field==='source'?'changed-authority':proof.source,products:[changed],revision:'SAME'});await refreshProductCatalog(true);await Vue.nextTick();
 expect(isProductCatalogDisplayCurrent()).toBe(true);expect(productCatalogDisplayProof.value?.revision).toBe('SAME');expect(s.commission.binaryStatus).toBe('loading');expect(s.commission.binarySnapshot).toBeNull();
 expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(19.75));expect(text(s.find('nx-team-binary-link'))).toContain('—');
 old.resolve(binaryFacts(999));await previous;await flush();expect(s.commission.binarySnapshot).toBeNull();expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(999));
 fresh.resolve(binaryFacts(3.25));await flush();expect(s.commission.binaryStatus).toBe('ready');expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(3.25));
});
it('masks and reveals the retained binary display through the real privacy store while raw authority stays absent',async()=>{
 remote.commissionConfigApi.binary.mockResolvedValue(binaryFacts());const s=await screen(),read=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(read.promise);await refreshProductCatalog(true);await Vue.nextTick();
 expect(s.commission.binarySnapshot).toBeNull();const visibility=useDataVisibility();visibility.toggle();await Vue.nextTick();expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(19.75));
 expect(all(s.find('nx-team-binary-link')).some(node=>String(node.props.class).includes('team-bento__split'))).toBe(false);
 expect(all(s.find('nx-team-leadership-pool-link')).find(node=>String(node.props.class).includes('team-bento__ring'))!.props.style['--nx-viz-ring']).toBe(0);
 visibility.toggle();await Vue.nextTick();expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(19.75));expect(s.commission.binarySnapshot).toBeNull();
 read.resolve(binaryFacts(0));await flush();expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(0));
});
it.each(['hold','error'])('preserves the existing leadership pending summary but removes it on actual %s',async state=>{
 const s=await screen(),before=text(s.find('nx-team-leadership-pool-link')),read=deferred();remote.teamInsightsApi.leadershipPool.mockReturnValueOnce(read.promise);
 await refreshProductCatalog(true);await Vue.nextTick();expect(text(s.find('nx-team-leadership-pool-link'))).toBe(before);
 read.reject(state==='hold'?new ApiError({kind:'business',message:'F4_LEADERSHIP_POOL_HOLD'}):new Error('failed'));await flush();
 expect(text(s.find('nx-team-leadership-pool-link'))).not.toContain(formatUsd(17.25));expect(text(s.find('nx-team-leadership-pool-link'))).toContain('—');
});


it.each([['en',en],['zh',zh],['vi',vietnamese]] as const)('keeps binary presentation when only the catalog imageUrl rotates in %s',async(_language,copy)=>{
 const product={id:'device',name:'Device',price:1199,stock:8,purchaseBlocked:false,purchaseGate:{rankMin:2},imageUrl:'https://images.example/api/store/media/images/device/asset?expires=100&signature=old'};
 remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[product],revision:'SAME'});remote.commissionConfigApi.binary.mockResolvedValue(binaryFacts());
 const s=await screen(copy),before=text(s.find('nx-team-binary-link')),poolBefore=text(s.find('nx-team-leadership-pool-link'));
 expect(before).toContain(formatUsd(19.75));const read=deferred(),pool=deferred();remote.commissionConfigApi.binary.mockReturnValueOnce(read.promise);remote.teamInsightsApi.leadershipPool.mockReturnValueOnce(pool.promise);
 remote.productCatalogApi.catalog.mockResolvedValue({...proof,products:[{...product,imageUrl:'https://images.example/api/store/media/images/device/asset?expires=200&signature=new'}],revision:'SAME'});
 await refreshProductCatalog(true);await Vue.nextTick();
 expect(isProductCatalogDisplayCurrent()).toBe(true);expect(productCatalogDisplayProof.value?.revision).toBe('SAME');expect(s.commission.binaryStatus).toBe('loading');expect(s.commission.binarySnapshot).toBeNull();
 expect(text(s.find('nx-team-binary-link'))).toBe(before);expect(text(s.find('nx-team-leadership-pool-link'))).toBe(poolBefore);
 s.find('nx-team-binary-link').props.onClick();expect(s.navTo).toHaveBeenLastCalledWith('/pages/team/binary');expect(s.commission.binarySnapshot).toBeNull();
 read.resolve(binaryFacts(0));pool.resolve({...proof,myVotes:0,currentWeekPoolUSDT:0,unlockRank:3,injectRate:.05});await flush();
 expect(s.commission.binaryStatus).toBe('ready');expect(text(s.find('nx-team-binary-link'))).toContain(formatUsd(0));expect(text(s.find('nx-team-binary-link'))).not.toContain(formatUsd(19.75));
});
