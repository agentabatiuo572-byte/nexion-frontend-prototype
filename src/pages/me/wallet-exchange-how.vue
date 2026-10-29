<!--
  Exchange · How it works — explainer (ported from
  Nexion-prototype/app/(main)/me/wallet/exchange/how-it-works/page.tsx). Reuses
  shared how-* components; purple accent. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <HowPublishedContent v-if="remoteApiEnabled && exchangeAvailable === true" content-key="wallet-exchange-how" back="/pages/me/wallet-exchange" />
    <view v-else-if="remoteApiEnabled" style="padding-bottom: 32px">
      <SubPageHeader back="/pages/me/wallet-exchange" />
      <view class="mx-4" role="status" aria-live="polite" style="padding: 24px 2px; color: var(--v5-ink-2)">
        <text class="block" style="font-size: var(--ui-type-card-title); font-weight: var(--ui-type-card-title-weight)">{{ exchangeAvailable === false ? w.pausedTitle : exchangeLoading ? t.howPublished.loading : t.howPublished.unavailableTitle }}</text>
        <text class="block" style="margin-top: 8px; font-size: var(--ui-type-list-subtitle); line-height: 1.6">{{ exchangeAvailable === false ? w.pausedBody : exchangeLoading ? '' : t.exchange.remoteUnavailableClosed }}</text>
        <view v-if="!exchangeLoading && exchangeAvailable === null" role="button" tabindex="0" style="margin-top: 16px; color: var(--v5-brand)" @click="loadExchangeCaps"  @keydown.enter.prevent="loadExchangeCaps" @keydown.space.prevent="loadExchangeCaps"><text>{{ t.ui.retry }}</text></view>
        <view v-if="exchangeAvailable === false" role="button" tabindex="0" style="margin-top: 16px; color: var(--v5-brand)" @click="goBack"  @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack"><text>{{ w.ctaBack }}</text></view>
      </view>
    </view>
    <view v-if="!remoteApiEnabled" style="padding-bottom: 32px">
      <SubPageHeader back="/pages/me/wallet-exchange" />

      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="purple" />

      <HowSection :title="w.s2Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 14px">
          <HowStepRow :n="1" :title="w.s2Step1Title" :body="w.s2Step1Body" accent="purple" />
          <HowStepRow :n="2" :title="w.s2Step2Title" :body="w.s2Step2Body" accent="purple" />
          <HowStepRow :n="3" :title="w.s2Step3Title" :body="w.s2Step3Body" accent="purple" />
        </view>
      </HowSection>

      <HowSection :title="w.s3Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s3Intro }}</text>
        <CalloutBox :title="w.s3HintTitle" :body="w.s3HintBody" tone="amber" />
      </HowSection>

      <view class="mx-4" style="margin-top: 24px">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" role="button" tabindex="0" @click="goBack">
          <text>{{ w.ctaBack }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { navBack } from "@/lib/route";
import { computed, onUnmounted, ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import HowPublishedContent from "@/components/how/how-published-content.vue";
import { exchangeApi, remoteApiEnabled } from "@/api/runtime";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowStepRow from "@/components/how/how-step-row.vue";
import CalloutBox from "@/components/how/how-callout-box.vue";
import { useT } from "@/i18n/use-t";

const t = useT();
const w = computed(() => t.value.exchangeHowItWorks);
const exchangeAvailable = ref<boolean | null>(null);
const exchangeLoading = ref(remoteApiEnabled);
let capsRequest = 0;

async function loadExchangeCaps() {
  if (!remoteApiEnabled) return;
  const request = ++capsRequest;
  exchangeAvailable.value = null;
  exchangeLoading.value = true;
  try {
    const caps = await exchangeApi.fetchCaps();
    if (request === capsRequest) exchangeAvailable.value = caps.swapEnabled;
  } catch {
    // Unknown is not open: the guide must not claim swaps can be submitted.
  } finally {
    if (request === capsRequest) exchangeLoading.value = false;
  }
}
onShow(() => { void loadExchangeCaps(); });
onUnmounted(() => { capsRequest += 1; });

function goBack() {
  navBack("/pages/me/wallet-exchange");
}

const paraStyle: CSSProperties = { fontSize: "var(--ui-type-long-form)", color: "var(--v5-ink-2)", lineHeight: "var(--ui-type-long-form-lh)" }; // how-page scale: body 13.5/1.65 ink-2
const ctaStyle: CSSProperties = {
  gap: "6px",
  height: "50px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "var(--ui-type-button)",
  letterSpacing: "-0.005em",
};


</script>
