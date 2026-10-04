import { describe, expect, it } from "vitest";
import { createDeveloperDocsFenceReader } from "./developer-docs-fence";

describe("developer docs fence", () => {
  it("rejects a deferred docs response after account, run, locale, or page generation changes", () => {
    let account = "account-a";
    let accountEpoch = 1;
    let runRevision = 4;
    let locale = "en";
    let generation = 2;
    const reader = createDeveloperDocsFenceReader(
      () => account,
      () => locale,
      () => generation,
      () => ({ accountKey: account, epoch: accountEpoch }),
      (scope) => scope.accountKey === account && scope.epoch === accountEpoch,
      () => ({ runId: null, epoch: runRevision }),
      (scope) => scope.runId === null && scope.epoch === runRevision,
    );

    const fence = reader.capture();
    expect(reader.isCurrent(fence)).toBe(true);

    account = "account-b";
    expect(reader.isCurrent(fence)).toBe(false);
    account = "account-a";
    accountEpoch += 1;
    expect(reader.isCurrent(fence)).toBe(false);
    accountEpoch -= 1;
    runRevision += 1;
    expect(reader.isCurrent(fence)).toBe(false);
    runRevision -= 1;
    locale = "vi";
    expect(reader.isCurrent(fence)).toBe(false);
    locale = "en";
    generation += 1;
    expect(reader.isCurrent(fence)).toBe(false);
  });
});
