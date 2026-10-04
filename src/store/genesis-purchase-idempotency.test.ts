import { describe, expect, it } from "vitest";
import {
  claimGenesisPurchaseIntent,
  retireGenesisPurchaseIntent,
} from "./genesis";

describe("Genesis purchase idempotency across reloads", () => {
  it("reuses an unknown-result key after reload but advances after confirmed success", () => {
    const first = claimGenesisPurchaseIntent({}, "account-7", 1);

    const pendingReload = claimGenesisPurchaseIntent({ ...first.keys }, "account-7", 1);
    expect(pendingReload.key).toBe(first.key);

    const afterSuccess = retireGenesisPurchaseIntent(pendingReload.keys, "account-7", 1);
    const nextReload = claimGenesisPurchaseIntent({ ...afterSuccess }, "account-7", 1);
    expect(nextReload.key).not.toBe(first.key);
    expect(nextReload.key).toMatch(/:2$/);
  });

  it("keeps purchase sequences isolated by account and intent", () => {
    const accountA = claimGenesisPurchaseIntent({}, "account-a", 1, [101]);
    const accountB = claimGenesisPurchaseIntent(accountA.keys, "account-b", 1, [101]);
    const otherIntent = claimGenesisPurchaseIntent(accountB.keys, "account-a", 2, [101, 102]);

    expect(accountB.key).toContain("account-b");
    expect(otherIntent.key).not.toBe(accountA.key);
  });
});
