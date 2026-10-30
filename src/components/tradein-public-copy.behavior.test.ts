import { computed, ref } from 'vue';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { compile } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
vi.mock("@/services/native-push", () => ({ revokeNativePush: vi.fn(), resumeNativePush: vi.fn() }));
import source from './tradein-sheets.vue?raw';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { deviceName } from '@/lib/device-copy';
import { computeTradeInCredit, ladderBandFor } from '@/mock/tradein-config';
import { resolvePurchaseEligibilityMessage } from '@/lib/purchase-eligibility-copy';
import { PURCHASE_ELIGIBILITY_SOURCE, type PurchaseEligibilitySnapshot } from '@/api/purchase-eligibility-api';
import { purchaseRecoveryCopy } from '@/lib/purchase-recovery-copy';

const descriptor = parse(source).descriptor;
const ast = ts.createSourceFile('tradein.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const selected = ast.statements.filter(node =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'previewCredit'
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
    ts.isIdentifier(declaration.name) && ['choiceSources', 'tradeinView', 'purchaseMessage', 'purchaseBlocked',
      'purchaseConfirmed', 'purchaseActionBusy', 'purchaseActionDisabled', 'purchaseActionText'].includes(declaration.name.text)));
expect(selected).toHaveLength(9);
const code = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const render = new Function('Vue', compile(descriptor.template!.content, {
  mode: 'function', prefixIdentifiers: true, isCustomElement: tag => ['view', 'text'].includes(tag),
}).code)(Vue);

function page(copy = en, remoteApiEnabled = true, purchaseBlocked = false) {
  const state = ref({ kind: 'choice', tradeInSources: ['42'], newPrice: 500, oldDeviceId: '42', newKind: 'stellarbox-pro' });
  const device = { id: '42', kind: 'stellarbox-s1', name: 'UVEL S1', paidPriceUsdt: 200, cumulativeEarningsUsdt: 50 };
  const canonicalQuote = ref({ sourceDeviceId: 42, sourceRowVersion: 1, targetDeviceStatus: "ACTIVE", targetProductNo: 'stellarbox-pro', sourceActualPaidUsdt: 200,
    cumulativeOutputUsdt: 50, discountUsdt: 123.45, creditRatePct: 61.725, payableUsdt: 376.55, sufficientFunds: true });
  const purchaseStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('ready');
  const purchaseRecovery = ref('none');
  const keepRecovery = ref<{ key: string } | null>(null), keepRecoveryError = ref(false);
  const capacityRecovery=ref<unknown>(null),recoveryCopy=purchaseRecoveryCopy(copy===zh?'zh':copy===vietnamese?'vi':'en');
  const purchaseSnapshot = ref<PurchaseEligibilitySnapshot | null>({ productNo: 'stellarbox-pro', eligible: !purchaseBlocked,
    decisionCode: purchaseBlocked ? 'PURCHASE_GATE_NOT_MET' : 'ELIGIBLE', evaluatedAt: 1, source: PURCHASE_ELIGIBILITY_SOURCE,
    sourceEnvironment: 'PRODUCTION', runId: null, serverCanonical: true,
    policies: [{ policy: 'E1', eligible: !purchaseBlocked, decisionCode: purchaseBlocked ? 'PURCHASE_GATE_NOT_MET' : 'ELIGIBLE',
      mode: 'ALL', conditions: purchaseBlocked ? [{ kind: 'rank', current: 1, required: 2, gap: 1, met: false }] : [] },
    { policy: 'F4B', eligible: true, decisionCode: 'F4B_NOT_CONFIGURED', mode: 'ALL', conditions: [] }] });
  const deps = { computed, state, app: { devices: [device] }, t: ref(copy), remoteApiEnabled,
    canonicalQuote, purchaseStatus, purchaseRecovery, keepRecovery, keepRecoveryError, capacityRecovery,
    capacityRecoveryUnavailable:false,capacityRecoveryBusy:false,capacityResumeAllowed:false,recoveryCopy,purchaseSnapshot, confirming: ref(false), props: { active: true },
    resolvePurchaseEligibilityMessage, fmt, formatAmount, deviceName, computeTradeInCredit, ladderBandFor, kindLabel: (kind: string) => kind };
  const actual = new Function('deps', `const {${Object.keys(deps).join(',')}} = deps; ${code}; return {choiceSources, tradeinView,
    purchaseMessage,purchaseBlocked,purchaseConfirmed,purchaseActionBusy,purchaseActionDisabled,purchaseActionText};`)(deps);
  const setup = { ...deps, ...actual, active: true, quoteLoading: false, ctaHalo: {},
    hide: () => {}, onKeyboardActivate: () => {}, onChooseTradein: () => {}, onChooseFullPrice: () => {}, onConfirmTradein: () => {}, onRecoverKeep: () => {},recoverCapacityPurchase:()=>{} };
  const show = () => renderToString(Vue.createSSRApp({ render,
    components: { PurchaseEligibilityPanel: { render: () => null } }, setup: () => Vue.proxyRefs(setup) }));
  return { state, canonicalQuote, purchaseStatus, purchaseRecovery, keepRecovery, keepRecoveryError, capacityRecovery,recoveryCopy,purchaseSnapshot, actual, show };
}

it.each([zh, en, vietnamese])('presents the original KEEP recovery before new purchase choices', async copy => {
  const p = page(copy); p.capacityRecovery.value = {operation:'keep',key:'legacy-key',quote:null,targetProductNo:'stellarbox-pro',payableUsdt:2639};
  const html = await p.show();
  expect(html).toContain(copy.tradein.keepRecoveryPending);
  expect(html).toContain(p.recoveryCopy.query);
  expect(html).toContain(`${formatAmount(2639)} USDT`);
  expect(html).not.toContain(p.recoveryCopy.resume);
  expect(html).not.toContain(copy.tradein.choiceFullPriceOption);
});

it.each([{ locale: 'zh', copy: zh }, { locale: 'en', copy: en }, { locale: 'vi', copy: vietnamese }])(
  '$locale renders an unavailable credit as a quote action without a dollar amount', async ({ copy }) => {
    const p = page(copy);
    const choice = await p.show();
    expect(choice).toContain(`UVEL S1 · ${copy.tradein.remoteQuoteCreditLabel}`);
    expect(choice).not.toContain(`$${copy.tradein.remoteQuoteCreditLabel}`);
  },
);

it.each([{ locale: 'zh', copy: zh }, { locale: 'en', copy: en }, { locale: 'vi', copy: vietnamese }])(
  '$locale renders the returned rate and monetary quote without inventing a numbered band', async ({ copy }) => {
    const p = page(copy);
    p.state.value.kind = 'tradein';
    const quote = await p.show();
    const band = fmt(copy.tradein.remoteQuoteBandLabel, { pct: 61.725 });
    expect(p.actual.tradeinView.value.bandText).toBe(band);
    expect(quote).toContain(band);
    expect(quote).toContain('$123.45');
    expect(quote).toContain('$376.55');
    p.canonicalQuote.value.sourceDeviceId = 99;
    expect(p.actual.tradeinView.value).toBeNull();
  },
);

it.each([{ locale: 'zh', copy: zh }, { locale: 'en', copy: en }, { locale: 'vi', copy: vietnamese }])(
  '$locale keeps the existing local credit calculation and numbered band', async ({ copy }) => {
    const p = page(copy, false);
    expect(p.actual.choiceSources.value[0].label).toBe(fmt(copy.tradein.choiceTradeInOption, { name: 'UVEL S1', credit: '120.00' }));
    p.state.value.kind = 'tradein';
    expect(p.actual.tradeinView.value.credit).toBe('120.00');
    expect(p.actual.tradeinView.value.estNet).toBe('380.00');
    expect(p.actual.tradeinView.value.bandText).toBe(fmt(copy.tradein.sheetBandText, { band: 2, pct: 60 }));
  },
);


it.each([zh, en, vietnamese])('explains the inherited source placement in the actual trade-in confirmation', async copy => {
  const p = page(copy); p.state.value.kind = 'tradein';
  expect(await p.show()).toContain(copy.tradein.inheritActiveHint);
  p.canonicalQuote.value.targetDeviceStatus = 'INACTIVE';
  const inventory = await p.show(); expect(inventory).toContain(copy.tradein.inheritInventoryHint);
  expect(inventory).not.toContain(copy.tradein.inheritActiveHint);
});

it.each([zh, en, vietnamese])('keeps a blocked confirmation short without a quote, source identity or payment explanations', async copy => {
  const p = page(copy, true, true); p.state.value.kind = 'tradein';
  p.canonicalQuote.value.sufficientFunds = false;
  const html = (await p.show()).replace(/<!--[\s\S]*?-->/g, '');
  expect(html).toContain(copy.tradein.purchaseBlockedTitle);
  expect(html).toContain(copy.tradein.purchaseViewConditions); expect(html).toContain(copy.tradein.sheetCancel);
  for (const removed of [copy.tradein.sheetOldDeviceLabel, copy.tradein.sheetEarnedLabel, copy.tradein.sheetCreditLabel,
    copy.tradein.sheetNetCostLabel, copy.tradein.inheritActiveHint, copy.tradein.inheritInventoryHint,
    copy.tradein.sheetDisclaimer, '$123.45', '$376.55', 'UVEL S1']) expect(html).not.toContain(removed);
});

it.each([zh, en, vietnamese])('never renders the full quote during idle, loading or failed reads, including a retained old grant', async copy => {
  const p = page(copy); p.state.value.kind = 'tradein'; p.canonicalQuote.value.sufficientFunds = false;
  for (const status of ['idle', 'loading', 'error'] as const) {
    p.purchaseStatus.value = status;
    const html = (await p.show()).replace(/<!--[\s\S]*?-->/g, '').replace(/&#39;/g, "'");
    expect(html).toContain(status === 'error' ? copy.store.purchaseEligibilityError : copy.store.purchaseEligibilityLoading);
    expect(html).toContain(copy.tradein.sheetCancel);
    for (const removed of [copy.tradein.sheetOldDeviceLabel, copy.tradein.sheetEarnedLabel, copy.tradein.sheetDisclaimer,
      copy.tradein.inheritActiveHint, '$123.45', '$376.55', 'UVEL S1']) expect(html).not.toContain(removed);
    expect(p.actual.purchaseConfirmed.value).toBe(false);
    if (status === 'error') expect(html).toContain(copy.store.purchaseEligibilityRetry);
  }
});
it('switches directly from verification to a short denial, including return and retry reads', async () => {
  const p = page(zh, true, true); p.state.value.kind = 'tradein';
  const denial = p.purchaseSnapshot.value;
  for (const entry of ['initial', 'return', 'retry']) {
    p.purchaseStatus.value = 'loading'; p.purchaseSnapshot.value = null;
    const pending = await p.show(); expect(pending).toContain(zh.store.purchaseEligibilityLoading);
    expect(pending).not.toContain('$376.55'); expect(pending).not.toContain(zh.tradein.purchaseBlockedTitle);
    p.purchaseSnapshot.value = denial; p.purchaseStatus.value = 'ready';
    const settled = await p.show(); expect(settled, entry).toContain(zh.tradein.purchaseBlockedTitle);
    expect(settled).not.toContain('$376.55'); expect(settled).not.toContain(zh.tradein.sheetDisclaimer);
  }
});
it('reveals the full confirmation only after a current successful read and hides it for the next recheck', async () => {
  const p = page(zh); p.state.value.kind = 'tradein';
  p.purchaseStatus.value = 'loading'; expect(await p.show()).not.toContain('$376.55');
  p.purchaseStatus.value = 'ready'; const ready = await p.show();
  expect(ready).toContain('$376.55'); expect(ready).toContain(zh.tradein.sheetDisclaimer);
  p.purchaseStatus.value = 'loading'; expect(await p.show()).not.toContain('$376.55');
});
it('keeps an original transaction recovery ahead of the qualification loading branch', async () => {
  const p = page(zh); p.state.value.kind = 'tradein'; p.purchaseStatus.value = 'loading'; p.purchaseRecovery.value = 'pending';
  const html = await p.show(); expect(html).toContain(zh.tradein.purchaseResume);
  expect(html).not.toContain('$376.55'); expect(html).not.toContain(zh.store.purchaseEligibilityLoading);
});
