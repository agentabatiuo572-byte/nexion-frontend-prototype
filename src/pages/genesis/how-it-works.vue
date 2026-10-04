<!--
  Genesis · How it works — explainer page (ported from
  Nexion-prototype/app/(main)/genesis/how-it-works/page.tsx).
  Uses shared how-* components (HowHero / HowSection / IconRow / StepRow /
  CalloutBox / FaqRow). Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <HowPublishedContent v-if="remoteApiEnabled" content-key="genesis-how" back="/pages/genesis/genesis" />
    <view v-if="!remoteApiEnabled" style="padding-bottom: 32px">
      <SubPageHeader back="/pages/genesis/genesis" />

      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="amber" />

      <HowSection :title="w.s1Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s1Para1 }}</text>
        <text class="block" :style="paraStyle2">{{ w.s1Para2 }}</text>
      </HowSection>

      <HowSection :title="w.s2Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s2Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <IconRow emoji="🪙" :label="w.perk1Label" :body="w.perk1Body" />
          <IconRow emoji="👥" :label="w.perk2Label" :body="w.perk2Body" />
          <IconRow emoji="📜" :label="w.perk3Label" :body="w.perk3Body" />
          <IconRow emoji="🏛️" :label="w.perk4Label" :body="w.perk4Body" />
        </view>
      </HowSection>

      <HowSection :title="w.s3Title" accent="amber">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 14px">
          <HowStepRow :n="1" :title="w.s3Step1Title" :body="w.s3Step1Body" accent="amber" />
          <HowStepRow :n="2" :title="w.s3Step2Title" :body="w.s3Step2Body" accent="amber" />
          <HowStepRow :n="3" :title="w.s3Step3Title" :body="w.s3Step3Body" accent="amber" />
        </view>
        <CalloutBox :title="`💡 ${w.s3HintTitle}`" :body="w.s3HintBody" tone="purple" />
      </HowSection>

      <HowSection :title="w.s4Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s4Intro }}</text>
        <view :style="flowBoxStyle">
          <text class="block" :style="flowLabelStyle">{{ w.s4FlowLabel }}</text>
          <view style="display: flex; flex-direction: column; gap: 6px">
            <view v-for="(f, i) in flowItems" :key="i" class="flex items-start" style="gap: 8px">
              <text class="tabular-nums" :style="flowNumStyle">{{ i + 1 }}.</text>
              <text :style="flowTextStyle">{{ f }}</text>
            </view>
          </view>
        </view>
        <CalloutBox :title="`⚠️ ${w.s4WarnTitle}`" :body="w.s4WarnBody" tone="amber" />
      </HowSection>

      <HowSection :title="w.faqTitle" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow :q="w.faqQ1" :a="w.faqA1" />
          <HowFaqRow :q="w.faqQ2" :a="w.faqA2" />
          <HowFaqRow :q="w.faqQ3" :a="w.faqA3" />
          <HowFaqRow :q="w.faqQ4" :a="w.faqA4" />
          <HowFaqRow :q="w.faqQ5" :a="w.faqA5" />
        </view>
      </HowSection>

      <!-- CTA pair -->
      <view class="mx-4" style="margin-top: 24px; display: flex; flex-direction: column; gap: 10px">
        <view class="flex items-center justify-center active:opacity-85" :style="ctaPrimaryStyle" role="button" tabindex="0" :aria-label="w.ctaPrimary" @click="goGenesis">
          <text style="pointer-events: none">{{ w.ctaPrimary }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; pointer-events: none"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
        <view class="flex items-center justify-center active:opacity-80" :style="ctaSecondaryStyle" role="button" tabindex="0" :aria-label="w.ctaSecondary" @click="goMarketplace">
          <text style="pointer-events: none">{{ w.ctaSecondary }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import HowPublishedContent from "@/components/how/how-published-content.vue";
import { remoteApiEnabled } from "@/api/runtime";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowStepRow from "@/components/how/how-step-row.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import IconRow from "@/components/how/how-icon-row.vue";
import CalloutBox from "@/components/how/how-callout-box.vue";
import { useT } from "@/i18n/use-t";

const t = useT();
const w = computed(() => t.value.genesisHowItWorks);

const flowItems = computed(() => [w.value.s4Flow1, w.value.s4Flow2, w.value.s4Flow3, w.value.s4Flow4]);

function goGenesis() {
  navTo("/pages/genesis/genesis");
}
function goMarketplace() {
  navTo("/pages/genesis/marketplace");
}

const paraStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const paraStyle2: CSSProperties = { ...paraStyle, marginTop: "10px" };
const introStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" }; // how-page scale: caption 12.5/1.6 ink-3
const flowBoxStyle: CSSProperties = {
  background: "var(--v5-surface-2)",
  borderRadius: "12px",
  padding: "14px",
  fontSize: "13px",
  marginTop: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};
const flowLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-warning)",
  letterSpacing: "0.08em",
};
const flowNumStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "13px",
  color: "var(--v5-warning)",
  flexShrink: 0,
};
const flowTextStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.5 };
const ctaPrimaryStyle: CSSProperties = {
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
const ctaSecondaryStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  // 次级 CTA 直接坐在页面底上(不在任何卡片内)→ 用 L1 surface;亮色下 surface-2 与页面底几乎同色不可辨
  background: "var(--v5-surface)",
  color: "var(--v5-ink-2)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
};
</script>
