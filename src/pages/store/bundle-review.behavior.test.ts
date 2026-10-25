import { ref } from 'vue';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';
import source from './bundle.vue?raw';
import { promotionCheckoutHref } from '@/lib/promotion-entry';
import { commerceAmount, commerceOrderTitle } from '@/lib/commerce-review';
import { zh } from '@/i18n/messages/zh';

const code=ts.transpileModule(source.slice(source.indexOf('async function openBundleReview'),source.indexOf('async function onCheckout')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function page(commands:Record<string,unknown>={}) {
  const deps={receiptWriteFailure:ref<unknown>(null),submitting:ref(false),readAccountRow:vi.fn(()=>({commands})),BUNDLE_COMMAND_KEY:'commands',orders:{currentAccountKey:()=> 'account'},bundleFingerprint:(items:{id:string}[])=>items.map(item=>item.id).sort().join('|'),toast:{warn:vi.fn()},t:ref(zh),navTo:vi.fn().mockResolvedValue(true),promotionCheckoutHref};
  const review=new Function('deps',`with(deps){${code};return openBundleReview;}`)(deps);
  return {...deps,review};
}
const products=[{id:'sku-b'},{id:'sku-a'}];
it('hands a new bundle to shared review with every selected item and no purchase command',async()=>{
  const view=page();expect(await view.review(products)).toBe(true);
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith(promotionCheckoutHref([{productNo:'sku-b',quantity:1},{productNo:'sku-a',quantity:1}]));
  expect(view.submitting.value).toBe(false);
});
it('retains the matching durable legacy command for recovery instead of opening a new quote',async()=>{
  const view=page({'sku-a|sku-b':{key:'original-key',expectedAmountUsdt:100}});
  expect(await view.review(products)).toBe(false);expect(view.navTo).not.toHaveBeenCalled();
});
it('a different unresolved bundle cannot be bypassed by changing cart products',async()=>{
  const view=page({'sku-c|sku-d':'old-key'});expect(await view.review(products)).toBe(true);
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/orders');
});
it.each(['receipt','storage'])('does not open a new checkout while %s recovery is required',async failure=>{
  const view=page();if(failure==='receipt')view.receiptWriteFailure.value={orderIds:['original']};else view.readAccountRow.mockImplementation(()=>{throw new Error('storage');});
  expect(await view.review(products)).toBe(true);expect(view.navTo).not.toHaveBeenCalled();
});
it.each(['zh','en','vi'])('bundle title counts all canonical lines and formats money without mutating it (%s)',locale=>{
  const order={productName:'First device',quantity:4,total:'12999.990000',lineItems:[{sku:'sku-a',quantity:2},{sku:'sku-b',quantity:2}]};
  const title=commerceOrderTitle(order,locale);expect(title).toContain('2');expect(title).toContain('4');expect(title).not.toContain('First device');
  expect(commerceAmount(order.total)).toBe('12,999.99');expect(order.total).toBe('12999.990000');
  expect(commerceOrderTitle({...order,lineItems:undefined},locale)).toBe('First device');
});
