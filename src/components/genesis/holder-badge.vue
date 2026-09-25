<template>
  <view class="genesis-holder-badge">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg>
    <text>{{ t.genesisHolder.identityLabel }}</text>
  </view>
</template>

<script setup lang="ts">
import { useT } from "@/i18n/use-t";
const t = useT();
</script>

<style scoped>
.genesis-holder-badge { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; border-radius: var(--v5-radius-full); color: var(--v5-genesis-gold); background: color-mix(in srgb, var(--v5-genesis-gold) 10%, transparent); font-family: var(--font-v5); font-size: var(--v5-type-caption); font-weight: 500; line-height: 1.5; max-width: 100%; }
.genesis-holder-badge svg { flex-shrink: 0; }
</style>
