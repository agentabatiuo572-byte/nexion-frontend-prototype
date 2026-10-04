import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";

/**
 * zentao #246:在 Pro v2 商品页点「查看解锁条件」,跳到的是**另一件商品**的配额页。
 *
 * 成因是详情页把 href 硬编码成 `/pages/team/quota`,而配额页只列它自己的档位
 * (服务端下发的 quota tiers),并不含用户当前在看的商品 —— 于是「查看解锁条件」
 * 指向了别人的条件。配额页也不读任何路由参数,连「用户想看哪件」都无从知道。
 *
 * 本门钉住:详情页必须带上当前商品 id;配额页必须读它,且当该商品不在档位里时**明说**,
 * 而不是静默展示无关档位。
 */
const detailSource = readFileSync(new URL("../store/detail.vue", import.meta.url), "utf8");
const quotaSource = readFileSync(new URL("./quota.vue", import.meta.url), "utf8");

describe("quota deep link carries the product being viewed", () => {
  it("sends the current product id from the product page", () => {
    // Local purchase gates still carry the viewed product id.
    const hrefs = detailSource.match(/href: [^\n]*team\/quota[^\n]*/g) ?? [];
    expect(hrefs.length).toBeGreaterThanOrEqual(1);
    for (const href of hrefs) {
      expect(href, href).toContain("team/quota?product=");
      expect(href, href).toContain("encodeURIComponent(product.value.id)");
    }
    // 硬编码的裸跳转不许回来 —— 那正是本单的成因。
    expect(detailSource).not.toMatch(/href: "\/pages\/team\/quota"/);
    expect(detailSource).toContain("purchaseEligibilityUnlockHref(eligibility.value.snapshot!, product.value.id)");
  });

  it("reads the parameter and admits when the product has no quota tier", () => {
    expect(quotaSource).toMatch(/onLoad\(\(options\)/);
    expect(quotaSource).toMatch(/options\?\.product/);
    expect(quotaSource).toContain('takeNavigationQuery("/pages/team/quota")');
    expect(quotaSource).toMatch(/focusedTierPresent/);
    // 不在档位里时必须给出提示,而不是静默展示别的商品。
    expect(quotaSource).toMatch(/v-if="!focusedTierPresent"/);
    expect(quotaSource).toMatch(/t\.quota\.focusedTierMissing/);
    expect(quotaSource).toMatch(/v-else class="px-4"/);
    expect(quotaSource).toMatch(/v-for="tier in focusedTiers"/);
    expect(quotaSource).toMatch(/tiers\.value\.filter\(\(tier\) => tier\.productId === focusedProductId\.value\)/);
    expect(quotaSource).toMatch(/go\(focusedProductHref\)/);
    expect(quotaSource).toMatch(/focusedProductId \? `\/pages\/store\/detail\?id=/);
  });

  it("has the explanation in every locale", () => {
    for (const { name, quota } of [
      { name: "zh", quota: zh.quota },
      { name: "en", quota: en.quota },
      { name: "vi", quota: vi.quota },
    ] as const) {
      const copy = quota.focusedTierMissing;
      expect(copy, name).toBeTruthy();
      expect(copy.length, name).toBeGreaterThan(20);
    }
  });
});
