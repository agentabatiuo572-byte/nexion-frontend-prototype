<template>
  <EarnWayCard v-if="enabled && context === 'earn'" eyebrow="DESKTOP" :title="remainderCopy.earnWays.gpuTitle"
    :body="remainderCopy.earnWays.gpuBody" :action="remainderCopy.earnWays.gpuAction"
    image="/static/img/earn-20261027/gpu.webp" :notice="slotsFull ? t.computeShare.entryFull : undefined"
    data-proof="compute-share-entry" @click="goDownload" />
  <view v-else-if="enabled" class="nx-glass-card compute-share-entry" :class="{ 'mx-4': context === 'devices' }" :style="rootStyle" data-proof="compute-share-entry">
    <view :style="iconStyle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    <NxButton class="compute-share-entry__cta" size="small" :label="t.computeShare.entryCta" @click="goDownload" />
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import NxButton from "@/components/ui/nx-button.vue";
import EarnWayCard from "./earn-way-card.vue";
import { computed, type CSSProperties } from "vue";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { trialReservesSlotNow } from "@/store/free-trial";
import { useT } from "@/i18n/use-t";
import { useRemainderUiCopy } from "@/i18n/remainder-ui";

withDefaults(defineProps<{ context?: "earn" | "devices" }>(), { context: "earn" });

const app = useApp();
const cfg = useConfig();
const t = useT();
const remainderCopy = useRemainderUiCopy();

const enabled = computed(() => cfg.configStatus === "ready" && cfg.isEnabled("computeShareEnabled"));
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsFull = computed(() => app.activeSlotCount + trialSlot.value >= app.slotCap);

function goDownload() {
  if (!enabled.value) return;
  navTo("/pages/compute-share/download");
}

const rootStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  display: "grid",
  gridTemplateColumns: "40px minmax(0, 1fr)",
  alignItems: "center",
  gap: "12px",
  marginTop: "12px",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
  padding: "12px",
};
const iconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "10px",
  display: "grid",
  placeItems: "center",
  background: "var(--v5-surface-2)",
  flexShrink: 0,
};
const eyebrowStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-2)",
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
  color: "var(--v5-ink-2)",
};


</script>

<style scoped>
.compute-share-entry__cta { grid-column: 2; justify-self: start; max-width: 100%; }
</style>
