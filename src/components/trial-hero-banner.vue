<!--
  TrialHeroBanner — idle free-trial coupon entry (ported from
  Nexion-prototype/app/components/trial-hero-banner.tsx; "100% faithful v5 design
  draft" → uses exact design hex var(--v5-quest-violet) / var(--v5-quest-ember), NOT the V5 token map).

  Coupon/ticket silhouette: circular notches at 62% (top + bottom via mask-image),
  3D Y-flip entrance gated on scroll-into-view (useScrollGrowProgress → `played`),
  one-shot diagonal shimmer. LEFT identity body · dashed perforation · RIGHT value
  stub · dashed separator · scarcity dot + Claim CTA. Hidden unless trial idle &
  canStart(). Tap opens the trial claim sheet. <button> → <view @click> (uni).
-->
<template>
  <!-- 《08》§2:原 active:scale-[0.98] = 0.2% 缩放,肉眼与探针都测不出 —— 声明了等于没有。
       但反馈也不能直接写在这一层:rootStyle 的入场动画是 `v5-ticket-enter ... both`,
       它的 100% 帧同时锁着 opacity 和 transform,animation 优先级压过普通声明,
       写在 root 上的 active:opacity / active:scale 一律无效(原作者那个 0.998 多半就是这么来的)。
       所以反馈挂到内层 body —— 它不受 animation 约束。 -->
  <view
    v-if="visible"
    ref="elRef"
    class="block w-full nx-trial-hero"
    :style="rootStyle"
    @click="onClick"
  >
    <!-- Coupon body — frosted glass purple theme -->
    <view class="nx-trial-hero__body" :style="bodyStyle">
      <!-- Shimmer sweep (gated on played) -->
      <view :style="shimmerStyle" />

      <!-- Main row — left identity · perforation · right value stub -->
      <view style="position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 14px auto; gap: 0; align-items: stretch">
        <!-- LEFT body -->
        <view style="padding: 16px 4px 14px 16px; min-width: 0">
          <view
            class="inline-flex items-center"
            style="gap: 5px; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--v5-quest-violet) 12%, transparent)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--v5-quest-violet-ink)">
              <path d="M12 2l2.6 7.2L22 10l-5.6 4.6L18 22l-6-4-6 4 1.6-7.4L2 10l7.4-.8z" />
            </svg>
            <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-quest-violet-ink); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase">{{ t.trial.heroBadge }}</text>
          </view>
          <text
            class="block"
            style="margin-top: 9px; font-family: var(--font-v5); font-weight: 600; font-size: 20px; color: var(--v5-ink); letter-spacing: -0.014em; line-height: 1.15"
          >{{ t.trial.heroDeviceName }}</text>
          <text
            class="block"
            style="margin-top: 4px; font-family: var(--font-v5); font-weight: 500; font-size: 13px; color: var(--v5-ink-3); letter-spacing: -0.005em; line-height: 1.4; text-wrap: pretty"
          >{{ taglineText }}</text>
        </view>

        <!-- Perforated divider -->
        <view style="position: relative; min-height: 100%; display: flex; align-items: center; justify-content: center">
          <view style="width: 1px; align-self: stretch; margin: 12px 0; background: repeating-linear-gradient(180deg, var(--v5-border-strong) 0 4px, transparent 4px 8px)" />
        </view>

        <!-- RIGHT stub — max-width 上限:长语种(vi)标签过宽会把左列标题挤到折行,
             超限就让标签自己右对齐换行,不许挤压左列(主人 2026-08-17 vi 卡片乱) -->
        <view style="padding: 16px 16px 14px 4px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; min-width: 116px; max-width: 170px">
          <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-4); letter-spacing: 0.06em; text-align: right">{{ earnLabelText }}</text>
          <view
            class="inline-flex items-baseline"
            style="margin-top: 6px; gap: 1px; font-family: var(--font-v5); font-weight: 600; color: var(--v5-ink); font-variant-numeric: tabular-nums; letter-spacing: -0.024em; line-height: 1"
          >
            <text style="font-size: 20px; font-weight: 500; color: var(--v5-quest-violet-ink)">$</text>
            <text style="font-size: 36px">{{ est }}</text>
          </view>
          <text style="margin-top: 5px; font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-4); white-space: nowrap">{{ dailyEarnText }}</text>
        </view>
      </view>

      <!-- Horizontal perforation/separator -->
      <view style="position: relative; z-index: 1; height: 1px; background: repeating-linear-gradient(90deg, var(--v5-border-strong) 0 4px, transparent 4px 8px); margin: 0 10px" />

      <!-- Bottom strip: scarcity + Claim CTA -->
      <view style="position: relative; z-index: 1; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px">
        <view v-if="!remoteApiEnabled" class="inline-flex items-center" style="gap: 6px; font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-quest-ember-ink); font-weight: 500">
          <view style="width: 6px; height: 6px; border-radius: 50%; background: var(--v5-quest-ember); box-shadow: 0 0 6px color-mix(in srgb, var(--v5-quest-ember) 70%, transparent); animation: v5-hb-pulse 1.6s ease-in-out infinite" />
          <text style="color: var(--v5-quest-ember-ink)">{{ trialsLeftText }}</text>
        </view>
        <!-- CTA 文字禁折行:uni 的 text 组件自带 white-space,不继承容器的 nowrap,
             必须写在 text 自己身上;flex-shrink:0 保胶囊拿满内容宽(vi 曾折成两行) -->
        <view
          class="inline-flex items-center"
          style="padding: 8px 14px; border-radius: 999px; background: transparent; color: var(--v5-quest-violet-ink); font-family: var(--font-v5); font-weight: 600; font-size: 13px; border: 1px solid color-mix(in srgb, var(--v5-quest-violet-ink) 45%, transparent); gap: 5px; letter-spacing: -0.005em; white-space: nowrap; flex-shrink: 0"
        >
          <text style="color: var(--v5-quest-violet-ink); white-space: nowrap">{{ t.trial.heroClaimCta }}</text>
          <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; opacity: 0.8; font-size: 12px; color: var(--v5-quest-violet-ink)">→</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { remoteApiEnabled } from "@/api/runtime";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useScrollGrowProgress } from "@/composables/use-scroll-grow-progress";

const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const claimSheet = useTrialClaimSheet();
const t = useT();

// Entrance plays once the coupon scrolls into view (not on mount).
const { elRef, inView } = useScrollGrowProgress({ threshold: 0.25 });
const played = ref(false);
watch(inView, (v) => {
  if (v) played.value = true;
});

const visible = computed(() => trial.status === "none" && trial.canStart());

const trialDays = computed(() => trialCfg.config.trialDays);
const dailyEarn = computed(() => trialCfg.config.shadowDailyUSD);
const est = computed(() => Math.round(trialDays.value * dailyEarn.value));
const taglineText = computed(() => fmt(t.value.trial.heroTagline, { days: trialDays.value }));
const earnLabelText = computed(() => fmt(t.value.trial.heroEarnLabel, { days: trialDays.value }));
const trialsLeftText = computed(() => fmt(t.value.trial.heroTrialsLeft, { n: 47 }));
const dailyEarnText = computed(() => `$${dailyEarn.value.toFixed(2)}/d × ${trialDays.value}`);

const COUPON_MASK =
  "radial-gradient(circle at 62% 0, transparent 7px, #000 7.5px), " +
  "radial-gradient(circle at 62% 100%, transparent 7px, #000 7.5px)";

const rootStyle = computed<CSSProperties>(() => ({
  position: "relative",
  marginTop: "12px",
  color: "var(--v5-ink)",
  transformOrigin: "50% 50%",
  transformStyle: "preserve-3d",
  backfaceVisibility: "hidden",
  // Before play: opacity 0 (no flash of finished state); on play: 3D Y-flip in.
  opacity: played.value ? undefined : 0,
  animation: played.value ? "v5-ticket-enter 900ms cubic-bezier(0.22, 1.2, 0.36, 1) both" : "none",
  WebkitMaskImage: COUPON_MASK,
  WebkitMaskComposite: "source-in",
  maskImage: COUPON_MASK,
  maskComposite: "intersect",
}));

const bodyStyle: CSSProperties = {
  borderRadius: "16px",
  background:
    "radial-gradient(70% 60% at 0% 0%, color-mix(in srgb, var(--v5-quest-violet) 18%, transparent), transparent 60%), " +
    "radial-gradient(80% 100% at 100% 100%, color-mix(in srgb, var(--v5-quest-violet) 12%, transparent), transparent 65%), " +
    "var(--v5-surface)",
  overflow: "hidden",
  position: "relative",
  boxShadow: "var(--v5-card-shadow-lift)",
};

const shimmerStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  inset: "0",
  pointerEvents: "none",
  zIndex: 2,
  overflow: "hidden",
  background: "linear-gradient(100deg, transparent 25%, rgba(198,255,58,0.55) 50%, transparent 75%)",
  animation: played.value ? "v5-ticket-shimmer 1100ms ease-out 850ms 1 forwards" : "none",
  opacity: 0,
  mixBlendMode: "screen",
}));

function onClick() {
  claimSheet.show();
}
</script>

<style scoped>
/* 《08》§2 按下反馈。挂在 body 而不是 root:root 被入场动画 v5-ticket-enter(fill-mode: both)
   锁着 opacity 与 transform,animation 优先级压过普通声明,写在 root 上一律不生效。 */
.nx-trial-hero__body {
  transition: opacity 0.15s;
}
.nx-trial-hero:active .nx-trial-hero__body {
  opacity: 0.85;
}
</style>
