import { describe, expect, it } from "vitest";
import { canShowLivePhoneHashpower, deviceOnlineState, isDeviceOnline } from "./hashpower";

describe("device online state", () => {
  it.each([
    ["ONLINE", "online"],
    ["OFFLINE", "offline"],
    ["UNKNOWN", "unknown"],
  ] as const)("displays server phone runtime %s without a local heartbeat", (runtimeStatus, state) => {
    const device = { kind: "phone", capacitySource: "server" as const, status: runtimeStatus === "ONLINE" ? "online" as const : "offline" as const, runtimeStatus, onlineHeartbeatAt: null };
    expect(deviceOnlineState(device, 10_000)).toBe(state);
    expect(isDeviceOnline(device, 10_000)).toBe(false);
  });

  it("reports retained server runtime as unknown after a failed fleet refresh", () => {
    expect(deviceOnlineState({ kind: "phone", capacitySource: "server", status: "online", runtimeStatus: "ONLINE" }, 10_000, false)).toBe("unknown");
  });

  it("keeps a deactivated server phone offline even if runtime says online", () => {
    expect(deviceOnlineState({ kind: "phone", capacitySource: "server", status: "offline", runtimeStatus: "ONLINE" }, 10_000)).toBe("offline");
  });

  it("retains the local heartbeat rule for mock phones", () => {
    const device = { kind: "phone", status: "online" as const, onlineHeartbeatAt: 9_000 };
    expect(deviceOnlineState(device, 10_000)).toBe("online");
    expect(deviceOnlineState(device, 200_000)).toBe("offline");
  });
});

describe("live phone TOPS visibility", () => {
  const phone = { kind: "phone", currentTask: null } as Parameters<typeof canShowLivePhoneHashpower>[0];

  it("hides live TOPS when the server pauses an assigned task even without a local pause reason", () => {
    const paused = { ...phone, currentTask: { status: "PAUSED" } } as Parameters<typeof canShowLivePhoneHashpower>[0];
    expect(canShowLivePhoneHashpower(paused)).toBe(false);
  });

  it.each(["ONLINE", "OFFLINE"] as const)("does not label locally simulated %s server capacity as live TOPS", (runtimeStatus) => {
    expect(canShowLivePhoneHashpower({ ...phone, capacitySource: "server", runtimeStatus, capabilityTops: 9.5 } as Parameters<typeof canShowLivePhoneHashpower>[0])).toBe(false);
  });

  it("shows live TOPS for an unpaused phone and hides it for local interruption or hardware", () => {
    expect(canShowLivePhoneHashpower(phone)).toBe(true);
    expect(canShowLivePhoneHashpower({ ...phone, pausedReason: "low-battery" })).toBe(false);
    expect(canShowLivePhoneHashpower({ ...phone, interruptedAt: 100 })).toBe(false);
    expect(canShowLivePhoneHashpower({ ...phone, kind: "pc-gpu" })).toBe(false);
  });
});
