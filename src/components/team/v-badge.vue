<template>
  <view class="nx-vbadge" :class="`nx-vbadge--${size}`">
    <TeamRankEmblem :rank="v" :size="emblemSize" />
    <text class="nx-vbadge__level">V{{ v }}</text>
    <text v-if="showTitle && vRank.remoteReady" class="nx-vbadge__title">{{ rankTitle(v, locale.code, vRank.ladder) }}</text>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import TeamRankEmblem from './team-rank-emblem.vue';
import { useVRank, type VRank } from '@/store/v-rank';
import { rankTitle } from '@/lib/v-rank-copy';
import { useLocaleStore } from '@/store/locale';
const props = withDefaults(defineProps<{ v: VRank; size?: 'sm' | 'md' | 'lg'; showTitle?: boolean }>(), { size: 'md', showTitle: true });
const vRank = useVRank();
const locale = useLocaleStore();
const emblemSize = computed(() => ({ sm: 24, md: 30, lg: 40 })[props.size]);
</script>
<style scoped>
.nx-vbadge { display:inline-flex;align-items:center;gap:6px;max-width:100%;vertical-align:middle;color:var(--v5-ink);font:500 12px/1.5 var(--font-v5); }
.nx-vbadge__level { flex:none;font-variant-numeric:tabular-nums;font-weight:600; }
.nx-vbadge__title { min-width:0;overflow-wrap:anywhere;color:var(--v5-ink-2); }
.nx-vbadge--lg { font-size:14px;gap:8px; }
</style>
