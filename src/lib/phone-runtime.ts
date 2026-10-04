import type { Device } from "@/store/types";

/** The device can work on battery; only low charge and lost network pause it. */
export function phoneRuntimePauseReason(
  device: Pick<Device, "batteryLevel" | "isWifiConnected">,
): "low-battery" | "no-network" | null {
  if (device.isWifiConnected === false) return "no-network";
  return typeof device.batteryLevel === "number" && Number.isFinite(device.batteryLevel) && device.batteryLevel < 20
    ? "low-battery"
    : null;
}
