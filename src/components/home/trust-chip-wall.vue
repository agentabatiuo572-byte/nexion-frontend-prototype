<template>
  <view class="nx-glass-card block active:opacity-75" :style="cardStyle" role="link" tabindex="0" @click="goTrust" @keydown.enter.stop.prevent="goTrust">
    <view class="flex items-start" style="gap: 12px">
      <view class="grid place-items-center" :style="iconStyle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </view>
      <view>
        <text class="block" :style="titleStyle">{{ t.home.trustSnapshotTitle }}</text>
        <text class="block" :style="subtitleStyle">{{ t.home.trustSnapshotOpen }} ›</text>
      </view>
    </view>
    <text class="block" :style="bodyStyle">{{ t.home.trustSnapshotUnavailable }}</text>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { navTo } from "@/lib/route";
import { useT } from "@/i18n/use-t";

const t = useT();
const goTrust = () => navTo("/pages/trust/trust");
const cardStyle: CSSProperties = { padding: "14px", borderRadius: "16px", background: "var(--v5-surface)" };
const iconStyle: CSSProperties = { width: "32px", height: "32px", flexShrink: 0, borderRadius: "10px", background: "var(--v5-brand-soft)" };
const titleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const subtitleStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-brand)" };
const bodyStyle: CSSProperties = { marginTop: "9px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };


</script>
