import { ref, watch, onMounted, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";

/**
 * useTicker — a number that drifts upward on an interval, re-syncing to `start`
 * when it jumps materially (ported from mission-control.tsx useTicker;
 * React useState/useEffect → Vue ref/watch/onMounted).
 *
 * `start` may be a number, ref, or getter (reactive). Mock consumers may use a
 * deterministic increment for animation. Remote consumers pass `animate=false`,
 * which makes the displayed value an exact projection of the server snapshot.
 */
export function useTicker(
  start: MaybeRefOrGetter<number>,
  increment: number,
  interval = 1500,
  animate = true,
) {
  const v = ref(toValue(start));
  let id: ReturnType<typeof setInterval> | null = null;

  watch(
    () => toValue(start),
    (s) => {
      if (!animate || Math.abs(v.value - s) > increment * 100) v.value = s;
    },
  );

  onMounted(() => {
    if (!animate) return;
    id = setInterval(() => {
      v.value += increment;
    }, interval);
  });
  onUnmounted(() => {
    if (id) clearInterval(id);
  });

  return v;
}
