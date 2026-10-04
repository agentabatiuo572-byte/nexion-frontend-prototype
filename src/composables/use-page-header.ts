import { watch, onUnmounted, onActivated, onDeactivated } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import { usePageHeader, type PageHeaderPayload } from "@/store/page-header";
import { createPageHeaderVisibilityGate } from "@/lib/page-header-visibility";

type PayloadInput = PageHeaderPayload | (() => PageHeaderPayload);

/**
 * useSetPageHeader — a sub-page declares its sticky chassis nav header (mirrors the
 * prototype's <SetPageHeader title subtitle backHref/>). Accepts a static payload OR
 * a getter (use the getter when the title depends on async data, e.g. a product
 * loaded in onLoad — the watch re-sets once it resolves).
 *
 * Lifecycle: publish reactively and on Uni show / Vue cache activation; hide on
 * Uni hide / Vue cache deactivation / unmount. Cached returns need the Vue hooks
 * even when no Uni page-show notification is delivered. Tab pages keep the brand row.
 * Each page instance clears only the header it registered (owner token): the popped
 * page's late onUnmounted must not wipe the header the surviving page just re-set
 * (checkout → checkout?resume → back left the survivor without back button / title).
 */
export function useSetPageHeader(input: PayloadInput) {
  const store = usePageHeader();
  const get = (): PageHeaderPayload => (typeof input === "function" ? input() : input);
  const owner = Symbol("page-header-owner");
  const visibility = createPageHeaderVisibilityGate(
    (payload: PageHeaderPayload) => store.set(payload, owner),
    () => store.clear(owner),
  );

  // Reactive: re-set whenever the getter's deps change (async product load etc.).
  watch(get, (v) => visibility.publish(v), { immediate: true });
  const show = () => visibility.show(get());
  const hide = () => visibility.hide();
  // Re-assert on both page notifications and cached Vue returns.
  onShow(show);
  onActivated(show);
  // Clear so the nav header doesn't bleed into the next page — but only our own entry.
  onHide(hide);
  onDeactivated(hide);
  onUnmounted(hide);
}
