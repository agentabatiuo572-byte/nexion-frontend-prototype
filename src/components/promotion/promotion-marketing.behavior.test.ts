import * as Vue from 'vue';
import { compileScript,parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach,expect,it,vi } from 'vitest';
import entrySource from './promotion-entry.vue?raw';
import buttonSource from '@/components/ui/nx-button.vue?raw';
import productSource from './promotion-product.vue?raw';
import bundleSource from './promotion-bundle.vue?raw';
import contextSource from '@/composables/use-promotion-context.ts?raw';
import storeSource from '@/pages/store/store.vue?raw';
import detailSource from '@/pages/store/detail.vue?raw';
import type { PublicPromotion,PublicPromotionPage } from '@/api/promotion-contracts';
import { promotionZH,promotionEN,promotionVI } from '@/i18n/messages/promotion';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { platformDisplayText } from "@/lib/brand-copy";
import { formatAmount } from '@/lib/amount-display';
import * as entry from '@/lib/promotion-entry';
import { commerceCopy } from '@/lib/commerce-review';
import * as display from '@/lib/promotion-display';

const code=(source:string)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const script=(source:string)=>code(compileScript(parse(source).descriptor,{id:'promotion-marketing'}).content);
const empty={render:()=>null};
function evaluate(source:string,modules:Record<string,unknown>){
  const exports:Record<string,any>={};
  new Function('require','exports',source)((id:string)=>{
    if(id==='@/composables/use-tab-page-lifecycle')id='@dcloudio/uni-app';
    if(id in modules)return modules[id];
    if(id.endsWith('.vue'))return{default:empty};
    throw new Error('Unexpected marketing dependency '+id);
  },exports);
  return exports;
}
const button=evaluate(code(compileScript(parse(buttonSource).descriptor,{id:'marketing-button',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text'].includes(tag)}}}).content),{vue:Vue}).default;
const cleanups:Array<()=>void>=[];
afterEach(()=>cleanups.splice(0).forEach(cleanup=>cleanup()));
const flush=async()=>{await Promise.resolve();await Vue.nextTick();await Promise.resolve();};
function deferred<T>(){let resolve!:(result:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const activity=(extra:Partial<PublicPromotion>={}):PublicPromotion=>({activityId:'a1',version:2,template:'SKU_GIFT',state:'ACTIVE',startsAt:'2026-10-07T00:00:00Z',endsAt:'2026-10-30T00:00:00Z',serverTime:'2026-10-08T00:00:00Z',title:{zh:'真实活动',en:'Live offer',vi:'Ưu đãi đang mở'},terms:{zh:'真实条件',en:'Live terms',vi:'Điều khoản'},placement:'home.purchase-promotion',target:'STORE',productNos:['sku'],minimumClientCapabilities:[],eligibility:'ESTIMATE_ELIGIBLE',eligibilityMessage:null,rewardRules:[],...extra});
const page=(items:PublicPromotion[]):PublicPromotionPage=>({items,nextCursor:null,hasMore:false});
function platform(){
  const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1}),locale=Vue.reactive({code:'zh'});
  const shown:Array<()=>void>=[],hidden:Array<()=>void>=[],mounted:Array<()=>void>=[];
  const modules:Record<string,unknown>={
    '@/lib/brand-copy':{platformDisplayText},
    '@/lib/amount-display':{formatAmount},
    '@/lib/commerce-review':{commerceCopy},
    vue:{...Vue,onMounted:(fn:()=>void)=>mounted.push(fn),onBeforeUnmount:()=>{}},
    '@dcloudio/uni-app':{onShow:(fn:()=>void)=>shown.push(fn),onHide:(fn:()=>void)=>hidden.push(fn)},
    '@/store/app':{useApp:()=>app},'@/store/locale':{useLocaleStore:()=>locale},
    '@/lib/promotion-entry':entry,'@/lib/promotion-display':display,
    '@/i18n/format':{fmt},
  };
  const scope=Vue.effectScope();cleanups.push(()=>{hidden.forEach(fn=>fn());scope.stop();});
  return{app,locale,modules,scope,start:()=>mounted.forEach(fn=>fn()),show:()=>shown.forEach(fn=>fn()),hide:()=>hidden.forEach(fn=>fn())};
}
function context(){
  const screen=platform(),get=vi.fn<(...args:unknown[])=>Promise<PublicPromotion>>();
  screen.modules['@/api/runtime']={promotionApi:{get},remoteApiEnabled:true,sessionVault:{read:()=>({user:{userId:7}})}};
  const id=Vue.ref('a1'),create=evaluate(code(contextSource),screen.modules).usePromotionContext;
  const view=screen.scope.run(()=>create(id)) as{activity:Vue.Ref<PublicPromotion|null>;status:Vue.Ref<string>;available:Vue.ComputedRef<boolean>;refresh:()=>Promise<void>};
  return{...screen,get,id,view};
}
function renderer(source:string,context:Record<string,unknown>){
  const template=source.includes('<template>')?parse(source).descriptor.template!.content:source;
  const render=new Function('Vue',compile(template,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>['view','text','image'].includes(tag)}).code)(Vue);
  let node!:Vue.VNode;
  return{node:()=>node,html:()=>renderToString(Vue.createSSRApp({components:{NxButton:button,TeamArt:empty,LiquidGlass:empty,PromotionTerms:empty,PromotionProduct:empty,RewardRows:empty,DisclosureDetails:empty},render:()=>{node=render(Vue.proxyRefs(context),[]);return node;}}))};
}
function find(node:Vue.VNode,className:string):Vue.VNode|undefined{
  if(String(node.props?.class??'').split(/\s+/).includes(className))return node;
  if(Array.isArray(node.children))for(const child of node.children)if(Vue.isVNode(child)){const match=find(child,className);if(match)return match;}
}
function advert(activities?:PublicPromotion[],copy=promotionZH){
  const screen=platform(),list=vi.fn<(...args:unknown[])=>Promise<PublicPromotionPage>>().mockResolvedValue(page([])),navTo=vi.fn();
  Object.assign(screen.modules,{
    '@/api/runtime':{apiRuntimeConfig:{baseUrl:'https://api.example.test/'},promotionApi:{list},remoteApiEnabled:true,sessionVault:{read:()=>({user:{userId:7}})}},
    '@/i18n/use-t':{useT:()=>Vue.ref({promotion:copy})},'@/mock/products':{getProduct:()=>({name:'Actual device'})},
    '@/store/product-catalog':{productCatalogState:Vue.reactive({status:'ready'})},'@/lib/route':{navTo},
  });
  const props=Vue.reactive({mode:'home',active:true,activities}),component=evaluate(script(entrySource),screen.modules).default;
  const view=screen.scope.run(()=>component.setup(props,{expose(){}}))!;
  return{...screen,props,view,list,navTo,...renderer(entrySource,{...Vue.toRefs(props),...view})};
}

function purchaseRule(type:'DEVICE'|'DISCOUNT_USDT'|'NEX'):PublicPromotion['rewardRules'][number]{
  const disclosure={title:{zh:'活动奖励',en:'Offer reward',vi:'Thưởng ưu đãi'},terms:{zh:'满足条件',en:'Conditions apply',vi:'Theo điều kiện'},refundTerms:{zh:'退款撤回',en:'Reversed on refund',vi:'Thu hồi khi hoàn tiền'},benefitDescription:{zh:'',en:'',vi:''},deviceRights:null,deviceName:type==='DEVICE'?'Actual gift device':null};
  const common={rewardRuleId:'reward',beneficiaryRole:'BUYER' as const,disclosure};
  return {ruleId:'rule',productNo:'sku',minBuyQty:2,repeatMode:'PER_GROUP',maxGroups:{mode:'LIMITED',value:3},maxGroupsPerPerson:{mode:'LIMITED',value:4},inviterReward:null,buyerReward:type==='DEVICE'?{...common,type,giftProductNo:'gift',quantity:1}:{...common,type,calculation:'FIXED',amount:'50'}};
}

it.each([['DEVICE','gift','Actual gift device × 1'],['DISCOUNT_USDT','coupon','50.00 USDT'],['NEX','spark','50.00 UVT']] as const)('renders %s from published rewards without inventing claim or completion state',async(type,kind,benefit)=>{
  const offer=activity({rewardRules:[purchaseRule(type)]}),screen=advert([offer]);screen.props.mode='events';
  const html=await screen.html();expect(html).toContain(`data-activity-kind="${kind}"`);expect(html).toContain(benefit);
  expect(html).toContain('nx-button--secondary');expect(html).not.toContain('nx-button--primary');
  expect(html).not.toContain('role="progressbar"');expect(html).not.toContain(promotionZH.rewardGranted);
  find(screen.node(),'entry-cta')!.props!.onClick();expect(screen.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/store?activityId=a1');
  find(find(screen.node(),'entry-event-actions')!,'promotion-link')!.props!.onClick();
  expect(screen.view.termsActivity.value.activityId).toBe('a1');
  expect(screen.view.termsRules.value.map((rule:{text:string})=>rule.text).join(' ')).toContain(fmt(promotionZH.orderRewardLimit,{n:3}));
  expect(screen.view.termsRules.value.map((rule:{text:string})=>rule.text).join(' ')).toContain(fmt(promotionZH.personRewardLimit,{n:4}));
});

it('does not assign a gift or milestone to an offer with no published rewards',async()=>{
  const screen=advert([activity({template:'FIRST_PURCHASE'})]);screen.props.mode='events';
  expect(await screen.html()).toContain('data-activity-kind="plain"');
  expect(find(screen.node(),'entry-event-art')).toBeUndefined();
  expect(find(screen.node(),'entry-benefits')).toBeUndefined();
});

it.each([promotionZH,promotionEN,promotionVI])('keeps ineligibility and the full refund disclosures reachable with compact event copy',async copy=>{
  const offer=activity({rewardRules:[purchaseRule('DISCOUNT_USDT')],eligibility:'INELIGIBLE',eligibilityMessage:{zh:'暂不符合活动条件',en:'Not eligible',vi:'Chưa đủ điều kiện'}}),screen=advert([offer],copy);screen.props.mode='events';
  expect(await screen.html()).toContain('暂不符合活动条件');
  find(find(screen.node(),'entry-event-actions')!,'promotion-link')!.props!.onClick();
  expect(entry.promotionDisclosures(screen.view.termsActivity.value)[0].refundTerms.zh).toBe('退款撤回');
  expect(screen.view.termsRules.value.map((rule:{text:string})=>rule.text).join(' ')).toContain(copy.orderDiscount);
});

it('event pagination deduplicates records and the retry resets the cursor after failure',async()=>{
  const screen=advert();screen.props.mode='events';screen.list.mockResolvedValueOnce({items:[activity()],nextCursor:'page-2',hasMore:true});
  await screen.view.load(true);expect(screen.view.hasMore.value).toBe(true);
  screen.list.mockResolvedValueOnce({items:[activity(),activity({activityId:'a2'})],nextCursor:'page-3',hasMore:true});
  await screen.view.load(false);expect(screen.list).toHaveBeenLastCalledWith({limit:20,cursor:'page-2'},true);
  expect(screen.view.items.value.map((row:PublicPromotion)=>row.activityId)).toEqual(['a1','a2']);
  screen.list.mockRejectedValueOnce(new Error('offline'));await screen.view.load(false);
  expect(screen.view.status.value).toBe('error');expect(await screen.html()).toContain(promotionZH.retry);
  screen.list.mockResolvedValueOnce(page([activity({activityId:'recovered'})]));
  find(screen.node(),'entry-cta')!.props!.onClick();await flush();
  expect(screen.list).toHaveBeenLastCalledWith({limit:20,cursor:null},true);
  expect(screen.view.items.value[0].activityId).toBe('recovered');expect(screen.view.status.value).toBe('ready');
});

it.each(['DRAFT','SCHEDULED','PAUSED','ENDED','ARCHIVED'] as const)('the shared read removes %s marketing without hiding active personal-ineligible offers',async state=>{
  const screen=context();screen.get.mockResolvedValueOnce(activity({eligibility:'INELIGIBLE'}));await screen.view.refresh();
  expect(screen.view.activity.value?.state).toBe('ACTIVE');expect(screen.view.available.value).toBe(false);
  screen.get.mockResolvedValueOnce(activity({state}));await screen.view.refresh();
  expect(screen.view.status.value).toBe('ready');expect(screen.view.activity.value).toBeNull();
});
it('refresh clears the old activity immediately and failure cannot keep its marketing',async()=>{
  const screen=context();screen.get.mockResolvedValueOnce(activity());await screen.view.refresh();
  const next=deferred<PublicPromotion>();screen.get.mockReturnValueOnce(next.promise);const read=screen.view.refresh();
  expect(screen.view.activity.value).toBeNull();expect(screen.view.available.value).toBe(false);
  next.reject(new Error('unavailable'));await read;expect(screen.view.activity.value).toBeNull();expect(screen.view.status.value).toBe('error');
});
it.each(['account','locale','hide'] as const)('a late detail response cannot restore marketing after %s',async boundary=>{
  const screen=context(),old=deferred<PublicPromotion>();screen.get.mockReturnValueOnce(old.promise);const read=screen.view.refresh();
  screen.get.mockResolvedValue(activity({state:'PAUSED'}));
  if(boundary==='account')screen.app.accountKey='user:8';else if(boundary==='locale')screen.locale.code='en';else screen.hide();
  await flush();old.resolve(activity());await read;
  expect(screen.view.activity.value).toBeNull();
  if(boundary==='hide'){screen.get.mockResolvedValueOnce(activity());screen.show();await flush();expect(screen.view.activity.value?.state).toBe('ACTIVE');screen.hide();expect(screen.view.activity.value).toBeNull();}
});
it('both supplied and independently fetched adverts require ACTIVE, independent of personal eligibility',async()=>{
  const screen=advert([activity({eligibility:'INELIGIBLE'}),activity({activityId:'closed',state:'PAUSED'})]);
  expect(screen.view.items.value.map((row:PublicPromotion)=>row.activityId)).toEqual(['a1']);
  expect(await screen.html()).toContain('data-activity-id="a1"');
  const own=advert();own.list.mockResolvedValueOnce(page([activity(),activity({activityId:'closed',state:'ENDED'})]));await own.view.load(true);
  expect(own.view.items.value.map((row:PublicPromotion)=>row.activityId)).toEqual(['a1']);
  const late=deferred<PublicPromotionPage>();own.list.mockReturnValueOnce(late.promise);const read=own.view.load(true);
  expect(own.view.items.value).toEqual([]);own.hide();late.resolve(page([activity()]));await read;expect(own.view.items.value).toEqual([]);
  own.list.mockRejectedValueOnce(new Error('unavailable'));own.show();await flush();expect(own.view.items.value).toEqual([]);expect(own.view.status.value).toBe('error');
});
it.each(['account','locale'] as const)('an independent advert clears marketing and fences the old read across %s',async boundary=>{
  const screen=advert();screen.list.mockResolvedValueOnce(page([activity()]));await screen.view.load(true);
  const old=deferred<PublicPromotionPage>();screen.list.mockReturnValueOnce(old.promise);const read=screen.view.load(true);
  screen.list.mockResolvedValueOnce(page([activity({state:'PAUSED'})]));
  if(boundary==='account')screen.app.accountKey='user:8';else screen.locale.code='en';
  await flush();old.resolve(page([activity()]));await read;
  expect(screen.view.items.value).toEqual([]);expect(screen.view.status.value).toBe('ready');
});
it.each([promotionZH,promotionEN,promotionVI])('the complete uploaded image replaces fallback copy while retaining a localized whole-banner action',async copy=>{
  const screen=advert([activity({bannerImageUrl:'/api/promotions/a1/banner/2'})],copy);
  expect(await screen.html()).toContain(copy.browse);
  const image=find(screen.node(),'entry-artwork')!;expect(image.props).toMatchObject({src:'https://api.example.test/api/promotions/a1/banner/2',mode:'aspectFit'});
  image.props!.onLoad();const loaded=await screen.html();
  expect(loaded).not.toContain('class="entry-copy"');expect(loaded).not.toContain('class="entry-label"');
  const action=find(screen.node(),'entry-advert-target')!;expect(action.props).toMatchObject({role:'button',tabindex:0,'aria-label':'真实活动 · '+copy.browse});
  action.props!.onClick();expect(screen.navTo).toHaveBeenCalledWith('/pages/store/store?activityId=a1');
  screen.props.active=false;await screen.html();expect(find(screen.node(),'entry-advert-target')?.props?.tabindex).toBe(-1);
  screen.props.active=true;await screen.html();find(screen.node(),'entry-artwork')!.props!.onError();
  const failed=await screen.html();expect(failed).toContain('class="entry-copy"');expect(failed).toContain(copy.browse);expect(failed).not.toContain('entry-artwork');expect(failed).not.toContain('purchase-gift-reference');
});
it('fallback uses the whole existing banner width and has no fixed artwork dependency',()=>{
  const styles=parse(entrySource).descriptor.styles.find(style=>style.scoped)!.content;
  expect(styles).not.toContain('purchase-gift-reference');expect(styles).not.toContain('44%');expect(styles).not.toContain('45%');
});
it('a carousel rerender preserves a loaded banner while a closed activity still disappears',async()=>{
  const offer=activity({bannerImageUrl:'/api/promotions/a1/banner/2'}),screen=advert([offer]);
  await screen.html();find(screen.node(),'entry-artwork')!.props!.onLoad();await screen.html();
  const imageKey=find(screen.node(),'entry-artwork')!.key;
  screen.props.activities=[{...offer}];screen.props.active=false;await flush();
  expect(await screen.html()).not.toContain('class="entry-copy"');
  expect(find(screen.node(),'entry-artwork')!.key).toBe(imageKey);
  screen.props.active=true;screen.props.activities=[{...offer}];await flush();
  expect(await screen.html()).not.toContain('class="entry-copy"');
  screen.props.activities=[{...offer,state:'PAUSED'}];await flush();
  expect(await screen.html()).not.toContain('entry-artwork');expect(screen.view.items.value).toEqual([]);
});
it.each(['account','epoch','locale'] as const)('a supplied banner remounts and reloads after the %s boundary',async boundary=>{
  const offer=activity({bannerImageUrl:'/api/promotions/a1/banner/2'}),screen=advert([offer]);
  await screen.html();find(screen.node(),'entry-artwork')!.props!.onLoad();await screen.html();
  const imageKey=find(screen.node(),'entry-artwork')!.key;
  if(boundary==='account')screen.app.accountKey='user:8';else if(boundary==='epoch')screen.app.accountBindingEpoch++;else screen.locale.code='en';
  await flush();expect(await screen.html()).toContain('class="entry-copy"');
  const image=find(screen.node(),'entry-artwork')!;expect(image.key).not.toBe(imageKey);
  image.props!.onLoad();expect(await screen.html()).not.toContain('class="entry-copy"');
});
it('the production bundle clears quote rewards and open terms synchronously when activity is cleared for a new read',()=>{
  const screen=platform(),current=Vue.ref<PublicPromotion|null>(activity());
  Object.assign(screen.modules,{
    '@/api/runtime':{promotionApi:{quote:vi.fn()},sessionVault:{read:()=>({user:{userId:7}})}},
    '@/i18n/use-t':{useT:()=>Vue.ref({promotion:promotionZH})},
    '@/store/product-catalog':{productCatalogState:Vue.reactive({status:'ready'}),productCatalogPresentation:Vue.ref({products:[]}),refreshProductCatalog:vi.fn()},
    '@/composables/use-product-phase':{useProductPhase:()=>Vue.ref('P1')},'@/store/product-availability':{isProductAvailable:()=>true},
    '@/composables/use-promotion-context':{usePromotionContext:()=>({activity:current,status:Vue.ref('ready'),available:Vue.ref(true),refresh:vi.fn()})},
    '@/store/account-scoped-storage':{readAccountRow:()=>null,writeAccountRow:vi.fn()},'@/lib/product-image':{catalogProductImageUrl:()=>null},'@/lib/route':{navTo:vi.fn()},
  });
  const component=evaluate(script(bundleSource),screen.modules).default;
  const view=screen.scope.run(()=>component.setup({activityId:'a1',initialItems:[]},{expose(){}}))!;
  view.quote.value={expectedRewards:[{rewardRuleId:'old-reward'}]};view.quoteStatus.value='ready';view.termsOpen.value=true;
  current.value=null;
  expect(view.quote.value).toBeNull();expect(view.quoteStatus.value).toBe('idle');expect(view.termsOpen.value).toBe(false);
});
it.each([zh,en,vietnamese])('bundle catalog recovery hides internal IDs and names the add action',async copy=>{
  const screen=platform(),products=Vue.ref({products:[] as Array<{id:string;name:string;productType:string}>}),status=Vue.reactive({status:'error'}),internalId='private-product-id';
  Object.assign(screen.modules,{
    '@/api/runtime':{promotionApi:{quote:vi.fn()},sessionVault:{read:()=>({user:{userId:7}})}},
    '@/i18n/use-t':{useT:()=>Vue.ref(copy)},
    '@/store/product-catalog':{productCatalogState:status,productCatalogPresentation:products,refreshProductCatalog:vi.fn()},
    '@/composables/use-product-phase':{useProductPhase:()=>Vue.ref('P1')},'@/store/product-availability':{isProductAvailable:()=>true},
    '@/composables/use-promotion-context':{usePromotionContext:()=>({activity:Vue.ref(activity({productNos:[internalId,'second']})),status:Vue.ref('ready'),available:Vue.ref(true),refresh:vi.fn()})},
    '@/store/account-scoped-storage':{readAccountRow:()=>null,writeAccountRow:vi.fn()},'@/lib/product-image':{catalogProductImageUrl:()=>null},'@/lib/route':{navTo:vi.fn()},
  });
  const component=evaluate(script(bundleSource),screen.modules).default;
  const view=screen.scope.run(()=>component.setup({activityId:'a1',initialItems:[{productNo:internalId,quantity:1}]},{expose(){}}))!;
  const rendered=renderer(bundleSource,view),failed=await rendered.html();
  expect(failed).not.toContain(internalId);expect(failed).toContain(copy.uiChrome.unavailable);
  products.value.products=[{id:internalId,name:'First device',productType:'DEVICE'},{id:'second',name:'Second $& device',productType:'DEVICE'}];status.status='ready';
  expect(await rendered.html()).toContain('First device');
  const add=find(rendered.node(),'bundle-add')!;expect(add.props!['aria-label']).toBe(fmt(copy.uiChrome.addItem,{name:'Second $& device'}));
  add.props!.onClick();expect(view.selection.value).toEqual([{productNo:internalId,quantity:1},{productNo:'second',quantity:1}]);
});
it.each(['PAUSED','ENDED'] as const)('direct product promotion props suppress reward content for %s',async state=>{
  const screen=platform();Object.assign(screen.modules,{'@/i18n/use-t':{useT:()=>Vue.ref({promotion:promotionZH})},'@/mock/products':{getProduct:()=>({name:'Actual device'})}});
  const component=evaluate(script(productSource),screen.modules).default;
  const props=Vue.reactive({activity:activity({state,rewardRules:[{ruleId:'r',productNo:'sku'} as never]}),productNo:'sku'});
  const view=screen.scope.run(()=>component.setup(props,{expose(){}}))!;
  expect(await renderer(productSource,view).html()).not.toContain('promotion-product');
});
it.each([promotionZH,promotionEN,promotionVI])('old store, detail and bundle links expose only status and an ordinary-product exit',async copy=>{
  const context={activityId:'a1',scopeId:'a1',activity:null,voucherContext:{},promotionStatus:'ready',contextStatus:'ready',publicOnly:true,t:{promotion:copy},locale:{code:'zh'},localized:display.localized,clearPromotion:vi.fn(),clearScope:vi.fn(),navTo:vi.fn(),promotionStoreHref:entry.promotionStoreHref};
  const store=storeSource.slice(storeSource.indexOf('<view v-if="activityId"'),storeSource.indexOf('<template v-else-if="!publicOnly">'));
  const detail=detailSource.slice(detailSource.indexOf('<view v-if="publicOnly"'),detailSource.indexOf('<view v-else-if="catalogStatus'));
  for(const source of [store,detail,bundleSource]){
    const html=await renderer(source,context).html();expect(html).toContain(copy.disabled);expect(html).toContain(copy.allProducts);
    for(const hidden of [copy.activityProducts,copy.gift,copy.bundle,copy.expected,copy.signIn])expect(html).not.toContain('>'+hidden+'<');
  }
});
