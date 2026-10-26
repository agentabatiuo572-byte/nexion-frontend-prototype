<template>
  <view v-if="open" class="invite-detail" role="dialog" aria-modal="true" :aria-label="title">
    <view class="invite-detail__mask" @click="emit('close')" />
    <view class="invite-detail__sheet">
      <view class="invite-detail__header"><text>{{ title }}</text><view class="invite-detail__close" role="button" tabindex="0" :aria-label="t.ui.close" @click="emit('close')" @keydown.enter.prevent="emit('close')" @keydown.space.prevent="emit('close')"><LiquidGlass :radius="999" tone="control" /><text>×</text></view></view>
      <view class="invite-detail__body">
        <template v-if="mode === 'rules'">
          <view class="invite-detail__art"><TeamArt kind="invite" :size="104" /></view>
          <InviteRuleContent />
          <NxButton class="invite-detail__support" :label="copy.contactSupport" @click="contactSupport" />
          <NxButton :label="copy.rewardRecords" @click="emit('records')" />
        </template>
        <template v-else>
          <view v-if="rewards.loading || rewards.error || !rewards.snapshot" class="invite-detail__read" role="status" :aria-busy="rewards.loading"><text>{{ rewards.loading ? t.team.rewardLoading : t.team.settlementUnavailable }}</text><NxButton v-if="!rewards.loading" :label="t.network.retry" variant="text" size="medium" @click="rewards.refresh()" /></view>
          <template v-else>
            <view class="invite-detail__total"><text>{{ copy.totalEarned }}</text><text>{{ formatAmount(rewards.snapshot.lifetimeInviterNex) }} UVT</text></view>
            <view class="invite-detail__counts"><text>{{ copy.settled }} {{ rewards.snapshot.settledCount }}</text><text>{{ copy.pending }} {{ rewards.snapshot.pendingCount }}</text></view>
            <text class="invite-detail__caption">{{ copy.recentRewards }}</text>
            <view v-for="row in rewards.snapshot.recentRewards" :key="row.settlementNo" class="invite-detail__record"><view><text>{{ date(row.settledAt) }}</text><text class="invite-detail__muted">{{ referralSettlementStatus(locale.code,row.releaseBucket) }}</text></view><text>+{{ formatAmount(row.amountNex) }} UVT</text></view>
            <text v-if="!rewards.snapshot.recentRewards.length" class="invite-detail__paragraph">{{ t.team.noSettledRewards }}</text>
            <text v-else class="invite-detail__muted">{{ copy.latestRecords }}</text>
          </template>
        </template>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useReferralReward } from '@/store/referral-reward';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { teamRedesignCopy, referralSettlementStatus } from '@/i18n/team-redesign';
import { dateLocale } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { navTo } from '@/lib/route';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
import TeamArt from './team-art.vue';
import InviteRuleContent from './invite-rule-content.vue';
import NxButton from '@/components/ui/nx-button.vue';
import LiquidGlass from '@/components/liquid-glass.vue';
const props = defineProps<{ open: boolean; mode: 'rules' | 'records' }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'records'): void }>();
const t = useT(), locale = useLocaleStore(), rewards = useReferralReward();
const copy = computed(() => teamRedesignCopy(locale.code));
const title = computed(() => props.mode === 'rules' ? copy.value.inviteRules : copy.value.rewardRecords);
function date(value: string) { return new Intl.DateTimeFormat(dateLocale(), { month: 'short', day: 'numeric' }).format(new Date(value)); }
function contactSupport() { emit('close'); navTo('/pages/me/support'); }
useDialogA11y(computed(() => props.open), '.invite-detail', () => emit('close'));
</script>
<style scoped>
.invite-detail { position: fixed; inset: 0; z-index: 8100; color: var(--v5-ink); }
.invite-detail__mask { position: absolute; inset: 0; background: var(--v5-bg-color-mask); }
.invite-detail__sheet { position: absolute; bottom: 0; left: 0; right: 0; box-sizing: border-box; max-height: min(82vh, calc(100vh - var(--nx-overlay-top))); display: flex; flex-direction: column; border-radius: 24px 24px 0 0; background: var(--v5-surface); padding: var(--ui-space-inline) 20px max(calc(env(safe-area-inset-bottom, 0px) + 24px), var(--nx-overlay-bottom)); }
.invite-detail__header { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); flex: 0 0 auto; font: 600 19px/1.4 var(--font-v5); }
.invite-detail__close { position: relative; isolation: isolate; width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 50%; font-size: 24px; }
.invite-detail__close > text { position: relative; z-index: 1; }
.invite-detail__body { min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; padding-top: 16px; font: 400 14px/1.6 var(--font-v5); }
.invite-detail__art { display: flex; justify-content: center; }
.invite-detail__support { margin-bottom:12px; }
.invite-detail__paragraph { display: block; margin-bottom: var(--ui-space-section); color: var(--v5-ink-2); }
.invite-detail__total { display: flex; flex-direction: column; gap: 6px; }
.invite-detail__total > text:last-child { font-size: 28px; font-weight: 600; overflow-wrap: anywhere; }
.invite-detail__counts { display: flex; flex-wrap: wrap; gap: 18px; margin: 14px 0 24px; color: var(--v5-ink-3); }
.invite-detail__caption { display: block; font-weight: 600; }
.invite-detail__record { display: flex; justify-content: space-between; gap: var(--ui-space-inline); padding: var(--ui-space-inset) 0; border-bottom: 1px solid var(--v5-border); }
.invite-detail__record > view { min-width: 0; }
.invite-detail__record > view > text { display: block; }
.invite-detail__record > text { text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.invite-detail__muted { display: block; margin-top: 4px; color: var(--v5-ink-3); font-size: 12px; }
.invite-detail__read { display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 14px; padding: var(--ui-space-row-y) 0 24px; }
.invite-detail [tabindex='0']:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
