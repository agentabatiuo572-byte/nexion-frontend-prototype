<template>
  <NxSection v-if="rows.length" :title="copy.tasks" :meta="String(rows.length)" :action="rows.length > 3 ? (expanded ? detailCopy.collapse : copy.all) : undefined" @action="expanded = !expanded" data-home-section="actions">
    <NxListGroup><HomeActionRowView v-for="row in shown" :key="row.key" :row="row" @open="navTo(row.href)" /></NxListGroup>
  </NxSection>
</template>
<script setup lang="ts">
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
import { hasNativeAndroidPhoneRuntime } from '@/lib/native-phone-runtime';
import { navTo } from '@/lib/route';
import { fmt } from '@/i18n/format';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { homeActionsCopy } from '@/i18n/home-actions';
import { useLocaleStore } from '@/store/locale';
import { useNow } from '@/composables/use-now';
import { formatAmount } from '@/lib/amount-display';
import { homeTaskSummary } from './home-task-summary';
import NxSection from '@/components/ui/nx-section.vue';
import NxListGroup from '@/components/ui/nx-list-group.vue';
import HomeActionRowView, { type HomeActionRow } from './home-action-row.vue';
const app = useApp(), session = useSession(), quest = useQuest(), orders = useOrders(), voucher = useVoucher(), trial = useFreeTrial(), config = useConfig(), copy = useAuditUiCopy();
const expanded = ref(false), securityNeedsAction = ref(false), ordersReady = ref(false);
const locale = useLocaleStore(), now = useNow();
const detailCopy = computed(() => homeActionsCopy[locale.code === 'zh' || locale.code === 'vi' ? locale.code : 'en']);
let visible = true, generation = 0;
const rows = computed<HomeActionRow[]>(() => {
  const list: HomeActionRow[] = [];
  if (remoteApiEnabled && hasNativeAndroidPhoneRuntime() && app.accountKey !== 'default' && (app.remotePhoneBindingInvalid || !session.isCurrentDeviceCalibrated(app.accountKey))) list.push({ key:'phone', title:copy.value.bind, subtitle:detailCopy.value.bindHint, action:copy.value.bindAction, href:'/pages/onboarding/connect?mode=recalibrate' });
  const task = quest.remoteStatus === 'ready' ? homeTaskSummary({ quests: quest.remoteQuests, dayOneRequiredTaskCount: quest.dayOneRequiredTaskCount, dayOneSnapshotStatus: quest.dayOneSnapshotStatus, dayOneRewardNex: quest.dayOneRewardNex }, now.value * 1000) : null;
  if (config.isEnabled('homeNewcomerTasksEnabled') && task) list.push({ key:'quest', title:copy.value.newcomer, href:'/pages/missions/missions', progress:{ done:task.done, total:task.total }, progressLabel:task.total ? fmt(copy.value.questProgress,{done:task.done!,total:task.total}) : detailCopy.value.viewTasks, subtitle:detailCopy.value.viewTasks, reward:task.reward ? formatAmount(task.reward).replace(/\.00$/, '') : undefined, rewardLabel:task.claimable ? detailCopy.value.claimReward : detailCopy.value.completeReward, remaining:task.remainingHours !== null ? fmt(detailCopy.value.hours,{n:task.remainingHours}) : task.remainingMinutes !== null ? fmt(detailCopy.value.minutes,{n:task.remainingMinutes}) : undefined });
  const unpaid = ordersReady.value ? orders.orders.filter(order => order.status === 'placed' || order.status === 'payment_failed') : [];
  if (unpaid.length) list.push({ key:'orders', title:copy.value.unpaid, subtitle:fmt(copy.value.orders,{n:unpaid.length}), href:'/pages/store/orders?from=me' });
  if (voucher.claimedUnused.length) list.push({ key:'voucher', title:copy.value.vouchers, subtitle:fmt(copy.value.voucherCount,{n:voucher.claimedUnused.length}), href:'/pages/me/rewards-list?cat=voucher' });
  if (trial.status === 'active' || trial.status === 'grace') list.push({ key:'trial', title:copy.value.trialActive, href:'/pages/earn/earn' });
  if (securityNeedsAction.value) list.push({ key:'security', title:copy.value.security, subtitle:copy.value.securityHint, href:'/pages/me/security' });
  return list;
});
const shown = computed(() => expanded.value ? rows.value : rows.value.slice(0,3));
async function refresh() {
  const request = ++generation, scope = `${app.accountKey}:${app.accountBindingEpoch}`;
  if (!remoteApiEnabled || !visible || app.accountKey === 'default') return;
  const current = () => visible && request === generation && scope === `${app.accountKey}:${app.accountBindingEpoch}`;
  void quest.refreshRemote();
  void orders.refreshRemote().then(() => { if(current()) ordersReady.value = true; }).catch(() => { if(current()) ordersReady.value = false; });
  try { const security = await accountApi.securityOverview(); if(current()) securityNeedsAction.value = !security.twoFactorEnabled; } catch { if(current()) securityNeedsAction.value = false; }
}
onMounted(refresh);
onShow(() => { visible = true; void refresh(); });
onHide(() => { visible = false; generation++; });
onUnmounted(() => { visible = false; generation++; });
watch(() => [app.accountKey,app.accountBindingEpoch], () => { securityNeedsAction.value = false; ordersReady.value = false; expanded.value = false; void refresh(); });
</script>
