import * as Vue from 'vue';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import benefitsSource from './home-benefits.vue?raw';
import bannerSource from '../voucher-banner.vue?raw';
import upgradeSource from '../store/upgrade-spotlight.vue?raw';
import imageSource from '../catalog-machine-image.vue?raw';
import { useVoucher } from '@/store/voucher';
import * as catalog from '@/store/product-catalog';
import { advanceRuntimeRevision } from '@/api/order-api';
import { ApiError } from '@/api/errors';
import { voucherSupportsSurface } from '@/lib/voucher-sheet-authority';
import { voucherBenefitSummary } from '@/lib/voucher-benefit-summary';
import { fmt, fmtMoney } from '@/i18n/format';
import { auditUiCopy } from '@/i18n/audit-ui';
import { zh } from '@/i18n/messages/zh';
import * as machineImages from '../catalog-machine-image';

const api=vi.hoisted(()=>({remoteApiEnabled:true,voucherApi:{state:vi.fn(),claim:vi.fn(),popupSeen:vi.fn()},productCatalogApi:{catalog:vi.fn()}}));
const cache=vi.hoisted(()=>({cachedProductImage:vi.fn(async(url:string)=>url),invalidateProductImage:vi.fn(),productImageCacheKey:(url:string)=>url}));
vi.mock('@/api/runtime',()=>api);
vi.mock('@/lib/product-image-cache',()=>cache);
type Host={tag:string;text:string;props:Record<string,any>;parent:Host|null;children:Host[]};
const node=(tag:string,text=''):Host=>({tag,text,props:{},parent:null,children:[]});
const renderer=Vue.createRenderer<Host,Host>({createElement:tag=>node(tag),createText:text=>node('#text',text),createComment:()=>node('#comment'),setText:(n,t)=>{n.text=t;},setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,_old,v)=>{n.props[k]=v;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,insert:(n,p,a)=>{if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=p;const i=a?p.children.indexOf(a):-1;p.children.splice(i<0?p.children.length:i,0,n);},remove:n=>{if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);}});
const all=(n:Host):Host[]=>[n,...n.children.flatMap(all)],text=(n:Host):string=>n.text+n.children.map(text).join('');
const find=(n:Host,cls:string)=>all(n).find(x=>String(x.props.class??'').split(/\s+/).includes(cls));
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();await Vue.nextTick();};
function deferred(){let resolve!:(value:any)=>void,reject!:(cause:unknown)=>void;return{promise:new Promise((yes,no)=>{resolve=yes;reject=no;}),resolve,reject};}
function component(raw:string,deps:Record<string,unknown>):Vue.Component{
 const script=compileScript(parse(raw).descriptor,{id:'benefits-upgrade-warm',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text','image'].includes(tag)}}}).content;
 const exports:any={};new Function('require','exports',ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)((id:string)=>{if(!(id in deps))throw new Error(id);return deps[id];},exports);return exports.default;
}
const sfc=(value:Vue.Component)=>({default:value}),apps:Vue.App[]=[];let pinia:ReturnType<typeof createPinia>;
beforeEach(()=>{pinia=createPinia();setActivePinia(pinia);vi.clearAllMocks();api.voucherApi.state.mockResolvedValue({vouchers:[],source:'test'});catalog.prepareProductCatalog();});
afterEach(()=>{apps.splice(0).forEach(app=>app.unmount());disposePinia(pinia);});
function mount(value:Vue.Component){const root=node('root'),app=renderer.createApp(value);app.use(pinia);app.mount(root);apps.push(app);return root;}
function offer(id:string,surface='home'){return{id,name:id,type:'percent',percent:20,amountUSD:0,minPurchaseUSD:0,applicableSkus:[],audience:'all',startAt:0,endAt:0,claimSurfaces:[surface],popupEnabled:false,stackWithTrial:false,stackWithOthers:false,splittable:false,status:'active',definitionDeleted:false,grantId:null,grantStatus:'UNCLAIMED',usedOrderNo:null,claimable:true,audienceEligible:true,popupCadence:{enabled:false,delayMs:0,cooldownHours:0,maxPerSession:1,nextEligibleAt:0,popupEligible:false}};}
async function home(){
 const voucher=useVoucher();await flush();api.voucherApi.state.mockResolvedValueOnce({vouchers:[...Array.from({length:3},(_,i)=>offer(String(i))),offer('store-only','store')],source:'test'});voucher.bindAccount('user:7');await flush();
 const show=vi.fn(),navTo=vi.fn(),deps:Record<string,unknown>={vue:Vue,'@/store/voucher':{useVoucher:()=>voucher},'@/api/runtime':api,'@/store/voucher-claim-sheet':{useVoucherClaimSheet:()=>({show})},'@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/i18n/audit-ui':{useAuditUiCopy:()=>Vue.ref(auditUiCopy.zh)},'@/i18n/format':{fmt,fmtMoney},'@/lib/route':{navTo},'@/lib/voucher-benefit-summary':{voucherBenefitSummary},'@/lib/voucher-sheet-authority':{voucherSupportsSurface},'@/store/free-trial':{useFreeTrial:()=>({status:'ended'})},'@/store/trial-config':{useTrialConfig:()=>({config:{seatsLeftToday:0}})},'@/composables/use-trial-presentation':{useTrialPresentation:()=>({status:Vue.ref('ended')})},'@/components/ui/nx-section.vue':sfc({setup:(_,ctx)=>()=>Vue.h('section',ctx.slots.default?.())}),'@/components/trial-hero-banner.vue':sfc({render:()=>Vue.h('trial-card','Trial ended S1')})};
 deps['@/components/voucher-banner.vue']=sfc(component(bannerSource,deps));return{voucher,show,navTo,root:mount(component(benefitsSource,deps))};
}
it('actual Home two-card shell and 20%/3 voucher content survive live runtime invalidation, without granting claim authority',async()=>{
 const h=await home(),card=find(h.root,'vb-card')!,grid=find(h.root,'home-benefits__grid')!;expect(text(h.root)).toContain('20%');expect(text(h.root)).toContain('3');expect(find(h.root,'home-benefits__grid--single')).toBeUndefined();
 const pending=deferred();api.voucherApi.state.mockReturnValueOnce(pending.promise);advanceRuntimeRevision();await flush();expect(h.voucher.claimableVouchers).toEqual([]);expect(find(h.root,'vb-card')).toBe(card);expect(find(h.root,'home-benefits__grid')).toBe(grid);expect(find(h.root,'home-benefits__grid--single')).toBeUndefined();expect(text(h.root)).toContain('20%');expect(text(h.root)).toContain('3');
 find(h.root,'vb-card')!.props.onClick();expect(h.show).not.toHaveBeenCalled();expect(h.navTo).toHaveBeenCalledWith('/pages/me/rewards-list?cat=voucher');
 pending.reject(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:60_000}));await flush();expect(find(h.root,'vb-card')).toBe(card);expect(find(h.root,'home-benefits__grid--single')).toBeUndefined();
});
it.each([401,403])('a current voucher HTTP%s removes Home private voucher presentation while leaving Trial ended S1',async status=>{
 const h=await home();api.voucherApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status,message:'denied'}));await h.voucher.refreshRemote();await flush();expect(find(h.root,'vb-card')).toBeUndefined();expect(find(h.root,'home-benefits__grid--single')).toBeDefined();expect(text(h.root)).toContain('Trial ended S1');
});
it('a successful empty voucher publication removes only the voucher, and Store-only unclaimed offers never open a Home slot',async()=>{
 const h=await home();api.voucherApi.state.mockResolvedValueOnce({vouchers:[],source:'test'});await h.voucher.refreshRemote();await flush();expect(find(h.root,'vb-card')).toBeUndefined();expect(find(h.root,'home-benefits__grid--single')).toBeDefined();
 api.voucherApi.state.mockResolvedValueOnce({vouchers:[offer('store-only','store')],source:'test'});await h.voucher.refreshRemote();await flush();expect(find(h.root,'vb-card')).toBeUndefined();expect(find(h.root,'home-benefits__grid--single')).toBeDefined();
});
it('a voucher binding change clears the old Home offer immediately and rejects a late old read',async()=>{
 const h=await home(),old=deferred(),current=deferred();api.voucherApi.state.mockReturnValueOnce(old.promise);const previous=h.voucher.refreshRemote();api.voucherApi.state.mockReturnValueOnce(current.promise);h.voucher.bindAccount('user:8');await flush();expect(find(h.root,'vb-card')).toBeUndefined();expect(find(h.root,'home-benefits__grid--single')).toBeDefined();old.resolve({vouchers:[offer('old')],source:'test'});await previous;await flush();expect(find(h.root,'vb-card')).toBeUndefined();current.resolve({vouchers:[],source:'test'});await flush();expect(find(h.root,'vb-card')).toBeUndefined();
});
it('actual UpgradeSpotlight and image SFCs retain both decoded image nodes throughout a real catalog warm read and ordinary failure',async()=>{
 const snapshot={products:[{id:'stellarbox-s1',name:'S1',imageUrl:'https://public.example/s1',dailyEarn:1},{id:'stellarbox-pro',name:'Pro',imageUrl:'https://public.example/pro',dailyEarn:2}],source:'catalog',sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true,revision:'one'};
 api.productCatalogApi.catalog.mockResolvedValueOnce(snapshot);await catalog.refreshProductCatalog(true);
 const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1}),deps:Record<string,unknown>={vue:Vue,'@/store/app':{useApp:()=>app},'./catalog-machine-image':machineImages,'@/store/product-catalog':catalog,'@/i18n/audit-ui':{useAuditUiCopy:()=>Vue.ref(auditUiCopy.zh)},'@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/store/locale':{useLocaleStore:()=>({code:'zh'})},'@/i18n/format':{fmtMoney},'@/lib/brand-copy':{nexGridBrandText:(s:string)=>s},'@/lib/route':{navTo:vi.fn()},'@/components/ui/nx-button.vue':sfc({render:()=>null})};
 deps['@/components/catalog-machine-image']=machineImages;deps['@/components/catalog-machine-image.vue']=sfc(component(imageSource,deps));const Upgrade=component(upgradeSource,deps);
 const root=mount(Vue.defineComponent({setup:()=>()=>{const rows=catalog.productCatalogPresentation.value?.products;if(!rows)return null;return Vue.h(Upgrade,{base:{kind:'stellarbox-s1',name:'S1',baseRate:1},baseImageUrl:rows[0]?.imageUrl,target:rows[1]});}}));await flush();
 const images=all(root).filter(n=>n.tag==='image');expect(images).toHaveLength(2);images.forEach(n=>n.props.onLoad());await flush();expect(find(root,'upgrade-spotlight')!.props['data-images-ready']).toBe(true);const calls=cache.cachedProductImage.mock.calls.length;
 const pending=deferred();api.productCatalogApi.catalog.mockReturnValueOnce(pending.promise);const read=catalog.refreshProductCatalog(true);await flush();expect(all(root).filter(n=>n.tag==='image')[0]).toBe(images[0]);expect(all(root).filter(n=>n.tag==='image')[1]).toBe(images[1]);expect(find(root,'upgrade-spotlight')!.props['data-images-ready']).toBe(true);
 pending.resolve({...snapshot,revision:'two'});await read;await flush();expect(all(root).filter(n=>n.tag==='image')[0]).toBe(images[0]);expect(cache.cachedProductImage).toHaveBeenCalledTimes(calls);
 api.productCatalogApi.catalog.mockRejectedValueOnce(new Error('offline'));await catalog.refreshProductCatalog(true);await flush();expect(all(root).filter(n=>n.tag==='image')[1]).toBe(images[1]);expect(find(root,'upgrade-spotlight')!.props['data-images-ready']).toBe(true);
 const failedBase=images[0];failedBase.props.onError();await flush();expect(find(root,'upgrade-spotlight')!.props['data-images-ready']).toBe(false);
 const retry=deferred();api.productCatalogApi.catalog.mockReturnValueOnce(retry.promise);const retryRead=catalog.refreshProductCatalog(true);await flush();retry.resolve({...snapshot,revision:'three'});await retryRead;await flush();const recoveredBase=all(root).find(n=>n.tag==='image'&&n.props.src==='https://public.example/s1')!;expect(recoveredBase).toBeDefined();expect(recoveredBase).not.toBe(failedBase);expect(all(root).find(n=>n.tag==='image'&&n.props.src==='https://public.example/pro')).toBe(images[1]);recoveredBase.props.onLoad();await flush();expect(find(root,'upgrade-spotlight')!.props['data-images-ready']).toBe(true);failedBase.props.onError();failedBase.props.onLoad();await flush();expect(find(root,'upgrade-spotlight')!.props['data-images-ready']).toBe(true);
 api.productCatalogApi.catalog.mockRejectedValueOnce(new ApiError({kind:'http',status:403,message:'denied'}));await catalog.refreshProductCatalog(true);await flush();expect(all(root).filter(n=>n.tag==='image')).toHaveLength(0);
});
