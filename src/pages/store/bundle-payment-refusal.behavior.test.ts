import { walletSelectedPurchaseFixture } from '@/lib/selected-purchase-payment.test-helper';
import { ref } from 'vue';
import { expect,it,vi } from 'vitest';
import ts from 'typescript';
import source from './bundle.vue?raw';
import { ApiError,asApiError,isAmbiguousOutcome } from '@/api/errors';
import { orderPaymentRejection } from '@/lib/order-payment-rejection';
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
    normalizeBundleExpectedAmountUsdt,matchesBundleQuote,ApiError,asApiError,isAmbiguousOutcome,orderPaymentRejection,useLocaleStore:()=>({code:'zh'}),
    purchaseEligibilityStore:{ensure:vi.fn().mockResolvedValue(true),state:vi.fn()},
    bundleDiscountApi:{current:vi.fn().mockResolvedValue({policyVersion:1})},policy:ref({policyVersion:1}),policyStatus:ref('ready'),
    acquireBundleCommand:vi.fn().mockReturnValue({key:'original-command',productNos:['b','a'],expectedAmountUsdt:100}),
    bundleOrderApi:{create:vi.fn().mockResolvedValue(created)},readOrderAction:vi.fn<()=>{key:string}|null>().mockReturnValue(null),
    bundleFingerprint:(items:{id:string}[])=>items.map(item=>item.id).sort().join('|'),
    executePaymentWithPassword:vi.fn(async(_context:any,command:any,current:()=>boolean)=>current()?command(authorization):null),
    beginOrderAction:vi.fn().mockReturnValue({key:'original-pay-key'}),
    orderApi:{pay:vi.fn().mockResolvedValue({orderNo:'original',paymentMethod:'WALLET',walletBalanceAfterUsdt:100})},
    clearOrderAction:vi.fn(),markOrderActionPaid:vi.fn(),retireBundleKey:vi.fn(),cart:{clear:vi.fn()},
    offerBundleWalletTopup:vi.fn(),refreshBundlePolicy:vi.fn(),refreshProductCatalog:vi.fn(),
    toast:{warn:vi.fn(),success:vi.fn(),error:vi.fn()},t:ref(zh),navTo:vi.fn(),BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED:'legacy',
  };
  const executeSelectedPurchase=walletSelectedPurchaseFixture(deps.executePaymentWithPassword);
  Object.assign(deps,{executeSelectedPurchase,paidOrderReceipt:(raw:unknown)=>raw});
  const checkout=new Function('deps',`with(deps){${code};return onCheckout;}`)(deps);
  return{...deps,checkout,active,authorization};
}

it('a legacy bundle pays the original order after PIN without a client stock read',async()=>{
  const view=page();await view.checkout();
  expect(view.executePaymentWithPassword.mock.invocationCallOrder[0]).toBeLessThan(view.beginOrderAction.mock.invocationCallOrder[0]);
  expect(view.orderApi.pay).toHaveBeenCalledExactlyOnceWith('original','original-pay-key',view.authorization);
});
it.each(['CAPACITY_REPLACEMENT_REQUIRED','ORDER_PRODUCT_NOT_PAYABLE'])('a definitive %s refusal names the reason and opens the original order',async code=>{
  const view=page();view.orderApi.pay.mockRejectedValueOnce(new ApiError({kind:'business',message:code,status:409,code:409}));await view.checkout();
  expect(view.toast.warn).toHaveBeenCalledExactlyOnceWith(orderPaymentRejection(new ApiError({kind:'business',message:code}),'zh'));
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/order-detail?id=original');
});
it.each(['account','items','amount','policy'] as const)('a legacy %s change during PIN cannot dispatch a payment',async change=>{
  const view=page();
  view.executePaymentWithPassword.mockImplementationOnce(async(_context:any,command:any)=>{
    if(change==='account')view.active.value=false;
    if(change==='items')view.products.value=[{id:'c',name:'Device C'},{id:'b',name:'Device B'}];
    if(change==='amount')view.total.value=101;
    if(change==='policy')view.policy.value={policyVersion:2};
    return command(view.authorization);
  });
  await view.checkout();expect(view.beginOrderAction).not.toHaveBeenCalled();expect(view.orderApi.pay).not.toHaveBeenCalled();
});
it('a known payment command follows original readback without a repeat PIN',async()=>{
  const view=page();view.readOrderAction.mockReturnValue({key:'original-pay-key'});await view.checkout();
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/order-detail?id=original');expect(view.executePaymentWithPassword).not.toHaveBeenCalled();expect(view.orderApi.pay).not.toHaveBeenCalled();
});
it('closing PIN retains the legacy pending order without sending payment',async()=>{
  const view=page();view.executePaymentWithPassword.mockResolvedValueOnce(null);await view.checkout();
  expect(view.orderApi.pay).not.toHaveBeenCalled();expect(view.retireBundleKey).not.toHaveBeenCalled();
});
