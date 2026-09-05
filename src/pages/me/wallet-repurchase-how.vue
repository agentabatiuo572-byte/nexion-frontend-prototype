<!--
  Re-invest · How it works — explainer (ported from
  Nexion-prototype/app/(main)/me/wallet/repurchase/how-it-works/page.tsx).
  Reuses shared how-* components + an inline worked-example panel. lemon accent.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 32px">
      <SubPageHeader back="/pages/me/wallet-repurchase" />

      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="lemon" />

      <HowSection :title="w.s1Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s1Para1 }}</text>
        <text class="block" :style="paraStyle2">{{ w.s1Para2 }}</text>
      </HowSection>

      <HowSection :title="w.s2Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s2Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <IconRow emoji="⚡" :label="w.benefit1Label" :body="w.benefit1Body" />
          <IconRow emoji="🎟" :label="w.benefit3Label" :body="w.benefit3Body" />
          <IconRow emoji="📈" :label="w.benefit4Label" :body="w.benefit4Body" />
        </view>
      </HowSection>

      <HowSection :title="w.s3Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 14px">
          <HowStepRow :n="1" :title="w.s3Step1Title" :body="w.s3Step1Body" />
          <HowStepRow :n="2" :title="w.s3Step2Title" :body="w.s3Step2Body" />
          <HowStepRow :n="3" :title="w.s3Step3Title" :body="w.s3Step3Body" />
        </view>
        <CalloutBox :title="`💡 ${w.s3HintTitle}`" :body="w.s3HintBody" tone="amber" />
      </HowSection>

      <HowSection :title="w.s4Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
        </template>
        <text class="block" :style="introMuted">{{ w.s4Intro }}</text>
        <view :style="exampleBoxStyle">
          <text class="block" :style="scenarioStyle">{{ w.s4Scenario }}</text>
          <text class="block" :style="setupStyle">{{ w.s4Setup }}</text>
          <view :style="exRowsStyle">
            <view class="flex items-center justify-between">
              <text :style="exLabelStyle">{{ w.s4Row1Label }}</text>
              <text :style="exValInk">$1,000</text>
            </view>
            <view class="flex items-center justify-between">
              <text :style="exLabelStyle">{{ w.s4Row3Label }}</text>
              <text :style="exValBrand2">×1.5</text>
            </view>
            <view class="flex items-center justify-between">
              <text :style="exLabelStyle">{{ w.s4Row4Label }}</text>
              <text :style="exValWarning">1×</text>
            </view>
          </view>
          <view class="flex items-center justify-between" :style="exUnlockRowStyle">
            <text :style="exUnlockLabelStyle">{{ w.s4UnlockLabel }}</text>
            <text :style="exUnlockValueStyle">$1,300+</text>
          </view>
        </view>
      </HowSection>

      <HowSection :title="w.faqTitle" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow :q="w.faqQ1" :a="w.faqA1" />
          <HowFaqRow :q="w.faqQ2" :a="w.faqA2" />
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
const w = computed(() => t.value.repurchaseHowItWorks);

function goBack() {
  uni.navigateTo({ url: "/pages/me/wallet-repurchase", fail: () => {} });
}

const monoFamily = "var(--font-jet-mono), ui-monospace, monospace";
const paraStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const paraStyle2: CSSProperties = { ...paraStyle, marginTop: "10px" };
const introStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" }; // how-page scale: caption 12.5/1.6 ink-3
const introMuted: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" };
const exampleBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};
const scenarioStyle: CSSProperties = {
  fontFamily: monoFamily,
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const setupStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.55 };
const exRowsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  paddingTop: "8px",
  marginTop: "4px",
  borderTop: "1px solid var(--v5-border)",
  fontFamily: monoFamily,
  fontSize: "13px",
};
const exLabelStyle: CSSProperties = { color: "var(--v5-ink-3)" };
const exValInk: CSSProperties = { color: "var(--v5-ink)" };
const exValBrand2: CSSProperties = { color: "var(--v5-brand-2)" };
const exValWarning: CSSProperties = { color: "var(--v5-warning)" };
const exUnlockRowStyle: CSSProperties = {
  paddingTop: "8px",
  marginTop: "4px",
  borderTop: "1px solid var(--v5-border)",
};
const exUnlockLabelStyle: CSSProperties = {
  fontFamily: monoFamily,
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const exUnlockValueStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.014em",
  color: "var(--v5-brand)",
};
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
