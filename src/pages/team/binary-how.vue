<!--
  Dual-Track (Balance Match) · How it works — migrated onto the shared how/*
  component system in the 2026-07 de-card sweep (was a page-local gradient hero
  + 6 surface+border section cards with nested sub-cards). HowHero +
  HowSection(purple = brand, the page's historic accent) + HowStepRow +
  HowFaqRow; the SVG tree diagram + track totals, reward-math table and Sarah
  timeline stay page-local, downgraded to borderless surface-2 tiles (P-013
  SVG shapes; in-SVG labels use <SvgText>, P-121 — a template <text> inside
  <svg> compiles to <uni-text> and never renders). De-MLM'd wording kept
  (Track A/B, auto-placement, network partner).
-->
<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/binary" />

      <!-- Hero -->
      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="purple" />

      <!-- §1 What is it -->
      <HowSection :title="w.s1Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        </template>
        <text class="block" :style="bodyStyle">{{ w.s1Para1 }}</text>
        <text class="block" :style="{ ...bodyStyle, marginTop: '10px' }">{{ s1Para2Text }}</text>
      </HowSection>

      <!-- §2 Visual diagram -->
      <HowSection :title="w.s2Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" /><path d="M12 12v3" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s2Caption }}</text>
        <view class="rounded-xl" :style="diagramTileStyle">
          <svg viewBox="0 0 340 160" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 156px">
            <!-- Connectors — You to two wings -->
            <line x1="170" y1="36" x2="86" y2="64" stroke="var(--v5-brand)" stroke-opacity="0.45" stroke-width="1.4" />
            <line x1="170" y1="36" x2="254" y2="64" stroke="var(--v5-tech-cyan)" stroke-opacity="0.5" stroke-width="1.4" />
            <!-- Connectors — wings to children -->
            <line x1="86" y1="90" x2="56" y2="124" stroke="var(--v5-brand)" stroke-opacity="0.32" stroke-width="1" />
            <line x1="86" y1="90" x2="86" y2="124" stroke="var(--v5-brand)" stroke-opacity="0.32" stroke-width="1" />
            <line x1="86" y1="90" x2="116" y2="124" stroke="var(--v5-brand)" stroke-opacity="0.32" stroke-width="1" />
            <line x1="254" y1="90" x2="224" y2="124" stroke="var(--v5-tech-cyan)" stroke-opacity="0.32" stroke-width="1" />
            <line x1="254" y1="90" x2="254" y2="124" stroke="var(--v5-tech-cyan)" stroke-opacity="0.32" stroke-width="1" />
            <line x1="254" y1="90" x2="284" y2="124" stroke="var(--v5-tech-cyan)" stroke-opacity="0.32" stroke-width="1" />

            <!-- You node -->
            <circle cx="170" cy="22" r="14" fill="var(--v5-surface-2)" stroke="var(--v5-ink)" stroke-opacity="0.55" stroke-width="1.5" />
            <SvgText x="170" y="26" text-anchor="middle" font-size="10" fill="var(--v5-ink)" font-weight="600">{{ w.diagYou }}</SvgText>

            <!-- Left wing main node -->
            <circle cx="86" cy="78" r="12" fill="var(--v5-brand)" fill-opacity="0.18" stroke="var(--v5-brand)" stroke-opacity="0.7" stroke-width="1.3" />
            <SvgText x="86" y="81.5" text-anchor="middle" font-size="9" fill="var(--v5-brand)" font-weight="600">A</SvgText>
            <SvgText x="86" y="104" text-anchor="middle" font-size="9.5" fill="var(--v5-ink-3)">{{ w.diagLeftLabel }}</SvgText>

            <!-- Right wing main node -->
            <circle cx="254" cy="78" r="12" fill="var(--v5-tech-cyan)" fill-opacity="0.22" stroke="var(--v5-tech-cyan-soft)" stroke-opacity="0.75" stroke-width="1.3" />
            <SvgText x="254" y="81.5" text-anchor="middle" font-size="9" fill="var(--v5-tech-cyan-soft)" font-weight="600">B</SvgText>
            <SvgText x="254" y="104" text-anchor="middle" font-size="9.5" fill="var(--v5-ink-3)">{{ w.diagRightLabel }}</SvgText>

            <!-- Left children -->
            <circle cx="56" cy="132" r="5.5" fill="var(--v5-brand)" fill-opacity="0.7" stroke="var(--v5-brand)" stroke-opacity="0.9" stroke-width="0.6" />
            <circle cx="86" cy="132" r="5.5" fill="var(--v5-brand)" fill-opacity="0.7" stroke="var(--v5-brand)" stroke-opacity="0.9" stroke-width="0.6" />
            <circle cx="116" cy="132" r="5.5" fill="var(--v5-brand)" fill-opacity="0.7" stroke="var(--v5-brand)" stroke-opacity="0.9" stroke-width="0.6" />
            <!-- Right children -->
            <circle cx="224" cy="132" r="5.5" fill="var(--v5-tech-cyan-soft)" fill-opacity="0.75" stroke="var(--v5-tech-cyan-soft)" stroke-opacity="0.9" stroke-width="0.6" />
            <circle cx="254" cy="132" r="5.5" fill="var(--v5-tech-cyan-soft)" fill-opacity="0.75" stroke="var(--v5-tech-cyan-soft)" stroke-opacity="0.9" stroke-width="0.6" />
            <circle cx="284" cy="132" r="5.5" fill="var(--v5-tech-cyan-soft)" fill-opacity="0.75" stroke="var(--v5-tech-cyan-soft)" stroke-opacity="0.9" stroke-width="0.6" />
          </svg>
          <view class="grid grid-cols-2" style="margin-top: 12px; gap: 8px">
            <view class="rounded-md text-center" :style="trackTotalStyle('var(--v5-brand)')">
              <text class="block" :style="{ color: 'var(--v5-brand)', fontWeight: 500, fontSize: '12px' }">{{ w.diagLeftLabel }}</text>
              <text class="block font-display tabular-nums" :style="trackTotalAmtStyle">{{ fmt(t.uiChrome.perMonth, { amount: "$3,000" }) }}</text>
            </view>
            <view class="rounded-md text-center" :style="trackTotalStyle('var(--v5-brand-2)')">
              <text class="block" :style="{ color: 'var(--v5-brand-2)', fontWeight: 500, fontSize: '12px' }">{{ w.diagRightLabel }}</text>
              <text class="block font-display tabular-nums" :style="trackTotalAmtStyle">{{ fmt(t.uiChrome.perMonth, { amount: "$2,000" }) }}</text>
            </view>
          </view>
        </view>
      </HowSection>

      <!-- §3 3 steps -->
      <HowSection :title="w.s3Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 14px">
          <HowStepRow v-for="st in steps" :key="st.n" :n="st.n" :title="st.title" :body="st.body" accent="purple" />
        </view>
      </HowSection>

      <!-- §4 How reward is calculated -->
      <HowSection :title="w.s4Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" /></svg>
        </template>
        <text class="block" :style="{ fontSize: '13px', color: 'var(--v5-ink-3)', lineHeight: 1.6 }">{{ s4IntroText }}</text>
        <view class="rounded-xl" :style="mathTileStyle">
          <view class="grid grid-cols-2" style="gap: 12px">
            <view>
              <text class="block" :style="{ fontSize: '12px', letterSpacing: '0.16em', color: 'var(--v5-ink-3)' }">{{ w.diagLeftLabel }}</text>
              <text class="block font-display tabular-nums" :style="{ fontSize: '20px', fontWeight: 600, color: 'var(--v5-brand)', marginTop: '2px' }">$3,000</text>
            </view>
            <view>
              <text class="block" :style="{ fontSize: '12px', letterSpacing: '0.16em', color: 'var(--v5-ink-3)' }">{{ w.diagRightLabel }}</text>
              <text class="block font-display tabular-nums" :style="{ fontSize: '20px', fontWeight: 600, color: 'var(--v5-brand-2)', marginTop: '2px' }">$2,000</text>
            </view>
          </view>
          <view class="flex items-center justify-between" :style="mathTotalRowStyle">
            <view class="flex items-center" style="gap: 6px">
              <text :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ w.s4SmallerLabel }}</text>
              <text class="font-display tabular-nums" :style="{ fontSize: '13px', color: 'color-mix(in srgb, var(--v5-ink) 90%, transparent)' }">$2,000</text>
              <text :style="{ fontSize: '12px', color: 'var(--v5-ink-4)' }">× 10% =</text>
            </view>
            <text class="font-display tabular-nums" :style="{ fontSize: '20px', fontWeight: 600, color: 'var(--v5-brand)' }">$200</text>
          </view>
        </view>
        <view class="inline-flex items-center rounded-full" :style="qualifyChipStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
          <text>{{ w.s4Qualify }}</text>
        </view>
        <text class="block" :style="{ marginTop: '8px', fontSize: '12px', color: 'var(--v5-ink-3)', lineHeight: 1.5 }">{{ w.s4PlainTalk }}</text>
      </HowSection>

      <!-- §5 Sarah example -->
      <HowSection :title="w.s5Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        </template>
        <text class="block" :style="{ fontSize: '13px', lineHeight: 1.6, color: 'var(--v5-ink-3)' }">{{ w.s5Intro }}</text>
        <view style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px">
          <view v-for="tl in timeline" :key="tl.month" class="rounded-lg" :style="timelineRowStyle(tl.highlight)">
            <view class="flex items-center justify-between">
              <text :style="{ fontSize: '12px', letterSpacing: '0.14em', color: 'var(--v5-brand)', fontWeight: 500 }">{{ tl.month }}</text>
              <text class="font-display tabular-nums" :style="{ fontSize: '15px', fontWeight: 600, color: tl.blocked ? 'var(--v5-brand-2)' : 'var(--v5-brand)' }">{{ tl.bonusVal }}</text>
            </view>
            <text class="block" :style="{ marginTop: '4px', fontSize: '12px', color: 'var(--v5-ink-2)', lineHeight: 1.5 }">{{ tl.text }}</text>
            <view class="flex items-center font-mono-tabular" :style="{ marginTop: '6px', gap: '12px', fontSize: '12px', color: 'var(--v5-ink-4)' }">
              <text>L {{ tl.leftVal }}</text>
              <text>·</text>
              <text>R {{ tl.rightVal }}</text>
            </view>
          </view>
        </view>
        <view class="rounded-lg border" :style="takeawayStyle">
          <text :style="{ color: 'var(--v5-brand-2)', marginRight: '4px' }">💡</text>
          <text :style="{ fontSize: '12px', color: 'var(--v5-ink-2)', lineHeight: 1.625 }">{{ w.s5Takeaway }}</text>
        </view>
      </HowSection>

      <!-- §6 FAQ -->
      <HowSection :title="w.faqTitle" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow v-for="faq in faqs" :key="faq.q" :q="faq.q" :a="faq.a" />
        </view>
      </HowSection>

      <!-- Footer CTA -->
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
import SvgText from "@/components/svg-text";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowStepRow from "@/components/how/how-step-row.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navBack } from "@/lib/route";
import { BINARY_SETTLE_PERIOD, BINARY_RESIDUAL_POLICY } from "@/lib/binary-settlement";

const t = useT();
const w = computed(() => t.value.binaryHowItWorks);

// 结算周期 / 沉淀处置 文案据后台同源配置派生(默认每月 / 每月清零),全页口径一致。
const freqLabel = computed(() => t.value.binary.settlePeriodLabel[BINARY_SETTLE_PERIOD]);
const unitLabel = computed(() => t.value.binary.periodUnitLabel[BINARY_SETTLE_PERIOD]);
const s1Para2Text = computed(() => fmt(w.value.s1Para2, { freq: freqLabel.value }));
// s4Intro:zh 用 {freq}(每月…)、en 用 {unit}(Each month…),两者都传,fmt 忽略未用占位符。
const s4IntroText = computed(() => fmt(w.value.s4Intro, { freq: freqLabel.value, unit: unitLabel.value }));

const steps = computed(() => [
  { n: 1, title: w.value.step1Title, body: w.value.step1Body },
  { n: 2, title: w.value.step2Title, body: w.value.step2Body },
  { n: 3, title: w.value.step3Title, body: w.value.step3Body },
]);
const timeline = computed(() => [
  { month: w.value.s5M1Month, text: w.value.s5M1Text, leftVal: "$200", rightVal: "$200", bonusVal: `$0 ${w.value.s5BlockedTag}`, blocked: true, highlight: false },
  { month: w.value.s5M2Month, text: w.value.s5M2Text, leftVal: "$2,600", rightVal: "$2,200", bonusVal: "$220", blocked: false, highlight: false },
  { month: w.value.s5M3Month, text: w.value.s5M3Text, leftVal: "$4,500", rightVal: "$2,400", bonusVal: "$240", blocked: false, highlight: true },
]);
const faqs = computed(() => [
  { q: w.value.faqQ1, a: w.value.faqA1 },
  { q: w.value.faqQ2, a: w.value.faqA2 },
  { q: w.value.faqQ3, a: fmt(w.value.faqA3, { freq: freqLabel.value, unit: unitLabel.value }) },
  { q: w.value.faqQ4, a: w.value.faqA4 },
  { q: w.value.faqQ5, a: w.value.residualFaq[BINARY_RESIDUAL_POLICY] },
]);

function goBack() {
  navBack("/pages/team/binary");
}

// ─── styles ───
// Hero / section shells / step rows / FAQ rows now come from the how/*
// components; only page-local content + tile styles remain.
const bodyStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const captionStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.6 }; // how-page scale: caption 12.5/1.6 ink-3

// Tree-diagram tile — de-carded: surface-2 fill, no border (single visual difference).
const diagramTileStyle: CSSProperties = { marginTop: "14px", background: "var(--v5-surface-2)", padding: "16px" };
function trackTotalStyle(color: string): CSSProperties {
  return { background: `color-mix(in srgb, ${color} 8%, transparent)`, padding: "6px 8px" };
}
const trackTotalAmtStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, marginTop: "2px", color: "var(--v5-ink)" };

// Reward-math tile — de-carded: surface-2 fill, no border (was gradient + border);
// internal total row keeps its hairline.
const mathTileStyle: CSSProperties = { marginTop: "14px", background: "var(--v5-surface-2)", padding: "16px" };
const mathTotalRowStyle: CSSProperties = { marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--v5-border)" };
const qualifyChipStyle: CSSProperties = {
  marginTop: "12px",
  gap: "6px",
  padding: "4px 10px",
  background: "color-mix(in srgb, var(--v5-warning) 12%, transparent)",
  fontSize: "12px",
  color: "var(--v5-warning)",
};

// Timeline rows — de-carded: filled, no border; highlight month = brand tint fill.
function timelineRowStyle(highlight: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    background: highlight ? "color-mix(in srgb, var(--v5-brand) 8%, transparent)" : "var(--v5-surface-2)",
  };
}
// Takeaway — accent callout (tint + border, the one sanctioned bg+border pairing).
// Radius comes from the rounded-lg class on the element.
const takeawayStyle: CSSProperties = {
  marginTop: "12px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  borderColor: "color-mix(in srgb, var(--v5-brand-2) 30%, transparent)",
  padding: "8px 12px",
};

const ctaStyle: CSSProperties = { gap: "8px", height: "48px", borderRadius: "999px", background: "var(--v5-brand)" };
const ctaTextStyle: CSSProperties = { color: "var(--v5-on-brand)", fontSize: "15px", fontWeight: 600 };
</script>
