<template>
  <view class="invite-rules-content" role="status" aria-live="polite" :aria-busy="loading">
    <view class="invite-rules__overview">
      <view class="invite-rules__summary">
        <template v-if="state === 'ready'">
          <text class="invite-rules__label">{{ copy.inviteRulePerFriend }}</text>
          <text class="invite-rules__amount">{{ formatAmount(rulePresentation!.amount) }} UVT</text>
          <text class="invite-rules__note">{{ fmt(copy.inviteRuleEffective, { date: effectiveDate }) }}</text>
        </template>
        <text v-else class="invite-rules__label">{{ loading ? t.team.rewardLoading : state === 'disabled' ? t.team.referralRewardsDisabled : copy.inviteRuleSummary }}</text>
        <view v-if="state === 'unavailable'" class="invite-rules-retry" role="button" tabindex="0" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">{{ t.network.retry }}</view>
      </view>
      <TeamArt v-if="art" class="invite-rules__art" kind="invite" :size="96" />
    </view>
    <view class="invite-rules__steps" role="list">
      <view v-for="(step, index) in copy.inviteRuleSteps" :key="step.title" class="invite-rules__step" role="listitem">
        <text class="invite-rules__number" aria-hidden="true">{{ index + 1 }}</text>
        <view class="invite-rules__step-copy">
          <text class="invite-rules__step-title">{{ step.title }}</text>
          <text class="invite-rules__step-body">{{ step.body }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useApp } from '@/store/app';
import { apiRuntimeConfig, remoteApiEnabled } from '@/api/runtime';
import { useConfig } from '@/store/config';
import { useReferralReward } from '@/store/referral-reward';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { formatDisplayDate } from '@/lib/display-date';
import TeamArt from './team-art.vue';

// `art` shows the invite illustration in the overview card (the rules sheet, not the share sheet's inline rules).
defineProps<{ art?: boolean }>();

const cfg = useConfig(), rewards = useReferralReward(), locale = useLocaleStore(), t = useT();
const copy = computed(() => teamRedesignCopy(locale.code));
const loading = computed(() => cfg.loading || cfg.configStatus === 'idle' || cfg.configStatus === 'loading' || rewards.loading);
const effectiveTime = computed(() => Date.parse(cfg.config.rewards.effectiveAt ?? ''));
const effectiveDate = computed(() => formatDisplayDate(rulePresentation.value?.effectiveAt, locale.code));
const liveState = computed(() => {
  if (rewards.error || cfg.configStatus === 'failed') return 'unavailable';
  if (loading.value) return 'loading';
  const policy = cfg.config.rewards, snapshot = rewards.snapshot;
  if (cfg.configStatus !== 'ready' || rewards.error || !snapshot || policy.enabled !== snapshot.rewardEnabled) return 'unavailable';
  if (!policy.enabled) return 'disabled';
  if (!Number.isFinite(effectiveTime.value) || !Number.isFinite(snapshot.inviterRewardNex) || snapshot.inviterRewardNex < 0 || policy.inviterReward.nexAmount !== snapshot.inviterRewardNex) return 'unavailable';
  return 'ready';
});
// Only this component's validated rule read supplies its presentation.
const app = useApp();
const rulePresentation = ref<{ amount: number; effectiveAt: string; state: 'ready' | 'disabled' } | null>(null);
let environmentInvalidated = false;
watch(() => apiRuntimeConfig?.environment, () => { environmentInvalidated = true; rulePresentation.value = null; }, { flush: 'sync' });
watch(() => [app.accountKey, app.accountBindingEpoch, locale.code], () => { rulePresentation.value = null; }, { flush: 'sync' });
watch([liveState, () => rewards.snapshot, () => cfg.config.rewards.effectiveAt, () => cfg.config.rewards.inviterReward.nexAmount], ([value]) => {
  if (environmentInvalidated) return;
  if (value === 'ready' || value === 'disabled') rulePresentation.value = {
    amount: rewards.snapshot!.inviterRewardNex, effectiveAt: cfg.config.rewards.effectiveAt ?? '', state: value,
  };
  else if (value !== 'loading') rulePresentation.value = null;
}, { immediate: true });
const state = computed(() => environmentInvalidated ? 'unavailable'
  : rulePresentation.value && (loading.value || liveState.value === 'ready' || liveState.value === 'disabled') ? rulePresentation.value.state : liveState.value === 'ready' ? 'unavailable' : liveState.value);
async function retry() {
  if (loading.value) return;
  await Promise.all([cfg.load(), rewards.refresh()]);
}
onMounted(() => {
  void cfg.revalidate();
  if (remoteApiEnabled) void rewards.ensure();
});
</script>
<style scoped>
/* Rule-guide roles (design system 4.7): overview card, then numbered steps. */
.invite-rules-content { display: flex; flex-direction: column; gap: 16px; font-family: var(--font-v5); }
.invite-rules__overview { display: flex; align-items: center; gap: 12px; padding: 20px; border-radius: 20px; background: var(--v5-surface-2); }
.invite-rules__summary { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.invite-rules__label { display: block; color: var(--v5-ink-3); font-size: var(--ui-type-description); line-height: var(--ui-type-description-lh); font-weight: var(--ui-type-description-weight); }
.invite-rules__amount { display: block; color: var(--v5-brand); font-size: var(--ui-type-hero-title); line-height: var(--ui-type-hero-title-lh); font-weight: var(--ui-type-hero-title-weight); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.invite-rules__note { display: block; margin-top: 4px; color: var(--v5-ink-3); font-size: var(--ui-type-note); line-height: var(--ui-type-note-lh); font-weight: var(--ui-type-note-weight); }
.invite-rules__art { --team-art-size: 96px; height: 72px; }
.invite-rules__steps { padding: 4px 20px; border-radius: 20px; background: var(--v5-surface-2); }
.invite-rules__step { display: flex; gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--v5-border); }
.invite-rules__step:last-child { border-bottom: 0; }
.invite-rules__number { width: 24px; height: 24px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 999px; background: var(--v5-brand-soft); color: var(--v5-brand); font-size: 12px; line-height: 16px; font-weight: 500; font-variant-numeric: tabular-nums; }
.invite-rules__step-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.invite-rules__step-title { display: block; color: var(--v5-ink); font-size: var(--ui-type-subheading); line-height: var(--ui-type-subheading-lh); font-weight: var(--ui-type-subheading-weight); }
.invite-rules__step-body { display: block; color: var(--v5-ink-3); font-size: var(--ui-type-description); line-height: var(--ui-type-description-lh); font-weight: var(--ui-type-description-weight); overflow-wrap: anywhere; }
.invite-rules-retry { min-height: 44px; display: flex; align-items: center; color: var(--v5-brand); font: 600 13px/20px var(--font-v5); }
.invite-rules-retry:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
