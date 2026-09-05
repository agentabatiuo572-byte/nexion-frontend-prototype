<!--
  EventsFeaturedHero — featured event hero card (ported from FeaturedHero in
  Nexion-prototype/app/(main)/events/page.tsx).

  Surface w/ dual radial glow (ev.tint) + top hairline + cap label + countdown
  + title + emoji + reward pill + scroll-grow progress + state-driven CTA
  (claim button / claimed pill / join button / view-progress link). ev.tint
  hex are data values used at runtime in color-mix/gradients. Emits join/claim
  to the page (which owns the store writes).
-->
<template>
  <view class="relative overflow-hidden rounded-2xl" :style="cardStyle">
    <!-- top hairline -->
    <view aria-hidden :style="hairlineStyle" />

    <view class="relative" style="padding: 20px">
      <!-- TOP — cap label + countdown -->
      <view class="flex items-center justify-between">
        <view class="inline-flex items-center font-mono-tabular" :style="capLabelStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></svg>
          {{ t.events.heroLabel }}
        </view>
        <view v-if="ev.countdown" class="inline-flex items-center font-mono-tabular tabular-nums" style="font-size: 12px; color: var(--v5-ink-2)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <text>{{ ev.countdown }}</text>
        </view>
      </view>

      <!-- HERO row — title + emoji -->
      <view class="mt-4 flex items-start justify-between" style="gap: 12px">
        <view class="flex-1 min-w-0">
          <text class="block" :style="titleStyle">{{ ev.title }}</text>
          <text class="block" style="font-size: 13px; color: var(--v5-ink-3); margin-top: 6px; line-height: 1.375">{{ ev.subtitle }}</text>
        </view>
        <text aria-hidden class="shrink-0" :style="emojiStyle">{{ ev.emoji }}</text>
      </view>

      <!-- REWARD pill -->
      <view class="mt-4 inline-flex items-center" :style="rewardPillStyle">
        <text style="font-size: 14px; margin-right: 6px">🎁</text>
        <text style="font-family: var(--font-v5)">{{ ev.reward }}</text>
      </view>

      <!-- PROGRESS -->
      <view v-if="ev.progress" class="mt-4">
        <view class="flex items-center justify-between font-mono-tabular" style="font-size: 12px; margin-bottom: 6px">
          <text style="color: var(--v5-ink-3); text-transform: uppercase; letter-spacing: 0.08em">{{ ev.progress.label }}</text>
          <text class="tabular-nums" style="color: var(--v5-ink)">
            <text :style="{ color: ev.tint, fontWeight: 600 }">{{ ev.progress.current.toLocaleString() }}</text>
            <text style="color: var(--v5-ink-4)"> / {{ ev.progress.total.toLocaleString() }}</text>
          </text>
        </view>
        <view ref="barEl" class="h-2 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
          <view class="h-full rounded-full" :style="barFillStyle" />
        </view>
      </view>

      <!-- CTA -->
      <view v-if="showClaim" class="mt-5 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="claimBtnStyle" role="button" tabindex="0" :aria-label="claimLabel" @click="emit('claim')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; pointer-events: none"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287z" /></svg>
        <text style="font-size: 15px; font-weight: 600; color: var(--v5-on-brand); pointer-events: none" @click.stop="emit('claim')">{{ claimLabel }}</text>
      </view>
      <view v-else-if="ev._claimed" class="mt-5 w-full rounded-full flex items-center justify-center" :class="{ 'active:opacity-90': !!ev.useHref }" :style="claimedPillStyle" :role="ev.useHref ? 'button' : undefined" :tabindex="ev.useHref ? 0 : undefined" :aria-label="claimedAriaLabel" @click="onClaimedUse">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; pointer-events: none"><path d="M20 6 9 17l-5-5" /></svg>
        <text style="font-size: 13px; font-weight: 500; color: var(--v5-ink-3); pointer-events: none">{{ t.events.claimedLabel }}</text>
        <template v-if="ev.useHref">
          <text style="font-size: 13px; color: var(--v5-ink-4); margin: 0 8px; pointer-events: none">·</text>
          <text :style="{ fontSize: '13px', fontWeight: 600, color: ev.tint, pointerEvents: 'none' }">{{ t.events.useCta }}</text>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" :stroke="ev.tint" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px; pointer-events: none"><path d="m9 18 6-6-6-6" /></svg>
        </template>
      </view>
      <view v-else-if="showJoinAction" class="mt-5 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="joinBtnStyle" role="button" tabindex="0" :aria-label="ev.ctaLabel ?? t.events.joinCta" @click="emit('join')">
        <text style="font-size: 15px; font-weight: 600; color: var(--v5-on-brand); pointer-events: none">{{ ev.ctaLabel ?? t.events.joinCta }}</text>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; pointer-events: none"><path d="m9 18 6-6-6-6" /></svg>
      </view>
      <view v-else class="mt-5 w-full rounded-full flex items-center justify-center active:scale-[0.98] transition-transform" :style="joinBtnStyle" role="button" tabindex="0" :aria-label="ev.joined ? t.events.viewProgress : (ev.ctaLabel ?? t.events.joinCta)" @click="openHref">
        <svg v-if="ev.joined" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; pointer-events: none"><path d="M20 6 9 17l-5-5" /></svg>
        <text style="font-size: 15px; font-weight: 600; color: var(--v5-on-brand); pointer-events: none" @click.stop="openHref">{{ ev.joined ? t.events.viewProgress : (ev.ctaLabel ?? t.events.joinCta) }}</text>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; pointer-events: none"><path d="m9 18 6-6-6-6" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";
import type { NexEvent } from "@/mock/events";

type EnrichedEvent = NexEvent & { _trackable: boolean; _done: boolean; _claimed: boolean };

const props = defineProps<{ ev: EnrichedEvent; rewardNex: number }>();
const emit = defineEmits<{ (e: "join"): void; (e: "claim"): void; (e: "cta"): void }>();

const t = useT();
const { elRef: barEl, inView: barInView } = useScrollGrowProgress();

const showClaim = computed(() => props.ev._trackable && props.ev._done && !props.ev._claimed);
const showJoinAction = computed(() => props.ev._trackable && !props.ev.joined && !props.ev._done);
const claimLabel = computed(() => fmt(t.value.events.claimCta, { n: props.rewardNex.toLocaleString() }));
const progressPct = computed(() =>
  props.ev.progress ? Math.min(100, (props.ev.progress.current / props.ev.progress.total) * 100) : 0,
);

function openHref() {
  if (props.ev.href) {
    uni.navigateTo({ url: props.ev.href, fail: () => {} });
    return;
  }
  emit("cta");
}

// After the reward is claimed, the pill becomes a "Use it" link to the relevant
// surface (discount → store, NEX reward → NEX wallet). No useHref ⇒ inert pill.
const claimedAriaLabel = computed(() =>
  props.ev.useHref ? `${t.value.events.claimedLabel} · ${t.value.events.useCta}` : t.value.events.claimedLabel,
);
function onClaimedUse() {
  if (props.ev.useHref) uni.navigateTo({ url: props.ev.useHref, fail: () => {} });
}

const cardStyle = computed<CSSProperties>(() => ({
  background:
    `radial-gradient(70% 80% at 100% 0%, color-mix(in srgb, ${props.ev.tint} 20%, transparent) 0%, transparent 55%),` +
    `radial-gradient(120% 60% at 50% 130%, color-mix(in srgb, ${props.ev.tint} 8%, transparent) 0%, transparent 70%),` +
    `var(--v5-surface)`,
  boxShadow: "var(--v5-card-shadow-lift-strong)",
}));
const hairlineStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  left: "0",
  right: "0",
  top: "0",
  height: "1px",
  background: `linear-gradient(90deg, transparent, ${props.ev.tint}, transparent)`,
  opacity: 0.6,
}));
const capLabelStyle = computed<CSSProperties>(() => ({
  fontSize: "12px",
  letterSpacing: "0.18em",
  color: props.ev.tint,
}));
const titleStyle: CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: 1.25,
  color: "var(--v5-ink)",
  fontFamily: "var(--font-v5)",
  letterSpacing: "-0.012em",
};
const emojiStyle = computed<CSSProperties>(() => ({
  fontSize: "44px",
  lineHeight: 1,
  filter: `drop-shadow(0 4px 12px color-mix(in srgb, ${props.ev.tint} 33%, transparent))`,
}));
const rewardPillStyle = computed<CSSProperties>(() => ({
  paddingLeft: "12px",
  paddingRight: "16px",
  paddingTop: "6px",
  paddingBottom: "6px",
  borderRadius: "999px",
  fontSize: "13px",
  fontWeight: 600,
  background: `color-mix(in srgb, ${props.ev.tint} 10%, transparent)`,
  color: props.ev.tint,
}));
const barFillStyle = computed<CSSProperties>(() => ({
  width: `${barInView.value ? progressPct.value : 0}%`,
  background: `linear-gradient(90deg, ${props.ev.tint}, color-mix(in srgb, ${props.ev.tint} 80%, transparent))`,
  boxShadow: `0 0 8px color-mix(in srgb, ${props.ev.tint} 53%, transparent)`,
  transition: barInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));
const claimBtnStyle = computed<CSSProperties>(() => ({
  height: "48px",
  background: props.ev.tint,
  boxShadow: `0 0 24px color-mix(in srgb, ${props.ev.tint} 40%, transparent)`,
}));
const claimedPillStyle = computed<CSSProperties>(() => ({
  height: "48px",
  background: `color-mix(in srgb, ${props.ev.tint} 6%, transparent)`,
}));
const joinBtnStyle = computed<CSSProperties>(() => ({
  height: "48px",
  background: props.ev.tint,
  boxShadow: `0 0 24px color-mix(in srgb, ${props.ev.tint} 33%, transparent)`,
}));
</script>
