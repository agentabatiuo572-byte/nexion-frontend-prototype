<template>
  <view v-if="knownRank" class="team-rank-emblem" aria-hidden="true" :style="sizeStyle"><view class="team-rank-emblem__art" :style="emblemStyle" /></view>
  <view v-else class="team-rank-emblem team-rank-emblem--unknown" aria-hidden="true" :style="sizeStyle"><text>{{ rank == null ? '—' : `V${rank}` }}</text></view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ rank: number | null | undefined; size?: number }>(), { size: 64 });
const knownRank = computed(() => typeof props.rank === 'number' && Number.isInteger(props.rank) && props.rank >= 0 && props.rank <= 8);
const sizeStyle = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }));
// Each generated emblem has its own bounds; equal thirds include the next row's tips.
const bounds = [[80,61,352,373],[476,45,777,390],[882,42,1191,392],
  [25,428,409,780],[465,452,789,778],[849,417,1222,780],
  [43,802,379,1180],[424,803,827,1180],[827,794,1239,1191]];
const emblemStyle = computed(() => {
  const [x0,y0,x1,y1] = bounds[props.rank ?? 0] ?? bounds[0];
  const scale = props.size * .92 / Math.max(x1-x0,y1-y0);
  return { width: `${(x1-x0)*scale}px`, height: `${(y1-y0)*scale}px`,
    backgroundSize: `${1254*scale}px ${1254*scale}px`, backgroundPosition: `${-x0*scale}px ${-y0*scale}px` };
});
</script>

<style scoped>
.team-rank-emblem { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.team-rank-emblem__art { background-image: url('/static/img/team-20261025/rank-badges-atlas.png'); background-repeat: no-repeat; }
.team-rank-emblem--unknown { display: grid; place-items: center; background-image: none; font: 600 16px/1 var(--font-v5); color: var(--v5-ink-2); }
</style>
