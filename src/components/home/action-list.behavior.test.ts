import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import ts from 'typescript';
import * as vue from 'vue';
import { describe, expect, it, vi } from 'vitest';
import source from './action-list.vue?raw';
import { homeTaskSummary } from './home-task-summary';
import { homeActionsCopy } from '@/i18n/home-actions';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { zh } from '@/i18n/messages/zh';

describe('home action priority', () => {
  it('puts phone, unpaid orders and newcomer work in the first three and keeps all other actions reachable', async () => {
    const now = Date.now();
    const app = vue.reactive({ accountKey: 'a', accountBindingEpoch: 1, remotePhoneBindingInvalid: true });
    const orders = vue.reactive({ orders: [{ status: 'placed' }, { status: 'activated' }], refreshRemote: vi.fn(async () => {}) });
    const quest = { remoteStatus: 'ready', dayOneRequiredTaskCount: 1, dayOneSnapshotStatus: 'SNAPSHOT', dayOneRewardNex: 500,
      remoteQuests: [{ questCode: 'one', layer: 'DAY_ONE', status: 'PENDING', eligible: true, eligibleFrom: new Date(now - 10000).toISOString(), eligibleUntil: new Date(now + 60000).toISOString() }], refreshRemote: vi.fn() };
    const modules: Record<string, unknown> = {
      '@/lib/passive-tab-read': createPassiveTabReadFixture(() => JSON.stringify([app.accountKey, app.accountBindingEpoch])),
      '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) },
      vue: { ...vue, onMounted: vi.fn(), onUnmounted: vi.fn(), watch: vi.fn() },
      '@/composables/use-tab-page-lifecycle': { onShow: vi.fn(), onHide: vi.fn() }, '@/store/app': { useApp: () => app },
      '@/store/session': { useSession: () => ({ isCurrentDeviceCalibrated: () => true }) }, '@/store/quest': { useQuest: () => quest },
      '@/store/orders': { useOrders: () => orders }, '@/store/voucher': { useVoucher: () => ({ claimedUnused: [{}], revalidateRemote: vi.fn(), refreshRemote: vi.fn() }) },
      '@/store/free-trial': { useFreeTrial: () => ({ status: 'active', refreshRemote: vi.fn() }) }, '@/store/config': { useConfig: () => ({ isEnabled: () => true }) },
      '@/api/runtime': { remoteApiEnabled: true, accountApi: { securityOverview: async () => ({ twoFactorEnabled: false }) } },
      '@/lib/native-phone-runtime': { hasNativeAndroidPhoneRuntime: () => true, hasNativePhoneRuntime: () => true, nativePhonePlatform: () => null }, '@/lib/route': { navTo: vi.fn() },
      '@/i18n/format': { fmt }, '@/i18n/use-t': { useT: () => vue.ref(zh) }, '@/i18n/home-actions': { homeActionsCopy },
      '@/i18n/audit-ui': { useAuditUiCopy: () => vue.ref({ orders: '{n} orders', questProgress: '{done}/{total}', voucherCount: '{n} vouchers' }) },
      '@/store/locale': { useLocaleStore: () => ({ code: 'en' }) }, '@/composables/use-now': { useNow: () => vue.ref(now / 1000) },
      '@/lib/amount-display': { formatAmount }, './home-task-summary': { homeTaskSummary },
    };
    const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
    const js = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const worker = new Function('require', 'exports', js + ';return { rows, shown, expanded, refresh };')((name: string) => name.endsWith('.vue') ? {} : modules[name], {});
    await worker.refresh();
    const keys = () => worker.shown.value.map((row: { key: string }) => row.key);
    expect(keys()).toEqual(['phone', 'orders', 'quest']);
    expect(worker.shown.value[1].href).toBe('/pages/store/orders?from=me&status=pending');
    worker.expanded.value = true; expect(keys()).toEqual(['phone', 'orders', 'quest', 'voucher', 'trial', 'security']);
    worker.expanded.value = false; app.remotePhoneBindingInvalid = false;
    expect(keys()).toEqual(['orders', 'quest', 'voucher']);
    orders.orders = [{ status: 'activated' }]; expect(keys()).toEqual(['quest', 'voucher', 'trial']);
  });
});
