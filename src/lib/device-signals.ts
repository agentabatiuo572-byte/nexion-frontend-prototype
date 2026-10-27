import type { CalibrationRequestSignals } from "@/api/onboarding-calibration-api";
import { nativePhonePlatform, readAndroidBattery, readIosBattery } from "./native-phone-runtime";

/**
 * The iPhone model as the native SDK reports it: a marketing name or a hardware
 * identifier such as "iPhone17,1". The server maps both through verified aliases;
 * the user-editable device name is never read.
 */
function iosModel(): string {
  try {
    const info = (typeof uni.getDeviceInfo === "function" ? uni.getDeviceInfo() : uni.getSystemInfoSync()) as
      { deviceModel?: unknown; model?: unknown };
    const value = typeof info.deviceModel === "string" && info.deviceModel.trim() ? info.deviceModel : info.model;
    return typeof value === "string" ? value.trim().slice(0, 128) : "";
  } catch {
    return "";
  }
}

/** Raw observations only. Missing native fields remain unknown, never guessed. */
export function collectDeviceSignals(observedGpu = ""): CalibrationRequestSignals {
  const result: CalibrationRequestSignals = { platform: "", soc: "", memGB: null, cores: null,
    model: "", brand: "", gpu: "", pxDensity: null, pingMs: null, batteryLevel: null,
    charging: null, networkReachable: null };
  const platform = nativePhonePlatform();
  if (platform === "ios") {
    // iOS is calibrated by model only: no SoC, GPU, memory or storage is collected.
    result.platform = "ios";
    result.model = iosModel();
    result.brand = "Apple";
    const battery = readIosBattery(plus.ios);
    result.batteryLevel = battery?.batteryLevel ?? null;
    result.charging = battery?.isCharging ?? null;
    return result;
  }
  if (platform !== "android") return result;
  result.platform = "android";
  const android = plus.android;
  try {
    const build = android.importClass("android.os.Build") as PlusAndroidClassObject & {
      MODEL?: unknown; BRAND?: unknown; SOC_MODEL?: unknown;
    };
    const text = (value: unknown) => typeof value === "string" ? value.slice(0,128) : "";
    result.model = text(build.MODEL);
    result.brand = text(build.BRAND);
    result.soc = text(build.SOC_MODEL);
  } catch { /* Older Android versions may not expose SOC_MODEL. */ }
  try {
    const manager = android.invoke(android.runtimeMainActivity(), "getSystemService", "activity");
    const memory = android.newObject("android.app.ActivityManager$MemoryInfo");
    android.invoke(manager, "getMemoryInfo", memory);
    const gb = Number(android.getAttribute(memory, "totalMem")) / (1024 ** 3);
    if (Number.isFinite(gb) && gb > 0 && gb <= 128) result.memGB = gb;
    const runtime = android.invoke("java.lang.Runtime", "getRuntime");
    const cores = android.invoke(runtime, "availableProcessors");
    if (Number.isInteger(cores) && cores > 0 && cores <= 256) result.cores = cores;
  } catch { /* Missing native memory/CPU data remains unknown. */ }
  result.gpu = observedGpu.trim().slice(0, 256);
  const battery = readAndroidBattery(android);
  result.batteryLevel = battery?.batteryLevel ?? null;
  result.charging = battery?.isCharging ?? null;
  return result;
}
