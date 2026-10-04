/**
 * Stable per-install device identity — single source for "which device am I".
 *
 * The login device's id is what makes new-device recalibration possible: the
 * server can tell whether this physical device differs from the calibrated
 * device even while multiple account sessions coexist.
 *
 * The App mints and persists an installation ID locally. The authenticated
 * server binds that same ID to a production phone calibration and resolves
 * runtime reports against the active binding. This ID is a lookup key, not
 * cryptographic proof of a physical device.
 */
import { mockServerUuid } from "@/store/mock-id";

const STORAGE_KEY = "nexgrid-device-id-v1";
let runtimeIdentity: DeviceIdentity | null = null;

export interface DeviceIdentity {
  /** Stable opaque id for this install/device. */
  deviceId: string;
  /** Human-friendly label shown in "active sessions" lists, e.g. "iPhone · iOS". */
  deviceName: string;
}

interface SysInfo {
  brand?: string;
  model?: string;
  deviceModel?: string;
  platform?: string;
  system?: string;
  osName?: string;
}

function readSystemInfo(): SysInfo {
  try {
    // uni.getSystemInfoSync is available on every uni target (H5 + app webview).
    return (uni.getSystemInfoSync() as SysInfo) ?? {};
  } catch {
    return {};
  }
}

/** Build a friendly device name from system info (fail-soft to "Web device"). */
function deriveDeviceName(info: SysInfo): string {
  const brand = (info.brand || "").trim();
  const model = (info.model || info.deviceModel || "").trim();
  const platform = (info.platform || "").trim();
  const system = (info.system || info.osName || "").trim();

  if (brand && model) return `${brand} ${model}`;
  if (model) return model;
  if (platform && system) return `${cap(platform)} · ${system}`;
  if (platform) return cap(platform);
  return "Web device";
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Returns the stable identity for this device, minting + persisting it on
 * first use. Synchronous (uni storage is sync) so stores can call it at init.
 */
export function getDeviceIdentity(): DeviceIdentity {
  if (runtimeIdentity) return { ...runtimeIdentity };
  try {
    const cached = uni.getStorageSync(STORAGE_KEY) as DeviceIdentity | "";
    if (cached && typeof cached === "object" && cached.deviceId) {
      runtimeIdentity = { deviceId: cached.deviceId, deviceName: cached.deviceName || "Web device" };
      return { ...runtimeIdentity };
    }
  } catch {
    // first run / storage unavailable
  }
  const identity: DeviceIdentity = {
    deviceId: mockServerUuid(),
    deviceName: deriveDeviceName(readSystemInfo()),
  };
  try {
    uni.setStorageSync(STORAGE_KEY, identity);
  } catch {
    // storage unavailable — identity is still valid for this session
  }
  runtimeIdentity = identity;
  return { ...identity };
}

/** Convenience accessor for just the id. */
export function getDeviceId(): string {
  return getDeviceIdentity().deviceId;
}

/**
 * ⚠️ DEV/QA-ONLY: forget this device's identity so the NEXT getDeviceIdentity()
 * mints a fresh id. Used by the "simulate logging in on a new device" demo
 * trigger to exercise the recalibration flow without a second physical device.
 * Never called on the production path.
 */
export function _devResetDeviceIdentity(): void {
  runtimeIdentity = null;
  try {
    uni.removeStorageSync(STORAGE_KEY);
  } catch {
    // no-op
  }
}
