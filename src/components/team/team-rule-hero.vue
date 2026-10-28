<template>
  <view class="team-rule-hero">
    <view class="team-rule-hero__heading">
      <text class="team-rule-hero__title">{{ title || label }}</text>
      <TeamArt :kind="kind" :size="64" class="team-rule-hero__art" />
    </view>
    <text v-if="sub" class="team-rule-hero__intro">{{ sub }}</text>
  </view>
</template>
<script setup lang="ts">
import TeamArt from '@/components/team/team-art.vue';
defineProps<{ kind: 'members' | 'balance' | 'ledger'; label?: string; title?: string; sub?: string; accent?: string }>();
</script>
<style src="./team-rule-type.css"></style>
<style scoped>
.team-rule-hero { margin: 8px 16px 20px; padding: 16px; background: var(--v5-surface); border-radius: 16px; }
.team-rule-hero__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.team-rule-hero__title { flex: 1; min-width: 0; font-size: var(--team-guide-hero); font-weight: 600; line-height: var(--team-guide-hero-lh); color: var(--v5-ink); text-wrap: balance; overflow-wrap: anywhere; }
.team-rule-hero__art { --team-art-size: var(--team-guide-art-size); flex: 0 0 var(--team-guide-art-size); }
.team-rule-hero__intro { display: block; margin-top: 12px; color: var(--v5-ink-2); font-size: var(--team-guide-body); line-height: var(--team-guide-body-lh); white-space: pre-line; text-wrap: pretty; overflow-wrap: anywhere; }
@media (max-width: 339px) { .team-rule-hero { padding: 14px; } }
</style>
