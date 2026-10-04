import { describe, expect, it } from "vitest";
import { createLegalTermsRequestFence } from "./legal-terms-request-fence";

describe("legal terms locale request fence", () => {
  it("rejects a late acknowledged response for the language that was replaced", () => {
    const fence = createLegalTermsRequestFence();
    const english = fence.start("en");
    const chinese = fence.start("zh");
    expect(fence.isCurrent(english, "zh", "en")).toBe(false);
    expect(fence.isCurrent(chinese, "zh")).toBe(true);
  });

  it("rejects an old response even after the user switches back to its locale", () => {
    const fence = createLegalTermsRequestFence();
    const firstChinese = fence.start("zh");
    fence.start("en");
    const secondChinese = fence.start("zh");
    expect(fence.isCurrent(firstChinese, "zh")).toBe(false);
    expect(fence.isCurrent(secondChinese, "zh")).toBe(true);
  });

  it("rejects a response whose requested locale does not match its request", () => {
    const fence = createLegalTermsRequestFence();
    const chinese = fence.start("zh");
    expect(fence.isCurrent(chinese, "zh", "en")).toBe(false);
  });

  it("identifies only the latest locale while another locale request is pending", () => {
    const fence = createLegalTermsRequestFence();
    fence.start("en");
    expect(fence.isLatestLocale("en")).toBe(true);

    fence.start("zh");
    expect(fence.isLatestLocale("en")).toBe(false);
    expect(fence.isLatestLocale("zh")).toBe(true);
  });

  it("invalidates a departed page even when the next page uses the same locale", () => {
    const fence = createLegalTermsRequestFence();
    const old = fence.start("en");
    fence.invalidate();
    expect(fence.isCurrent(old, "en")).toBe(false);
    expect(fence.isLatestLocale("en")).toBe(false);
    const current = fence.start("en");
    expect(fence.isCurrent(current, "en")).toBe(true);
  });
});
