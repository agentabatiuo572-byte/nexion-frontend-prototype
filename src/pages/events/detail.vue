<template>
  <AppChassis active="home"><view class="event-detail">
    <SubPageHeader back="/pages/events/events?source=legacy" :title="copy.title" />
    <text v-if="loading" class="event-copy" role="status">{{ copy.loading }}</text>
    <view v-else-if="error || !detail" class="nx-glass-card event-section" role="alert">
      <text class="event-copy">{{ copy.unavailable }}</text>
      <view class="event-action" role="button" tabindex="0" @click="load" @keydown.enter.prevent="activate($event, load)" @keydown.space.prevent="activate($event, load)"><text>{{ copy.retry }}</text></view>
    </view>
    <template v-else>
      <view class="nx-glass-card event-section">
        <text class="event-title">{{ detail.event.title }}</text>
        <text class="event-copy">{{ detail.event.subtitle }}</text>
        <text class="event-status" role="status">{{ copy.eligibility[detail.eligibilityReason] }}</text>
        <text v-if="detail.reminderSubscribed" class="event-copy" role="status">{{ reminderCopy.subscribed }}</text>
        <view v-if="detail.event.startsAt" class="event-row"><text>{{ copy.start }}</text><text>{{ displayDeadline(detail.event.startsAt, language) }}</text></view>
        <view v-if="detail.event.endsAt" class="event-row"><text>{{ copy.end }}</text><text>{{ displayDeadline(detail.event.endsAt, language) }}</text></view>
      </view>
      <view v-if="ruleRows.length" class="nx-glass-card event-section">
        <text class="event-heading">{{ copy.rules }}</text>
        <view v-for="row in ruleRows" :key="row.label" class="event-row"><text>{{ row.label }}</text><text>{{ row.value }}</text></view>
      </view>
      <view v-if="detail.rewards.length" class="nx-glass-card event-section">
        <text class="event-heading">{{ copy.rewards }}</text>
        <text v-for="(reward, index) in detail.rewards" :key="index" class="event-copy">{{ eventDetailReward(reward, copy) }}</text>
      </view>
      <view v-if="detail.targetValue > 0" class="nx-glass-card event-section">
        <view class="event-row"><text class="event-heading">{{ copy.progress }}</text><text>{{ formatAmount(detail.progressValue) }} / {{ formatAmount(detail.targetValue) }}</text></view>
        <view class="event-progress" role="progressbar" :aria-label="copy.progress" :aria-valuenow="Math.min(detail.progressValue, detail.targetValue)" :aria-valuemin="0" :aria-valuemax="detail.targetValue"><view :style="{ width: `${Math.min(100, detail.progressValue / detail.targetValue * 100)}%` }" /></view>
      </view>
      <view v-if="detail.results.length || detail.event.state === 'ended'" class="nx-glass-card event-section">
        <text class="event-heading">{{ copy.results }}</text>
        <text v-if="!detail.results.length" class="event-copy">{{ copy.noResults }}</text>
        <view v-for="(result, index) in detail.results" :key="index" class="event-result">
          <view v-if="result.region" class="event-row"><text>{{ copy.region }}</text><text>{{ result.region }}</text></view>
          <view v-if="result.rank != null" class="event-row"><text>{{ copy.rank }}</text><text>{{ result.rank }}</text></view>
          <view v-if="result.volume != null" class="event-row"><text>{{ copy.volume }}</text><text>{{ formatAmount(result.volume) }} USDT</text></view>
          <view v-if="result.rewardAmount != null" class="event-row"><text>{{ copy.prize }}</text><text>{{ formatAmount(result.rewardAmount) }} USDT</text></view>
        </view>
      </view>
      <text v-if="commandError" class="event-copy" role="alert">{{ copy.pending }}</text>
      <view v-if="action" class="event-primary" role="button" :tabindex="busy ? -1 : 0" :aria-disabled="busy" @click="run" @keydown.enter.prevent="activate($event, run)" @keydown.space.prevent="activate($event, run)"><text>{{ busy ? copy.busy : action === 'remind' ? reminderCopy.remind : copy[action] }}</text></view>
      <text v-else-if="detail.event.state === 'ongoing' && detail.enabled" class="event-copy">{{ copy.automatic }}</text>
      <view class="event-action" role="button" :tabindex="busy ? -1 : 0" :aria-disabled="busy" @click="!busy && load()" @keydown.enter.prevent="!busy && activate($event, load)" @keydown.space.prevent="!busy && activate($event, load)"><text>{{ copy.refresh }}</text></view>
    </template>
  </view></AppChassis>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onLoad, onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { apiClient, eventsApi, remoteApiEnabled } from "@/api/runtime";
import { captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { createEventDetailApi, type EventDetail } from "@/api/event-detail-api";
import { useApp } from "@/store/app";
import { useLocaleStore } from "@/store/locale";
import { eventDetailCopy } from "@/i18n/event-detail";
import { eventReminderCopy } from "@/i18n/event-detail";
import { navTo, takeNavigationQuery } from "@/lib/route";
import { displayDeadline } from "@/lib/promotion-display";
import { formatAmount } from "@/lib/amount-display";
import { eventDetailAction, eventDetailRules, eventDetailReward, eventClaimCommandKey, eventDetailHref } from "./event-detail-display";

const app = useApp(), locale = useLocaleStore(), api = createEventDetailApi(apiClient);
const language = computed(() => locale.code === "zh" || locale.code === "vi" ? locale.code : "en");
const copy = computed(() => eventDetailCopy[language.value]);
const reminderCopy = computed(() => eventReminderCopy[language.value]);
const detail = ref<EventDetail | null>(null), loading = ref(true), error = ref(false), busy = ref(false), commandError = ref(false);
const ruleRows = computed(() => eventDetailRules(detail.value?.rules ?? {}, copy.value));
const action = computed(() => detail.value ? eventDetailAction(detail.value) : null);
let code = "", visible = false, generation = 0;
let unconfirmedAction: "join" | "claim" | "remind" | null = null;
const identity = () => `${app.accountKey}:${app.accountBindingEpoch}:${language.value}:${captureRuntimeRevision().epoch}:${code}`;
function reset() { generation += 1; detail.value = null; error.value = false; commandError.value = false; unconfirmedAction = null; busy.value = false; }
async function load() {
  if (!visible) return;
  const request = ++generation, scope = identity();
  loading.value = true; error.value = false; detail.value = null;
  const current = () => visible && generation === request && scope === identity();
  try {
    if (!remoteApiEnabled || !code) throw new Error("EVENT_UNAVAILABLE");
    const value = await api.detail(code, language.value);
    if (current()) {
      detail.value = value;
      if ((unconfirmedAction === "join" && ["JOINED", "CLAIMABLE", "CLAIMED"].includes(value.userStatus)) || (unconfirmedAction === "claim" && value.userStatus === "CLAIMED") || (unconfirmedAction === "remind" && value.reminderSubscribed)) {
        commandError.value = false; unconfirmedAction = null;
      }
    }
  } catch { if (current()) error.value = true; }
  finally { if (current()) loading.value = false; }
}
async function run() {
  if (busy.value || !detail.value || !action.value) return;
  const selectedAction = action.value;
  if (selectedAction === "open") { navTo(eventDetailHref(detail.value)); return; }
  const scope = identity(), request = generation;
  const current = () => visible && request === generation && scope === identity();
  busy.value = true; commandError.value = false;
  try {
    if (selectedAction === "remind") await api.remind(code, `h4-event-reminder:${code}`);
    else await eventsApi[selectedAction](code, selectedAction === "claim" ? eventClaimCommandKey(code, detail.value.claimKeys) : `h4-event-join:${code}`);
    if (current()) { busy.value = false; await load(); }
  } catch {
    if (current()) { busy.value = false; commandError.value = true; unconfirmedAction = selectedAction; await load(); }
  }
}
function activate(event: KeyboardEvent, action: () => unknown) { if (!event.repeat) void action(); }
onLoad(options => { const query = new URLSearchParams(takeNavigationQuery("/pages/events/detail")); code = String(options?.id ?? query.get("id") ?? "").trim(); reset(); if (visible) void load(); });
onShow(() => { visible = true; void load(); });
onHide(() => { visible = false; reset(); });
watch(() => [app.accountKey, app.accountBindingEpoch, language.value], () => { reset(); void load(); });
const unsubscribe = subscribeRuntimeRevision(() => { reset(); void load(); });
onUnmounted(() => { visible = false; reset(); unsubscribe(); });
</script>
<style scoped>
.event-detail { padding:0 16px 28px; color:var(--v5-ink); }
.event-section { margin-top:12px; padding:16px; border-radius:var(--nx-glass-radius); background:var(--nx-glass-fill); box-shadow:var(--nx-glass-edge); }
.event-title { display:block; font-size:20px; font-weight:600; line-height:1.4; overflow-wrap:anywhere; }
.event-heading { display:block; font-size:14px; font-weight:600; }
.event-copy { display:block; margin-top:10px; font-size:13px; line-height:1.6; color:var(--v5-ink-3); white-space:pre-wrap; overflow-wrap:anywhere; }
.event-status { display:block; margin-top:12px; font-size:12px; color:var(--v5-brand); }
.event-row { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:6px 12px; margin-top:12px; font-size:12px; line-height:1.5; }
.event-row > text:last-child { overflow-wrap:anywhere; color:var(--v5-ink-2); }
.event-progress { margin-top:12px; height:5px; border-radius:5px; overflow:hidden; background:var(--v5-brand-soft); }
.event-progress > view { height:100%; background:var(--v5-brand); }
.event-result + .event-result { margin-top:14px; border-top:1px solid var(--v5-border); }
.event-action, .event-primary { display:flex; justify-content:center; margin-top:16px; padding:13px 16px; border-radius:24px; font-size:13px; font-weight:600; color:var(--v5-brand); }
.event-primary { background:var(--v5-brand); color:var(--v5-on-brand); }
</style>
