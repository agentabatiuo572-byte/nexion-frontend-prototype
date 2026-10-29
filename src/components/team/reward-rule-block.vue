<template>
  <view class="reward-rule" :class="{ 'reward-rule--section': !!$slots.default, 'reward-rule--step': n !== undefined }">
    <view v-if="q" class="reward-rule__question" role="button" tabindex="0" :aria-expanded="open" @click="open = !open" @keydown.enter.prevent="open = !open" @keydown.space.prevent="open = !open">
      <text>{{ q }}</text><text aria-hidden="true">{{ open ? '−' : '+' }}</text>
    </view>
    <view v-else-if="title || label" class="reward-rule__heading">
      <text v-if="n !== undefined" class="reward-rule__number">{{ n }}</text>
      <view v-else-if="$slots.icon" class="reward-rule__icon" aria-hidden="true"><slot name="icon" /></view>
      <text>{{ title || label }}</text>
    </view>
    <view v-if="!q || open" class="reward-rule__body">
      <text v-if="a || body" class="reward-rule__copy">{{ a || body }}</text>
      <slot />
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
defineProps<{ title?: string; label?: string; body?: string; q?: string; a?: string; n?: number; accent?: string; tone?: string }>();
const open = ref(false);
</script>
<style scoped>
.reward-rule { color: var(--v5-ink); padding: var(--ui-space-row-y) 0; border-bottom: 1px solid var(--v5-border); }
.reward-rule--section { margin: 0 16px; padding: 22px 0; }
.reward-rule__heading { display: flex; align-items: center; gap: 9px; font-size: var(--ui-type-subheading); font-weight: var(--ui-type-subheading-weight); line-height: 1.5; margin-bottom: var(--ui-space-row-y); }
.reward-rule__number { color: var(--v5-ink-3); font-size: 12px; font-variant-numeric: tabular-nums; min-width: 20px; }
.reward-rule__icon { display: flex; color: var(--v5-ink-2); flex-shrink: 0; }
.reward-rule__body, .reward-rule__copy { color: var(--v5-ink-2); font-size: var(--ui-type-long-form); line-height: var(--ui-type-long-form-lh); white-space: pre-line; overflow-wrap: anywhere; }
.reward-rule__copy { display: block; }
.reward-rule__question { display: flex; justify-content: space-between; align-items: center; gap: var(--ui-space-inset); min-height: 44px; font-size: 14px; line-height: 1.5; cursor: pointer; }
.reward-rule__question:focus-visible { outline: 2px solid var(--reward-accent, #c5f45a); outline-offset: 2px; }
</style>
