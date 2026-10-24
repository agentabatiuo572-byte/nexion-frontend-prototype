import { describe, expect, it } from "vitest";
import { presentRecommendation, localMessageImage } from "./message-presentation";
const copy = { product: "product", home: "home", wallet: "wallet", support: "support", unavailable: "unavailable", unknown: "unknown" };
const base = { id: "1", sender: "agent" as const, text: "original", ts: 1 };
describe("prototype-sync support message cards", () => {
  it("keeps unknown/unavailable content readable but non-actionable", () => {
    for (const targetAvailability of ["UNKNOWN", "UNAVAILABLE"] as const) {
      const card = presentRecommendation({ ...base, kind: "SKU", skuId: "s1", skuName: "Box", targetAvailability }, copy);
      expect(card.text).toContain("original"); expect(card.text).toContain("Box"); expect(card.ctaHref).toBeUndefined();
    }
  });
  it("routes only the three supported LINK destinations and legal SKU ids", () => {
    for (const [type, route] of [["HOME", "/home"], ["WALLET", "/me/wallet"], ["SUPPORT", "/pages/support/messages"]] as const) {
      expect(presentRecommendation({ ...base, kind: "LINK", targetAvailability: "AVAILABLE", linkTarget: { type, params: {} } }, copy).ctaHref).toBe(route);
    }
    expect(presentRecommendation({ ...base, kind: "SKU", targetAvailability: "AVAILABLE", skuId: "box-s1" }, copy).ctaHref).toBe("/pages/store/detail?id=box-s1");
    expect(presentRecommendation({ ...base, kind: "SKU", targetAvailability: "AVAILABLE", skuId: "https://x" }, copy).ctaHref).toBeUndefined();
    expect(presentRecommendation({ ...base, kind: "LINK", targetAvailability: "AVAILABLE", linkTarget: { type: "HOME", params: { url: "https://x" } as never } }, copy).ctaHref).toBeUndefined();
  });
  it("never exposes arbitrary remote image URLs in the offline prototype", () => {
    expect(localMessageImage("https://tracker.test/a.png")).toBeUndefined();
    expect(localMessageImage("data:text/html;base64,abc")).toBeUndefined();
    expect(localMessageImage("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
