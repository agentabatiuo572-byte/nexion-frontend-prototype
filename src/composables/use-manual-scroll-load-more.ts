import { nextTick, onMounted, onUnmounted, watch, type Ref } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";

type ScrollHost = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight" | "addEventListener" | "removeEventListener">;

export interface ManualScrollLoadMoreOptions {
  enabled: () => boolean;
  hasMore: () => boolean;
  loading: () => boolean;
  loadMore: () => Promise<void>;
  thresholdPx?: number;
}

function resolveElement(value: unknown): { closest?: (selector: string) => ScrollHost | null } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { $el?: unknown };
  const element = raw.$el ?? value;
  return element && typeof element === "object" ? element as { closest?: (selector: string) => ScrollHost | null } : null;
}

/**
 * Binds only to AppChassis' actual scrolling element. Intersection observers
 * intentionally do not participate: their H5 fallback is true and can drain
 * every remote page without a user scroll.
 */
export function attachManualScrollLoadMore(anchor: unknown, options: ManualScrollLoadMoreOptions): () => void {
  const host = resolveElement(anchor)?.closest?.(".nx-content");
  if (!host) return () => undefined;

  const thresholdPx = options.thresholdPx ?? 96;
  let lastScrollTop = host.scrollTop;
  let requesting = false;
  let intentUntil = 0;
  let touchY: number | null = null;
  const arm = () => { intentUntil = Date.now() + 1500; };
  const onWheel: EventListener = event => { if ((event as WheelEvent).deltaY > 0) arm(); };
  const onKey: EventListener = event => {
    const key = event as KeyboardEvent;
    if (["ArrowDown", "PageDown", "End"].includes(key.key) || (key.key === " " && !key.shiftKey)) arm();
  };
  const onTouchStart: EventListener = event => { touchY = (event as TouchEvent).touches?.[0]?.clientY ?? null; };
  const onTouchMove: EventListener = event => {
    const y = (event as TouchEvent).touches?.[0]?.clientY;
    if (typeof y === "number" && touchY !== null && y < touchY) arm();
    touchY = y ?? null;
  };
  // A pointerdown on the host can be a blank-area click, not a scrollbar
  // drag. Do not arm it; manual load-more remains available for that input.

  const requestMore = async () => {
    if (requesting || !options.enabled() || !options.hasMore() || options.loading()) return;
    requesting = true;
    try {
      await options.loadMore();
    } catch {
      // The pager retains loaded rows and exposes its own recoverable error.
    } finally {
      requesting = false;
    }
  };

  const onScroll: EventListener = () => {
    const nextScrollTop = host.scrollTop;
    const movedDown = nextScrollTop > lastScrollTop;
    lastScrollTop = nextScrollTop;
    const remaining = host.scrollHeight - host.clientHeight - nextScrollTop;
    if (movedDown && remaining <= thresholdPx && Date.now() < intentUntil) {
      intentUntil = 0;
      void requestMore();
    }
  };

  const listeners: Array<[string, EventListener]> = [["scroll", onScroll], ["wheel", onWheel],
    ["keydown", onKey], ["touchstart", onTouchStart], ["touchmove", onTouchMove]];
  for (const [name, listener] of listeners) host.addEventListener(name, listener, { passive: true });
  return () => { intentUntil = 0; for (const [name, listener] of listeners) host.removeEventListener(name, listener); };
}

/**
 * A page-level wrapper for conditional template anchors. It reattaches after
 * Vue has rendered the anchor, detaches while hidden, and leaves a returned
 * manual action for platforms without a DOM scroll container.
 */
export function useManualScrollLoadMore(anchor: Ref<unknown>, options: ManualScrollLoadMoreOptions) {
  let detach: () => void = () => {};
  let revision = 0;
  let active = true;

  const rebind = () => {
    const currentRevision = ++revision;
    detach();
    void nextTick(() => {
      if (!active || currentRevision !== revision) return;
      detach = attachManualScrollLoadMore(anchor.value, options);
    });
  };
  const activate = () => { active = true; rebind(); };
  const deactivate = () => { active = false; revision++; detach(); };

  onMounted(activate);
  onShow(activate);
  onHide(deactivate);
  onUnmounted(deactivate);
  watch(anchor, () => { if (active) rebind(); });

  async function loadMoreManually() {
    if (!options.enabled() || !options.hasMore() || options.loading()) return;
    await options.loadMore();
  }

  return { loadMoreManually, rebind };
}
