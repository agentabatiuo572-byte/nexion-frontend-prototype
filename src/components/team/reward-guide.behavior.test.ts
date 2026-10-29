import { afterEach, describe, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { all, flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import { ApiError } from "@/api/errors";
import { PublishedContentRequestFence } from "@/components/how/p3-14-published-request-fence";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import binaryHowSource from "@/pages/team/binary-how.vue?raw";
import { howContentMode } from "@/lib/team-how-content-mode";
import { ruleSection, ruleHero } from './team-rule-guide.test-support';
import { teamRuleGuideCopy } from './team-rule-guide-copy';

const sources = import.meta.glob("./reward-*.vue", { eager: true, query: "?raw", import: "default" });
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(dispose => dispose()));

function component(name: string, dependencies: Record<string, unknown> = {}) {
  const descriptor = parse(sources[`./${name}.vue`] as string).descriptor;
  const compiled = compileScript(descriptor, { id: name, inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } },
  });
  const code = ts.transpileModule(compiled.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => {
    if (id === "vue") return Vue;
    if (!(id in dependencies)) throw new Error(`Missing reward test dependency ${id}`);
    return dependencies[id];
  }, exports);
  return exports;
}

const art = { default: Vue.defineComponent({ props: ["kind", "size"], setup: props => () => Vue.h("art", props) }) };
const hero = component("reward-compact-hero", { "@/components/team/team-art.vue": art });
const block = component("reward-rule-block");

function mount(subject: ReturnType<typeof component>, props: Record<string, unknown>, slots = "") {
  const page = mountEntry(`<template><Subject v-bind="props">${slots}</Subject></template>
    <script setup lang="ts">import Subject from 'subject'; import { props } from 'test-props';</script>`, {
    subject, "test-props": { props },
  });
  cleanups.push(page.unmount);
  return page;
}

const blocks = [
  { id: "intro", kind: "list", title: "Published title", body: "Published introduction", items: ["Hero item"] },
  { id: "direct-referral-scope", kind: "text", title: "Direct beneficiary", body: "Only the eligible direct inviter receives this amount." },
  { id: "seven-layer-scope", kind: "list", title: "Layer allocation", body: "Per-layer policy", items: ["Layer 1: 10%", "Layer 2: 5%"] },
  { id: "rollback", kind: "callout", title: "Refund", body: "A refund can reverse the reward.", items: ["USDT and UVT recover separately."] },
];
const document = (locale = "en") => ({ contentKey: "team-unilevel-how", schemaVersion: 2, templateId: "unilevel-v2", locale,
  version: "internal-version-secret", versionSource: "ENTRY", blocks });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function published(publishedRead: (...args: any[]) => Promise<unknown>, language = "en") {
  const locale = Vue.reactive({ code: language });
  const navBack = vi.fn();
  const guide = component("reward-published-guide", {
    "@/components/sub-page-header.vue": slot,
    "@/components/team/reward-compact-hero.vue": hero,
    "@/components/team/reward-rule-block.vue": block,
    "@/api/runtime": { remoteApiEnabled: true, howContentApi: { published: publishedRead } },
    "@/store/locale": { useLocaleStore: () => locale },
    "@/i18n/use-t": { useT: () => Vue.computed(() => locale.code === "zh" ? zh : en) },
    "@/lib/route": { navBack },
    "@/components/how/p3-14-published-request-fence": { PublishedContentRequestFence },
    "@/api/errors": { ApiError },
  });
  const page = mount(guide, { contentKey: "team-unilevel-how", kind: "members", back: "/pages/team/unilevel", backLabel: "Return to rewards" });
  return { ...page, locale, navBack };
}

describe("flat reward presentation", () => {
  it("keeps the actual totals and rule action alongside the selected silver illustration", () => {
    const page = mount(hero, { kind: "ledger", label: "Monthly income" },
      '<text>$123.45</text><template #footer><text>Read all settlement rules</text></template>');
    expect(text(page.root)).toContain("Monthly income$123.45Read all settlement rules");
    expect(all(page.root).find(node => node.tag === "art")?.props).toMatchObject({ kind: "ledger", size: 88 });
  });
  it("retains refund details and lets keyboard users expand and close a FAQ", async () => {
    const page = mount(block, { q: "Who bears a refund?", a: "The original beneficiary.\nUSDT and UVT recover separately." });
    const question = all(page.root).find(node => node.props.role === "button")!;
    expect(question.props["aria-expanded"]).toBe(false);
    for (const handler of [question.props.onKeydown].flat()) handler({ key: "Enter", preventDefault() {} }); await flush();
    expect(question.props["aria-expanded"]).toBe(true);
    expect(text(page.root)).toContain("The original beneficiary.\nUSDT and UVT recover separately.");
    for (const handler of [question.props.onKeydown].flat()) handler({ key: " ", preventDefault() {} }); await flush();
    expect(question.props["aria-expanded"]).toBe(false);
    expect(text(page.root)).not.toContain("The original beneficiary.");
  });
});

describe("reward published guide", () => {
  it("retains every published body and list item, including callouts, without raw metadata", async () => {
    const page = published(vi.fn().mockResolvedValue(document())); await flush();
    for (const item of blocks) {
      expect(text(page.root)).toContain(item.title);
      expect(text(page.root)).toContain(item.body);
      for (const line of item.items ?? []) expect(text(page.root).split(line)).toHaveLength(2);
    }
    expect(text(page.root)).not.toContain("internal-version-secret");
    expect(text(page.root)).not.toContain("unilevel-v2");
    page.control("Return to rewards")!.props.onClick();
    expect(page.navBack).toHaveBeenCalledWith("/pages/team/unilevel");
  });
  it("keeps pending and failed requests out of the success content and retries the real publication", async () => {
    const read = deferred<ReturnType<typeof document>>();
    const api = vi.fn().mockReturnValueOnce(read.promise).mockResolvedValueOnce(document());
    const page = published(api);
    expect(text(page.root)).toContain(en.howPublished.loading);
    expect(text(page.root)).not.toContain("Published introduction");
    expect(page.control("Return to rewards")).toBeDefined();
    read.reject(new Error("offline")); await flush();
    expect(text(page.root)).toContain(en.howPublished.unavailableBody);
    expect(text(page.root)).not.toContain("Published introduction");
    page.control(en.ui.retry)!.props.onClick(); await flush();
    expect(api).toHaveBeenLastCalledWith("team-unilevel-how", "en");
    expect(text(page.root)).toContain("Published introduction");
    expect(text(page.root)).not.toContain(en.howPublished.unavailableBody);
  });
  it("discards a late prior-language response", async () => {
    const old = deferred<ReturnType<typeof document>>();
    const api = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...document("zh"), blocks: blocks.map(b => ({ ...b, body: `Latest ${b.body}` })) });
    const page = published(api);
    page.locale.code = "zh"; await flush();
    old.resolve({ ...document("en"), blocks: blocks.map(b => ({ ...b, body: "STALE" })) }); await flush();
    expect(text(page.root)).toContain("Latest Published introduction");
    expect(text(page.root)).not.toContain("STALE");
  });
  it("identifies a language fallback and retries the selected language", async () => {
    const api = vi.fn().mockResolvedValueOnce(document("en")).mockResolvedValueOnce(document("zh"));
    const page = published(api, "zh"); await flush();
    expect(text(page.root)).toContain(zh.howPublished.languageFallback);
    page.control(zh.ui.retry)!.props.onClick(); await flush();
    expect(api).toHaveBeenLastCalledWith("team-unilevel-how", "zh");
    expect(text(page.root)).not.toContain(zh.howPublished.languageFallback);
  });
  it.each(["placeholder", "direct-scope", "seven-layer-scope", "template"])("rejects an incomplete %s publication without fabricated fallback rules", async kind => {
    const next = document();
    if (kind === "placeholder") next.blocks = [{ ...blocks[0], body: "Unresolved {value}" }, ...blocks.slice(1)];
    if (kind === "direct-scope") next.blocks = blocks.filter(b => b.id !== "direct-referral-scope");
    if (kind === "seven-layer-scope") next.blocks = blocks.filter(b => b.id !== "seven-layer-scope");
    if (kind === "template") next.templateId = "old-unilevel";
    const page = published(vi.fn().mockResolvedValue(next)); await flush();
    expect(text(page.root)).toContain(en.howPublished.unavailableBody);
    expect(text(page.root)).not.toContain("Published title");
    expect(text(page.root)).not.toContain("{value}");
    expect(page.control("Return to rewards")).toBeDefined();
  });
});

describe("binary local guide without authoritative rules", () => {
  it.each([en, zh, vietnamese])("keeps absent rules explicit instead of relabeling dollar examples as points", async dictionary => {
    const navBack = vi.fn();
    const page = mountEntry(binaryHowSource, {
      "@/components/app-chassis.vue": slot,
      "@/components/team/reward-page-surface.vue": slot,
      "@/components/team/team-rule-published.vue": slot,
      "@/components/sub-page-header.vue": slot,
      "@/components/team/team-rule-hero.vue": ruleHero,
      "@/components/team/team-rule-section.vue": ruleSection,
      "@/components/team/team-rule-guide-copy": { teamRuleGuideCopy },
      "@/store/locale": { useLocaleStore: () => ({ code: dictionary === zh ? "zh" : dictionary === vietnamese ? "vi" : "en" }) },
      "@/api/runtime": { remoteApiEnabled: false },
      "@/lib/team-how-content-mode": { howContentMode },
      "@/i18n/use-t": { useT: () => Vue.ref(dictionary) },
      "@/lib/route": { navBack },
    });
    cleanups.push(page.unmount);
    expect(text(page.root)).toContain(dictionary.binaryHowItWorks.s1Para1);
    // Sections stay expanded (design system 04.7); the hero directory only scrolls to them.
    expect(page.control(dictionary.binaryHowItWorks.s4Title)!.props.role).toBe("link");
    expect(text(page.root)).toContain(dictionary.binary.gapHint);
    expect(text(page.root)).toContain(dictionary.howPublished.unavailableBody);
    for (const invented of ["$3,000", "$2,000", "$200", "10%", "Sarah"]) expect(text(page.root)).not.toContain(invented);
    const faq = all(page.root).find(node => node.props.role === "button" && text(node).startsWith(dictionary.binaryHowItWorks.faqQ3))!;
    faq.props.onClick(); await flush();
    expect(text(page.root).split(dictionary.howPublished.unavailableBody)).toHaveLength(3);
    page.control(dictionary.binaryHowItWorks.ctaBack)!.props.onClick();
    expect(navBack).toHaveBeenCalledWith("/pages/team/binary");
  });
});
