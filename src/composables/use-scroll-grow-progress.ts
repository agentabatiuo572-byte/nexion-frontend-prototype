import { ref, watch, onMounted, onUnmounted } from "vue";

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
 * animation). Network readers pass `fallbackInView: false` and keep an explicit
 * per-item action when visibility cannot be observed.
 */
export function useScrollGrowProgress(options: { threshold?: number; fallbackInView?: boolean } = {}) {
  const threshold = options.threshold ?? 0.25;
  const fallbackInView = options.fallbackInView ?? true;
  const elRef = ref<HTMLElement | null>(null);
  const inView = ref(false);
  let observer: IntersectionObserver | null = null;
  let stopObserving: (() => void) | undefined;

  onMounted(() => {
    if (typeof IntersectionObserver === "undefined") {
      // Progress bars keep their final state; network reads must stay opt-in.
      inView.value = fallbackInView;
      return;
    }
    // uni H5 PITFALL (P-019): a template ref on a <view> yields the component
    // instance, NOT the raw DOM node (plain Vue/web gives the Element directly).
    // Resolve via $el so IntersectionObserver.observe() gets a real Element.
    // API-backed cards can mount after the page's mounted hook. Rebind when their ref appears.
    stopObserving = watch(elRef, (value, _previous, onCleanup) => {
      const raw = value as unknown;
      const el: Element | null =
        typeof Element !== "undefined" && raw instanceof Element
          ? raw
          : typeof Element !== "undefined" && (raw as { $el?: unknown } | null)?.$el instanceof Element
            ? (raw as { $el: Element }).$el
            : null;
      if (!el) {
        // Couldn't resolve an element → show final state rather than stay at 0.
        inView.value = fallbackInView;
        return;
      }
      inView.value = false;
      observer = new IntersectionObserver(
        (entries) => {
          inView.value = entries[0]?.isIntersecting ?? false;
        },
        { threshold },
      );
      observer.observe(el);
      onCleanup(() => {
        observer?.disconnect();
        observer = null;
      });
    }, { immediate: true, flush: 'post' });
  });

  onUnmounted(() => {
    stopObserving?.();
    observer?.disconnect();
    observer = null;
  });

  return { elRef, inView };
}

/** Shared transition spec — keeps all progress bars in sync.
 *  1400ms easeOutExpo: fast start, gentle settle. */
export const PROGRESS_GROW_TRANSITION = "width 1400ms cubic-bezier(0.16, 1, 0.3, 1)";

/* Data-visual entrance (design system 07 · DS-29). Bind values as
 * `inView === false ? 0 : value` so renders without an observer show the final state. */
/** Columns and pedestals grow upward. */
export const VIZ_GROW_HEIGHT_TRANSITION = "height 1100ms cubic-bezier(0.16, 1, 0.3, 1)";
/** Rings sweep their arc through the registered `--nx-viz-ring` (tokens.css). */
export const VIZ_RING_TRANSITION = "--nx-viz-ring 1400ms cubic-bezier(0.16, 1, 0.3, 1)";
/** Sibling marks (columns, bars, dots) start 80ms apart, capped so long sets still finish quickly. */
export function vizStagger(index: number, stepMs = 80, maxMs = 480): string {
  return `${Math.min(index * stepMs, maxMs)}ms`;
}
