import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { productCopy, productPoolLabel, specText } from "./product-copy";
import type { EarnTaskClass } from "@/api/earn-config-api";
import type { Product } from "@/mock/products";

describe("server catalog capability copy", () => {
  it("retains target qualification across locales without relabelling measured values", () => {
    expect(specText(zh, "目标 99.9%")).toBe("目标 99.9%");
    expect(specText(en, "目标 99.9%")).toBe("Target 99.9%");
    expect(specText(vi, "目标 99.9%")).toBe("Mục tiêu 99.9%");
    expect(specText(en, "99.5%")).toBe("99.5%");
    expect(specText(en, undefined, "-")).toBe("-");
  });
  it("resolves exact task IDs without guessing suffixes or exposing unresolved IDs", () => {
    const tasks = [{ taskId: "E2-20260924-LL", taskClass: "LL", taskName: "LLM 推理", enabled: true }] as EarnTaskClass[];
    for (const messages of [zh, en, vi]) {
      expect(productPoolLabel(messages, tasks[0].taskId, tasks)).toBe(messages.market.workloads.LL.label);
      expect(productPoolLabel(messages, "unknown-LL", tasks)).toBe("");
      expect(productPoolLabel(messages, tasks[0].taskId, [])).toBe("");
      expect(productPoolLabel(messages, tasks[0].taskId, [{ ...tasks[0], enabled: false }])).toBe("");
    }
  });
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

  it("uses only the server's selected pool, never a prototype's 405B capability", () => {
    const pro = {
      id: "stellarbox-pro",
      tagline: "Managed device",
      badge: "Pro",
      vram: "12GB",
      ai: { unlocks: "LL" },
    } as Product;

    for (const messages of [zh, en, vi]) {
      expect(productCopy(messages, pro, true).unlocks).toBe(messages.market.workloads.LL.label);
      expect(productCopy(messages, { ...pro, ai: undefined }, true).unlocks).toBe("");
      expect(productCopy(messages, { ...pro, ai: { unlocks: "unavailable" } }, true).unlocks).toBe("");
    }
  });
});
