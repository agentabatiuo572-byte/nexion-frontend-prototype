<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader :title="t.headerTitles.teamCommissions + t.headerTitles.howItWorksSuffix" back="/pages/team/commissions" />

      <HowHero v-if="!state.error && !content.incomplete" kind="ledger" :title="s(sectionId.hero).title" :sub="s(sectionId.hero).body" :sections="directory" :nav-label="guideCopy.contents" />

      <view v-if="(state.loading && !state.snapshot) || state.error || content.incomplete" class="commission-guide-state" aria-live="polite">
        <text class="block">{{ state.loading ? content.copy.loading : content.copy.unavailable }}</text>
        <view v-if="!state.loading" role="button" tabindex="0" class="nx-card-recovery-action" @click="reload" @keydown.enter.prevent="reload" @keydown.space.prevent="reload"><text>{{ content.copy.retry }}</text></view>
      </view>

      <template v-if="!state.error && !content.incomplete">
        <HowSection anchor="overview" :title="s(sectionId.overview).title" :body="s(sectionId.overview).body" />

        <HowSection anchor="channels" :title="s(sectionId.channels).title" :lead="s(sectionId.channels).body" list>
          <HowItem v-for="(item, index) in channels" :key="item.id" :n="index + 1" :title="item.title" :body="item.body" />
        </HowSection>

        <HowSection anchor="lifecycle" :title="s(sectionId.lifecycle).title" :lead="s(sectionId.lifecycle).body" list>
          <view class="commission-guide-statuses">
            <template v-for="(status, index) in statuses" :key="status.id">
              <view class="commission-guide-status__tag" :class="{ 'commission-guide-status--next': index > 0 }"><NxTag :tone="status.tone">{{ status.title }}</NxTag></view>
              <text class="commission-guide-status__body" :class="{ 'commission-guide-status--next': index > 0 }">{{ status.body }}</text>
            </template>
          </view>
          <HowNote tone="note" :title="s(sectionId.coolingNote).title" :body="s(sectionId.coolingNote).body" />
        </HowSection>

        <HowSection anchor="example" :title="s(sectionId.example).title" :lead="s(sectionId.example).body">
          <view class="commission-guide-example">
            <view class="commission-guide-example__base">
              <view class="commission-guide-example__row"><text class="commission-guide-example__label">{{ s(sectionId.exampleDay).title }}</text><text v-if="exampleBase.amount" class="commission-guide-example__base-value">{{ exampleBase.amount }}</text></view>
              <text v-if="exampleBase.note" class="commission-guide-example__detail">{{ exampleBase.note }}</text>
            </view>
            <view v-for="row in exampleRows" :key="row.id" class="commission-guide-example__row">
              <view class="commission-guide-example__name"><text class="commission-guide-example__label">{{ row.label }}</text><text v-if="row.detail" class="commission-guide-example__detail">{{ row.detail }}</text></view>
              <text class="commission-guide-example__value" :style="{ color: row.color }">{{ row.amount }}</text>
            </view>
            <view class="commission-guide-example__row commission-guide-example__total">
              <text class="commission-guide-example__label">{{ s(sectionId.exampleTotal).title }}</text>
              <text class="commission-guide-example__total-value">{{ content.exampleTotal }}</text>
            </view>
            <text class="commission-guide-example__note">{{ s(sectionId.exampleNote).body }}</text>
          </view>
        </HowSection>

        <HowSection anchor="faq" :title="s(sectionId.faq).title" list>
          <HowFaqRow :q="s(sectionId.faqOrder).title" :a="s(sectionId.faqOrder).body" initial-open />
          <HowFaqRow :q="s(sectionId.faqWithdraw).title" :a="s(sectionId.faqWithdraw).body" />
          <HowFaqRow :q="s(sectionId.faqReversal).title" :a="s(sectionId.faqReversal).body" />
          <HowFaqRow :q="s(sectionId.faqCultivation).title" :a="s(sectionId.faqCultivation).body" />
        </HowSection>

        <TeamRuleSection :title="guideCopy.fullText" fold>
          <view v-if="publicationFallback" class="commission-guide-publication-note" role="status"><text>{{ t.howPublished.languageFallback }}</text></view>
          <TeamRuleDocument v-if="publishedBlocks" :blocks="publishedBlocks" compact />
          <view v-else role="status" class="commission-guide-publication-note">
            <text>{{ t.howPublished.unavailableBody }}</text>
            <view class="nx-card-recovery-action" role="button" tabindex="0" @click="reload" @keydown.enter.prevent="reload" @keydown.space.prevent="reload"><text>{{ content.copy.retry }}</text></view>
          </view>
        </TeamRuleSection>

        <text class="commission-guide-footer">{{ s(sectionId.footer).body }}</text>
      </template>

      <view class="mx-4 mt-4">
        <view class="reward-cta reward-cta--wide" role="button" tabindex="0" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack"><text>{{ auditCopy.backCommissions }}</text></view>
      </view>
    </view>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/team/team-rule-hero.vue";
import HowSection from "@/components/team/team-rule-section.vue";
import HowItem from "@/components/team/team-rule-section.vue";
import HowNote from "@/components/team/team-rule-section.vue";
import HowFaqRow from "@/components/team/team-rule-section.vue";
import TeamRuleSection from "@/components/team/team-rule-section.vue";
import NxTag from "@/components/ui/nx-tag.vue";
import TeamRuleDocument from "@/components/team/team-rule-document.vue";
import { teamRuleGuideCopy } from "@/components/team/team-rule-guide-copy";
import { commissionPublishedBlocks } from "@/components/team/team-rule-commission-copy";
import { useT } from "@/i18n/use-t";
import { useApp } from '@/store/app';
import { useAuth } from '@/store/auth';
import { captureAccountScope, isCurrentAccountScope } from '@/lib/account-scope';
import { useLocaleStore } from "@/store/locale";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { apiClient, apiRuntimeConfig, expectedApiEnvironment, howContentApi, vRankApi } from "@/api/runtime";
import { createCommissionGuideApi } from "@/api/commission-guide-api";
import { createDirectReferralApi } from "@/api/direct-referral-api";
import { buildCommissionsHowContent, createCommissionsHowResource, type CommissionsHowState } from "@/lib/commissions-how-content";
import { navBack } from "@/lib/route";

const t = useT();
const locale = useLocaleStore();
const app = useApp();
const auth = useAuth();
const readEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const environmentCurrent = () => !environmentInvalidated && readEnvironment[0] === apiRuntimeConfig.environment && readEnvironment[1] === apiRuntimeConfig.baseUrl;
const auditCopy = computed(() => networkReauditCopy(locale.code));
const guideCopy = computed(() => teamRuleGuideCopy(locale.code));
const state = ref<CommissionsHowState>({ loading: true, error: false, snapshot: null });
const publishedBlocks = computed(() => state.value.snapshot ? commissionPublishedBlocks(state.value.snapshot, locale.code) : null);
const publicationFallback = computed(() => !!state.value.snapshot && state.value.snapshot.document.locale.split(/[-_]/)[0].toLowerCase() !== locale.code.split(/[-_]/)[0].toLowerCase());
const commissionGuideApi = createCommissionGuideApi(apiClient, expectedApiEnvironment);
const directReferralApi = createDirectReferralApi(apiClient, expectedApiEnvironment);
let resourceOwner = captureAccountScope();
function makeResource() {
  const owner = captureAccountScope(), language = locale.code;
  resourceOwner = owner;
  return createCommissionsHowResource({
  async read(language) {
    const [document, directPolicy, guide, ladder] = await Promise.all([
      howContentApi.published("team-commissions-how", language),
      directReferralApi.policy(), commissionGuideApi.read(), vRankApi.ladder(),
    ]);
    return { document, directPolicy, guide, ranks: ladder.ranks };
  },
  apply: next => {
    if (!isCurrentAccountScope(owner) || language !== locale.code || !environmentCurrent()) return;
    state.value = next.loading && state.value.snapshot ? { ...state.value, loading: true, error: false } : next;
  },
});
}
let resource = makeResource();
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
const channels = computed(() => ["network", "binary", "peer", "cultivation", "leadership", "genesis"].map(id => ({
  ...s(id),
})));
// Design system 04.7: a directory of the expanded sections, statuses as semantic chips, and
// example rows named by their published title. A status amount needs no qualifier line.
const directory = computed(() => ["overview", "channels", "lifecycle", "example", "faq"].map(id => ({ id, title: s(id).title })));
const statuses = computed(() => ([["cooling", "warning"], ["unlocked", "success"], ["withdrawn", "neutral"]] as const).map(([id, tone]) => ({ ...s(id), tone })));
// The demo template folds its scope sentence and the order base into one body; split them so
// only the amount takes figure styling. A plain published sentence stays a note.
const exampleBase = computed(() => {
  const body = s(sectionId.exampleDay).body, scope = content.value.copy.exampleScope;
  // The scope ends by introducing the amount ("…基数："); that lead-in moves with the amount.
  return body.startsWith(scope) ? { amount: body.slice(scope.length).trim(), note: scope.replace(/[^。.!?！？]*[:：]\s*$/, "").trim() } : { amount: "", note: body };
});
const exampleRows = computed(() => {
  const copy = content.value.copy;
  const statusAmounts = new Set([copy.pendingAmount, copy.notOpen, copy.notConfigured, copy.unknownAmount]);
  return ([["network", sectionId.exampleNetwork], ["cultivation", sectionId.exampleCultivation], ["peer", sectionId.examplePeer], ["leadership", sectionId.exampleLeadership]] as const).map(([key, id]) => {
    const section = s(id), amount = content.value.amounts[key];
    const color = amount === copy.pendingAmount ? "var(--v5-warning-ink)" : statusAmounts.has(amount) ? "var(--v5-ink-3)" : amount.includes("UVT") ? "var(--v5-nex-ink)" : "var(--v5-ink)";
    return { id, label: section.title, detail: statusAmounts.has(amount) || section.body === amount ? "" : section.body, amount, color };
  });
});
function reload() {
  if (!isCurrentAccountScope(resourceOwner)) { resource.dispose(); resource = makeResource(); }
  if (environmentCurrent() && auth.isAuthenticated) void resource.load(locale.code);
}
onShow(reload);
onHide(() => { resource.dispose(); resource = makeResource(); });
const resourceInputs = () => [app.accountKey, app.accountBindingEpoch, auth.isAuthenticated, locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
watch(resourceInputs, () => {
  resource.dispose(); state.value = { loading: true, error: false, snapshot: null }; resource = makeResource();
}, { flush: 'sync' });
// Revoke the old body immediately; reload captures the owner after account binding settles.
watch(resourceInputs, reload);
onUnmounted(() => resource.dispose());

function goBack() {
  navBack("/pages/team/commissions");
}
</script>
<style scoped>
.commission-guide-state { margin: 16px 16px 0; padding: 18px 0; border-block: 1px solid var(--v5-border); color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); }
/* One grid for all rows so the tag column shares the widest label in every language (04.7). */
.commission-guide-statuses { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; }
.commission-guide-status__tag, .commission-guide-status__body { align-self: stretch; padding: 12px 0; }
.commission-guide-status__tag { padding-right: 12px; }
.commission-guide-status--next { border-top: 1px solid var(--v5-border); }
.commission-guide-status__body { color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); overflow-wrap: anywhere; }
.commission-guide-example { display: flex; flex-direction: column; gap: 12px; white-space: normal; }
.commission-guide-example__base { display: flex; flex-direction: column; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--v5-border); }
.commission-guide-example__base-value { color: var(--v5-ink); font: var(--ui-type-metric-value-weight) var(--ui-type-metric-value)/var(--ui-type-metric-value-lh) var(--font-v5); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.commission-guide-example__row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.commission-guide-example__name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.commission-guide-example__label { color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); overflow-wrap: anywhere; }
.commission-guide-example__detail { color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); overflow-wrap: anywhere; }
.commission-guide-example__value { flex: none; max-width: 52%; font: 500 var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.commission-guide-example__total { padding-top: 12px; border-top: 1px solid var(--v5-border); }
.commission-guide-example__total-value { flex: none; max-width: 60%; color: var(--v5-ink); font: var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); text-align: right; overflow-wrap: anywhere; }
.commission-guide-example__note { color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.commission-guide-publication-note { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding-top: 12px; color: var(--v5-ink-3); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); }
.commission-guide-footer { display: block; margin: 16px 20px 0; color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); overflow-wrap: anywhere; }
</style>
