import { describe, expect, it } from "vitest";
import { canShowLivePhoneHashpower, deviceOnlineState, isDeviceOnline } from "./hashpower";

describe("device online state", () => {
  it.each(["ONLINE", "OFFLINE", "UNKNOWN"] as const)("uses activation independently of runtime %s", runtimeStatus => {
    const device = { kind: "phone", capacitySource: "server" as const, activatedAt: 100, status: "offline" as const, runtimeStatus, onlineHeartbeatAt: null };
    expect(deviceOnlineState(device, 10_000)).toBe("online");
    expect(isDeviceOnline(device, 10_000)).toBe(false);
    expect(deviceOnlineState({ ...device, activatedAt: null }, 10_000)).toBe("offline");
    expect(deviceOnlineState({ ...device, activationUnconfirmed: true }, 10_000)).toBe("unknown");
    expect(deviceOnlineState(device, 10_000, false)).toBe("unknown");
    expect(deviceOnlineState({ ...device, activatedAt: undefined }, 10_000)).toBe("unknown");
  });

  it("does not turn an Online business label into a fresh execution heartbeat", () => {
    const device = { kind: "phone", activatedAt: 100, status: "online" as const, onlineHeartbeatAt: 9_000 };
    expect(deviceOnlineState(device, 200_000)).toBe("online");
    expect(isDeviceOnline(device, 10_000)).toBe(true);
    expect(isDeviceOnline(device, 200_000)).toBe(false);
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
