<template>
  <view v-if="hasVoucher || hasTrial" class="home-benefits" :class="{ 'home-benefits--single': !(hasVoucher && hasTrial) }">
    <VoucherBanner surface="home" embedded />
    <TrialHeroBanner embedded />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import VoucherBanner from "@/components/voucher-banner.vue";
import TrialHeroBanner from "@/components/trial-hero-banner.vue";
import { useVoucher } from "@/store/voucher";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";

const voucher = useVoucher();
const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const hasVoucher = computed(() => voucher.hasClaimableForSurface("home"));
const hasTrial = computed(() => trial.status === "none" && trialCfg.config.seatsLeftToday > 0 && trial.showHeroPromo());
</script>

<style scoped>
.home-benefits { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 12px; }
.home-benefits--single :deep(.vb-card), .home-benefits--single :deep(.nx-trial-hero--embedded) { display: grid; grid-template-columns: 38% minmax(0, 1fr); align-items: center; }
.home-benefits--single :deep(.vb-art), .home-benefits--single :deep(.trial-art) { height: auto; }
.home-benefits--single :deep(.vb-art .nx-home-art), .home-benefits--single :deep(.trial-art .nx-home-art) { width: 100%; height: auto; aspect-ratio: 1; margin: 0; }
.home-benefits--single :deep(.vb-meta) { border-top: 0; }
.home-benefits--single :deep(.vb-meta::before), .home-benefits--single :deep(.vb-meta::after) { display: none; }
@media (max-width: 353px) {
  .home-benefits :deep(.vb-card), .home-benefits :deep(.nx-trial-hero--embedded) { display: grid; grid-template-columns: 38% minmax(0, 1fr); align-items: center; }
  .home-benefits :deep(.vb-art), .home-benefits :deep(.trial-art) { height: auto; }
  .home-benefits :deep(.vb-art .nx-home-art), .home-benefits :deep(.trial-art .nx-home-art) { width: 100%; height: auto; aspect-ratio: 1; margin: 0; }
  .home-benefits :deep(.vb-meta) { border-top: 0; }
  .home-benefits :deep(.vb-meta::before), .home-benefits :deep(.vb-meta::after) { display: none; }
}
</style>
