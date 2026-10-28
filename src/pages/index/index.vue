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
      <LiveFeedCard />
      <MyFleetSection />
      <PromotionEntry v-if="homePromotions.length" mode="home" :activities="homePromotions" />
      <view v-else-if="!homePromotionRead && (homePromotionStatus === 'idle' || homePromotionStatus === 'loading')" class="home-promotion-skeleton" role="status" aria-busy="true" :aria-label="t.coreReview.loadingOffers"><view /><view /></view>
      <OnGridSection />
      <HomeNetworkSnapshot />
      <DoTheMathCard />
      <EarningsLedgerCard />
      <MarketBoardCard />
      <TrustChipWall />
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
import LiveFeedCard from '@/components/home/live-feed-card.vue';
import OnGridSection from '@/components/home/on-grid-section.vue';
import DoTheMathCard from '@/components/home/do-the-math-card.vue';
import EarningsLedgerCard from '@/components/home/earnings-ledger-card.vue';
import MarketBoardCard from '@/components/home/market-board-card.vue';
import TrustChipWall from '@/components/home/trust-chip-wall.vue';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { useConfig } from '@/store/config';
import { useApp } from '@/store/app';
import { remoteApiEnabled, sessionVault } from '@/api/runtime';
import type { PublicPromotion } from '@/api/promotion-contracts';
import { createPromotionReadFence, isPromotionActive } from '@/lib/promotion-entry';
import { readHomePromotions } from '@/store/home-promotions';
const t = useT(), locale = useLocaleStore(), config = useConfig(), app = useApp();
const homePromotions = ref<PublicPromotion[]>([]);
const homePromotionStatus = ref<'idle'|'loading'|'ready'|'error'>('idle');
const homePromotionRead=ref(false);
const fence = createPromotionReadFence();
let visible = true;
let pendingTicket:number|null=null;
async function refresh(passive=false) {
  if (!visible) return;
  if(pendingTicket!==null&&fence.current(pendingTicket))return;
  const ticket = fence.next(), scope = `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`;
  pendingTicket=ticket;
  homePromotionStatus.value = 'loading';
  void config.revalidate();
  if (!remoteApiEnabled) { homePromotions.value = []; homePromotionStatus.value = 'ready'; return; }
  try {
    const response = await readHomePromotions(scope, !!sessionVault.read(), !passive);
    if (!fence.current(ticket) || scope !== `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`) return;
    homePromotions.value = response.items.filter(activity => isPromotionActive(activity) && activity.placement === 'home.purchase-promotion');
    homePromotionStatus.value = 'ready';
    homePromotionRead.value=true;
  } catch (cause) {
    if (fence.current(ticket) && scope === `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`) {
      if(cause instanceof Error&&'status' in cause&&(cause.status===401||cause.status===403))homePromotions.value=[];
      homePromotionStatus.value = 'error';
    }
  } finally {if(pendingTicket===ticket)pendingTicket=null;}
}
onShow(() => { visible = true; void refresh(true); });
onHide(() => { visible = false; });
onUnmounted(() => { visible = false; fence.invalidate(); });
onLoad(() => locale.ensureSystemDetected());
watch(() => [app.accountKey, app.accountBindingEpoch, locale.code], () => { fence.invalidate(); homePromotions.value = []; homePromotionRead.value=false;void refresh(true); },{flush:'sync'});
</script>
<style scoped>
.home-overview { display: flex; flex-direction: column; gap: 20px; padding: 12px 16px 16px; color: var(--v5-ink); }
.home-earnings-cluster { display: flex; flex-direction: column; gap: 8px; }
.home-overview > .daily-check-in-row { margin-top:-6px; }
.home-promotion-skeleton { min-height:180px;box-sizing:border-box;padding:20px;border-radius:22px;background:var(--v5-surface);border:1px solid var(--v5-border); }
.home-promotion-skeleton > view { width:70%;height:18px;margin-bottom:14px;border-radius:8px;background:var(--v5-surface-2); }
.home-promotion-skeleton > view + view { width:45%;height:44px;margin-top:36px; }
</style>
