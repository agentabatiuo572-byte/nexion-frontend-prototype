import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import type { BillDraft } from './bills';
import { readPrototypeStorage } from '@/lib/prototype-storage';

const h = vi.hoisted(() => ({ app: {} as any, bills: {} as any, orders: {} as any, voucher: {} as any, sponsor: '' }));
vi.mock('@/store/app', () => ({ useApp: () => h.app }));
vi.mock('@/store/bills', () => ({ useBills: () => h.bills }));
vi.mock('@/store/orders', () => ({ useOrders: () => h.orders }));
vi.mock('@/store/voucher', () => ({ useVoucher: () => h.voucher }));
vi.mock('@/store/sponsorship', () => ({ useSponsorship: () => ({ sponsorCode: h.sponsor }), normalizeRefCode:(value:string)=>value }));
vi.mock('@/store/v-rank', () => ({ useVRank: () => ({ myRank: 7, teamVolumeUSD: 100000 }) }));
vi.mock('@/store/network', () => ({ useNetwork: () => ({ members: [] }) }));
vi.mock('@/store/account-cloud', () => ({ normalizeAccountKey: (key: string) => key || 'default' }));
vi.mock('@/store/device-types', () => ({ createDevice: (kind: string,id: string,options: object) => ({kind,id,activatedAt:null,...options}) }));
vi.mock('@/mock/products', () => ({ getProduct: (id: string) => ['stellarbox-s1','cloud-share'].includes(id) ? {id,name:id,price:id==='stellarbox-s1'?649:19.9} : null, evaluatePurchaseGate: () => ({blocked:false}) }));
vi.mock('@/mock/vouchers', () => ({ computeVoucherDiscount: (voucher: {amount:number}) => voucher.amount, voucherAppliesToSku: () => true }));
vi.mock('@/store/product-availability', () => ({ isProductAvailable: () => true }));
vi.mock('@/store/product-phase', () => ({ resolveActivePhase: () => 'pre-listing' }));
vi.mock('@/store/ui', () => ({ toast: {error:vi.fn()} }));
vi.mock('@/i18n/use-t', () => ({ getT: () => ({errors:{}}) }));
vi.mock('@/store/mock-id', () => ({ mockServerId: () => 'TEST' }));
import { usePromotion } from './promotion';

const KEY='nexgrid-promotion-accounts-v1';
let disk:Record<string,any>, failWrite:((key:string,value:any)=>boolean)|null, failBill:boolean, failDevice:boolean;
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
beforeEach(() => {
  setActivePinia(createPinia()); disk={}; failWrite=null; failBill=false; failDevice=false; h.sponsor='';
  vi.stubGlobal('uni', {getStorageSync:(key:string)=>disk[key]===undefined?'':copy(disk[key]),getStorageInfoSync:()=>({keys:Object.keys(disk)}),setStorageSync:(key:string,value:any)=>{if(failWrite?.(key,value))throw new Error('disk full');disk[key]=copy(value);}});
  h.app=reactive({accountKey:'buyer',user:{joinedAt:0,usdtBalance:10000,nexBalance:0,withdrawableUsdt:9000},devices:[] as any[],
    withStrictPrototypeSnapshot<T>(run:()=>T):T{readPrototypeStorage('nexgrid-account-cloud-v1');this.persistAccountSnapshot();return run();},
    persistAccountSnapshot(){const money=disk['money:'+this.accountKey];if(money)Object.assign(this.user,money);else disk['money:'+this.accountKey]=copy(this.user);return true;},
    captureMoney(){return copy({usdtBalance:this.user.usdtBalance,nexBalance:this.user.nexBalance,withdrawableUsdt:this.user.withdrawableUsdt});},
    restoreMoney(snap:object){Object.assign(this.user,snap);disk['money:'+this.accountKey]=copy(this.user);return true;},
    debitBalance(amount:number){this.user.usdtBalance-=amount;this.user.withdrawableUsdt=Math.min(this.user.withdrawableUsdt,this.user.usdtBalance);disk['money:'+this.accountKey]=copy(this.user);return true;},
    debitNex(amount:number){this.user.nexBalance-=amount;disk['money:'+this.accountKey]=copy(this.user);return true;},
    creditBalance(amount:number){this.user.usdtBalance+=amount;disk['money:'+this.accountKey]=copy(this.user);return true;},
    creditNex(amount:number){this.user.nexBalance+=amount;disk['money:'+this.accountKey]=copy(this.user);return true;},
    restoreDevice(device:any){if(failDevice)return false;if(!this.devices.some(d=>d.id===device.id))this.devices.push(copy(device));return true;},
  });
  h.bills={bills:[] as any[],bindAccount(account:string){this.bills=copy(disk['nexgrid-bills-accounts-v1']?.[account]?.bills??[]);},addMany(drafts:BillDraft[]){if(failBill)return null;const records=drafts.map((d,i)=>({...d,id:`bill-${this.bills.length+i}`}));this.bills.push(...records);disk['nexgrid-bills-accounts-v1']={...(disk['nexgrid-bills-accounts-v1']??{}),[h.app.accountKey]:{bills:copy(this.bills)}};return records;},add(draft:BillDraft){return this.addMany([draft])?.[0]??null;}};
  h.bills.withStrictPrototypeSnapshot=(account:string,run:()=>unknown)=>{readPrototypeStorage('nexgrid-bills-accounts-v1');h.bills.bindAccount(account);return run();};
  h.orders={orders:[] as any[],upsertPromotionOrder(order:any){this.orders=[copy(order),...this.orders.filter((o:any)=>o.id!==order.id)];return true;}};
  h.voucher={claimedUnused:[] as any[],markUsed:vi.fn(()=>true),release:vi.fn(()=>true)};
});
function order(activity='purchase-gift',items=[{productNo:'cloud-share',quantity:2}]){const store=usePromotion();const quote=store.quote(items,activity);return {store,quote,order:store.createOrder(quote.quoteId,quote.quoteId)};}
afterEach(() => vi.unstubAllGlobals());

describe('prototype-sync local promotion transaction',()=>{
  it.each(['nexgrid-promotion-accounts-v1','nexgrid-bills-accounts-v1','nexgrid-account-cloud-v1'])('does not debit, issue or overwrite after a swallowed H5 read failure: %s', key => {
    const p=order(), before=JSON.stringify(disk), balance=h.app.user.usdtBalance;
    let failed=false;
    vi.stubGlobal('window',{localStorage:{getItem:(requested:string)=>{
      if(requested===key&&!failed){failed=true;throw new Error('transient');}
      return disk[requested]===undefined?null:JSON.stringify({type:'object',data:disk[requested]});
    }}});
    expect(()=>p.store.payOrder(p.order.orderNo)).toThrow('storage');
    expect(h.app.user.usdtBalance).toBe(balance);expect(h.app.devices).toHaveLength(0);expect(JSON.stringify(disk)).toBe(before);
  });
  it('persists a multi-SKU quote, order, payment, devices and gifts with stable identities',()=>{
    const p=order('purchase-gift',[{productNo:'stellarbox-s1',quantity:2},{productNo:'cloud-share',quantity:4}]);
    expect(p.quote.amountUsdt).toBe('1377.600000');expect(p.quote.expectedRewards.map(r=>r.groups)).toEqual([1,2]);
    const paid=p.store.payOrder(p.order.orderNo);expect(paid.paymentStatus).toBe('PAID');
    expect(h.app.user.usdtBalance).toBeCloseTo(8622.4);expect(h.app.devices).toHaveLength(9);
    expect(p.store.rewards).toHaveLength(3);expect(p.store.rewards.every(r=>r.state==='ISSUED')).toBe(true);
    expect(h.orders.orders[0].items).toHaveLength(2);expect(h.orders.orders[0].deviceIds).toHaveLength(6);
    p.store.payOrder(p.order.orderNo);expect(h.bills.bills).toHaveLength(1);expect(h.app.devices).toHaveLength(9);
    setActivePinia(createPinia());const restored=usePromotion();expect(restored.getOrder(p.order.orderNo)?.paymentStatus).toBe('PAID');
    restored.payOrder(p.order.orderNo);expect(h.bills.bills).toHaveLength(1);expect(h.app.devices).toHaveLength(9);
  });
  it('rejects insufficient funds without consuming voucher, rewarding or provisioning',()=>{
    const p=order();h.app.user.usdtBalance=1;
    expect(()=>p.store.payOrder(p.order.orderNo)).toThrow('balanceInsufficient');
    expect(h.app.user.usdtBalance).toBe(1);expect(h.bills.bills).toHaveLength(0);expect(h.app.devices).toHaveLength(0);
    expect(p.store.getOrder(p.order.orderNo)?.paymentStatus).toBe('PENDING');expect(p.store.rewards).toHaveLength(0);
  });
  it('does not resurrect a purchased or gifted device retired after completed fulfillment',()=>{
    const p=order();p.store.payOrder(p.order.orderNo);h.app.devices=[];
    p.store.payOrder(p.order.orderNo);expect(h.app.devices).toHaveLength(0);expect(h.bills.bills).toHaveLength(1);
    p.store.retryReward(p.store.rewards[0].obligationId);expect(h.app.devices).toHaveLength(0);
  });
  it('runs the real money-receipt rollback when receipt persistence fails',()=>{
    const p=order();const before=h.app.captureMoney();failBill=true;
    expect(()=>p.store.payOrder(p.order.orderNo)).toThrow('storage');expect(h.app.captureMoney()).toEqual(before);
    expect(h.bills.bills).toHaveLength(0);expect(h.app.devices).toHaveLength(0);
    failBill=false;p.store.payOrder(p.order.orderNo);expect(h.bills.bills).toHaveLength(1);
  });
  it('does not publish a quote or order when its account-row write fails',()=>{
    const store=usePromotion();failWrite=k=>k===KEY;
    expect(()=>store.quote([{productNo:'cloud-share',quantity:2}],'purchase-gift')).toThrow('storage');expect(store.orders).toHaveLength(0);
    failWrite=null;const q=store.quote([{productNo:'cloud-share',quantity:2}],'purchase-gift');failWrite=k=>k===KEY;
    expect(()=>store.createOrder(q.quoteId,'command')).toThrow('storage');expect(store.orders).toHaveLength(0);expect(h.bills.bills).toHaveLength(0);
  });
  it('recovers final-row persistence failure without charging or giving devices twice',()=>{
    const p=order();failWrite=(k,v)=>k===KEY&&v.buyer.orders.some((o:any)=>o.paymentStatus==='PAID');
    expect(()=>p.store.payOrder(p.order.orderNo)).toThrow('storage');expect(h.bills.bills).toHaveLength(1);expect(h.app.devices).toHaveLength(3);
    failWrite=null;setActivePinia(createPinia());const store=usePromotion();store.payOrder(p.order.orderNo);
    expect(h.bills.bills).toHaveLength(1);expect(h.app.devices).toHaveLength(3);expect(store.rewards).toHaveLength(1);
  });
  it('reloads persistent receipts and money before a second stale store retries an unfinished payment',()=>{
    const p=order();failWrite=(k,v)=>k===KEY&&v.buyer.orders.some((o:any)=>o.paymentStatus==='PAID');
    expect(()=>p.store.payOrder(p.order.orderNo)).toThrow('storage');const balance=h.app.user.usdtBalance;
    h.bills.bills=[];h.app.user.usdtBalance=10000;failWrite=null;setActivePinia(createPinia());const second=usePromotion();second.payOrder(p.order.orderNo);
    expect(h.app.user.usdtBalance).toBe(balance);expect(h.bills.bills).toHaveLength(1);expect(h.app.devices).toHaveLength(3);
  });
  it('retries a failed delivery using its original debit and original order',()=>{
    const p=order();failDevice=true;expect(()=>p.store.payOrder(p.order.orderNo)).toThrow('storage');expect(h.bills.bills).toHaveLength(1);
    failDevice=false;p.store.payOrder(p.order.orderNo);expect(h.bills.bills).toHaveLength(1);expect(h.app.devices).toHaveLength(3);
  });
  it('enforces first-purchase qualification across two pending orders before debiting',()=>{
    const a=order('first-purchase',[{productNo:'cloud-share',quantity:1}]);const b=order('first-purchase',[{productNo:'cloud-share',quantity:1}]);
    a.store.payOrder(a.order.orderNo);const balance=h.app.user.usdtBalance;
    expect(()=>b.store.payOrder(b.order.orderNo)).toThrow('ineligible');expect(h.app.user.usdtBalance).toBe(balance);
    expect(a.store.rewards[0].reward.type).toBe('USDT');expect(h.bills.bills.filter((b:any)=>b.type==='bonus')).toHaveLength(1);
  });
  it('enforces per-person group limits changed in local activity configuration',()=>{
    const p=order();disk[KEY].buyer.activities[0].rewardRules.forEach((r:any)=>r.maxGroupsPerPerson={mode:'LIMITED',value:1});
    const b=order();p.store.payOrder(p.order.orderNo);expect(()=>b.store.payOrder(b.order.orderNo)).toThrow('ineligible');
    expect(h.bills.bills.filter((b:any)=>b.type==='purchase')).toHaveLength(1);
  });
  it('persists both invitation roles to their owners and settles the inviter once',()=>{
    h.sponsor='INVITER';disk['nexgrid-account-cloud-v1']={inviter:{user:{referralCode:'INVITER'}}};
    const p=order('invite-first-purchase',[{productNo:'cloud-share',quantity:1}]);p.store.payOrder(p.order.orderNo);
    expect(p.store.rewards[0].reward.type).toBe('USDT');expect(disk[KEY].inviter.rewards[0].reward.type).toBe('NEX');
    h.app.accountKey='inviter';p.store.refresh();expect(p.store.orders).toHaveLength(0);expect(p.store.rewards[0].beneficiaryRole).toBe('DIRECT_INVITER');
    p.store.retryReward(p.store.rewards[0].obligationId);p.store.retryReward(p.store.rewards[0].obligationId);expect(h.app.user.nexBalance).toBe(7);
  });
  it('uses command identity for create, preserves cancellation, and rejects cross-account reads',()=>{
    const p=order();expect(p.store.createOrder(p.quote.quoteId,p.quote.quoteId).orderNo).toBe(p.order.orderNo);expect(p.store.orders).toHaveLength(1);
    p.store.cancelOrder(p.order.orderNo);expect(()=>p.store.payOrder(p.order.orderNo)).toThrow('unavailable');
    h.app.accountKey='other';expect(p.store.getOrder(p.order.orderNo)).toBe(null);expect(p.store.rewards).toHaveLength(0);
  });
});
