import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Page-header registration store — ported from Nexion-prototype/lib/store/page-header.ts
 * (zustand → Pinia). A sub-page declares its nav header (back + centered title +
 * optional subtitle) via the `use-page-header` composable; AppChassis renders it as a
 * STICKY chassis nav row (mirrors the prototype's SetPageHeader + Header nav row), so
 * the header stays pinned + frosts the scrolled content instead of scrolling away.
 *
 * The 5 tab pages NEVER register → AppChassis always shows the brand row for them
 * (registration is purely additive → zero regression to the optimized tab pages).
 * Non-persisted (per-navigation state). No return-type annotation (P-017).
 */
export interface PageHeaderPayload {
  title: string;
  subtitle?: string;
  /** Logical/route href for the back button, mapped via navTo (P-046). */
  backHref: string;
}

export const usePageHeader = defineStore("pageHeader", () => {
  const header = ref<PageHeaderPayload | null>(null);
  // Who registered the current header. Page teardown (onHide / onUnmounted) is not
  // ordered against the next page's onShow: after checkout → checkout(resume) → back,
  // the popped page's clear() used to run AFTER the surviving page had re-set its
  // header, wiping it (no back button, no title). A clear only clears its own entry.
  let owner: symbol | null = null;

  function set(payload: PageHeaderPayload, by: symbol | null = null) {
    header.value = payload;
    owner = by;
  }
  /** Clear the header — when `by` is given, only if that page still owns it. */
  function clear(by: symbol | null = null) {
    if (by !== null && owner !== null && owner !== by) return;
    header.value = null;
    owner = null;
  }

  return { header, set, clear };
});
