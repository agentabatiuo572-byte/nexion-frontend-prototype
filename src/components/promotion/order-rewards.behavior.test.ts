import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import source from './order-rewards.vue?raw';

const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: 'order-rewards' }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const cleanups: Array<() => void> = [];
const pending = () => ({ orderNo: 'ORD-ORIGINAL', promotionQuoteId: 'QUOTE-ORIGINAL', paymentStatus: 'PENDING',
  orderStatus: 'PENDING_PAYMENT', payBy: new Date(Date.now() + 60_000).toISOString(), rewards: [], items: [] });
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); await Vue.nextTick(); };
function mount(receipt = pending()) {
  const props = Vue.reactive({ orderNo: 'ORD-ORIGINAL', paymentAllowed: true });
  const findOrder = vi.fn().mockResolvedValue(receipt), rewards = vi.fn().mockResolvedValue({ items: [] });
  const navTo = vi.fn(), app = Vue.reactive({ accountKey: 'fixture-account', accountBindingEpoch: 1 });
  const unmounts: Array<() => void> = [];
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onBeforeUnmount: (fn: () => void) => unmounts.push(fn) },
    '@/components/promotion/promotion-action.vue': { default: {} }, './reward-rows.vue': { default: {} },
    '@/i18n/use-t': { useT: () => Vue.ref({ promotion: {} }) }, '@/store/app': { useApp: () => app },
    '@/api/runtime': { promotionApi: { findOrder, rewards }, remoteApiEnabled: true }, '@/lib/route': { navTo },
  };
  const exports = { default: {} as { setup: (input: typeof props, context: { expose(): void }) => {
    resume(): void; load(): Promise<void>; resumeAllowed: Vue.ComputedRef<boolean>;
  } } };
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected order rewards dependency: ${id}`);
    return modules[id];
  }, exports);
  const scope = Vue.effectScope(), view = scope.run(() => exports.default.setup(props, { expose() {} }))!;
  cleanups.push(() => { unmounts.forEach(fn => fn()); scope.stop(); });
  return { props, view, findOrder, navTo };
}
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });

describe('reward card original payment entry', () => {
  it('only resumes the current payable promoted original', async () => {
    const h = mount(); await settle(); expect(h.view.resumeAllowed.value).toBe(true);
    h.view.resume(); expect(h.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/checkout?promotion=1&orderNo=ORD-ORIGINAL');
    h.props.paymentAllowed = false; await settle(); expect(h.view.resumeAllowed.value).toBe(false);
    h.navTo.mockClear(); h.view.resume(); expect(h.navTo).not.toHaveBeenCalled();
  });
  it.each(['CANCELLED', 'EXPIRED', 'COMPLETED', 'REFUNDED'])('blocks a %s order even with stale PENDING payment metadata', async orderStatus => {
    const h = mount({ ...pending(), orderStatus }); await settle();
    expect(h.view.resumeAllowed.value).toBe(false); h.view.resume(); expect(h.navTo).not.toHaveBeenCalled();
  });
  it.each(['PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED'])('blocks %s payment status', async paymentStatus => {
    const h = mount({ ...pending(), paymentStatus }); await settle();
    expect(h.view.resumeAllowed.value).toBe(false); h.view.resume(); expect(h.navTo).not.toHaveBeenCalled();
  });
  it('checks the deadline again at click time, even before another render', async () => {
    const receipt = pending(), h = mount(receipt); await settle();
    expect(h.view.resumeAllowed.value).toBe(true); vi.spyOn(Date, 'now').mockReturnValue(Date.parse(receipt.payBy) + 1);
    h.view.resume(); expect(h.navTo).not.toHaveBeenCalled();
  });
  it('does not expose or execute stale payment recovery while a receipt refresh fails', async () => {
    const h = mount(); await settle(); h.findOrder.mockRejectedValue(new Error('read unavailable'));
    const loading = h.view.load(); expect(h.view.resumeAllowed.value).toBe(false); await loading;
    expect(h.view.resumeAllowed.value).toBe(false); h.view.resume(); expect(h.navTo).not.toHaveBeenCalled();
  });
  it('does not route an ordinary receipt or a mismatched original through promotion payment', async () => {
    for (const changed of [{ promotionQuoteId: '' }, { orderNo: 'ORD-OTHER' }]) {
      const h = mount({ ...pending(), ...changed }); await settle();
      expect(h.view.resumeAllowed.value).toBe(false); h.view.resume(); expect(h.navTo).not.toHaveBeenCalled();
    }
  });
});
