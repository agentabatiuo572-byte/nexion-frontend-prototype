<!--
  Staking · How it works — explainer page (ported from
  Nexion-prototype/app/(main)/staking/how-it-works/page.tsx). Uses shared how-*
  components + an inline 4-row APY table (derived from STAKING_APY SoT, $100 demo
  stake). Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 32px">
      <SubPageHeader back="/pages/staking/staking" />

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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s2Caption }}</text>
        <view :style="tableStyle">
          <view class="flex" :style="tableHeadStyle">
            <text class="text-left" :style="thCellLeft">{{ w.colTerm }}</text>
            <text class="text-right" :style="thCellRight">{{ w.colApy }}</text>
            <text class="text-right" :style="thCellRight">{{ w.colReturn }}</text>
          </view>
          <view v-for="(row, i) in tableRows" :key="row.term" class="flex" :style="tableRowStyle(i === 0)">
            <text class="text-left tabular-nums" :style="tdTermStyle">{{ row.term }}d</text>
            <text class="text-right tabular-nums" :style="tdApyStyle">{{ row.apyPct }}</text>
            <text class="text-right tabular-nums" :style="tdReturnStyle">{{ row.ret }}</text>
          </view>
        </view>
        <text class="block" :style="footnoteStyle">{{ w.s2Footnote }}</text>
      </HowSection>

      <HowSection :title="w.s3Title">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 14px">
          <HowStepRow :n="1" :title="w.s3Step1Title" :body="w.s3Step1Body" accent="amber" />
          <HowStepRow :n="2" :title="w.s3Step2Title" :body="w.s3Step2Body" accent="amber" />
          <HowStepRow :n="3" :title="w.s3Step3Title" :body="w.s3Step3Body" accent="amber" />
        </view>
      </HowSection>

      <HowSection :title="w.s4Title" accent="amber">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s4Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <IconRow emoji="🔒" :label="w.r1Label" :body="w.r1Body" />
          <IconRow emoji="⚠️" :label="w.r2Label" :body="w.r2Body" />
          <IconRow emoji="📉" :label="w.r3Label" :body="w.r3Body" />
        </view>
        <CalloutBox :title="`✓ ${w.s4SafetyTitle}`" :body="w.s4SafetyBody" tone="lemon" />
      </HowSection>

      <HowSection :title="w.faqTitle" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z" /><path d="M2 9v1c0 1.1.9 2 2 2h1" /><path d="M16 11h.01" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow :q="w.faqQ1" :a="w.faqA1" />
          <HowFaqRow :q="w.faqQ2" :a="w.faqA2" />
          <HowFaqRow :q="w.faqQ3" :a="w.faqA3" />
          <HowFaqRow :q="w.faqQ4" :a="w.faqA4" />
          <HowFaqRow :q="w.faqQ5" :a="w.faqA5" />
        </view>
      </HowSection>

      <view class="mx-4" style="margin-top: 24px">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" @click="goStaking">
          <text>{{ w.ctaBack }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
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
import { STAKING_APY, type StakingTerm } from "@/store/staking";

const t = useT();
const w = computed(() => t.value.stakingHowItWorks);

// APY table — derived from STAKING_APY SoT, $100 demo stake held to maturity.
const tableRows = computed(() =>
  ([30, 90, 180, 365] as StakingTerm[]).map((termDays) => {
    const apy = STAKING_APY[termDays];
    return {
      term: termDays,
      apyPct: `${(apy * 100).toFixed(0)}%`,
      ret: `$${(1000 * apy * (termDays / 365)).toFixed(2)}`,
    };
  }),
);

function goStaking() {
  uni.navigateTo({ url: "/pages/staking/staking", fail: () => {} });
}

const paraStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const paraStyle2: CSSProperties = { ...paraStyle, marginTop: "10px" };
const captionStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" }; // how-page scale: caption 12.5/1.6 ink-3
const introStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" };
const tableStyle: CSSProperties = {
  borderRadius: "12px",
  background: "var(--v5-surface)",
  overflow: "hidden",
};
const tableHeadStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.14em",
  color: "var(--v5-ink-3)",
};
const thCellLeft: CSSProperties = { flex: "1", padding: "8px 12px", fontWeight: 500 };
const thCellRight: CSSProperties = { flex: "1", padding: "8px 12px", fontWeight: 500 };
function tableRowStyle(isFirst: boolean): CSSProperties {
  return {
    fontSize: "12px",
    borderTop: isFirst ? "none" : "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)",
  };
}
const tdTermStyle: CSSProperties = {
  flex: "1",
  padding: "8px 12px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
};
const tdApyStyle: CSSProperties = { flex: "1", padding: "8px 12px", fontFamily: "var(--font-v5)", color: "var(--v5-brand)" };
const tdReturnStyle: CSSProperties = {
  flex: "1",
  padding: "8px 12px",
  fontFamily: "var(--font-v5)",
  color: "var(--v5-brand-2)",
};
const footnoteStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)" };
const ctaStyle: CSSProperties = {
  gap: "8px",
  width: "100%",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "15px",
  fontWeight: 600,
};
</script>
