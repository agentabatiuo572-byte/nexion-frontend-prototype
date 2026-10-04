import { describe, expect, it } from "vitest";
import { isActiveSlotDevice, occupiesDeviceSlot, requiresActivationConfirmation } from "./device-slot-policy";

describe("device slot policy", () => {
  it("releases a pending-deactivation slot before its running task finishes", () => {
    const device = { kind: "phone" as const, activatedAt: 123, pendingDeactivate: true };
    expect(isActiveSlotDevice(device)).toBe(false);
    expect(isActiveSlotDevice({ ...device, pendingDeactivate: false })).toBe(true);
  });
  it("keeps Cloud Share visible but excludes it from the six physical activation slots", () => {
    expect(occupiesDeviceSlot("cloud-share")).toBe(false);
    expect(isActiveSlotDevice({ kind: "cloud-share", activatedAt: Date.now() })).toBe(false);
  });

  it("requires reconciliation before an activation record missing its timestamp can be activated", () => {
    expect(requiresActivationConfirmation({ activationUnconfirmed: true })).toBe(true);
    expect(requiresActivationConfirmation({ activationUnconfirmed: false })).toBe(false);
    expect(requiresActivationConfirmation({})).toBe(false);
  });

  it("counts active phones, PC shares, boxes and racks as physical slot occupants", () => {
    expect(occupiesDeviceSlot("phone")).toBe(true);
    expect(occupiesDeviceSlot("pc-gpu")).toBe(true);
    expect(occupiesDeviceSlot("stellarbox-s1")).toBe(true);
    expect(occupiesDeviceSlot("stellarrack-p2")).toBe(true);
    expect(isActiveSlotDevice({ kind: "phone", activatedAt: null })).toBe(false);
  });
});
