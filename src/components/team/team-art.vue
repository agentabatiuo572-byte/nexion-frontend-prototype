<template>
  <view class="team-art" aria-hidden="true" :style="artStyle" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
const positions = { invite: 0, members: 1, gift: 2, coupon: 3, spark: 4, podium: 5, balance: 6, ledger: 7, growth: 8 } as const;
const props = withDefaults(defineProps<{ kind: keyof typeof positions; size?: number }>(), { size: 112 });
const artStyle = computed(() => {
  const index = positions[props.kind];
  return { width: `${props.size}px`, height: `${props.size}px`, backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%` };
});
</script>

<style scoped>
.team-art { flex: 0 0 auto; max-width: 100%; background-image: url('/static/img/team-20261025/team-art-atlas.png'); background-size: 300% 300%; background-repeat: no-repeat; pointer-events: none; }
</style>
