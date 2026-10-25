import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useIntroMotion } from "@/composables/use-intro-motion";
import { en } from "@/i18n/messages/en";
import { all, flush, mountEntry, slot } from "@/lib/entry-review.test-support";
import source from "./intro.vue?raw";

const unmounts: Array<() => void> = [];
afterEach(() => { unmounts.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); });
function mount() {
  const page = mountEntry(source, {
    "@/components/home/home-display-stats.vue": slot, "@/components/device/standalone-page-shell.vue": slot, "@/components/brand-lockup.vue": slot,
    "@dcloudio/uni-app": { onShow() {}, onHide() {} }, "@/lib/route": { navReset: vi.fn(), navTo: vi.fn() },
    "@/i18n/use-t": { useT: () => ref(en) }, "@/i18n": { LOCALES: [] },
    "@/store/locale": { useLocaleStore: () => ({ code: "en" }) }, "@/composables/use-dialog-a11y": { useDialogA11y() {} },
    "@/composables/use-intro-motion": { useIntroMotion },
  });
  unmounts.push(page.unmount);
  return page;
}
describe("intro SMIL follows actual reduced-motion preference", () => {
  it.each([true, false])("initial reduce=%s and live changes add/remove animation nodes", async reduced => {
    let change!: () => void;
    const query = { matches: reduced, addEventListener: vi.fn((_event, callback) => { change = callback; }), removeEventListener: vi.fn() };
    vi.stubGlobal("window", { matchMedia: vi.fn(() => query) });
    const page = mount(); await flush();
    const animated = () => all(page.root).filter(n => ["animate", "animateMotion"].includes(n.tag));
    expect(animated().length > 0).toBe(!reduced);
    query.matches = true; change(); await flush();
    expect(animated()).toHaveLength(0);
    expect(all(page.root).filter(n => n.tag === "circle").length).toBeGreaterThan(8);
    query.matches = false; change(); await flush();
    expect(animated()).toHaveLength(10);
    page.unmount(); unmounts.pop();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", change);
  });
  it("uses a static illustration when the host cannot read motion preference", async () => {
    vi.stubGlobal("window", undefined);
    const page = mount(); await flush();
    expect(all(page.root).filter(n => ["animate", "animateMotion"].includes(n.tag))).toHaveLength(0);
  });
});
