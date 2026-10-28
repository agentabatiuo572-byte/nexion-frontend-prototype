import * as Vue from 'vue';
import { createPinia, setActivePinia, disposePinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountEntry, flush, text, slot } from '@/lib/entry-review.test-support';
import rulesSource from './invite-rule-content.vue?raw';
import recordsSource from './invite-detail-sheet.vue?raw';
import shareSource from './share-channel-sheet.vue?raw';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { teamRedesignCopy, referralSettlementStatus } from '@/i18n/team-redesign';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { formatDisplayDate } from '@/lib/display-date';
const remote=vi.hoisted(()=>({remoteApiEnabled:true,referralRewardApi:{snapshot:vi.fn()},apiRuntimeConfig:{environment:'dev'}}));
vi.mock('@/api/runtime',()=>remote);
const {useReferralReward}=await import('@/store/referral-reward');
function deferred<T=any>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject};}
const snapshot=(amount=.015)=>({source:'ledger' as const,sourceEnvironment:'PRODUCTION' as const,runId:null,referralCode:'CURRENT',rewardEnabled:true,inviterRewardNex:amount,invitedCount:2,pendingCount:1,settledCount:1,lifetimeInviterNex:7,walletNexAvailable:7,recentRewards:[{settlementNo:'s1',amountNex:7,settledAt:'2026-10-22T00:00:00Z',releaseBucket:'AVAILABLE',status:'SETTLED'}],limit:10,factSources:[],refreshedAt:'2026-10-27T00:00:00Z'});
let pinia:ReturnType<typeof createPinia>;const cleanup:Array<()=>void>=[];
beforeEach(()=>{pinia=createPinia();setActivePinia(pinia);vi.clearAllMocks();vi.stubGlobal('uni',{getStorageSync:()=>undefined,setStorageSync:vi.fn()});remote.apiRuntimeConfig=Vue.reactive({environment:'dev'});});
afterEach(()=>{cleanup.splice(0).forEach(fn=>fn());disposePinia(pinia);vi.unstubAllGlobals();});
async function screen(source:string,copy=en,props={}){
 const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1}),locale=Vue.reactive({code:copy===zh?'zh':copy===vietnamese?'vi':'en'}),rewards=useReferralReward();
 remote.referralRewardApi.snapshot.mockResolvedValue(snapshot());rewards.bindAccount('user:7');await flush();
 const cfg=Vue.reactive({configStatus:'ready',loading:false,config:{rewards:{enabled:true,effectiveAt:'2026-10-22T00:00:00Z',inviterReward:{nexAmount:.015}},share:{channels:[]}},ensureLoaded:vi.fn(),revalidate:vi.fn(),load:vi.fn()});
 const copyText=vi.fn(async()=>true);
 const deps:Record<string,unknown>={vue:Vue,'@/store/app':{useApp:()=>app},'@/store/locale':{useLocaleStore:()=>locale},'@/store/referral-reward':{useReferralReward:()=>rewards},'@/store/config':{useConfig:()=>cfg},'@/api/runtime':remote,'@/i18n/use-t':{useT:()=>Vue.ref(copy)},'@/i18n/team-redesign':{teamRedesignCopy,referralSettlementStatus},'@/i18n/format':{fmt,dateLocale:()=>locale.code},'@/lib/amount-display':{formatAmount},'@/lib/display-date':{formatDisplayDate},'@/lib/route':{navTo:vi.fn()},'@/composables/use-dialog-a11y':{useDialogA11y:()=>{}},'@/composables/use-product-phase':{useProductPhase:()=>Vue.ref({inviteBonusMultiplier:1})},'@/store/ui':{toast:{info:vi.fn(),success:vi.fn()}},'@/lib/share':{currentShareReferralCode:()=>rewards.snapshot?.referralCode??'',buildShareLink:()=>rewards.snapshot?.referralCode?'https://example.invalid/'+rewards.snapshot.referralCode:'',visibleChannels:()=>[],copyText,activateChannel:vi.fn(),INVITER_REWARD_USDT_ESTIMATE:1},'./team-art.vue':slot,'./invite-rule-content.vue':slot,'@/components/liquid-glass.vue':slot,'@/components/ui/nx-button.vue':slot};
 deps['@/store/data-visibility']={useDataVisibility};
 const p=mountEntry(source,deps,props);cleanup.push(p.unmount);await flush();return{...p,rewards,cfg,app,locale,copyText};
}
it.each([en,zh,vietnamese])('keeps this rule read through a warm refresh and clears real failures',async copy=>{
 const s=await screen(rulesSource,copy),before=text(s.root);expect(before).toContain('0.02');
 const pending=deferred();remote.referralRewardApi.snapshot.mockReturnValueOnce(pending.promise);const warm=s.rewards.refresh();await flush();
 expect(s.rewards.snapshot).toBeNull();expect(text(s.root)).toBe(before);expect(text(s.root)).not.toContain(copy.team.rewardLoading);
 pending.reject(new Error('403'));await warm;await flush();expect(text(s.root)).not.toContain('0.02');expect(s.nodes('invite-rules-retry')).toHaveLength(1);
 remote.referralRewardApi.snapshot.mockResolvedValueOnce(snapshot(.025));s.cfg.config.rewards.inviterReward.nexAmount=.025;await s.rewards.refresh();await flush();expect(text(s.root)).toContain('0.03');
});
it('keeps records and the same row node while authority clears, but hides them after denial',async()=>{
 const s=await screen(recordsSource,en,{open:true,mode:'records'}),before=text(s.root),row=s.nodes('invite-detail__record')[0];expect(before).toContain('7.00');
 const pending=deferred();remote.referralRewardApi.snapshot.mockReturnValueOnce(pending.promise);const warm=s.rewards.refresh();await flush();expect(s.rewards.snapshot).toBeNull();expect(text(s.root)).toBe(before);expect(s.nodes('invite-detail__record')[0]).toBe(row);
 pending.reject(new Error('401'));await warm;await flush();expect(s.nodes('invite-detail__record')).toHaveLength(0);expect(text(s.root)).toContain(en.team.settlementUnavailable);
});
it('keeps share presentation silent while current data disables copying and poster actions',async()=>{
 const s=await screen(shareSource,en,{open:true}),before=text(s.nodes('ss-reward')[0]);expect(before).toContain('0.02');
 const pending=deferred();remote.referralRewardApi.snapshot.mockReturnValueOnce(pending.promise);const warm=s.rewards.refresh();await flush();
 expect(text(s.nodes('ss-reward')[0])).toBe(before);expect(text(s.root)).not.toContain(en.share.channelsLoading);expect(text(s.root)).toContain('CURRENT');
 const code=s.nodes('ss-code__copy')[0];expect(code.props['aria-disabled']).toBe(true);await code.props.onClick();expect(s.copyText).not.toHaveBeenCalled();
 const poster=s.nodes('ss-ch')[0];expect(poster.props['aria-disabled']).toBe(true);
 pending.reject(new Error('403'));await warm;await flush();expect(text(s.root)).not.toContain('0.02');expect(text(s.root)).not.toContain('CURRENT');
});
it.each(['account','binding','environment','locale'])('cannot show record presentation across %s',async boundary=>{
 const s=await screen(recordsSource,en,{open:true,mode:'records'});expect(s.nodes('invite-detail__record')).toHaveLength(1);
 if(boundary==='account')s.app.accountKey='user:8';else if(boundary==='binding')s.app.accountBindingEpoch++;else if(boundary==='environment')remote.apiRuntimeConfig.environment='prod';else s.locale.code='vi';await flush();expect(s.nodes('invite-detail__record')).toHaveLength(0);
});

it('keeps fixed rule conditions and record labels when a new scope has no data',async()=>{
 const rules=await screen(rulesSource);rules.rewards.snapshot=null;rules.rewards.loading=true;rules.app.accountBindingEpoch++;await flush();
 expect(text(rules.root)).toContain(teamRedesignCopy('en').inviteRuleQualification);expect(text(rules.root)).toContain(teamRedesignCopy('en').inviteRuleSettlement);expect(text(rules.root)).not.toContain('0.02');
 const records=await screen(recordsSource,en,{open:true,mode:'records'});records.rewards.snapshot=null;records.rewards.loading=true;records.app.accountBindingEpoch++;await flush();
 expect(text(records.root)).toContain(teamRedesignCopy('en').totalEarned);expect(text(records.root)).toContain(teamRedesignCopy('en').recentRewards);expect(text(records.root)).toContain('—');expect(records.nodes('invite-detail__record')).toHaveLength(0);
});
