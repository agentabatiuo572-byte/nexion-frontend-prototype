<template>
  <view class="daily-check-in-row" data-home-section="check-in">
    <view class="daily-check-in-row__flame" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3.5 5 5 5 9.5A5 5 0 0 1 7 12.5C7 10 9 8.5 9 6.5 10.5 7.5 11 9 11 9s1-2.5 1-6z" /></svg></view>
    <view class="daily-check-in-row__copy">
      <text class="daily-check-in-row__title">{{ ready ? fmt(copy.streak, { n: faucet.signInStreak }) : copy.daily }}</text>
      <text class="daily-check-in-row__meta">{{ ready && dailyBaseReward(faucet.remoteRules) != null ? fmt(copy.todayReward,{n:dailyBaseReward(faucet.remoteRules)!}) : copy.viewDaily }}</text>

    </view>
    <NxButton variant="primary" :label="checkInLabel" size="medium" :busy="submitting" @click="checkIn"><text>{{ checkInLabel }}</text><text v-if="checked" aria-hidden="true">✓</text></NxButton>
    <view v-if="ready" class="daily-check-in-row__days"><view v-for="day in days" :key="day.n" :aria-label="fmt(copy.day,{n:day.n}) + (day.done ? ' · ' + copy.checkedIn : day.today ? ' · ' + copy.today : '')" :class="{ filled: day.done, today: day.today }"><svg v-if="day.done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg><text v-else class="day-mark" aria-hidden="true">{{ day.today ? '+' + (dailyBaseReward(faucet.remoteRules) ?? '•') : '·' }}</text><text>{{ day.today ? copy.today : day.n }}</text></view></view>
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
import { toast } from '@/store/ui';
import { dailyCheckInSuccessCopy } from '@/pages/daily/daily-success-copy';
import { dailyBaseReward } from '@/pages/daily/daily-reward-view';
import NxButton from '@/components/ui/nx-button.vue';
const faucet = useNexFaucet(), app = useApp(), copy = useAuditUiCopy(), t = useT();
const submitting = ref(false);
let visible = true, visit = 0;
const ready = computed(() => remoteApiEnabled && faucet.remoteReadState === 'ready');
const checked = computed(() => ready.value && faucet.remoteCheckedInToday);
const checkInLabel = computed(() => checked.value ? copy.value.checkedIn : copy.value.checkIn);
const days = computed(() => {
  const streak = faucet.signInStreak, current = Math.max(1, streak + (checked.value ? 0 : 1));
  const start = Math.floor((current - 1) / 7) * 7;
  return Array.from({ length: 7 }, (_, i) => ({ n: start + i + 1, done: start + i + 1 <= streak, today: start + i + 1 === current }));
});
function refresh() { if (visible && remoteApiEnabled) void faucet.ensureRemote(); }
onMounted(refresh);
onShow(() => { visible = true; refresh(); });
onHide(() => { visible = false; visit++; });
onUnmounted(() => { visible = false; visit++; });
watch(() => [app.accountKey, app.accountBindingEpoch], refresh);
async function checkIn() {
  if (submitting.value || !visible) return;
  if (!ready.value || checked.value) { navTo('/pages/daily/daily'); return; }
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
.daily-check-in-row :deep(.nx-button) { height:36px;min-height:36px;padding:0 18px;font-size:14px;white-space:nowrap;box-shadow:0 6px 18px rgba(158,220,29,.28),inset 0 1px 0 rgba(255,255,255,.45); }
.daily-check-in-row__copy { min-width: 0; }
.daily-check-in-row__title { display: block; font: 600 15px/20px var(--font-v5); }
.daily-check-in-row__meta { display: block; margin-top: 2px; font: 400 12.5px/18px var(--font-v5); color: var(--v5-ink-3); }
.daily-check-in-row__days { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); gap: 6px; grid-column: 1 / -1; margin-top:14px; }
.daily-check-in-row__days > view { display: flex; flex-direction: column; justify-content:center;align-items: center; gap: 2px; height:50px; border-radius: 14px; font: 400 11.5px/14px var(--font-v5); color: var(--v5-ink-3); background: var(--v5-surface-2); }
.daily-check-in-row__days .filled { color: var(--v5-brand); background: color-mix(in srgb,var(--v5-brand) 14%,transparent); }
.daily-check-in-row__days .today { border:1px solid rgba(200,242,90,.6);box-shadow:0 0 0 3px rgba(158,220,29,.10),0 6px 16px rgba(158,220,29,.18);background:linear-gradient(180deg,rgba(158,220,29,.22),rgba(158,220,29,.06));color:var(--ui-lime-pale); }
.day-mark { font-size: 12px; font-weight: 600; }
@media(max-width:350px) { .daily-check-in-row {gap:0 8px;padding-inline:12px;}.daily-check-in-row :deep(.nx-button) {padding:0 12px;}.daily-check-in-row__title {font-size:14px;} }
</style>
