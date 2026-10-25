<template>
  <AppChassis active="team">
    <view class="rank-how-page">
      <SubPageHeader back="/pages/team/rank" :title="w.heroLabel" plain design />
      <view class="rank-how-content">
        <view v-if="state.loading" class="how-state" role="status" aria-live="polite" aria-busy="true"><text>{{ statusText }}</text></view>
        <view v-else-if="state.error || incomplete" class="how-state" :role="state.error ? 'alert' : 'status'">
          <text>{{ statusText }}</text>
          <NxButton :label="content.copy.retry" variant="secondary" @click="reload" />
        </view>
        <template v-else>
          <view class="how-hero" data-rank-how="published">
            <view class="how-hero__heading"><view class="how-hero__copy"><text class="how-headline">{{ content.copy.headline }}</text><text class="how-body">{{ state.policy?.hero }}</text></view><TeamArt kind="growth" :size="100" /></view>
            <text class="how-body">{{ s(sectionId.overview).body }}</text>
            <text class="how-caption">{{ s(sectionId.overviewDetail).body }}</text>
          </view>

          <view class="how-ladder-section">
            <text class="how-section-title">{{ s(sectionId.ladder, w.s2Title).title }}</text>
            <text class="how-caption">{{ s(sectionId.ladder).body }}</text>
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
          </view>

          <view v-if="content.example" class="how-example">
            <text class="how-section-title">{{ s(sectionId.example, content.copy.example).title }}</text>
            <text class="how-body">{{ s(sectionId.example).body }}</text>
            <text class="how-item-title">{{ s(sectionId.exampleStart).title }}</text><text class="how-caption">{{ s(sectionId.exampleStart).body }}</text>
            <view class="how-steps">
              <view v-for="phase in phases" :key="phase.id" class="how-step">
                <text class="how-step__number">{{ String(phase.n).padStart(2, '0') }}</text>
                <view class="how-step__content"><text class="how-item-title">{{ phase.title }}</text><text class="how-body">{{ phase.body }}</text></view>
              </view>
            </view>
            <text class="how-item-title">{{ s(sectionId.exampleTrigger).title }}</text><text class="how-caption">{{ s(sectionId.exampleTrigger).body }}</text>
          </view>
          <text v-else class="how-caption how-no-example">{{ content.copy.noExample }}</text>

          <view class="how-rules">
            <view v-for="group in ruleGroups" :key="group.id" class="how-rule">
              <view class="how-rule__toggle" role="button" tabindex="0" :aria-label="group.title" :aria-expanded="openRule === group.id" :aria-controls="`rule-${group.id}`" @click="toggleRule(group.id)" @keydown.enter.prevent="toggleRule(group.id)" @keydown.space.prevent="toggleRule(group.id)">
                <TeamArt :kind="group.art" :size="36" /><text>{{ group.title }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" :class="{ 'how-rule__chevron--open': openRule === group.id }" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
              </view>
              <view v-if="openRule === group.id" :id="`rule-${group.id}`" class="how-rule__body" role="region" :aria-label="group.title">
                <template v-if="group.id === 'promotion'">
                  <text class="how-body">{{ s(sectionId.promotion).body }}</text>
                  <view v-for="req in requirements" :key="req.id" class="how-rule-item"><text class="how-item-title">{{ req.title }}</text><text class="how-body">{{ req.body }}</text></view>
                  <view class="how-rule-item"><text class="how-item-title">{{ s(sectionId.stepwise).title }}</text><text class="how-body">{{ s(sectionId.stepwise).body }}</text></view>
                </template>
                <template v-else-if="group.id === 'rewards'">
                  <text class="how-body">{{ s(sectionId.rewards).body }}</text>
                  <view v-for="item in unlocks" :key="item.id" class="how-rule-item"><text class="how-item-title">{{ item.title }}</text><text class="how-body">{{ item.body }}</text></view>
                </template>
                <text v-else-if="group.id === 'protection'" class="how-body">{{ s(sectionId.protection).body }}</text>
                <template v-else-if="group.id === 'example-results'">
                  <text class="how-body">{{ s(sectionId.exampleResults).body }}</text>
                  <view v-for="item in results" :key="item.id" class="how-rule-item"><text class="how-item-title">{{ item.title }}</text><text class="how-body">{{ item.body }}</text></view>
                </template>
                <template v-else-if="group.id === 'faq'"><view v-for="faq in faqs" :key="faq.id" class="how-rule-item"><text class="how-item-title">{{ faq.title }}</text><text class="how-body">{{ faq.body }}</text></view></template>
              </view>
            </view>
          </view>
          <view class="how-rank-link" role="link" tabindex="0" @click="navTo('/pages/team/rank')" @keydown.enter.prevent="navTo('/pages/team/rank')" @keydown.space.prevent="navTo('/pages/team/rank')"><text>{{ rankLinkText }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></view>
        </template>
        <view class="how-footer">
          <NxButton :label="state.loading || incomplete ? t.conversations.back : w.ctaBack" variant="secondary" @click="goBack"><text>{{ state.loading || incomplete ? t.conversations.back : w.ctaBack }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NxButton>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import TeamArt from '@/components/team/team-art.vue';
import NxButton from '@/components/ui/nx-button.vue';
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { navBack, navTo } from "@/lib/route";
import { apiClient, expectedApiEnvironment, vRankApi } from "@/api/runtime";
import { createRankHowPolicyApi } from "@/api/rank-how-policy-api";
import { buildRankHowContent, createRankHowResource, type RankHowResourceState } from "@/lib/rank-how-content";
import { rankName } from "@/lib/v-rank-copy";

const t = useT();
const rankLinkText = computed(() => locale.code === "zh" ? "查看等级条件" : locale.code === "vi" ? "Xem điều kiện hạng" : "View rank requirements");
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
const unlocks = computed(() => ["network", "peer", "leadership", "cultivation"].map((name, index) => ({ ...s(`unlock-${name}`), icon: ["regional", "referral", "holding", "gift"][index] })));
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

const openRule = ref<string | null>('promotion');
const ruleGroups = computed(() => [
  { id: 'promotion', title: s(sectionId.promotion, w.value.s3Title).title, art: 'growth' as const },
  { id: 'rewards', title: s(sectionId.rewards, w.value.s4Title).title, art: 'gift' as const },
  { id: 'protection', title: s(sectionId.protection).title, art: 'balance' as const },
  ...(content.value.example ? [{ id: 'example-results', title: s(sectionId.exampleResults).title, art: 'spark' as const }] : []),
  { id: 'faq', title: w.value.faqTitle, art: 'ledger' as const },
]);
function toggleRule(id: string) { openRule.value = openRule.value === id ? null : id; }
</script>

<style scoped>
.rank-how-page { color:var(--v5-ink);padding-bottom:28px; }.rank-how-content { padding:0 20px; }
.how-hero { padding:var(--ui-space-inline) 0 28px; }.how-hero__heading { display:flex;align-items:center;gap:14px;margin-bottom:var(--ui-space-inset); }.how-hero__copy { flex:1;min-width:0; }
.how-headline { display:block;font:600 25px/1.25 var(--font-v5);letter-spacing:-.02em;overflow-wrap:anywhere; }
.how-body { display:block;margin-top:8px;font:400 13.5px/1.7 var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.how-caption { display:block;margin-top:8px;font:400 12px/1.65 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.how-section-title { display:block;font:600 17px/1.45 var(--font-v5);overflow-wrap:anywhere; }
.how-item-title { display:block;margin-top:var(--ui-space-inline);font:600 14px/1.5 var(--font-v5);overflow-wrap:anywhere; }
.how-ladder-section { padding:22px 0;border-block:1px solid var(--v5-border); }.how-ladder-scroll { width:100%;margin-top:var(--ui-space-inset); }
.how-ladder { display:flex;align-items:flex-start;gap:22px;padding-bottom:8px; }.how-rank { flex:0 0 72px;display:flex;flex-direction:column;align-items:center;text-align:center; }
.how-rank__level { display:block;margin-top:8px;font:600 14px/1.4 var(--font-v5); }.how-rank__name { display:block;margin-top:4px;font:400 11px/1.5 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.how-example { padding:28px 0; }.how-steps { margin-top:24px; }.how-step { position:relative;display:flex;align-items:flex-start;gap:var(--ui-space-inset);padding-bottom:24px; }.how-step:not(:last-child)::before { content:'';position:absolute;left:19px;top:45px;bottom:5px;width:1px;background:var(--v5-border); }
.how-step__number { flex:none;display:grid;place-items:center;width:40px;min-height:40px;border:1px solid var(--v5-border);border-radius:50%;font:500 15px/1.4 var(--font-v5);color:var(--v5-brand); }
.how-step__content { min-width:0;flex:1; }.how-step__content .how-item-title { margin-top:5px; }.how-no-example { padding:24px 0; }
.how-rules { border-top:1px solid var(--v5-border); }.how-rule { border-bottom:1px solid var(--v5-border); }
.how-rule__toggle { display:flex;align-items:center;gap:var(--ui-space-inline);min-height:72px;padding:var(--ui-space-row-y) 0;cursor:pointer; }.how-rule__toggle > text { flex:1;min-width:0;font:600 15px/1.5 var(--font-v5);overflow-wrap:anywhere; }.how-rule__toggle svg { flex:none;transition:transform .18s;color:var(--v5-ink-3); }.how-rule__chevron--open { transform:rotate(90deg); }
.how-rule__body { padding:0 0 24px; }.how-rule-item { padding-top:12px; }.how-rule-item + .how-rule-item { margin-top:8px; }.how-rank-link { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-inline);min-height:48px;padding:var(--ui-space-inline) 0;margin-top:14px;font-size:13px;color:var(--v5-ink-2);cursor:pointer; }
.how-state { padding:36px 0;display:flex;flex-direction:column;gap:var(--ui-space-section);font-size:14px;line-height:1.65;color:var(--v5-ink-2); }.how-footer { margin-top:22px; }.how-footer :deep(.nx-button) { width:100%;box-sizing:border-box; }
.how-rule__toggle:focus-visible,.how-rank-link:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
@media(max-width:350px) { .rank-how-content { padding-inline:16px; }.how-hero__heading { gap:8px; }.how-headline { font-size:22px; } }
@media(prefers-reduced-motion:reduce) { .how-rule__toggle svg { transition:none; } }
</style>
