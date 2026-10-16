import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { promotionBundleHref } from "@/lib/promotion-entry";
import source from "./store.vue?raw";

// Render the actual page template with inert decorative components. Execute its
// compiled click/keyboard handlers; no router, transport or purchase is mocked in.
const { descriptor } = parse(source);
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => tag === "view" || tag === "text",
}).code)({ ...Vue, resolveComponent: (name: string) => name, withCtx: (slot: unknown) => slot });

function nodes(value: unknown): Vue.VNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value && typeof value === "object" && !Vue.isVNode(value)) {
    return Object.values(value).filter(item => typeof item === "function").flatMap(slot => nodes(slot()));
  }
  if (!Vue.isVNode(value)) return [];
  return [value, ...nodes(value.children)];
}

function page(overrides: Record<string, unknown> = {}) {
  const navTo = vi.fn();
  const context = {
    t: zh, navTo, activityId: "", activity: null, publicOnly: false,
    promotionStatus: "ready", promotionAvailable: false, upgrade: null,
    yieldAuthority: {}, ownedHardware: null, focusProductId: "",
    catalogStatus: "ready", catalogHasProducts: false, lockedProducts: [],
    restProducts: [], unlockedProducts: [], featured: null,
    genesisCfg: { config: { showcaseEnabled: false } },
    locale: { code: "zh" }, localized: () => "Activity", promotionBundleHref,
    ...overrides,
  };
  const rendered = nodes(render(context, []));
  return { navTo, rendered, entry: rendered.find(node => node.props?.["data-testid"] === "store-bundle-entry") };
}

describe("ordinary store bundle entry", () => {
  it.each([["zh", zh], ["en", en], ["vi", vietnamese]] as const)(
    "%s opens ordinary bundle without an activity or submitting a purchase", (_locale, t) => {
      const view = page({ t });
      expect(view.navTo).not.toHaveBeenCalled();
      expect(view.entry).toBeDefined();
      expect(nodes(view.entry).some(node => node.children === t.promotion.bundle)).toBe(true);
      view.entry!.props!.onClick();
      expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/bundle");
    },
  );

  it.each(["loading", "error", "ready"])("remains reachable while promotion reads are %s", promotionStatus => {
    const view = page({ promotionStatus });
    expect(view.entry).toBeDefined();
    view.entry!.props!.onClick();
    expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/bundle");
  });

  it.each(["Enter", " "])("supports %j keyboard activation", key => {
    const view = page();
    expect(view.entry?.props?.role).toBe("button");
    expect(view.entry?.props?.tabindex).toBe("0");
    const event = { key, preventDefault: vi.fn() };
    const handlers = view.entry!.props!.onKeydown;
    for (const handler of Array.isArray(handlers) ? handlers : [handlers]) handler(event);
    expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/bundle");
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("retains the activity-specific bundle destination in activity scope", () => {
    const view = page({ activityId: "ACT-1", activity: { title: {} }, promotionAvailable: true });
    expect(view.entry).toBeUndefined();
    const action = view.rendered.find(node => node.props?.onClick && nodes(node).some(child => child.children === zh.promotion.bundle));
    expect(action).toBeDefined();
    action!.props!.onClick();
    expect(view.navTo).toHaveBeenCalledExactlyOnceWith(promotionBundleHref("ACT-1"));
  });

  it("does not expose the authenticated ordinary store action in the public promotion view", () => {
    expect(page({ publicOnly: true }).entry).toBeUndefined();
  });
});
