<!--
  LockedProductCard (inline variant) — "Coming soon" gen-2 phase-locked card
  (ported from store/page.tsx via locked-product-card.tsx inline branch).
  Anticipation surface: brand-2 aurora drift + 24px grid texture + Lock badge.
  Detailed specs, progress, queue proof and Notify CTA stay collapsed by default.
-->
<template>
  <view class="relative overflow-hidden" :style="rootStyle">
    <!-- aurora drift bg -->
    <view aria-hidden :style="auroraStyle" />
    <!-- 24px grid overlay -->
    <view aria-hidden :style="gridStyle" />

    <view class="relative" style="padding: 16px">
      <!-- Top row — Lock badge + identity + ETA chip -->
      <view class="flex items-start" style="gap: 12px">
        <view class="shrink-0 grid place-items-center relative" :style="lockBoxStyle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <view aria-hidden :style="lockDotStyle" />
        </view>
        <view class="flex-1 min-w-0 active:opacity-70" role="button" tabindex="0" @click.stop="toggleDetails">
          <view class="flex items-center justify-between" style="gap: 8px">
            <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-brand-2-ink); font-weight: 600; letter-spacing: 0.04em">{{ t.store.comingSoonHeading }}</text>
            <view class="flex items-center shrink-0" style="gap: 6px">
              <text class="font-mono-tabular tabular-nums" :style="stageChipStyle">{{ stageText }}</text>
              <view class="grid place-items-center" :style="toggleStyle">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </view>
            </view>
          </view>
          <text class="block mt-1" :style="titleStyle">{{ product.name }}</text>
          <view v-if="detailsOpen">
            <text class="block mt-1 line-clamp-2" style="font-size: 13px; color: var(--v5-ink-3); line-height: 1.35">{{ copy.tagline }}</text>
            <text
              v-if="serverReleaseReason"
              data-testid="server-release-reason"
              class="block mt-1 font-mono-tabular"
              style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.35"
            >{{ serverReleaseReason }}</text>
            <view class="mt-2 flex items-center font-mono-tabular truncate" style="gap: 6px; font-size: 12px; color: var(--v5-ink-3)">
              <text style="color: var(--v5-ink-2)">{{ gpuText }}</text>
              <text style="color: var(--v5-ink-4)">·</text>
              <text style="color: var(--v5-ink-2)">{{ vramText }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Phase progress bar -->
      <!-- 去线(主人 2026-08-17 全站令):mt-7 = 原 mt-3.5 + pt-3.5 的总间距 -->
      <view v-if="detailsOpen && progress" class="mt-7">
        <view class="flex items-center justify-between font-mono-tabular" style="font-size: 12px; margin-bottom: 6px">
          <text style="color: var(--v5-ink-3)">{{ t.store.lockedPhase }} <text class="tabular-nums" style="color: var(--v5-ink-2); font-weight: 600">{{ progress.current }}/{{ progress.total }}</text> · {{ t.store.lockedUnlockProgress }}</text>
          <text class="tabular-nums" style="color: var(--v5-brand-2-ink); font-weight: 600">{{ progress.pct }}%</text>
        </view>
        <view ref="barRef" class="overflow-hidden" style="height: 5px; border-radius: 3px; background: var(--v5-surface-3)">
          <view :style="barFillStyle" />
        </view>
      </view>

      <!-- Bottom row — Notify + queue social proof -->
      <view v-if="detailsOpen" class="mt-3 flex items-center" style="gap: 10px">
        <view class="flex-1 inline-flex items-center justify-center" :style="notifyBtnStyle" role="button" tabindex="0" :aria-label="t.store.lockedNotifyMe" @click.stop="handleNotify">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <text>{{ t.store.lockedNotifyMe }}</text>
        </view>
        <view v-if="queue" class="shrink-0 text-right font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.3">
          <text class="block tabular-nums" style="color: var(--v5-brand-2-ink); font-weight: 600; font-size: 12px">{{ queueText }}</text>
          <text class="block">{{ t.store.lockedInQueue }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import type { Product } from "@/mock/products";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import {
  useScrollGrowProgress,
  PROGRESS_GROW_TRANSITION,
} from "@/composables/use-scroll-grow-progress";
import { productCopy, specText } from "@/lib/product-copy";

const props = defineProps<{ product: Product }>();
const t = useT();
const copy = computed(() => productCopy(t.value, props.product));
const gpuText = computed(() => specText(t.value, props.product.gpu));
const vramText = computed(() => specText(t.value, props.product.vram));

const PHASE_TO_PROGRESS: Record<string, { current: number; total: number; pct: number }> = {
  P3: { current: 1, total: 3, pct: 33 },
  P5: { current: 1, total: 5, pct: 20 },
};
const PHASE_TO_QUEUE: Record<string, number> = { P3: 1842, P5: 614 };

const detailsOpen = ref(false);
let lastToggleAt = 0;
const progress = computed(() =>
  props.product.available === undefined && props.product.unlocksAtPhase
    ? PHASE_TO_PROGRESS[props.product.unlocksAtPhase] ?? null
    : null,
);
const queue = computed(() =>
  props.product.available === undefined && props.product.unlocksAtPhase
    ? PHASE_TO_QUEUE[props.product.unlocksAtPhase] ?? null
    : null,
);
const queueText = computed(() => (queue.value ?? 0).toLocaleString());
const serverReleaseReason = computed(() => {
  const state = props.product.releaseState;
  if (!state || props.product.available !== false) return "";
  const phase = props.product.releasePhaseId
    ? fmt(t.value.store.releasePhaseRef, { phase: props.product.releasePhaseId })
    : "";
  if (state === "H1_RHYTHM_UNAVAILABLE") return t.value.store.releaseRhythmUnavailable;
  if (state === "E1_PHASE_CONFIG_UNAVAILABLE" || state === "E1_UNLOCK_PHASE_INVALID"
      || state === "E1_GENERATION_PHASE_MISMATCH") return t.value.store.releaseConfigUnavailable;
  if (state === "E1_GENERATION_ELIGIBILITY_REQUIRED") return t.value.store.releaseEligibilityPending;
  if (state === "E1_GENERATION_RELEASE_MONTH_NOT_REACHED") return t.value.store.releaseSchedulePending;
  if (state === "E1_PHASE_NOT_REACHED" || state === "E1_GENERATION_PHASE_NOT_REACHED") {
    return phase ? fmt(t.value.store.releasePhasePending, { phase }) : t.value.store.releasePending;
  }
  return t.value.store.releasePending;
});
const stageText = computed(() =>
  props.product.available === false && props.product.releasePhaseId
    ? fmt(t.value.store.releasePhaseRef, { phase: props.product.releasePhaseId })
    : progress.value
    ? fmt(t.value.store.lockedStageCompact, {
        current: progress.value.current,
        total: progress.value.total,
      })
    : t.value.store.comingSoonHeading,
);

const { elRef: barRef, inView: barInView } = useScrollGrowProgress();

function handleNotify() {
  toast.success(fmt(t.value.store.notifyToast, { name: props.product.name }));
}
function toggleDetails() {
  const now = Date.now();
  if (now - lastToggleAt < 120) return;
  lastToggleAt = now;
  detailsOpen.value = !detailsOpen.value;
}

const rootStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
};

const auroraStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(40% 50% at 85% 15%, var(--v5-brand-2-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 15% 85%, var(--v5-tech-cyan-soft) 0%, transparent 60%)",
  filter: "blur(10px)",
  pointerEvents: "none",
  opacity: 0.7,
  animation: "v5-aurora-drift 14s ease-in-out infinite",
};

const gridStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    // 网格线跟随 ink:写死的深色网格在暗主题下落在近黑卡面上 = 纹理消失(卡底是 var(--v5-surface),跟主题)
    "linear-gradient(to right, color-mix(in srgb, var(--v5-ink) 3.5%, transparent) 1px, transparent 1px)," +
    "linear-gradient(to bottom, color-mix(in srgb, var(--v5-ink) 3.5%, transparent) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  pointerEvents: "none",
};

const lockBoxStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--v5-brand-2) 10%, transparent), color-mix(in srgb, var(--v5-tech-cyan) 8%, transparent))",
};

const lockDotStyle: CSSProperties = {
  position: "absolute",
  bottom: "-2px",
  right: "-2px",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: "var(--v5-tech-cyan)",
  border: "2px solid var(--v5-surface)",
  animation: "v5-hb-pulse 2.4s ease-in-out infinite",
};

const stageChipStyle: CSSProperties = {
  padding: "2px 7px",
  borderRadius: "4px",
  background: "var(--v5-brand-2-soft)",
  color: "var(--v5-brand-2-ink)",
  fontSize: "12px",
  fontWeight: 600,
};
const toggleBaseStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  color: "var(--v5-brand-2-ink)",
  background: "var(--v5-brand-2-soft)",
  transition: "transform 160ms ease",
};
const toggleStyle = computed<CSSProperties>(() => ({
  ...toggleBaseStyle,
  transform: detailsOpen.value ? "rotate(180deg)" : "rotate(0deg)",
}));

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  letterSpacing: "-0.018em",
  lineHeight: 1.2,
};

const barFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${barInView.value ? (progress.value?.pct ?? 0) : 0}%`,
  background: "linear-gradient(90deg, var(--v5-brand-2) 0%, var(--v5-tech-cyan) 100%)",
  transition: barInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));

const notifyBtnStyle: CSSProperties = {
  gap: "6px",
  minHeight: "44px",
  height: "42px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-border)",
  color: "var(--v5-ink-2)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
};
</script>
