import { describe, expect, it } from 'vitest';
import type { ApiClient } from './api-client';
import { parseProductCatalogPayload } from './product-catalog-contract';
import { createQuestApi } from './quest-api';
import { createEventsApi } from './events-api';
import { createEventDetailApi } from './event-detail-api';
import { createGenesisApi } from './genesis-api';
import { createPointsApi } from './points-api';
import { createVoucherApi } from './voucher-api';
import { createTrialApi } from './trial-api';
import { createWalletBillsApi } from './wallet-bills-api';
import { createTeamNetworkApi } from './team-network-api';
import { createReferralRewardApi } from './referral-reward-api';
import { createPlatformConfigApi } from './platform-config-api';
import { createOrderApi } from './order-api';
import { createTrustSectionApi } from './trust-section-api';
import { createPromotionApi } from './promotion-api';
import { createTeamInsightsApi } from './team-insights-api';
import { createGenesisRaffleApi } from './genesis-raffle-api';
import { createDeviceE3Api } from './device-e3-api';
import { createMarketApi } from './market-api';
import { createEarningsReleaseApi } from './earnings-release-api';
import { createNotificationApi } from './notification-api';
import { createGoalsApi } from './goals-api';
import { createTaskAssignmentApi } from './task-assignment-api';
import { createPaymentMethodApi } from './payment-method-api';
import { createProfileApi } from './profile-api';
import { createPayoutAddressApi } from './payout-address-api';
import { createNotificationPreferencesApi } from './notification-preferences-api';
import { createBankWithdrawalApi } from './bank-withdrawal-api';
import { createPurchaseEligibilityApi } from './purchase-eligibility-api';
import { createTeamQuotaApi } from './team-quota-api';
import { directBankBindingAvailable } from '../lib/bank-binding-form';
// Development fixture remains outside the production dependency graph.
const { demoFixture, demoDefaults } = await import(new URL('../../scripts/lib/prototype-demo-data.mjs',import.meta.url).href);
function demo(locale='zh',patch:Record<string,unknown>={}) {
  const state={...structuredClone(demoDefaults),...patch};
  const get=(path:string,body?:unknown,method='GET')=>demoFixture(new URL(path,'http://127.0.0.1:5190'),locale,state,{postDataJSON:()=>body,method:()=>method});
  const client={request:async(input:{path:string;body?:unknown;method?:string})=>get(input.path,input.body,input.method||'GET')} as ApiClient;
  return {state,get,client};
}
describe('isolated prototype data uses the real read contracts',()=>{
  it('permits all six demo purchases through both eligibility policies and exposes restricted conditions',async()=>{
    const d=demo(),api=createPurchaseEligibilityApi(d.client);
    for(const p of d.get('/api/store/catalog').products)expect((await api.get(p.id)).eligible).toBe(true);
    d.state.catalogState='restricted';expect((await api.get('stellarbox-s1')).eligible).toBe(false);
    expect((await createTeamQuotaApi(d.client).snapshot()).tiers).toHaveLength(5);
  });
  it('opens personal-center goals, receipts and cards through their real contracts',async()=>{
    const d=demo(),goals=createGoalsApi(d.client),receipts=createTaskAssignmentApi(d.client,'prod');
    expect((await goals.list()).goals).toHaveLength(2);
    const goal=await goals.create({targetUsdt:2000,deadlineAt:Date.now()+86400000*60,idempotencyKey:'demo-goal-create'});
    expect((await goals.setStatus(goal.id,true)).achieved).toBe(true);await goals.remove(goal.id);
    expect((await goals.list()).goals).toHaveLength(2);
    expect((await goals.recommendation(1000,Date.now()+86400000*30)).productNo).toBe('stellarbox-pro');
    expect((await receipts.receipts()).items).toHaveLength(3);expect((await receipts.receipt('DEMO-RECEIPT-1')).rewardUsdt).toBe(2.34);
    expect((await createPaymentMethodApi(d.client).list())[0].last4).toBe('4242');
    expect(await createProfileApi(d.client).nicknameCandidates()).toHaveLength(6);
    expect(await createProfileApi(d.client).profile()).toEqual({nickname:'Alex',avatarUrl:'',avatarRevision:'',language:'zh'});
    expect((await createPayoutAddressApi(d.client,'prod').list()).addresses).toHaveLength(0);
    const preferences=createNotificationPreferencesApi(d.client);expect((await preferences.get()).market).toBe(true);
    await preferences.patch({market:false});expect((await preferences.get()).market).toBe(false);
    const bank = createBankWithdrawalApi(d.client);
    expect((await bank.config()).beneficiary?.maskedAccount).toBe('••••4242');
    expect(directBankBindingAvailable(await bank.config())).toBe(true);
    d.state.dataState='empty';
    expect(directBankBindingAvailable(await bank.config())).toBe(true);
  });
  it('switches a paid purchase into a valid empty fleet and back',async()=>{
    const d=demo(),orders=createOrderApi(d.client),fleet=createDeviceE3Api(d.client);
    const order=await orders.create({productNo:'stellarbox-s1',quantity:1,idempotencyKey:'before-empty'});await orders.pay(order.orderNo,'pay-before-empty');
    d.state.dataState='empty';expect((await fleet.fleet()).devices).toHaveLength(0);expect((await orders.list()).orders).toHaveLength(0);
    d.state.dataState='normal';expect((await fleet.fleet()).devices).toHaveLength(3);
  });
  it('accepts swipe actions and reads back bulk read and clear actions',async()=>{
    const d=demo(),api=createNotificationApi(d.client);
    expect((await api.recordAction(902,'swipe_conversion','demo-swipe-key')).action).toBe('swipe_conversion');
    expect(await api.markAllRead()).toBe(3);expect((await api.page()).unread).toBe(0);
    expect(await api.clearRead()).toBe(5);expect((await api.page()).items).toHaveLength(0);
  });
  it('loads fleet, device-specific checkout capacity, market and release balances',async()=>{
    const d=demo(),devices=createDeviceE3Api(d.client);
    expect((await devices.fleet()).devices).toHaveLength(2);
    expect((await devices.tradeinConfig()).enabled).toBe(false);
    expect((await devices.capacityQuote('stellarbox-pro')).targetPriceUsdt).toBe(4999);
    expect((await devices.capacityQuote('stellarbox-pro')).sufficientFunds).toBe(true);
    expect((await createMarketApi(d.client).fetch()).currentPrice).toBe(.128);
    expect((await createEarningsReleaseApi(d.client).status()).buckets.bonus_locked).toBe(50);
  });
  it('keeps new purchases pending after paying an existing sample order',async()=>{
    const d=demo(),orders=createOrderApi(d.client);await orders.pay('DEMO-ORDER-001','pay-existing');
    const receipt=await orders.create({productNo:'stellarbox-pro',quantity:1,idempotencyKey:'new-pro'});
    expect((await orders.list()).orders[0].paymentStatus).toBe('PENDING');
    const before=d.get('/api/devices/earnings').walletUsdt;await orders.pay(receipt.orderNo,'pay-new');
    expect(d.get('/api/devices/earnings').walletUsdt).toBe(before-4999);
  });
  it('caps a voucher at the payable amount and returns its redemption receipt',async()=>{
    const d=demo('zh',{voucherClaimed:true}),promotions=createPromotionApi(d.client),orders=createOrderApi(d.client);
    const quote=await promotions.quote([{productNo:'cloud-share',quantity:1}],null,'V-DESIGN');expect(quote.amountUsdt).toBe('0.00');
    const receipt=await orders.create({productNo:'cloud-share',quantity:1,voucherId:'V-DESIGN',idempotencyKey:'voucher-share'});
    expect(receipt.voucherRedemption).toMatchObject({status:'REDEEMED',discountUsdt:19.9});
    expect((await orders.pay(receipt.orderNo,'pay-voucher')).paymentMethod).toBe('VOUCHER');
    expect((await orders.list()).orders[0].paymentMethod).toBe('VOUCHER');
  });
  it('resets trial without retaining a mutated base fixture',async()=>{
    const d=demo('zh',{benefitState:'grace'});await createTrialApi(d.client).state();
    Object.assign(d.state,structuredClone(demoDefaults));expect((await createTrialApi(d.client).state()).status).toBe('none');
  });
  it('claims day-one and weekly tasks independently with matching rewards',async()=>{
    const d=demo('zh',{taskState:'complete'});d.get('/api/quests/review-task-1/claim',{},'POST');
    const tasks=(await createQuestApi(d.client).state('zh')).quests;
    expect(tasks.filter(t=>t.questCode.startsWith('demo-week-')).every(t=>t.status==='CLAIMABLE')).toBe(true);
    expect(d.get('/api/quests/demo-week-3/claim',{},'POST').rewardNex).toBe(175);
  });
  it('marks only the selected notification read and preserves its destination',()=>{
    const d=demo();d.get('/api/notifications/901/read',{},'POST');expect(d.get('/api/notifications').unread).toBe(2);
    expect(d.get('/api/notifications/902/actions',{},'POST').route).toBe('/pages/store/orders');
  });
  it('reads team commissions, leaderboard, pools, raffle and all reward statuses',async()=>{
    const d=demo(),team=createTeamInsightsApi(d.client);
    expect((await team.commissions()).events).toHaveLength(4);
    expect((await team.leaderboard('month')).rows).toHaveLength(5);
    expect((await team.unilevel('month')).events).toHaveLength(3);
    expect((await team.unilevel('month',1,20,null,'direct')).events).toHaveLength(1);
    expect((await team.leadershipPool()).totalVotes).toBe(40);
    expect((await createPromotionApi(d.client).rewards()).items).toHaveLength(10);
    const raffle=createGenesisRaffleApi(d.client);expect((await raffle.state()).draws).toHaveLength(3);
    await raffle.enter('demo-draw-0',1,'demo-enter');expect((await raffle.state()).availableTickets).toBe(2);
  });
  it.each([false,true])('creates, pays and reads back a simulated purchase (bundle=%s)',async bundle=>{
    const d=demo(),api=createPromotionApi(d.client),orders=createOrderApi(d.client);
    const quote=await api.quote(bundle?[{productNo:'stellarbox-s1',quantity:1},{productNo:'cloud-share',quantity:2}]:[{productNo:'stellarbox-pro',quantity:1}],'demo-promo-0');
    const order=await api.create(quote,'demo-create');
    expect((await orders.list()).orders).toHaveLength(11);
    await api.pay(order.orderNo,'demo-pay');
    expect((await api.findOrder(order.orderNo))?.paymentStatus).toBe('PAID');
    expect((await orders.list()).orders[0].canonicalStatus).toBe('activated');
    const balance=d.get('/api/devices/earnings').walletUsdt;
    await api.pay(order.orderNo,'demo-pay');expect(d.get('/api/devices/earnings').walletUsdt).toBe(balance);
    expect(d.get('/api/devices/earnings').devices).toHaveLength(bundle?5:3);
  });
  it('loads public platform and referral configuration',async()=>{
    const d=demo();await expect(createPlatformConfigApi(d.client).platformConfig()).resolves.toBeTruthy();
  });
  it('loads every order state, trust sections and purchase promotion template',async()=>{
    const d=demo();
    expect((await createOrderApi(d.client).list()).orders).toHaveLength(10);
    expect((await createTrustSectionApi(d.client).current())).toHaveLength(6);
    expect((await createPromotionApi(d.client).list()).items).toHaveLength(5);
    expect((await createPromotionApi(d.client).get('demo-promo-1')).template).toBe('FIRST_PURCHASE');
  });
  it.each(['phased','available','soldout','restricted'])('contains all six SKUs in %s',mode=>{
    const d=demo('zh',{catalogState:mode}),catalog=parseProductCatalogPayload(d.get('/api/store/catalog'));
    expect(catalog.products).toHaveLength(6);
    expect(new Set(catalog.products.map(p=>p.id)).size).toBe(6);
    expect(catalog.products.filter(p=>p.available)).toHaveLength(mode==='phased'?4:6);
  });
  it.each(['zh','en','vi'])('parses tasks, all activity types, daily rewards and team data in %s',async locale=>{
    const d=demo(locale);
    expect((await createQuestApi(d.client).state(locale)).quests).toHaveLength(10);
    const events=await createEventsApi(d.client).state(locale);
    expect(events.events).toHaveLength(8);
    expect(new Set(events.events.map(e=>e.kind)).size).toBe(8);
    expect((await createEventDetailApi(d.client).detail('demo-invite',locale)).userStatus).toBe('JOINED');
    const daily=await createPointsApi(d.client).state();
    expect(daily.badgeAchievements).toHaveLength(6);expect(daily.dailyMilestones).toHaveLength(4);
    expect((await createTeamNetworkApi(d.client).snapshot()).members).toHaveLength(8);
    expect((await createReferralRewardApi(d.client).snapshot()).referralCode).toBe('UVEL-DEMO');
  });
  it.each(['pending','complete','claimed','expired','empty','legacy'])('reads task state %s without bypassing parsing',async taskState=>{
    const d=demo('zh',{taskState});
    const result=await createQuestApi(d.client).state('zh');
    expect(result.quests.length).toBe(taskState==='empty'?0:10);
  });
  it.each(['available','claimed','grace','finished'])('reads benefit state %s',async benefitState=>{
    const d=demo('zh',{benefitState});
    const trial=await createTrialApi(d.client).state();
    expect(trial.status).toBe(({available:'none',claimed:'active',grace:'grace',finished:'converted'} as const)[benefitState as 'available']);
    const vouchers=await createVoucherApi(d.client).state();
    expect(vouchers.vouchers).toHaveLength(benefitState==='finished'?0:1);
  });
  it('keeps Genesis visible and closed for sales',async()=>{
    const d=demo();
    const result=await createGenesisApi(d.client).state();
    expect(result).toMatchObject({showcaseEnabled:true,marketOpenState:'closed',tradeAvailable:false});
    expect(result.sale.open).toBe(false);
  });
  it('can join and claim an event, and read back each simulated state',async()=>{
    const d=demo('zh',{eventState:'available'}),api=createEventsApi(d.client);
    await api.join('demo-invite','demo-join');
    expect((await api.state('zh')).events.find(e=>e.eventCode==='demo-invite')?.userStatus).toBe('JOINED');
    d.state.eventState='claimable';delete d.state.eventStatuses['demo-invite'];
    await api.claim('demo-invite','demo-claim');
    expect((await api.state('zh')).events.find(e=>e.eventCode==='demo-invite')?.userStatus).toBe('CLAIMED');
  });
  it('returns one simulated spin and a matching history readback',async()=>{
    const d=demo(),api=createEventsApi(d.client);
    expect((await api.spinState('demo-spin')).availableSpins).toBe(1);
    await api.spin('demo-spin','demo-spin-key');
    expect((await api.spinState('demo-spin')).history).toHaveLength(1);
    expect((await api.spinState('demo-spin')).availableSpins).toBe(0);
  });
  it('reads wallet summaries and records through normal parsing',async()=>{
    const d=demo(),api=createWalletBillsApi(d.client);
    expect((await api.summary()).monthBillCount).toBe(4);
    expect((await api.list()).bills).toHaveLength(4);
  });
});
