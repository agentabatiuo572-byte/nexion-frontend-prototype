<template>
  <NxSection v-show="rows.length || hasLearning" :title="copy.tasks" :meta="String(rows.length + (hasLearning ? 1 : 0))" :action="rows.length > 3 ? copy.all : undefined" @action="expanded = !expanded" data-home-section="actions">
    <NxListGroup><NxListRow v-for="row in shown" :key="row.key" :title="row.title" :subtitle="row.subtitle || row.value" @click="navTo(row.href)"><template #leading><view class="home-action-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><template v-if="row.key==='phone'"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></template><template v-else-if="row.key==='security'"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z"/><path d="m8 12 3 3 5-6"/></template><template v-else-if="row.key==='quest'"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></template><template v-else><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M8 12h8M8 16h4"/></template></svg></view></template></NxListRow>
    <FeaturedLearningCard v-if="rows.length < 3 || expanded" compact @availability="hasLearning = $event" /></NxListGroup>
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
import NxSection from '@/components/ui/nx-section.vue';
import NxListGroup from '@/components/ui/nx-list-group.vue';
import NxListRow from '@/components/ui/nx-list-row.vue';
import FeaturedLearningCard from './featured-learning-card.vue';
const app = useApp(), session = useSession(), quest = useQuest(), orders = useOrders(), voucher = useVoucher(), trial = useFreeTrial(), config = useConfig(), copy = useAuditUiCopy();
const expanded = ref(false), securityNeedsAction = ref(false), ordersReady = ref(false), hasLearning = ref(false);
let visible = true, generation = 0;
type Row = { key: string; title: string; subtitle?: string; value?: string; href: string };
const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  if (remoteApiEnabled && hasNativeAndroidPhoneRuntime() && app.accountKey !== 'default' && (app.remotePhoneBindingInvalid || !session.isCurrentDeviceCalibrated(app.accountKey))) list.push({ key:'phone', title:copy.value.bind, value:copy.value.bindAction, href:'/pages/onboarding/connect?mode=recalibrate' });
  const unpaid = ordersReady.value ? orders.orders.filter(order => order.status === 'placed' || order.status === 'payment_failed') : [];
  if (unpaid.length) list.push({ key:'orders', title:copy.value.unpaid, value:fmt(copy.value.orders,{n:unpaid.length}), href:'/pages/store/orders?from=me' });
  const tasks = quest.remoteStatus === 'ready' ? quest.remoteQuests.filter(row => row.layer === 'DAY_ONE' && row.eligible) : [];
  if (config.isEnabled('homeNewcomerTasksEnabled') && tasks.some(row => row.status === 'PENDING' || row.status === 'CLAIMABLE')) list.push({ key:'quest', title:copy.value.newcomer, value:fmt(copy.value.questProgress,{done:tasks.filter(row => row.status === 'COMPLETED' || row.status === 'CLAIMED').length,total:tasks.length}), href:'/pages/missions/missions' });
  if (voucher.claimedUnused.length) list.push({ key:'voucher', title:copy.value.vouchers, value:fmt(copy.value.voucherCount,{n:voucher.claimedUnused.length}), href:'/pages/me/rewards-list?cat=voucher' });
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
<style scoped>.home-action-icon {width:36px;height:36px;display:grid;place-items:center;flex:none;border-radius:12px;background:var(--v5-surface-2);color:var(--v5-ink-2);}</style>
