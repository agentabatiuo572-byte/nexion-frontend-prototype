import { describe, expect, it } from "vitest";
import appSource from "../App.vue?raw";

describe("remote quest route authority", () => {
  it("never converts a route visit into a hard-coded remote task claim", () => {
    const checkQuestRoute = appSource.match(/function checkQuestRoute\(\)[\s\S]*?function startQuestWatch/)?.[0] ?? "";
    const remoteBoundary = checkQuestRoute.indexOf("if (remoteApiEnabled)");
    const legacyMapping = checkQuestRoute.indexOf("questIdForRoute(route)");

    expect(remoteBoundary).toBeGreaterThanOrEqual(0);
    expect(legacyMapping).toBeGreaterThan(remoteBoundary);
    expect(checkQuestRoute).not.toContain("claimRemote");
    expect(checkQuestRoute).not.toContain("shouldClaimQuestOnRoute");
  });
});
