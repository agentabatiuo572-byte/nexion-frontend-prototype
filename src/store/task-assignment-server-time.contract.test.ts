import { describe, expect, it } from "vitest";
import source from "./app.ts?raw";

describe("task assignment business clock propagation", () => {
  it("keeps task time separate from the paired E3 fleet clock", () => {
    expect(source).toMatch(/function applyRemoteAssignments[\s\S]*taskServerNow:\s*state\.serverNow/);
    expect(source).toMatch(/function applyRemoteAssignments[\s\S]*taskServerNowReceivedAt:\s*taskSnapshotReceivedAt/);
    expect(source).not.toMatch(/function applyRemoteAssignments[\s\S]*\n\s*serverNow:\s*state\.serverNow/);
  });
});
