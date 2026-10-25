import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { vi } from "./messages/vi";
import { zh } from "./messages/zh";

/**
 * BUG 186 / BUG 191 / BUG 180 的文案契约。
 *
 * 三条缺陷都不是渲染错误,而是**文案本身**说错了产品:
 *  • 186 同一页混用「复投 / 回购 / 加速提现」,并把 90 天锁仓包装成提现加速;
 *  • 191 价格档位写「较白名单 +50%」,中文读不通(缺「价高」);
 *  • 180 中文正文里硬编码英文 tab 名「Me」。
 * 三者都在三语字典里各写了一份,所以契约必须逐语断言。
 */
const LOCALES = [
  { code: "zh", messages: zh },
  { code: "en", messages: en },
  { code: "vi", messages: vi },
] as const;

describe("repurchase page names one product", () => {
  it.each(LOCALES)("%s orders its history under the same noun as the page", ({ messages }) => {
    const repurchase = messages.repurchase;
    // zh 用「复投」,en/vi 用 re-invest 同义名词;两处必须指向同一件事。
    expect(repurchase.ordersTitle).not.toBe(messages.store.ordersChip);
    expect(repurchase.ordersTitle).toMatch(/复投|re-invest|tái đầu tư/i);
    expect(repurchase.ordersEmpty).toMatch(/复投|re-invest|tái đầu tư/i);
    expect(repurchase.pageTitle).toMatch(/复投|re-invest|tái đầu tư/i);
    expect(repurchase.hero).toBe(repurchase.pageTitle);
  });

  it.each(LOCALES)("%s never sells the 90-day lock as faster withdrawals", ({ code, messages }) => {
    // 锁仓 90 天 + 提前赎回罚本金 —— 与「加速提现 / Faster withdrawals /
    // Rút tiền nhanh hơn」在语义上直接冲突,任何语言都不得保留。
    const page = JSON.stringify(messages.repurchase);
    expect(page).not.toMatch(/加速提现|Faster withdrawals|Rút tiền nhanh hơn/i);
    if (code === "zh") expect(page).not.toMatch(/回购/);
    expect(messages.repurchase.lockedNotice).toMatch(/90|锁|lock|khóa/i);
  });

  it.each(LOCALES)("%s keeps token buyback distinct from the re-investment product", ({ messages }) => {
    // Protect the meaning at its actual keys, without pinning an obsolete fee/burn claim.
    for (const text of [messages.riskDisclosure.s3Body, messages.exchangeHowItWorks.faqA1]) {
      expect(text).toMatch(/回购|buyback|mua lại/i);
      expect(text).not.toMatch(/复投|re-invest|tái đầu tư/i);
    }
  });

  it.each(LOCALES)("%s keeps token disclosure tied to published records without a fixed burn claim", ({ messages }) => {
    const disclosure = messages.nexHowItWorks.s4BurnBody;
    expect(disclosure).toMatch(/已发布规则|published rules|quy tắc đã công bố/i);
    expect(disclosure).toMatch(/真实记录|actual records|bản ghi thực tế/i);
    expect(disclosure).toMatch(/不承诺价格|not promise a price|không cam kết kết quả về giá/i);
    expect(disclosure).not.toMatch(/\d+(?:[.,]\d+)?\s*%|无限增发不存在/);
  });
});

describe("genesis tier copy does not invent a price relation", () => {
  it.each([zh,en,vi])("keeps a neutral price heading without an unsupported premium", (copy) => {
    expect(copy.genesis.tier.title).toBeTruthy();
    expect(copy.genesis.tier).not.toHaveProperty("premium");
    expect(JSON.stringify(copy.genesis.tier)).not.toContain("50%");
  });
});

describe("risk disclosure disclaimer resolves the tab name from the dictionary", () => {
  it.each(LOCALES)("%s injects its own tab name instead of hardcoding another language", ({ code, messages }) => {
    const body = messages.riskDisclosure.disclaimer;
    expect(body).toContain("{tab}");
    if (code === "zh") expect(body).not.toMatch(/Me|Của tôi/);
    if (code === "en") expect(body).not.toMatch(/Của tôi/);
    if (code === "vi") expect(body).not.toMatch(/\bMe\b/);
    // 注入源必须是同一个 tab 字典,否则三语又会各写一份。
    expect(body.replace("{tab}", messages.tabs.me)).toContain(messages.tabs.me);
  });
});
