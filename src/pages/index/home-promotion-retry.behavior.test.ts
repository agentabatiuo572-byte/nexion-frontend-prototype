import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import * as Vue from 'vue';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import source from './index.vue?raw';
import readSource from '@/store/home-promotions.ts?raw';
import { ApiError } from '@/api/errors';
import { createPromotionReadFence, isPromotionActive } from '@/lib/promotion-entry';
import type { PublicPromotion, PublicPromotionPage } from '@/api/promotion-contracts';
const requestCode = ts.transpileModule(source.slice(source.indexOf('const homePromotions ='), source.indexOf('</script>')), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const page = (ids:string[]):PublicPromotionPage => ({items:ids.map(activityId=>({activityId,state:'ACTIVE',placement:'home.purchase-promotion'} as PublicPromotion)),nextCursor:null,hasMore:false});
function deferred(){let resolve!:(value:PublicPromotionPage)=>void,reject!:(error:Error)=>void;const promise=new Promise<PublicPromotionPage>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject};}
const cleanups:Array<()=>void>=[];afterEach(()=>cleanups.splice(0).forEach(fn=>fn()));
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();await Vue.nextTick();};
function mount(){
 const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1,setTaskReadPageVisible:vi.fn()}),locale=Vue.reactive({code:'zh',ensureSystemDetected:()=>{}});
 const readWindow=createPassiveTabReadFixture(()=>JSON.stringify([app.accountKey,app.accountBindingEpoch,locale.code]));
 const list=vi.fn<(...args:unknown[])=>Promise<PublicPromotionPage>>().mockResolvedValue(page([]));
 const homeRead:any={};new Function('require','exports',ts.transpileModule(readSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)((name:string)=>name==='@/lib/passive-tab-read'?readWindow:name==='@/api/errors'?{ApiError}:{apiRuntimeConfig:{baseUrl:'https://api.example',environment:'dev'},promotionApi:{list}},homeRead);
 const shown:Array<()=>void>=[],hidden:Array<()=>void>=[];
 const dependencies={ref:Vue.ref,watch:Vue.watch,app,locale,config:{revalidate:()=>Promise.resolve()},remoteApiEnabled:true,promotionApi:{list},readHomePromotions:homeRead.readHomePromotions,sessionVault:{read:()=>({user:{userId:7}})},createPromotionReadFence,isPromotionActive,onShow:(fn:()=>void)=>shown.push(fn),onHide:(fn:()=>void)=>hidden.push(fn),onUnmounted:()=>{},onLoad:()=>{}};
 const scope=Vue.effectScope();const view=scope.run(()=>new Function('deps',`const {${Object.keys(dependencies).join(',')}}=deps;${requestCode};return {homePromotions,homePromotionStatus,refresh};`)(dependencies));
 cleanups.push(()=>{hidden.forEach(fn=>fn());scope.stop();});
 return{view,app,locale,list,show:()=>shown.forEach(fn=>fn()),hide:()=>hidden.forEach(fn=>fn())};
}
it('keeps failed optional activity reads hidden and recovers on next visit',async()=>{const s=mount();s.list.mockRejectedValueOnce(new Error('offline'));await s.view.refresh();expect(s.view.homePromotionStatus.value).toBe('error');expect(s.view.homePromotions.value).toEqual([]);s.hide();s.list.mockResolvedValueOnce(page(['back']));s.show();await flush();expect(s.view.homePromotions.value.map((r:PublicPromotion)=>r.activityId)).toEqual(['back']);});
it('asks for the Home placement and rejects other placements or inactive promotions',async()=>{const s=mount();s.list.mockResolvedValueOnce({...page(['home']),items:[...page(['home']).items,{...page(['other']).items[0],placement:null},{...page(['closed']).items[0],state:'PAUSED'}]});await s.view.refresh();expect(s.list).toHaveBeenLastCalledWith({limit:20,placement:'home.purchase-promotion'},true);expect(s.view.homePromotions.value.map((r:PublicPromotion)=>r.activityId)).toEqual(['home']);});
it('a late account failure never erases a current account result',async()=>{const s=mount(),old=deferred();s.list.mockReturnValueOnce(old.promise);const pending=s.view.refresh();s.list.mockResolvedValueOnce(page(['current']));s.app.accountBindingEpoch++;await flush();old.reject(new Error('old'));await pending;expect(s.view.homePromotionStatus.value).toBe('ready');expect(s.view.homePromotions.value[0].activityId).toBe('current');});
it('a late locale success never restores stale language content',async()=>{const s=mount(),old=deferred();s.list.mockReturnValueOnce(old.promise);const pending=s.view.refresh();s.list.mockRejectedValueOnce(new Error('current'));s.locale.code='en';await flush();old.resolve(page(['old']));await pending;expect(s.view.homePromotionStatus.value).toBe('error');expect(s.view.homePromotions.value).toEqual([]);});
it('hiding invalidates in-flight reads and returning starts a new request',async()=>{const s=mount(),old=deferred();s.list.mockReturnValueOnce(old.promise);const pending=s.view.refresh();s.hide();s.app.accountKey='user:8';await flush();expect(s.list).toHaveBeenCalledOnce();s.list.mockResolvedValueOnce(page(['return']));s.show();await flush();old.resolve(page(['hidden']));await pending;expect(s.view.homePromotions.value[0].activityId).toBe('return');});
