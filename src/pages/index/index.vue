<template>
  <AppChassis active="home">
    <view class="home-overview">
      <view class="home-earnings-cluster" data-home-section="earnings">
        <GreetingHeader />
        <TechMoneyCard />
      </view>
      <DailyCheckInRow />
      <HomeBenefits />
      <HomeActionList />
      <MyFleetSection />
      <PromotionEntry v-if="homePromotions.length" mode="home" :activities="homePromotions" />
      <view v-else-if="homePromotionStatus === 'idle' || homePromotionStatus === 'loading'" class="home-promotion-skeleton" role="status" aria-busy="true" :aria-label="t.coreReview.loadingOffers"><view /><view /></view>
      <HomeNetworkSnapshot />
    </view>
  </AppChassis>
</template>
<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { onShow, onHide, onLoad } from '@/composables/use-tab-page-lifecycle';
import AppChassis from '@/components/tab-page-frame.vue';
import GreetingHeader from '@/components/home/greeting-header.vue';
import TechMoneyCard from '@/components/home/tech-money-card.vue';
import DailyCheckInRow from '@/components/home/daily-check-in-row.vue';
import HomeActionList from '@/components/home/action-list.vue';
import MyFleetSection from '@/components/home/my-fleet-section.vue';
import PromotionEntry from '@/components/promotion/promotion-entry.vue';
import HomeBenefits from '@/components/home/home-benefits.vue';
import HomeNetworkSnapshot from '@/components/home/network-snapshot.vue';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { useConfig } from '@/store/config';
import { useApp } from '@/store/app';
import { promotionApi, remoteApiEnabled, sessionVault } from '@/api/runtime';
import type { PublicPromotion } from '@/api/promotion-contracts';
import { createPromotionReadFence, isPromotionActive } from '@/lib/promotion-entry';
const t = useT(), locale = useLocaleStore(), config = useConfig(), app = useApp();
const homePromotions = ref<PublicPromotion[]>([]);
const homePromotionStatus = ref<'idle'|'loading'|'ready'|'error'>('idle');
const fence = createPromotionReadFence();
let visible = true;
async function refresh() {
  if (!visible) return;
  const ticket = fence.next(), scope = `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`;
  homePromotionStatus.value = 'loading';
  void config.load();
  if (!remoteApiEnabled) { homePromotions.value = []; homePromotionStatus.value = 'ready'; return; }
  try {
    const response = await promotionApi.list({ limit:20, placement:'home.purchase-promotion' }, !!sessionVault.read());
    if (!visible || !fence.current(ticket) || scope !== `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`) return;
    homePromotions.value = response.items.filter(activity => isPromotionActive(activity) && activity.placement === 'home.purchase-promotion');
    homePromotionStatus.value = 'ready';
  } catch {
    if (visible && fence.current(ticket)) { homePromotions.value = []; homePromotionStatus.value = 'error'; }
  }
}
onShow(() => { visible = true; void refresh(); });
onHide(() => { visible = false; fence.invalidate(); });
onUnmounted(() => { visible = false; fence.invalidate(); });
onLoad(() => locale.ensureSystemDetected());
watch(() => [app.accountKey, app.accountBindingEpoch, locale.code], () => { fence.invalidate(); homePromotions.value = []; void refresh(); });
</script>
<style scoped>
.home-overview { display: flex; flex-direction: column; gap: 20px; padding: 12px 16px 16px; color: var(--v5-ink); }
.home-earnings-cluster { display: flex; flex-direction: column; gap: 8px; }
.home-overview > .daily-check-in-row { margin-top:-6px; }
.home-promotion-skeleton { min-height:180px;box-sizing:border-box;padding:20px;border-radius:22px;background:var(--v5-surface);border:1px solid var(--v5-border); }
.home-promotion-skeleton > view { width:70%;height:18px;margin-bottom:14px;border-radius:8px;background:var(--v5-surface-2); }
.home-promotion-skeleton > view + view { width:45%;height:44px;margin-top:36px; }
</style>
