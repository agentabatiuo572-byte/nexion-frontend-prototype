import { inject, ref, onMounted, onUnmounted } from "vue";
import { onShow, onHide, TAB_LIFECYCLE } from "./use-tab-page-lifecycle";

/**
 * Current Unix time in seconds, refreshed once per second. Re-reading the
 * clock instead of incrementing a counter prevents timer throttling from
 * making eligibility countdowns drift while the App is backgrounded.
 */
export function useNow() {
  const n = ref(Math.floor(Date.now() / 1000));
  let id: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (id !== null) clearInterval(id); id = null; };
  const start = () => {
    n.value = Math.floor(Date.now() / 1000);
    if (id !== null) return;
    id = setInterval(() => {
      n.value = Math.floor(Date.now() / 1000);
    }, 1000);
  };
  if (inject(TAB_LIFECYCLE, null)) { onShow(start); onHide(stop); }
  else onMounted(start);
  onUnmounted(stop);
  return n;
}
