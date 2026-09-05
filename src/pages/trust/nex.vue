<!--
  NEX Token · How it works — explainer (ported from
  Nexion-prototype/app/(main)/trust/nex/page.tsx). Reuses how-* components +
  an inline USDT-vs-NEX comparison table + demand/burn callouts. purple accent.
  Wrapped in <AppChassis active="me"> (entered from Trust Center).
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 32px">
      <SubPageHeader back="/pages/trust/trust" />

      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="nex" />

      <HowSection :title="w.s1Title" accent="nex">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s1Para1 }}</text>
        <view :style="tableStyle">
          <view class="flex" :style="tableHeadStyle">
            <text class="text-left" :style="thWhat">{{ w.colWhat }}</text>
            <text class="text-left" :style="thCell">USDT</text>
            <text class="text-left" :style="thCell">NEX</text>
          </view>
          <view v-for="(row, i) in tableRows" :key="row.k" class="flex" :style="tableRowStyle(i === 0)">
            <text class="text-left" :style="tdWhat">{{ row.k }}</text>
            <text class="text-left" :style="tdUsdt">{{ row.usdt }}</text>
            <text class="text-left" :style="tdNex">{{ row.nex }}</text>
          </view>
        </view>
      </HowSection>

      <HowSection :title="w.s2Title" accent="nex">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s2Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <IconRow emoji="⚙️" :label="w.src1Label" :body="w.src1Body" />
          <IconRow emoji="🤝" :label="w.src2Label" :body="w.src2Body" />
          <IconRow emoji="📈" :label="w.src3Label" :body="w.src3Body" />
          <IconRow emoji="🎁" :label="w.src4Label" :body="src4Body" />
        </view>
      </HowSection>

      <HowSection :title="w.s3Title" accent="nex">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <IconRow emoji="💱" :label="w.use1Label" :body="w.use1Body" />
          <IconRow emoji="💸" :label="w.use3Label" :body="w.use3Body" />
        </view>
      </HowSection>

      <HowSection :title="w.s4Title" accent="nex">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s4Intro }}</text>
        <view :style="demandBoxStyle">
          <text class="block" :style="demandLabelStyle">{{ w.s4DemandLabel }}</text>
          <text class="block" :style="demandBodyStyle">{{ w.s4DemandBody }}</text>
        </view>
        <view :style="burnBoxStyle">
          <view class="flex items-center" :style="burnLabelRowStyle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
            <text :style="burnLabelTextStyle">{{ w.s4BurnLabel }}</text>
          </view>
          <text class="block" :style="burnBodyStyle">{{ w.s4BurnBody }}</text>
        </view>
        <CalloutBox :title="`💡 ${w.s4HintTitle}`" :body="w.s4HintBody" tone="nex" />
      </HowSection>

      <HowSection :title="w.faqTitle" accent="nex">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow :q="w.faqQ1" :a="w.faqA1" />
          <HowFaqRow :q="w.faqQ2" :a="w.faqA2" />
          <HowFaqRow :q="w.faqQ3" :a="w.faqA3" />
          <HowFaqRow :q="w.faqQ4" :a="w.faqA4" />
          <HowFaqRow :q="w.faqQ5" :a="w.faqA5" />
        </view>
      </HowSection>

      <view class="mx-4" style="margin-top: 24px; display: flex; flex-direction: column; gap: 10px">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaExchangeStyle" @click="goExchange">
          <text>{{ w.ctaExchange }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaBackStyle" @click="goBack">
          <text>{{ w.ctaBack }}</text>
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
import HowFaqRow from "@/components/how/how-faq-row.vue";
import IconRow from "@/components/how/how-icon-row.vue";
import CalloutBox from "@/components/how/how-callout-box.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useConfig } from "@/store/config";

const t = useT();
const w = computed(() => t.value.nexHowItWorks);
const cfg = useConfig();
// 礼包 NEX 数量单源派生自 platform config。
const src4Body = computed(() => fmt(w.value.src4Body, { nex: cfg.config.rewards.welcomeGift.nexAmount }));

const tableRows = computed(() => [
  { k: w.value.rowType, usdt: w.value.usdtType, nex: w.value.nexType },
  { k: w.value.rowPrice, usdt: `$1.00 (${w.value.fixed})`, nex: `$0.17 (${w.value.variable})` },
  { k: w.value.rowVolatility, usdt: w.value.usdtVolatility, nex: w.value.nexVolatility },
  { k: w.value.rowUse, usdt: w.value.usdtUse, nex: w.value.nexUse },
]);

function goExchange() {
  uni.navigateTo({ url: "/pages/me/wallet-exchange", fail: () => {} });
}
function goBack() {
  uni.navigateTo({ url: "/pages/trust/trust", fail: () => {} });
}

const paraStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const introStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" }; // how-page scale: caption 12.5/1.6 ink-3
const tableStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "12px",
  background: "var(--v5-surface)",
  overflow: "hidden",
};
const tableHeadStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-ink-3)" };
const thWhat: CSSProperties = { flex: "1.2", padding: "8px 12px", fontWeight: 500 };
const thCell: CSSProperties = { flex: "1", padding: "8px 12px", fontWeight: 500 };
function tableRowStyle(isFirst: boolean): CSSProperties {
  return {
    fontSize: "12px",
    borderTop: isFirst ? "none" : "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)",
  };
}
const tdWhat: CSSProperties = { flex: "1.2", padding: "8px 12px", color: "var(--v5-ink-3)" };
const tdUsdt: CSSProperties = { flex: "1", padding: "8px 12px", color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)" };
const tdNex: CSSProperties = { flex: "1", padding: "8px 12px", color: "var(--v5-nex)" };
const demandBoxStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 10%, var(--v5-surface))",
  padding: "16px",
};
const demandLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-brand-2)", marginBottom: "8px" };
const demandBodyStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.625 };
const burnBoxStyle: CSSProperties = {
  marginTop: "8px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
  padding: "16px",
};
const burnLabelRowStyle: CSSProperties = { marginBottom: "8px" };
const burnLabelTextStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-warning)" };
const burnBodyStyle: CSSProperties = { fontSize: "12px", color: "color-mix(in srgb, var(--v5-ink) 80%, transparent)", lineHeight: 1.625 };
const ctaExchangeStyle: CSSProperties = {
  gap: "8px",
  width: "100%",
  height: "48px",
  borderRadius: "999px",
  background: "linear-gradient(90deg, var(--v5-tech-cyan), var(--v5-brand-2))",
  color: "var(--v5-on-brand)",
  fontSize: "15px",
  fontWeight: 600,
};
const ctaBackStyle: CSSProperties = {
  width: "100%",
  height: "44px",
  borderRadius: "999px",
  // 返回 CTA 直接坐在页面底上(不在任何卡片内)→ 用 L1 surface;亮色下 surface-2 与页面底几乎同色不可辨
  background: "var(--v5-surface)",
  color: "var(--v5-ink-2)",
  fontSize: "13px",
  fontWeight: 500,
};
</script>
