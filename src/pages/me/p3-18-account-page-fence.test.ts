import { describe, expect, it } from "vitest";
import { createP318AccountPageFence } from "./p3-18-account-page-fence";

describe("P3-18 account page fence", () => {
  it("rejects an old response when the same account is rebound", () => {
    let accountKey = "user:alice";
    let accountBindingEpoch = 7;
    const fence = createP318AccountPageFence(
      () => accountKey,
      () => accountBindingEpoch,
    );

    const stale = fence.capture("profile");
    accountBindingEpoch += 1;

    expect(fence.isCurrent(stale)).toBe(false);
    expect(fence.isCurrent(fence.capture("profile"))).toBe(true);
  });

  it("keeps the rebound account's form clean when an old request settles late", async () => {
    let accountKey = "user:alice";
    let accountBindingEpoch = 7;
    const fence = createP318AccountPageFence(
      () => accountKey,
      () => accountBindingEpoch,
    );
    let resolveOld!: (value: string) => void;
    const oldRequest = new Promise<string>((resolve) => { resolveOld = resolve; });
    const scope = fence.capture("profile");
    let renderedName = "";

    accountBindingEpoch += 1;
    resolveOld("Alice's old projection");
    const lateProjection = await oldRequest;
    if (fence.isCurrent(scope)) renderedName = lateProjection;

    expect(renderedName).toBe("");
  });

  it("allows only the latest request in a page lane and invalidates hidden pages", () => {
    let accountKey = "user:alice";
    let accountBindingEpoch = 7;
    const fence = createP318AccountPageFence(
      () => accountKey,
      () => accountBindingEpoch,
    );

    const first = fence.capture("security-overview");
    const latest = fence.capture("security-overview");

    expect(fence.isCurrent(first)).toBe(false);
    expect(fence.isCurrent(latest)).toBe(true);

    fence.invalidate();
    expect(fence.isCurrent(latest)).toBe(false);

    accountKey = "user:bob";
    accountBindingEpoch += 1;
    expect(fence.isCurrent(fence.capture("security-overview"))).toBe(true);
  });
});
