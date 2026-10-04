import { describe, expect, it, vi } from "vitest";
import { createNotificationApi } from "./notification-api";

const createdInstant = Date.parse("2026-09-18T03:38:00Z");
const readInstant = Date.parse("2026-09-18T04:20:00Z");
function page(createdAt: unknown, readAt: unknown = null) {
  const request = vi.fn().mockResolvedValue({
    items: [{ id: 1, kind: "system", priority: "normal", title: "Welcome",
      body: "", ctaLabel: "", ctaHref: "", createdAt, readAt }],
    nextCursor: null, unread: readAt === null ? 1 : 0,
  });
  return createNotificationApi({ request } as never).page();
}

describe("notification timestamp contract", () => {
  it("preserves the server's historical title and body text", async () => {
    const title = " 风险披露已更新 ";
    const body = " Welcome to " + "Nex" + "Grid ";
    const request = vi.fn().mockResolvedValue({
      items: [{ id: 1, kind: "system", priority: "critical", title, body,
        ctaLabel: "Review now", ctaHref: "/pages/me/risk-disclosure", createdAt: createdInstant, readAt: null }],
      nextCursor: null, unread: 1,
    });
    const result = await createNotificationApi({ request } as never).page();
    expect(result.items[0]).toMatchObject({ title, body, readAt: null,
      ctaHref: "/pages/me/risk-disclosure" });
  });

  it.each(["2026-09-18 11:38:00", "2026-09-18T11:38:00"])(
    "parses server business time %s independently of the device timezone", async createdAt => {
      const result = await page(createdAt, "2026-09-18 12:20:00");
      expect(result.items[0].createdAt).toBe(createdInstant);
      expect(result.items[0].readAt).toBe(readInstant);
      expect(Math.floor((Date.parse("2026-09-18T04:30:00Z") - result.items[0].createdAt) / 60_000)).toBe(52);
    });

  it.each(["2026-09-18T03:38:00Z", "2026-09-18T11:38:00+08:00", "2026-09-18T12:38:00+09:00", createdInstant])(
    "preserves the explicit instant %s and an unread notification", async createdAt => {
      const result = await page(createdAt);
      expect(result.items[0].createdAt).toBe(createdInstant);
      expect(result.items[0].readAt).toBeNull();
      expect(result.unread).toBe(1);
    });

  it.each(["2026-02-30 11:38:00", "2026-09-18", "invalid", null, 0, Infinity])(
    "rejects invalid creation time %s instead of fabricating a time", async createdAt => {
      await expect(page(createdAt)).rejects.toMatchObject({ message: "NOTIFICATION_RESPONSE_INVALID" });
    });

  it("rejects an invalid read time without changing read-state semantics", async () => {
    await expect(page(createdInstant, "2026-02-30 12:20:00"))
      .rejects.toMatchObject({ message: "NOTIFICATION_RESPONSE_INVALID" });
  });
});

describe("notification unread summary contract", () => {
  const row = (id: number, kind = "wallet") => ({ id, kind, priority: "normal", title: String(id),
    body: "", ctaLabel: "", ctaHref: "", createdAt: createdInstant, readAt: null });
  const requestPage = (value: unknown, cursor?: string) => createNotificationApi({
    request: vi.fn().mockResolvedValue(value),
  } as never).page(cursor);

  it("accepts account-wide kinds beyond a full first page and on later pages", async () => {
    const unreadByKind = { wallet: 100, device: 7, unknown_event: 1 };
    const first = await requestPage({ items: Array.from({ length: 100 }, (_, index) => row(index + 1)),
      unread: 108, unreadByKind, nextCursor: "older" });
    expect(first.unreadByKind).toEqual(unreadByKind);
    const tail = await requestPage({ items: [row(101, "device")], unread: 108, unreadByKind, nextCursor: null }, "older");
    expect(tail.unreadByKind).toEqual(unreadByKind);
  });

  it("supports a missing summary during a rolling deployment and an empty zero summary", async () => {
    expect((await requestPage({ items: [row(1)], unread: 1, nextCursor: null })).unreadByKind).toBeUndefined();
    expect((await requestPage({ items: [], unread: 0, unreadByKind: {}, nextCursor: null })).unreadByKind).toEqual({});
  });

  it.each([
    null, [], "wallet", { wallet: -1 }, { wallet: 0.5 }, { wallet: "1" },
    { wallet: null }, { wallet: true }, { wallet: Number.MAX_SAFE_INTEGER + 1 },
    { Wallet: 1 }, { " wallet": 1 }, { "": 1 }, { wallet: 0 }, { wallet: 2 },
    { wallet: Number.MAX_SAFE_INTEGER, device: Number.MAX_SAFE_INTEGER },
  ])("rejects a malformed provided summary: %j", async unreadByKind => {
    await expect(requestPage({ items: [row(1)], unread: 1, unreadByKind, nextCursor: null }))
      .rejects.toMatchObject({ kind: "protocol", message: "NOTIFICATION_UNREAD_SUMMARY_INVALID" });
  });

  it("rejects a summary that contradicts the known unread kinds even if the total matches", async () => {
    await expect(requestPage({ items: [row(1)], unread: 1, unreadByKind: { device: 1 }, nextCursor: "older" }))
      .rejects.toMatchObject({ message: "NOTIFICATION_PAGE_INCONSISTENT" });
  });

  it("treats prototype-shaped unknown kinds as ordinary entries without inheriting counts", async () => {
    const unreadByKind = JSON.parse('{"__proto__":1,"constructor":1}');
    const result = await requestPage({ items: [row(1, "__proto__"), row(2, "constructor")],
      unread: 2, unreadByKind, nextCursor: null });
    expect(Object.entries(result.unreadByKind!)).toEqual([["__proto__", 1], ["constructor", 1]]);
    await expect(requestPage({ items: [row(1, "constructor")], unread: 1,
      unreadByKind: { wallet: 1 }, nextCursor: "older" })).rejects.toMatchObject({ message: "NOTIFICATION_PAGE_INCONSISTENT" });
  });

  it("keeps the existing duplicate-row and complete-head consistency checks", async () => {
    await expect(requestPage({ items: [row(1), row(1)], unread: 2, unreadByKind: { wallet: 2 }, nextCursor: null }))
      .rejects.toMatchObject({ message: "NOTIFICATION_PAGE_INCONSISTENT" });
    await expect(requestPage({ items: [row(1)], unread: 2, unreadByKind: { wallet: 2 }, nextCursor: null }))
      .rejects.toMatchObject({ message: "NOTIFICATION_PAGE_INCONSISTENT" });
  });
});
