import { ref, onMounted, onUnmounted } from "vue";

/**
 * useNow — a counter that increments once per second from 0 (ported from
 * mission-control.tsx useNow; React useState/useEffect → Vue ref/onMounted).
 * Used to drive mock countdown labels that re-render every tick.
 */
export function useNow() {
  const n = ref(0);
  let id: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    id = setInterval(() => {
      n.value += 1;
    }, 1000);
  });
  onUnmounted(() => {
    if (id) clearInterval(id);
  });
  return n;
}
