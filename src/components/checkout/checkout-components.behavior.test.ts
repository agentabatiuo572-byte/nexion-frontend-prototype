import * as Vue from 'vue';
import { compileScript, compileStyle, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import amountSource from './CheckoutAmount.vue?raw';
import legalSource from './CheckoutLegal.vue?raw';
import sheetSource from './CheckoutPaymentSheet.vue?raw';
import resultSource from './CheckoutResult.vue?raw';
import { formatGroupedAmount } from '@/lib/amount-display';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
import type { LocaleCode } from '@/i18n';

const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); });

// Run each complete production SFC setup and template. Only the locale store,
// browser/native lifecycle and imported child components are adapters.
function screen(source: string, input: Record<string, unknown>, options: { reduced?: boolean; locale?: LocaleCode; slot?: string } = {}) {
  const descriptor = parse(source).descriptor;
  const mounted: Array<() => void> = [], unmounted: Array<() => void> = [], hidden: Array<() => void> = [], shown: Array<() => void> = [];
  const listeners = new Map<string, () => void>(), locale = Vue.reactive({ code: options.locale ?? 'zh' });
  const mq = { matches: !!options.reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const document = { hidden: false, addEventListener: vi.fn((name: string, callback: () => void) => listeners.set(name, callback)), removeEventListener: vi.fn() };
  vi.stubGlobal('window', { matchMedia: () => mq }); vi.stubGlobal('document', document);
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
    '@/store/locale': { useLocaleStore: () => locale },
    '@/lib/checkout-flow-copy': { checkoutFlowCopy }, '@/lib/amount-display': { formatGroupedAmount },
    '@/composables/use-tab-page-lifecycle': { onHide: (fn: () => void) => hidden.push(fn), onShow: (fn: () => void) => shown.push(fn) },
  };
  const script = ts.transpileModule(compileScript(descriptor, { id: 'checkout-test' }).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: undefined as any };
  new Function('require', 'exports', script)((id: string) => {
    if (id in modules) return modules[id];
    if (id.endsWith('.vue')) return { default: {} };
    throw new Error('Unexpected component dependency: ' + id);
  }, exports);
  const defaults = Object.fromEntries(Object.entries(exports.default.props ?? {}).flatMap(([key, rule]) => rule && typeof rule === 'object' && 'default' in rule ? [[key, rule.default]] : []));
  const props = Vue.reactive({ ...defaults, ...input }), emit = vi.fn(), scope = Vue.effectScope();
  const view = scope.run(() => exports.default.setup(props, { expose() {}, emit }))!;
  const template = compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true, isTS: true, expressionPlugins: ['typescript'], isCustomElement: tag => ['view', 'text', 'image'].includes(tag) }).code;
  const render = new Function('Vue', ts.transpileModule(template, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)({ ...Vue, resolveComponent: (name: string) => ({ name, render: () => null }) });
  // Real render context is required by Vue's slot helper. The host is inert:
  // assertions inspect the production VNodes, rather than simulating the DOM.
  const renderer = Vue.createRenderer({
    patchProp() {}, insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
  });
  const tree = () => {
    const rows: any[] = [];
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      rows.push(node);
      if (Array.isArray(node.children)) node.children.forEach(visit);
      else if (node.children && typeof node.children === 'object') Object.values(node.children).filter(value => typeof value === 'function').forEach(slot => (slot as () => any[])().forEach(visit));
    };
    const root = {}, vnode = Vue.createVNode({ render() { return render(Vue.proxyRefs({ ...Vue.toRefs(props), ...view, $slots: this.$slots }), []); } }, null, options.slot ? { default: () => Vue.h('text', options.slot) } : undefined);
    renderer.render(vnode, root); visit(vnode.component!.subTree); renderer.render(null, root); return rows;
  };
  const text = () => tree().filter(node => node.type !== Vue.Comment && typeof node.children === 'string').map(node => node.children).join('');
  const css = descriptor.styles.map(style => compileStyle({ filename: 'CheckoutResult.vue', id: 'data-v-real-checkout-scope', scoped: true, source: style.content }).code).join('\n');
  const animation = (base: string) => { const name = [...css.matchAll(/@keyframes\s+([^\s{]+)/g)].map(match => match[1]).find(name => name.startsWith(base + '-')); if (!name) throw new Error('Compiled keyframe missing: ' + base); return { animationName: name }; };
  const start = () => mounted.forEach(fn => fn());
  disposals.push(() => { unmounted.forEach(fn => fn()); scope.stop(); });
  return { props: props as any, view, emit, locale, tree, text, mq, document, listeners, hidden, shown, start, animation };
}

describe('checkout amount and legal components', () => {
  it('uses the existing exact formatter and USD prefix with two weak decimal digits', () => {
    const s = screen(amountSource, { value: '999.995' });
    expect(s.text()).toBe('$1,000.00');
    expect(s.tree().find(node => node.props?.class === 'checkout-amount__fraction').children).toBe('.00');
  });
  it('renders one USDT suffix, no detail unit when hidden, and no fake amount for invalid input', async () => {
    const s = screen(amountSource, { value: '12345678901234567890.125', currency: 'USDT' });
    expect(s.text()).toBe('12,345,678,901,234,567,890.13USDT');
    s.props.showCurrency = false; await Vue.nextTick(); expect(s.text()).not.toContain('USDT');
    s.props.value = ''; await Vue.nextTick(); expect(s.text()).toBe('—');
  });
  it('keeps the dollar marker for a missing authoritative USD amount',()=>{
    const s=screen(amountSource,{value:null,currency:'USD'});
    expect(s.text()).toBe('$—');
  });
  it('keeps the three parent-owned legal actions and changes all labels with locale', async () => {
    const s = screen(legalSource, {});
    const links = s.tree().filter(node => node.props?.role === 'link');
    links.forEach(link => link.props.onClick());
    expect(s.emit.mock.calls).toEqual([['navigate', 'aftersales'], ['navigate', 'terms'], ['navigate', 'risk']]);
    s.locale.code = 'vi'; await Vue.nextTick();
    expect(s.text()).toContain(checkoutFlowCopy('vi').legalLead);
    expect(s.tree().filter(node => node.props?.role === 'link').map(node => node.children[0].children)).toEqual(['Hậu mãi', 'Điều khoản', 'Rủi ro']);
  });
});

describe('wallet-only checkout sheet', () => {
  it('emits only close for dismissal and never calls a payment command', () => {
    const s = screen(sheetSource, { open: true, amount: '12', balance: '20' });
    s.tree()[0].props.onClose(); expect(s.emit.mock.calls).toEqual([['close']]);
  });
  it('blocks double confirmation and busy/error paths, then permits a new completed attempt', async () => {
    const s = screen(sheetSource, { open: true, amount: '12', balance: '20' });
    s.view.confirm(); s.view.confirm(); expect(s.emit.mock.calls).toEqual([['confirm']]);
    s.props.busy = true; await Vue.nextTick(); s.view.confirm(); expect(s.emit).toHaveBeenCalledTimes(1);
    s.props.busy = false; s.props.error = 'Please retry'; await Vue.nextTick(); s.view.confirm(); expect(s.emit).toHaveBeenCalledTimes(1);
    s.props.error = ''; await Vue.nextTick(); s.view.confirm(); expect(s.emit).toHaveBeenCalledTimes(2);
  });
  it('does not turn an unknown balance into zero and preserves authorized zero-debit orders', () => {
    const positive = screen(sheetSource, { open: true, amount: '12' });
    expect(positive.view.balanceText.value).toBe('—'); positive.view.confirm(); expect(positive.emit).not.toHaveBeenCalled();
    const zero = screen(sheetSource, { open: true, amount: '0' }); zero.view.confirm();
    expect(zero.emit).toHaveBeenCalledExactlyOnceWith('confirm'); expect(zero.view.balanceText.value).toBe('—');
  });
  it('offers top-up for a confirmed insufficient balance and does not duplicate USDT in the balance', () => {
    const s = screen(sheetSource, { open: true, amount: '12', balance: '11' });
    expect(s.view.canConfirm.value).toBe(false); expect(s.view.balanceText.value).toBe('11.00');
    const topup = s.tree().find(node => node.type?.name === 'NxButton' && node.props.label === checkoutFlowCopy('zh').topup);
    expect(topup).toBeDefined(); topup.props.onClick(); expect(s.emit).toHaveBeenCalledExactlyOnceWith('topup');
  });
});

describe('authoritative checkout result presentation', () => {
  it('keeps parent-owned order benefits inside the result body before the actions', () => {
    const s = screen(resultSource, { state: 'inventory', productName: 'Cloud Share' }, { slot: 'Parent-owned order benefits' });
    const nodes = s.tree(), body = nodes.find(node => node.props?.class === 'checkout-result__body');
    expect(nodes.some(node => node.children === 'Parent-owned order benefits')).toBe(true);
    expect(body.children.at(-1).children.some((node: any) => node.children === 'Parent-owned order benefits')).toBe(true);
    expect(nodes.indexOf(body)).toBeLessThan(nodes.findIndex(node => node.props?.class === 'checkout-result__actions'));
  });
  it('waits for the actual scoped CSS events, including a slow paint, before celebrating', () => {
    vi.useFakeTimers(); const s = screen(resultSource, { state: 'activated' }); s.start();
    expect(s.view.phase.value).toBe('confirmed'); vi.advanceTimersByTime(20000); expect(s.view.phase.value).toBe('confirmed');
    s.view.onVisualEnd(s.animation('checkout-device-breathe')); expect(s.view.phase.value).toBe('confirmed');
    s.view.onVisualEnd(s.animation('checkout-confirmed-hold')); expect(s.view.phase.value).toBe('activating');
    vi.advanceTimersByTime(20000); expect(s.view.phase.value).toBe('activating'); expect(s.view.celebrating.value).toBe(false);
    s.view.onProgressEnd(s.animation('checkout-activation-fill')); expect(s.view.phase.value).toBe('complete'); expect(s.view.celebrating.value).toBe(true);
    expect(s.tree().filter(node => String(node.props?.class).includes('checkout-result__spark'))).toHaveLength(28);
  });
  it('shows the devices action only after activation presentation completes under the latest approved flow', () => {
    const s = screen(resultSource, { state: 'activated' }); s.start();
    expect(s.tree().find(node => node.type?.name === 'NxButton' && node.props.label === checkoutFlowCopy('zh').devices)).toBeUndefined();
    s.view.onVisualEnd(s.animation('checkout-confirmed-hold'));
    expect(s.tree().find(node => node.type?.name === 'NxButton' && node.props.label === checkoutFlowCopy('zh').devices)).toBeUndefined();
    s.view.onProgressEnd(s.animation('checkout-activation-fill'));
    s.tree().find(node => node.type?.name === 'NxButton' && node.props.label === checkoutFlowCopy('zh').devices).props.onClick();
    expect(s.emit.mock.calls).toEqual([['devices']]);
  });
  it('offers a query and neutral inventory destination for an unsettled or failed result', () => {
    for (const state of ['processing', 'error']) {
      const s = screen(resultSource, { state }); s.start();
      const buttons = s.tree().filter(node => node.type?.name === 'NxButton');
      expect(buttons.map(node => node.props.label)).toEqual([checkoutFlowCopy('zh').query, checkoutFlowCopy('zh').deviceInventory]);
      buttons.forEach(button => button.props.onClick()); expect(s.emit.mock.calls).toEqual([['retry'], ['devices']]);
    }
  });
  it('accepts the native animation detail and ignores unrelated child animation cancellation', () => {
    const s = screen(resultSource, { state: 'activated' }); s.start();
    s.view.onVisualEnd({ detail: s.animation('checkout-confirmed-hold') });
    s.view.onMotionCancel(s.animation('checkout-device-breathe')); expect(s.view.phase.value).toBe('activating');
    s.view.onProgressEnd({ detail: s.animation('checkout-activation-fill') });
    s.view.onMotionCancel(s.animation('checkout-orbit-spin')); expect(s.view.celebrating.value).toBe(true);
  });
  it('handles real uni-view normalization that drops animationName and ignores child bubbles', () => {
    const s = screen(resultSource, { state: 'activated' }); s.start();
    const owner = (name: string) => ({ dataset: { checkoutAnimation: name } });
    s.view.onVisualEnd({ type: 'animationend', target: { dataset: {} }, currentTarget: owner('checkout-confirmed-hold'), detail: {} });
    expect(s.view.phase.value).toBe('confirmed');
    s.view.onVisualEnd({ type: 'animationend', target: owner('checkout-confirmed-hold'), currentTarget: owner('checkout-confirmed-hold'), detail: {} });
    expect(s.view.phase.value).toBe('activating');
    s.view.onProgressEnd({ type: 'animationend', target: owner('checkout-activation-fill'), currentTarget: owner('checkout-activation-fill'), detail: {} });
    expect(s.view.phase.value).toBe('complete'); expect(s.view.celebrating.value).toBe(true);
  });
  it('finishes statically after hiding or a cancelled stage without becoming trapped', () => {
    const s = screen(resultSource, { state: 'activated' }); s.start();
    s.view.onVisualEnd(s.animation('checkout-confirmed-hold')); s.view.onMotionCancel(s.animation('checkout-activation-fill'));
    expect(s.view.phase.value).toBe('complete'); expect(s.view.celebrating.value).toBe(false);
    s.hidden.forEach(fn => fn()); s.shown.forEach(fn => fn()); expect(s.view.phase.value).toBe('complete');
  });
  it('renders a static success for reduced motion and responds when that preference changes', () => {
    const reduced = screen(resultSource, { state: 'activated' }, { reduced: true }); reduced.start();
    expect(reduced.view.phase.value).toBe('complete'); expect(reduced.view.celebrating.value).toBe(false);
    const normal = screen(resultSource, { state: 'activated' }); normal.start();
    normal.mq.matches = true; normal.mq.addEventListener.mock.calls[0][1]();
    expect(normal.view.phase.value).toBe('complete'); expect(normal.view.celebrating.value).toBe(false);
  });
  it('never turns inventory, processing or an error into activation success, and stops on a true state change', async () => {
    for (const state of ['inventory', 'processing', 'error']) {
      const s = screen(resultSource, { state }); s.start();
      expect(s.tree().some(node => String(node.props?.class).includes('checkout-result__progress'))).toBe(false);
      expect(s.view.title.value).not.toBe(checkoutFlowCopy('zh').activated); expect(s.view.celebrating.value).toBe(false);
    }
    const s = screen(resultSource, { state: 'processing' }); s.start(); s.props.state = 'activated'; await Vue.nextTick();
    expect(s.view.phase.value).toBe('confirmed'); s.props.state = 'error'; await Vue.nextTick();
    s.view.onVisualEnd(s.animation('checkout-confirmed-hold')); expect(s.view.phase.value).toBe('complete');
    expect(s.view.celebrating.value).toBe(false); expect(s.view.title.value).toBe(checkoutFlowCopy('zh').resultError);
    s.props.state = 'activated'; await Vue.nextTick(); expect(s.view.phase.value).toBe('complete');
  });
});
