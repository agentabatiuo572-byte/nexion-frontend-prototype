import { beforeAll,beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { createPinia,setActivePinia } from 'pinia';

// The production app, bills, promotion, account-cloud and money-receipt modules
// are all real. Only the platform's synchronous Storage/uni boundary is hosted
// in memory, including uni-h5's swallowed getItem/setItem exceptions.
class TestStorage {
  rows=new Map<string,string>(); reads=new Map<string,number>();
  failRead:((key:string,n:number)=>boolean)|null=null;
  failWrite:((key:string,value:string)=>boolean)|null=null;
  getItem(key:string){const n=(this.reads.get(key)??0)+1;this.reads.set(key,n);if(this.failRead?.(key,n))throw new Error('injected read');return this.rows.get(key)??null;}
  setItem(key:string,value:string){if(this.failWrite?.(key,value))throw new Error('injected write');this.rows.set(key,value);}
  removeItem(key:string){this.rows.delete(key);}
  clear(){this.rows.clear();this.reads.clear();}
}
const storage=new TestStorage();
let useApp:typeof import('./app').useApp,useBills:typeof import('./bills').useBills,useOrders:typeof import('./orders').useOrders,usePromotion:typeof import('./promotion').usePromotion;
function platform(){
  vi.stubGlobal('window',{localStorage:storage,sessionStorage:storage,location:{hostname:'localhost',protocol:'http:',origin:'http://localhost',href:'http://localhost/'},addEventListener:()=>{},removeEventListener:()=>{}});
  vi.stubGlobal('localStorage',storage);vi.stubGlobal('sessionStorage',storage);
  vi.stubGlobal('uni',{getStorageSync:(key:string)=>{try{const raw=storage.getItem(key);return raw===null?'':JSON.parse(raw).data;}catch{return '';}},setStorageSync:(key:string,value:unknown)=>{try{storage.setItem(key,JSON.stringify({type:typeof value,data:value}));}catch{}},removeStorageSync:(key:string)=>storage.removeItem(key),getStorageInfoSync:()=>({keys:[...storage.rows.keys()]}),getSystemInfoSync:()=>({platform:'devtools',uniPlatform:'web',windowWidth:390,windowHeight:844}),onNetworkStatusChange:()=>{},getNetworkType:()=>{},showToast:()=>{}});
}
beforeAll(async()=>{platform();({useApp}=await import('./app'));({useBills}=await import('./bills'));({useOrders}=await import('./orders'));({usePromotion}=await import('./promotion'));});
beforeEach(()=>{storage.clear();storage.failRead=null;storage.failWrite=null;platform();setActivePinia(createPinia());});
afterEach(()=>{storage.failRead=null;storage.failWrite=null;vi.unstubAllGlobals();});
const ACCOUNT='nexgrid-account-cloud-v1',BILLS='nexgrid-bills-accounts-v1',PROMO='nexgrid-promotion-accounts-v1';
function setup(){const app=useApp(),bills=useBills(),orders=useOrders();app.bindAccount('strict-payment');bills.bindAccount('strict-payment');orders.bindAccount('strict-payment');const promotion=usePromotion();const quote=promotion.quote([{productNo:'cloud-share',quantity:2}],'purchase-gift');const order=promotion.createOrder(quote.quoteId,quote.quoteId);return {app,bills,promotion,order};}
function disk(key:string){return JSON.parse(storage.rows.get(key)??'{"data":{}}').data;}
describe('prototype-sync real-store strict payment storage',()=>{
  it('uses the strict account snapshot for reward idempotency without a second platform read',()=>{
    const p=setup(),before=p.app.user.usdtBalance,ref='GIFT-strict-payment';
    storage.reads.clear();storage.failRead=(key,n)=>key===ACCOUNT&&n>1;
    p.app.withStrictPrototypeSnapshot(()=>{
      expect(p.app.creditRewardBucketOnce(ref,'withdrawable',5,20)).toBe(true);
      expect(p.app.creditRewardBucketOnce(ref,'withdrawable',5,20)).toBe(true);
    });
    expect(storage.reads.get(ACCOUNT)).toBe(1);
    expect(p.app.user.usdtBalance).toBe(before+5);
    expect(disk(ACCOUNT)['strict-payment'].user.appliedRewardKeys[ref]).toBe(true);
    storage.failRead=null;storage.reads.clear();
    expect(p.app.creditRewardBucketOnce(ref,'withdrawable',5,20)).toBe(true);
    expect(storage.reads.get(ACCOUNT)).toBe(1);
    expect(p.app.user.usdtBalance).toBe(before+5);
  });
  it.each([ACCOUNT,BILLS])('fails before money changes when the first %s read throws',key=>{
    const p=setup(),balance=p.app.user.usdtBalance,prior=storage.rows.get(key);storage.reads.clear();storage.failRead=(k,n)=>k===key&&n===1;
    expect(()=>p.promotion.payOrder(p.order.orderNo)).toThrow('storage');expect(p.app.user.usdtBalance).toBe(balance);expect(storage.rows.get(key)).toBe(prior);
    expect(p.bills.bills.filter(b=>b.ref===p.order.orderNo)).toHaveLength(0);
  });
  it.each([2,3,4])('does not perform hidden ledger/account reads at read ordinal %s during paid recovery',ordinal=>{
    const p=setup(),before=p.app.user.usdtBalance;
    storage.failWrite=(key,value)=>key===PROMO&&value.includes('"paymentStatus":"PAID"');
    expect(()=>p.promotion.payOrder(p.order.orderNo)).toThrow('storage');storage.failWrite=null;
    const charged=p.app.user.usdtBalance;expect(charged).toBeCloseTo(before-39.8);expect(disk(BILLS)['strict-payment'].bills.filter((b:{ref:string})=>b.ref===p.order.orderNo)).toHaveLength(1);
    // A second Pinia represents an already-open carrier with a stale receipt cache.
    setActivePinia(createPinia());const app=useApp(),bills=useBills(),orders=useOrders();app.bindAccount('strict-payment');bills.bindAccount('strict-payment');orders.bindAccount('strict-payment');bills.bills=[];const promotion=usePromotion();
    storage.reads.clear();storage.failRead=(key,n)=>[ACCOUNT,BILLS].includes(key)&&n===ordinal;
    promotion.payOrder(p.order.orderNo);expect(app.user.usdtBalance).toBe(charged);expect(storage.reads.get(ACCOUNT)).toBe(1);expect(storage.reads.get(BILLS)).toBe(1);
    expect(disk(BILLS)['strict-payment'].bills.filter((b:{ref:string})=>b.ref===p.order.orderNo)).toHaveLength(1);
    expect(disk(ACCOUNT)['strict-payment'].user.usdtBalance).toBe(charged);
  });
  it('rolls back real money when the receipt write fails and does not retain the strict scope',()=>{
    const p=setup(),before=p.app.captureMoney();storage.failWrite=key=>key===BILLS;
    expect(()=>p.promotion.payOrder(p.order.orderNo)).toThrow('storage');expect(p.app.captureMoney()).toEqual(before);
    expect(disk(ACCOUNT)['strict-payment'].user.usdtBalance).toBe(before.usdtBalance);
    expect(p.bills.bills.filter(b=>b.ref===p.order.orderNo)).toHaveLength(0);
    storage.failWrite=null;storage.reads.clear();p.bills.bindAccount('strict-payment');expect(storage.reads.get(BILLS)).toBe(1);
    p.promotion.payOrder(p.order.orderNo);expect(p.bills.bills.filter(b=>b.ref===p.order.orderNo)).toHaveLength(1);
  });
  it.each([1,2,3,4])('keeps debit and receipt consistent when account write %s fails',ordinal=>{
    const p=setup(),before=p.app.user.usdtBalance;let writes=0;
    storage.failWrite=key=>key===ACCOUNT&&++writes===ordinal;
    expect(()=>p.promotion.payOrder(p.order.orderNo)).toThrow('storage');storage.failWrite=null;
    const charged=ordinal>2;
    expect(p.app.user.usdtBalance).toBeCloseTo(before-(charged?39.8:0));
    expect(p.bills.bills.filter(b=>b.ref===p.order.orderNo)).toHaveLength(charged?1:0);
    p.promotion.payOrder(p.order.orderNo);
    expect(p.app.user.usdtBalance).toBeCloseTo(before-39.8);expect(p.bills.bills.filter(b=>b.ref===p.order.orderNo)).toHaveLength(1);
    expect(p.app.devices.filter(d=>d.id.includes(p.order.orderNo))).toHaveLength(3);
  });
  it('replays a credited USDT reward without a second credit after final activity save failure',()=>{
    const p=setup(),q=p.promotion.quote([{productNo:'cloud-share',quantity:1}],'first-purchase'),o=p.promotion.createOrder(q.quoteId,q.quoteId),before=p.app.user.usdtBalance;
    storage.failWrite=(key,value)=>key===PROMO&&value.includes('"paymentStatus":"PAID"');
    expect(()=>p.promotion.payOrder(o.orderNo)).toThrow('storage');storage.failWrite=null;
    expect(p.app.user.usdtBalance).toBeCloseTo(before-19.9+5);p.bills.bills=[];storage.reads.clear();
    storage.failRead=(key,n)=>[ACCOUNT,BILLS].includes(key)&&n>1;
    p.promotion.payOrder(o.orderNo);expect(p.app.user.usdtBalance).toBeCloseTo(before-19.9+5);
    expect(p.bills.bills.filter(b=>b.type==='bonus'&&b.ref?.startsWith(o.orderNo))).toHaveLength(1);
  });
});
