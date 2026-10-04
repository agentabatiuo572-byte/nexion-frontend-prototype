export function resolveChassisScrollElement(raw: unknown, fallback: () => HTMLElement | null): HTMLElement | null {
  const candidate = raw && typeof raw === "object" && "$el" in raw
    ? (raw as { $el?: unknown }).$el : raw;
  return typeof HTMLElement !== "undefined"
    && candidate instanceof HTMLElement
    && candidate.classList.contains("nx-content") ? candidate : fallback();
}

/** App page logic runs outside the WebView DOM; execute the scroll in that view. */
export function scrollNativeCurrentTabToTop(page: { $getAppWebview?: () => { evalJS: (script: string) => void } } | null | undefined): boolean {
  try {
    const webview = page?.$getAppWebview?.();
    if (!webview) return false;
    webview.evalJS("var content = document.querySelector('.nx-content'); if (content) content.scrollTop = 0;");
    return true;
  } catch {
    return false;
  }
}

export function scrollCurrentTabToTop(target: { scrollTop: number; scrollTo?: (options: ScrollToOptions) => void }, reduceMotion: boolean): void {
  try {
    if (typeof target.scrollTo === "function") {
      target.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      return;
    }
  } catch { /* Android HTML5+ view may not support DOM scrolling methods. */ }
  target.scrollTop = 0;
}
