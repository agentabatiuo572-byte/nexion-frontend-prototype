import type { DeviceKind } from "@/store/types";

type SlotDevice = {
  kind: DeviceKind;
  activatedAt: number | null;
  activationUnconfirmed?: boolean;
  pendingDeactivate?: boolean;
};

/** Every activated instance keeps its slot until actual deactivation, including while waiting for its task. */
export function isActiveSlotDevice(device: SlotDevice): boolean {
  return device.activatedAt !== null;
}

/** A remote lifecycle row without its activation timestamp must be reconciled before activation. */
export function requiresActivationConfirmation(device: Pick<SlotDevice, "activationUnconfirmed">): boolean {
  return device.activationUnconfirmed === true;
}

/** Phones activate through current-installation calibration, never as purchased inventory. */
export function isActivatableInventoryDevice(device: SlotDevice): boolean {
  return device.kind !== "phone" && device.activatedAt === null && !requiresActivationConfirmation(device);
}
