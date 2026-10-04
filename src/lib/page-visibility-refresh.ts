export type PageRefreshReason = "initial" | "return";

export interface PageVisibilityRefresh {
  mounted(): void;
  shown(): void;
  hidden(): void;
}

export interface PageVisibilityLifecycleRegistrars {
  mounted(callback: () => void): void;
  shown(callback: () => void): void;
  hidden(callback: () => void): void;
}

/**
 * One page instance can receive `mounted` and `onShow` in either order.
 * Refresh once for that first visibility, then once per real hide → show
 * return. A missing initial onShow cannot consume the first later return.
 */
export function createPageVisibilityRefresh(
  refresh: (reason: PageRefreshReason) => void,
): PageVisibilityRefresh {
  let initialRefreshDone = false;
  let visible = false;
  let hiddenAfterInitialRefresh = false;

  function initial(): void {
    if (initialRefreshDone) return;
    initialRefreshDone = true;
    refresh("initial");
  }

  return {
    mounted(): void {
      initial();
    },
    shown(): void {
      if (!initialRefreshDone) {
        initial();
        visible = true;
        return;
      }
      if (visible) return;
      visible = true;
      if (hiddenAfterInitialRefresh) refresh("return");
    },
    hidden(): void {
      if (!initialRefreshDone) return;
      visible = false;
      hiddenAfterInitialRefresh = true;
    },
  };
}

/** Registers one page instance with both Vue and UniApp lifecycle hooks. */
export function bindPageVisibilityRefresh(
  lifecycle: PageVisibilityRefresh,
  registrars: PageVisibilityLifecycleRegistrars,
): void {
  registrars.mounted(lifecycle.mounted);
  registrars.shown(lifecycle.shown);
  registrars.hidden(lifecycle.hidden);
}
