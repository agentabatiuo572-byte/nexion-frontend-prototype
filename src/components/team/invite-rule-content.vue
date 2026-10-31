<template>
  <view class="invite-rules-content" role="status" aria-live="polite" :aria-busy="loading">
    <view class="invite-rules__overview">
      <view class="invite-rules__summary">
        <template v-if="state === 'ready'">
          <text class="invite-rules__label">{{ copy.inviteRulePerFriend }}</text>
          <text class="invite-rules__amount">{{ formatAmount(rulePresentation!.amount) }} UVT</text>
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
    <text v-if="state === 'ready'" class="invite-rules__note">{{ fmt(copy.inviteRuleEffective, { date: effectiveDate }) }}</text>
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
.invite-rules-content { display: flex; flex-direction: column; gap: 18px; font-family: var(--font-v5); }
.invite-rules__overview { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 20px; background: radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--v5-brand) 14%, transparent), transparent 60%), color-mix(in srgb, var(--v5-ink) 3%, transparent); }
.invite-rules__summary { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; }
.invite-rules__label { display: block; color: var(--v5-ink-2); font: 400 14px/20px var(--font-v5); }
.invite-rules__amount { display: block; color: var(--v5-brand); font: 600 20px/24px var(--font-metric); }
.invite-rules__note { display: block; color: var(--v5-ink-4); font: 400 12px/16px var(--font-v5); }
.invite-rules__art { --team-art-size: 96px; height: 72px; }
/* Numbered steps hang on one line like a timeline. */
.invite-rules__steps { display: flex; flex-direction: column; padding: 4px 0; }
.invite-rules__step { position: relative; display: flex; gap: 14px; padding-bottom: 20px; }
.invite-rules__step:last-child { padding-bottom: 0; }
.invite-rules__step:not(:last-child)::before { content: ""; position: absolute; left: 15px; top: 32px; bottom: 0; width: 2px; background: color-mix(in srgb, var(--v5-brand) 30%, transparent); }
.invite-rules__number { width: 32px; height: 32px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 999px; background: var(--v5-brand); color: var(--v5-on-brand); font: 600 14px/1 var(--font-metric); }
.invite-rules__step-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.invite-rules__step-title { display: block; color: var(--v5-ink); font: 600 15px/32px var(--font-v5); }
.invite-rules__step-body { display: block; margin-top: -4px; color: var(--v5-ink-3); font: 400 13px/20px var(--font-v5); }
.invite-rules-retry { min-height: 44px; display: flex; align-items: center; color: var(--v5-brand); font: 600 13px/20px var(--font-v5); }
.invite-rules-retry:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
