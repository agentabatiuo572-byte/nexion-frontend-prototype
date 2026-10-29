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
          <TeamRuleHero kind="growth" :title="guide.headline" :sub="guide.intro" :sections="directory" :nav-label="ruleCopy.contents" data-rank-how="published" />

          <TeamRuleSection anchor="ladder" :title="guide.ladder">
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
          </TeamRuleSection>

          <template v-for="group in ruleGroups" :key="group.id">
            <TeamRuleSection v-if="group.id === 'faq'" :anchor="group.id" :title="group.title" :lead="group.hint" list>
              <TeamRuleSection v-for="(item, index) in group.sections" :key="item.id" :q="item.title" :a="item.body" :initial-open="index === 0" :data-rule-section="item.id" />
            </TeamRuleSection>
            <TeamRuleSection v-else :anchor="group.id" :title="group.title" :lead="group.hint" list>
              <TeamRuleSection v-if="group.id === 'overview' && state.policy?.hero" item :body="state.policy.hero" />
              <TeamRuleSection v-if="group.id === 'steps' && !content.example" item :body="content.copy.noExample" />
              <TeamRuleSection v-for="item in group.sections" :key="item.id" :item="stepNumber(item) === undefined" :n="stepNumber(item)" :title="item.title" :body="item.body" :data-rule-section="item.id" />
            </TeamRuleSection>
          </template>

          <text class="how-authority">{{ guide.authority }}</text>
          <view class="how-rank-link" role="link" tabindex="0" @click="navTo('/pages/team/rank')" @keydown.enter.prevent="navTo('/pages/team/rank')"><text>{{ guide.rankLink }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></view>
        </template>
        <view class="how-footer">
          <NxButton :label="w.ctaBack" variant="secondary" @click="goBack" />
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
import TeamRuleHero from '@/components/team/team-rule-hero.vue';
import TeamRuleSection from '@/components/team/team-rule-section.vue';
import { teamRuleGuideCopy } from '@/components/team/team-rule-guide-copy';
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
const ruleCopy = computed(() => teamRuleGuideCopy(locale.code));
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

const ruleGroups = computed(() => [
  { id: 'overview', title: guide.value.overview, hint: guide.value.overviewHint,
    sections: [s(sectionId.overview), s(sectionId.overviewDetail), s(sectionId.ladder)] },
  { id: 'promotion', title: guide.value.conditions, hint: guide.value.conditionsHint,
    sections: [s(sectionId.promotion), ...requirements.value, s(sectionId.stepwise)] },
  { id: 'steps', title: guide.value.steps, hint: guide.value.stepsHint,
    sections: content.value.example ? [s(sectionId.example), s(sectionId.exampleStart), ...phases.value, s(sectionId.exampleTrigger)] : [] },
  { id: 'rewards', title: guide.value.rewards, hint: guide.value.rewardsHint,
    sections: [s(sectionId.rewards), ...unlocks.value, s(sectionId.protection),
      ...(content.value.example ? [s(sectionId.exampleResults), ...results.value] : [])] },
  { id: 'faq', title: guide.value.faq, hint: guide.value.faqHint, sections: faqs.value },
  ...(extraSections.value.length ? [{ id: 'more', title: guide.value.more, hint: guide.value.moreHint, sections: extraSections.value }] : []),
]);
// Expanded sections with an in-page directory replace the collapsed groups (design system 04.7).
const stepNumber = (item: object) => ("n" in item && typeof item.n === "number" ? item.n : undefined);
const directory = computed(() => [{ id: "ladder", title: guide.value.ladder }, ...ruleGroups.value.map(group => ({ id: group.id, title: group.title }))]);
</script>

<style src="@/components/team/team-rule-type.css"></style>
<style scoped>
.rank-how-page { color: var(--v5-ink); padding-bottom: 28px; }
.how-state { margin: 0 20px; padding: 32px 0; display: flex; flex-direction: column; gap: 16px; color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); }
.how-caption { display: block; color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); overflow-wrap: anywhere; }
.how-ladder-scroll { width: 100%; }
.how-ladder-scroll :deep(.uni-scroll-view) { scrollbar-width: thin; scrollbar-color: var(--v5-border) transparent; }
.how-ladder { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 4px; white-space: normal; }
.how-rank { flex: 0 0 76px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.how-rank__level { display: block; margin-top: 8px; color: var(--v5-ink); font: var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); }
.how-rank__name { display: block; margin-top: 2px; color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); overflow-wrap: anywhere; }
.how-authority { display: block; margin: 16px 20px 0; color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); overflow-wrap: anywhere; }
.how-rank-link { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; margin: 16px 16px 0; padding: 0 16px; box-sizing: border-box; border-radius: var(--ui-radius-surface); background: var(--v5-surface); color: var(--v5-ink); font: 400 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); cursor: pointer; }
.how-rank-link > text { min-width: 0; overflow-wrap: anywhere; }
.how-rank-link > svg { flex: none; color: var(--v5-ink-4); }
.how-footer { margin: 24px 16px 0; }
.how-footer :deep(.nx-button) { width: 100%; box-sizing: border-box; }
.how-rank-link:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
