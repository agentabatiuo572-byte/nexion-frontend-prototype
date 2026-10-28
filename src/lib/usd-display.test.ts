import { describe, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import { formatUsd, formatUsdOverviewParts } from "./usd-display";
import { formatAmount } from "./amount-display";
import eventSource from "../pages/events/detail.vue?raw";
import { eventDetailCopy, eventReminderCopy } from "@/i18n/event-detail";
import { eventDetailReward } from "@/pages/events/event-detail-display";

describe("contextual USD display", () => {
  it.each([
    [0, { prefix: "$", integer: "0", fraction: "00" }],
    [-0, { prefix: "$", integer: "0", fraction: "00" }],
    ["-0.000000", { prefix: "$", integer: "0", fraction: "00" }],
    [0.00032, { prefix: "<$", integer: "0", fraction: "01" }],
    [0.009, { prefix: "<$", integer: "0", fraction: "01" }],
    [-0.00032, { prefix: "−<$", integer: "0", fraction: "01" }],
    [1234.567, { prefix: "$", integer: "1,234", fraction: "57" }],
    [null, null], [undefined, null], [NaN, null], ["invalid", null],
  ])("splits hero typography without inventing a currency prefix for %s", (value, expected) => {
    expect(formatUsdOverviewParts(value as number | string | null | undefined)).toEqual(expected);
  });

  it.each([
    [0, "$0.00"], [-0, "$0.00"], ["-0.000000", "$0.00"],
    [0.00032, "<$0.01"], [0.009, "<$0.01"], ["0.009999", "<$0.01"],
    [-0.00032, "−<$0.01"], ["-0.009999", "−<$0.01"],
    [0.01, "$0.01"], [-0.01, "−$0.01"],
    [1234.567, "$1,234.57"], ["999.995", "$1,000.00"],
    [1.005, "$1.01"], [-1.005, "−$1.01"],
    ["1.234567e3", "$1,234.57"], ["3.2e-4", "<$0.01"],
    [Number.MIN_VALUE, "<$0.01"], [1e21, "$1,000,000,000,000,000,000,000.00"],
    ["999999999999999999999999.995", "$1,000,000,000,000,000,000,000,000.00"],
  ] as const)("formats overview %s as %s", (value, expected) => {
    expect(formatUsd(value)).toBe(expected);
  });

  it.each([
    [0, "$0.00"], [-0, "$0.00"], ["-0.000000", "$0.00"],
    ["0.002634", "$0.0026"], ["0.171960", "$0.172"],
    [0.00032, "$0.0003"], [-0.00032, "−$0.0003"],
    ["0.00001", "<$0.0001"], ["-0.00001", "−<$0.0001"],
    ["0.00009999", "<$0.0001"], [Number.MIN_VALUE, "<$0.0001"],
    ["0.0001", "$0.0001"], ["0.00015", "$0.0002"],
    ["9.99995", "$10.00"], ["999.99995", "$1,000.00"],
    [1234.56789, "$1,234.5679"], ["-1234.56789", "−$1,234.5679"],
    ["0001234.560000", "$1,234.56"], ["1.23456e-2", "$0.0123"],
  ] as const)("formats detail %s as %s", (value, expected) => {
    expect(formatUsd(value, "detail")).toBe(expected);
  });

  it.each([null, undefined, NaN, Infinity, -Infinity, "", " ", "invalid", "1,000", "1e309", "1e-325"])("keeps unknown %s distinct from zero", value => {
    expect(formatUsd(value)).toBe("-");
    expect(formatUsd(value, "detail", true)).toBe("-");
  });

  it("adds a credit sign without double signs, negative zero or signs on missing amounts", () => {
    expect(formatUsd(0, "detail", true)).toBe("$0.00");
    expect(formatUsd("-0.0000", "detail", true)).toBe("$0.00");
    expect(formatUsd(0.002634, "detail", true)).toBe("+$0.0026");
    expect(formatUsd(-0.002634, "detail", true)).toBe("−$0.0026");
    expect(formatUsd(0.00001, "detail", true)).toBe("+<$0.0001");
  });

  it("does not depend on native number localization", () => {
    const native = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(() => { throw new Error("UNAVAILABLE"); });
    try { expect(formatUsd(1234.56789, "detail")).toBe("$1,234.5679"); expect(native).not.toHaveBeenCalled(); }
    finally { native.mockRestore(); }
  });

  it("leaves ledger payloads and the general-purpose formatter unchanged", () => {
    const payload = Object.freeze({ rewardAmount: "0.002634", total: "1234.567890" });
    const original = JSON.stringify(payload);
    formatUsd(payload.rewardAmount, "detail"); formatUsd(payload.total);
    expect(JSON.stringify(payload)).toBe(original);
    expect(formatAmount(-0.00032)).toBe("-0.00");
    expect(formatAmount(1234.567)).toBe("1234.57");
  });
});

// Render the actual event template in Node; this is not a browser/visual acceptance test.
const renderEvent = new Function("Vue", compile(parse(eventSource).descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue);

async function renderRewards(language: "zh" | "en" | "vi", amount: number | null) {
  const detail = {
    event: { title: "Event", subtitle: "", kind: "regional", state: "ended" },
    rules: {}, enabled: true, eligibilityReason: "CLAIMED", targetValue: 1, progressValue: 1,
    myRewardAmount: amount,
    rewards: [{ type: "USDT", amount: "1234.567890" }, { type: "UVT", amount: 20 }],
    results: [{ region: "CN", rank: 1, volume: 7554.1, rewardAmount: 1 }],
  };
  const before = JSON.stringify(detail);
  const html = await renderToString(Vue.createSSRApp({
    render: renderEvent,
    setup: () => ({
      detail, loading: false, error: false, busy: false, commandError: false, action: null,
      language, copy: eventDetailCopy[language], reminderCopy: eventReminderCopy[language],
      ruleRows: [], formatUsd, formatAmount, eventDetailReward,
      load: () => {},
    }),
    components: {
      AppChassis: { props: ["active"], setup: (_props: unknown, { slots }: any) => () => slots.default?.() },
      SubPageHeader: { render: () => null },
    },
  }));
  expect(JSON.stringify(detail)).toBe(before);
  return html;
}

describe("event template USD presentation", () => {
  it.each(["zh", "en", "vi"] as const)("keeps personal and regional rewards separate in %s", async language => {
    const html = await renderRewards(language, 0.002634);
    expect(html).toContain(eventDetailCopy[language].myReward);
    expect(html).toContain("$0.0026");
    expect(html).toContain(eventDetailCopy[language].regionPrize);
    expect(html).toContain("$1.00");
    expect(html).toContain("$7,554.10");
    expect(html).toContain("$1,234.5679");
    expect(html).toContain("20.00 UVT");
    expect(html).not.toContain("0.002634 USDT");
    expect(html).not.toContain('role="progressbar"');
  });
  it("distinguishes absent, zero and subprecision personal rewards", async () => {
    expect(await renderRewards("zh", null)).not.toContain(eventDetailCopy.zh.myReward);
    expect(await renderRewards("zh", 0)).toContain("$0.00");
    expect(await renderRewards("zh", 0.000001)).toContain("&lt;$0.0001");
  });
});
