import { platformDisplayText } from "@/lib/brand-copy";
import { formatAmount } from "@/lib/amount-display";
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';
import rewardRowsSource from './reward-rows.vue?raw';
import orderRewardsSource from './order-rewards.vue?raw';
import rewardDetailSource from '@/pages/events/promotion-reward-detail.vue?raw';
import checkoutSource from './promotion-checkout.vue?raw';
import termsSource from './promotion-terms.vue?raw';
import sheetSource from '@/components/ui/nx-sheet.vue?raw';
import entrySource from './promotion-entry.vue?raw';
import { promotionZH, promotionEN, promotionVI } from '@/i18n/messages/promotion';
import { localized, rewardSummary, rewardStateKey } from '@/lib/promotion-display';

let promotionCopy=promotionZH;
afterEach(()=>{promotionCopy=promotionZH;});

const descriptor=parse(rewardRowsSource,{filename:'reward-rows.vue'}).descriptor;
const script=compileScript(descriptor,{id:'reward-rows-behavior',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text'].includes(tag)}}});
const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const dependencies:Record<string,unknown>={
    "@/lib/brand-copy": { platformDisplayText },
    "@/lib/amount-display": { formatAmount },
  vue:Vue,
  '@/i18n/use-t':{useT:()=>Vue.ref({promotion:promotionCopy})},
  '@/store/locale':{useLocaleStore:()=>({code:'zh'})},
  '@/mock/products':{getProduct:(id:string)=>({name:({'sku-a':'Device Alpha','sku-b':'Device Beta'} as Record<string,string>)[id]??'Actual gift'})},
  '@/store/product-catalog':{productCatalogState:Vue.reactive({status:'ready'})},
  '@/lib/promotion-display':{localized,rewardSummary,rewardStateKey},
  '@/lib/route':{navTo:()=>Promise.resolve(true)},
};
const componentExports={default:{} as Vue.Component};
new Function('require','exports',code)((id:string)=>{if(!(id in dependencies))throw new Error('Unexpected import '+id);return dependencies[id];},componentExports);
const reward={obligationId:'reward-1',reward:{rewardRuleId:'r1',type:'USDT',amount:'3.000000',beneficiaryRole:'BUYER'},state:'ISSUED',refundHold:false};
const discount={lineId:'900101',rewardRuleId:'discount',groups:1,reward:{rewardRuleId:'discount',type:'DISCOUNT_USDT',amount:'500.000000',calculation:'FIXED',beneficiaryRole:'BUYER'},disclosure:{deviceName:null}};

it.each([promotionZH,promotionEN,promotionVI])('discount rows use localized deduction terms without an issuance promise',async copy=>{
  promotionCopy=copy;
  for(const props of [{expected:[discount]},{specs:[{...discount.reward,disclosure:discount.disclosure}]}]){
    const html=await renderToString(Vue.createSSRApp(componentExports.default,props));
    expect(html).toContain(copy.orderDiscount+' · 500.00 USDT');expect(html).toContain(copy.orderDiscountNote);
    expect(html).not.toContain('DISCOUNT_USDT');expect(html).not.toContain(copy.settle);expect(html).not.toContain(copy.rewardPending);expect(html).not.toContain(copy.rewardGranted);
  }
});

it.each([promotionZH,promotionEN,promotionVI])('personal rewards opt into masking while public rules and detail-page defaults stay readable', async copy => {
  promotionCopy = copy;
  const personal = { ...reward, reward: { ...reward.reward, amount: '123.450000' } };
  const props = { rewards: [personal], valueMask: '••••' };
  const hidden = await renderToString(Vue.createSSRApp(componentExports.default, props));
  expect(hidden).toContain('••••');
  expect(hidden).not.toContain('123.45');
  expect(hidden).toContain(copy.rewardGranted);
  expect(hidden).toContain(copy['reward-detail']);
  expect(personal.reward.amount).toBe('123.450000');
  const details = await renderToString(Vue.createSSRApp(componentExports.default, { rewards: [personal] }));
  expect(details).toContain('123.45 USDT');
  const rules = await renderToString(Vue.createSSRApp(componentExports.default, { specs: [{ ...reward.reward, type: 'NEX', amount: '10.000000' }] }));
  expect(rules).toContain('10.00 UVT');
  expect(rules).not.toContain('••••');
});

it('opted-in reward rows also replace actual purchased quantities while retaining their product and reward-detail entry', async () => {
  const props = { valueMask: '••••', lines: [{ lineId: 'line-a', productNo: 'sku-a', quantity: 67 }],
    rewards: [{ ...reward, orderLineId: 'line-a' }] };
  const html = await renderToString(Vue.createSSRApp(componentExports.default, props));
  expect(html.replace(/<!--.*?-->/g, '')).toContain('Device Alpha × ••••');
  expect(html).not.toContain('× 67');
  expect(html).not.toContain('3.00 USDT');
  expect(html).toContain(promotionZH['reward-detail']);
});

it('home advert copy keeps AA contrast against captured light background samples',()=>{
  const styles=parse(entrySource).descriptor.styles.find(style=>style.scoped)!.content;
  const rule=styles.match(/\.entry-advert\s+\.promotion-copy\s*\{([^}]*)\}/)![1];
  const token=rule.match(/color:\s*var\((--[\w-]+)\)/)?.[1];
  expect(token).toBeDefined();
  const tokenPath=decodeURIComponent(new URL('../../styles/tokens.css',import.meta.url).pathname).replace(/^\/([a-z]:\/)/i,'$1');
  const tokenSource=ts.sys.readFile(tokenPath);
  if(tokenSource===undefined)throw new Error(`Promotion contrast tokens not readable: ${tokenPath}`);
  const light=tokenSource.match(/:root\s*\{([^}]*)\}/)![1];
  const color=light.match(new RegExp(`${token}:\\s*(#[\\da-f]{6})`,'i'))?.[1];
  expect(color).toBeDefined();
  const luminance=(hex:string)=>hex.slice(1).match(/../g)!.map(channel=>{
    const value=parseInt(channel,16)/255;
    return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;
  }).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
  // Captured en/light320 home advert background samples.
  for(const background of ['#D8DCE9','#C5CFE9','#BDC9E9']){
    const foreground=luminance(color!),backdrop=luminance(background);
    expect((Math.max(foreground,backdrop)+0.05)/(Math.min(foreground,backdrop)+0.05)).toBeGreaterThanOrEqual(4.5);
  }
});

it('the compiled Vue Boolean prop defaults to a usable reward details link',async()=>{
  const html=await renderToString(Vue.createSSRApp(componentExports.default,{rewards:[reward]}));
  expect(html).toContain('奖励详情');expect(html).toContain('已到账');
});
it('an explicit false suppresses the self-link on the reward detail page only',async()=>{
  const html=await renderToString(Vue.createSSRApp(componentExports.default,{rewards:[reward],linkDetails:false}));
  expect(html).not.toContain('奖励详情');expect(html).toContain('已到账');
});
it('final recovery and cancellation remain visible when a historical refund hold remains recorded',async()=>{
  for(const [state,label] of [['REVERSED',promotionZH.reversed],['CANCELLED',promotionZH.rewardCancelled]]){
    const html=await renderToString(Vue.createSSRApp(componentExports.default,{rewards:[{...reward,state,refundHold:true}]}));
    expect(html).toContain(label);expect(html).not.toContain(promotionZH.rewardHold);
  }
  const held=await renderToString(Vue.createSSRApp(componentExports.default,{rewards:[{...reward,state:'ISSUED',refundHold:true}]}));
  expect(held).toContain(promotionZH.rewardHold);
});

it('two canonical order-line IDs keep purchase quantities and rewards paired regardless of array order',async()=>{
  const props={lines:[{lineId:'900101',productNo:'sku-a',quantity:2},{lineId:'900102',productNo:'sku-b',quantity:3}],rewards:[
    {...reward,obligationId:'reward-beta',orderLineId:'900102',reward:{...reward.reward,type:'NEX',amount:'7.000000'}},
    {...reward,obligationId:'reward-alpha',orderLineId:'900101',reward:{...reward.reward,type:'USDT',amount:'5.000000'}},
  ]};
  const html=await renderToString(Vue.createSSRApp(componentExports.default,props));
  const rows=html.replace(/<!--.*?-->/g,'').split('class="promotion-row"').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toContain('Device Beta × 3');expect(rows[0]).toContain('7.00 UVT');expect(rows[0]).not.toContain('Device Alpha');
  expect(rows[1]).toContain('Device Alpha × 2');expect(rows[1]).toContain('5.00 USDT');expect(rows[1]).not.toContain('Device Beta');
});
it('uses immutable names even when a gift is hidden from the current shop catalogue',async()=>{
  const html=await renderToString(Vue.createSSRApp(componentExports.default,{lines:[{lineId:'756',productNo:'sku-a',productName:'Original purchase name',quantity:1}],rewards:[{...reward,orderLineId:'756',reward:{rewardRuleId:'gift',type:'DEVICE',giftProductNo:'hidden-sku',quantity:1,beneficiaryRole:'BUYER'},disclosure:{deviceName:'Frozen hidden gift'}}]}));
  expect(html).toContain('Original purchase name');expect(html).toContain('Frozen hidden gift × 1');expect(html).not.toContain('Device Alpha');expect(html).not.toContain('Actual gift');
});

const orderTemplate=parse(orderRewardsSource).descriptor.template!.content;
const orderRender=new Function('Vue',compile(orderTemplate,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>['view','text'].includes(tag)}).code)(Vue);
async function orderHtml(error:boolean,loading=false){
  return renderToString(Vue.createSSRApp({components:{RewardRows:componentExports.default,PromotionAction:{render:()=>Vue.h('view')}},render:orderRender,setup:()=>({error,loading,receipt:null,rewards:[],orderNo:'original-order',t:{promotion:promotionZH},load:()=>{},navTo:()=>{},resume:()=>{}})}));
}
it('first-load double failure leaves a visible order reward error and retry',async()=>{
  const html=await orderHtml(true);expect(html).toContain(promotionZH.error);expect(html).toContain(promotionZH.refresh);
});
it('loading has status feedback while a confirmed ordinary order does not claim rewards',async()=>{
  expect(await orderHtml(false,true)).toContain(promotionZH.loading);expect(await orderHtml(false)).not.toContain(promotionZH.orderRewards);
});
it('paid order details retain the discount beside issued rewards and omit a wallet-reward link for discount-only orders',async()=>{
  const html=async(rewards:unknown[])=>renderToString(Vue.createSSRApp({components:{RewardRows:componentExports.default,PromotionAction:{render:()=>Vue.h('view')}},render:orderRender,setup:()=>({error:false,loading:false,receipt:{promotionQuoteId:'q1',paymentStatus:'PAID',items:[],rewards:[discount]},rewards,orderNo:'o1',t:{promotion:promotionZH},load:()=>{},navTo:()=>{},resume:()=>{}})}));
  const only=await html([]);expect(only).toContain('订单立减 · 500.00 USDT');expect(only).not.toContain(promotionZH.rewards);expect(only).not.toContain(promotionZH.settle);
  const mixed=await html([reward]);expect(mixed).toContain('订单立减 · 500.00 USDT');expect(mixed).toContain('3.00 USDT');expect(mixed).toContain(promotionZH.rewardGranted);
});

it('a recovered device keeps its receipt without sending the owner to a removed device',async()=>{
  const template=parse(rewardDetailSource).descriptor.template!.content;
  const render=new Function('Vue',compile(template,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>['view','text'].includes(tag)}).code)(Vue);
  const html=async(state:string)=>renderToString(Vue.createSSRApp({components:{AppChassis:{setup:(_p:unknown,{slots}:Vue.SetupContext)=>()=>Vue.h('view',slots.default?.())},RewardRows:componentExports.default,DisclosureDetails:{render:()=>Vue.h('view')}},render,setup:()=>({loading:false,error:false,progress:null,reward:{...reward,state,beneficiaryRole:'BUYER',orderNo:'original',disclosure:{title:{zh:'Frozen gift'},deviceName:'Frozen gift'},assetReceipt:{instanceNos:['original-device-instance'],deviceIds:[85],ledgerBizNo:null,issuedAt:null}},p:promotionZH,locale:{code:'zh'},localized,displayDeadline:()=>'',load:()=>{},navTo:()=>{}})}));
  const reversed=await html('REVERSED');expect(reversed).toContain('original-device-instance');expect(reversed).not.toContain(promotionZH.viewDevice);
  expect(await html('ISSUED')).toContain(promotionZH.viewDevice);
});

function templateRender(source:string) {
  const code=compile(parse(source).descriptor.template!.content,{mode:'function',prefixIdentifiers:true,isTS:true,expressionPlugins:['typescript'],isCustomElement:tag=>['view','text'].includes(tag)}).code;
  return new Function('Vue',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(Vue);
}
function findVNode(node:Vue.VNode,className:string):Vue.VNode|undefined {
  if(typeof node.props?.class==='string'&&node.props.class.split(' ').includes(className))return node;
  if(Array.isArray(node.children))for(const child of node.children)if(Vue.isVNode(child)){const found=findVNode(child,className);if(found)return found;}
}
it('checkout leave mask keeps the purchase open and never closes from modal children',async()=>{
  const render=templateRender(checkoutSource),calls:unknown[][]=[];
  const context={$slots:{},auth:{isAuthenticated:false},p:promotionZH,t:{promotion:promotionZH},leaveOpen:true,voucherOpen:false,
    loading:false,unknown:false,error:'',openedOriginal:false,order:null,quote:null,items:[],rewards:[],voucherOptions:[],
    disclosures:[],locale:{code:'zh'},promotion:null,localized,finishLeave:(...args:unknown[])=>calls.push(args)};
  let vnode!:Vue.VNode;
  await renderToString(Vue.createSSRApp({render:()=>{vnode=render(context,[]);return vnode;}}));
  const overlay=findVNode(vnode,'promotion-overlay')!,mask=findVNode(vnode,'promotion-overlay-dismiss')!,modal=findVNode(vnode,'promotion-modal')!;
  expect(mask).toBeTruthy();expect(overlay.props?.onClick).toBeUndefined();expect(modal.props?.onClick).toBeUndefined();
  mask.props!.onClick({target:{id:'mask'},currentTarget:{id:'mask'}});
  expect(calls).toEqual([[false]]);
});
it('promotion terms forwards only the shared NxSheet close event',async()=>{
  const render=templateRender(termsSource),calls:unknown[][]=[];
  let vnode!:Vue.VNode;
  await renderToString(Vue.createSSRApp({components:{NxSheet:{render:()=>null}},render:()=>{
    vnode=render({open:true,title:'Rules',t:{promotion:promotionZH},uniqueDisclosures:[],uniqueTerms:'Terms',locale:{code:'zh'},localized,emit:(...args:unknown[])=>calls.push(args)},[]);return vnode;
  }}));
  expect(vnode.props?.open).toBe(true);expect(vnode.props?.title).toBe('Rules');
  expect(calls).toEqual([]);vnode.props!.onClose();expect(calls).toEqual([['close']]);
});
it('retains matching per-person limits in each separate product rule',async()=>{
  const render=templateRender(termsSource);
  const rules=['S1','P1','Cloud Share'].map((sku,index)=>({id:`rule-${index}`,text:`${sku}\nUp to 1 reward per order · Up to 1 reward per person`}));
  const html=await renderToString(Vue.createSSRApp({components:{NxSheet:{setup:(_:unknown,{slots}:any)=>()=>Vue.h('view',slots.default?.())}},render:()=>render({open:true,title:'Rules',t:{promotion:promotionEN},uniqueDisclosures:[],uniqueTerms:'Shared refund terms',rules,locale:{code:'en'},localized,emit:()=>{}},[])}));
  expect(html.match(/Up to 1 reward per person/g)).toHaveLength(3);
  for(const rule of rules)expect(html).toContain(rule.text);
});
it('real NxSheet mask closes only on its backdrop or close control, and renders nothing when closed',async()=>{
  const render=templateRender(sheetSource),calls:string[]=[];
  const context={open:true,id:'sheet-test',title:'Rules',copy:{close:'Close'},$slots:{default:()=>[Vue.h('text','Terms')]},$emit:(event:string)=>calls.push(event)};
  let vnode!:Vue.VNode;
  const html=()=>renderToString(Vue.createSSRApp({render:()=>{vnode=render(context,[]);return vnode;}}));
  expect(await html()).toContain('role="dialog"');
  const mask=findVNode(vnode,'nx-sheet-mask')!,body=findVNode(vnode,'nx-sheet__body')!;
  expect(body.props?.onClick).toBeUndefined();
  const backdrop={id:'backdrop'},child={id:'child'};
  mask.props!.onClick({target:child,currentTarget:backdrop});expect(calls).toEqual([]);
  mask.props!.onClick({target:backdrop,currentTarget:backdrop});expect(calls).toEqual(['close']);
  const header=findVNode(vnode,'nx-sheet__header')!;
  const button=(header.children as Vue.VNode[]).find(node=>node.props?.onClick)!;
  button.props!.onClick();expect(calls).toEqual(['close','close']);
  context.open=false;expect(await html()).not.toContain('role="dialog"');
});
