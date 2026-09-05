import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Sticky CTA payload — supplied by whichever surface wants a chassis-level
 * bottom CTA bar (e.g. a product detail page priming purchase). All display
 * text is caller-supplied so the bar stays surface-agnostic.
 * Ported from Nexion-prototype/lib/store/sticky-cta.ts.
 */
export interface StickyCTAPayload {
  /** Target route, e.g. "/pages/store/store". Navigated via uni.navigateTo. */
  href: string;
  /** Price string; a leading "$" is split into a small dim prefix. */
  amount: string;
  amountSubtext?: string;
  buttonLabel: string;
  /** Defaults to brand blue. */
  accentColor?: string;
  subtextColor?: string;
  /** true → bar floats above the tab bar; false → above the home indicator. */
  showTabBar?: boolean;
}

/**
 * Chassis-level sticky bottom CTA store (zustand → Pinia, setup-style, NO
 * return-type annotation per P-017). `cta = null` hides the bar.
 */
export const useStickyCTA = defineStore("stickyCta", () => {
  const cta = ref<StickyCTAPayload | null>(null);

  function show(payload: StickyCTAPayload) {
    cta.value = payload;
  }

  function hide() {
    cta.value = null;
  }

  return { cta, show, hide };
});
