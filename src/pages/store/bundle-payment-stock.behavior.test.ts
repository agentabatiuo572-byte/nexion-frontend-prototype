import { ref } from 'vue';
import { expect,it,vi } from 'vitest';
import ts from 'typescript';
import source from './bundle.vue?raw';
import { ApiError,asApiError,isAmbiguousOutcome } from '@/api/errors';
import { CheckoutPurchaseCheckError } from '@/lib/checkout-purchase-check';
import { matchesBundleQuote,normalizeBundleExpectedAmountUsdt } from '@/api/bundle-order-api';
import { zh } from '@/i18n/messages/zh';

// Execute the production checkout function; only its stores, UI and transport
// boundaries are adapters. New bundles are already covered by bundle-review.
const code=ts.transpileModule(source.slice(source.indexOf('async function onCheckout()'),source.indexOf('// ───── style objects')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function page(){
  const products=ref([{id:'a',name:'Device A'},{id:'b',name:'Device B'}]),total=ref(100),active=ref(true);
  const created={orderNo:'original',productNos:['b','a'],amountUsdt:100};
  const authorization={paymentPassword:'583719',version:1};
  const deps={products,total,submitting:ref(false),walletRefreshing:ref(false),remoteApiEnabled:true,
    openBundleReview:vi.fn().mockResolvedValue(false),captureAccountScope:()=>({accountKey:'account'}),isCurrentAccountScope:()=>active.value,
    orders:{currentAccountKey:()=> 'account',ensureRemoteOrder:vi.fn().mockResolvedValue({total:100,status:'placed'}),refreshRemote:vi.fn().mockResolvedValue(undefined),orders:[{id:'original',status:'activated'}]},
    app:{user:{usdtBalance:200},captureRemoteAccountRequest:()=>({accountKey:'account'}),adoptCommerceWallet:vi.fn().mockReturnValue(true),refreshRemoteFleet:vi.fn()},
    normalizeBundleExpectedAmountUsdt,matchesBundleQuote,ApiError,asApiError,isAmbiguousOutcome,CheckoutPurchaseCheckError,
    purchaseEligibilityStore:{ensure:vi.fn().mockResolvedValue(true),state:vi.fn()},
    bundleDiscountApi:{current:vi.fn().mockResolvedValue({policyVersion:1})},policy:ref({policyVersion:1}),policyStatus:ref('ready'),
    acquireBundleCommand:vi.fn().mockReturnValue({key:'original-command',productNos:['b','a'],expectedAmountUsdt:100}),
    bundleOrderApi:{create:vi.fn().mockResolvedValue(created)},readOrderAction:vi.fn<()=>{key:string}|null>().mockReturnValue(null),
    bundleFingerprint:(items:{id:string}[])=>items.map(item=>item.id).sort().join('|'),
    executePaymentWithPassword:vi.fn(async(_context:any,command:any,current:()=>boolean)=>current()?command(authorization):null),
    assertCheckoutPurchaseStock:vi.fn().mockResolvedValue(undefined),beginOrderAction:vi.fn().mockReturnValue({key:'original-pay-key'}),
    orderApi:{pay:vi.fn().mockResolvedValue({orderNo:'original',paymentMethod:'WALLET',walletBalanceAfterUsdt:100})},
    clearOrderAction:vi.fn(),markOrderActionPaid:vi.fn(),retireBundleKey:vi.fn(),cart:{clear:vi.fn()},
    offerBundleWalletTopup:vi.fn(),refreshBundlePolicy:vi.fn(),refreshProductCatalog:vi.fn(),
    toast:{warn:vi.fn(),success:vi.fn(),error:vi.fn()},t:ref(zh),navTo:vi.fn(),BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED:'legacy',
  };
  const checkout=new Function('deps',`with(deps){${code};return onCheckout;}`)(deps);
  return{...deps,checkout,active,authorization};
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return{promise,resolve};}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

it('a legacy bundle checks every original SKU after PIN and before persisting the payment command',async()=>{
  const view=page();await view.checkout();
  expect(view.assertCheckoutPurchaseStock).toHaveBeenCalledExactlyOnceWith([{productNo:'b',quantity:1},{productNo:'a',quantity:1}]);
  expect(view.executePaymentWithPassword.mock.invocationCallOrder[0]).toBeLessThan(view.assertCheckoutPurchaseStock.mock.invocationCallOrder[0]);
  expect(view.assertCheckoutPurchaseStock.mock.invocationCallOrder[0]).toBeLessThan(view.beginOrderAction.mock.invocationCallOrder[0]);
  expect(view.orderApi.pay).toHaveBeenCalledExactlyOnceWith('original','original-pay-key',view.authorization);
});
it.each(['stock','unavailable'] as const)('a legacy %s rejection retains the command and opens the original order for cancellation',async reason=>{
  const view=page();view.assertCheckoutPurchaseStock.mockRejectedValueOnce(new CheckoutPurchaseCheckError(reason));await view.checkout();
  expect(view.orderApi.pay).not.toHaveBeenCalled();expect(view.beginOrderAction).not.toHaveBeenCalled();expect(view.retireBundleKey).not.toHaveBeenCalled();
  expect(view.toast.warn).toHaveBeenCalledExactlyOnceWith(reason==='stock'?zh.store.temporarilyOutOfStock:zh.store.productUnavailable);
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/order-detail?id=original');
});
it.each(['read','items'] as const)('a legacy %s failure offers retry without marking an unknown payment',async reason=>{
  const view=page();view.assertCheckoutPurchaseStock.mockRejectedValueOnce(new CheckoutPurchaseCheckError(reason));await view.checkout();
  expect(view.toast.warn).toHaveBeenCalledExactlyOnceWith(zh.store.purchaseEligibilityError);expect(view.navTo).not.toHaveBeenCalled();
  expect(view.beginOrderAction).not.toHaveBeenCalled();expect(view.orderApi.pay).not.toHaveBeenCalled();expect(view.retireBundleKey).not.toHaveBeenCalled();
  await view.checkout();expect(view.orderApi.pay).toHaveBeenCalledOnce();expect(view.acquireBundleCommand.mock.results.every(result=>result.value.key==='original-command')).toBe(true);
});
it.each(['account','items','amount','policy'] as const)('a legacy %s change while reading stock cannot dispatch a payment',async change=>{
  const view=page(),stock=deferred();view.assertCheckoutPurchaseStock.mockReturnValueOnce(stock.promise);const pending=view.checkout();await flush();expect(view.assertCheckoutPurchaseStock).toHaveBeenCalledOnce();
  if(change==='account')view.active.value=false;
  if(change==='items')view.products.value=[{id:'c',name:'Device C'},{id:'b',name:'Device B'}];
  if(change==='amount')view.total.value=101;
  if(change==='policy')view.policy.value={policyVersion:2};
  stock.resolve();await pending;expect(view.beginOrderAction).not.toHaveBeenCalled();expect(view.orderApi.pay).not.toHaveBeenCalled();
});
it('a known payment command follows original readback without a stock gate or repeat PIN',async()=>{
  const view=page();view.readOrderAction.mockReturnValue({key:'original-pay-key'});await view.checkout();
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/order-detail?id=original');expect(view.assertCheckoutPurchaseStock).not.toHaveBeenCalled();expect(view.executePaymentWithPassword).not.toHaveBeenCalled();expect(view.orderApi.pay).not.toHaveBeenCalled();
});
it('closing PIN retains the legacy pending order without reading stock or sending payment',async()=>{
  const view=page();view.executePaymentWithPassword.mockResolvedValueOnce(null);await view.checkout();
  expect(view.assertCheckoutPurchaseStock).not.toHaveBeenCalled();expect(view.orderApi.pay).not.toHaveBeenCalled();expect(view.retireBundleKey).not.toHaveBeenCalled();
});
