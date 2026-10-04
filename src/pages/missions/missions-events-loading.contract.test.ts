// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./missions.vue", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("missions event-summary read state", () => {
  it("renders loading, refresh, error, and ready-empty states without treating unread data as zero", () => {
    expect(source).toContain("const remoteEventProjection = computed(() => projectMissionRemoteEvents(remoteEventsReadState.value, remoteEvents.value));");
    expect(source).toContain('remoteEventProjection.state === \'error\'');
    expect(source).toContain("t.value.missions.eventsLoading");
    expect(source).toContain("t.value.missions.eventsRefreshing");
    expect(source).toContain("t.value.missions.eventsEmpty");
    expect(source).toContain("const stats = eventStats.value;");
  });

  it("clears the old account or locale summary before requesting a new fenced response", () => {
    expect(source).toMatch(/remoteRequestFence\.invalidate\(\);\n  remoteEvents\.value = \[\];\n  remoteEventsReadState\.value = "initial";\n  void refreshRemoteEvents\(\);/);
    expect(source).toContain("if (remoteRequestFence.isCurrent(scope)) {");
  });
});
