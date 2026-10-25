<template>
  <view class="promotion promotion-main">
    <PromotionAction role="button" tabindex="0" @click="chooseState" @keydown.enter.prevent="chooseState" @keydown.space.prevent="chooseState"><text>{{ state ? t.promotion[rewardStateKey(state)] : t.promotion.allStates }}</text></PromotionAction>
    <view v-if="(loading || !sessionReady) && !rewards.length" class="promotion-flat" role="status"><text>{{ t.promotion.loading }}</text></view>
    <view v-if="error" class="promotion-flat" role="alert">
      <text class="promotion-title">{{ t.promotion.error }}</text>
      <PromotionAction role="button" tabindex="0" @click="load(true)" @keydown.enter.prevent="load(true)" @keydown.space.prevent="load(true)"><text>{{ t.promotion.retry }}</text></PromotionAction>
    </view>
    <view v-else-if="sessionReady && !loading && !rewards.length" class="promotion-flat">
      <text class="promotion-title">{{ t.promotion.emptyRewards }}</text>
      <text class="promotion-copy">{{ t.promotion.emptyNote }}</text>
      <PromotionAction role="button" tabindex="0" @click="navTo('/store')" @keydown.enter.prevent="navTo('/store')" @keydown.space.prevent="navTo('/store')"><text>{{ t.promotion.buyMore }}</text></PromotionAction>
    </view>
    <view v-if="rewards.length" class="promotion-reward-rows"><RewardRows :rewards="rewards" /></view>
    <PromotionAction v-if="hasMore" role="button" tabindex="0" :aria-disabled="loading" @click="load(false)" @keydown.enter.prevent="load(false)" @keydown.space.prevent="load(false)"><text>{{ t.promotion.more }}</text></PromotionAction>
    <NxSheet :open="stateSheetOpen" :title="t.promotion.allStates" @close="closeStateSheet">
      <view class="reward-state-options" role="group" :aria-label="t.promotion.allStates">
        <view v-for="option in stateOptions" :key="option.value??'all'" class="reward-state-option" role="button" tabindex="0" :aria-pressed="state===option.value" @click="selectState(option.value)" @keydown.enter.prevent="selectState(option.value)" @keydown.space.prevent="selectState(option.value)">
          <text>{{ option.label }}</text><text v-if="state===option.value" aria-hidden="true">✓</text>
        </view>
      </view>
    </NxSheet>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import PromotionAction from "@/components/promotion/promotion-action.vue";
import RewardRows from "@/components/promotion/reward-rows.vue";
import NxSheet from "@/components/ui/nx-sheet.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { promotionApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import type { Reward, RewardState } from "@/api/promotion-api";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { rewardStateKey } from "@/lib/promotion-display";
import { navTo } from "@/lib/route";

const props = withDefaults(defineProps<{ activityId?: string; orderNo?: string }>(), { activityId: "", orderNo: "" });
const t = useT(), app = useApp(), auth = useAuth();
const sessionReady = computed(() => binarySessionReady({
  remote: remoteApiEnabled,
  authenticated: auth.isAuthenticated,
  accountId: auth.accountId,
  appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
const rewards = ref<Reward[]>([]), state = ref<RewardState | null>(null);
const loading = ref(true), error = ref(false), hasMore = ref(false);
let cursor: string | null = null, generation = 0, visible = true;
const states: RewardState[] = ["PENDING", "READY", "PROCESSING", "ISSUED", "RETRYABLE_FAILED", "OUTCOME_UNKNOWN", "CANCELLED", "REVERSAL_PENDING", "REVERSED", "MANUAL_REVIEW"];
const stateSheetOpen = ref(false);
const stateOptions = computed(() => [{ value: null as RewardState | null, label: t.value.promotion.allStates }, ...states.map(value => ({ value, label: t.value.promotion[rewardStateKey(value)] }))]);
let stateSheetScope: { account: string; epoch: number } | null = null;
function closeStateSheet() { stateSheetOpen.value = false; stateSheetScope = null; }

function clearRead() {
  closeStateSheet();
  generation++;
  rewards.value = [];
  cursor = null;
  hasMore.value = false;
  error.value = false;
  loading.value = false;
}
async function load(reset: boolean) {
  if (!visible || !sessionReady.value || (loading.value && !reset)) return;
  const request = ++generation, account = app.accountKey, epoch = app.accountBindingEpoch;
  const current = () => visible && request === generation && account === app.accountKey
    && epoch === app.accountBindingEpoch && sessionReady.value;
  if (reset) { cursor = null; rewards.value = []; hasMore.value = false; }
  loading.value = true;
  error.value = false;
  try {
    const page = await promotionApi.rewards({ cursor, limit: 20, activityId: props.activityId, orderNo: props.orderNo, state: state.value ?? undefined });
    if (!current()) return;
    rewards.value = reset ? page.items : [...rewards.value, ...page.items];
    cursor = page.nextCursor;
    hasMore.value = page.hasMore;
  } catch {
    if (current()) error.value = true;
  } finally {
    if (current()) loading.value = false;
  }
}
function chooseState() {
  if (!visible || !sessionReady.value) return;
  stateSheetScope = { account: app.accountKey, epoch: app.accountBindingEpoch };
  stateSheetOpen.value = true;
}
function selectState(value: RewardState | null) {
  if (!stateSheetOpen.value || !visible || !sessionReady.value || !stateSheetScope
      || stateSheetScope.account !== app.accountKey || stateSheetScope.epoch !== app.accountBindingEpoch
      || (value !== null && !states.includes(value))) return;
  closeStateSheet();
  state.value = value;
  void load(true);
}
watch(() => [app.accountKey, app.accountBindingEpoch, sessionReady.value, props.activityId, props.orderNo], () => {
  clearRead();
  if (visible) void load(true);
}, { flush: "sync" });
onMounted(() => { void load(true); });
onShow(() => { if (!visible) { visible = true; void load(true); } });
function hide() { visible = false; clearRead(); }
onHide(hide);
onBeforeUnmount(hide);
</script>

<style src="./promotion.css"></style>
<style scoped>
.reward-state-options { display:flex; flex-direction:column; }
.reward-state-option { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:44px; padding:10px 0; box-sizing:border-box; border-bottom:1px solid var(--v5-border); color:var(--v5-ink-2); font:500 14px/20px var(--font-v5); cursor:pointer; }
.reward-state-option:last-child { border-bottom:0; }
.reward-state-option[aria-pressed="true"] { color:var(--v5-brand); }
.reward-state-option:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; }
</style>
