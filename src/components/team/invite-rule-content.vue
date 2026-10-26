<template>
  <view class="invite-rules-content" role="status" aria-live="polite" :aria-busy="loading">
    <template v-if="state === 'ready'">
      <text>{{ fmt(copy.inviteRuleAmount, { amount: formatAmount(rewards.snapshot!.inviterRewardNex) }) }}</text>
      <text>{{ fmt(copy.inviteRuleEffective, { date: effectiveDate }) }}</text>
      <text>{{ copy.inviteRuleQualification }}</text>
      <text>{{ copy.inviteRuleSettlement }}</text>
    </template>
    <text v-else>{{ loading ? t.team.rewardLoading : state === 'disabled' ? t.team.referralRewardsDisabled : copy.inviteRuleSummary }}</text>
    <view v-if="state === 'unavailable'" class="invite-rules-retry" role="button" tabindex="0" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">{{ t.network.retry }}</view>
  </view>
</template>
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useConfig } from '@/store/config';
import { useReferralReward } from '@/store/referral-reward';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { formatJoinedDate } from '@/lib/profile-date';

const cfg = useConfig(), rewards = useReferralReward(), locale = useLocaleStore(), t = useT();
const copy = computed(() => teamRedesignCopy(locale.code));
const loading = computed(() => cfg.loading || cfg.configStatus === 'idle' || cfg.configStatus === 'loading' || rewards.loading);
const effectiveTime = computed(() => Date.parse(cfg.config.rewards.effectiveAt ?? ''));
const effectiveDate = computed(() => formatJoinedDate(effectiveTime.value, locale.code));
const state = computed(() => {
  if (loading.value) return 'loading';
  const policy = cfg.config.rewards, snapshot = rewards.snapshot;
  if (cfg.configStatus !== 'ready' || rewards.error || !snapshot || policy.enabled !== snapshot.rewardEnabled) return 'unavailable';
  if (!policy.enabled) return 'disabled';
  if (!Number.isFinite(effectiveTime.value) || !Number.isFinite(snapshot.inviterRewardNex) || snapshot.inviterRewardNex < 0 || policy.inviterReward.nexAmount !== snapshot.inviterRewardNex) return 'unavailable';
  return 'ready';
});
async function retry() {
  if (loading.value) return;
  await Promise.all([cfg.load(), rewards.refresh()]);
}
onMounted(() => {
  void cfg.ensureLoaded();
  if (!rewards.snapshot && !rewards.loading && !rewards.error) void rewards.refresh();
});
</script>
<style scoped>
.invite-rules-content { color: var(--v5-ink-2); font: 400 14px/1.6 var(--font-v5); }
.invite-rules-content > text { display: block; margin-bottom: 12px; }
.invite-rules-retry { min-height: 44px; display: flex; align-items: center; color: var(--v5-brand); }
.invite-rules-retry:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
