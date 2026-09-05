<!--
  EventsCard — single event row card (ported from EventCard in
  Nexion-prototype/app/(main)/events/page.tsx).

  Surface + left tint hairline + emoji chip + kind/ribbon cap + title +
  subtitle + state-driven status chip (claimed / ready / participating /
  upcoming / ended / countdown) + bottom reward + scroll-grow progress +
  conditional action row (claim button / join button / view-progress link /
  decorative tint link). ev.tint hex are data values used at runtime in
  color-mix. Emits join/claim to the page (which owns the store writes).
-->
<template>
  <view class="relative rounded-2xl overflow-hidden" :style="cardStyle">
    <!-- left tint hairline -->
    <view aria-hidden class="absolute" :style="hairlineStyle" />

    <view style="padding: 14px">
      <!-- HEADER row -->
      <view class="flex items-start" style="gap: 12px">
        <view class="grid place-items-center shrink-0" :style="emojiChipStyle">
          <text style="font-size: 20px">{{ ev.emoji }}</text>
        </view>
        <view class="flex-1 min-w-0">
          <text class="block font-mono-tabular" :style="kindLineStyle">{{ kindLabel }}<text v-if="ev.ribbon" style="color: var(--v5-ink-4)"> · {{ ev.ribbon }}</text></text>
          <text class="block truncate" :style="titleStyle">{{ ev.title }}</text>
          <text class="block" :style="subtitleStyle">{{ ev.subtitle }}</text>
        </view>
        <!-- status chip -->
        <view v-if="statusChip" class="shrink-0 inline-flex items-center font-mono-tabular tabular-nums" :style="chipStyle">
          <svg v-if="statusChip.icon === 'clock'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <svg v-else-if="statusChip.icon === 'check'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><path d="M20 6 9 17l-5-5" /></svg>
          <text>{{ statusChip.label }}</text>
        </view>
      </view>

      <!-- REWARD + PROGRESS row -->
      <view class="mt-3 flex items-center" style="gap: 12px">
        <view class="inline-flex items-center shrink-0" :style="rewardStyle">
          <text style="margin-right: 6px">🎁</text>
          <text>{{ ev.reward }}</text>
        </view>
        <view v-if="ev.progress" class="flex-1 flex items-center min-w-0" style="gap: 8px">
          <view ref="barEl" class="flex-1 rounded-full overflow-hidden" style="height: 4px; background: var(--v5-surface-2)">
            <view class="h-full rounded-full" :style="barFillStyle" />
          </view>
          <text class="font-mono-tabular tabular-nums shrink-0" style="font-size: 12px; color: var(--v5-ink-3)">{{ ev.progress.current.toLocaleString() }}/{{ ev.progress.total.toLocaleString() }}</text>
        </view>
      </view>

      <!-- ACTION row -->
      <view v-if="showClaim" class="mt-3 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="claimBtnStyle" role="button" tabindex="0" :aria-label="claimLabel" @click="emit('claim')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; pointer-events: none"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287z" /></svg>
        <text style="font-size: 13px; font-weight: 600; color: var(--v5-on-brand); pointer-events: none">{{ claimLabel }}</text>
      </view>
      <view v-else-if="showJoinAction" class="mt-3 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="softTintBtnStyle" @click="emit('join')">
        <text style="font-size: 13px; font-weight: 600">{{ ev.ctaLabel ?? t.events.joinCta }}</text>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px"><path d="m9 18 6-6-6-6" /></svg>
      </view>
      <view v-else-if="ev._claimed && ev.useHref" class="mt-3 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="claimedUseBtnStyle" role="button" tabindex="0" :aria-label="claimedAriaLabel" @click="onClaimedUse">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; pointer-events: none"><path d="M20 6 9 17l-5-5" /></svg>
        <text style="font-size: 13px; font-weight: 500; color: var(--v5-ink-3); pointer-events: none">{{ t.events.claimedLabel }}</text>
        <text style="font-size: 13px; color: var(--v5-ink-4); margin: 0 8px; pointer-events: none">·</text>
        <text :style="{ fontSize: '13px', fontWeight: 600, color: ev.tint, pointerEvents: 'none' }">{{ t.events.useCta }}</text>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" :stroke="ev.tint" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px; pointer-events: none"><path d="m9 18 6-6-6-6" /></svg>
      </view>
      <view v-else-if="ev._trackable && ev.joined && !ev._done" class="mt-3 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="neutralBtnStyle" @click="openHref">
        <text style="font-size: 13px; font-weight: 500; color: var(--v5-ink-2)">{{ t.events.viewProgress }}</text>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px"><path d="m9 18 6-6-6-6" /></svg>
      </view>
      <view v-else-if="!ev._trackable && ev.status === 'ongoing' && ev.ctaLabel" class="mt-3 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="softTintBtnStyle" @click="onDecorativeCta">
        <text style="font-size: 13px; font-weight: 600">{{ ev.ctaLabel }}</text>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px"><path d="m9 18 6-6-6-6" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";
import { EVENT_KIND_LABEL, type NexEvent } from "@/mock/events";

type EnrichedEvent = NexEvent & { _trackable: boolean; _done: boolean; _claimed: boolean };

const props = defineProps<{ ev: EnrichedEvent; rewardNex: number }>();
const emit = defineEmits<{ (e: "join"): void; (e: "claim"): void; (e: "cta"): void }>();

const t = useT();
const { elRef: barEl, inView: barInView } = useScrollGrowProgress();

const dim = computed(() => props.ev.status === "ended");
const showClaim = computed(() => props.ev._trackable && props.ev._done && !props.ev._claimed);
const showJoinAction = computed(
  () => props.ev._trackable && !props.ev.joined && !props.ev._done && props.ev.status === "ongoing",
);
const claimLabel = computed(() => fmt(t.value.events.claimCta, { n: props.rewardNex.toLocaleString() }));
const kindLabel = computed(() => EVENT_KIND_LABEL[props.ev.kind]);
const progressPct = computed(() =>
  props.ev.progress ? Math.min(100, (props.ev.progress.current / props.ev.progress.total) * 100) : 0,
);

interface StatusChip { label: string; color: string; bg: string; icon?: "clock" | "check" }
const statusChip = computed<StatusChip | null>(() => {
  const ev = props.ev;
  if (ev._claimed) {
    return { label: t.value.events.claimedLabel, color: "var(--v5-ink-4)", bg: "var(--v5-surface-2)", icon: "check" };
  }
  if (showClaim.value) {
    return {
      label: t.value.events.progress.ready,
      color: ev.tint,
      bg: `color-mix(in srgb, ${ev.tint} 12%, transparent)`,
      icon: "check",
    };
  }
  if (ev.joined && ev.status !== "ended") {
    return { label: t.value.events.progress.participating, color: "var(--v5-brand)", bg: "var(--v5-brand-soft)", icon: "check" };
  }
  if (ev.status === "upcoming") {
    return { label: ev.startsIn ?? "", color: "var(--v5-brand-2)", bg: "var(--v5-surface-2)", icon: "clock" };
  }
  if (ev.status === "ended") {
    return { label: t.value.events.chip.ended, color: "var(--v5-ink-4)", bg: "var(--v5-surface-2)" };
  }
  if (ev.countdown) {
    return { label: ev.countdown, color: "var(--v5-ink-2)", bg: "var(--v5-surface-2)", icon: "clock" };
  }
  return null;
});

function openHref() {
  if (props.ev.href) uni.navigateTo({ url: props.ev.href, fail: () => {} });
}

// After the reward is claimed, the row offers a "Use it" link to the relevant
// surface (discount → store, NEX reward → NEX wallet). No useHref ⇒ no row.
const claimedAriaLabel = computed(() => `${t.value.events.claimedLabel} · ${t.value.events.useCta}`);
function onClaimedUse() {
  if (props.ev.useHref) uni.navigateTo({ url: props.ev.useHref, fail: () => {} });
}

// Decorative (non-trackable) ongoing CTA. The lucky-wheel ("Spin now") routes
// to the page so it can open the Lucky Spin sheet; all others keep navigating
// via their href (no-op when absent), matching prior behaviour.
function onDecorativeCta() {
  if (props.ev.kind === "wheel") {
    emit("cta");
    return;
  }
  openHref();
}

const cardStyle = computed<CSSProperties>(() => ({
  background: "var(--v5-surface)",
  opacity: dim.value ? 0.6 : 1,
}));
const hairlineStyle = computed<CSSProperties>(() => ({
  top: "0",
  left: "0",
  bottom: "0",
  width: "2px",
  background: `linear-gradient(180deg, transparent, ${props.ev.tint}, transparent)`,
  opacity: 0.85,
}));
const emojiChipStyle = computed<CSSProperties>(() => ({
  width: "40px",
  height: "40px",
  borderRadius: "8px",
  background: `color-mix(in srgb, ${props.ev.tint} 8%, transparent)`,
}));
const kindLineStyle = computed<CSSProperties>(() => ({
  fontSize: "12px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: props.ev.tint,
  opacity: 0.85,
}));
const titleStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  lineHeight: 1.25,
};
const subtitleStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  marginTop: "2px",
  lineHeight: 1.375,
};
const chipStyle = computed<CSSProperties>(() => ({
  padding: "4px 8px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: 500,
  whiteSpace: "nowrap",
  background: statusChip.value!.bg,
  color: statusChip.value!.color,
}));
const rewardStyle = computed<CSSProperties>(() => ({
  fontSize: "12px",
  fontWeight: 600,
  color: props.ev.tint,
  fontFamily: "var(--font-v5)",
}));
const barFillStyle = computed<CSSProperties>(() => ({
  width: `${barInView.value ? progressPct.value : 0}%`,
  background: props.ev.tint,
  transition: barInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));
const claimBtnStyle = computed<CSSProperties>(() => ({
  height: "44px",
  background: props.ev.tint,
  boxShadow: `0 0 18px color-mix(in srgb, ${props.ev.tint} 33%, transparent)`,
}));
const softTintBtnStyle = computed<CSSProperties>(() => ({
  height: "44px",
  background: `color-mix(in srgb, ${props.ev.tint} 10%, transparent)`,
  color: props.ev.tint,
}));
const neutralBtnStyle: CSSProperties = {
  height: "44px",
  background: "var(--v5-surface-2)",
};
const claimedUseBtnStyle = computed<CSSProperties>(() => ({
  height: "44px",
  background: `color-mix(in srgb, ${props.ev.tint} 6%, transparent)`,
}));
</script>
