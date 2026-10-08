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
    <view v-if="rewards.length" class="promotion-flat"><RewardRows :rewards="rewards" /></view>
    <PromotionAction v-if="hasMore" role="button" tabindex="0" :aria-disabled="loading" @click="load(false)" @keydown.enter.prevent="load(false)" @keydown.space.prevent="load(false)"><text>{{ t.promotion.more }}</text></PromotionAction>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import PromotionAction from "@/components/promotion/promotion-action.vue";
import RewardRows from "@/components/promotion/reward-rows.vue";
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

function clearRead() {
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
  const account = app.accountKey, epoch = app.accountBindingEpoch;
  uni.showActionSheet({
    itemList: [t.value.promotion.allStates, ...states.map(value => t.value.promotion[rewardStateKey(value)])],
    success: result => {
      if (!visible || account !== app.accountKey || epoch !== app.accountBindingEpoch) return;
      state.value = result.tapIndex === 0 ? null : states[result.tapIndex - 1] ?? null;
      void load(true);
    },
  });
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
