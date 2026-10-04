import { computed, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./help.vue?raw";
import { readPublishedFaqPages } from "@/lib/published-faq-pages";

const start = page.indexOf("const faqs = ref");
const end = page.indexOf("const emptyResults", start);
if (start < 0 || end < start) throw new Error("Help FAQ target lifecycle is required");
const source = ts.transpileModule(page.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const faq = (n: number) => ({ id: `faq-${n}`, category: "technical", question: `Question ${n}`,
  answer: `Answer ${n}`, language: "zh-CN", sortOrder: n, version: 1, updatedAt: 1 });

function setup(targetId: string) {
  const api = { faqPage: vi.fn() };
  const locale = reactive({ code: "zh" });
  const value = new Function("ref", "computed", "supportApi", "remoteAccountScope", "locale", "onShow",
    "syncBotAccountScope", "onLoad", "readPublishedFaqPages",
    `${source}; return {loadFaqs, filtered, openId, query, faqLoadError, requestedFaqId, selectCategory, onSearch};`)(
    ref, computed, api, { snapshot: () => 1, isCurrent: () => true }, locale, () => {}, () => {},
    (callback: (options: { faqId: string }) => void) => callback({ faqId: targetId }), readPublishedFaqPages,
  );
  return { value, api, locale };
}

describe("search result opens the actual published FAQ", () => {
  it("opens a question beyond the first Help Center page and allows returning to all topics", async () => {
    const s = setup("faq-50");
    s.api.faqPage.mockResolvedValueOnce({ items: Array.from({ length: 50 }, (_, n) => faq(n)), total: 51, pageNum: 1, pageSize: 50 })
      .mockResolvedValueOnce({ items: [faq(50)], total: 51, pageNum: 2, pageSize: 50 });
    await s.value.loadFaqs();
    expect(s.value.filtered.value.map((item: { id: string }) => item.id)).toEqual(["faq-50"]);
    expect(s.value.openId.value).toBe("faq-50");
    expect(s.value.query.value).toBe("Question 50");
    s.value.selectCategory("all");
    expect(s.value.filtered.value).toHaveLength(51);
    expect(s.value.query.value).toBe("");
  });

  it("does not substitute a different FAQ when PC has withdrawn the clicked result", async () => {
    const s = setup("withdrawn");
    s.api.faqPage.mockResolvedValue({ items: [faq(1)], total: 1, pageNum: 1, pageSize: 50 });
    await s.value.loadFaqs();
    expect(s.value.filtered.value).toEqual([]);
    expect(s.value.openId.value).toBeNull();
    expect(s.value.query.value).toBe("");
    s.value.onSearch({ detail: { value: "Question" } });
    expect(s.value.filtered.value).toHaveLength(1);
  });

  it("shows a recoverable error when the target cannot be read", async () => {
    const s = setup("faq-1");
    s.api.faqPage.mockRejectedValue(new Error("unavailable"));
    await s.value.loadFaqs();
    expect(s.value.filtered.value).toEqual([]);
    expect(s.value.faqLoadError.value).toBe(true);
    expect(s.value.openId.value).toBeNull();
  });
});
