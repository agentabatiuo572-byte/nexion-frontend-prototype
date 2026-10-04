<!-- Reference five-section layout; all explanations and rule values come from public server APIs. -->
<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader :title="t.headerTitles.teamCommissions + t.headerTitles.howItWorksSuffix" back="/pages/team/commissions" />

      <HowHero v-if="!state.loading && !state.error" :label="w.heroLabel" :title="s(sectionId.hero).title" :sub="s(sectionId.hero).body" accent="lemon" />

      <view v-if="state.loading || state.error || content.incomplete" class="mx-4 rounded-xl" style="padding: 14px; background: var(--v5-surface-2)" aria-live="polite">
        <text class="block" :style="paraStyle">{{ state.loading ? content.copy.loading : content.copy.unavailable }}</text>
        <view v-if="!state.loading" role="button" tabindex="0" style="margin-top: 10px; color: var(--v5-brand); cursor: pointer" @click="reload" @keydown.enter.prevent="reload" @keydown.space.prevent="reload"><text>{{ content.copy.retry }}</text></view>
      </view>

      <template v-if="!state.loading && !state.error">
      <HowSection :title="s(sectionId.overview).title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
        </template>
        <text class="block" :style="paraStyle">{{ s(sectionId.overview).body }}</text>
      </HowSection>

      <HowSection :title="s(sectionId.channels).title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ s(sectionId.channels).body }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowIconRow v-for="item in channels" :key="item.id" :emoji="item.emoji" :label="item.title" :body="item.body" />
        </view>
      </HowSection>

      <HowSection :title="s(sectionId.lifecycle).title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ s(sectionId.lifecycle).body }}</text>
        <view class="rounded-xl border" :style="statusBoxStyle">
          <view class="flex items-start" style="gap: 10px">
            <text class="shrink-0 font-mono-tabular" :style="statusChipStyle('var(--v5-warning)')">{{ s(sectionId.cooling).title }}</text>
            <text :style="statusDescStyle">{{ s(sectionId.cooling).body }}</text>
          </view>
          <view class="flex items-start" style="gap: 10px">
            <text class="shrink-0 font-mono-tabular" :style="statusChipStyle('var(--v5-brand)')">{{ s(sectionId.unlocked).title }}</text>
            <text :style="statusDescStyle">{{ s(sectionId.unlocked).body }}</text>
          </view>
          <view class="flex items-start" style="gap: 10px">
            <text class="shrink-0 font-mono-tabular" :style="statusChipStyle('var(--v5-brand-2)')">{{ s(sectionId.withdrawn).title }}</text>
            <text :style="statusDescStyle">{{ s(sectionId.withdrawn).body }}</text>
          </view>
        </view>
        <HowCalloutBox :title="`💡 ${s(sectionId.coolingNote).title}`" :body="s(sectionId.coolingNote).body" tone="amber" />
      </HowSection>

      <HowSection :title="s(sectionId.example).title" accent="lemon">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ s(sectionId.example).body }}</text>
        <view :style="exampleBoxStyle">
          <text class="block" :style="exampleDayStyle">{{ s(sectionId.exampleDay).title }}</text>
          <text class="block" :style="captionStyle">{{ s(sectionId.exampleDay).body }}</text>
          <view style="display: flex; flex-direction: column; gap: 10px">
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">👥</text>
                <text class="block" :style="exampleLabelStyle">{{ s(sectionId.exampleNetwork).body }}</text>
              </view>
              <text class="font-display tabular-nums" :style="exampleAmtStyle('var(--v5-brand)')">{{ content.amounts.network }}</text>
            </view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">🌱</text>
                <text class="block" :style="exampleLabelStyle">{{ s(sectionId.exampleCultivation).body }}</text>
              </view>
              <text class="font-display tabular-nums" :style="exampleAmtStyle('var(--v5-brand-2)')">{{ content.amounts.cultivation }}</text>
            </view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">🤝</text>
                <text class="block" :style="exampleLabelStyle">{{ s(sectionId.examplePeer).body }}</text>
              </view>
              <text class="font-display tabular-nums" :style="exampleAmtStyle('var(--v5-brand)')">{{ content.amounts.peer }}</text>
            </view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="flex items-center min-w-0" style="gap: 6px">
                <text class="shrink-0">👑</text>
                <text class="block" :style="exampleLabelStyle">{{ s(sectionId.exampleLeadership).body }}</text>
              </view>
              <text class="font-display tabular-nums" :style="exampleAmtStyle('var(--v5-warning)')">{{ content.amounts.leadership }}</text>
            </view>
            <view class="flex items-center justify-between" :style="exampleTotalRowStyle">
              <text :style="exampleTotalLabelStyle">{{ s(sectionId.exampleTotal).title }}</text>
              <text class="tabular-nums" :style="exampleTotalValueStyle">{{ content.exampleTotal }}</text>
            </view>
          </view>
        </view>
        <text class="block" :style="noteStyle">{{ s(sectionId.exampleNote).body }}</text>
      </HowSection>

      <HowSection :title="s(sectionId.faq).title" accent="purple">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow :q="s(sectionId.faqOrder).title" :a="s(sectionId.faqOrder).body" />
          <HowFaqRow :q="s(sectionId.faqWithdraw).title" :a="s(sectionId.faqWithdraw).body" />
          <HowFaqRow :q="s(sectionId.faqReversal).title" :a="s(sectionId.faqReversal).body" />
          <HowFaqRow :q="s(sectionId.faqCultivation).title" :a="s(sectionId.faqCultivation).body" />
        </view>
      </HowSection>

      </template>

      <view class="mx-4 mt-6">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" role="button" tabindex="0" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
          <text :style="ctaTextStyle">{{ s(sectionId.footer, w.ctaBack).title }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowIconRow from "@/components/how/how-icon-row.vue";
import HowCalloutBox from "@/components/how/how-callout-box.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { apiClient, expectedApiEnvironment, howContentApi, vRankApi } from "@/api/runtime";
import { createCommissionGuideApi } from "@/api/commission-guide-api";
import { buildCommissionsHowContent, createCommissionsHowResource, type CommissionsHowState } from "@/lib/commissions-how-content";
import { navBack } from "@/lib/route";

const t = useT();
const w = computed(() => t.value.commissionsHowItWorks);
const locale = useLocaleStore();
const state = ref<CommissionsHowState>({ loading: true, error: false, snapshot: null });
const commissionGuideApi = createCommissionGuideApi(apiClient, expectedApiEnvironment);
const resource = createCommissionsHowResource({
  async read(language) {
    const [document, rates, guide, ladder] = await Promise.all([
      howContentApi.published("team-commissions-how", language),
      commissionGuideApi.rates(), commissionGuideApi.read(), vRankApi.ladder(),
    ]);
    return { document, rates, guide, ranks: ladder.ranks };
  },
  apply: next => { state.value = next; },
});
const content = computed(() => buildCommissionsHowContent(state.value.snapshot, locale.code));
const s = (id: string, fallback?: string) => content.value.section(id, fallback);
const sectionId = {
  hero: "hero", overview: "overview", channels: "channels", lifecycle: "lifecycle",
  cooling: "cooling", unlocked: "unlocked", withdrawn: "withdrawn", coolingNote: "cooling-note",
  example: "example", exampleDay: "example-day", exampleNetwork: "example-network",
  exampleCultivation: "example-cultivation", examplePeer: "example-peer",
  exampleLeadership: "example-leadership", exampleTotal: "example-total", exampleNote: "example-note",
  faq: "faq", faqOrder: "faq-order", faqWithdraw: "faq-withdraw", faqReversal: "faq-reversal",
  faqCultivation: "faq-cultivation", footer: "footer",
} as const;
const channels = computed(() => ["network", "binary", "peer", "cultivation", "leadership", "genesis"].map((id, index) => ({
  ...s(id), emoji: ["👥", "⚖️", "🤝", "🌱", "👑", "💎"][index],
})));
function reload() { void resource.load(locale.code); }
onShow(reload);
watch(() => locale.code, reload);
onUnmounted(resource.dispose);

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
const exampleLabelStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", overflowWrap: "anywhere" };
function exampleAmtStyle(color: string): CSSProperties {
  return { fontSize: "13px", fontWeight: 600, color, textAlign: "right", maxWidth: "48%", flexShrink: 0, overflowWrap: "anywhere" };
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
