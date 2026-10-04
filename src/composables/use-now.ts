import { ref, onMounted, onUnmounted } from "vue";

/**
 * Current Unix time in seconds, refreshed once per second. Re-reading the
 * clock instead of incrementing a counter prevents timer throttling from
 * making eligibility countdowns drift while the App is backgrounded.
 */
export function useNow() {
  const n = ref(Math.floor(Date.now() / 1000));
  let id: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    id = setInterval(() => {
      n.value = Math.floor(Date.now() / 1000);
    }, 1000);
  });
  onUnmounted(() => {
    if (id) clearInterval(id);
  });
  return n;
}
