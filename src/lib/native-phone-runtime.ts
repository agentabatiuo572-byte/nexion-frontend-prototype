export interface NativePhoneRuntime {
  batteryLevel: number;
  networkReachable: boolean;
  isCharging: boolean | null;
}

type BatteryObservation = Pick<NativePhoneRuntime, "batteryLevel" | "isCharging">;

export type NativePhonePlatform = "android" | "ios";

/** The native App platform; H5 compiles this to null, so an injected bridge cannot unlock phone actions. */
export function nativePhonePlatform(): NativePhonePlatform | null {
  // #ifdef APP-PLUS
  if (typeof plus === "undefined") return null;
  const name = plus.os?.name;
  return name === "Android" ? "android" : name === "iOS" ? "ios" : null;
  // #endif
  return null;
}

/** Phone compute runs in the native Android and iOS Apps. */
export function hasNativePhoneRuntime(): boolean {
  return nativePhonePlatform() !== null;
}

/** Android-only native APIs (Build, BatteryManager, the GPU observer). */
export function hasNativeAndroidPhoneRuntime(): boolean {
  return nativePhonePlatform() === "android";
}

/** Android BatteryManager through the built-in HTML5+ Native.js bridge. */
export function readAndroidBattery(android: Pick<PlusAndroid, "importClass" | "runtimeMainActivity" | "invoke">): BatteryObservation | null {
  try {
    const context = android.importClass("android.content.Context");
    const managerClass = android.importClass("android.os.BatteryManager");
    if (!context || !managerClass) return null;
    // Native.js exposes Java class constants directly; getAttribute() returns
    // null for these static fields on some Android WebViews (including Samsung).
    const serviceName = (context as PlusAndroidClassObject & { BATTERY_SERVICE?: unknown }).BATTERY_SERVICE;
    const capacityProperty = (managerClass as PlusAndroidClassObject & { BATTERY_PROPERTY_CAPACITY?: unknown }).BATTERY_PROPERTY_CAPACITY;
    if (typeof serviceName !== "string" || typeof capacityProperty !== "number" || !Number.isInteger(capacityProperty)) return null;
    const activity = android.runtimeMainActivity();
    if (!activity) return null;
    const manager = android.invoke(activity, "getSystemService", serviceName);
    if (!manager) return null;
    const batteryLevel = android.invoke(manager, "getIntProperty", capacityProperty);
    if (!Number.isInteger(batteryLevel) || batteryLevel < 0 || batteryLevel > 100) return null;
    let isCharging: boolean | null = null;
    try {
      const observedCharging = android.invoke(manager, "isCharging");
      if (typeof observedCharging === "boolean") isCharging = observedCharging;
    } catch { /* Charging is optional; capacity remains an observed signal. */ }
    return { batteryLevel, isCharging };
  } catch {
    return null;
  }
}

/** UIDevice battery through the HTML5+ Native.js iOS bridge; level is 0–1, or -1 when unknown. */
export function readIosBattery(ios: Pick<PlusIos, "importClass" | "deleteObject">): BatteryObservation | null {
  try {
    const device = ios.importClass("UIDevice")?.currentDevice?.();
    if (!device) return null;
    try {
      if (!device.isBatteryMonitoringEnabled()) device.setBatteryMonitoringEnabled(true);
      const level = device.batteryLevel();
      if (typeof level !== "number" || !Number.isFinite(level) || level < 0 || level > 1) return null;
      // UIDeviceBatteryState: 1 unplugged, 2 charging, 3 full (still plugged in), 0 unknown.
      const state = device.batteryState();
      return { batteryLevel: Math.round(level * 100), isCharging: state === 2 || state === 3 ? true : state === 1 ? false : null };
    } finally {
      ios.deleteObject(device);
    }
  } catch {
    return null;
  }
}

function observed<T>(start: (resolve: (value: T | null) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2_000);
    try {
      start((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Native observations only. Missing signals never become a healthy heartbeat. */
export async function collectNativePhoneRuntime(): Promise<NativePhoneRuntime | null> {
  // #ifdef APP-PLUS
  return collectNativePhoneRuntimeImpl();
  // #endif
  return null;
}

async function collectNativePhoneRuntimeImpl(): Promise<NativePhoneRuntime | null> {
  const platform = nativePhonePlatform();
  const battery = platform === "android" ? readAndroidBattery(plus.android)
    : platform === "ios" ? readIosBattery(plus.ios) : null;
  if (!battery) return null;
  const network = await observed<string>((resolve) => {
    uni.getNetworkType({
      success: (value) => resolve(value.networkType),
      fail: () => resolve(null),
    });
  });
  if (network !== "none" && !["wifi", "2g", "3g", "4g", "5g", "ethernet"].includes(network ?? "")) return null;
  return {
    batteryLevel: battery.batteryLevel,
    networkReachable: network !== "none",
    isCharging: battery.isCharging,
  };
}
