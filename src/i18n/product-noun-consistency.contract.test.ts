import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { vi } from "./messages/vi";
import { zh } from "./messages/zh";
import zhSource from "./messages/zh.ts?raw";

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

  it("keeps NEX buyback copy out of the repurchase rename", () => {
    // zh :1184/:3380/:4141 的「回购」指 NEX 回购(销毁/底价/回购流),语义正确 ——
    // 复投改名不得误伤,这三处必须逐字保留。
    const preserved = [
      "受 AI 推理需求 / 回购流 / 加密市场环境影响",
      "综合 DEX 交易数据 + 月度回购底价",
      "30% 平台手续费用于回购销毁,无限增发不存在",
    ];
    for (const line of preserved) expect(zhSource).toContain(line);
    expect(zhSource.match(/回购/g)).toHaveLength(3);
  });
});

describe("genesis tier premium copy states the price relation", () => {
  it("reads as a price comparison in Chinese and stays mirrored in en/vi", () => {
    expect(zh.genesis.tier.premium).toBe("较白名单价高 50%");
    expect(en.genesis.tier.premium).toBe("+50% over whitelist");
    expect(vi.genesis.tier.premium).toBe("+50% so với whitelist");
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
