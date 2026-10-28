import * as Vue from 'vue';
import {beforeEach,expect,it,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {all,flush,mountEntry,slot,text} from '@/lib/entry-review.test-support';
import source from './goals.vue?raw';
import {zh} from '@/i18n/messages/zh';
import {fmt} from '@/i18n/format';
import {formatAmount,formatGroupedAmount} from '@/lib/amount-display';
import {ApiError} from '@/api/errors';
const remote=vi.hoisted(()=>({remoteApiEnabled:true,goalsApi:{list:vi.fn(),create:vi.fn(),recommendation:vi.fn(),setStatus:vi.fn(),remove:vi.fn()}}));
vi.mock('@/api/runtime',()=>remote);
const {useGoals}=await import('@/store/goals');
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(cause:unknown)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
function facts(target?:number){return {serverCanonical:true,source:'nx_earning_goal',lifetimeEarningsUsdt:17.25,goals:target?[{id:6,targetUsdt:target,deadlineAt:1900000000000,createdAt:1900000000000-90*86400000,achieved:false,progressPct:0}]:[]};}
beforeEach(()=>{setActivePinia(createPinia());Object.values(remote.goalsApi).forEach(mock=>mock.mockReset());remote.goalsApi.list.mockResolvedValue(facts());remote.goalsApi.recommendation.mockResolvedValue({purchaseRequired:false});});
async function setup(initialRead?: {promise:Promise<ReturnType<typeof facts>>}){
 const store=useGoals();store.bindAccount('user:1');await store.ensure();
 if(initialRead)remote.goalsApi.list.mockReturnValueOnce(initialRead.promise);
 const app=Vue.reactive({accountKey:'user:1',accountBindingEpoch:1}),environment=Vue.reactive({environment:'prod'}),shows:Array<()=>void>=[];
 let actions!:{refreshRemoteGoals():Promise<void>;editorDisplayReady:Vue.Ref<boolean>;onSave():Promise<void>};
 const page=mountEntry(source.replace('</script>','import {capture} from "test:probe";capture({refreshRemoteGoals,editorDisplayReady,onSave});\n</script>'),{
 'test:probe':{capture:(value:typeof actions)=>{actions=value;}},'@dcloudio/uni-app':{onShow:(fn:()=>void)=>shows.push(fn),onHide:vi.fn()},
 '@/components/app-chassis.vue':slot,'@/components/sub-page-header.vue':{default:{render:()=>null}},'@/components/me/goal-progress-bar.vue':{default:{render:()=>null}},
 '@/lib/amount-display':{formatAmount,formatGroupedAmount},'@/lib/route':{navReset:vi.fn()},'@/lib/brand-copy':{nexGridBrandText:(v:string)=>v},
 '@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/i18n/format':{fmt},'@/store/goals':{useGoals:()=>store},'@/store/app':{useApp:()=>app},'@/store/ui':{useUI:()=>({pushToast:vi.fn()})},'@/api/runtime':{remoteApiEnabled:true,apiRuntimeConfig:environment}});
 await flush();expect(actions.editorDisplayReady.value).toBe(!initialRead);
 return {store,app,environment,page,actions,show:()=>shows.forEach(fn=>fn())};
}
const cases=(['success','error'] as const).flatMap(old=>([false,true] as const).flatMap(nonempty=>([false,true] as const).map(immediate=>({old,nonempty,immediate}))));
it.each(cases)('automatic return recovers $old / nonempty=$nonempty / immediate=$immediate without another page refresh',async({old,nonempty,immediate})=>{
 const p=await setup(),previous=deferred<ReturnType<typeof facts>>(),current=deferred<ReturnType<typeof facts>>();
 remote.goalsApi.list.mockReturnValueOnce(previous.promise);
 const reading=p.actions.refreshRemoteGoals(); // The old actual store request is already pending.
 if(immediate)remote.goalsApi.list.mockResolvedValueOnce(facts(nonempty?700:undefined));else remote.goalsApi.list.mockReturnValueOnce(current.promise);
 p.app.accountBindingEpoch++;expect(p.actions.editorDisplayReady.value).toBe(false);p.show();p.store.bindAccount('user:1');const currentRead=p.store.ensure();
 if(old==='success')previous.resolve(facts(900));else previous.reject(new ApiError({kind:'http',status:403,code:403,message:'FORBIDDEN'}));
 await reading;await flush();
 if(!immediate){expect(p.actions.editorDisplayReady.value).toBe(false);await p.actions.onSave();expect(remote.goalsApi.create).not.toHaveBeenCalled();current.resolve(facts(nonempty?700:undefined));}
 await currentRead;await flush();
 expect(p.actions.editorDisplayReady.value).toBe(true);expect(p.store.readSuccessScope).toEqual(p.store.captureReadBinding());
 expect(p.store.goals.map(g=>g.targetUSDT)).toEqual(nonempty?[700]:[]);
 expect(text(p.page.root)).not.toContain(zh.goals.loading);expect(p.page.control(zh.goals.saveCta)?.props['aria-disabled']).toBe(nonempty);
 if(nonempty)expect(p.page.nodes('nx-goal-target-preset').some(n=>n.props['aria-checked']==='true')).toBe(false); // 700 has no preset.
 p.environment.environment='dev';expect(p.actions.editorDisplayReady.value).toBe(false);await p.actions.onSave();expect(remote.goalsApi.create).not.toHaveBeenCalled();p.page.unmount();
});
it.each([401,403,503])('current %s is a true failure with retry, not an adopted old snapshot',async status=>{
 const p=await setup(),previous=deferred<ReturnType<typeof facts>>(),current=deferred<ReturnType<typeof facts>>();remote.goalsApi.list.mockReturnValueOnce(previous.promise);const old=p.actions.refreshRemoteGoals();
 remote.goalsApi.list.mockReturnValueOnce(current.promise);p.app.accountBindingEpoch++;p.show();p.store.bindAccount('user:1');const currentRead=p.store.ensure();
 previous.resolve(facts(900));await old;await flush();current.reject(new ApiError({kind:'http',status,code:status,message:'FORBIDDEN'}));await currentRead;await flush();
 expect(p.actions.editorDisplayReady.value).toBe(false);expect(text(p.page.root)).toContain(zh.goals.serverUnavailable);expect(p.page.control(zh.ui.retry)).toBeDefined();
 await p.actions.onSave();expect(remote.goalsApi.create).not.toHaveBeenCalled();
 remote.goalsApi.list.mockResolvedValueOnce(facts(500));p.page.control(zh.ui.retry)!.props.onClick();await flush();
 expect(p.actions.editorDisplayReady.value).toBe(true);expect(p.store.goals.map(g=>g.targetUSDT)).toEqual([500]);expect(text(p.page.root)).not.toContain(zh.goals.serverUnavailable);p.page.unmount();
});

it.each(['success','error'] as const)('late old %s cannot erase the automatically recovered current binding',async outcome=>{
 const p=await setup(),previous=deferred<ReturnType<typeof facts>>(),current=deferred<ReturnType<typeof facts>>();
 remote.goalsApi.list.mockReturnValueOnce(previous.promise);const old=p.actions.refreshRemoteGoals();
 remote.goalsApi.list.mockReturnValueOnce(current.promise);p.app.accountBindingEpoch++;p.show();p.store.bindAccount('user:1');const currentRead=p.store.ensure();
 await flush();current.resolve(facts(500));await currentRead;await flush();expect(p.actions.editorDisplayReady.value).toBe(true);
 if(outcome==='success')previous.resolve(facts(900));else previous.reject(new ApiError({kind:'http',status:403,code:403,message:'FORBIDDEN'}));
 await old;await flush();expect(p.actions.editorDisplayReady.value).toBe(true);expect(p.store.goals.map(g=>g.targetUSDT)).toEqual([500]);p.page.unmount();
});

it('unknown target and deadline have no visual selection until the current actual read confirms them',async()=>{
 const initial=deferred<ReturnType<typeof facts>>(),p=await setup(initial);
 const radios=()=>all(p.page.root).filter(n=>n.props.role==='radio');
 expect(radios()).toHaveLength(8);
 expect(radios().filter(n=>n.props.style?.background==='var(--v5-brand)')).toHaveLength(0);
 expect(radios().filter(n=>n.props['aria-checked']==='true')).toHaveLength(0);
 expect(p.page.control(zh.goals.saveCta)).toBeDefined();
 await p.actions.onSave();expect(remote.goalsApi.create).not.toHaveBeenCalled();
 initial.resolve(facts(1000));await p.store.ensure();await flush();
 expect(p.actions.editorDisplayReady.value).toBe(true);
 expect(radios().filter(n=>n.props.style?.background==='var(--v5-brand)')).toHaveLength(2);
 expect(radios().filter(n=>n.props['aria-checked']==='true')).toHaveLength(2);p.page.unmount();
});
it.each([false,true])('onShow before a same-account store bind recovers even without an app epoch notification, nonempty=%s',async nonempty=>{
 const p=await setup(),previous=deferred<ReturnType<typeof facts>>(),current=deferred<ReturnType<typeof facts>>();
 remote.goalsApi.list.mockReturnValueOnce(previous.promise);const old=p.actions.refreshRemoteGoals();
 remote.goalsApi.list.mockReturnValueOnce(current.promise);p.show();p.store.bindAccount('user:1');
 expect(p.actions.editorDisplayReady.value).toBe(false);const currentRead=p.store.ensure();
 previous.resolve(facts(900));await old;await flush();expect(p.actions.editorDisplayReady.value).toBe(false);
 current.resolve(facts(nonempty?500:undefined));await currentRead;await flush();expect(p.actions.editorDisplayReady.value).toBe(true);
 expect(p.store.goals.map(g=>g.targetUSDT)).toEqual(nonempty?[500]:[]);p.page.unmount();
});
