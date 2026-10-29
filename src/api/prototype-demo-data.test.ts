import { createProofApi } from "./proof-api";
import { createStorefrontActivityApi } from './storefront-activity-api';
import { createEarnConfigApi } from './earn-config-api';
import { parseAppHomeOverview } from './app-home-api';
import { createDirectReferralApi } from "./direct-referral-api";
import { describe, expect, it } from 'vitest';
import type { ApiClient } from './api-client';
import { parseProductCatalogPayload } from './product-catalog-contract';
import { createQuestApi } from './quest-api';
import { createEventsApi } from './events-api';
import { createEventDetailApi } from './event-detail-api';
import { createGenesisApi } from './genesis-api';
import { createPointsApi } from './points-api';
import { createLearningApi } from './learning-api';
import { createExchangeApi } from './exchange-api';
import { createRepurchaseApi } from './repurchase-api';
import { createPaymentApi } from './payment-api';
import { createCregisDepositApi } from './cregis-deposit-api';
import { createWithdrawalApi } from './withdrawal-api';
import { createVoucherApi } from './voucher-api';
import { createTrialApi } from './trial-api';
import { createWalletBillsApi } from './wallet-bills-api';
import { createTeamNetworkApi } from './team-network-api';
import { createReferralRewardApi } from './referral-reward-api';
import { createPlatformConfigApi } from './platform-config-api';
import { createOrderApi } from './order-api';
import { createBundleOrderApi } from './bundle-order-api';
import { createBundleDiscountApi } from './bundle-discount-api';
import { createCommissionConfigApi } from './commission-config-api';
import { createCommissionGuideApi } from './commission-guide-api';
import { buildCommissionsHowContent, COMMISSIONS_HOW_SLOTS } from '../lib/commissions-how-content';
import { createVRankApi } from './v-rank-api';
import { createRankHowPolicyApi } from './rank-how-policy-api';
import { createSupportApi } from './support-api';
import { createNetworkRegionsApi } from './network-regions-api';
import { createDeveloperDocsApi } from './developer-docs-api';
import { createDeveloperAccessApi } from './developer-access-api';
import { createDeveloperResourcesApi } from './developer-resources-api';
import { createAmbassadorApplicationApi } from './ambassador-application-api';
import { createPrivacyPolicyApi } from './privacy-policy-api';
import { createLegalTermsApi } from './legal-terms-api';
import { createRiskDisclosureApi } from './risk-disclosure-api';
import { createHowContentApi } from './how-content-api';
import { createPublicSponsorPreviewApi } from './public-sponsor-preview-api';
import { buildRankHowContent } from '../lib/rank-how-content';
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
import { resolvePurchaseEligibilityMessage, purchaseEligibilityUnlockHref } from '../lib/purchase-eligibility-copy';
import { createTeamQuotaApi } from './team-quota-api';
import { directBankBindingAvailable } from '../lib/bank-binding-form';
// Development fixture remains outside the production dependency graph.
const { demoFixture, demoDefaults } = await import(new URL('../../scripts/lib/prototype-demo-data.mjs',import.meta.url).href);
function demo(locale='zh',patch:Record<string,unknown>={}) {
  const state={...structuredClone(demoDefaults),...patch};
  const get=(path:string,body?:unknown,method='GET',key?:string)=>demoFixture(new URL(path,'http://127.0.0.1:5190'),locale,state,{postDataJSON:()=>body,method:()=>method,headers:()=>({'idempotency-key':key})});
  const client={request:async(input:{path:string;body?:unknown;method?:string;idempotencyKey?:string})=>get(input.path,input.body,input.method||'GET',input.idempotencyKey)} as ApiClient;
  return {state,get,client};
}
describe('prototype account readbacks', () => {
  it('saves a nickname, handles a repeated save, and preserves language', async () => {
    const d = demo();
    const api = createProfileApi(d.client);
    expect((await api.profile()).nickname).toBe('Alex');
    await expect(api.updateNickname('Alex', 'Silver River 42', 'demo-profile')).resolves.toBe('Silver River 42');
    await expect(api.updateNickname('Alex', 'Silver River 42', 'demo-profile')).resolves.toBe('Silver River 42');
    await expect(api.updateNickname('Alex', 'Golden River 43', 'demo-conflict')).rejects.toThrow('PROFILE_NICKNAME_CONFLICT');
    await expect(api.updateLanguage('vi')).resolves.toBe('vi');
    expect(await api.profile()).toMatchObject({ nickname: 'Silver River 42', language: 'vi' });
  });
  it('provides settled micro-amount examples and a truly empty ledger', () => {
    const d = demo();
    const data = parseAppHomeOverview(d.get('/api/app/home/overview'));
    expect(data.earningsLedger.map(row => row.rewardUsdt)).toEqual([2.34, .00032, .00005]);
    d.state.dataState = 'empty';
    expect(parseAppHomeOverview(d.get('/api/app/home/overview')).earningsLedger).toEqual([]);
  });
  it('keeps the proof streak consistent with the check-in source', async () => {
    for (const patch of [{}, { checkedIn: true }, { streakState: 'broken' }, { streakState: 'broken', saverUsed: true }, { streakState: 'broken', saverUsed: true, checkedIn: true }]) {
      const d = demo('zh', patch);
      expect(d.get('/api/app/proof').currentStreak).toBe(d.get('/api/points/state').streak.currentStreak);
      expect(d.get('/api/app/proof').longestStreak).toBe(d.get('/api/points/state').streak.longestStreak);
    }
  });
});

describe('restored storefront sales proof', () => {
  it('supplies validated phone tiers for the phone comparison', async () => {
    const result = await createEarnConfigApi(demo().client).phoneTiers();
    expect(result.tiers).toHaveLength(5);
    expect(result.tiers.find(row => row.tier === 3)?.baseRateUsdt).toBe(.06);
  });
  it('provides the requested sales window without changing demo state', async () => {
    const d = demo();
    const before = structuredClone(d.state);
    const result = await createStorefrontActivityApi(d.client).socialProof('stellarbox-pro', 30);
    expect(result).toMatchObject({ productName: 'UVELBox Pro', windowDays: 30, cumulativeSales: 55, windowSales: 18 });
    expect(d.state).toEqual(before);
    const empty = demo('zh', { dataState: 'empty' });
    expect(await createStorefrontActivityApi(empty.client).socialProof('stellarbox-pro', 7))
      .toMatchObject({ windowDays: 7, cumulativeSales: 0, windowSales: 0 });
  });
});

describe('prototype team-guide publications', () => {
  const keys = ['team-unilevel-how', 'team-binary-how', 'team-commissions-how'] as const;
  it.each(['zh', 'en', 'vi'])('publishes all three %s default documents through the real parser', async locale => {
    const d = demo('en');
    const before = structuredClone(d.state);
    for (const key of keys) {
      const document = await createHowContentApi(d.client).published(key, locale);
      expect(document).toMatchObject({ contentKey: key, locale, status: 'PUBLISHED', versionSource: 'ENTRY' });
      expect(document.blocks[0].id).toBe('hero');
      expect(new Set(document.blocks.map(block => block.id)).size).toBe(document.blocks.length);
      expect(document.blocks.length).toBeGreaterThanOrEqual(4);
      expect(document.blocks.every(block => block.title.trim() && block.body.trim())).toBe(true);
      const publicText = document.blocks.flatMap(block => [block.title, block.body, ...(block.items ?? [])]).join('\n');
      expect(publicText).not.toMatch(/\bL\d+\b|层级|逐层|(?:奖励|收益|等级)深度|\blevels?\b|\bdepth\b|độ sâu|cấp (?:mời|nguồn|gián tiếp)/i);
      if (key !== 'team-commissions-how') {
        expect(publicText).not.toMatch(/\{[^{}]+\}/);
      }
      if (key === 'team-unilevel-how') {
        expect(document).toMatchObject({ schemaVersion: 2, templateId: 'unilevel-v2' });
        expect(document.blocks.map(block => block.id)).toEqual(expect.arrayContaining(['direct-referral-scope', 'seven-layer-scope']));
        // Default copy: purchase and device-earning rewards explained without layers, rates or caps.
        expect(document.blocks.find(block => block.id === 'direct-referral-scope')!.body)
          .toMatch(/不影响好友自己的收益|without reducing their earnings|không làm giảm thu nhập của họ/);
        expect(publicText).not.toMatch(/\d+(?:[.,]\d+)?\s*%/);
      }
    }
    expect(d.state).toEqual(before);
  });

  it.each(['zh', 'en', 'vi'])('renders every %s commissions slot using parsed policy, guide and ranks', async locale => {
    const d = demo(locale);
    const [document, directPolicy, guide, ladder] = await Promise.all([
      createHowContentApi(d.client).published('team-commissions-how', locale),
      createDirectReferralApi(d.client).policy(), createCommissionGuideApi(d.client).read(), createVRankApi(d.client).ladder(),
    ]);
    expect(document).toMatchObject({ schemaVersion: 2, templateId: 'commissions-v2' });
    const view = buildCommissionsHowContent({ document, directPolicy, guide, ranks: ladder.ranks }, locale);
    expect(view.incomplete).toBe(false);
    expect(document.blocks.map(block => block.id)).toEqual(COMMISSIONS_HOW_SLOTS);
    for (const id of COMMISSIONS_HOW_SLOTS) {
      const section = view.section(id);
      expect(section.available, id).toBe(true);
      expect(section.body.trim(), id).not.toBe('');
      expect(section.title + section.body, id).not.toMatch(/\{[^{}]+\}/);
    }
    const network = view.section('network').body;
    for (const rate of ['10%', '60%', '40%', '5%', '70%', '30%']) expect(network).toContain(rate);
    expect(view.section('faq-cultivation').body).toMatch(/邀请这位好友的人|The person who invited that friend|Người đã mời người bạn đó/);
    // Payout mechanics (caps, unmatched-volume handling) stay out of the public guide.
    expect(view.section('binary').body).not.toMatch(/上限|清零|cap|reset|giới hạn|xóa/i);
    expect(view.amounts.network).toBe(view.copy.pendingAmount);
    expect(view.amounts.cultivation).toContain('10.00 UVT');
    expect(view.exampleTotal).toBe(view.copy.noTotal);
  });

  it.each(['zh', 'en', 'vi'])('reuses the active %s demo facts and never derives dollars from point counts', async locale => {
    const d = demo(locale);
    const [guide, binary, ranks, pool, document] = await Promise.all([
      createCommissionGuideApi(d.client).read(), createCommissionConfigApi(d.client).binary(),
      createVRankApi(d.client).ladder(), createTeamInsightsApi(d.client).leadershipPool(),
      createHowContentApi(d.client).published('team-binary-how', locale),
    ]);
    expect(guide.binary).toEqual({ threshold: binary.threshold, matchRate: binary.matchRate, dailyCap: binary.dailyCap, settlePeriod: binary.settlePeriod, residualPolicy: binary.residualPolicy, paused: binary.paused });
    expect(guide.capabilities).toEqual(ranks.capabilities);
    expect(guide.leadership).toMatchObject({ rate: pool.injectRate, minRank: pool.unlockRank, monthlyCap: 1000 });
    expect(guide.coolingDays).toBeNull();
    expect(Object.values(guide.network)).toEqual([null, null, null]);
    // The default guide explains how to earn; live amounts stay on the reward page.
    expect(document.blocks.find(block => block.id === 'how-to-earn')!.items).toHaveLength(3);
    expect(JSON.stringify(document.blocks)).not.toContain(`${binary.estimatedAmountUsdt} USDT`);
  });

  it.each(['zh', 'en', 'vi'])('keeps %s empty-account publications readable without creating paid rewards', async locale => {
    const d = demo(locale, { dataState: 'empty' });
    const [document, directPolicy, guide, ladder] = await Promise.all([
      createHowContentApi(d.client).published('team-commissions-how', locale),
      createDirectReferralApi(d.client).policy(), createCommissionGuideApi(d.client).read(), createVRankApi(d.client).ladder(),
    ]);
    const view = buildCommissionsHowContent({ document, directPolicy, guide, ranks: ladder.ranks }, locale);
    expect(view.incomplete).toBe(false);
    expect(directPolicy.configured).toBe(false);
    expect(view.amounts.network).toBe(view.copy.notConfigured);
    expect((await createHowContentApi(d.client).published('team-binary-how', locale)).blocks.length).toBeGreaterThan(0);
  });

  it('limits the new module to read-only guide routes and follows changed fixture facts', async () => {
    const { teamGuidesDemo } = await import(new URL('../../scripts/lib/prototype-demo-team-guides.mjs', import.meta.url).href);
    const d = demo();
    const read = (path: string) => {
      const facts = d.get(path);
      if (path === '/api/team/binary') return { ...facts, estimatedAmountUsdt: 3.21, matchRate: .07125 };
      if (path.startsWith('/api/config/commission/direct-referral')) return { ...facts, purchase: { ...facts.purchase, totalRatePct: 12.5, coolingDays: 11 } };
      return facts;
    };
    const request = { method: () => 'GET' };
    const guide = teamGuidesDemo(new URL('http://prototype.invalid/api/config/commission/guide?schemaVersion=2'), 'en', request, read);
    expect(guide.binary.matchRate).toBe(.07125);
    const doc = teamGuidesDemo(new URL('http://prototype.invalid/api/content/how-it-works/team-binary-how?locale=en'), 'zh', request, read);
    expect(doc.locale).toBe('en');
    // The default guides defer live rates to the reward pages instead of repeating them.
    expect(JSON.stringify(doc.blocks)).not.toMatch(/7\.125%|3\.21 USDT/);
    const shouldNotRead = () => { throw new Error('Unrelated route read'); };
    expect(teamGuidesDemo(new URL('http://prototype.invalid/api/content/how-it-works/genesis-how'), 'en', request, shouldNotRead)).toBeUndefined();
    expect(teamGuidesDemo(new URL('http://prototype.invalid/api/config/commission/guide'), 'en', { method: () => 'POST' }, shouldNotRead)).toBeUndefined();
  });
});

describe('isolated prototype data uses the real read contracts',()=>{
  it('supports prototype application readback and idempotent submission without real services',async()=>{
    const d=demo('zh',{highestRank:true});
    const api=createAmbassadorApplicationApi(d.client);
    const input={eventDate:'2026-11-15',city:'Hanoi',budgetUsdt:1000,bucket:'venue' as const};
    const submitted=await api.submit(input,'demo-application-1');
    expect(submitted.status).toBe('PENDING');
    expect(await api.submit(input,'demo-application-1')).toEqual(submitted);
    expect(await api.latest()).toEqual(submitted);
    expect(await api.history()).toEqual([submitted]);
    await expect(api.submit(input,'demo-application-2')).rejects.toThrow('AMBASSADOR_APPLICATION_PENDING');
    await expect(createAmbassadorApplicationApi(demo().client).submit(input,'locked')).rejects.toThrow('DEMO_APPLICATION_RANK_REQUIRED');
  });
  it.each(['pending','approved','rejected'])('exposes the prototype %s application state through the real parser',async status=>{
    const api=createAmbassadorApplicationApi(demo('en',{ambassadorState:status}).client);
    expect((await api.latest()).status).toBe(status.toUpperCase());
    expect(await api.history()).toHaveLength(1);
  });
  it.each(['zh','en','vi'])('loads auxiliary read-only samples in %s',async locale=>{
    const d=demo(locale);
    expect((await createSupportApi(d.client).faqPage(locale)).items).toHaveLength(4);
    expect((await createTaskAssignmentApi(d.client,"prod").state()).devices[0].recentTasks[0].receiptNo).toBe('DEMO-RECEIPT-1');
    expect((await createNetworkRegionsApi(d.client).list()).regions).toHaveLength(3);
    // The developer docs sample mirrors the backend's shipped default publication.
    expect((await createDeveloperDocsApi(d.client).published(locale)).endpoints).toHaveLength(6);
    expect((await createDeveloperAccessApi(d.client).latest())?.status).toBe('APPROVED');
    expect(await createDeveloperResourcesApi(d.client).listKeys()).toHaveLength(1);
    expect(await createDeveloperResourcesApi(d.client).listWebhooks()).toHaveLength(1);
    expect((await createAmbassadorApplicationApi(d.client).policy()).buckets).toHaveLength(4);
    expect((await createAmbassadorApplicationApi(d.client).latest()).status).toBe('NONE');
    expect((await createPrivacyPolicyApi(d.client).current(locale)).sections).toHaveLength(9);
    expect((await createLegalTermsApi(d.client).current(locale,'GLOBAL')).provenance).toBe('prototype-sample');
    expect((await createRiskDisclosureApi(d.client).publicCurrent('GLOBAL')).chapters).toHaveLength(7);
    expect((await createRiskDisclosureApi(d.client).current()).acknowledgmentToken).toBeNull();
    expect((await createHowContentApi(d.client).published('wallet-exchange-how',locale)).blocks).toHaveLength(4);expect((await createHowContentApi(d.client).published('wallet-repurchase-how',locale)).blocks).toHaveLength(4);
    expect((await createTaskAssignmentApi(d.client,"prod").receipt('DEMO-RECEIPT-1')).proofHash).toHaveLength(64);
    expect((await createPublicSponsorPreviewApi(d.client).preview('UVELDEMO')).gift.status).toBe('DISABLED');
  });
  it('provides finance read models through the published parsers',async()=>{
    const d=demo();
    expect((await createExchangeApi(d.client).fetchState()).orders).toHaveLength(1);
    expect((await createRepurchaseApi(d.client).fetchConfig()).minAmountUsdt).toBe(50);
    expect((await createRepurchaseApi(d.client).fetchOrders()).orders).toHaveLength(1);
    expect((await createWithdrawalApi(d.client).policy()).minAmount).toBe(50);
    expect(await createWithdrawalApi(d.client).list()).toHaveLength(2);
    expect((await createWithdrawalApi(d.client).get('WD-DEMO-1')).withdrawal?.withdrawalNo).toBe('WD-DEMO-1');
    expect((await createWithdrawalApi(d.client).eligibility({amount:100,chain:'USDT-BEP20',address:'0x'+'1'.repeat(40),policyVersion:'money-policy'})).canSubmit).toBe(true);
    const bank=createPaymentApi(d.client);
    expect((await bank.config()).vietQr.feeUsdt).toBe(.123456);
    expect((await bank.fxQuote()).quoteRateVndPerUsdt).toBe(25000);
    expect(await bank.listVietQrIntents()).toHaveLength(0);
    expect((await bank.listVietQrReceipts()).items).toHaveLength(1);
    expect((await createCregisDepositApi(d.client).address()).confirmations).toBe(15);
    expect(await createCregisDepositApi(d.client).list()).toHaveLength(1);
  });
  it('supports failed quiz, retry, receipt recovery and recommendation readback',async()=>{
    const d=demo(),api=createLearningApi(d.client),id='review-course-3';
    const course = await api.course(id,'zh');
    expect(course.questions).toHaveLength(2);
    expect(course.body).toContain('验证码');
    expect(course.questions[0].question).toContain('验证码');
    const failed=await api.submitQuiz(id,'v1',[1,0],'demo-quiz-failed');
    expect(failed).toMatchObject({passed:false,completed:false,score:0,attempts:1,rewardGranted:false});
    expect((await api.quizReceipt(id,'v1','demo-quiz-failed')).result).toEqual(failed);
    expect(await api.submitQuiz(id,'v1',[1,0],'demo-quiz-failed')).toEqual(failed);
    const passed=await api.submitQuiz(id,'v1',[0,1],'demo-quiz-passed');
    expect(passed).toMatchObject({passed:true,completed:true,score:100,attempts:2,rewardGranted:true});
    expect(await api.course(id,'zh')).toMatchObject({completed:true,progress:100,lastScore:100,attempts:2});
    expect((await api.courses('zh')).completedCourses).toBe(1);
  });
  it('exposes precise raffle awards and enforces the same simulated time window on entry',async()=>{
    const small=demo('zh',{raffleState:'small-usdt'}), smallApi=createGenesisRaffleApi(small.client);
    const state=await smallApi.state();
    expect(state.draws[0].prizes.map(row=>[row.rewardType,row.amount])).toEqual([['USDT','0.00032'],['USDT','0.00005']]);
    expect(state.draws[2].myResults.map(row=>row.amount)).toEqual(['0.00032','0.00005']);
    for(const mode of ['upcoming','ended']){
      const closed=demo('zh',{raffleState:mode}), api=createGenesisRaffleApi(closed.client);
      await api.state();
      await expect(api.enter('demo-draw-0',1,'closed-'+mode)).rejects.toThrow('not accepting entries');
      expect((await api.state()).availableTickets).toBe(3);
    }
  });
  it('restores a broken streak and reads claimed earnings without repeating the reward',async()=>{
    const d=demo('zh',{streakState:'broken'}),api=createPointsApi(d.client);
    expect((await api.state()).streak.streakSavers).toBe(1);
    expect(await api.useSaver('demo-saver')).toMatchObject({restoredStreak:7,streakSavers:0});
    expect((await api.state()).streak).toMatchObject({currentStreak:7,streakSavers:0});
    expect((await api.state()).dailyMilestones.map(row=>row.status)).toEqual(['CLAIMABLE','CLAIMABLE','LOCKED','LOCKED']);
    expect(d.get('/api/points/sign-in',{},'POST').streakDays).toBe(8);
    expect((await api.state()).streak).toMatchObject({currentStreak:8,checkedInToday:true});
    expect((await api.evaluateEarningMilestones('demo-earning','demo-earning-1')).count).toBe(1);
    expect((await api.state()).earningMilestones[1].status).toBe('FIRED');
    expect((await api.evaluateEarningMilestones('demo-earning-again','demo-earning-1')).count).toBe(0);
  });
  it('reads rank and member point counts and binary volume in USDT', async()=>{
    const d=demo(),ranks=createVRankApi(d.client);
    expect((await ranks.current()).progress).toMatchObject({selfComputePoints:1280,teamComputePoints:12800});
    expect((await ranks.ladder()).ranks[3]).toMatchObject({selfComputePoints:2000,teamComputePoints:20000});
    expect(await createTeamNetworkApi(d.client).snapshot()).toMatchObject({monthComputePoints:3200,lifetimeComputePoints:12800});
    expect(await createCommissionConfigApi(d.client).binary()).toMatchObject({trackA:2800,trackB:2400,estimatedAmountUsdt:240});
  });
  it.each(['zh','en','vi'])('provides a complete point-based rank guide in %s',async locale=>{
    const d=demo(locale),policy=await createRankHowPolicyApi(d.client).published(locale),ladder=await createVRankApi(d.client).ladder();
    const content=buildRankHowContent(policy,ladder.ranks,ladder.capabilities,locale,{selfBuy:'{n}',teamVol:'{n}',directRefs:'{n}',vDownlines:'{n} × V{v}',register:'V0'});
    expect(policy.sections).toHaveLength(29);
    expect(policy.sections.every(row=>content.section(row.id).available)).toBe(true);
    expect(content.section('example-self').body).not.toMatch(/USDT|USD|\$/);
    expect(content.section('example-team').body).not.toMatch(/USDT|USD|\$/);
  });
  it('creates and pays a legacy bundle with its published demo policy',async()=>{
    const d=demo(),policy=await createBundleDiscountApi(d.client).current(),bundles=createBundleOrderApi(d.client);
    const order=await bundles.create(['stellarbox-s1','stellarbox-pro'],policy.policyVersion,6046.08,'bundle-1');
    expect(order.discountUsdt).toBe(251.92);
    expect(await bundles.create(['stellarbox-s1','stellarbox-pro'],policy.policyVersion,6046.08,'bundle-1')).toEqual(order);
    const orders=createOrderApi(d.client),before=d.get('/api/devices/earnings').walletUsdt;
    await orders.pay(order.orderNo,'bundle-pay');await orders.pay(order.orderNo,'bundle-pay');
    expect(d.get('/api/devices/earnings').walletUsdt).toBe(before-6046.08);
    expect((await orders.list()).orders[0]).toMatchObject({orderNo:order.orderNo,canonicalStatus:'activated',itemCount:2});
    expect(d.state.voucherUsed).not.toBe(true);
  });
  it('confirms promoted payments and recovers them without a second wallet deduction',async()=>{
    const d=demo('zh',{voucherClaimed:true}),api=createPromotionApi(d.client);
    const quote=await api.quote([{productNo:'stellarbox-pro',quantity:1}],'demo-promo-0','V-DESIGN');
    const order=await api.create(quote,'promo-create','V-DESIGN');
    const before=d.get('/api/devices/earnings').walletUsdt;
    const paid=await api.pay(order.orderNo,'promo-pay');
    expect(paid).toMatchObject({paymentStatus:'PAID',promotionQuoteId:quote.quoteId,amountUsdt:'4949.00'});
    expect((await api.findOrder(order.orderNo))?.paymentStatus).toBe('PAID');
    expect(await api.command('promo-pay','payOrder',order.orderNo)).toMatchObject({status:'SUCCEEDED',order:{paymentStatus:'PAID'}});
    await api.pay(order.orderNo,'promo-pay');await api.pay(order.orderNo,'promo-pay-again');
    expect(d.get('/api/devices/earnings').walletUsdt).toBe(before-4949);
    expect(d.state.voucherUsed).toBe(true);
  });
  it('permits all six demo purchases through both eligibility policies and exposes restricted conditions',async()=>{
    const d=demo(),api=createPurchaseEligibilityApi(d.client);
    for(const p of d.get('/api/store/catalog').products)expect((await api.get(p.id)).eligible).toBe(true);
    d.state.catalogState='restricted';const restricted=await api.get('stellarbox-s1');expect(restricted.eligible).toBe(false);
    expect(resolvePurchaseEligibilityMessage('ready',restricted)).toBe('ineligible');
    expect(purchaseEligibilityUnlockHref(restricted,'stellarbox-s1')).toBe('/pages/team/rank');
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
    expect(await createProfileApi(d.client).profile()).toEqual({nickname:'Alex',avatarUrl:'http://127.0.0.1:5190/static/img/demo/profile-woman.jpg',avatarRevision:'demo-profile-woman',language:'zh',changeIntervalDays:7,nicknameChangeAvailableAt:null,avatarChangeAvailableAt:null});
    expect((await createPayoutAddressApi(d.client,'prod').list()).addresses).toHaveLength(1);
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
  it.each(['zh','en','vi'])('loads proof and referral rule samples through actual %s API readers',async locale=>{
    const d=demo(locale),proof=createProofApi(d.client),direct=createDirectReferralApi(d.client);
    expect(await proof.snapshot()).toMatchObject({referralCode:'UVELDEMO',currentStreak:2,team:{totalMembers:8}});
    expect(await direct.policy()).toMatchObject({configured:true,deviceEarning:{totalRatePct:5}});
    expect((await direct.snapshot('month',1,20,null,'device_earning')).events[0]).toMatchObject({kind:'direct_device_earning',sourceDeviceId:'REVIEW-S1'});
    d.state.dataState='empty';expect(await proof.snapshot()).toMatchObject({currentStreak:0,topPercentile:null,availability:{status:'EMPTY'}});
    expect((await direct.policy()).configured).toBe(false);expect((await direct.snapshot('month',1,20,null,'device_earning')).events).toEqual([]);
  });
  it.each(['zh','en','vi'])('provides local-only support reading, reply, dismiss and Genesis guidance in %s',async locale=>{
    const d=demo(locale),api=createSupportApi(d.client);
    expect((await api.advisor()).assignmentState).toBe('ASSIGNED');
    expect((await api.attachmentPolicy()).available).toBe(false);
    expect(await api.conversationCategories()).toMatchObject({advisor:true,support:true,ai:false});
    const list=await api.conversations();expect(list.items).toHaveLength(1);
    const detail=await api.conversation(list.items[0].id);expect(detail.messages).toHaveLength(1);
    const read=await api.markConversationRead(detail,1);expect(read.unread).toBe(0);
    const sent=await api.replyConversation(read,'Demo reply','demo-message-1');expect(sent.messages).toHaveLength(2);
    expect((await api.replyConversation(read,'Demo reply','demo-message-1')).messages).toHaveLength(2);
    await api.dismissConversation(sent.id,2);expect(await api.conversationDismissals()).toEqual([{conversationNo:sent.id,throughMessageId:2}]);
    // One conversation per advisor: a new question continues the advisor's existing thread.
    const started=await api.startConversation('support','Demo order question','demo-conversation-2');
    expect(started.id).toBe(sent.id);
    expect(started.messages.at(-1)?.text).toBe('Demo order question');
    expect((await api.conversations()).items).toHaveLength(1);
    expect((await createHowContentApi(d.client,'prod').published('genesis-how',locale)).blocks).toHaveLength(4);
  });
  it('keeps fleet identities unique and stable across consecutive multi-unit purchases',async()=>{
    const d=demo(),orders=createOrderApi(d.client),devices=createDeviceE3Api(d.client);
    const first=await orders.create({productNo:'stellarbox-s1',quantity:2,idempotencyKey:'multi-first'});
    await orders.pay(first.orderNo,'pay-multi-first');
    const before=(await devices.fleet()).devices;
    const next=await orders.create({productNo:'stellarbox-pro',quantity:2,idempotencyKey:'multi-next'});
    await orders.pay(next.orderNo,'pay-multi-next');
    const after=(await devices.fleet()).devices;
    expect(after).toHaveLength(6);
    expect(new Set(after.map(device=>device.id)).size).toBe(6);
    for(const device of before)expect(after.find(item=>item.instanceNo===device.instanceNo)?.id).toBe(device.id);
    expect((await devices.fleet()).devices).toEqual(after);
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
    // Same reset as POST /__demo/state {reset:true}: drop every key, then restore the defaults.
    for(const key of Object.keys(d.state))delete d.state[key];
    Object.assign(d.state,structuredClone(demoDefaults));expect((await createTrialApi(d.client).state()).status).toBe('none');
  });
  it('links a redeemed trial to its order and shows a refund of that order',async()=>{
    for(const trialState of ['converted','refunded']){
      const d=demo('zh',{trialState}),trial=await createTrialApi(d.client).state();
      const order=(await createOrderApi(d.client).list()).orders.find(row=>row.orderNo===trial.conversion?.orderNo)!;
      expect(order.trialSettlement).toMatchObject({fullTerm:true,earlyDiscountUsdt:10});
      expect(trial.conversion).toMatchObject({refunded:trialState==='refunded',rewardsReversed:trialState==='refunded'});
      expect(order.refundReasonCode??null).toBe(trialState==='refunded'?'USER_REQUEST':null);
    }
  });
  it('claims day-one and weekly tasks independently with matching rewards',async()=>{
    const d=demo('zh',{taskState:'complete'});d.get('/api/quests/review-task-1/claim',{},'POST');
    const tasks=(await createQuestApi(d.client).state('zh')).quests;
    expect(tasks.filter(t=>t.questCode.startsWith('demo-week-')).every(t=>t.status==='CLAIMABLE')).toBe(true);
    expect(d.get('/api/quests/demo-week-3/claim',{},'POST').rewardNex).toBe(175);
  });
  it('marks only the selected notification read and preserves its destination',()=>{
    const d=demo();d.get('/api/notifications/901/read',{},'POST');expect(d.get('/api/notifications').unread).toBe(2);
    expect(d.get('/api/notifications/902/actions',{},'POST').route).toBe('/pages/store/order-detail?id=DEMO-ORDER-002');
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
  it('keeps the design offer, carousel, quote and reward record on the same S1 / Cloud Share gift',async()=>{
    const d=demo(),api=createPromotionApi(d.client);
    const home=await api.list({placement:'home.purchase-promotion'});
    expect(home.items).toHaveLength(3);
    expect(home.items[0].title.zh).toBe('买 UVELBox S1');
    expect(home.items[0].rewardRules[0].buyerReward).toMatchObject({type:'DEVICE',giftProductNo:'cloud-share',quantity:1});
    const quote=await api.quote([{productNo:'stellarbox-s1',quantity:1}],'demo-promo-0');
    expect(quote.expectedRewards[0].reward).toMatchObject({type:'DEVICE',giftProductNo:'cloud-share',quantity:1});
    expect((await api.rewards()).items[0].reward).toMatchObject({type:'DEVICE',giftProductNo:'cloud-share',quantity:1});
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
    expect(events.events).toHaveLength(6);
    expect(new Set(events.events.map(e=>e.kind)).size).toBe(6);
    expect((await createEventDetailApi(d.client).detail('demo-invite',locale)).userStatus).toBe('JOINED');
    const daily=await createPointsApi(d.client).state();
    expect(daily.badgeAchievements).toHaveLength(6);expect(daily.dailyMilestones).toHaveLength(4);
    expect((await createTeamNetworkApi(d.client).snapshot()).members).toHaveLength(8);
    expect((await createReferralRewardApi(d.client).snapshot()).referralCode).toBe('UVELDEMO');
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
    expect((await api.summary()).monthBillCount).toBe(6);
    expect((await api.list()).bills).toHaveLength(6);
    const rewards=(await api.list(1,50,{asset:'USDT',category:'REWARD'})).bills;
    expect(rewards).toHaveLength(2);expect(rewards.every(row=>row.asset==='USDT'&&row.direction==='IN')).toBe(true);
    expect(rewards.some(row=>row.amount===0.00032)).toBe(true);
  });
});
