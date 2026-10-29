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

const descriptor = parse(source).descriptor;
const ast = ts.createSourceFile('tradein.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const selected = ast.statements.filter(node =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'previewCredit'
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
    ts.isIdentifier(declaration.name) && ['choiceSources', 'tradeinView'].includes(declaration.name.text)));
expect(selected).toHaveLength(3);
const code = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const render = new Function('Vue', compile(descriptor.template!.content, {
  mode: 'function', prefixIdentifiers: true, isCustomElement: tag => ['view', 'text'].includes(tag),
}).code)(Vue);

function page(copy = en, remoteApiEnabled = true) {
  const state = ref({ kind: 'choice', tradeInSources: ['42'], newPrice: 500, oldDeviceId: '42', newKind: 'stellarbox-pro' });
  const device = { id: '42', kind: 'stellarbox-s1', name: 'UVEL S1', paidPriceUsdt: 200, cumulativeEarningsUsdt: 50 };
  const canonicalQuote = ref({ sourceDeviceId: 42, sourceRowVersion: 1, targetDeviceStatus: "ACTIVE", targetProductNo: 'stellarbox-pro', sourceActualPaidUsdt: 200,
    cumulativeOutputUsdt: 50, discountUsdt: 123.45, creditRatePct: 61.725, payableUsdt: 376.55 });
  const deps = { computed, state, app: { devices: [device] }, t: ref(copy), remoteApiEnabled,
    canonicalQuote, fmt, formatAmount, deviceName, computeTradeInCredit, ladderBandFor, kindLabel: (kind: string) => kind };
  const actual = new Function('deps', `const {${Object.keys(deps).join(',')}} = deps; ${code}; return {choiceSources, tradeinView};`)(deps);
  const setup = { ...deps, ...actual, quoteLoading: false, confirming: false, ctaHalo: {},
    hide: () => {}, onKeyboardActivate: () => {}, onChooseTradein: () => {}, onChooseFullPrice: () => {}, onConfirmTradein: () => {} };
  const show = () => renderToString(Vue.createSSRApp({ render, setup: () => Vue.proxyRefs(setup) }));
  return { state, canonicalQuote, actual, show };
}

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
