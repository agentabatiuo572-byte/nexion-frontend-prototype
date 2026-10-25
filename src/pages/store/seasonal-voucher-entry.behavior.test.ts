import { computed,ref } from 'vue';
import * as Vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { expect,it,vi } from 'vitest';
import storeSource from './store.vue?raw';
import detailSource from './detail.vue?raw';
import checkoutSource from '@/components/promotion/promotion-checkout.vue?raw';
import productSource from '@/components/store/product-card.vue?raw';
import * as entry from '@/lib/promotion-entry';
import { promotionZH,promotionEN,promotionVI } from '@/i18n/messages/promotion';

it.each([['store',storeSource],['detail',detailSource],['checkout',checkoutSource]])('%s voucher title keeps the translated label without exposing the transport ID',async(_page,source)=>{
  const title=parse(source).descriptor.template!.content.match(/<text class="promotion-title">{{ (?:t\.promotion|p)\.eventVoucher }}[\s\S]*?<\/text>/)![0];
  const render=new Function('Vue',compile(title,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>tag==='text'}).code)(Vue);
  for(const p of [promotionZH,promotionEN,promotionVI]){
    const id='vc-mvnjn50x-8gjpyz',html=await renderToString(Vue.createSSRApp({render,setup:()=>({p,t:{promotion:p},eventVoucherId:id,voucherContext:{voucherId:id}})}));
    expect(html).toContain(p.eventVoucher);expect(html).not.toContain(id);
  }
});

function functions(source:string,names:string[]){
  const ast=ts.createSourceFile('entry.ts',parse(source).descriptor.scriptSetup!.content,ts.ScriptTarget.Latest,true);
  return ts.transpileModule(ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text)).map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
it('the actual store query clears Pro scope and keeps every hardware SKU for BF20',()=>{
  const products=[{id:'ordinary'},{id:'pro'}],activityId=ref('pro-upgrade'),voucherContext=ref({});
  const deps={...entry,activityId,voucherContext,navTo:vi.fn(),computed,remoteApiEnabled:true,displayCatalog:ref({products}),PRODUCTS:products,publicOnly:ref(false),activity:ref({productNos:['pro']})};
  const start=storeSource.indexOf('const displayProducts = computed('),end=storeSource.indexOf('\nconst catalogHasProducts',start);
  const code=ts.transpileModule(storeSource.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const view=new Function('deps',`with(deps){${functions(storeSource,['readPromotionQuery','clearPromotion'])};${code};return {readPromotionQuery,clearPromotion,displayProducts};}`)(deps);
  view.readPromotionQuery({scope:'all',voucherId:'BF20',upgradeActivityId:'pro-upgrade'});
  expect(activityId.value).toBe('');expect(view.displayProducts.value).toEqual(products);expect(voucherContext.value).toEqual({voucherId:'BF20',upgradeActivityId:'pro-upgrade'});
  view.clearPromotion();expect(voucherContext.value).toEqual({});expect(deps.navTo).toHaveBeenCalledWith('/pages/store/store?scope=all');
});
it.each(['ordinary','pro'])('the actual %s product card keeps BF20 in both detail and purchase actions',productNo=>{
  const navTo=vi.fn(),deps={...entry,navTo,props:{product:{id:productNo},activityId:'',voucherContext:{voucherId:'BF20',upgradeActivityId:'pro-upgrade'}}};
  const view=new Function('deps',`with(deps){${functions(productSource,['goDetail','goCheckout'])};return {goDetail,goCheckout};}`)(deps);
  view.goDetail();view.goCheckout();
  for(const [href] of navTo.mock.calls){const query=new URL(href,'https://app.test').searchParams;expect(query.get('voucherId')).toBe('BF20');expect(query.get('upgradeActivityId')).toBe('pro-upgrade');expect(query.has('activityId')).toBe(false);}
});
