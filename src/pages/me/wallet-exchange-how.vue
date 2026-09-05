<!--
  Exchange · How it works — explainer (ported from
  Nexion-prototype/app/(main)/me/wallet/exchange/how-it-works/page.tsx). Reuses
  shared how-* components; purple accent. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 32px">
      <SubPageHeader back="/pages/me/wallet-exchange" />

      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="purple" />

      <HowSection :title="w.s1Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s1Para1 }}</text>
      </HowSection>

      <HowSection :title="w.s2Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s2Intro }}</text>
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
        <text class="block" :style="introStyle">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <IconRow emoji="📅" :label="w.lim1Label" :body="w.lim1Body" />
          <IconRow emoji="🌐" :label="w.lim2Label" :body="w.lim2Body" />
        </view>
        <CalloutBox :title="`💡 ${w.s3HintTitle}`" :body="w.s3HintBody" tone="amber" />
      </HowSection>

      <HowSection :title="w.s4Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s4Intro }}</text>
        <view :style="stepsBoxStyle">
          <view class="flex items-start" style="gap: 8px">
            <text class="shrink-0" :style="stepNumStyle">1.</text>
            <text :style="stepBodyStyle">{{ w.s4Step1 }}</text>
          </view>
          <view class="flex items-start" style="gap: 8px">
            <text class="shrink-0" :style="stepNumStyle">2.</text>
            <text :style="stepBodyStyle">{{ w.s4Step2 }}</text>
          </view>
          <view class="flex items-start" style="gap: 8px">
            <text class="shrink-0" :style="stepNumStyle">3.</text>
            <text :style="stepBodyStyle">{{ w.s4Step3 }}</text>
          </view>
        </view>
        <CalloutBox :title="`✓ ${w.s4SafetyTitle}`" :body="w.s4SafetyBody" tone="lemon" />
      </HowSection>

      <HowSection :title="w.faqTitle" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow :q="w.faqQ1" :a="w.faqA1" />
          <HowFaqRow :q="w.faqQ2" :a="w.faqA2" />
          <HowFaqRow :q="w.faqQ3" :a="w.faqA3" />
          <HowFaqRow :q="w.faqQ4" :a="w.faqA4" />
        </view>
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
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowStepRow from "@/components/how/how-step-row.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import IconRow from "@/components/how/how-icon-row.vue";
import CalloutBox from "@/components/how/how-callout-box.vue";
import { useT } from "@/i18n/use-t";

const t = useT();
const w = computed(() => t.value.exchangeHowItWorks);

function goBack() {
  uni.navigateTo({ url: "/pages/me/wallet-exchange", fail: () => {} });
}

const paraStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const introStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" }; // how-page scale: caption 12.5/1.6 ink-3
const stepsBoxStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "12px",
  background: "var(--v5-surface)",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  fontSize: "12px",
};
const stepNumStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.62 };
const stepBodyStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.62 }; // how-row scale: body 13/1.62 ink-2
const ctaStyle: CSSProperties = {
  gap: "6px",
  height: "50px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  letterSpacing: "-0.005em",
};
</script>
