<template>
  <view class="rank-icon" :aria-label="`V${v}`">
    <TeamRankEmblem :rank="v" :size="size" />
  </view>
</template>
<script setup lang="ts">
import TeamRankEmblem from './team-rank-emblem.vue';
withDefaults(defineProps<{ v: number; size?: number }>(), { size: 32 });
</script>
<style scoped>
.rank-icon { display:inline-flex;align-items:center;flex:none;vertical-align:middle; }
</style>
