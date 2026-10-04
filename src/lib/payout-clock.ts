/** Visible-page clock. A stale server boundary is requested at most once;
 * failures remain on the page's explicit retry path instead of polling forever. */
export function createPayoutClock(options: {
  tick: (now: number) => void;
  nextPayoutAt: () => number;
  refresh: () => unknown | Promise<unknown>;
}) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let refreshedBoundary: number | null = null;
  let epoch = 0;
  function tick() {
    const now = Date.now();
    options.tick(now);
    const next = options.nextPayoutAt();
    if (!Number.isFinite(next) || next <= 0 || now < next || next === refreshedBoundary) return;
    refreshedBoundary = next;
    const requestEpoch = epoch;
    void Promise.resolve().then(() => {
      if (timer !== null && epoch === requestEpoch) return options.refresh();
    }).catch(() => undefined);
  }
  return {
    start() {
      if (timer !== null) return;
      tick();
      timer = setInterval(tick, 1000);
    },
    stop() {
      epoch += 1;
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}
