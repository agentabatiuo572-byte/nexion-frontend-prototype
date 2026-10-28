<template>
  <view class="invite-rules-content" role="status" aria-live="polite" :aria-busy="loading">
    <template v-if="state === 'ready'">
      <text>{{ fmt(copy.inviteRuleAmount, { amount: formatAmount(rulePresentation!.amount) }) }}</text>
      <text>{{ fmt(copy.inviteRuleEffective, { date: effectiveDate }) }}</text>
    </template>
    <text v-else>{{ loading ? t.team.rewardLoading : state === 'disabled' ? t.team.referralRewardsDisabled : copy.inviteRuleSummary }}</text>
    <text>{{ copy.inviteRuleQualification }}</text>
    <text>{{ copy.inviteRuleSettlement }}</text>
    <view v-if="state === 'unavailable'" class="invite-rules-retry" role="button" tabindex="0" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">{{ t.network.retry }}</view>
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
.invite-rules-content { color: var(--v5-ink-2); font: 400 14px/1.6 var(--font-v5); }
.invite-rules-content > text { display: block; margin-bottom: 12px; }
.invite-rules-retry { min-height: 44px; display: flex; align-items: center; color: var(--v5-brand); font: 600 13px/20px var(--font-v5); }
.invite-rules-retry:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
