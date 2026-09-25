<!-- Availability notice; this page does not attempt an external market connection. -->
<template>
  <view v-if="open" class="nx-os-overlay" role="dialog" aria-modal="true" :aria-label="t.marketplace.openSeaTitle" @click="emitClose">
    <view class="nx-os-card" @click.stop>
      <text class="nx-os-title">{{ t.marketplace.openSeaTitle }}</text>
      <text class="nx-os-message">{{ t.marketplace.openSeaErrorPool.rateLimit }}</text>
      <text class="nx-os-message">{{ t.marketplace.openSeaErrorSub }}</text>
      <view class="nx-os-back" role="button" tabindex="0" :aria-label="t.marketplace.openSeaBack" @click="emitClose" @keydown.enter.prevent="emitClose" @keydown.space.prevent="emitClose">
        <text>{{ t.marketplace.openSeaBack }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [boolean] }>();
const t = useT();
function emitClose() { emit("update:open", false); }
useDialogA11y(computed(() => props.open), ".nx-os-overlay", emitClose);
</script>

<style scoped>
.nx-os-overlay { position: fixed; inset: 0; z-index: 790; display: flex; align-items: center; justify-content: center; padding: 0 20px; background: var(--v5-bg-color-mask); backdrop-filter: blur(8px); }
.nx-os-card { width: 100%; max-width: 360px; border-radius: 16px; background: var(--v5-surface); padding: 24px; text-align: center; }
.nx-os-title { display: block; font-size: 20px; font-weight: 600; color: var(--v5-ink); }
.nx-os-message { display: block; margin-top: 12px; font-size: 13px; line-height: 1.6; color: var(--v5-ink-2); }
.nx-os-back { display: flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 20px; border-radius: 999px; background: var(--v5-brand); color: var(--v5-on-brand); font-size: 14px; font-weight: 600; }
</style>
