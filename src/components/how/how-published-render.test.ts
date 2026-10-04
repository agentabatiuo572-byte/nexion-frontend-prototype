// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./how-published-content.vue", import.meta.url), "utf8");
const template = parse(source).descriptor.template!.content;
// Compile the actual page template, including the hero and slice(1) boundary.
const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("section", slots.default?.()) });
const hero = Vue.defineComponent({ props: ["title", "sub"], setup: props => () => Vue.h("header", [String(props.title), String(props.sub)]) });

async function show(blocks: Array<Record<string, unknown>>, document: Record<string, unknown> = {}) {
  const app = Vue.createSSRApp({ render, setup: () => ({
    loading: false, error: false, back: "/pages/me/wallet", bodyStyle: {},
    content: { contentKey: "wallet-exchange-how", version: "fixture-v1", versionSource: "ENTRY", locale: "zh", blocks, ...document },
    t: { howPublished: { versionMeta: "Version {version}", versionMetaDocumentFallback: "No page-specific revision" } },
    heroLabel: () => "Guide", fmt: (value: string, params: Record<string, string>) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? ""),
    renderBody: (block: Record<string, unknown>) => block.kind === "ruleRef" ? "resolved-rule-reference" : block.body,
  }) });
  app.component("HowHero", hero);
  app.component("HowSection", wrapper);
  app.component("HowCalloutBox", wrapper);
  app.component("SubPageHeader", wrapper);
  return renderToString(app);
}

describe("published first-block rendering", () => {
  it("retains every list item when a published list is the first and only block", async () => {
    const html = await show([{ id: "intro", kind: "list", title: "First list", body: "Read all steps", items: ["Step alpha", "Step beta"] }]);
    expect(html).toContain("Step alpha");
    expect(html).toContain("Step beta");
    expect(html.split("Step alpha")).toHaveLength(2);
  });
  it("does not repeat items from a later list", async () => {
    const html = await show([
      { id: "intro", kind: "text", title: "Intro", body: "Published intro" },
      { id: "list", kind: "list", title: "Steps", body: "Instructions", items: ["Later step"] },
    ]);
    expect(html.split("Later step")).toHaveLength(2);
  });
  it("uses the same body renderer for a first rule reference as for later blocks", async () => {
    const html = await show([{ id: "rule", kind: "ruleRef", title: "Current rule", body: "Rule {value}" }]);
    expect(html).toContain("resolved-rule-reference");
    expect(html).not.toContain("{value}");
  });
});

describe("published revision label", () => {
  const blocks = [{ id: "intro", kind: "text", title: "Guide", body: "Published content" }];
  it("respects an explicitly declared entry revision even if its text resembles the document revision", async () => {
    const html = await show(blocks, { contentKey: "genesis-how", version: "2026.08.31-commissions-guide", versionSource: "ENTRY" });
    expect(html).toContain("Version 2026.08.31-commissions-guide");
  });
  it("hides the raw document version on a declared fallback", async () => {
    const html = await show(blocks, { version: "shared-document-v1", versionSource: "DOCUMENT_FALLBACK" });
    expect(html).toContain("No page-specific revision");
    expect(html).not.toContain("shared-document-v1");
  });
  it("shows a page-specific revision", async () => {
    const html = await show(blocks, { contentKey: "genesis-how", version: "genesis-v2" });
    expect(html).toContain("Version genesis-v2");
  });
});
