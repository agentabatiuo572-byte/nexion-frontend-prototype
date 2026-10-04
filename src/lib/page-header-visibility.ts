export interface PageHeaderVisibilityGate<T> {
  publish(payload: T): void;
  show(payload: T): void;
  hide(): void;
}

/** Prevent a cached page's reactive work from reclaiming the current page header. */
export function createPageHeaderVisibilityGate<T>(
  write: (payload: T) => void,
  clear: () => void,
): PageHeaderVisibilityGate<T> {
  let visible = true;
  return {
    publish(payload) { if (visible) write(payload); },
    show(payload) { visible = true; write(payload); },
    hide() { visible = false; clear(); },
  };
}
