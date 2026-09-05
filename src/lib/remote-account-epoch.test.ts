import { describe, expect, it } from "vitest";
import { createRemoteAccountEpoch } from "./remote-account-epoch";

describe("remote account epoch", () => {
  it("invalidates a response after an account rebind, including same-account refresh", () => {
    const epoch = createRemoteAccountEpoch("alice");
    const first = epoch.snapshot();

    epoch.bind("bob");
    expect(epoch.isCurrent(first)).toBe(false);

    const second = epoch.snapshot();
    epoch.bind("bob");
    expect(epoch.isCurrent(second)).toBe(false);
  });
});
