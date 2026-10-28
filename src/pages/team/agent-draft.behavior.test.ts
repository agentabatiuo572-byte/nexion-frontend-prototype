import { teamPrivacyFixture } from './team-privacy.test-support';
import * as Vue from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import source from './agent.vue?raw';
import { mountEntry, all, flush, slot, text } from '@/lib/entry-review.test-support';
import * as draftSession from '@/lib/ambassador-draft-session';
import * as commands from '@/lib/ambassador-command-key';
import * as requestScope from '@/lib/team-p3-17-18-request-scope';
import { formatAmount } from '@/lib/amount-display';
import { formatFinanceAmount } from '@/lib/finance-amount-display';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { fmt } from '@/i18n/format';
import { en } from '@/i18n/messages/en';

const stops: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const storage = new Map();
  vi.stubGlobal('uni', { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) });
});
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); vi.useRealTimers(); });
function deferred<T = any>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const cache = draftSession.createAmbassadorDraftCache();
  const app = Vue.reactive({ accountKey: 'user:A', accountBindingEpoch: 1 });
  const policy = { defaultBudgetUsdt: 3000, buckets: [{ id: 'venue', title: 'Venue', rule: 'Rule', minBudgetUsdt: 100, maxBudgetUsdt: 10000 }] };
  const api = { policy: vi.fn(async () => policy), latest: vi.fn(async () => ({ status: 'NONE' })), history: vi.fn(async () => []), submit: vi.fn(async () => ({ status: 'SUBMITTED', applicationId: 'confirmed' })) };
  const toast = { success: vi.fn(), error: vi.fn() };
  function mount() {
    const show: Array<() => void> = [], hide: Array<() => void> = [], unload: Array<() => void> = [];
    const input = { default: Vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('input', { value: props.modelValue, disabled: props.disabled, onInput: (value: string) => emit('update:modelValue', value) }) }) };
    const adapted = source.replace('<script setup lang="ts">', '<script setup lang="ts">\nimport UniInput from "./draft-test-input.vue";').replace(/<input\b/g, '<UniInput');
    const page = mountEntry(adapted, {
      './draft-test-input.vue': input,
      '@/lib/amount-display': { formatAmount }, '@/lib/finance-amount-display': { formatFinanceAmount },
      '@/lib/route': { navTo: vi.fn() },
      '@dcloudio/uni-app': { onShow: (fn: () => void) => show.push(fn), onHide: (fn: () => void) => hide.push(fn), onUnload: (fn: () => void) => unload.push(fn) },
      '@/components/app-chassis.vue': slot, '@/components/sub-page-header.vue': slot, '@/components/team/v-badge.vue': slot,
      '@/components/team/team-art.vue': slot, '@/components/team/team-rank-emblem.vue': slot,
      '@/store/v-rank': { useVRank: () => ({ myRank: 5, remoteReady: true, ladder: [], refreshCanonicalVRank: async () => {} }) },
      '@/lib/v-rank-copy': { rankLabel: () => 'V5', rankTitle: () => 'Rank' },
      '@/store/data-visibility': teamPrivacyFixture().dependency, '@/store/locale': { useLocaleStore: () => ({ code: 'en' }) }, '@/i18n/use-t': { useT: () => Vue.ref(en) }, '@/i18n/format': { fmt },
      '@/i18n/network-reaudit': { networkReauditCopy }, '@/i18n/team-logic-copy': { teamLogicCopy },
      '@/store/app': { useApp: () => app }, '@/store/auth': { useAuth: () => Vue.reactive({ isAuthenticated: true }) }, '@/store/ui': { toast },
      '@/api/runtime': { apiRuntimeConfig: { environment: 'prod', baseUrl: 'https://fixture.invalid' }, remoteApiEnabled: true, ambassadorApplicationApi: api },
      '@/api/ambassador-application-api': { isAmbassadorApplicationPending: () => false }, '@/api/errors': { isSettledRejection: () => false },
      '@/lib/ambassador-command-key': commands, '@/lib/team-p3-17-18-request-scope': requestScope,
      '@/lib/ambassador-draft-session': { ...draftSession, ambassadorDraftCache: cache },
    });
    let live = true;
    const destroy = () => { if (live) { unload.forEach(fn => fn()); page.unmount(); live = false; } };
    stops.push(destroy);
    const fields = () => all(page.root).filter(node => node.tag === 'input');
    return { ...page, destroy, fields, values: () => fields().map(node => node.props.value),
      show: async () => { show.forEach(fn => fn()); await flush(); }, hide: async () => { hide.forEach(fn => fn()); await flush(); },
      submit: async () => { page.nodes('agent-submit')[0].props.onClick(); await flush(); },
      fill: async () => {
        for (const [i, value] of ['2026-11-01', 'Tokyo', '4500'].entries()) fields()[i].props.onInput(value);
        page.nodes('agent-bucket')[0].props.onClickCapture(); await flush();
      },
    };
  }
  return { mount, api, policy, toast, app, cache };
}

it('TI-F04 retains date/city/budget/type through hide, read retry and unload/remount; explicit discard clears', async () => {
  const f = fixture(), p = f.mount(); await p.show(); await p.fill(); await p.hide();
  f.policy.defaultBudgetUsdt = 2000; await p.show();
  expect(p.values()).toEqual(['2026-11-01', 'Tokyo', '4500']);
  expect(p.nodes('agent-bucket')[0].props['aria-pressed']).toBe(true);
  f.api.policy.mockRejectedValueOnce(new Error('offline')); await p.hide(); await p.show();
  p.nodes('agent-retry')[0].props.onClick(); await flush();
  expect(p.values()).toEqual(['2026-11-01', 'Tokyo', '4500']);
  p.destroy(); const returned = f.mount(); await returned.show();
  expect(returned.values()).toEqual(['2026-11-01', 'Tokyo', '4500']);
  returned.control(teamLogicCopy('en').discardDraft)!.props.onClick(); await flush();
  expect(returned.values()).toEqual(['', '', '2000']);
  expect(returned.nodes('agent-bucket')[0].props['aria-pressed']).toBe(false);
});

it('revalidates the retained budget and category against refreshed policy without replacing the draft', async () => {
  const f = fixture(), p = f.mount(); await p.show(); await p.fill(); await p.hide();
  f.policy.buckets[0].maxBudgetUsdt = 4000; await p.show(); await p.submit();
  expect(f.api.submit).not.toHaveBeenCalled(); expect(p.values()[2]).toBe('4500');
  expect(f.toast.error).toHaveBeenCalledWith(en.agent.invalidFormTitle, en.agent.invalidFormBody);
  f.policy.buckets = []; await p.hide(); await p.show(); await p.submit();
  expect(f.api.submit).not.toHaveBeenCalled(); expect(p.values()).toEqual(['2026-11-01', 'Tokyo', '4500']);
});

it('rejects stale page reads and clears draft on account/epoch changes, including A→B→A', async () => {
  const f = fixture(), p = f.mount(); await p.show(); await p.fill();
  const stale = deferred<typeof f.policy>(); f.api.policy.mockReturnValueOnce(stale.promise);
  await p.hide(); await p.show(); f.app.accountKey = 'user:B'; f.app.accountBindingEpoch++; await flush();
  stale.resolve({ ...f.policy, defaultBudgetUsdt: 9999 }); await flush();
  expect(p.values()).toEqual(['', '', '3000']);
  f.app.accountKey = 'user:A'; f.app.accountBindingEpoch++; await flush();
  expect(p.values()).toEqual(['', '', '3000']);
  await p.fill(); p.destroy(); f.app.accountBindingEpoch += 2;
  const returned = f.mount(); await returned.show(); expect(returned.values()).toEqual(['', '', '3000']);
});

it('keeps a single POST in flight across hide/remount; confirmed success clears the shared draft', async () => {
  const f = fixture(), p = f.mount(); await p.show(); await p.fill();
  const pending = deferred(); f.api.submit.mockReturnValueOnce(pending.promise);
  await p.submit(); await p.submit(); await p.hide(); p.destroy();
  const returned = f.mount(); await returned.show(); await returned.submit();
  expect(f.api.submit).toHaveBeenCalledTimes(1);
  expect(returned.fields().every(node => node.props.disabled)).toBe(true);
  returned.control(teamLogicCopy('en').discardDraft)!.props.onClick(); await flush();
  expect(returned.values()[1]).toBe('Tokyo');
  pending.resolve({ status: 'SUBMITTED', applicationId: 'confirmed' }); await flush();
  expect(returned.values()).toEqual(['', '', '3000']);
  expect(returned.fields().some(node => node.props.disabled)).toBe(false);
  expect(f.toast.success).not.toHaveBeenCalled(); // Detached page cannot toast a result.
});

it('unknown POST outcomes retain the form and replay the original idempotency key; only success clears', async () => {
  const f = fixture(), p = f.mount(); await p.show(); await p.fill();
  f.api.submit.mockRejectedValueOnce(new Error('timeout')); await p.submit();
  const key = (f.api.submit.mock.calls[0] as unknown as [unknown, string])[1];
  expect(p.values()).toEqual(['2026-11-01', 'Tokyo', '4500']); expect(f.toast.success).not.toHaveBeenCalled();
  await p.hide(); await p.show(); await p.submit();
  expect((f.api.submit.mock.calls[1] as unknown as [unknown, string])[1]).toBe(key);
  expect(p.values()).toEqual(['', '', '3000']); expect(f.toast.success).toHaveBeenCalledOnce();
});

it('a prior account’s late success cannot clear the new account draft or toast success', async () => {
  const f = fixture(), p = f.mount(); await p.show(); await p.fill();
  const pending = deferred(); f.api.submit.mockReturnValueOnce(pending.promise); await p.submit();
  f.app.accountKey = 'user:B'; f.app.accountBindingEpoch++; await flush(); await p.fill();
  pending.resolve({ status: 'SUBMITTED', applicationId: 'A-only' }); await flush();
  expect(p.values()).toEqual(['2026-11-01', 'Tokyo', '4500']);
  expect(text(p.root)).not.toContain('A-only'); expect(f.toast.success).not.toHaveBeenCalled();
});
it('retains the accepted six-decimal USDT budget, category and application ID in the toast and history', async () => {
  const h = fixture();
  const accepted = { applicationId: 5223, status: 'PENDING', city: 'Tokyo', eventDate: '2026-11-01', budgetUsdt: 100.123456, bucket: 'venue' };
  h.api.submit.mockResolvedValue(accepted as any);
  h.api.history.mockResolvedValue([accepted] as any);
  const p = h.mount(); await p.show(); await p.fill();
  p.fields()[2].props.onInput('100.123456'); await flush();
  await p.submit();
  expect((h.api.submit.mock.calls as unknown[][])[0]?.[0]).toMatchObject({ budgetUsdt: 100.123456, bucket: 'venue' });
  expect(h.toast.success.mock.calls[0][1]).toContain('100.123456 USDT');
  expect(h.toast.success.mock.calls[0][1]).not.toContain('$100.12');
  const history = text(p.root);
  expect(history).toContain(en.agent.buckets.venue.title);
  expect(history).toContain('100.123456 USDT');
  expect(history).toContain('5223');
  expect(history).toContain('Tokyo');
  expect(history).toContain('2026-11-01');
  expect(history).toContain(en.agent.applicationStatuses.PENDING);
});
