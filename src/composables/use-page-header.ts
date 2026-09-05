import { watch, onUnmounted } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import { usePageHeader, type PageHeaderPayload } from "@/store/page-header";

type PayloadInput = PageHeaderPayload | (() => PageHeaderPayload);

/**
 * useSetPageHeader — a sub-page declares its sticky chassis nav header (mirrors the
 * prototype's <SetPageHeader title subtitle backHref/>). Accepts a static payload OR
 * a getter (use the getter when the title depends on async data, e.g. a product
 * loaded in onLoad — the watch re-sets once it resolves).
 *
 * Lifecycle: set reactively + on every onShow (covers tab-switch / back returning to
 * this page, P-044 hash-nav doesn't re-fire onLoad); clear on onHide / onUnmounted so
 * the header never leaks into the next page. Tab pages don't call this → brand row.
 * Each page instance clears only the header it registered (owner token): the popped
 * page's late onUnmounted must not wipe the header the surviving page just re-set
 * (checkout → checkout?resume → back left the survivor without back button / title).
 */
export function useSetPageHeader(input: PayloadInput) {
  const store = usePageHeader();
  const get = (): PageHeaderPayload => (typeof input === "function" ? input() : input);
  const owner = Symbol("page-header-owner");

  // Reactive: re-set whenever the getter's deps change (async product load etc.).
  watch(get, (v) => store.set(v, owner), { immediate: true });
  // Re-assert on show (another page's onHide may have cleared it before we re-enter).
  onShow(() => store.set(get(), owner));
  // Clear so the nav header doesn't bleed into the next page — but only our own entry.
  onHide(() => store.clear(owner));
  onUnmounted(() => store.clear(owner));
}
