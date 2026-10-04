import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import type { Product } from "@/mock/products";
import { localizedDatacenterValue, productCopy } from "./product-copy";

const cloudShare = {
  id: "cloud-share", name: "Cloud Share", tier: "Share", tagline: "云算力份额·低门槛",
  dailyEarn: 0, dailyEarnNEX: 3, price: 19.9, sold: 0, features: [], available: true,
} satisfies Product;

describe("server catalog copy", () => {
  it("localizes the published Cloud Share tagline in all three languages", () => {
    expect(productCopy(zh, cloudShare, true).tagline).toBe("云算力份额·低门槛");
    expect(productCopy(en, cloudShare, true).tagline).toBe("Cloud compute share · low entry barrier");
    expect(productCopy(vi, cloudShare, true).tagline).toBe("Suất điện toán đám mây · dễ tham gia");
  });

  it("localizes server separator spacing and full-width separator variants", () => {
    for (const tagline of ["云算力份额 · 低门槛", " 云算力份额 · 低门槛 ", "云算力份额・低门槛", "云算力份额･低门槛"]) {
      expect(productCopy(vi, { ...cloudShare, tagline }, true).tagline).toBe("Suất điện toán đám mây · dễ tham gia");
    }
  });

  it("preserves later operator edits and other products' server text", () => {
    expect(productCopy(vi, { ...cloudShare, tagline: "New offer" }, true).tagline).toBe("New offer");
    expect(productCopy(vi, { ...cloudShare, tagline: "云算力份额 · 限时活动" }, true).tagline).toBe("云算力份额 · 限时活动");
    expect(productCopy(vi, { ...cloudShare, id: "another-share" }, true).tagline).toBe(cloudShare.tagline);
  });
});

describe("published Pro device copy", () => {
  const pro = {
    ...cloudShare,
    id: "stellarbox-pro",
    name: "StellarBox Pro",
    tier: "Pro",
    tagline: "中端主力 · AI 推理 + 挖掘",
    datacenter: "美国·弗吉尼亚",
  } satisfies Product;

  it("translates the exact published tagline and datacenter label", () => {
    expect(productCopy(vi, pro, true, "vi").tagline).toBe("Dòng chủ lực tầm trung · Suy luận AI + khai thác");
    expect(productCopy(en, pro, true, "en").tagline).toBe("Midrange mainstay · AI inference + mining");
    expect(productCopy(zh, pro, true, "zh").tagline).toBe(pro.tagline);
    expect(localizedDatacenterValue(pro.datacenter, "vi")).toBe("Hoa Kỳ · Virginia");
    expect(localizedDatacenterValue(pro.datacenter, "en")).toBe("United States · Virginia");
    expect(localizedDatacenterValue(pro.datacenter, "zh")).toBe(pro.datacenter);
  });

  it("preserves operator edits, other SKUs, and absent spec values", () => {
    expect(productCopy(vi, { ...pro, tagline: "中端主力 · 限时活动" }, true, "vi").tagline)
      .toBe("中端主力 · 限时活动");
    expect(productCopy(vi, { ...pro, id: "another-pro" }, true, "vi").tagline).toBe(pro.tagline);
    expect(productCopy(vi, pro, true).tagline).toBe(pro.tagline);
    expect(localizedDatacenterValue("美国·纽约", "vi")).toBe("美国·纽约");
    expect(localizedDatacenterValue("unavailable", "vi")).toBe("unavailable");
    expect(localizedDatacenterValue(undefined, "vi")).toBeUndefined();
  });
});
