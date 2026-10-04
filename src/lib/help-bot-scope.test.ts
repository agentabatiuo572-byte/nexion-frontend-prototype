import { describe, expect, it } from "vitest";
import { createRemoteAccountEpoch } from "./remote-account-epoch";
import { createHelpBotScope } from "./help-bot-scope";

describe("inline help bot account scope", () => {
  it("clears transcript on an epoch rebind, including the same account", () => {
    const account = createRemoteAccountEpoch("A");
    const scope = createHelpBotScope(account);
    scope.add({ from: "user", text: "old" });
    account.bind("A");

    expect(scope.sync()).toEqual([]);
    expect(scope.messages()).toEqual([]);
  });

  it("rejects a late response after the account epoch changes", () => {
    const account = createRemoteAccountEpoch("A");
    const scope = createHelpBotScope(account);
    const request = scope.capture();
    account.bind("B");

    expect(scope.isCurrent(request)).toBe(false);
  });

  it("captures the request locale so response metadata cannot drift", () => {
    const account = createRemoteAccountEpoch("A");
    const scope = createHelpBotScope(account);
    expect(scope.capture("zh").language).toBe("zh");
  });
});
