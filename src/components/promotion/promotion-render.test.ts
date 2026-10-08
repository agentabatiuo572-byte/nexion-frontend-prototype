import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import ts from 'typescript';
import { expect, it } from 'vitest';
import rewardRowsSource from './reward-rows.vue?raw';
import orderRewardsSource from './order-rewards.vue?raw';
import rewardDetailSource from '@/pages/events/promotion-reward-detail.vue?raw';
import checkoutSource from './promotion-checkout.vue?raw';
import termsSource from './promotion-terms.vue?raw';
import { promotionZH } from '@/i18n/messages/promotion';
import { localized, rewardAmount, rewardStateKey } from '@/lib/promotion-display';

const descriptor=parse(rewardRowsSource,{filename:'reward-rows.vue'}).descriptor;
const script=compileScript(descriptor,{id:'reward-rows-behavior',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text'].includes(tag)}}});
const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const dependencies:Record<string,unknown>={
  vue:Vue,
  '@/i18n/use-t':{useT:()=>Vue.ref({promotion:promotionZH})},
  '@/store/locale':{useLocaleStore:()=>({code:'zh'})},
  '@/mock/products':{getProduct:(id:string)=>({name:({'sku-a':'Device Alpha','sku-b':'Device Beta'} as Record<string,string>)[id]??'Actual gift'})},
  '@/store/product-catalog':{productCatalogState:Vue.reactive({status:'ready'})},
  '@/lib/promotion-display':{localized,rewardAmount,rewardStateKey},
  '@/lib/route':{navTo:()=>Promise.resolve(true)},
};
const componentExports={default:{} as Vue.Component};
new Function('require','exports',code)((id:string)=>{if(!(id in dependencies))throw new Error('Unexpected import '+id);return dependencies[id];},componentExports);
const reward={obligationId:'reward-1',reward:{rewardRuleId:'r1',type:'USDT',amount:'3.000000',beneficiaryRole:'BUYER'},state:'ISSUED',refundHold:false};

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
  expect(rows[0]).toContain('Device Beta × 3');expect(rows[0]).toContain('7 NEX');expect(rows[0]).not.toContain('Device Alpha');
  expect(rows[1]).toContain('Device Alpha × 2');expect(rows[1]).toContain('5 USDT');expect(rows[1]).not.toContain('Device Beta');
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

it('a recovered device keeps its receipt without sending the owner to a removed device',async()=>{
  const template=parse(rewardDetailSource).descriptor.template!.content;
  const render=new Function('Vue',compile(template,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>['view','text'].includes(tag)}).code)(Vue);
  const html=async(state:string)=>renderToString(Vue.createSSRApp({components:{AppChassis:{setup:(_p:unknown,{slots}:Vue.SetupContext)=>()=>Vue.h('view',slots.default?.())},RewardRows:componentExports.default,DisclosureDetails:{render:()=>Vue.h('view')}},render,setup:()=>({loading:false,error:false,progress:null,reward:{...reward,state,beneficiaryRole:'BUYER',orderNo:'original',disclosure:{title:{zh:'Frozen gift'},deviceName:'Frozen gift'},assetReceipt:{instanceNos:['original-device-instance'],deviceIds:[85],ledgerBizNo:null,issuedAt:null}},p:promotionZH,locale:{code:'zh'},localized,displayDeadline:()=>'',load:()=>{},navTo:()=>{}})}));
  const reversed=await html('REVERSED');expect(reversed).toContain('original-device-instance');expect(reversed).not.toContain(promotionZH.viewDevice);
  expect(await html('ISSUED')).toContain(promotionZH.viewDevice);
});

it.each([[checkoutSource, 'finishLeave'], [termsSource, 'emit']] as const)('separate promotion masks close with Uni normalized events without closing from modal children', (source, action) => {
  const template = parse(source).descriptor.template!.content;
  const renderCode = compile(template, { mode: 'function', prefixIdentifiers: true, isTS: true, expressionPlugins: ['typescript'], isCustomElement: tag => ['view', 'text'].includes(tag) }).code;
  const render = new Function('Vue', ts.transpileModule(renderCode, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(Vue);
  const calls: unknown[][] = [];
  const context = { auth: { isAuthenticated: false }, p: promotionZH, t: { promotion: promotionZH }, leaveOpen: true, open: true,
    loading: false, unknown: false, error: '', openedOriginal: false, order: null, quote: null, items: [], rewards: [],
    disclosures: [], title: '', terms: '', locale: { code: 'zh' }, deadline: '', promotion: null, localized,
    finishLeave: (...args: unknown[]) => calls.push(args), emit: (...args: unknown[]) => calls.push(args) };
  let vnode!: Vue.VNode;
  const app = Vue.createSSRApp({ render: () => { vnode = render(context, []); return vnode; } });
  // A real render context preserves component resolution; the sibling mask is
  // tested with the distinct target wrappers emitted by Uni H5.
  return renderToString(app).then(() => {
    function find(node: Vue.VNode, className: string): Vue.VNode | undefined {
      if (typeof node.props?.class === 'string' && node.props.class.split(' ').includes(className)) return node;
      if (Array.isArray(node.children)) for (const child of node.children) {
        if (Vue.isVNode(child)) { const result = find(child, className); if (result) return result; }
      }
    }
    const overlay = find(vnode, 'promotion-overlay')!, mask = find(vnode, 'promotion-overlay-dismiss')!, modal = find(vnode, 'promotion-modal')!;
    expect(mask).toBeTruthy(); expect(overlay.props?.onClick).toBeUndefined(); expect(modal.props?.onClick).toBeUndefined();
    mask.props!.onClick({ target: { id: 'mask' }, currentTarget: { id: 'mask' } });
    expect(calls).toEqual(action === 'finishLeave' ? [[false]] : [['close']]);
  });
});
