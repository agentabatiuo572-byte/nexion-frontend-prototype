<template>
  <view class="daily-check-in-row" data-home-section="check-in">
    <view class="daily-check-in-row__flame" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3.5 5 5 5 9.5A5 5 0 0 1 7 12.5C7 10 9 8.5 9 6.5 10.5 7.5 11 9 11 9s1-2.5 1-6z" /></svg></view>
    <view class="daily-check-in-row__copy">
      <text class="daily-check-in-row__title">{{ ready ? fmt(copy.streak, { n: faucet.signInStreak }) : copy.daily }}</text>
      <text class="daily-check-in-row__meta">{{ rewardHint }}<text v-if="milestoneHint" class="daily-check-in-row__gift-hint"> · {{ milestoneHint }}</text></text>

    </view>
    <NxButton class="daily-check-in-row__action" :class="{ 'daily-check-in-row__action--checked': checked }" variant="primary" :label="checkInLabel" size="medium" :busy="submitting" @click="checkIn">
      <svg v-if="checked" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m5 12 5 5 9-10" /></svg>
      <text v-else>{{ checkInLabel }}</text>
    </NxButton>
    <view v-if="ready" class="daily-check-in-row__days" :style="{ gridTemplateColumns: dayColumns }"><view v-for="day in days" :key="day.n" :aria-label="fmt(copy.day,{n:day.n}) + (day.today ? ' · ' + copy.today : '') + (day.done ? ' · ' + copy.checkedIn : '') + (day.gift ? ' · ' + giftText(day.gift) : '')" :class="{ filled: day.done, today: day.today, gift: !!day.gift && !day.today && !day.done }"><svg v-if="day.gift && !day.today && !day.done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg><svg v-else-if="day.done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg><text v-else class="day-mark" aria-hidden="true">{{ day.today ? '+' + (dailyBaseReward(faucet.remoteRules) ?? '•') : '·' }}</text><text>{{ day.today ? copy.today : day.gift && !day.done && day.gift.rewardType !== 'BADGE' ? '+' + day.gift.rewardAmount : day.n }}</text></view></view>
    <view v-else class="daily-check-in-row__days" :aria-busy="faucet.remoteReadState === 'idle' || faucet.remoteReadState === 'loading' ? 'true' : 'false'" :aria-label="copy.viewDaily"><view v-for="n in 7" :key="n" aria-hidden="true"><text class="day-mark">—</text></view></view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { onShow, onHide } from '@/composables/use-tab-page-lifecycle';
import { useNexFaucet } from '@/store/nex-faucet';
import { useApp } from '@/store/app';
import { remoteApiEnabled } from '@/api/runtime';
import { navTo } from '@/lib/route';
import { fmt } from '@/i18n/format';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { continuityCopy } from '@/i18n/continuity-fixes';
import { toast } from '@/store/ui';
import { dailyCheckInSuccessCopy } from '@/pages/daily/daily-success-copy';
import { dailyBaseReward, dailyMilestoneRewardText, dailyRewardLabels } from '@/pages/daily/daily-reward-view';
import type { CanonicalDailyMilestone } from '@/api/points-api';
import NxButton from '@/components/ui/nx-button.vue';
const faucet = useNexFaucet(), app = useApp(), copy = useAuditUiCopy(), t = useT();
const locale = useLocaleStore();
const submitting = ref(false);
let visible = true, visit = 0;
const ready = computed(() => remoteApiEnabled && (faucet.remoteReadState === 'ready'
  || (['loading','error'].includes(faucet.remoteReadState) && faucet.remoteHasSnapshot)));
const checked = computed(() => ready.value && faucet.remoteCheckedInToday);
const rewardHint = computed(() => {
  if (faucet.remoteReadState === 'error') return t.value.daily.checkInUnconfirmed;
  if (!ready.value) return copy.value.viewDaily;
  const base = dailyBaseReward(faucet.remoteRules);
  if (checked.value) return base === null ? copy.value.tomorrow
    : fmt(continuityCopy(locale.code).tomorrowBaseReward, { n: base });
  return base === null ? copy.value.viewDaily : fmt(copy.value.todayReward, { n: base });
});
const checkInLabel = computed(() => faucet.remoteReadState === 'error' ? copy.value.viewDaily : checked.value ? copy.value.checkedIn : copy.value.checkIn);
const days = computed(() => {
  const streak = faucet.signInStreak, current = Math.max(1, streak + (checked.value ? 0 : 1));
  const start = Math.floor((current - 1) / 7) * 7;
  return Array.from({ length: 7 }, (_, i) => ({ n: start + i + 1, done: start + i + 1 <= streak, today: start + i + 1 === current, gift: faucet.remoteMilestones?.find(m=>m.milestoneDay===start+i+1&&m.status!=='CLAIMED') }));
});
function giftText(gift:CanonicalDailyMilestone){return dailyMilestoneRewardText(gift,dailyRewardLabels(t.value.daily.milestones));}
// Keep the complete Vietnamese day label on one line without shrinking all
// seven labels. The other dates share the remaining space in the same row.
const dayColumns = computed(() => days.value.map(day => day.today && locale.code === 'vi' ? 'minmax(52px,1.5fr)' : 'minmax(0,1fr)').join(' '));
const milestoneHint=computed(()=>{if(!ready.value)return '';const gift=days.value.find(day=>day.gift)?.gift;return gift?fmt(t.value.daily.milestones.dayLabel,{n:gift.milestoneDay})+' '+giftText(gift):'';});
function refresh() { if (visible && remoteApiEnabled) void faucet.ensureRemote(10_000); }
onMounted(refresh);
onShow(() => { visible = true; refresh(); });
onHide(() => { visible = false; visit++; });
onUnmounted(() => { visible = false; visit++; });
watch(() => [app.accountKey, app.accountBindingEpoch], refresh);
async function checkIn() {
  if (submitting.value || !visible) return;
  if (faucet.remoteReadState !== 'ready' || checked.value) { navTo('/pages/daily/daily'); return; }
  const scope = `${app.accountKey}:${app.accountBindingEpoch}:${visit}`;
  submitting.value = true;
  try {
    const result = await faucet.checkInRemote();
    if (!visible || scope !== `${app.accountKey}:${app.accountBindingEpoch}:${visit}`) return;
    if (result.ok) { const message = dailyCheckInSuccessCopy(result, t.value.daily); toast.success(message.title, message.body); }
    else { toast.error(result.reason === 'B1_COVERAGE_BELOW_REDLINE' ? t.value.binary.blockReasons.COVERAGE_BELOW_REDLINE : result.reason === 'B1_COVERAGE_DATA_UNAVAILABLE' ? t.value.binary.blockReasons.B1_COVERAGE_UNRELIABLE : t.value.authOtp.errorServiceUnavailable); }
  } finally { submitting.value = false; }
}
</script>
<style scoped>
.daily-check-in-row { display: grid; grid-template-columns: 40px minmax(0,1fr) auto; align-items: center; gap: 0 12px; padding: 14px 14px 14px 16px; border:1px solid var(--v5-border); border-radius: 22px; background: radial-gradient(55% 90% at 100% 0,color-mix(in srgb,var(--v5-brand) 13%,transparent),transparent 62%),var(--v5-surface); }
.daily-check-in-row__flame { display:grid;place-items:center;width:40px;height:40px;border-radius:14px;background:linear-gradient(160deg,color-mix(in srgb,var(--v5-brand) 30%,transparent),color-mix(in srgb,var(--v5-brand) 8%,transparent));color:var(--ui-lime-soft);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--ui-lime-pale) 35%,transparent); }
.daily-check-in-row :deep(.nx-button) { min-height:44px;min-width:44px;padding:2px 0;font-size:14px;box-sizing:border-box; }
.daily-check-in-row :deep(.nx-button__surface) { min-height:40px;padding:8px 18px;box-shadow:0 6px 18px color-mix(in srgb,var(--v5-brand) 28%,transparent),inset 0 1px 0 rgba(255,255,255,.45); }
.daily-check-in-row :deep(.daily-check-in-row__action) { justify-self:end;align-self:start; }
.daily-check-in-row :deep(.daily-check-in-row__action--checked) { width:44px;height:44px;padding:4px; }
.daily-check-in-row :deep(.daily-check-in-row__action--checked .nx-button__surface) { flex:none;width:36px;min-height:36px;height:36px;padding:0; }
.daily-check-in-row :deep(.daily-check-in-row__action--checked .nx-native-svg) { width:18px;height:18px;max-width:18px;max-height:18px; }
.daily-check-in-row :deep(.daily-check-in-row__action--checked .nx-native-svg svg) { width:100%;height:100%;display:block; }
.daily-check-in-row__copy { min-width: 0; }
.daily-check-in-row__title { display: block; font: 600 var(--ui-type-section)/20px var(--font-v5); }
.daily-check-in-row__meta { display: block; margin-top: 2px; font: 400 12.5px/18px var(--font-v5); color: var(--v5-ink-3); }
.daily-check-in-row__days { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); gap: 6px; grid-column: 1 / -1; margin-top:14px; }
.daily-check-in-row__days > view { display: flex; flex-direction: column; justify-content:center;align-items: center; gap: 2px; height:50px; border-radius: 14px; font: 400 11.5px/14px var(--font-v5); color: var(--v5-ink-3); background: var(--v5-surface-2); }
.daily-check-in-row__days .filled { color: var(--v5-brand); background: color-mix(in srgb,var(--v5-brand) 14%,transparent); }
.daily-check-in-row__days > view { min-width:0; box-sizing:border-box; }
.daily-check-in-row__days text,.daily-check-in-row__days uni-text { white-space:nowrap; text-align:center; }
.daily-check-in-row__days .today { border:1px solid color-mix(in srgb,var(--ui-lime-pale) 60%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--v5-brand) 10%,transparent),0 6px 16px color-mix(in srgb,var(--v5-brand) 18%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--v5-brand) 22%,transparent),color-mix(in srgb,var(--v5-brand) 6%,transparent));color:var(--ui-lime-pale); }
.daily-check-in-row__days .today > text:last-child { font-size:10.5px;line-height:14px; }
.day-mark { font-size: 12px; font-weight: 600; }
.daily-check-in-row__days .gift { color: var(--v5-nex); background: color-mix(in srgb,var(--v5-nex) 12%,transparent); border: 1px solid color-mix(in srgb,var(--v5-nex) 24%,transparent); box-sizing: border-box; }
.daily-check-in-row__gift-hint { display: inline-block; max-width: 100%; color: var(--v5-nex); }
@media(max-width:374px) {
  .daily-check-in-row { gap:0 8px;padding-inline:12px;grid-template-columns:32px minmax(0,1fr) auto;align-items:start; }
  .daily-check-in-row__flame { width:32px;height:32px;border-radius:11px;margin-top:6px; }
  .daily-check-in-row__flame > svg { width:18px;height:18px; }
  .daily-check-in-row__flame :deep(.nx-native-svg) { width:18px;height:18px;max-width:18px;max-height:18px; }
  .daily-check-in-row__flame :deep(.nx-native-svg svg) { width:100%;height:100%;display:block; }
  .daily-check-in-row :deep(.nx-button) { font-size:12px;padding-block:6px;justify-self:end;align-self:start; }
  .daily-check-in-row :deep(.nx-button__surface) { min-height:32px;padding:6px 10px;box-shadow:0 3px 10px color-mix(in srgb,var(--v5-brand) 15%,transparent),inset 0 1px 0 rgba(255,255,255,.45); }
  .daily-check-in-row :deep(.nx-button__content) { gap:4px;white-space:nowrap; }
  .daily-check-in-row :deep(.daily-check-in-row__action--checked) { padding:6px; }
  .daily-check-in-row :deep(.daily-check-in-row__action--checked .nx-button__surface) { width:32px;min-height:32px;height:32px; }
  .daily-check-in-row__title { font-size:var(--ui-type-list-subtitle);line-height:18px; }
  .daily-check-in-row__meta { font-size:11px;line-height:16px; }
  .daily-check-in-row__days { margin-top:12px; }
}
</style>
