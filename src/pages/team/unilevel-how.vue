<!--
  Influence Network Royalty · How it works — ported from
  Nexion-prototype/app/(main)/team/unilevel/how-it-works/page.tsx.
  HowHero + 6 HowSections: what-is + partner-status tier table + bonus signals
  (A/B cards) + worked-math card + 3 levers (StepRow) + FAQ + footer CTA.
  Deep sub-page → <AppChassis active="team">. SetPageHeader → <SubPageHeader>. table → view
  grid rows. lucide → inline <svg>. De-MLM'd wording kept (royalty/network/track).
-->
<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/unilevel" />

      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="lemon" />

      <HowSection :title="w.s1Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s1Para1 }}</text>
        <text class="block" :style="{ ...paraStyle, marginTop: '10px' }">{{ w.s1Para2 }}</text>
      </HowSection>

      <HowSection :title="w.s2Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s2Caption }}</text>
        <view class="rounded-xl border overflow-hidden" :style="tableCardStyle">
          <view class="flex items-center" :style="tableHeadStyle">
            <text :style="thLeftStyle">{{ w.colTier }}</text>
            <text :style="thMidStyle">{{ w.colMonthlyVolume }}</text>
            <text :style="thRightStyle">{{ w.colRate }}</text>
          </view>
          <view
            v-for="(tier, i) in tiers"
            :key="tier.name"
            class="flex items-center"
            :style="tableRowStyle(i === 0)"
          >
            <text class="font-display" :style="tierNameStyle(tier.color)">{{ tier.name }}</text>
            <text class="font-mono-tabular" :style="tierVolStyle">{{ tier.vol }}</text>
            <text class="font-display" :style="tierPerkStyle(tier.color)">{{ tier.perk }}</text>
          </view>
        </view>
        <text class="block" :style="footnoteStyle">{{ w.s2Footnote }}</text>
      </HowSection>

      <HowSection :title="w.s3Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <view class="rounded-xl border" :style="signalCardStyle">
            <view class="flex items-start" style="gap: 10px">
              <text class="grid place-items-center shrink-0" :style="signalBadgeStyle">A</text>
              <view class="flex-1 min-w-0">
                <text class="block" :style="signalNameStyle">{{ w.s3SignalAName }}</text>
                <text class="block" :style="signalBodyStyle">{{ w.s3SignalABody }}</text>
              </view>
            </view>
          </view>
          <view class="rounded-xl border" :style="signalCardStyle">
            <view class="flex items-start" style="gap: 10px">
              <text class="grid place-items-center shrink-0" :style="signalBadgeStyle">B</text>
              <view class="flex-1 min-w-0">
                <text class="block" :style="signalNameStyle">{{ w.s3SignalBName }}</text>
                <text class="block" :style="signalBodyStyle">{{ w.s3SignalBBody }}</text>
              </view>
            </view>
          </view>
        </view>
        <HowCalloutBox :title="`💡 ${w.s3HintTitle}`" :body="w.s3HintBody" tone="purple" />
      </HowSection>

      <HowSection :title="w.s4Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s4Intro }}</text>
        <view :style="mathCardStyle">
          <text class="block" :style="scenarioStyle">{{ w.s4Scenario }}</text>
          <text class="block" :style="setupStyle">{{ w.s4Setup }}</text>
          <view style="display: flex; flex-direction: column; gap: 6px">
            <view class="flex items-center justify-between">
              <text class="font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ w.s4DirectLabel }}</text>
              <text class="font-mono-tabular" :style="{ fontSize: '12px', fontWeight: 600, color: 'var(--v5-brand)' }">{{ w.s4DirectValue }}</text>
            </view>
            <view class="flex items-center justify-between">
              <text class="font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ w.s4BonusLabel }}</text>
              <text class="font-mono-tabular" :style="{ fontSize: '12px', fontWeight: 600, color: 'var(--v5-brand-2)' }">{{ w.s4BonusValue }}</text>
            </view>
          </view>
          <view class="flex items-center justify-between" :style="mathTotalRowStyle">
            <text :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ w.totalYouEarn }}</text>
            <text class="font-display tabular-nums" :style="{ fontSize: '20px', fontWeight: 600, color: 'var(--v5-ink)' }">$182.40</text>
          </view>
        </view>
        <text class="block" :style="noteStyle">{{ w.s4Note }}</text>
      </HowSection>

      <HowSection :title="w.s5Title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s5Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 14px">
          <HowStepRow :n="1" :title="w.s5Step1Title" :body="w.s5Step1Body" accent="lemon" />
          <HowStepRow :n="2" :title="w.s5Step2Title" :body="w.s5Step2Body" accent="lemon" />
          <HowStepRow :n="3" :title="w.s5Step3Title" :body="w.s5Step3Body" accent="lemon" />
        </view>
      </HowSection>

      <HowSection :title="w.faqTitle" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
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
import HowStepRow from "@/components/how/how-step-row.vue";
import HowCalloutBox from "@/components/how/how-callout-box.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import { useT } from "@/i18n/use-t";
import { navBack } from "@/lib/route";

const t = useT();
const w = computed(() => t.value.unilevelHowItWorks);

const tiers = computed(() => [
  { name: w.value.tierStandardName, vol: w.value.tierStandardVolume, perk: w.value.tierStandardPerk, color: "var(--v5-ink-3)" },
  { name: w.value.tierVerifiedName, vol: w.value.tierVerifiedVolume, perk: w.value.tierVerifiedPerk, color: "var(--v5-brand)" },
  { name: w.value.tierEliteName, vol: w.value.tierEliteVolume, perk: w.value.tierElitePerk, color: "var(--v5-tech-cyan)" },
  { name: w.value.tierDiamondName, vol: w.value.tierDiamondVolume, perk: w.value.tierDiamondPerk, color: "var(--v5-brand-2)" },
]);

function goBack() {
  navBack("/pages/team/unilevel");
}

// ─── styles ───
const paraStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const captionStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginBottom: "14px", lineHeight: 1.6 }; // how-page scale: caption 12.5/1.6 ink-3
const footnoteStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)" };
const noteStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 }; // readability: body note 12/1.5 (was 11.5/1.375)

const tableCardStyle: CSSProperties = { background: "var(--v5-surface)", borderColor: "var(--v5-border)", borderRadius: "12px" };
const tableHeadStyle: CSSProperties = {
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.14em", // SKILL: prototype thead tracking-[0.14em] (was 0.06em)
};
const thLeftStyle: CSSProperties = { flex: "1.1", textAlign: "left" };
const thMidStyle: CSSProperties = { flex: "1.5", textAlign: "left" };
const thRightStyle: CSSProperties = { flex: "1.4", textAlign: "right" };
function tableRowStyle(_isFirst: boolean): CSSProperties {
  // SKILL: prototype every <tr> has border-t border-[var(--v5-border)]/60 (incl. first row)
  return { padding: "10px 12px", borderTop: "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)", fontSize: "12px" };
}
function tierNameStyle(color: string): CSSProperties {
  return { flex: "1.1", fontWeight: 600, color };
}
const tierVolStyle: CSSProperties = { flex: "1.5", color: "color-mix(in srgb, var(--v5-ink) 80%, transparent)" };
function tierPerkStyle(color: string): CSSProperties {
  return { flex: "1.4", textAlign: "right", fontWeight: 600, color };
}

const signalCardStyle: CSSProperties = { background: "var(--v5-surface)", borderColor: "var(--v5-border)", borderRadius: "12px", padding: "12px" };
const signalBadgeStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-brand-2) 20%, transparent)",
  color: "var(--v5-brand-2)",
  fontSize: "12px",
  fontWeight: 600,
};
const signalNameStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const signalBodyStyle: CSSProperties = { marginTop: "5px", fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.62 }; // how-row scale: body 13/1.62 ink-2

const mathCardStyle: CSSProperties = {
  marginTop: "12px",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--v5-brand) 8%, transparent) 0%, var(--v5-on-brand) 50%, color-mix(in srgb, var(--v5-tech-cyan) 8%, transparent) 100%)",
  borderRadius: "12px",
  padding: "16px",
};
const scenarioStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginBottom: "4px" };
const setupStyle: CSSProperties = { fontSize: "13px", color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)", lineHeight: 1.625, marginBottom: "12px" }; // SKILL: leading-relaxed=1.625 (was 1.5)
const mathTotalRowStyle: CSSProperties = { marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--v5-border)" };

const ctaStyle: CSSProperties = {
  gap: "8px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const ctaTextStyle: CSSProperties = { color: "var(--v5-on-brand)", fontSize: "15px", fontWeight: 600 };
</script>
