import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, expect, test, vi } from 'vitest';
import walletSource from './wallet-nex.vue?raw';
import headerSource from '@/components/sub-page-header.vue?raw';
import marketSource from '@/pages/market/market.vue?raw';
import { navTo, navReset, navBack } from '@/lib/route';
import { nativeTabUrl } from '@/lib/native-tab-navigation';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { formatTrialDateTime } from '@/lib/trial-date';
import { resolveWalletBillMemo } from '@/lib/wallet-bill-display';
import { remoteAuthorityStatus } from '@/lib/remote-authority-display';
import { formatFinanceAmount } from '@/lib/finance-amount-display';
vi.mock('@/store/trial-claim-sheet', () => ({ useTrialClaimSheet: () => ({ closeTransient() {} }) }));
vi.mock('@/store/voucher-claim-sheet', () => ({ useVoucherClaimSheet: () => ({ closeTransient() {} }) }));
vi.mock('@/i18n/use-t', () => ({ getT: () => ({ ui: { navigationFailed: 'Navigation failed' } }) }));
vi.mock('@/store/ui', () => ({ toast: { error: vi.fn() } }));
type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ''): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _old, value) => { n.props[key] = value; }, parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, p, a) => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); n.parent = p;
    const i = a ? p.children.indexOf(a) : -1; p.children.splice(i < 0 ? p.children.length : i, 0, n); },
  remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const blank = { __esModule: true, default: { render: () => null } };
const group = { __esModule: true, default: Vue.defineComponent({ setup: (_, ctx) => () => Vue.h('view', ctx.slots.default?.()) }) };
const pages: Vue.App[] = [];
afterEach(() => { pages.splice(0).forEach(page => page.unmount()); vi.unstubAllGlobals(); });
function compile(raw: string, deps: Record<string, unknown>) {
  const script = compileScript(parse(raw).descriptor, { id: 'wallet-market-return', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => id in deps ? deps[id] : id.endsWith('.vue') ? blank : (() => { throw new Error(id); })(), result);
  return result.default;
}
function mount(component: Vue.Component, props = {}) { const root = node(), page = renderer.createApp(component, props); page.mount(root); pages.push(page); return root; }
type Page = { route: string; scrollTop?: number; balance?: number };
type Options = { url: string; success?: () => void; fail?: () => void };
function stackHost(cold = false, failed = false) {
  const wallet: Page = { route: 'pages/me/wallet-nex', scrollTop: 436, balance: 143 };
  const stack: Page[] = cold ? [{ route: 'pages/market/market' }] : [{ route: 'pages/me/wallet' }, wallet];
  const navigateTo = vi.fn((o: Options) => { if (failed) o.fail?.(); else { stack.push({ route: o.url.slice(1) }); o.success?.(); } });
  const reLaunch = vi.fn((o: Options) => { if (failed) o.fail?.(); else { stack.splice(0, stack.length, { route: o.url.slice(1) }); o.success?.(); } });
  const redirectTo = vi.fn((o: Options) => { if (failed) o.fail?.(); else { stack.splice(-1, 1, { route: o.url.slice(1) }); o.success?.(); } });
  const navigateBack = vi.fn(() => { stack.pop(); }), showToast = vi.fn();
  vi.stubGlobal('getCurrentPages', () => stack); vi.stubGlobal('uni', { navigateTo, reLaunch, redirectTo, navigateBack, showToast, getSystemInfoSync: () => ({ statusBarHeight: 0 }) });
  return { stack, wallet, navigateTo, reLaunch, redirectTo, navigateBack, showToast };
}
function walletPage(copy = en) {
  const app = Vue.reactive({ accountKey: 'user:1', accountBindingEpoch: 1, user: { nexBalance: 143 }, remoteFleetHasSnapshot: true, visibleDevices: [], refreshRemoteFleet: vi.fn(async () => true) });
  const market = Vue.reactive({ nexPriceUSDT: 0.124, costBasis: 0.085, change24hPct: 0, change24hAvailable: true, klineHourly: [], remoteReady: true, remoteError: null as string | null, isMockMode: false, syncRemote: vi.fn(async () => {}), tickPrice: vi.fn() });
  const bills = { summaryStatus: 'ready', summary: { todayNexEarn: 0, pendingNex: 0, recentNexBills: [] }, refreshSummary: vi.fn(async () => {}) };
  const root = mount(compile(walletSource, { vue: Vue, '@dcloudio/uni-app': { onShow() {} }, '@/lib/route': { navTo, navReset },
    '@/components/app-chassis.vue': group, '@/i18n/use-t': { useT: () => Vue.ref(copy) }, '@/i18n/format': { dateLocale: () => 'en-US' },
    '@/lib/finance-amount-display': { formatFinanceAmount }, '@/lib/trial-date': { formatTrialDateTime }, '@/lib/wallet-bill-display': { resolveWalletBillMemo },
    '@/lib/remote-authority-display': { remoteAuthorityStatus }, '@/store/app': { useApp: () => app }, '@/store/market': { useMarket: () => market },
    '@/store/commission': { useCommission: () => ({ events: [] }) }, '@/store/bills': { useBills: () => bills }, '@/store/locale': { useLocaleStore: () => ({ code: 'en' }) },
    '@/api/runtime': { remoteApiEnabled: true, apiRuntimeConfig: { environment: 'dev', baseUrl: 'https://test.example' } },
  }));
  return { root, app, market, click: (label: string) => all(root).find(n => n.props['aria-label'] === label)!.props.onClick() };
}
function marketHeader() {
  const fallback = parse(marketSource).descriptor.template!.content.match(/<SubPageHeader\s+back="([^"]+)"/)![1];
  const root = mount(compile(headerSource, { vue: Vue, '@/store/pending-checkout-core': { PENDING_BAR_INSET_KEY: Symbol('inset') },
    '@/store/message-drawer': { useMessageDrawer: () => ({ actionableUnread: 0 }) }, '@/i18n/use-t': { useT: () => Vue.ref(en) }, '@/lib/route': { navBack },
    '@/lib/header-title': { resolveHeaderTitleText: () => 'Market', routeFromH5Hash: () => '' }, '@/lib/device-preview': { h5DevicePreviewStatusBarHeight: () => 0 },
  }), { back: fallback });
  return () => all(root).find(n => String(n.props.class ?? '').includes('spv-back'))!.props.onClick();
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Vue.nextTick(); }
test.each([en, zh, vietnamese])('wallet actual View market preserves the original wallet for actual header return', async copy => {
  const h = stackHost(), f = walletPage(copy); f.click(copy.nexWallet.viewMarket); await settle();
  expect(h.stack.map(p => p.route)).toEqual(['pages/me/wallet', 'pages/me/wallet-nex', 'pages/market/market']); expect(h.reLaunch).not.toHaveBeenCalled();
  marketHeader()(); expect(h.stack.at(-1)).toBe(h.wallet); expect(h.wallet.scrollTop).toBe(436); expect(f.app.user.nexBalance).toBe(143);
  expect(h.navigateBack).toHaveBeenCalledOnce(); expect(h.wallet.balance).toBe(143);
});
test('the preserved stack supports platform hardware Back without any Home reset', async () => {
  const h = stackHost(), f = walletPage(); f.click(en.nexWallet.viewMarket); await settle();
  h.navigateBack(); expect(h.stack.at(-1)).toBe(h.wallet); expect(h.wallet.scrollTop).toBe(436); expect(h.reLaunch).not.toHaveBeenCalled();
});
test('cold-open Market retains its existing Home fallback', () => {
  const h = stackHost(true); marketHeader()(); expect(h.navigateBack).not.toHaveBeenCalled();
  expect(h.reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: nativeTabUrl('/pages/index/index') }));
});
test('wallet market entry still reports real navigation failure after helper fallbacks fail', async () => {
  const h = stackHost(false, true), f = walletPage(); f.click(en.nexWallet.viewMarket); await settle();
  expect(h.showToast).toHaveBeenCalledWith({ title: 'Navigation failed', icon: 'none' }); expect(h.stack.at(-1)).toBe(h.wallet);
});
test('wallet Buy and Sell keep their original explicit directions independently of the market return change', async () => {
  const h = stackHost(), f = walletPage(); f.click(en.nexWallet.actions.buy); await settle();
  expect(h.navigateTo).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/pages/me/wallet-exchange?direction=usdt2nex' }));
  f.click(en.nexWallet.actions.sell); await settle(); expect(h.navigateTo).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/pages/me/wallet-exchange?direction=nex2usdt' }));
});


test('real wallet rendering still requires balance and quote authority after the routing change', async () => {
  stackHost(); const f = walletPage(); const text = (n: Host): string => n.text + n.children.map(text).join('');
  expect(text(f.root)).toContain('143.00'); expect(text(f.root)).toContain('$17.73');
  f.app.remoteFleetHasSnapshot = false; await Vue.nextTick(); expect(text(f.root)).not.toContain('143.00'); expect(text(f.root)).toContain('—');
  f.app.remoteFleetHasSnapshot = true; f.market.remoteReady = false; f.market.remoteError = 'offline'; await Vue.nextTick();
  expect(text(f.root)).toContain('143.00'); expect(text(f.root)).not.toContain('$17.73'); expect(f.app.user.nexBalance).toBe(143);
});
