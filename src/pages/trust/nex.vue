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

      <view v-if="narrative.state === 'loading'" class="mx-4" :style="stateCardStyle">
        <text class="block" :style="stateTextStyle">{{ t.trust.nexNarrativeLoading }}</text>
      </view>
      <view v-else-if="narrative.state === 'error'" class="mx-4" :style="stateCardStyle">
        <text class="block" :style="stateTextStyle">{{ t.trust.nexNarrativeError }}</text>
        <text class="block active:opacity-70" :style="retryStyle" role="button" tabindex="0" @click="loadNarrative(true)" @keydown.enter.prevent="loadNarrative(true)" @keydown.space.prevent="loadNarrative(true)">{{ t.ui.retry }}</text>
      </view>
      <view v-else-if="narrative.state === 'unpublished'" class="mx-4" :style="stateCardStyle">
        <text class="block" :style="stateTextStyle">{{ t.trust.nexNarrativeUnavailable }}</text>
        <text class="block active:opacity-70" :style="retryStyle" role="button" tabindex="0" @click="loadNarrative(true)" @keydown.enter.prevent="loadNarrative(true)" @keydown.space.prevent="loadNarrative(true)">{{ t.ui.retry }}</text>
      </view>

      <HowHero :label="narrative.state === 'ready' ? `${w.heroLabel} · ${narrative.version}` : w.heroLabel" :title="narrative.state === 'ready' ? narrative.hero : '—'" :sub="narrative.state === 'ready' ? narrative.subhero ?? '' : ''" accent="purple" />

      <HowSection :title="w.s1Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ w.s1Para1 }}</text>
        <view :style="tableStyle">
          <view class="flex" :style="tableHeadStyle">
            <text class="text-left" :style="thWhat">{{ w.colWhat }}</text>
            <text class="text-left" :style="thCell">USDT</text>
            <text class="text-left" :style="thCell">UVT</text>
          </view>
          <view v-for="(row, i) in tableRows" :key="row.k" class="flex" :style="tableRowStyle(i === 0)">
            <text class="text-left" :style="tdWhat">{{ row.k }}</text>
            <text class="text-left" :style="tdUsdt">{{ row.usdt }}</text>
            <text class="text-left" :style="tdNex">{{ row.nex }}</text>
          </view>
        </view>
      </HowSection>

      <HowSection :title="w.s2Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s2Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <view class="nex-copy-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4zM8 8h8v8H8z"/></svg><view><text class="block nex-copy-label">{{ w.src1Label }}</text><text class="block" :style="paraStyle">{{ w.src1Body }}</text></view></view>
          <view class="nex-copy-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"/></svg><view><text class="block nex-copy-label">{{ w.src2Label }}</text><text class="block" :style="paraStyle">{{ w.src2Body }}</text></view></view>
          <view class="nex-copy-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 17 6-6 4 4 8-10M15 5h6v6"/></svg><view><text class="block nex-copy-label">{{ w.src3Label }}</text><text class="block" :style="paraStyle">{{ w.src3Body }}</text></view></view>
          <view class="nex-copy-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v13H3zM12 8v13M2 8h20V5H2z"/></svg><view><text class="block nex-copy-label">{{ w.src4Label }}</text><text class="block" :style="paraStyle">{{ src4Body }}</text></view></view>
        </view>
      </HowSection>

      <HowSection :title="w.s3Title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
        </template>
        <text class="block" :style="introStyle">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <view class="nex-copy-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4"/></svg><view><text class="block nex-copy-label">{{ w.use1Label }}</text><text class="block" :style="paraStyle">{{ w.use1Body }}</text></view></view>
          <view class="nex-copy-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18v14H3zM7 12h10"/></svg><view><text class="block nex-copy-label">{{ w.use3Label }}</text><text class="block" :style="paraStyle">{{ w.use3Body }}</text></view></view>
        </view>
      </HowSection>

      <HowSection :title="w.s4Title" accent="purple">
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
            <text :style="burnLabelTextStyle">{{ w.s4BurnLabel }}</text>
          </view>
          <text class="block" :style="burnBodyStyle">{{ w.s4BurnBody }}</text>
        </view>
        <view :style="demandBoxStyle"><text class="block nex-copy-label">{{ w.s4HintTitle }}</text><text class="block" :style="paraStyle">{{ w.s4HintBody }}</text></view>
      </HowSection>

      <HowSection :title="w.faqTitle" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow :q="w.faqQ1" :a="w.faqA1" />
          <HowFaqRow :q="w.faqQ2" :a="w.faqA2" />
          <HowFaqRow :q="w.faqQ3" :a="w.faqA3" />
        </view>
      </HowSection>

      <view class="mx-4" style="margin-top: 24px; display: flex; flex-direction: column; gap: 10px">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaExchangeStyle" role="button" tabindex="0" @click="goExchange"  @keydown.enter.prevent="goExchange" @keydown.space.prevent="goExchange">
          <text>{{ w.ctaExchange }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaBackStyle" role="button" tabindex="0" @click="goBack"  @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
          <text>{{ w.ctaBack }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { navBack, navReplace, navTo } from "@/lib/route";
import { computed, onMounted, onUnmounted, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { useConfig } from "@/store/config";
import { useMarket } from "@/store/market";
import { recordPublishedTrustViews, usePublishedTrust } from "@/composables/use-published-trust";
import { subscribeRuntimeRevision } from "@/api/order-api";
import type { TrustLocale } from "@/api/trust-section-api";
import { resolvePublishedNexNarrative } from "@/lib/nex-published-content";

const t = useT();
const w = computed(() => t.value.nexHowItWorks);
const locale = useLocaleStore();
const language = computed<TrustLocale>(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code as TrustLocale : "en");
const { sections, status, refresh } = usePublishedTrust();
const narrative = computed(() => resolvePublishedNexNarrative(sections.value, status.value, language.value));

let narrativePageVisible = false;
let narrativeVisibleEpoch = 0;
let narrativeReadRequest = 0;

function invalidateNarrativePageRead(): void {
  narrativeVisibleEpoch += 1;
}

async function loadNarrative(force = false): Promise<boolean> {
  if (!narrativePageVisible) return false;
  const visibleEpoch = narrativeVisibleEpoch;
  const request = ++narrativeReadRequest;
  const loaded = await refresh(force);
  if (
    narrativePageVisible
    && visibleEpoch === narrativeVisibleEpoch
    && request === narrativeReadRequest
    && loaded
    && narrative.value.state === "ready"
  ) recordPublishedTrustViews(["nexNarrative"], language.value);
  return loaded;
}

const unsubscribeNarrativeRuntime = subscribeRuntimeRevision(() => {
  if (narrativePageVisible) void loadNarrative(true);
});
onShow(() => {
  narrativePageVisible = true;
  invalidateNarrativePageRead();
  void loadNarrative(true);
});
onHide(() => {
  narrativePageVisible = false;
  invalidateNarrativePageRead();
});
onUnmounted(() => {
  narrativePageVisible = false;
  invalidateNarrativePageRead();
  unsubscribeNarrativeRuntime();
});
const cfg = useConfig();
const market = useMarket();
onMounted(() => { if (!market.isMockMode) void market.syncRemote(); });

// 礼包 NEX 数量单源派生自 platform config。
const src4Body = computed(() => fmt(w.value.src4Body, { nex: formatAmount(cfg.config.rewards.welcomeGift.nexAmount) }));

const tableRows = computed(() => [
  { k: w.value.rowType, usdt: w.value.usdtType, nex: w.value.nexType },
  { k: w.value.rowPrice, usdt: `$1.00 (${w.value.fixed})`, nex: `${nexPriceText.value} (${w.value.variable})` },
  { k: w.value.rowVolatility, usdt: w.value.usdtVolatility, nex: w.value.nexVolatility },
  { k: w.value.rowUse, usdt: w.value.usdtUse, nex: w.value.nexUse },
]);

const nexPriceText = computed(() => market.remoteReady && market.nexPriceUSDT > 0
  ? `${market.nexPriceUSDT.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
  : "—");

function goExchange() {
  navTo("/pages/me/wallet-exchange");
}
function goBack(event?: KeyboardEvent | PointerEvent) {
  if (event && "repeat" in event && event.repeat) return;
  try { navBack("/pages/trust/trust"); }
  catch { void navReplace("/pages/trust/trust"); }
}

const stateCardStyle: CSSProperties = { marginTop: "16px", padding: "16px", borderRadius: "16px", background: "var(--v5-surface)" };
const stateTextStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.6 };
const retryStyle: CSSProperties = { marginTop: "8px", minHeight: "44px", display: "inline-flex", alignItems: "center", font: "600 13px/20px var(--font-v5)", color: "var(--v5-brand)" };
const paraStyle: CSSProperties = { fontSize: "var(--ui-type-list-subtitle)", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const introStyle: CSSProperties = { fontSize: "var(--ui-type-list-subtitle)", color: "var(--v5-ink-3)", lineHeight: 1.6, marginBottom: "14px" }; // how-page scale: caption 12.5/1.6 ink-3
const tableStyle: CSSProperties = {
  marginTop: "12px",
  paddingBlock: "4px",
};
const tableHeadStyle: CSSProperties = { fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-2)", borderBottom: "1px solid var(--v5-border)" };
const thWhat: CSSProperties = { flex: "1.2 1 0", minWidth: 0, overflowWrap: "anywhere", padding: "10px 6px", fontWeight: 500 };
const thCell: CSSProperties = { flex: "1 1 0", minWidth: 0, overflowWrap: "anywhere", padding: "10px 6px", fontWeight: 500 };
function tableRowStyle(isFirst: boolean): CSSProperties {
  return {
    fontSize: "var(--ui-type-list-subtitle)",
    lineHeight: 1.6,
    borderTop: isFirst ? "none" : "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)",
  };
}
const tdWhat: CSSProperties = { flex: "1.2 1 0", minWidth: 0, overflowWrap: "anywhere", padding: "10px 6px", color: "var(--v5-ink-3)" };
const tdUsdt: CSSProperties = { flex: "1 1 0", minWidth: 0, overflowWrap: "anywhere", padding: "10px 6px", color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)" };
const tdNex: CSSProperties = { flex: "1 1 0", minWidth: 0, overflowWrap: "anywhere", padding: "10px 6px", color: "var(--v5-ink)" };
const demandBoxStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "12px",
  background: "transparent",
  padding: "12px 0",
};
const demandLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-ink)", marginBottom: "8px" };
const demandBodyStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.625 };
const burnBoxStyle: CSSProperties = {
  marginTop: "8px",
  borderRadius: "12px",
  background: "transparent",
  padding: "12px 0",
};
const burnLabelRowStyle: CSSProperties = { marginBottom: "8px" };
const burnLabelTextStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-ink)" };
const burnBodyStyle: CSSProperties = { fontSize: "12px", color: "color-mix(in srgb, var(--v5-ink) 80%, transparent)", lineHeight: 1.625 };
const ctaExchangeStyle: CSSProperties = {
  gap: "8px",
  width: "100%",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "var(--ui-type-button)",
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

<style scoped>
.nex-copy-row { display:grid;grid-template-columns:20px minmax(0,1fr);gap:12px;padding:10px 0;border-bottom:1px solid var(--v5-border);color:var(--v5-ink-2); }
.nex-copy-label { font-size:13px;font-weight:600;color:var(--v5-ink);margin-bottom:5px; }
</style>
