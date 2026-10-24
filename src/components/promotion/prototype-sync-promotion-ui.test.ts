import * as Vue from 'vue';
import { parse,compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import { describe,it,expect,vi } from 'vitest';
import source from './promotion-checkout.vue?raw';
import { en } from '@/i18n/messages/en';

function checkout(items: {productNo:string;quantity:number;lineId?:string;productName?:string}[] = []){
  const lifecycle={mounted:[] as (()=>void)[],hide:[] as (()=>void)[],show:[] as (()=>void)[],unmount:[] as (()=>void)[]};
  let resolve:(accepted:boolean)=>void=()=>{},epoch=0;
  const order={orderNo:'ORDER',paymentStatus:'PENDING',amountUsdt:'39.800000',quote:{activityId:'purchase-gift',items:[],expectedRewards:[],amountUsdt:'39.800000'},items:[]};
  const store={refresh:vi.fn(),getOrder:()=>order,payOrder:vi.fn(()=>({...order,paymentStatus:'PAID'})),cancelOrder:vi.fn(()=>({...order,paymentStatus:'CANCELLED'})),activities:[],rewards:[]};
  const dependencies:Record<string,unknown>={
    vue:{...Vue,onMounted:(fn:()=>void)=>lifecycle.mounted.push(fn),onBeforeUnmount:(fn:()=>void)=>lifecycle.unmount.push(fn)},
    '@dcloudio/uni-app':{onHide:(fn:()=>void)=>lifecycle.hide.push(fn),onShow:(fn:()=>void)=>lifecycle.show.push(fn)},
    '@/lib/account-scope':{captureAccountScope:()=>epoch,isCurrentAccountScope:(captured:number)=>captured===epoch},
    '@/i18n/use-t':{useT:()=>Vue.ref(en)},'@/i18n/format':{fmt:(s:string)=>s},
    '@/store/locale':{useLocaleStore:()=>({code:'en'})},'@/store/app':{useApp:()=>({accountKey:'buyer'})},'@/store/promotion':{usePromotion:()=>store},
    '@/store/voucher':{useVoucher:()=>({claimedUnused:[]})},'@/mock/products':{getProduct:()=>null},
    '@/lib/promotion-display':{localized:()=>'',displayDeadline:()=>''},'@/lib/promotion-entry':{promotionBundleHref:()=>'/bundle'},'@/lib/route':{navTo:vi.fn()},
    '@/store/ui':{confirm:()=>new Promise<boolean>(done=>{resolve=done;})},'./reward-rows.vue':{},'./promotion-terms.vue':{},
  };
  const descriptor=parse(source,{filename:'promotion-checkout.vue'}).descriptor;
  const script=compileScript(descriptor,{id:'prototype-sync-checkout'});
  const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={default:{} as any};
  new Function('require','exports',code)((id:string)=>{if(!(id in dependencies))throw new Error(`Unexpected dependency ${id}`);return dependencies[id];},exports);
  const scope=Vue.effectScope();
  const vm=scope.run(()=>exports.default.setup({activityId:'purchase-gift',items,orderNo:'ORDER',showOrderLink:true},{expose:()=>{}}));
  lifecycle.mounted.forEach(fn=>fn());
  return {vm,store,lifecycle,accept:()=>resolve(true),rebind:()=>epoch++,stop:()=>{lifecycle.unmount.forEach(fn=>fn());scope.stop();}};
}
describe('prototype-sync checkout confirmation lifecycle',()=>{
  it('identifies the same purchase draft before and after order readback adds line metadata',()=>{
    const entry=checkout([{productNo:'cloud-share',quantity:2}]);
    const detail=checkout([{productNo:'cloud-share',quantity:2,lineId:'LINE',productName:'Cloud Share'}]);
    expect(detail.vm.checkoutKey()).toBe(entry.vm.checkoutKey());entry.stop();detail.stop();
  });
  it('discards an accepted payment confirmation after the page hides',async()=>{
    const c=checkout();const pending=c.vm.pay();c.lifecycle.hide.forEach(fn=>fn());c.accept();await pending;
    expect(c.store.payOrder).not.toHaveBeenCalled();expect(c.vm.busy.value).toBe(false);
    c.lifecycle.show.forEach(fn=>fn());const current=c.vm.pay();c.accept();await current;expect(c.store.payOrder).toHaveBeenCalledExactlyOnceWith('ORDER');c.stop();
  });
  it('discards same-account rebind confirmations and releases the local busy state',async()=>{
    const c=checkout();const pending=c.vm.pay();c.rebind();c.accept();await pending;
    expect(c.store.payOrder).not.toHaveBeenCalled();expect(c.vm.busy.value).toBe(false);c.stop();
  });
  it('discards cancellation after component unmount',async()=>{
    const c=checkout();const pending=c.vm.cancel();c.stop();c.accept();await pending;expect(c.store.cancelOrder).not.toHaveBeenCalled();
  });
});
