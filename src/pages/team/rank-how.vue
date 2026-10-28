<template>
  <AppChassis active="team">
    <view class="rank-how-page">
      <SubPageHeader back="/pages/team/rank" :title="guide.pageTitle" plain design />
      <view class="rank-how-content">
        <view v-if="state.loading && !state.policy" class="how-state" role="status" aria-live="polite" aria-busy="true"><text>{{ statusText }}</text></view>
        <view v-else-if="state.error || incomplete" class="how-state" :role="state.error ? 'alert' : 'status'">
          <text>{{ statusText }}</text>
          <NxButton class="nx-retry-action" :label="content.copy.retry" variant="text" @click="reload" />
        </view>
        <template v-else>
          <view class="how-hero" data-rank-how="published">
            <view class="how-hero__heading">
              <view class="how-hero__copy"><text class="how-headline">{{ guide.headline }}</text></view>
              <TeamArt kind="growth" :size="64" />
            </view>
            <text class="how-intro">{{ guide.intro }}</text>
          </view>

          <view class="how-ladder-section">
            <text class="how-section-title">{{ guide.ladder }}</text>
            <scroll-view v-if="content.ladder.length" scroll-x class="how-ladder-scroll">
              <view class="how-ladder">
                <view v-for="rank in content.ladder" :key="rank.v" class="how-rank">
                  <VBadgeIcon :v="rank.v" :size="56" />
                  <text class="how-rank__level">V{{ rank.v }}</text>
                  <text v-if="rankName(rank, locale.code)" class="how-rank__name">{{ rankName(rank, locale.code) }}</text>
                </view>
              </view>
            </scroll-view>
            <text v-else class="how-caption">{{ content.copy.emptyLadder }}</text>
            <text v-if="content.ladder.length" class="how-caption how-ladder-hint">{{ guide.ladderHint }}</text>
          </view>

          <view class="how-guide-heading">
            <text class="how-section-title">{{ guide.rules }}</text>
            <text class="how-caption how-authority">{{ guide.authority }}</text>
            <view class="how-expand-all" role="button" tabindex="0" :aria-expanded="allRulesOpen" aria-controls="how-rules" @click="toggleAllRules" @keydown.enter.prevent="toggleAllRules" @keydown.space.prevent="toggleAllRules">
              <text>{{ allRulesOpen ? guide.collapseAll : guide.expandAll }}</text>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path :d="allRulesOpen ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'" /></svg>
            </view>
          </view>
          <view id="how-rules" class="how-rules">
            <view v-for="group in ruleGroups" :key="group.id" class="how-rule" :class="{ 'how-rule--open': openRules.includes(group.id) }">
              <view class="how-rule__toggle" role="button" tabindex="0" :aria-label="group.title" :aria-expanded="openRules.includes(group.id)" :aria-controls="`rule-${group.id}`" @click="toggleRule(group.id)" @keydown.enter.prevent="toggleRule(group.id)" @keydown.space.prevent="toggleRule(group.id)">
                <TeamArt :kind="group.art" :size="36" />
                <view class="how-rule__heading"><text class="how-rule__title">{{ group.title }}</text><text class="how-rule__hint">{{ group.hint }}</text></view>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" :class="{ 'how-rule__chevron--open': openRules.includes(group.id) }" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
              </view>
              <view :id="`rule-${group.id}`" :hidden="!openRules.includes(group.id)" class="how-rule__panel">
                <view v-if="openRules.includes(group.id)" class="how-rule__body" role="region" :aria-label="group.title">
                  <text v-if="group.id === 'overview'" class="how-body how-published-hero">{{ state.policy?.hero }}</text>
                  <text v-if="group.id === 'steps' && !content.example" class="how-body">{{ content.copy.noExample }}</text>
                  <view v-for="item in group.sections" :key="item.id" class="how-rule-item" :class="{ 'how-step': 'n' in item }" :data-rule-section="item.id">
                    <text v-if="'n' in item" class="how-step__number" aria-hidden="true">{{ item.n }}</text>
                    <view class="how-rule-item__copy"><text class="how-item-title">{{ item.title }}</text><text class="how-body">{{ item.body }}</text></view>
                  </view>
                </view>
              </view>
            </view>
          </view>
          <view class="how-rank-link" role="link" tabindex="0" @click="navTo('/pages/team/rank')" @keydown.enter.prevent="navTo('/pages/team/rank')"><text>{{ guide.rankLink }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></view>
        </template>
        <view class="how-footer">
          <NxButton :label="w.ctaBack" variant="secondary" @click="goBack"><text>{{ w.ctaBack }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NxButton>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import TeamArt from '@/components/team/team-art.vue';
import NxButton from '@/components/ui/nx-button.vue';
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from '@/store/app';
import { useAuth } from '@/store/auth';
import { captureAccountScope, isCurrentAccountScope } from '@/lib/account-scope';
import { useLocaleStore } from "@/store/locale";
import { navBack, navTo } from "@/lib/route";
import { apiClient, apiRuntimeConfig, expectedApiEnvironment, vRankApi } from "@/api/runtime";
import { createRankHowPolicyApi } from "@/api/rank-how-policy-api";
import { buildRankHowContent, createRankHowResource, type RankHowResourceState } from "@/lib/rank-how-content";
import { rankName } from "@/lib/v-rank-copy";
import { rankGuideCopy } from '@/i18n/rank-guide-copy';

const t = useT();
const w = computed(() => t.value.rankHowItWorks);
const locale = useLocaleStore();
const guide = computed(() => rankGuideCopy(locale.code));
const app = useApp();
const auth = useAuth();
const readEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const environmentCurrent = () => !environmentInvalidated && readEnvironment[0] === apiRuntimeConfig.environment && readEnvironment[1] === apiRuntimeConfig.baseUrl;
const state = ref<RankHowResourceState>({ loading: true, error: false, policy: null, ranks: [], capabilities: { peer: false, genesis: false } });
const policyApi = createRankHowPolicyApi(apiClient, expectedApiEnvironment);
let resourceOwner = captureAccountScope();
function makeResource() {
  const owner = captureAccountScope(), language = locale.code;
  resourceOwner = owner;
  return createRankHowResource({ published: policyApi.published, ladder: vRankApi.ladder, apply: value => {
    if (!isCurrentAccountScope(owner) || language !== locale.code || !environmentCurrent()) return;
    state.value = value.loading && state.value.policy ? { ...state.value, loading: true, error: false } : value;
  } });
}
let resource = makeResource();
const content = computed(() => buildRankHowContent(state.value.policy, state.value.ranks, state.value.capabilities, locale.code, t.value.rank.cond));
const s = (id: string, fallbackTitle?: string) => content.value.section(id, fallbackTitle);
const sectionId = {
  overview: "overview", overviewDetail: "overview-detail", ladder: "ladder", promotion: "promotion",
  stepwise: "stepwise", protection: "protection", rewards: "rewards", example: "example",
  exampleStart: "example-start", exampleTrigger: "example-trigger", exampleResults: "example-results",
} as const;
const requirements = computed(() => ["requirement-self", "requirement-direct", "requirement-team", "requirement-legs"].map(id => s(id)));
const unlocks = computed(() => ["network", "peer", "leadership", "cultivation"].map(name => s(`unlock-${name}`)));
const phases = computed(() => ["self", "team", "legs"].map((name, index) => ({ ...s(`example-${name}`), n: index + 1 })));
const results = computed(() => ["network", "peer", "leadership", "cultivation"].map(name => s(`result-${name}`)));
const faqs = computed(() => ["members", "rank", "rewards"].map(name => s(`faq-${name}`)));
// Preserve additional published sections instead of silently dropping new rules.
const extraSections = computed(() => {
  const known = new Set([
    ...Object.values(sectionId), ...requirements.value.map(item => item.id), ...unlocks.value.map(item => item.id),
    ...phases.value.map(item => item.id), ...results.value.map(item => item.id), ...faqs.value.map(item => item.id),
  ]);
  return (state.value.policy?.sections ?? []).filter(item => !known.has(item.id)).map(item => s(item.id));
});
const incomplete = computed(() => state.value.error || [
  ...requirements.value, ...unlocks.value, ...faqs.value, ...extraSections.value,
  ...["overview", "overview-detail", "ladder", "promotion", "stepwise", "protection", "rewards"].map(id => s(id)),
  ...(content.value.example ? [...phases.value, ...results.value, ...["example", "example-start", "example-trigger", "example-results"].map(id => s(id))] : []),
].some(section => !section.available));
const statusText = computed(() => state.value.loading ? content.value.copy.loading : content.value.copy.unavailable);
function reload() {
  if (!isCurrentAccountScope(resourceOwner)) { resource.dispose(); resource = makeResource(); }
  if (environmentCurrent() && auth.isAuthenticated) void resource.load(locale.code);
}
function goBack() { navBack("/pages/team/rank"); }
onShow(reload);
onHide(() => { resource.dispose(); resource = makeResource(); });
const resourceInputs = () => [app.accountKey, app.accountBindingEpoch, auth.isAuthenticated, locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
watch(resourceInputs, () => {
  resource.dispose(); state.value = { loading: true, error: false, policy: null, ranks: [], capabilities: { peer: false, genesis: false } }; resource = makeResource();
}, { flush: 'sync' });
// Clear old content synchronously, then read after completeSignIn has rebound
// both app state and account-scoped stores. reload recaptures that final owner.
watch(resourceInputs, reload);
onUnmounted(() => resource.dispose());

const openRules = ref<string[]>([]);
const ruleGroups = computed(() => [
  { id: 'overview', title: guide.value.overview, hint: guide.value.overviewHint, art: 'ledger' as const,
    sections: [s(sectionId.overview), s(sectionId.overviewDetail), s(sectionId.ladder)] },
  { id: 'promotion', title: guide.value.conditions, hint: guide.value.conditionsHint, art: 'balance' as const,
    sections: [s(sectionId.promotion), ...requirements.value, s(sectionId.stepwise)] },
  { id: 'steps', title: guide.value.steps, hint: guide.value.stepsHint, art: 'growth' as const,
    sections: content.value.example ? [s(sectionId.example), s(sectionId.exampleStart), ...phases.value, s(sectionId.exampleTrigger)] : [] },
  { id: 'rewards', title: guide.value.rewards, hint: guide.value.rewardsHint, art: 'gift' as const,
    sections: [s(sectionId.rewards), ...unlocks.value, s(sectionId.protection),
      ...(content.value.example ? [s(sectionId.exampleResults), ...results.value] : [])] },
  { id: 'faq', title: guide.value.faq, hint: guide.value.faqHint, art: 'spark' as const, sections: faqs.value },
  ...(extraSections.value.length ? [{ id: 'more', title: guide.value.more, hint: guide.value.moreHint,
    art: 'ledger' as const, sections: extraSections.value }] : []),
]);
const allRulesOpen = computed(() => ruleGroups.value.every(group => openRules.value.includes(group.id)));
function toggleRule(id: string) {
  openRules.value = openRules.value.includes(id) ? openRules.value.filter(open => open !== id) : [...openRules.value, id];
}
function toggleAllRules() { openRules.value = allRulesOpen.value ? [] : ruleGroups.value.map(group => group.id); }
</script>

<style src="@/components/team/team-rule-type.css"></style>
<style scoped>
.rank-how-page { color:var(--v5-ink);padding-bottom:28px; }
.rank-how-content { padding:0 20px; }
.how-hero { padding:12px 0 20px; }
.how-hero__heading { display:flex;align-items:center;gap:12px; }
.how-hero__heading :deep(.team-art) { --team-art-size:var(--team-guide-art-size); }
.how-hero__copy { flex:1;min-width:0; }
.how-headline { display:block;font:600 var(--team-guide-hero)/var(--team-guide-hero-lh) var(--font-v5);text-wrap:balance;overflow-wrap:anywhere; }
.how-intro { display:block;margin-top:12px;font:400 var(--team-guide-body)/var(--team-guide-body-lh) var(--font-v5);color:var(--v5-ink-2);text-wrap:pretty;overflow-wrap:anywhere; }
.how-body { display:block;margin-top:8px;font:400 var(--team-guide-body)/var(--team-guide-body-lh) var(--font-v5);color:var(--v5-ink-2);white-space:pre-line;text-wrap:pretty;overflow-wrap:anywhere; }
.how-caption { display:block;margin-top:8px;font:400 var(--team-guide-caption)/var(--team-guide-caption-lh) var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.how-section-title { display:block;font:600 var(--team-guide-heading)/var(--team-guide-heading-lh) var(--font-v5);text-wrap:balance;overflow-wrap:anywhere; }
.how-ladder-section { padding:18px 16px 14px;border-radius:16px;background:var(--v5-surface); }
.how-ladder-scroll { width:100%;margin-top:16px; }
.how-ladder-scroll :deep(.uni-scroll-view) { scrollbar-width:thin;scrollbar-color:var(--v5-border) transparent; }
.how-ladder { display:flex;align-items:flex-start;gap:16px;padding-bottom:8px; }
.how-rank { flex:0 0 76px;display:flex;flex-direction:column;align-items:center;text-align:center; }
.how-rank__level { display:block;margin-top:8px;font:600 var(--team-guide-heading)/var(--team-guide-heading-lh) var(--font-v5); }
.how-rank__name { display:block;margin-top:4px;font:400 var(--team-guide-caption)/var(--team-guide-caption-lh) var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.how-ladder-hint { margin-top:12px; }
.how-guide-heading { margin-top:24px; }
.how-authority { max-width:65ch; }
.how-expand-all { display:flex;align-items:center;gap:8px;width:fit-content;max-width:100%;min-height:44px;margin-top:4px;font:500 13px/1.5 var(--font-v5);color:var(--v5-brand);cursor:pointer; }
.how-expand-all > text { min-width:0;overflow-wrap:anywhere; }
.how-expand-all > svg { flex:none; }
.how-rules { border-top:1px solid var(--v5-border); }
.how-rule { border-bottom:1px solid var(--v5-border); }
.how-rule__toggle { display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 0;box-sizing:border-box;cursor:pointer; }
.how-rule__heading { flex:1;min-width:0; }
.how-rule__title { display:block;font:600 var(--team-guide-heading)/var(--team-guide-heading-lh) var(--font-v5);text-wrap:balance;overflow-wrap:anywhere; }
.how-rule__hint { display:block;margin-top:4px;font:400 var(--team-guide-caption)/var(--team-guide-caption-lh) var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.how-rule__toggle svg { flex:none;transition:transform .18s;color:var(--v5-ink-3); }
.how-rule__chevron--open { transform:rotate(90deg); }
.how-rule--open .how-rule__title { color:var(--v5-brand); }
.how-rule__panel[hidden] { display:none; }
.how-rule__body { padding:4px 0 20px; }
.how-published-hero { margin-top:0;margin-bottom:16px; }
.how-rule-item + .how-rule-item { margin-top:16px; }
.how-rule-item__copy { flex:1;min-width:0; }
.how-item-title { display:block;font:600 var(--team-guide-heading)/var(--team-guide-heading-lh) var(--font-v5);color:var(--v5-ink);text-wrap:balance;overflow-wrap:anywhere; }
.how-step { display:flex;align-items:flex-start;gap:12px; }
.how-step__number { display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:50%;background:var(--v5-brand-soft);font:600 13px/1.4 var(--font-v5);color:var(--v5-brand); }
.how-step .how-item-title { padding-top:3px; }
.how-rank-link { display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:12px 0;margin-top:12px;font:500 13px/1.5 var(--font-v5);color:var(--v5-brand);cursor:pointer; }
.how-rank-link > text { min-width:0;overflow-wrap:anywhere; }
.how-rank-link > svg { flex:none; }
.how-state { padding:32px 0;display:flex;flex-direction:column;gap:16px;font-size:var(--team-guide-body);line-height:var(--team-guide-body-lh);color:var(--v5-ink-2); }
.how-footer { margin-top:16px; }
.how-footer :deep(.nx-button) { width:100%;box-sizing:border-box; }
.how-rule__toggle:focus-visible,.how-expand-all:focus-visible,.how-rank-link:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
.how-rule__toggle:active,.how-expand-all:active,.how-rank-link:active { opacity:.75; }
@media(max-width:339px) { .rank-how-content { padding-inline:16px; }.how-ladder-section { padding-inline:12px; } }
@media(prefers-reduced-motion:reduce) { .how-rule__toggle svg { transition:none; } }
</style>
