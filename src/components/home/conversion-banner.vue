<!-- ConversionBanner — homepage weekly task card. -->
<template>
  <view
    class="nx-glass-action weekly-quest block"
    :class="{ 'opacity-60': cardInactive }"
    :style="rootStyle"
    :role="cardInactive ? undefined : 'button'"
    :tabindex="props.active && !cardInactive ? 0 : -1"
    :aria-hidden="!props.active"
    :aria-disabled="cardInactive ? 'true' : 'false'"
    :aria-label="weeklyRetryAriaLabel"
    :data-copy-source="managedCopy.status[MANAGED_POSITION] ?? 'fallback'"
    :data-copy-key="managedCopy.deliveries[MANAGED_POSITION]?.copyKey ?? 'builtin'"
    :data-copy-version="managedCopy.deliveries[MANAGED_POSITION]?.version ?? 'builtin'"
    :data-experiment-id="managedCopy.deliveries[MANAGED_POSITION]?.experimentId ?? ''"
    :data-target-device="weeklyCard.targetDevice ?? ''"
    :data-quest-category="weeklyCard.category ?? ''"
    @click="onCardAction"

    @keydown.enter.prevent="onCardAction" @keydown.space.prevent="onCardAction"
  >
<view class="weekly-quest__content">
      <view class="weekly-quest__header">
        <view class="weekly-quest__identity">
          <view class="weekly-quest__mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
              <path d="m12 13 .9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
            </svg>
          </view>
          <text class="weekly-quest__title">{{ t.home.weeklyQuestEyebrow }}</text>
        </view>
        <view class="weekly-quest__countdown">
          <text class="weekly-quest__countdown-label">{{ t.home.weeklyQuestEndsIn }}</text>
          <text class="weekly-quest__countdown-value">{{ remainingLabel }}</text>
        </view>
      </view>

      <view v-if="weeklyState === 'loading'" class="weekly-quest__state" aria-live="polite">
        <text class="weekly-quest__state-copy">{{ t.weeklyQuest.loading }}</text>
      </view>
      <view v-else-if="weeklyState === 'error'" class="weekly-quest__state" role="alert">
        <text class="weekly-quest__state-copy">{{ weeklyRetryLabel }}</text>
      </view>
      <view v-else-if="weeklyState === 'empty'" class="weekly-quest__state" aria-live="polite">
        <text class="weekly-quest__state-copy">{{ t.weeklyQuest.noTaskAction }}</text>
      </view>
      <view v-else class="weekly-quest__body">
        <view class="weekly-quest__reward-row">
          <view class="weekly-quest__reward">
            <text class="weekly-quest__reward-value" :style="{ fontSize: rewardFontSize }">+{{ finalRewardText }}</text>
            <text class="weekly-quest__reward-unit">NEX</text>
          </view>
          <view class="weekly-quest__badges">
            <text v-if="categoryText" class="weekly-quest__category">{{ categoryText }}</text>
            <text class="weekly-quest__multiplier">{{ weeklyState === "ready" && promoMult !== null ? `${promoMult}×` : "—" }}</text>
          </view>
        </view>
        <text class="weekly-quest__subtitle" :aria-label="subtitleText" :title="subtitleText">{{ subtitleText }}</text>
        <view v-if="weeklyCard.targetDaily !== null" class="weekly-quest__rate">
          <text class="weekly-quest__rate-value">${{ targetDailyText }}</text>
          <text class="weekly-quest__rate-unit">/d</text>
        </view>
      </view>

      <view class="weekly-quest__cta">
        <text>{{ ctaText }}</text>
        <text class="weekly-quest__cta-arrow" aria-hidden="true">→</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useContentCopy } from "@/store/content-copy";
import { refreshCanonicalOrders } from "@/store/order-canonical";
import { useWeeklyQuest } from "@/store/weekly-quest";
import { presentHomeWeeklyCard, selectHomeWeeklySource } from "@/lib/home-task-carousel";
import { weeklyQuestDisplayName } from "@/lib/quest-presentation";
import { navTo } from "@/lib/route";
import { useNow } from "@/composables/use-now";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { genesisBlockIsKnownUnavailable } from "@/store/genesis-config";
import { questTargetBusiness, unclaimableBusinessQuests, type QuestTargetAvailability } from "@/lib/quest-business-availability";
import { useQuestTargetAvailability } from "@/composables/use-quest-target-availability";

const MANAGED_POSITION = "home.conversion-banner";

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});
const t = useT();
const locale = useLocaleStore();
const managedCopy = useContentCopy();
const wq = useWeeklyQuest();
const now = useNow();

onMounted(() => {
  void managedCopy.refresh(MANAGED_POSITION).then(() => {
    if (managedCopy.deliveries[MANAGED_POSITION]?.experimentId) void refreshCanonicalOrders(true);
  });
});

const { block: genesisBlock } = useGenesisSaleGate();
const targetAvailability = useQuestTargetAvailability();
const weeklySource = computed(() => selectHomeWeeklySource(
  [...wq.tier1Quests, ...wq.tier2Quests],
  wq.snapshot?.promoBanner ?? null,
));
const weeklyCard = computed(() => presentHomeWeeklyCard(
  weeklySource.value,
  wq.snapshot?.promoBanner ?? null,
  wq.multiplier,
  now.value * 1000,
  weeklySource.value?.kind === "quest"
    ? weeklyQuestDisplayName(weeklySource.value.quest, locale.code, t.value)
    : undefined,
));
/**
 * 这张卡指向的业务现在整体不可用吗(BUG 127 / 155)。
 *
 * 🔴 与 weekly-quest-hero / weekly-quest-list 用**同一份读数**:任务卡继续给「去完成」,
 *   就是把用户送进一个他立刻撞上的墙 —— 实测形态是质押全部「暂停售卖」、兑换页明说
 *   「已暂停兑换」,首页卡片仍在倒计时并跳转。hero/list 早就有这道闸,首页这张卡漏了。
 *   `genesisBlockIsKnownUnavailable` 排除 `configUnavailable`(那是「还不知道」),所以
 *   冷启动窗口不会把 CTA 误停一层。
 */
const questTargetClosed = computed(() => {
  const source = weeklySource.value;
  if (source?.kind !== "quest") return false;
  const q = source.quest;
  if (questTargetBusiness(q) === null) return false;
  const availability: QuestTargetAvailability = {
    genesisBlocked: genesisBlockIsKnownUnavailable(genesisBlock.value),
    stakingClosed: targetAvailability.value.stakingClosed,
    exchangeClosed: targetAvailability.value.exchangeClosed,
  };
  return unclaimableBusinessQuests([{ ...q, status: "PENDING" }], availability).length > 0;
});

const weeklyState = computed<"loading" | "error" | "empty" | "ready">(() => {
  if (wq.error && !wq.claimErrorQuestCode) return "error";
  if (wq.loading || !wq.snapshot) return "loading";
  return weeklySource.value ? "ready" : "empty";
});
const promoMult = computed<number | null>(() => weeklyCard.value.multiplier);
const finalRewardText = computed(() => {
  const reward = weeklyCard.value.rewardNex;
  return reward === null ? "—" : reward.toLocaleString();
});
// Scale long server rewards so the full number and task badges share one row.
const rewardFontSize = computed(() => {
  const chars = Math.max(7, finalRewardText.value.length);
  return `${Math.max(12, Math.min(34, Math.floor((34 * 7) / chars)))}px`;
});

const remainingLabel = computed(() => {
  const days = weeklyCard.value.countdownDays;
  const hours = weeklyCard.value.countdownHours;
  if (days === null || hours === null) return "—";
  return `${days}d ${String(hours).padStart(2, "0")}h`;
});

const targetDailyText = computed(() => {
  const value = weeklyCard.value.targetDaily;
  return value == null ? "—" : value.toFixed(2);
});
const subtitleText = computed(() => weeklyCard.value.subtitle || "—");
const categoryText = computed(() => {
  const category = weeklyCard.value.category;
  if (!category) return "";
  return ({
    wallet: t.value.home.dayOneCatWallet,
    explore: t.value.home.dayOneCatExplore,
    recommend: t.value.home.dayOneCatRecommend,
    identity: t.value.home.dayOneCatIdentity,
    social: t.value.home.dayOneCatSocial,
  })[category];
});
const weeklyLoginRequired = computed(() => /(?:AUTH|LOGIN|SESSION|UNAUTHORIZED|401)/i.test(wq.error ?? ""));
const weeklyRetryLabel = computed(() => weeklyLoginRequired.value
  ? t.value.weeklyQuest.retryLogin
  : t.value.weeklyQuest.retryNetwork);
const weeklyRetryAriaLabel = computed(() => {
  if (weeklyState.value === "loading") return t.value.weeklyQuest.loading;
  if (weeklyState.value === "empty") return t.value.weeklyQuest.noTaskAction;
  if (weeklyState.value === "error") return weeklyRetryLabel.value;
  return ctaText.value;
});
const ctaText = computed(() => {
  if (weeklyState.value === "loading") return t.value.weeklyQuest.loading;
  if (weeklyState.value === "error") return weeklyRetryLabel.value;
  if (weeklyState.value === "empty") return t.value.weeklyQuest.noTaskAction;
  // 目标业务停摆时明说原因:静默不改文案会让用户以为点了没反应。
  if (questTargetClosed.value) return t.value.weeklyQuest.targetClosed;
  return weeklySource.value?.kind === "quest"
    ? t.value.weeklyQuest.goComplete
    : t.value.home.weeklyQuestGetNexGridBox;
});

/** 卡片整体不可交互 = 非当前卡 / 加载中 / 无任务 / 目标业务停摆。 */
const cardInactive = computed(() => !props.active
  || weeklyState.value === "loading" || weeklyState.value === "empty"
  || questTargetClosed.value);

const rootStyle: CSSProperties = { boxShadow: "none",
  position: "relative",
  boxSizing: "border-box",
  width: "100%",
  height: "var(--home-task-card-height, 184px)",
  minHeight: "var(--home-task-card-height, 184px)",
  borderRadius: "var(--nx-glass-radius)",
  background:
    "var(--nx-glass-fill)",
  overflow: "hidden",
  color: "var(--v5-ink)",
};

function onCardAction() {
  if (weeklyState.value === "loading" || weeklyState.value === "empty") return;
  if (questTargetClosed.value) return;
  if (weeklyState.value === "error") {
    if (weeklyLoginRequired.value) navTo("/pages/login/login");
    else void wq.refresh();
    return;
  }

  // 业务已停用时不跳转:否则用户点进一个明说「已暂停」的页面,任务卡等于骗点击。
  if (questTargetClosed.value) return;
  if (weeklyCard.value.actionRoute) navTo(weeklyCard.value.actionRoute);
}

</script>

<style scoped>
.weekly-quest__content {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  height: 100%;
  padding: 8px 16px;
}

.weekly-quest__header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.weekly-quest__identity {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 7px;
}

.weekly-quest__mark {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: 999px;
  background: var(--v5-brand-soft);
}

.weekly-quest__title {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.weekly-quest__multiplier {
  display: inline-flex;
  height: 18px;
  padding: 0 6px;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--v5-brand);
  background: transparent;
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-brand);
  white-space: nowrap;
}

.weekly-quest__countdown {
  display: flex;
  min-width: 72px;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1;
  white-space: nowrap;
}

.weekly-quest__countdown-label {
  font-family: var(--font-v5);
  font-size: 12px;
  font-weight: 400;
  color: var(--v5-ink-4);
}

.weekly-quest__countdown-value {
  margin-top: 5px;
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-quest-violet-ink);
  font-variant-numeric: tabular-nums;
}

.weekly-quest__body {
  position: relative;
  z-index: 2;
  width: 100%;
  margin-top: 0;
}

.weekly-quest__reward-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.weekly-quest__badges {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
}

.weekly-quest__category {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--v5-brand-soft);
  font-family: var(--font-v5);
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-brand);
  line-height: 14px;
  white-space: nowrap;
}

.weekly-quest__state {
  position: relative;
  z-index: 2;
  display: flex;
  width: 62%;
  min-height: 74px;
  padding: 12px 0;
  align-items: center;
}

.weekly-quest__state-copy {
  font-family: var(--font-v5);
  font-size: 13px;
  line-height: 1.5;
  color: var(--v5-ink-3);
}

.weekly-quest__reward {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.weekly-quest__reward-value {
  font-family: var(--font-v5);
  font-size: 34px;
  font-weight: 500;
  line-height: 1;
  color: var(--v5-nex);
  letter-spacing: -0.024em;
}

.weekly-quest__reward-unit {
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-nex);
}

.weekly-quest__subtitle {
  display: -webkit-box;
  width: 90%;
  margin-top: 0;
  overflow: hidden;
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink-3);
  letter-spacing: -0.008em;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}

.weekly-quest__rate {
  display: flex;
  align-items: baseline;
  margin-top: 0;
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.weekly-quest__rate-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-brand);
}

.weekly-quest__rate-unit {
  font-size: 12px;
  color: var(--v5-ink-4);
}

.weekly-quest__cta {
  position: absolute;
  right: 16px;
  bottom: 14px;
  left: 16px;
  display: inline-flex;
  min-height: 44px;
  padding: 0 20px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 999px;
  background: var(--v5-brand-soft);
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 500;
  color: color-mix(in srgb, var(--v5-brand) 82%, var(--v5-ink-3));
  letter-spacing: -0.005em;
}

.weekly-quest__cta-arrow {
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-size: 12px;
  color: currentColor;
  opacity: 0.58;
}
</style>
