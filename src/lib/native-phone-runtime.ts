export interface NativePhoneRuntime {
  batteryLevel: number;
  networkReachable: boolean;
  isCharging: boolean | null;
}

type BatteryObservation = Pick<NativePhoneRuntime, "batteryLevel" | "isCharging">;

export function hasNativeAndroidPhoneRuntime(): boolean {
  // #ifdef APP-PLUS
  return typeof plus !== "undefined" && plus.os?.name === "Android";
  // #endif
  return false;
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
  const battery = hasNativeAndroidPhoneRuntime()
    ? readAndroidBattery(plus.android) : null;
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
