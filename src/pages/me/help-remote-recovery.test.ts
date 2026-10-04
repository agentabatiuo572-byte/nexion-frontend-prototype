import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { createSSRApp, computed, h, nextTick, reactive, ref, watch } from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./help.vue?raw";
import { readPublishedFaqPages } from "@/lib/published-faq-pages";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const scriptStart = page.indexOf("const faqs = ref");
const scriptEnd = page.indexOf("function detailVal", scriptStart);
const scopeWatchStart = page.indexOf("watch([", scriptEnd);
const scopeWatchEnd = page.indexOf("});", scopeWatchStart) + 3;
if (scriptStart < 0 || scriptEnd < 0 || scopeWatchStart < 0 || scopeWatchEnd < scopeWatchStart) throw new Error("Help FAQ lifecycle source is required");
const lifecycleCode = ts.transpileModule(
  `${page.slice(scriptStart, scriptEnd)} ${page.slice(scopeWatchStart, scopeWatchEnd)}; return { faqs, faqLoading, faqLoadError, faqPageNum, faqTotal, retryFaqs: typeof retryFaqs === "function" ? retryFaqs : null };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

const template = parse(page).descriptor.template?.content;
if (!template) throw new Error("Help template is required");
const faqStart = template.indexOf('<view class="mx-4" :style="faqWrapStyle">');
const faqEnd = template.indexOf("      <!-- UVELBot -->", faqStart);
if (faqStart < 0 || faqEnd < 0) throw new Error("Help FAQ template is required");
const faqRender = new Function("Vue", compile(template.slice(faqStart, faqEnd), { mode: "function", prefixIdentifiers: true }).code)(await import("vue"));

function pageRecord(id: string) {
  return { id, category: "technical", question: `Question ${id}`, answer: `Answer ${id}`, language: "en-US", sortOrder: 1, version: 1, updatedAt: Date.now() };
}

function setup() {
  const app = reactive({ accountKey: "user:1", accountBindingEpoch: 0 });
  const locale = reactive({ code: "en" });
  let scopeEpoch = 0;
  const scope = {
    snapshot: () => ({ accountKey: app.accountKey, epoch: scopeEpoch }),
    isCurrent: (request: { accountKey: string; epoch: number }) => request.accountKey === app.accountKey && request.epoch === scopeEpoch,
  };
  const shown: Array<() => void> = [];
  const supportApi = { faqPage: vi.fn() };
  const value = new Function("ref", "computed", "watch", "supportApi", "remoteAccountScope", "locale", "app", "onShow", "syncBotAccountScope", "onLoad", "readPublishedFaqPages", lifecycleCode)(
    ref, computed, watch, supportApi, scope, locale, app, (callback: () => void) => shown.push(callback), () => {}, () => {}, readPublishedFaqPages,
  ) as {
    faqs: { value: ReturnType<typeof pageRecord>[] };
    faqLoading: { value: boolean };
    faqLoadError: { value: boolean };
    faqPageNum: { value: number };
    faqTotal: { value: number };
    retryFaqs: (() => void) | null;
  };
  return { app, scope: { rebindSameAccount: () => { scopeEpoch += 1; app.accountBindingEpoch += 1; } }, shown, supportApi, value };
}

describe("Help FAQ remote recovery", () => {
  it("renders a withdrawn search target as no match without exposing its internal ID", async () => {
    const requestedFaqId = "FAQ-withdrawn-private-reference";
    const app = createSSRApp({ render: faqRender, setup: () => ({
      requestedFaqId, query: "", faqs: [pageRecord("another")], filtered: [],
      faqLoadError: false, faqPageNum: 1, faqLoading: false, canLoadMoreFaqs: false,
      faqWrapStyle: {},
      t: { empty: { searchTitle: "No matching question", searchDesc: "Try another search", listTitle: "No questions", listDesc: "Nothing published" } },
    }) });
    app.component("EmptyState", {
      props: ["kind", "title", "desc"],
      setup: (props: { kind?: string; title?: string; desc?: string }) => () =>
        h("section", { "data-kind": props.kind }, [h("h2", props.title), h("p", props.desc)]),
    });
    const html = await renderToString(app);
    expect(html).toContain('data-kind="no-search-results"');
    expect(html).toContain("No matching question");
    expect(html).not.toContain("empty-list");
    expect(html).not.toContain("Nothing published");
    expect(html).not.toContain(requestedFaqId);
    expect(html).not.toContain("Question another");
  });

  it("starts exactly one replacement read when the same account is rebound and never accepts the late old response", async () => {
    const first = deferred<{ items: ReturnType<typeof pageRecord>[]; pageNum: number; total: number }>();
    const second = deferred<{ items: ReturnType<typeof pageRecord>[]; pageNum: number; total: number }>();
    const s = setup();
    s.supportApi.faqPage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    s.shown.forEach(callback => callback());
    expect(s.supportApi.faqPage).toHaveBeenCalledTimes(1);
    s.scope.rebindSameAccount();
    await nextTick();
    expect(s.supportApi.faqPage).toHaveBeenCalledTimes(2);

    first.resolve({ items: [pageRecord("old")], pageNum: 1, total: 1 });
    await Promise.resolve();
    expect(s.value.faqs.value).toEqual([]);
    expect(s.value.faqLoading.value).toBe(true);

    second.resolve({ items: [pageRecord("current")], pageNum: 1, total: 1 });
    await Promise.resolve();
    expect(s.value.faqs.value.map(item => item.id)).toEqual(["current"]);
    expect(s.value.faqLoading.value).toBe(false);
  });

  it("renders and executes a retry for a failed refresh of a complete snapshot", async () => {
    const first = deferred<{ items: ReturnType<typeof pageRecord>[]; pageNum: number; total: number }>();
    const failed = deferred<{ items: ReturnType<typeof pageRecord>[]; pageNum: number; total: number }>();
    const retried = deferred<{ items: ReturnType<typeof pageRecord>[]; pageNum: number; total: number }>();
    const s = setup();
    s.supportApi.faqPage.mockReturnValueOnce(first.promise).mockReturnValueOnce(failed.promise).mockReturnValueOnce(retried.promise);

    s.shown.forEach(callback => callback());
    first.resolve({ items: [pageRecord("known")], pageNum: 1, total: 1 });
    await Promise.resolve();
    s.shown.forEach(callback => callback());
    failed.reject(new Error("refresh unavailable"));
    await Promise.resolve();

    expect(s.value.faqLoadError.value).toBe(true);
    expect(s.value.faqTotal.value).toBe(1);
    expect(s.value.retryFaqs).toEqual(expect.any(Function));

    const app = createSSRApp({ render: faqRender, setup: () => ({
      faqLoadError: true, faqs: [pageRecord("known")], filtered: [pageRecord("known")], faqPageNum: 1, faqLoading: false, canLoadMoreFaqs: false,
      query: "", t: { empty: { errorTitle: "Unavailable", errorDesc: "Refresh failed", errorCta: "Retry", searchTitle: "", searchDesc: "", listTitle: "", listDesc: "" } },
      w: { loadingMore: "Loading", loadMore: "More" }, faqWrapStyle: {}, faqFallbackStyle: {}, faqDividerStyle: {}, faqHeadStyle: {}, faqQStyle: {}, faqBodyStyle: {}, faqAStyle: {}, faqLoadMoreStyle: {}, chevStyle: () => ({}),
      openId: null, toggleFaq: () => {}, retryFaqs: () => {}, loadMoreFaqs: () => {},
    }) });
    app.component("EmptyState", { render: () => null });
    const html = await renderToString(app);
    expect(html).toContain("Retry");

    s.value.retryFaqs!();
    expect(s.supportApi.faqPage).toHaveBeenCalledTimes(3);
    expect(s.value.faqLoading.value).toBe(true);
    retried.resolve({ items: [pageRecord("fresh")], pageNum: 1, total: 1 });
    await Promise.resolve();
    expect(s.value.faqs.value.map(item => item.id)).toEqual(["fresh"]);
  });
});
