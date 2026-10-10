import { describe, expect, it } from "vitest";
// @ts-expect-error Node-only test import; production TypeScript excludes Node types.
import { readFileSync } from "node:fs";
import { en } from "./messages/en";
import { vi } from "./messages/vi";
import { zh } from "./messages/zh";

function trialStoreCopy(messages: typeof en): string {
  return Object.entries(messages.store)
    .filter(([key]) => /Trial/i.test(key))
    .map(([, value]) => String(value))
    .join("\n");
}

describe("trial credit product language", () => {
  it.each(Object.entries({ zh, en, vi }))("preserves current trial consequences in %s", (_locale, messages) => {
    expect(messages.trial).not.toHaveProperty("legacyMigratedNote");
    expect(messages.trial.cancelConfirmMsg).toContain("NEX");
    expect(messages.trial.cancelConfirmMsg).not.toMatch(/无法再次领取|prevents this account|không thể nhận.*lần nữa/i);
    expect(messages.trial.rulesAfter).toContain("NEX");
    expect(messages.trial.rulesExpiry).toContain("NEX");
    expect(messages.trial.rulesExpiry).not.toContain("{days}");
    expect(messages.trial.endedDesc).toContain("NEX");
    expect(messages.trial.endedDesc).not.toContain("{time}");
    for (const message of [messages.trial.endedToast, messages.trial.urgencyGrace24h, messages.trial.urgencyGrace1h]) {
      expect(message).toContain("NEX");
    }
    expect(messages.trial.urgencyGrace24h).toContain("${amount}");
    expect(messages.trial.urgencyGrace1h).toContain("${amount}");
  });

  it("removes the retired card-migration notice and fixed grace-period expiry text", () => {
    const page = readFileSync(new URL("../pages/me/trial.vue", import.meta.url), "utf8");
    expect(page).not.toMatch(/legacyMigratedNote|legacyNoteStyle|freeTrial\.legacyCardMigrated/);
    expect(page).not.toMatch(/fmt\(w\.value\.rulesExpiry/);
  });

  it("distinguishes the purchase deadline and maximum discount from completed outcomes", () => {
    expect(zh.trial.countdownEnd).toContain("截止");
    for (const [messages, limit] of [[zh, "最高"], [en, "up to"], [vi, "tối đa"]] as const) {
      expect(messages.trial.sheetProp3Title).toContain(limit);
      expect(messages.trial.urgency24h).toContain(limit);
    }
    expect(zh.trial.urgencyGrace24h).toContain("24 小时内");
    expect(en.trial.urgencyGrace24h).toContain("within 24 hours");
    expect(vi.trial.urgencyGrace24h).toContain("trong 24 giờ tới");
    expect(zh.trial.urgencyGrace1h).toContain("1 小时内");
    expect(en.trial.urgencyGrace1h).toContain("within 1 hour");
    expect(vi.trial.urgencyGrace1h).toContain("trong 1 giờ tới");
    expect(zh.trial.cancelConfirmMsg).toContain("等待");
    expect(en.trial.cancelConfirmMsg).toContain("waiting period");
    expect(vi.trial.cancelConfirmMsg).toContain("phải chờ");
  });

  it("labels the capped row as purchase credit in all three languages", () => {
    expect(zh.trial.offsetAccruedLabel).toBe("本次购机可抵");
    expect(en.trial.offsetAccruedLabel).toBe("Available toward device purchase");
    expect(vi.trial.offsetAccruedLabel).toBe("Có thể khấu trừ khi mua máy");
  });

  it("does not infer a closed offer from unavailable eligibility reads", () => {
    for (const messages of [zh, en, vi]) {
      expect(messages.trial.eligReasonClosed).not.toMatch(/未开放|未开启|not open|closed|chưa mở/i);
    }
  });

  it("names the visible Chinese trial value as trial credit, never cash-like trial earnings", () => {
    const copy = `${JSON.stringify(zh.trial)}\n${trialStoreCopy(zh)}`;

    expect(zh.trial.heroEarnLabel).toBe("{days} 天预计抵扣金");
    expect(zh.trial.ghostSubtitle).toBe("UVELBox S1 试用抵扣金");
    expect(copy).not.toMatch(/试用收益|预计收益|收益持续|收益停止|赚的钱|试用攒到|到手/);
  });

  it("keeps English and Vietnamese mirrors on the same non-cash trial-credit meaning", () => {
    const english = `${JSON.stringify(en.trial)}\n${trialStoreCopy(en)}`;
    const vietnamese = `${JSON.stringify(vi.trial)}\n${trialStoreCopy(vi)}`;

    expect(en.trial.ghostSubtitle).toBe("UVELBox S1 trial credit");
    expect(vi.trial.ghostSubtitle).toBe("Tiền khấu trừ dùng thử UVELBox S1");
    expect(english).not.toMatch(/trial earnings|what you'll pocket/i);
    expect(vietnamese).not.toMatch(/lợi nhuận dùng thử|thu nhập dùng thử|số tiền bạn bỏ túi/i);
  });
});
