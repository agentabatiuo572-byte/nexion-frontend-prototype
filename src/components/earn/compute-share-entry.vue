<template>
  <view v-if="enabled" class="mx-4" :style="rootStyle" data-proof="compute-share-entry">
    <view :style="iconStyle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 21h8" />
        <path d="m12 16 1 5" />
        <path d="m12 16-1 5" />
      </svg>
    </view>
    <view class="min-w-0" style="flex: 1">
      <text class="block" :style="eyebrowStyle">{{ t.computeShare.entryEyebrow }}</text>
      <text class="block" :style="titleStyle">{{ t.computeShare.entryTitle }}</text>
      <text class="block" :style="bodyStyle">{{ slotsFull ? t.computeShare.entryFull : t.computeShare.entryBody }}</text>
    </view>
    <view class="active:opacity-85" :style="ctaStyle" @click="goDownload">
      <text>{{ t.computeShare.entryCta }}</text>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { MAX_DEVICES } from "@/store/device-types";
import { trialReservesSlotNow } from "@/store/free-trial";
import { useT } from "@/i18n/use-t";

withDefaults(defineProps<{ context?: "earn" | "devices" }>(), { context: "earn" });

const app = useApp();
const cfg = useConfig();
const t = useT();

const enabled = computed(() => cfg.isEnabled("computeShareEnabled"));
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsFull = computed(() => app.activeSlotCount + trialSlot.value >= MAX_DEVICES);

function goDownload() {
  uni.navigateTo({ url: "/pages/compute-share/download", fail: () => {} });
}

const rootStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginTop: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 8%, var(--v5-surface))",
  padding: "12px",
};
const iconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "10px",
  display: "grid",
  placeItems: "center",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 13%, transparent)",
  flexShrink: 0,
};
const eyebrowStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-tech-cyan-ink)",
  letterSpacing: "0.06em",
};
const titleStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const bodyStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  lineHeight: 1.35,
  color: "var(--v5-ink-3)",
};
const ctaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  minHeight: "36px",
  padding: "0 10px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-tech-cyan-ink)",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  flexShrink: 0,
};
</script>
