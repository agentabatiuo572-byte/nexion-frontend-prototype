import { teamPrivacyFixture } from './team-privacy.test-support';
import * as Vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mountEntry, all, flush, slot, text } from '@/lib/entry-review.test-support';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { COMMISSIONS_HOW_SLOTS } from '@/lib/commissions-how-content';
const sources = import.meta.glob('./*.vue', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const quotaSource = import.meta.glob('../../components/team/quota-tier-card.vue', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const stops: Array<() => void> = [];
function deferred() { let resolve!: (x: any) => void, reject!: (x: any) => void; const promise = new Promise<any>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const showBeforeMount = Vue.vShow.beforeMount as Function;
beforeEach(() => { vi.spyOn(Vue.vShow as { beforeMount: (...args: any[]) => unknown }, 'beforeMount').mockImplementation(((el: any, ...args: any[]) => { el.style = {}; return showBeforeMount(el, ...args); }) as any); const storage = new Map(); vi.stubGlobal('uni', { getStorageSync: (k: string) => storage.get(k), setStorageSync: (k: string,v: any) => storage.set(k,v), removeStorageSync: (k: string) => storage.delete(k) }); });
afterEach(() => { stops.splice(0).forEach(f=>f()); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function screen(name: string, language: 'en'|'zh'|'vi' = 'en', actualPayoutClock = false) {
  const { visibility, dependency: visibilityDependency } = teamPrivacyFixture();
  const app = Vue.reactive({ accountKey: 'user:1', accountBindingEpoch: 1 });
  const auth = Vue.reactive({ isAuthenticated: true, accountId: 'user:1' });
  const locale = Vue.reactive({ code: language });
  const env = Vue.reactive({ environment: 'prod', baseUrl: 'https://fixture.invalid' });
  const callbacks: Record<string, Array<()=>void>> = { show: [], hide: [], unload: [], runtime: [] };
  let epoch=1;
  const reads: Record<string, ReturnType<typeof deferred>[]> = {};
  const read = (key: string) => vi.fn(() => { const p=deferred(); (reads[key]??=[]).push(p); return p.promise; });
  const api = { leaderboard: read('leaderboard'), leadershipPool: read('pool'), policy: read('policy'), latest: read('latest'), history: read('history'), submit: vi.fn(), create: vi.fn(), snapshot: read('unilevel'), unilevel: read('unilevel'), published: read('published'), ladder: read('ladder'), read: read('guide') };
  const kinds = ['direct_purchase','direct_device_earning','unilevel','binary','peer','cultivation','leadership','genesis','promotion','other'];
  const byKind = Object.fromEntries(kinds.map(k=>[k,{usdt:0,nex:0,count:0}]));
  const commission = Vue.reactive<any>({ eventsStatus:'idle', events:[], eventsEvidence:null, eventsTotalRows:0, eventsLoadMoreStatus:'idle', binaryStatus:'idle', binarySnapshot:null,
    refreshCanonicalEvents: vi.fn(), refreshCanonicalBinary: vi.fn(), loadMoreCanonicalEvents:vi.fn(), unlockMatured:vi.fn(), byKind:()=>byKind,
    unlockedUSDT:()=>0, unlockedNEX:()=>0, coolingUSDT:()=>0, monthUSDT:()=>0, monthNEX:()=>0, totalUSDTLifetime:()=>0, totalNEXLifetime:()=>0 });
  const network = Vue.reactive<any>({ remoteStatus:'idle', hasRemoteSnapshot:false, members:[], totalMonthComputePoints:null,
    ensureCanonicalNetwork:vi.fn(), refreshCanonicalNetwork:vi.fn(), byBinary:()=>({left:[],right:[]}) });
  const rank = Vue.reactive<any>({ myRank:5, remoteReady:true, remoteError:false, ladder:[], refreshCanonicalVRank:vi.fn().mockResolvedValue(undefined) });
  const deps: Record<string, any> = {
    '@dcloudio/uni-app': { onShow:(f:()=>void)=>callbacks.show.push(f), onHide:(f:()=>void)=>callbacks.hide.push(f), onUnload:(f:()=>void)=>callbacks.unload.push(f) },
    '@/store/data-visibility': visibilityDependency,
    '@/store/app':{useApp:()=>app}, '@/store/auth':{useAuth:()=>auth}, '@/store/locale':{useLocaleStore:()=>locale},
    '@/store/commission':{useCommission:()=>commission,UNILEVEL_USDT:{}}, '@/store/network':{useNetwork:()=>network}, '@/store/v-rank':{useVRank:()=>rank},
    '@/store/leadership-pool':{useLeadershipPool:()=>({}),V_VOTES:{},POOL_TOP_N:100},
    '@/store/ui':{toast:{success:vi.fn(),error:vi.fn()}},
    '@/i18n/format':{fmt,dateLocale:()=>locale.code==='vi'?'vi-VN':locale.code==='zh'?'zh-CN':'en-US'},
    '@/i18n/use-t':{useT:()=>Vue.computed(()=>({en,zh,vi:vietnamese})[locale.code])},
    '@/api/runtime':{apiRuntimeConfig:env,expectedApiEnvironment:'prod',remoteApiEnabled:true,teamInsightsApi:api,ambassadorApplicationApi:api,vRankApi:api,howContentApi:api,apiClient:{},sessionVault:{read:()=>({user:{userId:1}})}},
    '@/api/direct-referral-api':{createDirectReferralApi:()=>api}, '@/api/team-insights-api':{createTeamInsightsApi:()=>api}, '@/api/commission-guide-api':{createCommissionGuideApi:()=>api}, '@/api/rank-how-policy-api':{createRankHowPolicyApi:()=>api},
    '@/lib/account-scope':{captureAccountScope:()=>({key:app.accountKey,epoch:app.accountBindingEpoch}),isCurrentAccountScope:(s:any)=>s.key===app.accountKey&&s.epoch===app.accountBindingEpoch},
    '@/api/order-api':{captureRuntimeRevision:()=>epoch,isCurrentRuntimeRevision:(e:number)=>e===epoch,subscribeRuntimeRevision:(f:()=>void)=>{callbacks.runtime.push(f);return()=>{};}},
    '@/composables/use-product-phase':{useProductPhase:()=>Vue.ref({binaryDailyCapUSD:100})},
    '@/lib/payout-clock':{createPayoutClock:()=>({start(){},stop(){}})},
    '@/lib/route':{navTo:vi.fn(),navBack:vi.fn()},
    '@/composables/use-scroll-grow-progress':{useScrollGrowProgress:()=>({elRef:Vue.ref(null),inView:Vue.ref(true)}),PROGRESS_GROW_TRANSITION:''},
  };
  if (actualPayoutClock) deps['@/lib/payout-clock'] = await vi.importActual('@/lib/payout-clock');
  let source = name==='quota-tier-card'?Object.values(quotaSource)[0]:sources['./'+name+'.vue'];
  if(name==='agent') {
    source=source.replace('<script setup lang="ts">','<script setup lang="ts">\nimport UniInput from "./secondary-test-input.vue";').replace(/<input\b/g,'<UniInput');
    deps['./secondary-test-input.vue']={default:Vue.defineComponent({props:['modelValue','disabled'],emits:['update:modelValue'],setup:(props,{emit})=>()=>Vue.h('input',{value:props.modelValue,disabled:props.disabled,onInput:(v:string)=>emit('update:modelValue',v)})})};
  }
  const script=parse(source).descriptor.scriptSetup!.content;
  const bindings: string[]=[];
  // Execute the production setup and expose its own declarations only for assertions.
  for(const m of script.matchAll(/^(?:const|let) (\w+)\s*(?::[^=\n]+)?=/gm))bindings.push(m[1]);
  for(const m of script.matchAll(/^(?:async )?function (\w+)\(/gm))bindings.push(m[1]);
  const probe:any={};
  deps['@/testing/team-secondary-probe']={capture:(v:any)=>{ const live=Vue.proxyRefs(v); for(const key of Object.keys(v))Object.defineProperty(probe,key,{get:()=>live[key],set:value=>{live[key]=value;},configurable:true}); }};
  source=source.replace('<script setup lang="ts">','<script setup lang="ts">\nimport { capture as captureProbe } from "@/testing/team-secondary-probe";').replace('</script>','\ncaptureProbe({'+bindings.join(',')+'});\n</script>');
  for(const m of script.matchAll(/from\s+['"]([^'"]+)['"]/g)){
    const id=m[1];if(id==='vue'||id in deps)continue;
    deps[id]=id.endsWith('.vue')?slot:await vi.importActual(id);
  }
  const page=mountEntry(source,deps,name==='quota-tier-card'?{tier:{productId:'p1',name:'P1',price:20,monthlyStock:80,soldThisMonth:0,conditions:[],perks:[],unlockKind:'all',tint:'#000'},pending:true}:{});
  stops.push(page.unmount);
  return {...page,visibility,view:probe,app,auth,locale,env,api,reads,commission,network,rank,show:async()=>{callbacks.show.forEach(f=>f());await flush();},hide:async()=>{callbacks.hide.forEach(f=>f());await flush();},revision:async()=>{epoch++;callbacks.runtime.forEach(f=>f());await flush();}};
}
function pool() { return {currentWeekPoolUSDT:5000,myRank:5,unlockRank:3,myVotes:5,totalVotes:50,mySharePct:.1,projectedPayoutUSDT:500,distribution:[],topN:10,nextPayoutAt:'2026-11-01T00:00:00Z',history:[]}; }
function board(period='week',paused=false) { return {rankingMetric:'COMPUTE_POINTS',gapToNextComputePoints:null,period,paused,dataAvailable:!paused,snapshotState:'LIVE',rows:[],myRank:null,gapToNext:0,totalRows:0,page:1,pageSize:20,snapshotAt:'A',snapshotVersion:'1'}; }
function direct() { return {period:'month',events:[],page:1,pageSize:20,totalRows:0,snapshotAt:'A',split:{direct:{amountUSDT:7,amountNEX:8,count:0},extended:{amountUSDT:0,amountNEX:0,count:0}}}; }
const ledger = () => ({events:[],totalRows:0,aggregate:{monthUSDT:123,monthNEX:456,totalUSDT:789,totalNEX:12,unlockedUSDT:20,unlockedNEX:30,coolingUSDT:40,nextUnlockAt:null,byKind:Object.fromEntries(['direct_purchase','direct_device_earning','unilevel','binary','peer','cultivation','leadership','genesis','promotion','other'].map(k=>[k,{usdt:0,nex:0,count:0}]))}});

test.each(['en','zh','vi'] as const)('Tree %s uses the real retained network marker only in loading, not error',async lang=>{
 const p=await screen('tree',lang);p.network.members=[{id:'one',name:'Known',layer:1,monthVolumeUSD:0,monthComputePoints:8}];p.network.hasRemoteSnapshot=true;p.network.remoteStatus='ready';await flush();
 expect(p.view.networkReadable).toBe(true);p.network.remoteStatus='loading';await flush();expect(p.view.networkReadable).toBe(true);expect(text(p.root)).not.toContain(({en,zh,vi:vietnamese})[lang].network.projectionLoadingTitle);
 p.network.remoteStatus='error';await flush();expect(p.view.networkReadable).toBe(false);expect(text(p.root)).toContain(({en,zh,vi:vietnamese})[lang].network.projectionErrorTitle);
 p.network.hasRemoteSnapshot=false;p.network.members=[];p.network.remoteStatus='loading';await flush();expect(p.view.networkReadable).toBe(false);
});
for(const name of ['commissions','binary'])test(name+' keeps only an accepted display across source reset; scope/error cannot re-mark old ready',async()=>{
 const p=await screen(name);const status=name==='commissions'?'eventsStatus':'binaryStatus',source=name==='commissions'?'eventsEvidence':'binarySnapshot',value=name==='commissions'?ledger():{estimatedAmountUsdt:12,trackA:1,trackB:2,settlePeriod:'monthly',threshold:1,matchRate:.1,dailyCap:10,recentMatches:[]};
 p.commission[source]=value;p.commission[status]='ready';await flush();expect(p.view[name==='commissions'?'ledger':'snapshot']).not.toBeNull();
 p.commission[status]='idle';p.commission[source]=null;await flush();expect(p.view[name==='commissions'?'ledger':'snapshot']).not.toBeNull();
 p.commission[status]='loading';await flush();expect(p.view[name==='commissions'?'ledger':'snapshot']).not.toBeNull();
 p.app.accountBindingEpoch++;await flush();expect(p.view[name==='commissions'?'ledger':'snapshot']).toBeNull();
 p.commission[source]=structuredClone(value);p.commission[status]='ready';await flush();expect(p.view[name==='commissions'?'ledger':'snapshot']).not.toBeNull();
 p.auth.isAuthenticated=false;await flush();expect(p.view[name==='commissions'?'ledger':'snapshot']).toBeNull();
 p.commission[status]='loading';p.commission[status]='ready';await flush();expect(p.view[name==='commissions'?'ledger':'snapshot']).toBeNull();
});
for(const name of ['leaderboard','leadership-pool','leadership-pool-how'])test(name+' warm read retains body, error/hold rejects and epoch/locale A-B-A fences old success',async()=>{
 const p=await screen(name);const key=name==='leaderboard'?'leaderboard':'pool',binding=name==='leaderboard'?'remoteSnapshot':'remotePool';
 await p.show();p.reads[key][0].resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).not.toBeNull();
 await p.show();expect(p.view.remoteState).toBe('loading');expect(p.view[binding]).not.toBeNull();
 p.app.accountBindingEpoch++;await flush();expect(p.view[binding]).toBeNull();
 p.reads[key][1].resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).toBeNull();
 const current=p.reads[key].at(-1)!;current.resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).not.toBeNull();
 await p.show();p.reads[key].at(-1)!.reject(new Error('strict rejected'));await flush();expect(p.view[binding]).toBeNull();expect(p.view.remoteState).toBe('error');
 p.locale.code='vi';p.locale.code='en';await flush();const latest=p.reads[key].at(-1)!;p.reads[key].at(-2)!.resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).toBeNull();latest.resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).not.toBeNull();
});
test('Leaderboard period clear is synchronous and pending loadMore cannot issue page read',async()=>{
 const p=await screen('leaderboard');await p.show();p.reads.leaderboard[0].resolve({...board(),totalRows:1});await flush();await p.show();const n=p.api.leaderboard.mock.calls.length;p.view.loadMore();expect(p.api.leaderboard).toHaveBeenCalledTimes(n);
 p.view.selectPeriod('today');expect(p.view.remoteSnapshot).toBeNull();
});
test('Unilevel same period/filter warm snapshot persists; changed query and schema failure clear, old result rejected',async()=>{
 const p=await screen('unilevel');await p.show();p.reads.unilevel[0].resolve(direct());p.reads.policy[0].resolve({configured:false});await flush();expect(p.view.remoteSnapshot).not.toBeNull();
 await p.show();expect(p.view.remoteSnapshot).not.toBeNull();expect(p.view.remoteState).toBe('loading');p.view.loadMoreRemote();expect(p.api.unilevel).toHaveBeenCalledTimes(2);
 p.view.filter='extended';await flush();expect(p.view.remoteSnapshot).toBeNull();p.reads.unilevel[1].resolve(direct());await flush();expect(p.view.remoteSnapshot).toBeNull();
 p.reads.unilevel.at(-1)!.reject(new Error('TEAM_SCHEMA_UPDATE_REQUIRED'));await flush();expect(p.view.updateRequired).toBe(true);expect(p.view.remoteState).toBe('error');
});
test('Agent cold fixed shell is present; warm policy retained but every input and submit stays fresh-gated',async()=>{
 const p=await screen('agent');expect(p.nodes('agent-hero')).toHaveLength(1);expect(p.nodes('agent-submit')).toHaveLength(1);expect(p.nodes('agent-bucket')).toHaveLength(0);
 await p.show();p.reads.policy[0].resolve({defaultBudgetUsdt:3000,buckets:[{id:'venue',title:'Venue',rule:'Rule',minBudgetUsdt:1,maxBudgetUsdt:9}]});p.reads.latest[0].resolve({status:'NONE'});p.reads.history[0].resolve([]);await flush();expect(p.nodes('agent-bucket')).toHaveLength(1);
 await p.hide();await p.show();expect(p.nodes('agent-bucket')).toHaveLength(1);expect(all(p.root).filter(n=>n.tag==='input').every(n=>n.props.disabled)).toBe(true);p.view.submit();expect(p.api.submit).not.toHaveBeenCalled();
 p.app.accountBindingEpoch++;await flush();expect(p.nodes('agent-bucket')).toHaveLength(0);p.reads.policy[1].resolve({defaultBudgetUsdt:2,buckets:[{id:'venue'}]});await flush();expect(p.nodes('agent-bucket')).toHaveLength(0);
});
test.each(['zh','en','vi'] as const)('Quota %s pending static purchase label/icon is unchanged and remains disabled',async lang=>{
 const p=await screen('quota-tier-card',lang);const buttons=all(p.root).filter(n=>n.tag==='shell'&&n.props.label);expect(buttons[0].props.label).toContain('P1');expect(buttons[0].props.disabled).toBe(true);expect(buttons[0].props.busy).toBeUndefined();
});
for(const name of ['rank-how','commissions-how'])test(name+' retains accepted published body during warm reads but old resource cannot refill a replaced owner',async()=>{
 const p=await screen(name);
 const rankPolicy={hero:'Published rank hero',sections:['overview','overview-detail','ladder','promotion','stepwise','protection','rewards','requirement-self','requirement-direct','requirement-team','requirement-legs','unlock-network','unlock-peer','unlock-leadership','unlock-cultivation','faq-members','faq-rank','faq-rewards'].map(id=>({id,title:'Published '+id,body:'Published body '+id})),rules:{permanentProtection:true,leadershipConfigured:false,qualifiedReferralSelfBuyUSD:null}};
 const document={contentKey:'team-commissions-how',locale:'en',blocks:COMMISSIONS_HOW_SLOTS.map(id=>({id,title:'Published '+id,body:id==='network'?'{directPurchaseRules} {directDeviceRules}':'Published body '+id}))};
 const settle=async(index:number)=>{p.reads.published[index].resolve(name==='rank-how'?rankPolicy:document);p.reads.ladder[index].resolve({ranks:[],capabilities:{peer:false,genesis:false}});if(name==='commissions-how'){p.reads.policy[index].resolve({configured:false,purchase:{},deviceEarning:{},nexUsdtPrice:null});p.reads.guide[index].resolve({binary:null,leadership:null,coolingDays:null,capabilities:{peer:false,genesis:false}});}await flush();};
 await p.show();await settle(0);
 if(name==='rank-how'){all(p.root).find(n=>n.props['aria-controls']==='rule-overview')!.props.onClick();await flush();}
 expect(text(p.root)).toContain('Published body overview');
 await p.show();expect(p.view.state.loading).toBe(true);expect(text(p.root)).toContain('Published body overview');expect(text(p.root)).not.toContain(p.view.content.copy.loading);
 p.app.accountBindingEpoch++;expect(p.view.state[name==='rank-how'?'policy':'snapshot']).toBeNull();await flush();await settle(1);expect(p.view.state[name==='rank-how'?'policy':'snapshot']).toBeNull();
 await settle(2);expect(text(p.root)).toContain('Published body overview');
 await p.hide();await p.show();p.reads.published.at(-1)!.reject(new Error('strict protocol'));await flush();expect(text(p.root)).not.toContain('Published body overview');expect(p.view.state.error).toBe(true);
});
for(const name of ['leaderboard','leadership-pool','leadership-pool-how'])test(name+' auth/hidden/environment changes reject late completion without old body',async()=>{
 const p=await screen(name),key=name==='leaderboard'?'leaderboard':'pool',binding=name==='leaderboard'?'remoteSnapshot':'remotePool';await p.show();const first=p.reads[key][0];await p.hide();first.resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).toBeNull();await p.show();p.reads[key].at(-1)!.resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).not.toBeNull();p.auth.isAuthenticated=false;expect(p.view[binding]).toBeNull();p.auth.isAuthenticated=true;await flush();const old=p.reads[key].at(-1)!;p.env.baseUrl='https://changed.invalid';expect(p.view[binding]).toBeNull();old.resolve(name==='leaderboard'?board():pool());await flush();expect(p.view[binding]).toBeNull();
});
test.each(['zh','en','vi'] as const)('Agent %s keeps fixed title and application label normal across cold/warm while form guards remain false',async lang=>{
 const p=await screen('agent',lang),copy=({en,zh,vi:vietnamese})[lang];const hero=p.nodes('agent-hero')[0],cta=p.nodes('agent-submit')[0];expect(text(hero)).toContain(copy.agent.heroHeadline);expect(text(cta)).toContain(copy.agent.submitForReview);expect(cta.props.style.opacity).toBe(1);expect(cta.props['aria-disabled']).toBe('true');
 await p.show();p.reads.policy[0].resolve({defaultBudgetUsdt:3000,buckets:[]});p.reads.latest[0].resolve({status:'NONE'});p.reads.history[0].resolve([]);await flush();await p.hide();await p.show();p.rank.remoteReady=false;await flush();expect(p.nodes('agent-hero')[0]).toBe(hero);expect(p.nodes('agent-submit')[0]).toBe(cta);expect(text(cta)).toContain(copy.agent.submitForReview);expect(cta.props.style.opacity).toBe(1);expect(cta.props['aria-disabled']).toBe('true');
});
test('Pool HOLD remains a hard failure, not a retained loading estimate',async()=>{
 const {ApiError}=await vi.importActual<any>('@/api/errors');const p=await screen('leadership-pool');await p.show();p.reads.pool[0].resolve(pool());await flush();await p.show();p.reads.pool[1].reject(new ApiError({kind:'business',message:'F4_LEADERSHIP_POOL_HOLD'}));await flush();expect(p.view.remoteState).toBe('hold');expect(p.view.remotePool).toBeNull();expect(text(p.root)).toContain(en.pool.settlementHold);
});
test('Leaderboard a new pause/dataAvailable result replaces all prior active rows',async()=>{
 const p=await screen('leaderboard');await p.show();p.reads.leaderboard[0].resolve(board());await flush();expect(p.nodes('leader-share')).toHaveLength(1);await p.show();p.reads.leaderboard[1].resolve(board('week',true));await flush();expect(p.view.paused).toBe(true);expect(p.view.snapshotAvailable).toBe(false);expect(p.nodes('leader-share')).toHaveLength(0);expect(text(p.root)).toContain(en.leaderboard.snapshotUnavailable);
});
// Follow-up from independent review: disabled visuals must have real event guards.
test('Agent retained bucket/input/discard handlers cannot edit the form while page reads are pending or hidden',async()=>{
 const p=await screen('agent');await p.show();const policy={defaultBudgetUsdt:3000,buckets:[{id:'venue',title:'Venue',rule:'Rule',minBudgetUsdt:1,maxBudgetUsdt:9}]};p.reads.policy[0].resolve(policy);p.reads.latest[0].resolve({status:'NONE'});p.reads.history[0].resolve([]);await flush();
 p.view.city='Saved city';p.view.draft.touched=true;const bucket=p.nodes('agent-bucket')[0],inputs=all(p.root).filter(n=>n.tag==='input');const before=JSON.stringify(p.view.draft.form);
 await p.hide();await p.show();expect(p.view.pageReadState).toBe('loading');bucket.props.onClickCapture();bucket.props.onKeydown[0]({preventDefault(){},key:'Enter'});inputs[1].props.onInput('Late city');p.view.discardDraft();
 expect(JSON.stringify(p.view.draft.form)).toBe(before);expect(p.api.create).not.toHaveBeenCalled();
 p.reads.policy[1].resolve(policy);p.reads.latest[1].resolve({status:'NONE'});p.reads.history[1].resolve([]);await flush();p.nodes('agent-bucket')[0].props.onClickCapture();expect(p.view.selectedBucketId).toBe('venue');
});
for(const fail of ['latest','history','policy'])test('Agent '+fail+' composite failure revokes sibling writes before any retry',async()=>{
 const p=await screen('agent');await p.show();p.reads[fail][0].reject(new Error('strict read failure'));await flush();expect(p.view.pageReadState).toBe('error');expect(p.view.policy).toBeNull();expect(p.view.applications).toEqual([]);
 const late={defaultBudgetUsdt:999,buckets:[{id:'venue',title:'Old',rule:'Rule',minBudgetUsdt:1,maxBudgetUsdt:9}]};if(fail!=='policy')p.reads.policy[0].resolve(late);if(fail!=='latest')p.reads.latest[0].resolve({status:'APPROVED',applicationId:'old'});if(fail!=='history')p.reads.history[0].resolve([{applicationId:'old',status:'APPROVED'}]);await flush();expect(p.view.policy).toBeNull();expect(p.view.applications).toEqual([]);expect(p.view.latestApplication.status).toBe('NONE');expect(p.view.budgetText).not.toBe('999');expect(p.view.pageReadState).toBe('error');
 p.view.retryAgentPage();await flush();const fresh={defaultBudgetUsdt:3000,buckets:[{id:'kol',title:'Current',rule:'Rule',minBudgetUsdt:1,maxBudgetUsdt:9}]};p.reads.policy[1].resolve(fresh);p.reads.latest[1].resolve({status:'NONE'});p.reads.history[1].resolve([]);await flush();expect(p.view.pageReadState).toBe('ready');expect(p.view.policy.buckets[0].id).toBe('kol');expect(p.view.applications).toEqual([]);
});
test('Binary both wings preserve current canonical members and counts throughout network loading',async()=>{
 const p=await screen('binary');p.network.byBinary=()=>({left:[{id:'l',name:'Left',monthComputePoints:10,monthVolumeUSD:1},{id:'l2',name:'Left 2',monthComputePoints:5,monthVolumeUSD:1}],right:[{id:'r',name:'Right',monthComputePoints:20,monthVolumeUSD:2}]});p.network.hasRemoteSnapshot=true;p.network.remoteStatus='ready';await flush();const before=p.view.wings.map((w:any)=>({count:w.count,name:w.top?.name}));expect(before).toEqual([{count:2,name:'Left'},{count:1,name:'Right'}]);p.network.remoteStatus='loading';await flush();expect(p.view.wings.map((w:any)=>({count:w.count,name:w.top?.name}))).toEqual(before);p.network.remoteStatus='error';await flush();expect(p.view.wings.every((w:any)=>w.top===undefined)).toBe(true);
});
for(const name of ['leadership-pool','leadership-pool-how'])test(name+' hide clears time-bound projection before show and rejects a pending prior period; static shell and read rules survive',async()=>{
 const p=await screen(name);await p.show();p.reads.pool[0].resolve(pool());await flush();const frame=name==='leadership-pool'?p.nodes('pool-hero')[0]:p.nodes('pool-how-facts')[0];expect(frame).toBeDefined();await p.show();expect(p.view.remotePool).not.toBeNull();const previous=p.reads.pool[1];
 await p.hide();expect(p.view.remotePool).toBeNull();expect(p.view.remoteState).toBe('loading');expect(name==='leadership-pool'?p.view.poolRules.unlockRank:p.view.ruleFacts.unlockRank).toBe(3);
 await p.show();expect(p.view.remotePool).toBeNull();expect(name==='leadership-pool'?p.nodes('pool-hero')[0]:p.nodes('pool-how-facts')[0]).toBe(frame);expect(text(p.root)).not.toContain('$0.00');expect(text(p.root)).not.toContain('$500.00');
 previous.resolve({...pool(),currentWeekPoolUSDT:999,projectedPayoutUSDT:99});await flush();expect(p.view.remotePool).toBeNull();p.reads.pool[2].resolve({...pool(),currentWeekPoolUSDT:7000,projectedPayoutUSDT:700,nextPayoutAt:'2026-11-08T00:00:00Z'});await flush();expect(p.view.remotePool.projectedPayoutUSDT).toBe(700);
 await p.show();expect(p.view.remotePool.projectedPayoutUSDT).toBe(700);p.reads.pool[3].reject(new Error('actual failure'));await flush();expect(p.view.remotePool).toBeNull();expect(p.view.remoteState).toBe('error');expect(name==='leadership-pool'?p.view.poolRules:p.view.ruleFacts).toBeNull();
});
test('Existing payout display-clock hint only discards the cached projection and re-reads, without settling or granting anything',async()=>{
 vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-31T23:59:59Z'));const p=await screen('leadership-pool','en',true);await p.show();p.reads.pool[0].resolve(pool());await flush();expect(p.view.remotePool.projectedPayoutUSDT).toBe(500);
 await vi.advanceTimersByTimeAsync(1000);await flush();expect(p.view.remotePool).toBeNull();expect(p.view.remoteState).toBe('loading');expect(p.api.leadershipPool).toHaveBeenCalledTimes(2);expect(p.api.create).not.toHaveBeenCalled();p.reads.pool[1].resolve({...pool(),currentWeekPoolUSDT:7000,projectedPayoutUSDT:700,nextPayoutAt:'2026-11-08T00:00:00Z'});await flush();expect(p.view.remotePool.projectedPayoutUSDT).toBe(700);await p.hide();expect(vi.getTimerCount()).toBe(0);
});

test.each(['zh','en','vi'] as const)('Pool How %s distinguishes unknown distribution from a confirmed empty result',async lang=>{
 const p=await screen('leadership-pool-how',lang),copy=({en,zh,vi:vietnamese})[lang];const factsText=()=>text(p.nodes('pool-how-facts')[0].parent!);
 await p.show();p.reads.pool[0].resolve({...pool(),distribution:[{vRank:5,people:1,votes:5}]});await flush();expect(p.view.distributionRows).toHaveLength(1);expect(factsText()).not.toContain(copy.poolHowItWorks.noVoteRows);
 await p.hide();await p.show();expect(p.view.remotePool).toBeNull();expect(p.view.ruleFacts).not.toBeNull();expect(factsText()).not.toContain(copy.poolHowItWorks.noVoteRows);expect(factsText()).toContain('\u2014');
 p.reads.pool[1].resolve({...pool(),distribution:[]});await flush();expect(p.view.remoteState).toBe('ready');expect(p.view.remotePool).not.toBeNull();expect(factsText()).toContain(copy.poolHowItWorks.noVoteRows);
 await p.show();p.reads.pool[2].reject(new Error('strict failure'));await flush();expect(p.view.remoteState).toBe('error');expect(p.view.ruleFacts).toBeNull();expect(text(p.root)).not.toContain(copy.poolHowItWorks.noVoteRows);expect(text(p.root)).toContain(copy.pool.loadError);
});

// Global presentation privacy is independent from account/read authority.
const accessiblePresentation = (root: Parameters<typeof text>[0]) => text(root) + all(root).map(node =>
  ['aria-label', 'aria-valuetext', 'aria-valuenow', 'title', 'alt', 'value'].map(key => String(node.props[key] ?? '')).join(' ')).join(' ');

test.each(['en','zh','vi'] as const)('Binary %s masks estimate, wings, leaders and history, retaining rules and raw values', async lang => {
  const p = await screen('binary', lang);
  const left = { id:'left',name:'Left member',vRank:6,monthComputePoints:1720,monthVolumeUSD:820 };
  const right = { id:'right',name:'Right member',vRank:4,monthComputePoints:1480,monthVolumeUSD:720 };
  p.network.byBinary = () => ({left:[left],right:[right]}); p.network.hasRemoteSnapshot=true;p.network.remoteStatus='ready';
  p.commission.binarySnapshot={estimatedAmountUsdt:240.75,trackA:820,trackB:720,trackAComputePoints:1720,trackBComputePoints:1480,settlePeriod:'monthly',threshold:1,matchRate:.1375,dailyCap:4321,recentMatches:[{id:'settlement',amountUsdt:120.25,createdAt:Date.UTC(2026,9,28),status:'settled'}]};
  p.commission.binaryStatus='ready';await flush();
  const before=text(p.root), raw=JSON.stringify(p.commission.binarySnapshot), calls=p.commission.refreshCanonicalBinary.mock.calls.length;
  expect(before).toContain('240.75');expect(before).toContain('120.25');expect(p.nodes('binary-contribution-fill')).toHaveLength(2);
  p.visibility.toggle();await flush();
  expect(p.nodes('binary-points').map(text)).toEqual(['••••','••••']);
  expect(p.nodes('reward-wing-member__points').map(text)).toEqual(['••••','••••']);
  expect(p.nodes('binary-record-value').map(text)).toEqual(['••••']);
  expect(p.nodes('binary-contribution-fill')).toHaveLength(0);expect(p.nodes('binary-weak')).toHaveLength(0);
  expect(text(p.nodes('reward-binary-basis')[0])).toContain(p.view.formulaText);
  for(const secret of ['240.75','120.25','1720','1480']) expect(accessiblePresentation(p.root)).not.toContain(secret);
  expect(text(p.root)).not.toContain('4,321.00');expect(JSON.stringify(p.commission.binarySnapshot)).toBe(raw);
  expect(p.commission.refreshCanonicalBinary).toHaveBeenCalledTimes(calls);
  p.visibility.toggle();await flush();expect(text(p.root)).toBe(before);expect(p.nodes('binary-contribution-fill')).toHaveLength(2);
});

test.each([null,0,3200])('Tree privacy restores unknown/zero/known points (%s) and hides roster summaries',async points=>{
  const p=await screen('tree');p.network.members=[{id:'one',name:'Known',layer:1,monthVolumeUSD:0,monthComputePoints:points}];p.network.totalMonthComputePoints=points;p.network.hasRemoteSnapshot=true;p.network.remoteStatus='ready';await flush();
  const before=text(p.root);expect(text(p.nodes('tree-points')[0])).toContain(points===null?'—':points===0?'0':'3,200');
  p.visibility.toggle();await flush();expect(text(p.nodes('tree-points')[0])).toBe('••••');expect(text(p.nodes('tree-total')[0])).toContain('••••');
  expect(all(p.root).filter(node=>node.props.subtitle!==undefined).every(node=>node.props.subtitle==='••••')).toBe(true);
  expect(p.network.totalMonthComputePoints).toBe(points);p.visibility.toggle();await flush();expect(text(p.root)).toBe(before);
});

test.each(['en','zh','vi'] as const)('Pool %s hides personal and participation statistics while keeping the public pool',async lang=>{
  const p=await screen('leadership-pool',lang);await p.show();p.reads.pool[0].resolve({...pool(),projectedPayoutUSDT:250.75,myVotes:2,mySharePct:.05,totalVotes:40,history:[{weekId:'2026-W43',poolUSDT:4000,payoutUSDT:120.25}]});await flush();
  const before=text(p.root), raw=JSON.stringify(p.view.remotePool), personal=text(p.nodes('pool-personal')[0]);
  expect(personal).toContain('250.75');expect(text(p.root)).toContain('120.25');
  const publicHero=text(p.nodes('pool-hero')[0]);p.visibility.toggle();await flush();
  expect(text(p.nodes('pool-hero')[0])).toBe(publicHero);expect(text(p.nodes('pool-votes')[0])).not.toContain('40');
  expect(text(p.nodes('pool-personal')[0])).toContain('••••');expect(text(p.nodes('pool-history-row')[0])).toContain('••••');
  for(const secret of ['250.75','120.25','5.00%'])expect(accessiblePresentation(p.root)).not.toContain(secret);
  expect(JSON.stringify(p.view.remotePool)).toBe(raw);expect(p.api.leadershipPool).toHaveBeenCalledTimes(1);
  p.visibility.toggle();await flush();expect(text(p.root)).toBe(before);
});

test.each(['en','zh','vi'] as const)('Leaderboard %s masks ranks, gap, member stats and earnings without changing order',async lang=>{
  const p=await screen('leaderboard',lang);await p.show();p.reads.leaderboard[0].resolve({...board(),myRank:27,gapToNext:67.89,gapToNextComputePoints:6789,totalRows:3,rows:[{rank:1,handle:'Member Alpha',vRank:6,directs:13,teamSize:247,computePoints:34567,earnedUSDT:9876.54}]});await flush();
  const before=text(p.root), raw=JSON.stringify(p.view.remoteSnapshot);expect(before).toContain(lang==='vi'?'34.567':'34,567');
  p.visibility.toggle();await flush();expect(text(p.nodes('leader-points')[0])).toBe('••••');expect(text(p.nodes('leader-position')[0])).toBe('••••');
  expect(p.nodes('leader-row')[0].props['data-rank']).toBeUndefined();expect(text(p.root)).toContain('Member Alpha');
  for(const secret of ['34,567','34.567','6,789','6.789','9,876.54','67.89','247','#27','V6'])expect(accessiblePresentation(p.root)).not.toContain(secret);
  expect(JSON.stringify(p.view.remoteSnapshot)).toBe(raw);expect(p.api.leaderboard).toHaveBeenCalledTimes(1);
  p.visibility.toggle();await flush();expect(text(p.root)).toBe(before);
});

test.each(['en','zh','vi'] as const)('Agent %s masks draft and submitted budgets, retains public limits and the editable draft',async lang=>{
  const p=await screen('agent',lang);await p.show();p.reads.policy[0].resolve({defaultBudgetUsdt:6543.21,buckets:[{id:'venue',title:'Venue',rule:'Public rule',minBudgetUsdt:100,maxBudgetUsdt:20000}]});p.reads.latest[0].resolve({status:'NONE'});p.reads.history[0].resolve([{applicationId:'application',city:'Test city',eventDate:'2026-11-01',bucket:'venue',status:'PENDING',budgetUsdt:8765.43}]);await flush();
  p.view.budgetText='6543.21';await flush();
  const before=accessiblePresentation(p.root), raw=JSON.stringify(p.view.draft.form), bucket=text(p.nodes('agent-bucket')[0]), submit=p.nodes('agent-submit')[0].props['aria-disabled'];
  expect(before).toContain('6543.21');expect(before).toContain('8,765.43');
  p.visibility.toggle();await flush();expect(p.nodes('agent-budget-masked')).toHaveLength(1);expect(all(p.root).filter(n=>n.tag==='input')).toHaveLength(2);
  expect(accessiblePresentation(p.root)).not.toContain('6543.21');expect(accessiblePresentation(p.root)).not.toContain('8,765.43');expect(text(p.nodes('agent-bucket')[0])).toBe(bucket);
  expect(p.nodes('agent-submit')[0].props['aria-disabled']).toBe(submit);expect(JSON.stringify(p.view.draft.form)).toBe(raw);expect(p.api.create).not.toHaveBeenCalled();
  p.visibility.toggle();await flush();expect(accessiblePresentation(p.root)).toBe(before);expect(all(p.root).filter(n=>n.tag==='input')).toHaveLength(3);
});
