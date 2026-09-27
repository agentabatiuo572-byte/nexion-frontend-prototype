<!-- Numbered campaign artwork and unnumbered holding artwork have separate sources. -->
<template>
  <view class="genesis-artwork" :class="`genesis-artwork--${variant}`" :data-art-context="context">
    <image class="genesis-artwork__image" :src="source" mode="aspectFit" aria-hidden="true" />
    <!-- i18n-en-ok: No. is the credential serial prefix, not translated product copy. -->
    <text v-if="serialText" class="genesis-artwork__serial">{{ serialText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { GENESIS_MEDIA, formatGenesisSerial } from "@/lib/product-media";

const props = withDefaults(defineProps<{
  context?: "showcase" | "holding";
  variant?: "square" | "banner";
  serial?: string | number;
}>(), { context: "showcase", variant: "square" });

const source = computed(() => GENESIS_MEDIA[props.context]);
const serialText = computed(() => props.context === "holding" ? formatGenesisSerial(props.serial) : "");
</script>

<style scoped>
.genesis-artwork { position: relative; overflow: hidden; background: var(--v5-surface-2); }
.genesis-artwork--square { aspect-ratio: 1; }
.genesis-artwork--banner { aspect-ratio: 1.5; }
.genesis-artwork__image { position: absolute; inset: 0; width: 100%; height: 100%; }
.genesis-artwork__serial { position: absolute; bottom: 8px; right: 8px; max-width: calc(100% - 16px); box-sizing: border-box; padding: 4px 7px; border-radius: 5px; background: var(--v5-surface); color: var(--v5-ink); font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
</style>
