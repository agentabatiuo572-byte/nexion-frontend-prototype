import { describe, expect, it } from "vitest";
import { canLoadRemoteComputeMore } from "./receipts-page-pagination";

describe("remote compute receipt pagination", () => {
  it("rejects a load-more click while a deferred offset-zero refresh owns the old cursor", () => {
    expect(canLoadRemoteComputeMore({ initialLoading: true, moreLoading: false, nextOffset: 20 })).toBe(false);
  });

  it("accepts the cursor only after the latest initial refresh has settled", () => {
    expect(canLoadRemoteComputeMore({ initialLoading: false, moreLoading: false, nextOffset: 20 })).toBe(true);
  });

  it("prefers a server-issued keyset cursor over a movable numeric offset", () => {
    expect(canLoadRemoteComputeMore({
      initialLoading: false,
      moreLoading: false,
      nextOffset: 20,
      nextCursor: "R-CTA-20",
    })).toBe(true);
  });
});
