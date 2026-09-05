<!--
  Commissions · How it works — ported from
  Nexion-prototype/app/(main)/team/commissions/how-it-works/page.tsx.
  Explainer page: HowHero + 5 HowSections (six channels via IconRow, settlement
  lifecycle status chips, typical-day example, FAQ) + footer CTA back. Deep
  sub-page → <AppChassis active="team"> (matches commissions.vue). SetPageHeader
  → <SubPageHeader>. lucide → inline <svg>. <Link footer CTA>→<view @click>.
  The day-example ExampleRow stays inline (page-local 4-row helper). Reuses
  how/* components (HowHero/HowSection/HowIconRow/HowCalloutBox/HowFaqRow).
-->
<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/commissions" />

      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="lemon" />

      <HowSection :title="w.s1Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s1Para1 }}</text>
      </HowSection>

      <HowSection :title="w.s2Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s2Caption }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowIconRow emoji="👥" :label="w.k1Label" :body="w.k1Body" />
          <HowIconRow emoji="⚖️" :label="w.k2Label" :body="k2BodyText" />
          <HowIconRow emoji="🤝" :label="w.k3Label" :body="w.k3Body" />
          <HowIconRow emoji="🌱" :label="w.k4Label" :body="w.k4Body" />
          <HowIconRow emoji="👑" :label="w.k5Label" :body="w.k5Body" />
          <HowIconRow emoji="💎" :label="w.k6Label" :body="w.k6Body" />
        </view>
      </HowSection>

      <HowSection :title="w.s3Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s3Intro }}</text>
        <view class="rounded-xl border" :style="statusBoxStyle">
          <view class="flex items-start" style="gap: 10px">
            <text class="shrink-0 font-mono-tabular" :style="statusChipStyle('var(--v5-warning)')">{{ w.statusCooling }}</text>
            <text :style="statusDescStyle">{{ w.statusCoolingDesc }}</text>
          </view>
          <view class="flex items-start" style="gap: 10px">
            <text class="shrink-0 font-mono-tabular" :style="statusChipStyle('var(--v5-brand)')">{{ w.statusUnlocked }}</text>
            <text :style="statusDescStyle">{{ w.statusUnlockedDesc }}</text>
          </view>
          <view class="flex items-start" style="gap: 10px">
            <text class="shrink-0 font-mono-tabular" :style="statusChipStyle('var(--v5-brand-2)')">{{ w.statusWithdrawn }}</text>
            <text :style="statusDescStyle">{{ w.statusWithdrawnDesc }}</text>
          </view>
        </view>
        <HowCalloutBox :title="`💡 ${w.s3HintTitle}`" :body="w.s3HintBody" tone="amber" />
      </HowSection>

      <HowSection :title="w.s4Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s4Intro }}</text>
        <view :style="exampleBoxStyle">
          <text class="block" :style="exampleDayStyle">{{ w.s4Day }}</text>
          <view style="display: flex; flex-direction: column; gap: 10px">
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">👥</text>
                <text class="truncate" :style="exampleLabelStyle">{{ w.ex1Label }}</text>
              </view>
              <text class="font-display tabular-nums shrink-0" :style="exampleAmtStyle('var(--v5-brand)')">+$45.20</text>
            </view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">🌱</text>
                <text class="truncate" :style="exampleLabelStyle">{{ w.ex2Label }}</text>
              </view>
              <text class="font-display tabular-nums shrink-0" :style="exampleAmtStyle('var(--v5-brand-2)')">+2,000 NEX</text>
            </view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">🤝</text>
                <text class="truncate" :style="exampleLabelStyle">{{ w.ex3Label }}</text>
              </view>
              <text class="font-display tabular-nums shrink-0" :style="exampleAmtStyle('var(--v5-brand)')">+$5.40</text>
            </view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">👑</text>
                <text class="truncate" :style="exampleLabelStyle">{{ w.ex4Label }}</text>
              </view>
              <text class="font-display tabular-nums shrink-0" :style="exampleAmtStyle('var(--v5-warning)')">+$28.40</text>
            </view>
            <view class="flex items-center justify-between" :style="exampleTotalRowStyle">
              <text :style="exampleTotalLabelStyle">{{ w.s4Total }}</text>
              <text class="tabular-nums" :style="exampleTotalValueStyle">$79.00 + 2,000 NEX</text>
            </view>
          </view>
        </view>
        <text class="block" :style="noteStyle">{{ w.s4Note }}</text>
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

      <view class="mx-4 mt-6">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" @click="goBack">
          <text :style="ctaTextStyle">{{ w.ctaBack }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
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
import HowIconRow from "@/components/how/how-icon-row.vue";
import HowCalloutBox from "@/components/how/how-callout-box.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navBack } from "@/lib/route";
import { BINARY_SETTLE_PERIOD } from "@/lib/binary-settlement";

const t = useT();
const w = computed(() => t.value.commissionsHowItWorks);
// 平衡匹配渠道结算周期文案据后台同源配置派生(默认每月),与 /team/binary 口径一致。
const k2BodyText = computed(() =>
  fmt(w.value.k2Body, { freq: t.value.binary.settlePeriodLabel[BINARY_SETTLE_PERIOD] }),
);

function goBack() {
  navBack("/pages/team/commissions");
}

// ─── styles ───
const paraStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const captionStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginBottom: "14px", lineHeight: 1.6 }; // how-page scale: caption 12.5/1.6 ink-3
const noteStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 };

const statusBoxStyle: CSSProperties = {
  marginTop: "12px",
  background: "var(--v5-surface)",
  borderColor: "var(--v5-border)",
  borderRadius: "12px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  fontSize: "12px",
};
function statusChipStyle(color: string): CSSProperties {
  return {
    padding: "1px 8px",
    borderRadius: "6px",
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color,
    fontSize: "12px",
  };
}
const statusDescStyle: CSSProperties = { color: "var(--v5-ink-3)", lineHeight: 1.5 };

const exampleBoxStyle: CSSProperties = {
  marginTop: "12px",
  padding: "16px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
};
const exampleDayStyle: CSSProperties = {
  marginBottom: "8px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const exampleLabelStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)" };
function exampleAmtStyle(color: string): CSSProperties {
  return { fontSize: "13px", fontWeight: 600, color };
}
const exampleTotalRowStyle: CSSProperties = {
  paddingTop: "12px",
  marginTop: "4px",
  borderTop: "1px solid var(--v5-border)",
};
const exampleTotalLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const exampleTotalValueStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-brand)",
};

const ctaStyle: CSSProperties = {
  gap: "6px",
  height: "50px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
};
const ctaTextStyle: CSSProperties = {
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  letterSpacing: "-0.005em",
};
</script>
