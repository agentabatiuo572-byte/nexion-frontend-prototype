import { describe, expect, it, vi } from "vitest";
import { createSupportApi } from "./support-api";

const faq = (id: number) => ({
  id: `FAQ-${id}`,
  category: "technical",
  question: `Question ${id}`,
  answer: `Answer ${id}`,
  language: "en-US",
  sortOrder: id,
  version: 1,
  updatedAt: "2026-09-01T00:00:00Z",
});

describe("support FAQ pagination", () => {
  it("uses the bounded server page contract and preserves page metadata", async () => {
    const request = vi.fn(async () => ({
      total: 73,
      pageNum: 2,
      pageSize: 20,
      records: [faq(21), faq(22)],
    }));

    const result = await createSupportApi({ request } as never).faqPage("en-US", "technical", "Help Center", 2, 20);

    expect(result).toMatchObject({ total: 73, pageNum: 2, pageSize: 20 });
    expect(result.items.map((item) => item.id)).toEqual(["FAQ-21", "FAQ-22"]);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/app/support/faqs/page?language=en-US&surface=Help+Center&category=technical&pageNum=2&pageSize=20",
    });
  });

  it("rejects client requests outside the backend page bounds", async () => {
    const request = vi.fn();
    const api = createSupportApi({ request } as never);

    await expect(api.faqPage("en-US", undefined, undefined, 0, 20)).rejects.toThrow("SUPPORT_FAQ_PAGE_INVALID");
    await expect(api.faqPage("en-US", undefined, undefined, 1, 51)).rejects.toThrow("SUPPORT_FAQ_PAGE_INVALID");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects mismatched page metadata instead of advancing with the wrong cursor", async () => {
    const request = vi.fn(async () => ({
      total: 73,
      pageNum: 1,
      pageSize: 50,
      records: [faq(21)],
    }));

    await expect(createSupportApi({ request } as never).faqPage("en-US", undefined, undefined, 2, 20))
      .rejects.toThrow("SUPPORT_FAQ_RESPONSE_INVALID");
  });
});
