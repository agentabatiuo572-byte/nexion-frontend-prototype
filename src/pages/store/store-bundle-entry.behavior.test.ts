import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { promotionBundleHref } from "@/lib/promotion-entry";
import { fmt, fmtMoney } from "@/i18n/format";
import { voucherBenefitSummary } from "@/lib/voucher-benefit-summary";
import source from "./store.vue?raw";

// Render the actual page template with inert decorative components. Execute its
// compiled click/keyboard handlers; no router, transport or purchase is mocked in.
const { descriptor } = parse(source);
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => tag === "view" || tag === "text",
}).code)({ ...Vue, resolveComponent: (name: string) => name, withCtx: (slot: unknown) => slot });

// Execute the page's own offer selection and click handler, not a test copy of them.
const setup = ts.createSourceFile("store.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const voucherBindings = new Set(["voucherClaimable", "voucherOffers", "voucherBenefit"]);
const voucherSource = setup.statements.filter(node =>
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => voucherBindings.has(d.name.getText(setup))))
  || (ts.isFunctionDeclaration(node) && node.name?.text === "openStoreVouchers"),
).map(node => node.getText(setup)).join("\n");
const createVoucherPresentation = new Function("computed", "voucher", "voucherClaimSheet", "navTo", "voucherBenefitSummary",
  ts.transpileModule(voucherSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  + "; return { voucherClaimable, voucherOffers, voucherBenefit, openStoreVouchers };",
);
const auditCopy = {
  voucherShort: "Vouchers", voucherShortCount: "{n}", upToOff: "Maximum discount",
  voucherDiscount: "Device discount", claimToUse: "Claim to use", autoApplyVoucher: "Applied at checkout",
};

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
  const voucherClaimSheet = { show: vi.fn() };
  const voucher = overrides.voucher ?? { claimableVouchers: [], claimedUnused: [] };
  const voucherPresentation = createVoucherPresentation(Vue.computed, voucher, voucherClaimSheet, navTo, voucherBenefitSummary);
  const context = Vue.proxyRefs({
    t: zh, navTo, voucherContext:{}, activityId: "", activity: null, publicOnly: false,
    auditCopy, fmt, fmtMoney, ...voucherPresentation,
    promotionStatus: "ready", promotionAvailable: false, upgrade: null,
    yieldAuthority: {}, ownedHardware: null, focusProductId: "",
    catalogStatus: "ready", catalogHasProducts: false, lockedProducts: [],
    restProducts: [], unlockedProducts: [], featured: null,
    genesisCfg: { config: { showcaseEnabled: false } },
    locale: { code: "zh" }, localized: () => "Activity", promotionBundleHref,
    ...overrides,
  });
  const rendered = nodes(render(context, []));
  return { navTo, voucherClaimSheet, rendered,
    entry: rendered.find(node => node.props?.["data-testid"] === "store-bundle-entry"),
    ticket: rendered.find(node => node.props?.["data-testid"] === "store-voucher-ticket"),
  };
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
    const view = page({ activityId: "ACT-1", activity: { title: {} }, promotionAvailable: true, unlockedProducts:[{id:"a"},{id:"b"}] });
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

describe("ordinary store voucher ticket", () => {
  const claimable = { id: "store-offer", type: "fixed", amountUSD: 50, claimSurfaces: ["store"] };
  const homeOnly = { ...claimable, id: "home-offer", claimSurfaces: ["home"] };
  const claimed = { ...homeOnly, id: "claimed-offer", amountUSD: 100 };
  const ticketText = (view: ReturnType<typeof page>) => nodes(view.ticket).map(node => typeof node.children === "string" ? node.children : "").join(" ");

  it.each([{ claimableVouchers: [] }, { claimableVouchers: [homeOnly] }])("hides without store-claimable or claimed-unused offers: %j", ({ claimableVouchers }) => {
    expect(page({ voucher: { claimableVouchers, claimedUnused: [] } }).ticket).toBeUndefined();
  });

  it("counts distinct eligible offers and opens the store claim sheet when any can be claimed", () => {
    const view = page({ voucher: { claimableVouchers: [claimable, homeOnly], claimedUnused: [claimable, claimed] } });
    expect(ticketText(view)).toContain("Vouchers · 2");
    expect(ticketText(view)).toContain(auditCopy.claimToUse);
    view.ticket!.props!.onClick();
    expect(view.voucherClaimSheet.show).toHaveBeenCalledExactlyOnceWith("store");
    expect(view.navTo).not.toHaveBeenCalled();
  });

  it("keeps claimed-unused vouchers from any surface and opens their existing list", () => {
    const view = page({ voucher: { claimableVouchers: [homeOnly], claimedUnused: [claimed] } });
    expect(ticketText(view)).toContain("Vouchers · 1");
    expect(ticketText(view)).toContain(auditCopy.autoApplyVoucher);
    view.ticket!.props!.onClick();
    expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/rewards-list?cat=voucher");
    expect(view.voucherClaimSheet.show).not.toHaveBeenCalled();
  });

  it("does not label a fixed amount as the maximum beside an uncapped percentage", () => {
    const view = page({ voucher: { claimableVouchers: [{ ...claimable, type: "percent", percent: 15 }], claimedUnused: [claimed] } });
    expect(ticketText(view)).toContain("15%");
    expect(ticketText(view)).toContain(auditCopy.voucherDiscount);
    expect(ticketText(view)).not.toContain(auditCopy.upToOff);
  });

  it.each(["Enter", " "])("opens the claim sheet with %j", key => {
    const view = page({ voucher: { claimableVouchers: [claimable], claimedUnused: [] } });
    const event = { key, preventDefault: vi.fn() };
    const handlers = view.ticket!.props!.onKeydown;
    for (const handler of Array.isArray(handlers) ? handlers : [handlers]) handler(event);
    expect(view.voucherClaimSheet.show).toHaveBeenCalledExactlyOnceWith("store");
    expect(view.navTo).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});

it.each([{products:[]},{products:[{id:'one'}]},{products:[{id:'one'},{id:'share',productType:'SHARE'}]}])('does not offer a two-product bundle for insufficient actual hardware scope %j',({products:unlockedProducts})=>{
  const view=page({activityId:'ACT-1',activity:{title:{}},promotionAvailable:true,unlockedProducts});
  expect(view.rendered.find(node=>node.props?.onClick&&nodes(node).some(child=>child.children===zh.promotion.bundle))).toBeUndefined();
});
