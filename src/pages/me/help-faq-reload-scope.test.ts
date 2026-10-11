import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./help.vue?raw";
import { readPublishedFaqPages } from "@/lib/published-faq-pages";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";

// Execute the page's actual FAQ lifecycle and account watcher, including the
// onLoad -> onShow -> asynchronous account restoration sequence of a reload.
const start = page.indexOf("const faqs = ref");
const end = page.indexOf("const emptyResults", start);
const watchStart = page.indexOf("watch([", end);
const watchEnd = page.indexOf("});", watchStart) + 3;
if (start < 0 || end < start || watchStart < 0 || watchEnd < watchStart) throw new Error("Help FAQ scope lifecycle is required");
const source = ts.transpileModule(`${page.slice(start, end)} ${page.slice(watchStart, watchEnd)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const faq = (id: string, question = `Question ${id}`) => ({ id, category: "technical", question,
  answer: `Answer ${id}`, language: "zh-CN", sortOrder: 1, version: 1, updatedAt: 1 });
const result = (items = [faq("target"), faq("other")], pageSize = 50) => ({ items, total: items.length, pageNum: 1, pageSize });
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(stop => stop()));
async function settle() { for (let i = 0; i < 4; i++) { await Promise.resolve(); await nextTick(); } }
function deferred() {
  let resolve!: (value: ReturnType<typeof result>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ReturnType<typeof result>>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function setup(accountKey = "default", targetId = "target") {
  const app = reactive({ accountKey, accountBindingEpoch: 0 });
  const locale = reactive({ code: "zh" });
  const scope = createRemoteAccountEpoch(accountKey);
  const api = { faqPage: vi.fn() };
  const hooks: Record<string, (options?: { faqId: string }) => void> = {};
  const syncBotAccountScope = vi.fn();
  const effects = effectScope();
  const value = effects.run(() => new Function("ref", "computed", "watch", "supportApi", "remoteAccountScope", "locale", "app", "onShow", "syncBotAccountScope", "onLoad", "readPublishedFaqPages",
    `${source}; return {faqs, filtered, openId, query, faqLoadError, faqLoading, faqPageNum, canLoadMoreFaqs, requestedFaqId, selectCategory, onSearch};`)(
    ref, computed, watch, api, scope, locale, app, (callback: () => void) => { hooks.show = callback; }, syncBotAccountScope,
    (callback: (options?: { faqId: string }) => void) => { hooks.load = callback; }, readPublishedFaqPages,
  ))!;
  cleanups.push(() => effects.stop());
  hooks.load({ faqId: targetId });
  return { app, locale, api, value, syncBotAccountScope, show: () => hooks.show(), bind: (key: string) => {
    app.accountBindingEpoch += 1;
    app.accountKey = key;
    scope.bind(key);
  } };
}

describe("Help FAQ URL target survives initial account restoration", () => {
  it("opens the published target from an already initialized account", async () => {
    const s = setup("user:1");
    s.api.faqPage.mockResolvedValue(result());
    s.show(); await settle();
    expect(s.value.filtered.value.map((item: { id: string }) => item.id)).toEqual(["target"]);
    expect(s.value.openId.value).toBe("target");
    expect(s.value.query.value).toBe("Question target");
  });

  it("keeps the same reload target after an initial failed read and default-to-server-account recovery", async () => {
    const s = setup();
    s.api.faqPage.mockRejectedValueOnce(new Error("initial session not ready")).mockResolvedValueOnce(result());
    s.show(); await settle();
    expect(s.value.faqLoadError.value).toBe(true);
    s.bind("user:1"); await settle();
    expect(s.value.requestedFaqId.value).toBe("target");
    expect(s.api.faqPage).toHaveBeenLastCalledWith("zh", undefined, "Help Center", 1, 50);
    expect(s.value.filtered.value.map((item: { id: string }) => item.id)).toEqual(["target"]);
    expect(s.value.query.value).toBe("Question target");
    expect(s.value.openId.value).toBe("target");
    expect(s.value.faqLoadError.value).toBe(false);
  });

  it.each(["missing", "withdrawn"])("keeps a %s reload target empty instead of showing unrelated questions", async target => {
    const s = setup("default", target);
    s.api.faqPage.mockResolvedValue(result());
    s.show(); await settle();
    s.bind("user:1"); await settle();
    expect(s.value.requestedFaqId.value).toBe(target);
    expect(s.value.filtered.value).toEqual([]);
    expect(s.value.query.value).toBe("");
    expect(s.value.openId.value).toBeNull();
    expect(s.value.faqPageNum.value).toBe(1);
    expect(s.value.canLoadMoreFaqs.value).toBe(false);
  });

  it("fences the pre-restoration response while preserving only the route intent", async () => {
    const old = deferred(), current = deferred();
    const s = setup();
    s.api.faqPage.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    s.show();
    s.bind("user:1"); await settle();
    expect(s.value.faqs.value).toEqual([]);
    old.resolve(result([faq("target", "Old account question")])); await settle();
    expect(s.value.faqs.value).toEqual([]);
    expect(s.value.faqLoading.value).toBe(true);
    current.resolve(result()); await settle();
    expect(s.value.filtered.value.map((item: { id: string }) => item.id)).toEqual(["target"]);
    expect(s.value.query.value).toBe("Question target");
    expect(s.value.openId.value).toBe("target");
  });
});

describe("Help FAQ account and locale fences remain active", () => {
  it.each(["user:2", "user:1", "default"])("clears the prior projection and rejects late data after binding %s", async nextAccount => {
    const old = deferred(), current = deferred();
    const s = setup("user:1");
    s.api.faqPage.mockResolvedValueOnce(result()).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    s.show(); await settle();
    s.show(); s.bind(nextAccount); await settle();
    expect(s.value.requestedFaqId.value).toBe("");
    expect(s.value.query.value).toBe("");
    expect(s.value.openId.value).toBeNull();
    expect(s.value.faqs.value).toEqual([]);
    old.resolve(result([faq("target", "Old account question")])); await settle();
    expect(s.value.faqs.value).toEqual([]);
    expect(s.value.faqLoading.value).toBe(true);
    current.resolve(result([faq("current")], 20)); await settle();
    expect(s.value.filtered.value.map((item: { id: string }) => item.id)).toEqual(["current"]);
    expect(s.value.query.value).toBe("");
    expect(s.syncBotAccountScope).toHaveBeenCalledTimes(3);
  });

  it.each([false, true])("clears the locale projection and rejects the late prior locale (failure=%s)", async failure => {
    const old = deferred(), current = deferred();
    const s = setup("user:1");
    s.api.faqPage.mockResolvedValueOnce(result()).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    s.show(); await settle();
    s.show(); s.locale.code = "vi"; await settle();
    expect(s.value.requestedFaqId.value).toBe("");
    expect(s.value.query.value).toBe("");
    expect(s.value.openId.value).toBeNull();
    expect(s.value.faqs.value).toEqual([]);
    if (failure) old.reject(new Error("old locale unavailable"));
    else old.resolve(result([faq("target", "Old locale question")]));
    await settle();
    expect(s.value.faqs.value).toEqual([]);
    expect(s.value.faqLoadError.value).toBe(false);
    expect(s.value.faqLoading.value).toBe(true);
    expect(s.api.faqPage).toHaveBeenLastCalledWith("vi", undefined, "Help Center", 1, 20);
    current.resolve(result([faq("vi-current")], 20)); await settle();
    expect(s.value.filtered.value.map((item: { id: string }) => item.id)).toEqual(["vi-current"]);
  });

  it.each([["default", "unknown"], ["unknown", "user:1"], ["default", "user:0"], ["default", "user:invalid"]])(
    "does not treat %s to %s as a confirmed initial server identity", async (initial, next) => {
      const s = setup(initial);
      s.api.faqPage.mockResolvedValue(result());
      s.show(); await settle();
      s.bind(next); await settle();
      expect(s.value.requestedFaqId.value).toBe("");
      expect(s.value.query.value).toBe("");
      expect(s.value.openId.value).toBeNull();
      expect(s.value.filtered.value).toHaveLength(2);
    },
  );
});
