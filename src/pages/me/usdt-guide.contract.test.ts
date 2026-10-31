// @ts-expect-error Vitest executes this page-copy contract in Node.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi as vitest } from "vitest";
import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import topupSource from './wallet-topup.vue?raw';

const page = readFileSync(new URL("./usdt-guide.vue", import.meta.url), "utf8");
const zh = readFileSync(new URL("../../i18n/messages/zh.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../../i18n/messages/en.ts", import.meta.url), "utf8");
const vi = readFileSync(new URL("../../i18n/messages/vi.ts", import.meta.url), "utf8");

// The order top-up banner's own imports; these cases exercise only the channel choice.
const orderBanner = { '@/store/app': { useApp: () => ({ user: { usdtBalance: 0 }, remoteFleetHasSnapshot: false }) }, '@/store/locale': { useLocaleStore: () => ({ code: 'zh' }) },
  '@/composables/use-tab-page-lifecycle': { useVisibleInterval: () => {} }, '@/lib/purchase-payment-copy': { purchasePaymentCopy: () => ({}), fillCopy: (text: string) => text },
  '@/lib/amount-display': { formatGroupedAmount: String } };
function setup(raw: string, dependencies: Record<string, unknown>) {
  dependencies = { ...orderBanner, ...dependencies };
  const script = compileScript(parse(raw).descriptor, { id: 'topup-return' });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const output: any = {};
  new Function('require', 'exports', code)((id: string) => {
    if (id.endsWith('.vue')) return {};
    if (id === 'vue') return Vue;
    if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
    return dependencies[id];
  }, output);
  return output.default.setup({}, { expose() {} });
}
afterEach(() => vitest.unstubAllGlobals());

function guideCopy(messages: string): string {
  const start = messages.indexOf("  usdtGuide:");
  const end = messages.indexOf("\n  //", start);
  return messages.slice(start, end < 0 ? undefined : end);
}

describe("USDT guide accuracy", () => {
  it.each(['pages/me/wallet-topup', '/pages/me/wallet-topup', 'pages/me/wallet', undefined])('returns to the original top-up instance only when it is the previous page (%s)', previous => {
    vitest.stubGlobal('getCurrentPages', () => previous ? [{ route: previous }, { route: 'pages/me/usdt-guide' }] : [{ route: 'pages/me/usdt-guide' }]);
    const navBack = vitest.fn(), navReplace = vitest.fn();
    const state = setup(page, { '@/i18n/use-t': { useT: () => Vue.ref({}) }, '@/lib/route': { navBack, navReplace } });
    state.goBack();
    const hasTopup = previous?.endsWith('/wallet-topup');
    expect(hasTopup ? navBack : navReplace).toHaveBeenCalledExactlyOnceWith('/pages/me/wallet-topup?channel=crypto');
    expect(hasTopup ? navReplace : navBack).not.toHaveBeenCalled();
  });

  it.each([
    [true, 'crypto', 'crypto'], [true, 'bank', 'bank'], [true, 'card', 'bank'],
    [true, 'javascript:alert(1)', 'bank'], [true, ['crypto'], 'bank'], [true, '', 'bank'],
    [false, 'card', 'card'], [false, undefined, 'crypto'],
  ])('restricts the top-up channel to enabled options (remote=%s, query=%s)', (remote, channel, expected) => {
    let load!: (query: unknown) => void;
    const state = setup(topupSource, {
      '@dcloudio/uni-app': { onLoad: (callback: typeof load) => { load = callback; } },
      '@/lib/route': { takeNavigationQuery: () => '', navTo: () => {} }, '@/api/runtime': { remoteApiEnabled: remote },
      '@/i18n/use-t': { useT: () => Vue.ref({}) }, '@/store/deposits': { useDeposits: () => ({}) },
    });
    load({ channel }); expect(state.seg.value).toBe(expected);
  });

  it('consumes only the top-up navigation fallback query when onLoad omits it', () => {
    let load!: (query: unknown) => void;
    const takeNavigationQuery = vitest.fn(() => '?channel=crypto&address=untrusted&amount=999');
    const state = setup(topupSource, {
      '@dcloudio/uni-app': { onLoad: (callback: typeof load) => { load = callback; } },
      '@/lib/route': { takeNavigationQuery, navTo: () => {} }, '@/api/runtime': { remoteApiEnabled: true },
      '@/i18n/use-t': { useT: () => Vue.ref({}) }, '@/store/deposits': { useDeposits: () => ({}) },
    });
    load({}); expect(state.seg.value).toBe('crypto');
    expect(takeNavigationQuery).toHaveBeenCalledExactlyOnceWith('/pages/me/wallet-topup');
  });

  it('keeps the unpaid order in view and leads back to its payment once the balance covers it', () => {
    let load!: (query: unknown) => void;
    const navTo = vitest.fn(), app = Vue.reactive({ user: { usdtBalance: 820.64 }, remoteFleetHasSnapshot: true });
    const state = setup(topupSource, {
      '@dcloudio/uni-app': { onLoad: (callback: typeof load) => { load = callback; } },
      '@/lib/route': { takeNavigationQuery: () => '', navTo }, '@/api/runtime': { remoteApiEnabled: true },
      '@/i18n/use-t': { useT: () => Vue.ref({}) }, '@/store/deposits': { useDeposits: () => ({}) }, '@/store/app': { useApp: () => app },
    });
    load({ orderNo: 'ORD-1', amount: '1299', name: 'UVELBox S1' });
    expect(state.orderTopupLeft.value).toBeCloseTo(478.36);
    app.user.usdtBalance = 1320.64;
    expect(state.orderTopupLeft.value).toBe(0);
    state.backToOrder();
    expect(navTo).toHaveBeenCalledWith('/pages/store/order-detail?id=ORD-1&pay=1');
  });

  it.each([zh, en, vi])("does not make a fixed network, timing, or recovery promise", (messages) => {
    const guide = guideCopy(messages);
    expect(guide).toContain("usdtGuide:");
    expect(guide).toMatch(/(?:top-up|充值|trang nạp)/i);
    expect(guide).toMatch(/(?:available|可用|hiện có)/i);
    expect(guide).toMatch(/(?:provider|服务商|nhà cung cấp)/i);
    expect(guide).toMatch(/(?:fee|费用|phí)/i);
    expect(guide).not.toMatch(/(?:TRC20.{0,30}(?:lowest|最低|thấp nhất)|(?:only minutes|只需几分钟|chỉ mất vài phút)|(?:cannot be recovered|无法找回|không thể khôi phục))/i);
  });
});
