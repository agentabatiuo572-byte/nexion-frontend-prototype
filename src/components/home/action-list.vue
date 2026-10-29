<template>
  <NxSection v-if="initialPending || rows.length" :title="copy.tasks" :meta="initialPending ? undefined : String(rows.length)" :action="!initialPending && rows.length > 3 ? (expanded ? detailCopy.collapse : copy.all) : undefined" @action="expanded = !expanded" data-home-section="actions">
    <NxListGroup>
      <view v-if="initialPending" class="home-actions-skeleton" role="status" aria-busy="true" :aria-label="t.coreReview.loadingActions"><view v-for="n in 3" :key="n"><view /><view /></view></view>
      <template v-else><HomeActionRowView v-for="row in shown" :key="row.key" :row="row" @open="navTo(row.href)" /></template>
    </NxListGroup>
  </NxSection>
</template>
<script setup lang="ts">
import { runPassiveTabRead, invalidatePassiveTabRead, passiveTabReadScope } from "@/lib/passive-tab-read";
import { useDataVisibility } from "@/store/data-visibility";
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onShow, onHide } from '@/composables/use-tab-page-lifecycle';
import { useApp } from '@/store/app';
import { useSession } from '@/store/session';
import { useQuest } from '@/store/quest';
import { useOrders } from '@/store/orders';
import { useVoucher } from '@/store/voucher';
import { useFreeTrial } from '@/store/free-trial';
import { useConfig } from '@/store/config';
import { accountApi, remoteApiEnabled } from '@/api/runtime';
import { hasNativePhoneRuntime } from '@/lib/native-phone-runtime';
import { navTo } from '@/lib/route';
import { fmt } from '@/i18n/format';
import { useT } from '@/i18n/use-t';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { homeActionsCopy } from '@/i18n/home-actions';
import { useLocaleStore } from '@/store/locale';
import { useNow } from '@/composables/use-now';
import { formatAmount } from '@/lib/amount-display';
import { homeTaskSummary } from './home-task-summary';
import NxSection from '@/components/ui/nx-section.vue';
import NxListGroup from '@/components/ui/nx-list-group.vue';
import HomeActionRowView, { type HomeActionRow } from './home-action-row.vue';
const visibility = useDataVisibility();
const app = useApp(), session = useSession(), quest = useQuest(), orders = useOrders(), voucher = useVoucher(), trial = useFreeTrial(), config = useConfig(), copy = useAuditUiCopy();
const expanded = ref(false), securityNeedsAction = ref(false), ordersReady = ref(false);
const t = useT(), initialPending = ref(remoteApiEnabled);
const locale = useLocaleStore(), now = useNow();
const detailCopy = computed(() => homeActionsCopy[locale.code === 'zh' || locale.code === 'vi' ? locale.code : 'en']);
let visible = true, generation = 0;
const rows = computed<HomeActionRow[]>(() => {
  const list: HomeActionRow[] = [];
  if (remoteApiEnabled && hasNativePhoneRuntime() && app.accountKey !== 'default' && (app.remotePhoneBindingInvalid || !session.isCurrentDeviceCalibrated(app.accountKey))) list.push({ key:'phone', title:copy.value.bind, subtitle:detailCopy.value.bindHint, action:copy.value.bindAction, href:'/pages/onboarding/connect?mode=recalibrate' });
  const task = quest.remoteStatus === 'ready' ? homeTaskSummary({ quests: quest.remoteQuests, dayOneRequiredTaskCount: quest.dayOneRequiredTaskCount, dayOneSnapshotStatus: quest.dayOneSnapshotStatus, dayOneRewardNex: quest.dayOneRewardNex }, now.value * 1000) : null;
  if (config.isEnabled('homeNewcomerTasksEnabled') && task) list.push({ key:'quest', title:copy.value.newcomer, href:'/pages/missions/missions', progress:{ done:task.done, total:task.total }, progressLabel:task.total ? fmt(copy.value.questProgress,{done:task.done!,total:task.total}) : detailCopy.value.viewTasks, subtitle:detailCopy.value.viewTasks, reward:task.reward ? formatAmount(task.reward).replace(/\.00$/, '') : undefined, rewardLabel:task.claimable ? detailCopy.value.claimReward : detailCopy.value.completeReward, remaining:task.remainingHours !== null ? fmt(detailCopy.value.hours,{n:task.remainingHours}) : task.remainingMinutes !== null ? fmt(detailCopy.value.minutes,{n:task.remainingMinutes}) : undefined });
  const unpaid = ordersReady.value ? orders.orders.filter(order => order.status === 'placed' || order.status === 'payment_failed') : [];
  if (unpaid.length) list.push({ key:'orders', title:copy.value.unpaid, subtitle:fmt(copy.value.orders,{n:visibility.mask(unpaid.length)}), href:'/pages/store/orders?from=me&status=pending' });
  if (voucher.claimedUnused.length) list.push({ key:'voucher', title:copy.value.vouchers, subtitle:fmt(copy.value.voucherCount,{n:visibility.mask(voucher.claimedUnused.length)}), href:'/pages/me/rewards-list?cat=voucher' });
  if (trial.status === 'active' || trial.status === 'grace') list.push({ key:'trial', title:copy.value.trialActive, href:'/pages/me/trial' });
  if (securityNeedsAction.value) list.push({ key:'security', title:copy.value.security, subtitle:copy.value.securityHint, href:'/pages/me/security' });
  const priority = ['phone', 'orders', 'quest', 'voucher', 'trial', 'security'];
  return list.sort((a, b) => priority.indexOf(a.key) - priority.indexOf(b.key));
});
const shown = computed(() => expanded.value ? rows.value : rows.value.slice(0,3));
async function refresh() {
  const request = ++generation, scope = passiveTabReadScope();
  if (!visible) return;
  if (!remoteApiEnabled || app.accountKey === 'default') { initialPending.value = false; return; }
  const current = () => visible && request === generation && scope === passiveTabReadScope();
  await Promise.allSettled([
    runPassiveTabRead('quest', () => quest.refreshRemote(), undefined, () => quest.remoteStatus === 'ready'), runPassiveTabRead('trial-state', () => trial.refreshRemote()), voucher.revalidateRemote(),
    runPassiveTabRead('orders', () => orders.refreshRemote().then(() => true)).then(() => { if(current()) ordersReady.value = true; }).catch(() => { if(current()) ordersReady.value = false; }),
    runPassiveTabRead('security-overview', () => accountApi.securityOverview()).then(security => { if(current()) securityNeedsAction.value = !security.twoFactorEnabled; }).catch(() => { if(current()) securityNeedsAction.value = false; }),
  ]);
  if (current()) initialPending.value = false;
}
onMounted(refresh);
onShow(() => { visible = true; void refresh(); });
onHide(() => { visible = false; generation++; });
onUnmounted(() => { visible = false; generation++; });
watch(() => [app.accountKey,app.accountBindingEpoch], () => { initialPending.value = remoteApiEnabled; securityNeedsAction.value = false; ordersReady.value = false; expanded.value = false; void refresh(); });
</script>
<style scoped>
.home-actions-skeleton > view { display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 16px;box-sizing:border-box; }
.home-actions-skeleton > view + view { border-top:1px solid var(--v5-border); }
.home-actions-skeleton > view > view { height:36px;width:36px;border-radius:12px;background:var(--v5-surface-2); }
.home-actions-skeleton > view > view + view { height:16px;width:65%;border-radius:8px; }
</style>
