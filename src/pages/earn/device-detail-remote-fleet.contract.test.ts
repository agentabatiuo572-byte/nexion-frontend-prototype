import { describe, expect, it } from "vitest";
import source from "./device-detail.vue?raw";

describe("remote device detail recovery", () => {
  it("keeps a deep-linked device in loading until the current fleet read settles", () => {
    expect(source).toContain('const waitingForFleet = computed(() => remoteApiEnabled && hasDeviceId.value');
    expect(source).toContain('app.remoteFleetStatus === "idle" || app.remoteFleetStatus === "loading"');
    expect(source).toContain('v-else-if="waitingForFleet"');
    expect(source).toContain('v-else-if="fleetFailed"');
    expect(source).toContain('v-else-if="showNotFound"');
  });

  it("offers a fenced read-only retry after a fleet failure without treating it as missing", () => {
    expect(source).toContain('@cta="retryFleet"');
    expect(source).toContain('const request = app.captureRemoteAccountRequest();');
    expect(source).toContain('void app.refreshRemoteFleet(request).catch(() => undefined);');
    expect(source).toContain('app.remoteFleetStatus === "ready"');
    expect(source).toContain('t.earn.deviceNotFound');
  });
});
