<template>
  <NxSection v-if="hasVoucher || hasTrial" :title="copy.benefits" class="home-benefits" data-home-section="benefits"><view class="home-benefits__grid" :class="{ 'home-benefits__grid--single': !hasVoucher || !hasTrial }"><VoucherBanner v-if="hasVoucher" surface="home" embedded /><TrialHeroBanner v-if="hasTrial" embedded /></view></NxSection>
</template>
<script setup lang="ts">
import { computed } from "vue";
import VoucherBanner from "@/components/voucher-banner.vue";
import TrialHeroBanner from "@/components/trial-hero-banner.vue";
import { useVoucher } from "@/store/voucher";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";
import { useTrialPresentation } from '@/composables/use-trial-presentation';
import NxSection from '@/components/ui/nx-section.vue';
import { useAuditUiCopy } from '@/i18n/audit-ui';
const copy = useAuditUiCopy();
const voucher = useVoucher();
const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const trialView = useTrialPresentation();
const hasVoucher = computed(() => voucher.hasClaimableForSurface("home") || voucher.claimedUnused.length > 0);
const hasTrial = computed(() => (trialView.status.value !== null && trialView.status.value !== 'none')
  || (trial.status === "none" && trialCfg.config.seatsLeftToday > 0
    && (trial.showHeroPromo() || trial.eligibility().reason === 'capacity-full')));
</script>
<style scoped>
.home-benefits__grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px; }
.home-benefits__grid--single { grid-template-columns:minmax(0,1fr); }
</style>
