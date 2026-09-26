import type { Device } from "@/store/types";

export interface PhoneBinding {
  version: number;
  installationId: string;
  deviceId: string;
  changedAt: number;
  suspendedAt: number | null;
}

export interface PhoneBindingPolicy {
  allowReplacement: boolean;
  minReplacementIntervalDays: number;
}

export type PhoneActivationError = "web-only" | "replacement-disabled" | "cooldown" | "device-mismatch" | "slots-full" | "storage-failed" | "reauth-required" | "config-unavailable";

export function phoneReplacementError(binding: PhoneBinding | null, installationId: string, carrier: string,
  policy: PhoneBindingPolicy | undefined, now: number): PhoneActivationError | null {
  if (carrier !== "app") return "web-only";
  if (!installationId) return "device-mismatch";
  if (!binding) return null;
  if (binding.installationId === installationId) return binding.suspendedAt === null ? null : "reauth-required";
  if (!policy || policy.allowReplacement !== true || !Number.isSafeInteger(policy.minReplacementIntervalDays)
    || policy.minReplacementIntervalDays < 0 || !Number.isSafeInteger(binding.changedAt + policy.minReplacementIntervalDays * 86400000)) {
    return "replacement-disabled";
  }
  return now < binding.changedAt + policy.minReplacementIntervalDays * 86400000 ? "cooldown" : null;
}

export function stopPhoneTask(device: Device): Device {
  return device.kind !== "phone" ? device : {
    ...device, currentTask: null, interruptedAt: null, miningSince: null,
    lastSettledAt: null, onlineHeartbeatAt: null, gpuUsage: 0,
  };
}

export function matchesPhoneBinding(device: Device, binding: PhoneBinding | null): boolean {
  return !!binding && device.id === binding.deviceId && device.phoneInstallationId === binding.installationId;
}
