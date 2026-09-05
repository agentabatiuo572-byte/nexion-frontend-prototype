<!--
  TrustDocRow — audit/reserve doc row: primary + secondary + a "download/view"
  CTA chip. Ported from the inline Row in Nexion-prototype trust/page.tsx. Links
  are theatre (href "#"); tap is a no-op here.
-->
<template>
  <view class="block active:opacity-80" :style="rowStyle">
    <view class="flex items-start justify-between" style="gap: 8px">
      <view class="min-w-0" style="flex: 1">
        <text class="block" :style="primaryStyle">{{ primary }}</text>
        <text class="block" :style="secondaryStyle">{{ secondary }}</text>
      </view>
      <view class="flex items-center shrink-0" :style="ctaStyle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></svg>
        <text style="margin: 0 4px">{{ cta }}</text>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{ primary: string; secondary: string; cta: string; last?: boolean }>(),
  { last: false },
);

const rowStyle = computed<CSSProperties>(() => ({
  padding: "12px 16px",
  borderBottom: props.last ? "none" : "1px solid var(--v5-border)",
}));
const primaryStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const secondaryStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px", lineHeight: 1.375 };
const ctaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand)" };
</script>
