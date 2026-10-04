import { describe, expect, it } from "vitest";
import { beginNavigationAttempt, completeNavigationAttempt } from "./navigation-attempt";

describe("navigation attempt feedback", () => {
  it("ignores an older failure after a newer navigation has succeeded", () => {
    const first = beginNavigationAttempt({ attempt: 0, pendingUrl: "", hasError: false }, "/first");
    const second = beginNavigationAttempt(first, "/second");
    const succeeded = completeNavigationAttempt(second, second.attempt, "success");

    expect(completeNavigationAttempt(succeeded, first.attempt, "failure")).toEqual({
      attempt: second.attempt, pendingUrl: "", hasError: false,
    });
  });

  it("retains the current failed target for retry", () => {
    const started = beginNavigationAttempt({ attempt: 0, pendingUrl: "", hasError: false }, "/retry");

    expect(completeNavigationAttempt(started, started.attempt, "failure")).toEqual({
      attempt: started.attempt, pendingUrl: "/retry", hasError: true,
    });
  });
});
