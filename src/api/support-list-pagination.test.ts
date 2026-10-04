import { describe, expect, it, vi } from "vitest";
import { createSupportApi } from "./support-api";

const ticket = (id: number) => ({
  id,
  ticketNo: `TK-${id}`,
  title: `Ticket ${id}`,
  category: "technical",
  status: "OPEN",
  priority: "NORMAL",
  version: 1,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  lastMessageAt: "2026-09-01T00:00:00Z",
  messageCount: 1,
  userUnreadCount: 0,
  assignedAdminName: "",
});

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

describe("support list cursor pagination", () => {
  it("drains more than 100 tickets by immutable database id instead of mutable offsets", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ticket(200 - index));
    const second = Array.from({ length: 50 }, (_, index) => ticket(100 - index));
    const request = vi.fn(async ({ path }: { path: string }) => {
      if (path.includes("beforeId=101")) return { total: 150, pageNum: 1, pageSize: 100, records: second };
      return { total: 150, pageNum: 1, pageSize: 100, records: first };
    });

    const result = await createSupportApi({ request } as never).tickets();

    expect(result.items).toHaveLength(150);
    expect(new Set(result.items.map((row) => row.id)).size).toBe(150);
    expect(result.total).toBe(150);
    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      "/api/app/support/tickets/cursor?pageSize=100",
      "/api/app/support/tickets/cursor?pageSize=100&beforeId=101",
    ]);
  });
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
