<!-- ConversionBanner — homepage weekly task card. -->
<template>
  <view
    class="weekly-quest block active:scale-[0.98] active:opacity-90 transition-transform"
    :style="rootStyle"
    role="button"
    :tabindex="props.active ? 0 : -1"
    :aria-hidden="!props.active"
    :data-copy-source="managedCopy.status[MANAGED_POSITION] ?? 'fallback'"
    :data-copy-key="managedCopy.deliveries[MANAGED_POSITION]?.copyKey ?? 'builtin'"
    :data-copy-version="managedCopy.deliveries[MANAGED_POSITION]?.version ?? 'builtin'"
    :data-experiment-id="managedCopy.deliveries[MANAGED_POSITION]?.experimentId ?? ''"
    @click="goTarget"
    @keydown.enter.prevent="goTarget"
    @keydown.space.prevent="goTarget"
  >
    <image
      class="weekly-quest__product"
      src="/static/img/marketing/trial-hero.png"
      mode="aspectFit"
      :style="productStyle"
      aria-hidden="true"
    />

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
          <text class="weekly-quest__multiplier">{{ promoMult === null ? "—" : `${promoMult}×` }}</text>
        </view>
        <view class="weekly-quest__countdown">
          <text class="weekly-quest__countdown-label">{{ contextLabel }}</text>
          <text class="weekly-quest__countdown-value">{{ remainingLabel }}</text>
        </view>
      </view>

      <view class="weekly-quest__body">
        <view class="weekly-quest__reward">
          <text class="weekly-quest__reward-value">+{{ finalRewardText }}</text>
          <text class="weekly-quest__reward-unit">NEX</text>
        </view>
        <text class="weekly-quest__subtitle">{{ subtitleText }}</text>
        <view v-if="!weeklyQuest" class="weekly-quest__rate">
          <text class="weekly-quest__rate-value">${{ targetDailyText }}</text>
          <text class="weekly-quest__rate-unit">/d</text>
        </view>
      </view>

      <view class="weekly-quest__cta">
        <text>{{ weeklyQuest ? t.headerTitles.missions : t.home.weeklyQuestGetNexGridBox }}</text>
        <text class="weekly-quest__cta-arrow" aria-hidden="true">→</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { derivePromoUpgrade } from "@/store/device-types";
import { deviceNameByKind } from "@/lib/device-copy";
import { useNow } from "@/composables/use-now";
import { useContentCopy } from "@/store/content-copy";
import { useLocaleStore } from "@/store/locale";
import { refreshCanonicalOrders } from "@/store/order-canonical";
import { useWeeklyQuest } from "@/store/weekly-quest";
import { remoteApiEnabled } from "@/api/runtime";
import { selectHomeWeeklySource } from "@/lib/home-task-carousel";
import { navTo } from "@/lib/route";

const MANAGED_POSITION = "home.conversion-banner";

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});
const t = useT();
const app = useApp();
const nowTick = useNow();
const managedCopy = useContentCopy();
const locale = useLocaleStore();
const wq = useWeeklyQuest();

onMounted(() => {
  void managedCopy.refresh(MANAGED_POSITION).then(() => {
    if (managedCopy.deliveries[MANAGED_POSITION]?.experimentId) void refreshCanonicalOrders(true);
  });
});

const weeklySource = computed(() => selectHomeWeeklySource(
  [...wq.tier1Quests, ...wq.tier2Quests],
  wq.snapshot?.promoBanner ?? null,
));
const weeklyQuest = computed(() => weeklySource.value?.kind === "quest" ? weeklySource.value.quest : null);
const canonicalPromo = computed(() => weeklySource.value?.kind === "promo" ? weeklySource.value.promo : null);
const promoMult = computed<number | null>(() => {
  if (!remoteApiEnabled) return 1.5;
  if (weeklyQuest.value) return wq.multiplier;
  return canonicalPromo.value?.multiplier ?? null;
});
const baseReward = 800;
const finalRewardText = computed(() => {
  const reward = remoteApiEnabled
    ? weeklyQuest.value
      ? Math.round(weeklyQuest.value.rewardNex * (promoMult.value ?? 1))
      : canonicalPromo.value
        ? Math.round(canonicalPromo.value.baseReward * canonicalPromo.value.multiplier)
        : null
    : Math.round(baseReward * (promoMult.value ?? 1));
  return reward === null ? "—" : reward.toLocaleString();
});

const contextLabel = computed(() => weeklyQuest.value ? t.value.headerTitles.missions : t.value.home.weeklyQuestEndsIn);
const remainingLabel = computed(() => {
  if (remoteApiEnabled) {
    if (weeklyQuest.value) return weeklyQuest.value.layer === "WEEKLY_T1" ? "Tier 1" : "Tier 2";
    if (!canonicalPromo.value) return "—";
    const days = canonicalPromo.value.countdownDays;
    const hours = canonicalPromo.value.countdownHours;
    return `${days}d ${String(hours).padStart(2, "0")}h`;
  }
  const remainingMs = (4 * 86400 + 12 * 3600) * 1000 - ((nowTick.value * 1000) % 60_000);
  const days = Math.floor(remainingMs / 86400_000);
  const hours = Math.floor((remainingMs % 86400_000) / 3600_000);
  return `${days}d ${String(hours).padStart(2, "0")}h`;
});

const promo = computed(() => derivePromoUpgrade(app.visibleDevices));
const targetDailyText = computed(() => {
  if (remoteApiEnabled) {
    const value = canonicalPromo.value?.targetDaily;
    return value == null ? "—" : value.toFixed(2);
  }
  return promo.value.targetDaily.toFixed(2);
});
const managedCopyText = computed(() => managedCopy.localized(MANAGED_POSITION, locale.code));
const subtitleText = computed(() =>
  weeklyQuest.value?.name || managedCopyText.value || (remoteApiEnabled ? (canonicalPromo.value?.targetDevice || "—") : promo.value.multiplier > 0
    ? fmt(t.value.home.weeklyQuestActivateToClaim, {
        device: deviceNameByKind(t.value, promo.value.targetKind, promo.value.targetName),
      })
    : t.value.home.weeklyQuestAddCapacity),
);

const rootStyle: CSSProperties = {
  position: "relative",
  boxSizing: "border-box",
  width: "100%",
  height: "var(--home-task-card-height, 184px)",
  minHeight: "var(--home-task-card-height, 184px)",
  borderRadius: "16px",
  background:
    "radial-gradient(50% 60% at 100% 0%, var(--v5-brand-soft), transparent 70%), var(--v5-surface)",
  overflow: "hidden",
  color: "var(--v5-ink)",
};

const PRODUCT_MASK =
  "radial-gradient(ellipse 200px 250px at 95% 50%, #000 25%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.1) 82%, transparent 100%)";
const productStyle: CSSProperties = {
  position: "absolute",
  top: "-36px",
  right: "-50px",
  width: "220px",
  height: "220px",
  pointerEvents: "none",
  zIndex: 0,
  maskImage: PRODUCT_MASK,
  WebkitMaskImage: PRODUCT_MASK,
};

function goTarget() {
  if (weeklyQuest.value) {
    uni.navigateTo({ url: "/pages/missions/missions", fail: () => {} });
    return;
  }
  if (remoteApiEnabled) {
    if (canonicalPromo.value) navTo("/store");
    return;
  }
  const kind = promo.value.targetKind;
  if (!kind) return;
  uni.navigateTo({ url: `/pages/store/detail?id=${kind}`, fail: () => {} });
}
</script>

<style scoped>
.weekly-quest__content {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  height: 100%;
  padding: 14px 16px;
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
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  white-space: nowrap;
}

.weekly-quest__multiplier {
  display: inline-flex;
  height: 22px;
  padding: 0 8px;
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
  width: 62%;
  margin-top: 6px;
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
  display: block;
  margin-top: 4px;
  overflow: hidden;
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink-3);
  letter-spacing: -0.008em;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.weekly-quest__rate {
  display: flex;
  align-items: baseline;
  margin-top: 3px;
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
