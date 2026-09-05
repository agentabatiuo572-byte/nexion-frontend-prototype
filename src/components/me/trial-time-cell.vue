<!--
  TrialTimeCell — a single countdown cell (2-digit number + unit) for the trial
  countdown hero. Ported from the inline TimeCell in Nexion-prototype me/trial/page.tsx.
-->
<template>
  <view class="text-center" :style="cellStyle">
    <text class="block" :style="numStyle">{{ padded }}</text>
    <text class="block" :style="unitStyle">{{ unit }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = defineProps<{ n: number; unit: string }>();
const padded = computed(() => String(props.n).padStart(2, "0"));

const cellStyle: CSSProperties = { borderRadius: "8px", background: "var(--v5-surface-2)", padding: "8px 0" };
const numStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "20px", fontWeight: 600, color: "var(--v5-ink)" };
const unitStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
</script>
