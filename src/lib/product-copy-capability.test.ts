import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { productCopy } from "./product-copy";
import type { Product } from "@/mock/products";

describe("server catalog capability copy", () => {
  it.each([zh, en, vi])("localizes a known backend badge in each language", (messages) => {
    const pro = { id: "stellarbox-pro", tagline: "Managed device", badge: "热销" } as Product;
    expect(productCopy(messages, pro, true)).toEqual({ tagline: "Managed device", badge: messages.store.bestSeller, unlocks: "" });
  });

  it("recognizes known labels by meaning regardless of source language or SKU", () => {
    const pro = { id: "stellarbox-pro", tagline: "Managed device", badge: "正热" } as Product;
    expect(productCopy(vi, pro, true).badge).toBe(vi.store.catalog["stellarbox-pro"].badge);
    expect(productCopy(vi, { ...pro, badge: "Trending" }, true).badge).toBe(vi.store.catalog["stellarbox-pro"].badge);
    expect(productCopy(zh, { ...pro, badge: "Trending" }, true).badge).toBe(zh.store.catalog["stellarbox-pro"].badge);
    expect(productCopy(vi, { ...pro, id: "custom-one", badge: "Trending" }, true).badge).toBe(vi.store.catalog["stellarbox-pro"].badge);
    expect(productCopy(vi, { ...pro, id: "custom-one", badge: "Best Seller" }, true).badge).toBe(vi.store.bestSeller);
    expect(productCopy(en, { ...pro, badge: "旗舰" }, true).badge).toBe(en.store.catalog["stellarrack-p1"].badge);
    expect(productCopy(zh, { ...pro, badge: "Low Barrier" }, true).badge).toBe(zh.store.catalog["cloud-share"].badge);
  });

  it("preserves unknown custom badges and an empty badge", () => {
    const pro = { id: "stellarbox-pro", tagline: "Managed device", badge: "Limited 48h" } as Product;
    expect(productCopy(vi, pro, true).badge).toBe("Limited 48h");
    expect(productCopy(vi, { ...pro, badge: undefined }, true).badge).toBe("");
  });

  it("does not turn a 12GB Pro into a fine-tuning or 405B promise", () => {
    const pro = {
      id: "stellarbox-pro",
      tagline: "Managed device",
      badge: "Pro",
      vram: "12GB",
      ai: { unlocks: "Fine-tune + 405B inference" },
    } as Product;

    expect(productCopy(en, pro, true)).toEqual({ tagline: "Managed device", badge: "Pro", unlocks: "" });
  });
});
