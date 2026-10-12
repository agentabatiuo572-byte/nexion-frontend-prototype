import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { compile } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { expect, it } from 'vitest';
// @ts-expect-error Node test runner reads reviewed source consumers; the App tsconfig omits Node globals.
import { readFileSync } from 'node:fs';
import { reviewedCopyR2 } from './promotion-public-copy-r2-fixture';
import { fmt } from '@/i18n/format';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi } from '@/i18n/messages/vi';
import networkSource from '@/components/home/network-pulse-card.vue?raw';
import earnSource from '@/pages/earn/earn.vue?raw';
import deviceSource from '@/components/earn/device-card-pc.vue?raw';
import eventsSource from '@/pages/events/events.vue?raw';
import storeSource from '@/pages/store/store.vue?raw';
import ordinaryBundleSource from '@/pages/store/bundle.vue?raw';
import bundleSource from './promotion-bundle.vue?raw';
import checkoutSource from './promotion-checkout.vue?raw';
import ordinaryCheckoutSource from '@/pages/store/checkout.vue?raw';
import detailSource from '@/pages/store/detail.vue?raw';
import orderSource from '@/pages/store/order-detail.vue?raw';
import meSource from '@/pages/me/me.vue?raw';
import poolSource from '@/components/home/leadership-pool-card.vue?raw';
import poolPageSource from '@/pages/team/leadership-pool.vue?raw';
import poolHowSource from '@/pages/team/leadership-pool-how.vue?raw';
import teamSource from '@/pages/team/team.vue?raw';
import inviteSource from './referral-progress.vue?raw';
import rewardDetailSource from '@/pages/events/promotion-reward-detail.vue?raw';

it('anxiety copy gate excludes only test files and retains every production copy source', () => {
  const gate = readFileSync(new URL('../../../scripts/anxiety-copy-gate.mjs', import.meta.url), 'utf8');
  const expression = gate.match(/for \(const file of (\[[^\n]+\](?:\.filter\([^\n]+\))?)\) \{/)?.[1];
  expect(expression).toBeTruthy();
  const select = new Function('i18nFiles', 'srcFiles', `return ${expression};`) as (i18n: string[], sources: string[]) => string[];
  const i18nFiles = ['src/i18n/messages/zh.ts', 'src/i18n/messages/en.ts', 'src/i18n/messages/vi.ts'];
  const srcFiles = [
    'src/components/promotion/promotion-public-copy.test.ts',
    'src/pages/me/me-ui-parity.contract.test.ts',
    'src/pages/example.ts',
    'src/components/example.vue',
    'src/pages/testimonials.vue',
    'src/lib/example.test.ts.backup.ts',
  ];
  const expected = [...i18nFiles, ...srcFiles.slice(2)];
  expect(select(i18nFiles, srcFiles)).toEqual(expected);
  const changed = expression!.replace('.filter(file => !file.endsWith(".test.ts"))', '');
  expect(changed).not.toBe(expression);
  const selectWithoutExclusion = new Function('i18nFiles', 'srcFiles', `return ${changed};`) as typeof select;
  expect(selectWithoutExclusion(i18nFiles, srcFiles)).not.toEqual(expected);
});

const internal=/服务端|数据库|接口|投影|本地(?:数据|模拟|不会)|不会(?:猜测|用本地)|沿现有|server(?:[- ]side)?|database|backend|\bAPI\b|\bmock\b|\bfixture\b|\bfallback\b|existing (?:invite|product)|máy chủ|cơ sở dữ liệu|dữ liệu cục bộ|hiện có/i;
const readCopy = (copy: unknown, key: string): string => key.split('.').reduce<unknown>(
  (node, segment) => (node as Record<string, unknown>)[segment], copy) as string;
it.each([{ locale: 'zh', copy: zh }, { locale: 'en', copy: en }, { locale: 'vi', copy: vi }])(
  '$locale all 61 approved public keys keep their real consumers and format every placeholder without engineering prose', ({ copy }) => {
    expect(reviewedCopyR2).toHaveLength(61);
    for (const item of reviewedCopyR2) {
      const value = readCopy(copy, item.key);
      expect(value, item.key).toBeTruthy();
      expect(value, item.key).not.toMatch(internal);
      expect([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), item.key).toEqual(item.placeholders);
      const values = Object.fromEntries(item.placeholders.map(name => [name, `TEST_${name}`]));
      const rendered = fmt(value, values);
      expect(rendered, item.key).not.toMatch(/\{\w+\}/);
      for (const name of item.placeholders) expect(rendered, item.key).toContain(`TEST_${name}`);
      for (const consumer of item.consumers) {
        const actual = readFileSync(new URL(`../../../${consumer.file}`, import.meta.url), 'utf8');
        expect(actual, `${item.key}: ${consumer.file}`).toContain(consumer.expression);
      }
    }
    for (const key of ['remoteSource', 'remoteError']) expect(copy.help).not.toHaveProperty(key);
    for (const key of ['releasePhasePending', 'releaseSchedulePending', 'releaseConfigUnavailable', 'releasePending']) expect(copy.store).not.toHaveProperty(key);
    for (const key of ['networkStatUnverified', 'networkStatUnverifiedHint', 'networkVerifiedScope']) expect(copy.home).not.toHaveProperty(key);
    expect(copy.intro).not.toHaveProperty('verifiedScope');
    expect(copy.goals).not.toHaveProperty('recReasonServer');
    expect(copy.trust).not.toHaveProperty('verifiedAggregateNote');
    expect(copy.ref).not.toHaveProperty('verifiedScope');
  },
);

it.each([
  { locale: 'zh', copy: zh, latency: '-', progress: '请继续完成任务。' },
  { locale: 'en', copy: en, latency: '-', progress: 'Please continue with the task.' },
  { locale: 'vi', copy: vi, latency: '-', progress: 'Hãy tiếp tục hoàn thành nhiệm vụ.' },
])('$locale reports missing measurements without a number and asks to continue the task', ({ copy, latency, progress }) => {
  expect(networkSource).toContain('v: "-"');
  expect(copy.globe.latencyTelemetryMissing).toBe(latency);
  expect(copy.weeklyQuest.progressVerified).toBe(progress);
});

it.each([
  { locale: 'zh', copy: zh, expected: ['本金', '利息', '预计', '结算结果为准'], penalty: ['本金', '罚金', '放弃利息及抽奖券', '预计退回', '结算结果为准'], unknown: '无法确认', release: ['暂不可提现', '是否释放', '释放金额'], privacy: ['审核', '依法', '财务与安全', '不会被立即删除'], abandon: ['确认未创建订单后', '已创建的订单不会撤销或重复扣款'], quote: ['估算', '提交时', '汇率及手续费'] },
  { locale: 'en', copy: en, expected: ['principal', 'interest', 'estimated', 'confirmed at settlement'], penalty: ['principal penalty', 'Interest and lottery tickets are forfeited', 'Estimated return', 'confirmed at settlement'], unknown: 'not confirmed', release: ['not withdrawable', 'Release eligibility and amounts'], privacy: ['reviewed', 'Financial and security', 'required by law', 'not erased immediately'], abandon: ['only after confirming that no order was created', 'not be cancelled or charged again'], quote: ['Estimate', 'at submission', 'exchange rate and fee'] },
  { locale: 'vi', copy: vi, expected: ['gốc', 'lãi', 'dự kiến', 'xác nhận khi quyết toán'], penalty: ['phạt', 'tiền gốc', 'mất lãi và vé quay thưởng', 'Dự kiến hoàn', 'xác nhận khi quyết toán'], unknown: 'Chưa thể xác nhận', release: ['chưa thể rút', 'Điều kiện', 'số tiền được giải phóng', 'kết quả xác nhận cuối cùng'], privacy: ['xét duyệt', 'tài chính và bảo mật', 'theo pháp luật', 'không bị xóa ngay'], abandon: ['sau khi xác nhận chưa tạo lệnh', 'không bị hủy hoặc trừ tiền lần nữa'], quote: ['ước tính', 'tại thời điểm gửi', 'tỷ giá và phí'] },
])('$locale keeps money estimates, penalties, unknown results, release conditions and deletion limits', ({ copy, expected, penalty, unknown, release, privacy, abandon, quote }) => {
  const claim = fmt(copy.repurchase.claimMessage, { order: 'ORDER-42', amount: '123.45' });
  for (const text of ['ORDER-42', '123.45 USDT', ...expected]) expect(claim).toContain(text);
  const early = fmt(copy.repurchase.earlyMessage, { order: 'ORDER-42', amount: '89.50', penalty: 15 });
  for (const text of ['ORDER-42', '15%', '89.50 USDT', ...penalty]) expect(early).toContain(text);
  expect(copy.repurchase.unavailableBody).toContain(unknown);
  for (const text of release) expect(copy.wallet.pendingSheetBody).toContain(text);
  for (const text of privacy) expect(copy.security.deleteAccountHint).toContain(text);
  for (const text of abandon) expect(copy.walletV3.withdrawAbandonAttemptBody).toContain(text);
  for (const text of quote) expect(copy.exchange.quoteEstimate).toContain(text);
  expect(fmt(copy.wallet.releaseAttestationInfo, { hours: 48 })).toContain('48');
  expect(copy.earn.phoneTaskPausedHint).toContain('20%');
  expect(copy.onboarding.policyLine3).toContain('120');
});
it.each([
  {locale:'zh',copy:zh,text:'上方设备规格为估算值，已校准算力暂不可用；任务状态单独展示。'},
  {locale:'en',copy:en,text:'The device specifications above are estimates; calibrated compute capacity is unavailable. Task status is shown separately.'},
  {locale:'vi',copy:vi,text:'Thông số thiết bị ở trên chỉ là ước tính; công suất đã hiệu chuẩn chưa có. Trạng thái tác vụ được hiển thị riêng.'},
])('$locale unavailable hashpower keeps two explanations and a dash in compact metric slots',({copy,text})=>{
  expect(deviceSource.match(/t(?:\.value)?\.earn\.hashCapabilityUnknown/g)).toHaveLength(2);
  expect(deviceSource).toContain("baselineTops == null ? '-' :");
  expect(deviceSource).toContain('? deviceGpuLabel(t.value, props.device) : "-"');
  expect(copy.earn.hashCapabilityUnknown).toBe(text);
});
const consumers:{key:string;sources:string[]}[]=[
  {key:'home.networkVerifiedMembers',sources:[networkSource]},
  {key:'home.networkVerifiedDevices',sources:[networkSource]},
  {key:'earn.summaryUnavailableBody',sources:[earnSource]},
  {key:'earn.hashCapabilityUnknown',sources:[deviceSource]},
  {key:'events.loadErrorBody',sources:[eventsSource]},
  {key:'store.catalogLoadingBody',sources:[storeSource,bundleSource,ordinaryBundleSource]},
  {key:'store.catalogEmptyBody',sources:[storeSource]},
  {key:'store.coAwaitingServer',sources:[ordinaryCheckoutSource]},
  {key:'store.purchaseEligibilityFailClosed',sources:[detailSource]},
  {key:'store.purchaseEligibilityNoFacts',sources:[detailSource]},
  {key:'orders.refreshing',sources:[orderSource,meSource]},
  {key:'trust.errorUnavailable',sources:[detailSource]},
  {key:'pool.loading',sources:[poolSource,teamSource,poolPageSource,poolHowSource]},
  {key:'promotion.existingInvite',sources:[inviteSource]},
];
it.each([{locale:'zh',copy:zh},{locale:'en',copy:en},{locale:'vi',copy:vi}])('$locale task-page copy has actual consumers and excludes internal explanations',({copy})=>{
  for(const {key,sources} of consumers){
    const [namespace,name]=key.split('.');
    const value=(copy as unknown as Record<string,Record<string,string>>)[namespace][name];
    expect(value,key).toBeTruthy();expect(value,key).not.toMatch(internal);
    for(const source of sources)expect(source,key).toContain(key);
  }
  expect(copy.promotion).not.toHaveProperty('statusRead');expect(copy.promotion).not.toHaveProperty('specNote');
  expect(rewardDetailSource).not.toContain('p.statusRead');expect(rewardDetailSource).toContain('p.existingInvite');
});

const render=new Function('Vue',compile(parse(rewardDetailSource).descriptor.template!.content,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>['view','text'].includes(tag)}).code)(Vue);
it.each([{locale:'zh',copy:zh},{locale:'en',copy:en},{locale:'vi',copy:vi}])('$locale real reward-detail template keeps result, conditions and invitation without internal prose',async({locale,copy})=>{
  const html=await renderToString(Vue.createSSRApp({render,components:{
    AppChassis:{setup:(_props:unknown,{slots}:Vue.SetupContext)=>()=>Vue.h('view',slots.default?.())},
    RewardRows:{render:()=>null},DisclosureDetails:{render:()=>null},
  },setup:()=>({loading:false,error:false,id:'reward',progress:{qualifyingOrders:1},
    reward:{orderNo:'original-order',state:'ISSUED',beneficiaryRole:'DIRECT_INVITER',disclosure:{title:{zh:'实际奖励',en:'Earned reward',vi:'Phần thưởng đã nhận'}},assetReceipt:null},
    p:copy.promotion,t:copy,locale:{code:locale},localized:(text:Record<string,string>)=>text[locale],displayDeadline:()=>'',load:()=>{},navTo:()=>{},
  })}));
  expect(html).toContain(copy.promotion.rights);expect(html).toContain(copy.promotion.assetPending);
  expect(html).toContain(copy.promotion.existingInvite);expect(html).toContain(copy.promotion.privacy);
  expect(html).not.toMatch(internal);
});

const ast=ts.createSourceFile('checkout.ts',parse(checkoutSource).descriptor.scriptSetup!.content,ts.ScriptTarget.Latest,true);
const run=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='run')!;
const runCode=ts.transpileModule(run.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
it.each([{locale:'zh',copy:zh},{locale:'en',copy:en},{locale:'vi',copy:vi}])('$locale real checkout failure mapping never renders an original API diagnostic',async({copy})=>{
  const error=Vue.ref(''),deps={busy:Vue.ref(false),current:()=>true,error,p:Vue.ref(copy.promotion),revision:Vue.ref(0),updateClock:()=>{},asApiError:(cause:unknown)=>({message:String(cause)})};
  const actual=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${runCode};return run;`)(deps) as (action:()=>Promise<void>)=>Promise<void>;
  for(const diagnostic of ['DATABASE_CONNECTION_TOKEN','HTTP_500_INTERNAL_DETAIL','ACCOUNT_SCOPE_CHANGED']){
    await actual(async()=>{throw new Error(diagnostic);});
    expect(error.value).toBe(copy.promotion.errorNote);expect(error.value).not.toContain(diagnostic);expect(error.value).not.toMatch(internal);
  }
});
