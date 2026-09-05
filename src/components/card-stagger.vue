<!--
  CardStagger — card-level stagger entrance (ported from
  Nexion-prototype/app/components/card-stagger.tsx; framer-motion → CSS).

  Wraps a vertical card list; each direct child fades + slides up with a small
  stagger so the page "builds in" one card at a time. Pass the same class/style
  you'd give the parent <view>; the cadence is driven by --nx-cs-step (the
  `stagger` prop, seconds) via per-nth-child animation-delay.

  Simplification vs source: the back-nav skip optimization (useNavMemory) is
  dropped — not essential for the sample, and it avoided porting an extra store.
  prefers-reduced-motion is honored via CSS (animation disabled).
-->
<template>
  <view class="nx-card-stagger" :style="staggerVar">
    <slot />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ stagger?: number }>(), { stagger: 0.05 });

const staggerVar = computed(() => ({ "--nx-cs-step": `${props.stagger}s` }));
</script>

<style>
.nx-card-stagger > * {
  animation: nx-card-stagger-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 0.08s;
}
.nx-card-stagger > *:nth-child(1) { animation-delay: calc(0.08s + 0 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(2) { animation-delay: calc(0.08s + 1 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(3) { animation-delay: calc(0.08s + 2 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(4) { animation-delay: calc(0.08s + 3 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(5) { animation-delay: calc(0.08s + 4 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(6) { animation-delay: calc(0.08s + 5 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(7) { animation-delay: calc(0.08s + 6 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(8) { animation-delay: calc(0.08s + 7 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(9) { animation-delay: calc(0.08s + 8 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(10) { animation-delay: calc(0.08s + 9 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(11) { animation-delay: calc(0.08s + 10 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(12) { animation-delay: calc(0.08s + 11 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(13) { animation-delay: calc(0.08s + 12 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(14) { animation-delay: calc(0.08s + 13 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(15) { animation-delay: calc(0.08s + 14 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(16) { animation-delay: calc(0.08s + 15 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(17) { animation-delay: calc(0.08s + 16 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(18) { animation-delay: calc(0.08s + 17 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(19) { animation-delay: calc(0.08s + 18 * var(--nx-cs-step, 0.05s)); }
.nx-card-stagger > *:nth-child(20) { animation-delay: calc(0.08s + 19 * var(--nx-cs-step, 0.05s)); }

@media (prefers-reduced-motion: reduce) {
  .nx-card-stagger > * { animation: none; }
}
</style>
