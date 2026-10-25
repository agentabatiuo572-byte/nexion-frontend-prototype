import { formatFinanceAmount } from '@/lib/finance-amount-display';
import { afterEach, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import source from './leadership-pool.vue?raw';
import { mountEntry, slot, text, flush } from '@/lib/entry-review.test-support';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import { rankLabel, rankTitle } from '@/lib/v-rank-copy';
import { leadershipPoolFailureState } from '@/lib/leadership-pool-state';
import { leadershipMainRows } from '@/lib/leadership-pool-main';
import { ApiError } from '@/api/errors';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(dispose => dispose()));
function deferred() {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function snapshot(payoutUSDT: unknown = 0) {
  return { currentWeekPoolUSDT: 5000, myRank: 2, unlockRank: 2, myVotes: 2, totalVotes: 40,
    mySharePct: .05, projectedPayoutUSDT: 250, distribution: [], topN: 100,
    nextPayoutAt: '2026-11-01T00:00:00Z', history: [{ weekId: '2026-W42', payoutUSDT }] };
}
function mount(language: 'zh' | 'en' | 'vi' = 'en') {
  const dictionary = { en, zh, vi: vietnamese }[language];
  const app = reactive({ accountKey: 'user:A' });
  const reads: ReturnType<typeof deferred>[] = [];
  const api = vi.fn(() => { const read = deferred(); reads.push(read); return read.promise; });
  const shows: Array<() => void> = [], hides: Array<() => void> = [];
  const page = mountEntry(source, {
    '@/components/app-chassis.vue': slot, '@/components/team/reward-page-surface.vue': slot,
    '@/components/team/reward-compact-hero.vue': slot, '@/components/sub-page-header.vue': slot,
    '@/components/team/v-badge.vue': slot, '@/components/team/v-badge-icon.vue': slot,
    '@/i18n/use-t': { useT: () => ref(dictionary) }, '@/i18n/format': { fmt },
    '@/i18n/network-reaudit': { networkReauditCopy }, '@/lib/amount-display': { formatAmount }, '@/lib/finance-amount-display': { formatFinanceAmount },
    '@/store/locale': { useLocaleStore: () => ({ code: language }) },
    '@/store/app': { useApp: () => app },
    '@/store/v-rank': { useVRank: () => ({ remoteReady: true, ladder: [], refreshCanonicalVRank: vi.fn() }) },
    '@/store/leadership-pool': { useLeadershipPool: () => ({}), V_VOTES: {}, POOL_TOP_N: 100 },
    '@/lib/v-rank-copy': { rankLabel, rankTitle },
    '@/lib/leadership-pool-main': { leadershipMainRows },
    '@/lib/leadership-pool-state': { leadershipPoolFailureState },
    '@/lib/payout-clock': { createPayoutClock: () => ({ start() {}, stop() {} }) },
    '@/api/runtime': { remoteApiEnabled: true, teamInsightsApi: { leadershipPool: api } },
    '@/lib/account-scope': { captureAccountScope: () => app.accountKey, isCurrentAccountScope: (key: string) => key === app.accountKey },
    '@/api/order-api': { captureRuntimeRevision: () => 1, isCurrentRuntimeRevision: () => true, subscribeRuntimeRevision: () => () => {} },
    '@/lib/route': { navTo: vi.fn() },
    '@dcloudio/uni-app': { onShow: (fn: () => void) => shows.push(fn), onHide: (fn: () => void) => hides.push(fn) },
  });
  cleanups.push(page.unmount);
  return { ...page, api, reads, app, dictionary, show: () => shows.forEach(fn => fn()), hide: () => hides.forEach(fn => fn()) };
}

it.each(['zh', 'en', 'vi'] as const)('T2 %s HOLD can be rechecked, stays paused until confirmed, and suppresses duplicate clicks', async language => {
  const page = mount(language); page.show();
  const hold = new ApiError({ kind: 'business', message: 'F4_LEADERSHIP_POOL_HOLD' });
  page.reads[0].reject(hold); await flush();
  expect(text(page.root)).toContain(page.dictionary.pool.settlementHold);
  const retry = page.control(page.dictionary.pool.retry)!;
  expect(retry).toBeDefined(); retry.props.onClick(); retry.props.onClick(); await flush();
  expect(page.api).toHaveBeenCalledTimes(2);
  expect(text(page.root)).toContain(page.dictionary.pool.loading);
  expect(text(page.root)).not.toContain('$250.00');
  page.reads[1].reject(hold); await flush();
  expect(text(page.root)).toContain(page.dictionary.pool.settlementHold);
  page.control(page.dictionary.pool.retry)!.props.onClick();
  page.reads[2].resolve(snapshot()); await flush();
  expect(text(page.root)).toContain('$250.00');
  expect(text(page.root)).not.toContain(page.dictionary.pool.settlementHold);
});
it.each([[0, '$0.00'], [120, '+$120.00'], [undefined, '—'], [null, '—']] as const)('T5 history amount %s is rendered as %s', async (value, expected) => {
  const page = mount(); page.show();
  const data = snapshot(); data.history[0].payoutUSDT = value;
  page.reads[0].resolve(data); await flush();
  expect(text(page.root)).toContain(`2026-W42${expected}`);
});
it('T2 retry does not allow a late previous-account response to replace the new account', async () => {
  const page = mount(); page.show();
  page.reads[0].reject(new Error('network')); await flush();
  page.control(page.dictionary.pool.retry)!.props.onClick();
  page.app.accountKey = 'user:B'; await flush();
  page.reads[2].resolve({ ...snapshot(15), projectedPayoutUSDT: 999 }); await flush();
  page.reads[1].resolve(snapshot(120)); await flush();
  expect(text(page.root)).toContain('$999.00');
  expect(text(page.root)).not.toContain('$250.00');
  expect(text(page.root)).toContain('2026-W42+$15.00');
});
