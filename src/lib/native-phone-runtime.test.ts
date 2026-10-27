import { afterEach, describe, expect, it, vi } from "vitest";
import { collectNativePhoneRuntime, hasNativeAndroidPhoneRuntime, hasNativePhoneRuntime, nativePhonePlatform, readAndroidBattery,
  readIosBattery } from "./native-phone-runtime";

function androidBridge(level: unknown = 81, charging: unknown = true, constantsAvailable = true) {
  const context = constantsAvailable ? { BATTERY_SERVICE: "batterymanager" } : {};
  const managerClass = constantsAvailable ? { BATTERY_PROPERTY_CAPACITY: 4 } : {};
  const activity = {};
  const manager = {};
  return {
    importClass: vi.fn((name: string) => name === "android.content.Context" ? context : managerClass),
    getAttribute: vi.fn(() => null),
    runtimeMainActivity: vi.fn(() => activity),
    invoke: vi.fn((source: object, name: string, arg?: unknown) => {
      if (source === activity && name === "getSystemService" && arg === "batterymanager") return manager;
      if (source === manager && name === "getIntProperty" && arg === 4) return level;
      if (source === manager && name === "isCharging") return charging;
      return null;
    }),
  } as unknown as Parameters<typeof readAndroidBattery>[0];
}

afterEach(() => vi.unstubAllGlobals());

function iosBridge(level: unknown = 0.83, state: unknown = 2, monitoring = false) {
  const device = {
    isBatteryMonitoringEnabled: vi.fn(() => monitoring),
    setBatteryMonitoringEnabled: vi.fn(),
    batteryLevel: vi.fn(() => level),
    batteryState: vi.fn(() => state),
  };
  return { device, bridge: {
    importClass: vi.fn((name: string) => name === "UIDevice" ? { currentDevice: () => device } : null),
    deleteObject: vi.fn(),
  } as unknown as Parameters<typeof readIosBattery>[0] };
}

describe("native phone runtime observation", () => {
  it("offers phone binding with the native Android and iOS runtimes only", () => {
    vi.stubGlobal("plus", undefined);
    expect(hasNativePhoneRuntime()).toBe(false);
    expect(nativePhonePlatform()).toBeNull();
    vi.stubGlobal("plus", { os: { name: "Android" } });
    expect([hasNativePhoneRuntime(), hasNativeAndroidPhoneRuntime(), nativePhonePlatform()]).toEqual([true, true, "android"]);
    vi.stubGlobal("plus", { os: { name: "iOS" } });
    expect([hasNativePhoneRuntime(), hasNativeAndroidPhoneRuntime(), nativePhonePlatform()]).toEqual([true, false, "ios"]);
    vi.stubGlobal("plus", { os: { name: "HarmonyOS" } });
    expect(hasNativePhoneRuntime()).toBe(false);
  });
  it("reads iOS UIDevice battery, enabling monitoring and releasing the native object", () => {
    const { device, bridge } = iosBridge();
    expect(readIosBattery(bridge)).toEqual({ batteryLevel: 83, isCharging: true });
    expect(device.setBatteryMonitoringEnabled).toHaveBeenCalledWith(true);
    expect(bridge.deleteObject).toHaveBeenCalledWith(device);
    expect(readIosBattery(iosBridge(1, 3, true).bridge)).toEqual({ batteryLevel: 100, isCharging: true });
    expect(readIosBattery(iosBridge(0.2, 1).bridge)).toEqual({ batteryLevel: 20, isCharging: false });
    expect(readIosBattery(iosBridge(0.5, 0).bridge)).toEqual({ batteryLevel: 50, isCharging: null });
  });
  it.each([-1, 1.2, "0.8", null])("rejects an unknown iOS battery level %s", (level) => {
    expect(readIosBattery(iosBridge(level).bridge)).toBeNull();
  });
  it("combines iOS battery with the observed network", async () => {
    vi.stubGlobal("plus", { os: { name: "iOS" }, ios: iosBridge(0.64, 1).bridge });
    vi.stubGlobal("uni", { getNetworkType: ({ success }: { success: (value: { networkType: string }) => void }) => success({ networkType: "wifi" }) });
    expect(await collectNativePhoneRuntime()).toEqual({ batteryLevel: 64, isCharging: false, networkReachable: true });
  });
  it("reads BatteryManager static constants directly when getAttribute returns null", () => {
    expect(readAndroidBattery(androidBridge())).toEqual({ batteryLevel: 81, isCharging: true });
    expect(readAndroidBattery(androidBridge(0, false))).toEqual({ batteryLevel: 0, isCharging: false });
  });

  it.each([-2147483648, -1, 101, 74.5, "81", null])("rejects an unsupported battery capacity %s", (level) => {
    expect(readAndroidBattery(androidBridge(level))).toBeNull();
  });

  it("fails closed when native static constants are unavailable", () => {
    expect(readAndroidBattery(androidBridge(81, true, false))).toBeNull();
  });

  it("retains observed capacity when charging is unavailable, and fails closed if the bridge itself throws", () => {
    expect(readAndroidBattery(androidBridge(81, null))).toEqual({ batteryLevel: 81, isCharging: null });
    const noCharging = androidBridge();
    const invoke = noCharging.invoke;
    noCharging.invoke = vi.fn((source: Parameters<typeof invoke>[0], name: string, arg?: unknown) => {
      if (name === "isCharging") throw new Error("method unavailable");
      return invoke(source, name, arg);
    }) as typeof noCharging.invoke;
    expect(readAndroidBattery(noCharging)).toEqual({ batteryLevel: 81, isCharging: null });
    const broken = androidBridge();
    broken.runtimeMainActivity = vi.fn(() => { throw new Error("native bridge unavailable"); }) as typeof broken.runtimeMainActivity;
    expect(readAndroidBattery(broken)).toBeNull();
  });

  it("combines battery with an observed network result and rejects unknown network", async () => {
    vi.stubGlobal("plus", { os: { name: "Android" }, android: androidBridge(100, false) });
    vi.stubGlobal("uni", { getNetworkType: ({ success }: { success: (value: { networkType: string }) => void }) => success({ networkType: "4g" }) });
    expect(await collectNativePhoneRuntime()).toEqual({ batteryLevel: 100, isCharging: false, networkReachable: true });
    vi.stubGlobal("uni", { getNetworkType: ({ success }: { success: (value: { networkType: string }) => void }) => success({ networkType: "none" }) });
    expect(await collectNativePhoneRuntime()).toEqual({ batteryLevel: 100, isCharging: false, networkReachable: false });
    vi.stubGlobal("uni", { getNetworkType: ({ success }: { success: (value: { networkType: string }) => void }) => success({ networkType: "unknown" }) });
    expect(await collectNativePhoneRuntime()).toBeNull();
    vi.stubGlobal("uni", { getNetworkType: ({ success }: { success: (value: { networkType: string }) => void }) => success({ networkType: "" }) });
    expect(await collectNativePhoneRuntime()).toBeNull();
    vi.stubGlobal("uni", { getNetworkType: ({ success }: { success: (value: { networkType: string }) => void }) => success({ networkType: "satellite" }) });
    expect(await collectNativePhoneRuntime()).toBeNull();
    vi.stubGlobal("uni", { getNetworkType: ({ success }: { success: (value: { networkType: string }) => void }) => success({} as { networkType: string }) });
    expect(await collectNativePhoneRuntime()).toBeNull();
  });

  it("does not fabricate a heartbeat without a native bridge", async () => {
    vi.stubGlobal("plus", undefined);
    expect(await collectNativePhoneRuntime()).toBeNull();
  });
});
