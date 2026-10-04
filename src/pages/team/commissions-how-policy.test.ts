// @ts-ignore Node-only contract test; the App tsconfig intentionally excludes Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync(new URL("./commissions-how.vue", import.meta.url), "utf8");
describe("commission guide layout and server authority", () => {
  it("retains five reference sections, six channel cards, lifecycle, example and four FAQs", () => {
    expect((page.match(/<HowSection\b/g) || [])).toHaveLength(5);
    expect(page).toContain("HowIconRow"); expect(page).toContain("HowFaqRow");
    expect(page).toContain("statusBoxStyle"); expect(page).toContain("exampleBoxStyle");
  });
  it("never swaps failed published content for the fixed prototype narrative", () => {
    expect(page).not.toMatch(/HowPublishedContent|publishedContentUnavailable|BINARY_SETTLE_PERIOD|45\.20|2,000|79\.00/);
    expect(page).toContain("createCommissionsHowResource");
    expect(page).toContain("commissionGuideApi");
    expect(page).not.toMatch(/v-html|commissionConfigApi\.binary\(/);
  });
  it("has retry and footer buttons with keyboard activation", () => {
    expect(page).toContain('role="button"'); expect(page).toContain('@keydown.enter.prevent="reload"');
    expect(page).toContain('@keydown.space.prevent="goBack"');
  });
});
