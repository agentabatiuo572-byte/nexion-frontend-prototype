import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import source from './referral-progress.vue?raw';

const script = compileScript(parse(source).descriptor, { id: 'referral-progress-behavior' });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Progress = { activityId: string; qualifyingOrders: number; ownRewards: never[] };
type View = { loading: Vue.Ref<boolean>; error: Vue.Ref<boolean>; progress: Vue.Ref<Record<string, Progress>>; loadProgress: (id: string) => Promise<void> };
const cleanups: Array<() => void> = [];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await Vue.nextTick(); };
function mount() {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const referral = vi.fn<(id: string) => Promise<Progress>>().mockImplementation(async id => ({ activityId: id, qualifyingOrders: 1, ownRewards: [] }));
  const unmounted: Array<() => void> = [];
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
    '@/api/runtime': { remoteApiEnabled: true, promotionApi: {
      list: async () => ({ items: [{ activityId: 'A', template: 'DIRECT_REFERRAL' }], nextCursor: null, hasMore: false }), referral,
    } },
    '@/store/app': { useApp: () => app }, '@/store/auth': { useAuth: () => ({ isAuthenticated: true }) },
    '@/i18n/use-t': { useT: () => Vue.ref({ promotion: {} }) },
    '@/store/locale': { useLocaleStore: () => ({ code: 'en' }) },
    '@/lib/promotion-display': { localized: () => '' }, './reward-rows.vue': { default: {} },
  };
  const exports = { default: {} as { setup: (props: object, context: { emit: () => void; expose: () => void }) => View } };
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in modules)) throw new Error('Unexpected referral dependency: ' + id);
    return modules[id];
  }, exports);
  const scope = Vue.effectScope();
  const view = scope.run(() => exports.default.setup({}, { emit() {}, expose() {} }))!;
  const unmount = () => { unmounted.forEach(fn => fn()); scope.stop(); };
  cleanups.push(unmount);
  return { app, view, referral, unmount };
}
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

it('clears the failed read when refreshing the same invitation progress successfully', async () => {
  const screen = mount(); await flush();
  screen.referral.mockRejectedValueOnce(new Error('offline'));
  await screen.view.loadProgress('A'); expect(screen.view.error.value).toBe(true);
  screen.referral.mockResolvedValueOnce({ activityId: 'A', qualifyingOrders: 2, ownRewards: [] });
  await screen.view.loadProgress('A');
  expect(screen.view.progress.value.A.qualifyingOrders).toBe(2);
  expect(screen.view.error.value).toBe(false); expect(screen.view.loading.value).toBe(false);
});
it('does not let a previous account failure overwrite a new account result', async () => {
  const screen = mount(); await flush();
  let reject!: (error: Error) => void;
  screen.referral.mockReturnValueOnce(new Promise((_resolve, no) => { reject = no; }));
  const stale = screen.view.loadProgress('A');
  screen.app.accountKey = 'user:8'; screen.app.accountBindingEpoch++; await flush();
  reject(new Error('old account offline')); await stale;
  expect(screen.view.error.value).toBe(false); expect(screen.view.loading.value).toBe(false);
  expect(screen.view.progress.value.A.qualifyingOrders).toBe(1);
});
it('ignores a progress result after unmount', async () => {
  const screen = mount(); await flush();
  let resolve!: (progress: Progress) => void;
  screen.referral.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
  const stale = screen.view.loadProgress('A'); screen.unmount();
  resolve({ activityId: 'A', qualifyingOrders: 9, ownRewards: [] }); await stale;
  expect(screen.view.progress.value.A.qualifyingOrders).toBe(1);
});
