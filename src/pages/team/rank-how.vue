<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/rank" />
      <HowHero :label="w.heroLabel" :title="content.copy.headline" :sub="state.policy?.hero || statusText" accent="violet" />

      <view v-if="state.loading || incomplete" class="mx-4 rounded-xl" :style="unavailableStyle" aria-live="polite">
        <text class="block" :style="bodyStyle">{{ statusText }}</text>
        <view v-if="!state.loading" :style="retryStyle" role="button" tabindex="0" @click="reload" @keydown.enter.prevent="reload" @keydown.space.prevent="reload"><text>{{ content.copy.retry }}</text></view>
      </view>

      <!-- §1 · Published overview; the same section shell as 5174. -->
      <HowSection :title="s(sectionId.overview, w.s1Title).title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
        </template>
        <text class="block" :style="bodyStyle">{{ s(sectionId.overview).body }}</text>
        <text class="block" :style="{ ...bodyStyle, marginTop: '10px' }">{{ s(sectionId.overviewDetail).body }}</text>
      </HowSection>

      <!-- §2 · Server ladder, without prototype names or clipped inline thresholds. -->
      <HowSection :title="s(sectionId.ladder, w.s2Title).title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ s(sectionId.ladder).body }}</text>
        <view v-if="content.ladder.length" style="margin-top: 14px; padding: 0 2px; display: flex; flex-direction: column; gap: 7px">
          <view v-for="rank in content.ladder" :key="rank.v" class="flex items-center" style="gap: 10px; min-width: 0">
            <VBadgeIcon :v="rank.v as VRank" :size="22" />
            <text class="font-display tabular-nums" :style="ladderVStyle">V{{ rank.v }}</text>
            <text v-if="rankName(rank, locale.code)" :style="ladderTitleStyle">{{ rankName(rank, locale.code) }}</text>
          </view>
        </view>
        <text v-else class="block mt-3" :style="bodyStyle">{{ state.loading ? content.copy.loading : content.copy.emptyLadder }}</text>
      </HowSection>

      <!-- §3 · Four requirement tiles plus stepwise/protection callouts. -->
      <HowSection :title="s(sectionId.promotion, w.s3Title).title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>
        </template>
        <text class="block" :style="{ ...captionStyle, marginBottom: '14px' }">{{ s(sectionId.promotion).body }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <view v-for="req in requirements" :key="req.id" class="rounded-xl" :style="reqCardStyle">
            <text class="block" :style="reqLabelStyle">{{ req.title }}</text>
            <text class="block" :style="reqBodyStyle">{{ req.body }}</text>
          </view>
        </view>
        <HowCalloutBox :title="'⚠️ ' + s(sectionId.stepwise).title" :body="s(sectionId.stepwise).body" tone="amber" />
        <HowCalloutBox :title="'✓ ' + s(sectionId.protection).title" :body="s(sectionId.protection).body" tone="purple" />
      </HowSection>

      <!-- §4 · Same four icon rows; published settlement caveats are not replaced. -->
      <HowSection :title="s(sectionId.rewards, w.s4Title).title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="8" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ s(sectionId.rewards).body }}</text>
        <view style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px">
          <HowIconRow v-for="item in unlocks" :key="item.id" :emoji="item.emoji" :label="item.title" :body="item.body" />
        </view>
      </HowSection>

      <!-- §5 · Illustrative adjacent ranks selected from current visible server configuration. -->
      <HowSection :title="s(sectionId.example, content.copy.example).title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        </template>
        <text class="block" :style="{ fontSize: '13px', lineHeight: 1.6, color: 'var(--v5-ink-3)' }">{{ content.example ? s(sectionId.example).body : (state.loading ? content.copy.loading : content.copy.noExample) }}</text>
        <template v-if="content.example">
          <view class="rounded-xl" :style="startCardStyle">
            <text class="block" :style="startLabelStyle">{{ s(sectionId.exampleStart).title }}</text>
            <text class="block" :style="bodyStyle">{{ s(sectionId.exampleStart).body }}</text>
          </view>
          <view style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px">
            <HowStepRow v-for="phase in phases" :key="phase.id" :n="phase.n" :title="phase.title" :body="phase.body" accent="violet" />
          </view>
          <HowCalloutBox :title="'⚡ ' + s(sectionId.exampleTrigger).title" :body="s(sectionId.exampleTrigger).body" tone="purple" />
          <view class="rounded-xl border" :style="unlockResultCardStyle">
            <text class="block" :style="unlockResultLabelStyle">🎉 {{ s(sectionId.exampleResults).title }}</text>
            <text class="block" :style="{ ...captionStyle, marginBottom: '6px' }">{{ s(sectionId.exampleResults).body }}</text>
            <view style="display: flex; flex-direction: column; gap: 4px">
              <text v-for="result in results" :key="result.id" class="block" :style="unlockResultItemStyle">• {{ result.body }}</text>
            </view>
          </view>
        </template>
      </HowSection>

      <!-- §6 · Published FAQ, using the reference's shared FAQ rows. -->
      <HowSection :title="w.faqTitle" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow v-for="faq in faqs" :key="faq.id" :q="faq.title" :a="faq.body" />
        </view>
      </HowSection>

      <view class="mx-4 mt-6">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" role="button" tabindex="0" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
          <text :style="ctaTextStyle">{{ w.ctaBack }}</text>
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
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowCalloutBox from "@/components/how/how-callout-box.vue";
import HowIconRow from "@/components/how/how-icon-row.vue";
import HowStepRow from "@/components/how/how-step-row.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import type { VRank } from "@/store/v-rank";
import { navBack } from "@/lib/route";
import { apiClient, expectedApiEnvironment, vRankApi } from "@/api/runtime";
import { createRankHowPolicyApi } from "@/api/rank-how-policy-api";
import { buildRankHowContent, createRankHowResource, type RankHowResourceState } from "@/lib/rank-how-content";
import { rankName } from "@/lib/v-rank-copy";

const t = useT();
const w = computed(() => t.value.rankHowItWorks);
const locale = useLocaleStore();
const state = ref<RankHowResourceState>({ loading: true, error: false, policy: null, ranks: [], capabilities: { peer: false, genesis: false } });
const policyApi = createRankHowPolicyApi(apiClient, expectedApiEnvironment);
const resource = createRankHowResource({ published: policyApi.published, ladder: vRankApi.ladder, apply: value => { state.value = value; } });
const content = computed(() => buildRankHowContent(state.value.policy, state.value.ranks, state.value.capabilities, locale.code, t.value.rank.cond));
const s = (id: string, fallbackTitle?: string) => content.value.section(id, fallbackTitle);
const sectionId = {
  overview: "overview", overviewDetail: "overview-detail", ladder: "ladder", promotion: "promotion",
  stepwise: "stepwise", protection: "protection", rewards: "rewards", example: "example",
  exampleStart: "example-start", exampleTrigger: "example-trigger", exampleResults: "example-results",
} as const;
const requirements = computed(() => ["requirement-self", "requirement-direct", "requirement-team", "requirement-legs"].map(id => s(id)));
const unlocks = computed(() => ["network", "peer", "leadership", "cultivation"].map((name, index) => ({ ...s(`unlock-${name}`), emoji: ["📈", "🤝", "🏆", "🌱"][index] })));
const phases = computed(() => ["self", "team", "legs"].map((name, index) => ({ ...s(`example-${name}`), n: index + 1 })));
const results = computed(() => ["network", "peer", "leadership", "cultivation"].map(name => s(`result-${name}`)));
const faqs = computed(() => ["members", "rank", "rewards"].map(name => s(`faq-${name}`)));
const incomplete = computed(() => state.value.error || [
  ...requirements.value, ...unlocks.value, ...faqs.value,
  ...["overview", "overview-detail", "ladder", "promotion", "stepwise", "protection", "rewards"].map(id => s(id)),
  ...(content.value.example ? [...phases.value, ...results.value, ...["example", "example-start", "example-trigger", "example-results"].map(id => s(id))] : []),
].some(section => !section.available));
const statusText = computed(() => state.value.loading ? content.value.copy.loading : content.value.copy.unavailable);
function reload() { void resource.load(locale.code); }
function goBack() { navBack("/pages/team/rank"); }
onShow(reload);
watch(() => locale.code, reload);
onUnmounted(resource.dispose);

// Preserve the 5174 shared how-page scale and violet section identity.
const bodyStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65, overflowWrap: "anywhere" };
const captionStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.6 };
const ladderVStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", width: "28px", flexShrink: 0 };
const ladderTitleStyle: CSSProperties = { fontSize: "12px", color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)", fontWeight: 500, overflowWrap: "anywhere" };
const unavailableStyle: CSSProperties = { padding: "14px", background: "var(--v5-surface-2)" };
const retryStyle: CSSProperties = { marginTop: "8px", color: "var(--v5-brand)", background: "var(--v5-surface-2)" };
const reqCardStyle: CSSProperties = { background: "var(--v5-surface-2)", padding: "10px 12px" };
const reqLabelStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-brand)" };
const reqBodyStyle: CSSProperties = { marginTop: "5px", fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.62, overflowWrap: "anywhere" };
const startCardStyle: CSSProperties = { marginTop: "14px", background: "var(--v5-surface-2)", padding: "12px 14px" };
const startLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-brand-2)", marginBottom: "4px" };
const unlockResultCardStyle: CSSProperties = { marginTop: "8px", borderRadius: "12px", background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)", borderColor: "color-mix(in srgb, var(--v5-brand-2) 30%, transparent)", padding: "12px" };
const unlockResultLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-brand-2)", marginBottom: "6px" };
const unlockResultItemStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.5 };
const ctaStyle: CSSProperties = { gap: "8px", height: "48px", borderRadius: "999px", background: "var(--v5-brand)" };
const ctaTextStyle: CSSProperties = { color: "var(--v5-on-brand)", fontSize: "15px", fontWeight: 600 };
</script>
