<template>
  <view class="reward-hero" :class="{ 'reward-hero--guide': title, 'reward-hero--panel': panel }">
    <view class="reward-hero__top">
      <view class="reward-hero__copy">
        <text v-if="label" class="reward-hero__label">{{ label }}</text>
        <text v-if="title" class="reward-hero__title">{{ title }}</text>
        <slot />
      </view>
      <TeamArt :kind="kind" :size="88" class="reward-hero__art" />
    </view>
    <text v-if="sub" class="reward-hero__sub">{{ sub }}</text>
    <slot name="footer" />
  </view>
</template>
<script setup lang="ts">
import TeamArt from '@/components/team/team-art.vue';
withDefaults(defineProps<{ kind: 'members' | 'balance' | 'ledger'; label?: string; title?: string; sub?: string; accent?: string; panel?: boolean }>(), { label: '', title: '', sub: '', panel: false });
</script>
<style scoped>
.reward-hero { padding: 14px 0 18px; border-bottom: 1px solid var(--v5-border); }
.reward-hero--guide { margin: 0 16px; }
.reward-hero--panel { padding: 18px; border: 1px solid var(--reward-panel-edge); border-radius: 20px; background: var(--reward-panel); }
.reward-hero__top { display: flex; align-items: center; gap: var(--ui-space-inline); }
.reward-hero__copy { flex: 1; min-width: 0; }
.reward-hero__art { flex: 0 0 88px; pointer-events: none; }
.reward-hero__label { display: block; color: var(--v5-ink-2); font-size: 13px; line-height: 1.5; }
.reward-hero__title { display: block; margin-top: 8px; color: var(--v5-ink); font-size: 22px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.reward-hero__sub { display: block; margin-top: var(--ui-space-inline); color: var(--v5-ink-2); font-size: 13px; line-height: 1.7; white-space: pre-line; }
</style>
