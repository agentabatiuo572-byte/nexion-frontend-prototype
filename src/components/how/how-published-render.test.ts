// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { PublishedContentRequestFence } from "./p3-14-published-request-fence";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";

const source = readFileSync(new URL("./how-published-content.vue", import.meta.url), "utf8");
const template = parse(source).descriptor.template!.content;
// Compile the actual page template, including the hero and slice(1) boundary.
const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("section", slots.default?.()) });
const hero = Vue.defineComponent({ props: ["title", "sub"], setup: props => () => Vue.h("header", [String(props.title), String(props.sub)]) });

const messages = { en, vi, zh };

function fallbackFor(content: Vue.Ref<unknown>, locale: { code: string }): Vue.ComputedRef<boolean> {
  const start = source.indexOf("const languageFallback = computed(");
  expect(start).toBeGreaterThan(0);
  const end = source.indexOf("\nfunction heroLabel(", start);
  expect(end).toBeGreaterThan(start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("computed", "content", "locale", `${code}\nreturn languageFallback;`)(Vue.computed, content, locale);
}

async function show(blocks: Array<Record<string, unknown>>, document: Record<string, unknown> = {}, requestedLocale = "zh") {
  const content = Vue.ref({ contentKey: "wallet-exchange-how", version: "fixture-v1", versionSource: "ENTRY", locale: "zh", blocks, ...document });
  const app = Vue.createSSRApp({ render, setup: () => ({
    loading: false, error: false, neutral: false, back: "/pages/me/wallet", bodyStyle: {},
    content, languageFallback: fallbackFor(content, { code: requestedLocale }),
    t: messages[requestedLocale.split(/[-_]/)[0].toLowerCase() as keyof typeof messages], load: () => undefined,
    heroLabel: () => "Guide",
  }) });
  app.component("HowHero", hero);
  app.component("HowSection", wrapper);
  app.component("HowCalloutBox", wrapper);
  app.component("SubPageHeader", wrapper);
  return renderToString(app);
}

function loader(published: (contentKey: string, locale: string) => Promise<Record<string, unknown>>, requestedLocale = "zh") {
  const state = {
    props: { contentKey: "wallet-repurchase-how" }, locale: Vue.reactive({ code: requestedLocale }),
    requestFence: new PublishedContentRequestFence(),
    loading: Vue.ref(false), error: Vue.ref(false), content: Vue.ref<unknown>(null),
    howContentApi: { published }, emit: () => undefined,
  };
  const start = source.indexOf("async function load()");
  const end = source.indexOf("\nwatch(", start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const load = new Function(...Object.keys(state), `${code}\nreturn load;`)(...Object.values(state)) as () => Promise<void>;
  return { ...state, load, languageFallback: fallbackFor(state.content, state.locale) };
}

describe("published language fallback", () => {
  const blocks = [{ id: "intro", kind: "text", title: "Repurchase boost", body: "Published explanation" }];
  it.each(["en", "vi", "zh"])("keeps matching %s content free of a fallback notice", async (language) => {
    const html = await show(blocks, { locale: language, versionSource: "DOCUMENT_FALLBACK" }, language);
    expect(html).toContain("Published explanation");
    expect(html).not.toContain(messages[language as keyof typeof messages].howPublished.languageFallback);
  });
  it.each(["vi", "zh"])("shows a localized notice and retry before English content for %s", async (language) => {
    // Version provenance is independent of the actual response language.
    for (const versionSource of ["ENTRY", "DOCUMENT_FALLBACK"]) {
      const html = await show(blocks, { locale: "en", versionSource }, language);
      const copy = messages[language as keyof typeof messages];
      expect(html).toContain(copy.howPublished.languageFallback);
      expect(html).toContain(copy.ui.retry);
      expect(html.indexOf(copy.howPublished.languageFallback)).toBeLessThan(html.indexOf("Repurchase boost"));
      expect(html).not.toContain(versionSource);
    }
  });
  it.each([["vi", "vi-VN"], ["vi-VN", "vi"], ["zh", "ZH_cn"], ["en-US", "en-GB"]])("does not flag regional variants %s → %s", async (requested, returned) => {
    const html = await show(blocks, { locale: returned }, requested);
    expect(html).not.toContain(messages[requested.split("-")[0] as keyof typeof messages].howPublished.languageFallback);
  });
  it("retries the currently selected language and clears the notice after its publication is available", async () => {
    const requested: string[] = [];
    const state = loader(async (_, language) => {
      requested.push(language);
      return { locale: requested.length === 1 ? "en" : language, blocks };
    }, "vi");
    await state.load();
    expect(state.languageFallback.value).toBe(true);
    await state.load();
    expect(requested).toEqual(["vi", "vi"]);
    expect(state.languageFallback.value).toBe(false);
    expect(state.error.value).toBe(false);
    const notice = template.slice(template.indexOf('v-if="languageFallback"'), template.indexOf("<HowHero"));
    expect(notice).toContain('@click="load"');
    expect(notice).toContain('@keydown.enter.prevent="load"');
    expect(notice).toContain('@keydown.space.prevent="load"');
  });
  it("keeps newer selected language content when an older fallback response settles last", async () => {
    let finishOld!: (value: Record<string, unknown>) => void;
    const state = loader(async (_, language) => language === "vi"
      ? new Promise(resolve => { finishOld = resolve; })
      : { locale: language, blocks }, "vi");
    const old = state.load();
    state.locale.code = "zh";
    await state.load();
    finishOld({ locale: "en", blocks });
    await old;
    expect(state.locale.code).toBe("zh");
    expect(state.content.value).toEqual({ locale: "zh", blocks });
    expect(state.languageFallback.value).toBe(false);
    expect(state.loading.value).toBe(false);
  });
  it("uses the existing unavailable state when retry fails", async () => {
    let attempts = 0;
    const state = loader(async () => {
      if (attempts++ === 0) return { locale: "en", blocks };
      throw new Error("Content unavailable");
    }, "vi");
    await state.load();
    await state.load();
    expect(state.content.value).toBeNull();
    expect(state.languageFallback.value).toBe(false);
    expect(state.error.value).toBe(true);
    expect(state.loading.value).toBe(false);
  });
});

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
  it("retains a resolved rule value without displaying its internal reference", async () => {
    const html = await show([{ id: "rule", kind: "ruleRef", title: "Current fee", body: "Fee: 3%", ref: { key: "team.ui.F.binary.settlePeriod", version: "F3.2026.08.17" } }]);
    expect(html).toContain("Fee: 3%");
    expect(html).not.toContain("team.ui.F.binary.settlePeriod");
    expect(html).not.toContain("F3.2026.08.17");
    expect(html).not.toContain("{value}");
  });
});

describe("published metadata stays private", () => {
  const blocks = [{ id: "intro", kind: "text", title: "Guide", body: "Published content" }];
  it("does not display entry publication metadata", async () => {
    const html = await show(blocks, { contentKey: "genesis-how", version: "2026.08.31-commissions-guide", versionSource: "ENTRY" });
    expect(html).toContain("Published content");
    expect(html).not.toContain("2026.08.31-commissions-guide");
  });
  it("hides the raw document version on a declared fallback", async () => {
    const html = await show(blocks, { version: "shared-document-v1", versionSource: "DOCUMENT_FALLBACK" });
    expect(html).not.toContain("No page-specific revision");
    expect(html).not.toContain("shared-document-v1");
  });
  it("keeps a page-specific internal revision out of the page", async () => {
    const html = await show(blocks, { contentKey: "genesis-how", version: "genesis-v2" });
    expect(html).not.toContain("genesis-v2");
  });
});

describe("unresolved published rules", () => {
  async function load(block: Record<string, unknown>) {
    const state = {
      props: { contentKey: "wallet-exchange-how" }, locale: { code: "zh" },
      requestFence: new PublishedContentRequestFence(),
      loading: Vue.ref(false), error: Vue.ref(false), content: Vue.ref<unknown>(null),
      howContentApi: { published: async () => ({ blocks: [block] }) },
      emit: () => undefined,
    };
    const start = source.indexOf("async function load()");
    const end = source.indexOf("\nwatch(", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    await new Function(...Object.keys(state), `${code}\nreturn load();`)(...Object.values(state));
    return state;
  }
  it.each(["title", "body", "items"])("keeps the retryable unavailable state for an unresolved %s", async (field) => {
    const block = { id: "fee", kind: "ruleRef", title: "Fee", body: "Fee: 3%", items: ["Charged once"], ref: { key: "internal.fee", version: "v1" }, [field]: field === "items" ? ["Fee: {value}"] : "Fee: {value}" };
    const state = await load(block);
    expect(state.error.value).toBe(true);
    expect(state.content.value).toBeNull();
    expect(state.loading.value).toBe(false);
  });
  it("keeps the complete published fee and conditions when its value is resolved", async () => {
    const block = { id: "fee", kind: "ruleRef", title: "Fee", body: "Fee: 3%; cancellation is unavailable", ref: { key: "internal.fee", version: "v1" } };
    const state = await load(block);
    expect(state.error.value).toBe(false);
    expect(state.content.value).toEqual({ blocks: [block] });
  });
});
