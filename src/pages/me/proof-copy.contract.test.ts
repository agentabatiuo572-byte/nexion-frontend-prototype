import { describe, expect, it } from "vitest";

const sources = import.meta.glob([
  "../../i18n/messages/zh.ts", "../../i18n/messages/en.ts", "../../i18n/messages/vi.ts", "./proof.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function proofMessages(path: string) {
  const source = sources[path] ?? "";
  const start = source.indexOf("  proof: {");
  const end = source.indexOf("  taskHistory:", start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

describe("proof sharing copy", () => {
  it.each([
    ["../../i18n/messages/zh.ts", "有效业务与奖励记录"],
    ["../../i18n/messages/en.ts", "valid activity, and reward records"],
    ["../../i18n/messages/vi.ts", "hoạt động hợp lệ và lịch sử thưởng"],
  ])("keeps the %s invitation conditional on rules, valid activity, and reward records", (path, expected) => {
    const copy = proofMessages(path);
    expect(copy).toContain(expected);
    expect(copy).not.toMatch(/5%|终身|lifetime|trọn đời|earn(?:s)? when they join/iu);
  });

  it("does not turn the network share message into an earnings promise or duplicate an unknown percentile", () => {
    const page = sources["./proof.vue"] ?? "";
    expect(page).not.toContain("Compound earnings from each");
    expect(page).toContain('topPct.value === null ? "—"');
    expect(page).toContain("topPct.value === null ? t.value.proof.topPctUnavailable");
  });
});
