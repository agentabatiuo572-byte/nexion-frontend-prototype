import type { DeviceKind } from "@/store/types";

type SlotDevice = {
  kind: DeviceKind;
  activatedAt: number | null;
  activationUnconfirmed?: boolean;
  pendingDeactivate?: boolean;
};

/** Cloud Share is virtual capacity; only physical/host devices use one of the six activation slots. */
export function occupiesDeviceSlot(kind: DeviceKind): boolean {
  return kind !== "cloud-share";
}

export function isActiveSlotDevice(device: SlotDevice): boolean {
  return device.activatedAt !== null && !device.pendingDeactivate && occupiesDeviceSlot(device.kind);
}

/** A remote lifecycle row without its activation timestamp must be reconciled before activation. */
export function requiresActivationConfirmation(device: Pick<SlotDevice, "activationUnconfirmed">): boolean {
  return device.activationUnconfirmed === true;
}

/** Phones activate through current-installation calibration, never as purchased inventory. */
export function isActivatableInventoryDevice(device: SlotDevice): boolean {
  return device.kind !== "phone" && device.activatedAt === null && !requiresActivationConfirmation(device);
}
