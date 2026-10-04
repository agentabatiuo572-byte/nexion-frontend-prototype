import { describe, expect, it } from "vitest";
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
  it("labels the capped row as purchase credit in all three languages", () => {
    expect(zh.trial.offsetAccruedLabel).toBe("本次购机可抵");
    expect(en.trial.offsetAccruedLabel).toBe("Available toward device purchase");
    expect(vi.trial.offsetAccruedLabel).toBe("Có thể khấu trừ khi mua máy");
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
