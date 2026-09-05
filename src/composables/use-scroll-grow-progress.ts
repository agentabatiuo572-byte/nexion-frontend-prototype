import { ref, onMounted, onUnmounted } from "vue";

/**
 * useScrollGrowProgress — IntersectionObserver-driven progress-bar entrance
 * (ported from Nexion-prototype/lib/hooks/use-scroll-grow-progress.ts;
 * React useRef/useEffect → Vue ref/onMounted).
 *
 * Returns `{ elRef, inView }`. Attach `elRef` to the bar track <view> and render
 * the fill width as `inView ? pct : 0`, with `transition: inView ?
 * PROGRESS_GROW_TRANSITION : 'none'` so the bar grows 0 → pct each time it
 * scrolls into view and snaps back to 0 on exit (fresh replay on re-entry).
 *
 * Cross-end note: H5 webview has IntersectionObserver. On App webview where it
 * is unavailable, `inView` defaults to true (bars show final width, no grow
 * animation) — a safe degradation rather than bars stuck at 0.
 */
export function useScrollGrowProgress(options: { threshold?: number } = {}) {
  const threshold = options.threshold ?? 0.25;
  const elRef = ref<HTMLElement | null>(null);
  const inView = ref(false);
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (typeof IntersectionObserver === "undefined") {
      // No IO (e.g. App webview) → show final state without the grow animation.
      inView.value = true;
      return;
    }
    // uni H5 PITFALL (P-019): a template ref on a <view> yields the component
    // instance, NOT the raw DOM node (plain Vue/web gives the Element directly).
    // Resolve via $el so IntersectionObserver.observe() gets a real Element.
    const raw = elRef.value as unknown;
    const el: Element | null =
      raw instanceof Element
        ? raw
        : (raw as { $el?: unknown } | null)?.$el instanceof Element
          ? (raw as { $el: Element }).$el
          : null;
    if (!el) {
      // Couldn't resolve an element → show final state rather than stay at 0.
      inView.value = true;
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        inView.value = entries[0]?.isIntersecting ?? false;
      },
      { threshold },
    );
    observer.observe(el);
  });

  onUnmounted(() => {
    observer?.disconnect();
    observer = null;
  });

  return { elRef, inView };
}

/** Shared transition spec — keeps all progress bars in sync.
 *  1400ms easeOutExpo: fast start, gentle settle. */
export const PROGRESS_GROW_TRANSITION = "width 1400ms cubic-bezier(0.16, 1, 0.3, 1)";
