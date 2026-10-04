import { describe, expect, it, vi } from "vitest";
import type { SupportFaq } from "@/domain/support";
import { readPublishedFaqPages } from "./published-faq-pages";

const faq = (n: number): SupportFaq => ({ id: `faq-${n}`, category: "technical", question: `Question ${n}`,
  answer: `Answer ${n}`, language: "zh-CN", sortOrder: n, version: 1, updatedAt: 1 });
const first = () => ({ items: Array.from({ length: 50 }, (_, n) => faq(n)), pageNum: 1, pageSize: 50, total: 51 });
const last = () => ({ items: [faq(50)], pageNum: 2, pageSize: 50, total: 51 });

describe("complete published FAQ read", () => {
  it("includes the 51st question and requests only Help Center pages for the selected language", async () => {
    const api = { faqPage: vi.fn().mockResolvedValueOnce(first()).mockResolvedValueOnce(last()) };
    const result = await readPublishedFaqPages(api, "vi");
    expect(result).toHaveLength(51);
    expect(result[50].id).toBe("faq-50");
    expect(api.faqPage.mock.calls).toEqual([["vi", undefined, "Help Center", 1, 50], ["vi", undefined, "Help Center", 2, 50]]);
  });

  it.each(["truncated", "duplicate", "changed total"])("rejects a %s pagination result instead of claiming an empty or complete corpus", async (kind) => {
    const next = last();
    if (kind === "truncated") next.items = [];
    if (kind === "duplicate") next.items = [faq(0)];
    if (kind === "changed total") next.total = 52;
    const api = { faqPage: vi.fn().mockResolvedValueOnce(first()).mockResolvedValueOnce(next) };
    await expect(readPublishedFaqPages(api, "zh")).rejects.toThrow("SUPPORT_FAQ_PAGE_INCOMPLETE");
  });

  it("stops pagination as soon as the account or language scope expires", async () => {
    let current = true;
    const api = { faqPage: vi.fn().mockImplementation(async () => { current = false; return first(); }) };
    await expect(readPublishedFaqPages(api, "en", () => current)).rejects.toThrow("SUPPORT_FAQ_READ_SUPERSEDED");
    expect(api.faqPage).toHaveBeenCalledOnce();
  });

  it("accepts a confirmed empty corpus and preserves a network failure", async () => {
    const empty = { faqPage: vi.fn().mockResolvedValue({ items: [], total: 0, pageNum: 1, pageSize: 50 }) };
    await expect(readPublishedFaqPages(empty, "zh")).resolves.toEqual([]);
    const failed = { faqPage: vi.fn().mockRejectedValue(new Error("unavailable")) };
    await expect(readPublishedFaqPages(failed, "zh")).rejects.toThrow("unavailable");
  });
});
