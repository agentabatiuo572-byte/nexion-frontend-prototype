import { computed, createSSRApp, h, reactive, ref, watch } from 'vue';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import rewardsListPage from './rewards-list.vue?raw';
import rewardsPage from './rewards.vue?raw';

const template = parse(rewardsListPage, { filename: 'rewards-list.vue' }).descriptor.template?.content;
if (!template) throw new Error('rewards list template is required');
const render = new Function('Vue', `${compileTemplate({
  source: template,
  filename: 'rewards-list.vue',
  id: 'rewards-voucher-read-state',
  compilerOptions: { mode: 'function' },
}).code}; return render;`)(Vue);
const l1Start = rewardsPage.indexOf('const voucherReady');
const l1End = rewardsPage.indexOf('function openCat');
if (l1Start < 0 || l1End < l1Start) throw new Error('rewards voucher L1 state block is required');
const l1Block = ts.transpileModule(rewardsPage.slice(l1Start, l1End), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const l2Start = rewardsListPage.indexOf('const available =');
const l2End = rewardsListPage.indexOf('// ── reward records');
if (l2Start < 0 || l2End < l2Start) throw new Error('rewards voucher L2 state block is required');
const l2Block = ts.transpileModule(rewardsListPage.slice(l2Start, l2End), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

type VoucherView = { loading: boolean; error: boolean; knownEmpty: boolean };

async function renderVoucher(view: VoucherView): Promise<string> {
  return renderToString(createSSRApp({
    components: {
      AppChassis: { setup: (_: unknown, { slots }: { slots: { default?: () => Vue.VNode[] } }) => () => h('main', slots.default?.()) },
      SubPageHeader: { render: () => h('header') },
      EmptyState: { props: ['title', 'desc', 'ctaLabel'], render() { return h('section', [this.$props.title, this.$props.desc, this.$props.ctaLabel]); } },
    },
    setup: () => ({
      cat: 'voucher', pageTitle: 'Rewards',
      voucherInitialLoading: view.loading,
      voucherReadError: view.error,
      voucherKnownEmpty: view.knownEmpty,
      available: [], expired: [],
      retryVouchers() {},
      t: {
        home: { networkStatUpdating: 'Loading vouchers…' },
        authOtp: { errorServiceUnavailable: 'Voucher service unavailable' },
        ui: { retry: 'Retry' },
        empty: { rewardsTitle: 'No rewards', rewardsDesc: 'Nothing confirmed yet' },
      },
      emptyCardStyle: {}, loadingStyle: {}, remoteErrorStyle: {}, retryBtnStyle: {},
      secHead: () => ({}), stubStyle: () => ({}), stubValueStyle: () => ({}), stubLabelStyle: () => ({}), perfStyle: {}, notchStyle: () => ({}),
      ticketStyle: {}, ticketNameStyle: {}, ticketNameExpiredStyle: {}, rowSubStyle: {}, rowSubTightStyle: {}, useBtnStyle: {}, useBtnTextStyle: {}, expiredBadgeStyle: {},
      stubValue: () => '', stubLabel: () => '', scopeText: () => '', expiryText: () => '', onUse() {},
    }),
    render,
  }));
}

describe('Rewards voucher list remote read states', () => {
  it('derives loading, failure and definite-empty from the current voucher read, with explicit retry', () => {
    const refreshRemote = vi.fn();
    const voucher = reactive({ remoteStatus: 'idle', claimedUnused: [] as unknown[], expiredVouchers: [] as unknown[], refreshRemote });
    const view = new Function('computed', 'voucher', 'remoteApiEnabled',
      `${l2Block}\nreturn { voucherInitialLoading, voucherReadError, voucherKnownEmpty, retryVouchers };`,
    )(computed, voucher, true);
    expect(view.voucherInitialLoading.value).toBe(true);
    expect(view.voucherKnownEmpty.value).toBe(false);
    voucher.remoteStatus = 'loading';
    expect(view.voucherInitialLoading.value).toBe(true);
    voucher.remoteStatus = 'error';
    expect(view.voucherInitialLoading.value).toBe(false);
    expect(view.voucherReadError.value).toBe(true);
    expect(view.voucherKnownEmpty.value).toBe(false);
    view.retryVouchers();
    expect(refreshRemote).toHaveBeenCalledTimes(1);
    voucher.remoteStatus = 'ready';
    expect(view.voucherKnownEmpty.value).toBe(true);
    expect(view.voucherReadError.value).toBe(false);
    voucher.claimedUnused.push({ id: 'confirmed-voucher' });
    voucher.remoteStatus = 'loading';
    expect(view.voucherInitialLoading.value).toBe(false);
    expect(view.voucherKnownEmpty.value).toBe(false);
    voucher.remoteStatus = 'error';
    expect(view.voucherReadError.value).toBe(true);
    expect(view.voucherKnownEmpty.value).toBe(false);
  });

  it('renders pending and failed remote voucher reads without claiming an empty wallet', async () => {
    const [pending, failed] = await Promise.all([
      renderVoucher({ loading: true, error: false, knownEmpty: false }),
      renderVoucher({ loading: false, error: true, knownEmpty: false }),
    ]);
    expect(pending).toContain('Loading vouchers…');
    expect(pending).not.toContain('No rewards');
    expect(failed).toContain('Voucher service unavailable');
    expect(failed).toContain('Retry');
    expect(failed).not.toContain('No rewards');
  });

  it('renders the definite empty state only after a ready empty voucher catalog', async () => {
    const ready = await renderVoucher({ loading: false, error: false, knownEmpty: true });
    expect(ready).toContain('No rewards');
  });

  it('uses the actual L1 computed values to keep voucher count and all-zero unknown until its remote read is ready', () => {
    const voucher = reactive({ remoteStatus: 'loading', claimedUnused: [], expiredVouchers: [] });
    const bills = reactive({ bills: [], summaryStatus: 'ready', summary: { rewardsUsdt: 0, rewardsNex: 0 } });
    const t = ref({ rewards: {
      catVouchers: 'Vouchers', unitVouchers: 'vouchers', catVouchersDesc: 'Voucher rewards', expiredCount: '{n} expired',
      catUsdt: 'USDT', catNex: 'NEX', catUsdtDesc: 'USDT rewards', catNexDesc: 'NEX rewards',
    } });
    const result = new Function('computed', 'voucher', 'remoteApiEnabled', 'fundsServerEnabled', 'bills', 'isRewardBill', 't', 'fmt', 'ref', 'watch',
      `${l1Block}\nreturn { voucherReady, availableCount, expiredCount, allZero, cats };`,
    )(computed, voucher, true, true, bills, () => false, t, (template: string, args: { n: number }) => template.replace('{n}', String(args.n)), ref, watch);

    expect(result.cats.value[0].big).toBe('--');
    expect(result.allZero.value).toBe(false);
    voucher.remoteStatus = 'ready';
    expect(result.cats.value[0].big).toBe('0');
    expect(result.allZero.value).toBe(true);
  });

  // Returning from a detail page re-runs the summary read. The cards used to
  // flash "--" on every return because a loading status blanked values the user
  // had already seen. A background re-read must keep the last successful figures.
  it('keeps the last successful totals and counts while a background re-read is loading', () => {
    const voucher = reactive({ remoteStatus: 'ready', claimedUnused: [1, 2], expiredVouchers: [1] });
    const bills = reactive({ bills: [], summaryStatus: 'ready', summary: { rewardsUsdt: 12.5, rewardsNex: 340 } });
    const t = ref({ rewards: {
      catVouchers: 'Vouchers', unitVouchers: 'vouchers', catVouchersDesc: 'Voucher rewards', expiredCount: '{n} expired',
      catUsdt: 'USDT', catNex: 'NEX', catUsdtDesc: 'USDT rewards', catNexDesc: 'NEX rewards',
    } });
    const view = new Function('computed', 'voucher', 'remoteApiEnabled', 'fundsServerEnabled', 'bills', 'isRewardBill', 't', 'fmt', 'ref', 'watch',
      `${l1Block}\nreturn { availableCount, expiredCount, displayUsdtTotal, displayNexTotal, cats };`,
    )(computed, voucher, true, true, bills, () => false, t, (template: string, args: { n: number }) => template.replace('{n}', String(args.n)), ref, watch);

    // A successful read has landed: every card shows its real value.
    expect(view.cats.value.map((c: { big: string }) => c.big)).toEqual(['2', '$12.50', '340']);

    // Background re-read in flight: status leaves "ready" and the store snapshot
    // is briefly unavailable, but no known value may fall back to "--".
    bills.summaryStatus = 'loading';
    voucher.remoteStatus = 'loading';
    expect(view.cats.value.map((c: { big: string }) => c.big)).toEqual(['2', '$12.50', '340']);
  });
});
