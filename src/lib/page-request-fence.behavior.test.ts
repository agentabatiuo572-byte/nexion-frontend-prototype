import { describe, expect, it } from "vitest";
import { advanceRuntimeRevision, captureRuntimeRevision } from "@/api/order-api";
import { createLearningPageFenceReader } from "@/pages/learn/learning-page-fence";
import { createRemoteAccountEpoch } from "./remote-account-epoch";
import { createRemotePageRequestFence } from "./remote-page-request-fence";

describe("page request fences", () => {
  it("rejects a stale response after a newer request generation", () => {
    let account = "A";
    let accountEpoch = 1;
    let generation = 1;
    let mounted = true;
    const fence = createLearningPageFenceReader(
      () => account,
      () => accountEpoch,
      captureRuntimeRevision,
      () => generation,
      () => mounted,
    );

    const stale = fence.capture();
    generation += 1;

    expect(fence.isCurrent(stale)).toBe(false);
    expect(fence.isCurrent(fence.capture())).toBe(true);
    mounted = false;
    expect(fence.isCurrent(fence.capture())).toBe(false);
  });

  it("rejects stale Events and Missions responses across newer requests and A to B to A", () => {
    const accountEpoch = createRemoteAccountEpoch("A");
    let mounted = true;
    const fence = createRemotePageRequestFence(accountEpoch, () => mounted);
    const firstA = fence.capture();
    const newerA = fence.capture();

    expect(fence.isCurrent(firstA)).toBe(false);
    expect(fence.isCurrent(newerA)).toBe(true);

    accountEpoch.bind("B");
    accountEpoch.bind("A");
    const secondA = fence.capture();

    expect(fence.isCurrent(firstA)).toBe(false);
    expect(fence.isCurrent(secondA)).toBe(true);
    mounted = false;
    expect(fence.isCurrent(secondA)).toBe(false);
  });

  it("rejects a response captured before a runtime revision", () => {
    let account = "A";
    let accountEpoch = 1;
    let generation = 1;
    const fence = createLearningPageFenceReader(
      () => account,
      () => accountEpoch,
      captureRuntimeRevision,
      () => generation,
      () => true,
    );
    const stale = fence.capture();
    advanceRuntimeRevision();
    expect(fence.isCurrent(stale)).toBe(false);
  });
});
