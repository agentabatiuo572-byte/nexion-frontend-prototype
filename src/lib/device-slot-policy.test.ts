import { describe, expect, it } from "vitest";
import { isActiveSlotDevice, requiresActivationConfirmation } from "./device-slot-policy";
import type { DeviceKind } from "@/store/types";

describe("device slot policy", () => {
  it("keeps a pending-deactivation slot until the device actually deactivates", () => {
    const device = { kind: "phone" as const, activatedAt: 123, pendingDeactivate: true };
    expect(isActiveSlotDevice(device)).toBe(true);
    expect(isActiveSlotDevice({ ...device, pendingDeactivate: false })).toBe(true);
    expect(isActiveSlotDevice({ ...device, activatedAt: null })).toBe(false);
  });
  it("counts each Cloud Share instance independently in the shared six activation slots", () => {
    const devices = [1, 2, 3, 4, 5, 6].map(id => ({ id, kind: "cloud-share" as const, activatedAt: 123 as number | null }));
    expect(devices.filter(isActiveSlotDevice)).toHaveLength(6);
    devices[0].activatedAt = null;
    expect(devices.filter(isActiveSlotDevice)).toHaveLength(5);
  });

  it("requires reconciliation before an activation record missing its timestamp can be activated", () => {
    expect(requiresActivationConfirmation({ activationUnconfirmed: true })).toBe(true);
    expect(requiresActivationConfirmation({ activationUnconfirmed: false })).toBe(false);
    expect(requiresActivationConfirmation({})).toBe(false);
  });

  it.each<DeviceKind>(["phone", "pc-gpu", "stellarbox-s1", "stellarbox-pro", "stellarbox-pro-v2", "stellarrack-p1", "stellarrack-p2", "cloud-share"])("counts active %s, excludes inactive and cancelled instances", kind => {
    expect(isActiveSlotDevice({ kind, activatedAt: 123 })).toBe(true);
    expect(isActiveSlotDevice({ kind, activatedAt: null })).toBe(false);
    expect(isActiveSlotDevice({ kind, activatedAt: 123, pendingDeactivate: true })).toBe(true);
  });
});
