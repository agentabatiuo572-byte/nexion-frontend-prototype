import type { Device } from "@/store/types";

/** Unknown battery stays permissive; the existing network requirement wins when both gates fail. */
export function phoneRuntimePauseReason(
  device: Pick<Device, "batteryLevel" | "isWifiConnected">,
): "no-network" | "low-battery" | null {
  if (!device.isWifiConnected) return "no-network";
  return device.batteryLevel != null && Number.isFinite(device.batteryLevel) && device.batteryLevel < 20
    ? "low-battery"
    : null;
}
