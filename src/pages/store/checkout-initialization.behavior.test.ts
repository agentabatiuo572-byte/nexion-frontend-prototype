import { ref } from 'vue';
import { expect,it,vi } from 'vitest';
import ts from 'typescript';
import source from './checkout.vue?raw';
import { CheckoutRouteFence } from '@/lib/checkout-route-fence';

const script=source.split('<script setup lang="ts">')[1].split('</script>')[0];
const ast=ts.createSourceFile('checkout.ts',script,ts.ScriptTarget.Latest,true);
const initializer=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='initializeCheckout')!;
const watcher=ast.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)
  &&node.expression.expression.getText(ast)==='watch'&&node.getText(ast).includes('remoteCapacityGate.reset()')) as ts.ExpressionStatement;
const callback=(watcher.expression as ts.CallExpression).arguments[1];
const code=ts.transpileModule(initializer.getText(ast)+'\nconst accountChanged='+callback.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function deferred(){let resolve!:(value:boolean)=>void;const promise=new Promise<boolean>(yes=>{resolve=yes;});return{promise,resolve};}
function page(){
  const identity={accountKey:'guest',accountEpoch:0,productNo:'stellarbox-s1'},fence=new CheckoutRouteFence();fence.begin(identity);
  const deps={activeCheckoutLoad:null as ReturnType<typeof fence.capture>|null,remoteApiEnabled:true,
    resumeServerOrder:vi.fn().mockResolvedValue(false),isCurrentCheckoutRoute:(s:ReturnType<typeof fence.capture>)=>fence.isCurrent(s,identity),
    beginCheckoutRoute:()=>fence.begin(identity),refreshProductCatalog:vi.fn().mockResolvedValue(true),refreshServerProductPhase:vi.fn().mockResolvedValue(true),
    getProduct:()=>({id:'stellarbox-s1',productType:'BOX',inventoryMode:'FINITE',stock:10,available:true}),hasOriginalCheckout:ref(false),
    resumeSessionId:null,trialCheckoutSource:false,trialQuoteAt:()=>({applied:false}),mockServerNow:()=>0,isProductAvailable:()=>true,phase:ref('P1'),
    refreshPurchaseEligibility:vi.fn().mockResolvedValue('eligible'),resumePendingSession:vi.fn(),fireTradeinIntercept:vi.fn().mockResolvedValue(false),
    quantityReady:ref(false),interceptFired:false,tradeinAvailable:ref(false),remoteCapacityGate:{reset:vi.fn()},checkoutCapacityRead:null,
    checkoutWalletRefreshSequence:0,checkoutWalletRefreshing:ref(false),clearRemotePurchaseEligibility:vi.fn(),
    confirming:false,orderId:ref(null),createdCheckoutOrder:ref(null),pendingCheckoutCreate:ref(null),paymentBlocked:ref(''),
    settledResultReplay:ref(false),checkoutLeaveError:ref(''),checkoutLeaving:ref(false),closePaymentSheet:vi.fn(),remoteOrderFailure:ref(null),
    receiptWriteFailure:ref(null),receiptRetrying:ref(false),restoreReceiptRecovery:vi.fn(),remoteTradeinRecoveryRequired:ref(false),
    remoteTradeinRecoveryError:ref(false),remoteTradeinRecoveryBusy:ref(false),remoteOrderCommandKey:{clear:vi.fn()},activeSession:ref(null),
    dialogsOpen:0,step:ref('select-payment'),checkoutRouteInitialized:true,pageAlive:true,pageVisible:true,
    keepCheckoutTarget:ref(null),keepCheckoutReadError:ref(false),
    invalidateCheckoutRoute:()=>{fence.invalidate();deps.activeCheckoutLoad=null;},
  };
  const api=new Function('deps',`with(deps){${code};return {initializeCheckout,accountChanged};}`)(deps);
  return{...deps,api,identity,fence,scope:()=>fence.capture(identity),bound:()=>{identity.accountKey='user';identity.accountEpoch++;api.accountChanged();},state:()=>deps};
}
it('cookie account restoration restarts full new-checkout reads after the guest load becomes stale',async()=>{
  const h=page(),old=deferred();h.refreshProductCatalog.mockReturnValueOnce(old.promise);
  const guest=h.api.initializeCheckout(h.scope());await vi.waitFor(()=>expect(h.refreshProductCatalog).toHaveBeenCalledOnce());
  h.bound();await vi.waitFor(()=>expect(h.fireTradeinIntercept).toHaveBeenCalledOnce());
  expect(h.resumeServerOrder).toHaveBeenCalledTimes(2);expect(h.refreshPurchaseEligibility).toHaveBeenCalledOnce();
  expect(h.quantityReady.value).toBe(true);old.resolve(true);await guest;
  expect(h.fireTradeinIntercept).toHaveBeenCalledOnce();expect(h.refreshPurchaseEligibility).toHaveBeenCalledOnce();
});
it('account restoration still recovers an original order before any new catalog or capacity read',async()=>{
  const h=page();h.resumeServerOrder.mockResolvedValueOnce(true);h.bound();
  await vi.waitFor(()=>expect(h.state().activeCheckoutLoad).toBeNull());
  expect(h.resumeServerOrder).toHaveBeenCalledOnce();expect(h.refreshProductCatalog).not.toHaveBeenCalled();expect(h.fireTradeinIntercept).not.toHaveBeenCalled();
});
it('a stale guest initialization cannot clear the current account load or mark it ready',async()=>{
  const h=page(),old=deferred(),current=deferred();h.refreshProductCatalog.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const guest=h.api.initializeCheckout(h.scope());await vi.waitFor(()=>expect(h.refreshProductCatalog).toHaveBeenCalledOnce());h.bound();
  await vi.waitFor(()=>expect(h.refreshProductCatalog).toHaveBeenCalledTimes(2));old.resolve(true);await guest;
  expect(h.state().activeCheckoutLoad?.accountKey).toBe('user');expect(h.quantityReady.value).toBe(false);expect(h.fireTradeinIntercept).not.toHaveBeenCalled();
  current.resolve(true);await vi.waitFor(()=>expect(h.quantityReady.value).toBe(true));expect(h.fireTradeinIntercept).toHaveBeenCalledOnce();
});
