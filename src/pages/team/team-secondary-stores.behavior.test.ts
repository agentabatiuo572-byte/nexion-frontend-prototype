import * as Vue from 'vue';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mountEntry, slot, flush, text } from '@/lib/entry-review.test-support';
import { installSupportStorage } from '@/test/storage-setup';
import { en } from '@/i18n/messages/en';
import commissionSource from './commissions.vue?raw';
import binarySource from './binary.vue?raw';
import treeSource from './tree.vue?raw';
import { advanceRuntimeRevision, captureRuntimeRevision, isCurrentRuntimeRevision } from '@/api/order-api';
installSupportStorage();
vi.mock('@dcloudio/uni-app',()=>({onShow:vi.fn(),onHide:vi.fn(),onUnload:vi.fn()}));
const remote=vi.hoisted(()=>({remoteApiEnabled:true,apiRuntimeConfig:{environment:'prod',baseUrl:'https://fixture.invalid'},commissionConfigApi:{rates:vi.fn(),binary:vi.fn()},teamInsightsApi:{commissions:vi.fn()},teamNetworkApi:{snapshot:vi.fn()}}));
vi.mock('@/api/runtime',()=>remote);
const {useCommission}=await import('@/store/commission'),{useNetwork}=await import('@/store/network');
let pinia:ReturnType<typeof createPinia>;const stops:Array<()=>void>=[];
function deferred(){let resolve!:(x:any)=>void,reject!:(e:any)=>void;const promise=new Promise<any>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
const byKind=Object.fromEntries(['direct_purchase','direct_device_earning','unilevel','binary','peer','cultivation','leadership','genesis','promotion','other'].map(k=>[k,{usdt:0,nex:0,count:0}]));
const ledger=(amount=123)=>({events:[],page:1,pageSize:20,totalRows:0,aggregate:{monthUSDT:amount,monthNEX:456,totalUSDT:789,totalNEX:12,unlockedUSDT:20,unlockedNEX:30,coolingUSDT:40,nextUnlockAt:null,byKind}});
const binary=()=>({estimatedAmountUsdt:12,trackA:1,trackB:2,trackAComputePoints:10,trackBComputePoints:20,trackAMembers:1,trackBMembers:0,settlePeriod:'monthly',threshold:1,matchRate:.1,dailyCap:10,recentMatches:[],blockedReason:null});
const network=()=>({members:[{id:'member',name:'Known member',vRank:0,layer:1,leg:'A',joinedAt:'2026-10-01T00:00:00Z',monthVolumeUsdt:2,lifetimeVolumeUsdt:4,monthComputePoints:10,status:'ACTIVE'}],totalMembers:1,monthVolumeUsdt:2,lifetimeVolumeUsdt:4,monthComputePoints:10,lifetimeComputePoints:20});
beforeEach(()=>{pinia=createPinia();setActivePinia(pinia);vi.clearAllMocks();remote.commissionConfigApi.rates.mockResolvedValue({});remote.commissionConfigApi.binary.mockResolvedValue(binary());remote.teamInsightsApi.commissions.mockResolvedValue(ledger());remote.teamNetworkApi.snapshot.mockResolvedValue(network());});
afterEach(()=>{stops.splice(0).forEach(f=>f());disposePinia(pinia);});
async function screen(source:string){
 const app=Vue.reactive({accountKey:'user:1',accountBindingEpoch:1}),auth=Vue.reactive({isAuthenticated:true,accountId:'user:1'}),locale=Vue.reactive({code:'en'});
 const commission=useCommission(),net=useNetwork();commission.bindAccount('user:1');net.bindAccount('user:1');await flush();
 const deps:Record<string,any>={ '@/api/runtime':{...remote,sessionVault:{read:()=>({user:{userId:1}})}},'@/store/app':{useApp:()=>app},'@/store/auth':{useAuth:()=>auth},'@/store/locale':{useLocaleStore:()=>locale},'@/store/commission':{useCommission:()=>commission,UNILEVEL_USDT:{}},'@/store/network':{useNetwork:()=>net},'@/i18n/use-t':{useT:()=>Vue.ref(en)},'@/composables/use-product-phase':{useProductPhase:()=>Vue.ref({})},'@dcloudio/uni-app':{onShow(){}},'@/lib/route':{navTo:vi.fn()}};
 const {descriptor}=await import('@vue/compiler-sfc').then(m=>m.parse(source));
 for(const m of descriptor.scriptSetup!.content.matchAll(/from\s+['"]([^'"]+)['"]/g)){const id=m[1];if(id==='vue'||id in deps)continue;deps[id]=id.endsWith('.vue')?slot:await vi.importActual(id);}
 const fmt=await vi.importActual<any>('@/i18n/format');deps['@/i18n/format']={...fmt,dateLocale:()=> 'en-US'};
 deps['@/components/empty-state.vue']={default:Vue.defineComponent({props:['title','desc','ctaLabel'],setup:props=>()=>Vue.h('view',[props.title,props.desc,props.ctaLabel])})};
 const page=mountEntry(source,deps);stops.push(page.unmount);await flush();return{...page,app,auth,commission,net};
}
for(const [name,source,expected] of [['commissions',commissionSource,'$123.00'],['binary',binarySource,'+$12.00']] as const)test(name+' actual store runtime reset retains presentation while real authority is idle/loading; error and same-account bind clear',async()=>{
 const p=await screen(source);expect(text(p.root)).toContain(expected);
 const events=deferred(),match=deferred();remote.teamInsightsApi.commissions.mockReturnValue(events.promise);remote.commissionConfigApi.binary.mockReturnValue(match.promise);
 advanceRuntimeRevision();await Vue.nextTick();expect(p.commission.eventsStatus).toBe('loading');expect(p.commission.binaryStatus).toBe('loading');expect(p.commission.eventsEvidence).toBeNull();expect(p.commission.binarySnapshot).toBeNull();expect(text(p.root)).toContain(expected);
 expect(p.commission.coolingUSDT()).toBe(0); // real store authority was not replaced by display.
 events.reject(new Error('offline'));match.reject(new Error('offline'));await flush();expect(text(p.root)).not.toContain(expected);expect(text(p.root)).toContain(en.network.projectionErrorTitle);
 remote.teamInsightsApi.commissions.mockResolvedValue(ledger());remote.commissionConfigApi.binary.mockResolvedValue(binary());await Promise.all([p.commission.refreshCanonicalEvents(),p.commission.refreshCanonicalBinary()]);await flush();expect(text(p.root)).toContain(expected);
 const late=deferred();remote.teamInsightsApi.commissions.mockReturnValue(late.promise);remote.commissionConfigApi.binary.mockReturnValue(late.promise);p.app.accountBindingEpoch++;p.commission.bindAccount('user:1');await Vue.nextTick();expect(text(p.root)).not.toContain(expected);
});
test('Tree actual store keep marker survives normal runtime, true error never becomes readable unknown zero',async()=>{
 // Use the existing Vue directive with a style-capable test host.
 const original=Vue.vShow.beforeMount as Function;vi.spyOn(Vue.vShow as { beforeMount: (...args: any[]) => unknown },'beforeMount').mockImplementation(((el:any,...args:any[])=>{el.style={};return original(el,...args);}) as any);
 const p=await screen(treeSource);expect(text(p.root)).toContain('10 compute pts');const pending=deferred();remote.teamNetworkApi.snapshot.mockReturnValue(pending.promise);advanceRuntimeRevision();await flush();expect(p.net.hasRemoteSnapshot).toBe(true);expect(p.net.remoteStatus).toBe('loading');expect(text(p.root)).toContain('10 compute pts');expect(text(p.root)).not.toContain(en.network.projectionLoadingTitle);pending.reject(new Error('offline'));await flush();expect(text(p.root)).toContain(en.network.projectionErrorTitle);vi.restoreAllMocks();
});
