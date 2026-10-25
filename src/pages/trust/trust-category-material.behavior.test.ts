import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./trust.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { formatAmount } from "@/lib/amount-display";
import * as trustFields from "@/lib/trust-fields";
import { createTrustSectionApi, type PublishedTrustSection, type TrustLocale } from "@/api/trust-section-api";
import { trustResources, type TrustCategoryKey } from "./trust-resources";
import { trustCategoryMaterial } from "./trust-category-material";

// Execute the real page setup/template and material reader. Only the published
// read boundary and unrelated presentation children are isolated.
type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ""): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: text => node(text), createComment: () => node(),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _old, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(child); else parent.children.splice(index, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const slot = { setup: (_: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
const row = {
  props: ["title", "subtitle", "value"], emits: ["click"],
  setup: (props: any, { emit }: any) => () => Vue.h("view", { role: "button", onClick: () => emit("click") },
    [props.title, props.subtitle, props.value].filter(Boolean).map(value => Vue.h("text", value))),
};
const dictionaries = { en, zh, vi: vietnamese };
const code = ts.transpileModule(compileScript(parse(source).descriptor, {
  id: "trust-category-material", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } },
}).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function section(sectionKey: PublishedTrustSection["sectionKey"], values: Record<string, string>): PublishedTrustSection {
  return { sectionKey, version: "v2", description: "Editor description, not a disclosure", structure: "Editor schema",
    fields: Object.entries(values).map(([key, value]) => ({ key, value, label: "Editor field label" })) };
}
const unmounts: Array<() => void> = [];
afterEach(() => { unmounts.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); });

function mount(initial: PublishedTrustSection[], language: TrustLocale = "zh") {
  const locale = Vue.reactive({ code: language });
  const sections = Vue.ref(initial);
  const navTo = vi.fn(), error = vi.fn(), open = vi.fn(() => ({}));
  vi.stubGlobal("window", { open });
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() },
    "@/lib/amount-display": { formatAmount },
    "./trust-resources": { trustResources }, "./trust-category-material": { trustCategoryMaterial },
    "@/lib/trust-fields": trustFields,
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) },
    "@/store/locale": { useLocaleStore: () => locale },
    "@/store/config": { useConfig: () => ({ syncFailed: false, config: { verifiedStats: null } }) },
    "@/store/ui": { toast: { error } }, "@/lib/route": { navTo },
    "@/api/runtime": { remoteApiEnabled: true },
    "@/api/order-api": { subscribeRuntimeRevision: () => () => {} },
    "@/composables/use-published-trust": { usePublishedTrust: () => ({ sections, status: Vue.ref("ready"), refresh: vi.fn() }), recordPublishedTrustViews: vi.fn() },
    "@/components/app-chassis.vue": { default: slot }, "@/components/card-stagger.vue": { default: slot },
    "@/components/sub-page-header.vue": { default: slot }, "@/components/trust/trust-section-header.vue": { default: slot },
    "@/components/ui/nx-section.vue": { default: slot }, "@/components/ui/nx-list-group.vue": { default: slot },
    "@/components/ui/nx-list-row.vue": { default: row },
    "@/components/ui/nx-button.vue": { default: { props: ["label"], setup: (props: any) => () => Vue.h("view", props.label) } },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected Trust page import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node(), app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  const body = () => all(root).find(item => item.props.class === "trust-category-body")!;
  return { root, sections, locale, navTo, error, open, body,
    expand: async (key: TrustCategoryKey) => {
      const title = trustResources(locale.code).categories.find(item => item.key === key)!.title;
      all(root).find(item => item.props["aria-expanded"] !== undefined && text(item).includes(title))!.props.onClick();
      await Vue.nextTick();
      return body();
    },
  };
}
const links = (root: Host) => all(root).filter(item => item.props.role === "link");

describe("Trust categories consume published materials", () => {
  it.each(["zh", "vi", "en"] as const)("renders existing compliance fields and linked metadata in %s", async language => {
    const view = mount([section("complianceBadges", {
      [`badge1Label.${language}`]: "Published credential", [`badge1Body.${language}`]: "Published scope",
      badge1Url: " https://documents.example.test/credential.pdf ", badge1Type: "PDF", badge1Date: "2026-10-25", badge1Size: "120 KB",
    })], language);
    const body = await view.expand("compliance");
    expect(text(body)).toContain("Published credential");
    expect(text(body)).toContain("Published scope");
    expect(text(body)).toContain("PDF · 2026-10-25 · 120 KB");
    expect(text(body)).not.toContain(trustResources(language).pending);
    links(body)[0].props.onClick();
    expect(view.open).toHaveBeenCalledWith("https://documents.example.test/credential.pdf", "_blank");
  });

  it("renders a legacy published badge without inventing an evidence link", async () => {
    const view = mount([section("complianceBadges", { badge1Label: "Published label", badge1Body: "Published scope", badge1Url: "javascript:alert(1)" })]);
    const body = await view.expand("compliance");
    expect(text(body)).toContain("Published label");
    expect(text(body)).toContain("Published scope");
    expect(links(body)).toHaveLength(0);
    expect(view.open).not.toHaveBeenCalled();
  });

  it.each(["hosting", "warranty", "security"] as const)("renders optional %s content/documents across locale changes", async category => {
    const fields: Record<string, string> = { [`${category}Document1Url`]: "https://documents.example.test/service.pdf", [`${category}Document1Type`]: "PDF" };
    for (const language of ["zh", "vi", "en"] as const) {
      fields[`${category}Content.${language}`] = `${language} published terms\n<script>text only</script>`;
      fields[`${category}Document1Primary.${language}`] = `${language} document title`;
      fields[`${category}Document1Secondary.${language}`] = `${language} document summary`;
    }
    const view = mount([section("nexNarrative", fields)]);
    await view.expand(category);
    for (const language of ["zh", "vi", "en"] as const) {
      view.locale.code = language; await Vue.nextTick();
      expect(text(view.body())).toContain(`${language} published terms\n<script>text only</script>`);
      expect(text(view.body())).toContain(`${language} document title`);
      expect(text(view.body())).toContain(`${language} document summary`);
      expect(text(view.body())).toContain("PDF");
      expect(links(view.body())).toHaveLength(1);
    }
    const preventDefault = vi.fn();
    links(view.body())[0].props.onKeydown({ key: "Enter", preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(view.open).toHaveBeenCalledWith("https://documents.example.test/service.pdf", "_blank");
  });

  it("supports content-only and URL-only publication, numeric document order, and internal links", async () => {
    const view = mount([section("nexNarrative", { hostingContent: "Published hosting explanation" })]);
    await view.expand("hosting");
    expect(text(view.body())).toBe("Published hosting explanation");
    expect(links(view.body())).toHaveLength(0);
    view.sections.value = [section("nexNarrative", { hostingDocument10Url: "https://documents.example.test/10.pdf", hostingDocument2Url: "/pages/onboarding/terms" })];
    await Vue.nextTick();
    expect(links(view.body())).toHaveLength(2);
    expect(text(view.body())).toContain(trustResources("zh").viewDocument);
    links(view.body())[0].props.onClick();
    expect(view.navTo).toHaveBeenCalledWith("/pages/onboarding/terms");
  });

  it.each(["", "http://documents.example.test/a.pdf", "javascript:alert(1)", "data:text/html,hello", "https://user:secret@documents.example.test/a.pdf", "//documents.example.test/a.pdf", "/pages/me/me?token=private"])(
    "keeps a document without a usable URL pending: %j", async url => {
      const view = mount([section("nexNarrative", { securityDocument1Primary: "Title alone", securityDocument1Url: url, securityDocument1Date: "2026-10-25" })]);
      const body = await view.expand("security");
      expect(text(body)).toBe(trustResources("zh").pending);
      expect(links(body)).toHaveLength(0);
      expect(view.open).not.toHaveBeenCalled();
    },
  );

  it("does not use empty values, editor metadata, unrelated sections or another locale as materials", async () => {
    const view = mount([
      section("nexNarrative", { hostingContent: "Legacy default", "hostingContent.en": "English only", warrantyContent: "  ", securityDocument1Primary: "No file yet" }),
      section("complianceBadges", { badge1Label: "", badge1Body: "No published name", badge2Label: "Legacy badge", "badge2Label.en": "English only" }),
      section("auditsReserves", { hostingContent: "Wrong source", document1Primary: "Audit", document1Url: "https://documents.example.test/audit" }),
    ]);
    for (const key of ["hosting", "warranty", "security", "compliance"] as const) {
      expect(text(await view.expand(key))).toBe(trustResources("zh").pending);
    }
  });

  it("clears displayed content and links when the published snapshot is withdrawn", async () => {
    const view = mount([section("nexNarrative", { warrantyContent: "Published conditions", warrantyDocument1Url: "https://documents.example.test/warranty.pdf" })]);
    await view.expand("warranty");
    expect(text(view.body())).toContain("Published conditions");
    view.sections.value = []; await Vue.nextTick();
    expect(text(view.body())).toBe(trustResources("zh").pending);
    expect(links(view.body())).toHaveLength(0);
  });

  it("accepts the optional fields through the existing six-section API contract", async () => {
    const snapshot = (["financials", "leadership", "nexNarrative", "complianceBadges", "auditsReserves", "listings"] as const).map(key => section(key,
      key === "nexNarrative" ? { "hostingContent.zh": "Published explanation", hostingDocument1Url: "https://documents.example.test/hosting.pdf" }
        : key === "complianceBadges" ? { "badge1Label.zh": "Published credential", badge1Url: "https://documents.example.test/credential.pdf" } : { summary: "" }));
    const request = vi.fn().mockResolvedValue({ serverCanonical: true, source: "nx_trust_section_version:published", sourceEnvironment: "PRODUCTION", runId: "", sections: snapshot });
    const result = await createTrustSectionApi({ request } as never).current();
    const view = mount(result);
    expect(text(await view.expand("hosting"))).toContain("Published explanation");
    expect(text(await view.expand("compliance"))).toContain("Published credential");
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/content/trust/sections/current", authenticated: false });
  });
});
