import { describe, expect, it } from "vitest";
import { PublishedContentRequestFence } from "./p3-14-published-request-fence";

describe("PublishedContentRequestFence", () => {
  it("deduplicates a retry for the active locale/content key", () => {
    const fence = new PublishedContentRequestFence();

    expect(fence.begin("genesis-how:en")).toBe(1);
    expect(fence.begin("genesis-how:en")).toBeNull();
  });

  it("makes an older language request unable to overwrite the latest one", () => {
    const fence = new PublishedContentRequestFence();
    const english = fence.begin("genesis-how:en");
    const chinese = fence.begin("genesis-how:zh-CN");

    expect(fence.isCurrent(english!)).toBe(false);
    expect(fence.isCurrent(chinese!)).toBe(true);

    fence.settle(english!);
    expect(fence.activeKey).toBe("genesis-how:zh-CN");

    fence.settle(chinese!);
    expect(fence.activeKey).toBeNull();
  });
});
