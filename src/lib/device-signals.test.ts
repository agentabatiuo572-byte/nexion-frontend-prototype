import { afterEach, describe, expect, it, vi } from "vitest";
import { collectDeviceSignals } from "./device-signals";

describe("native device signals", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("does not inspect browser hardware or turn browser observations into phone capability", () => {
    const browser = vi.fn(() => { throw new Error("must not inspect browser hardware"); });
    vi.stubGlobal("plus", undefined);
    vi.stubGlobal("navigator", { deviceMemory: 64, hardwareConcurrency: 16 });
    vi.stubGlobal("document", { createElement: browser });
    vi.stubGlobal("uni", { getSystemInfoSync: browser });
    expect(collectDeviceSignals()).toEqual({ platform: "", soc: "", memGB: null, cores: null,
      model: "", brand: "", gpu: "", pxDensity: null, pingMs: null, batteryLevel: null,
      charging: null, networkReachable: null });
    expect(browser).not.toHaveBeenCalled();
  });
  it("uses native SoC and physical memory and preserves missing GPU as unknown", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("plus", { os: { name: "Android" }, android: {
      importClass: (name: string) => name === "android.os.Build" ? { MODEL: "Test phone", BRAND: "Test", SOC_MODEL: "Test SoC" } : {},
      runtimeMainActivity: () => ({}), newObject: () => ({}), getAttribute: () => 8 * 1024 ** 3,
      invoke: (_object: unknown, method: string) => method === "availableProcessors" ? 8 : {},
    } });
    expect(collectDeviceSignals()).toMatchObject({ platform: "android", soc: "Test SoC", model: "Test phone", memGB: 8, cores: 8, gpu: "", pxDensity: null });
  });
  it("reads only the iPhone model and battery on iOS, never SoC, GPU, memory or the device name", () => {
    const device = { isBatteryMonitoringEnabled: () => true, batteryLevel: () => 0.5, batteryState: () => 1 };
    vi.stubGlobal("plus", { os: { name: "iOS" }, ios: { importClass: () => ({ currentDevice: () => device }), deleteObject: () => {} } });
    vi.stubGlobal("uni", { getDeviceInfo: () => ({ deviceModel: " iPhone17,1 ", model: "iPhone", deviceName: "Lan's iPhone" }) });
    expect(collectDeviceSignals("observed GPU")).toEqual({ platform: "ios", soc: "", memGB: null, cores: null,
      model: "iPhone17,1", brand: "Apple", gpu: "", pxDensity: null, pingMs: null, batteryLevel: 50,
      charging: false, networkReachable: null });
    vi.stubGlobal("uni", { getSystemInfoSync: () => ({ deviceModel: "", model: "iPhone 16 Pro" }) });
    expect(collectDeviceSignals().model).toBe("iPhone 16 Pro");
    vi.stubGlobal("uni", { getDeviceInfo: () => { throw new Error("unavailable"); } });
    expect(collectDeviceSignals().model).toBe("");
  });
  it("adds the iPhone OS version and screen in points for the server's model checks, leaving out what is unknown", () => {
    const device = { isBatteryMonitoringEnabled: () => true, batteryLevel: () => 0.5, batteryState: () => 1 };
    vi.stubGlobal("plus", { os: { name: "iOS" }, ios: { importClass: () => ({ currentDevice: () => device }), deleteObject: () => {} } });
    vi.stubGlobal("uni", { getDeviceInfo: () => ({ deviceModel: "iPhone17,1", osVersion: "18.1.1" }),
      getWindowInfo: () => ({ screenWidth: 402, screenHeight: 874, pixelRatio: 3 }) });
    expect(collectDeviceSignals()).toMatchObject({ model: "iPhone17,1", osVersion: "18.1.1", screenWidth: 402, screenHeight: 874, pixelRatio: 3, pxDensity: null });
    vi.stubGlobal("uni", { getDeviceInfo: () => ({ deviceModel: "iPhone17,1", osVersion: "iOS 18" }),
      getWindowInfo: () => ({ screenWidth: 0, screenHeight: 874, pixelRatio: Number.NaN }) });
    const partial = collectDeviceSignals();
    expect(partial).not.toHaveProperty("osVersion");
    expect(partial).not.toHaveProperty("screenWidth");
    expect(partial).not.toHaveProperty("pixelRatio");
  });
  it("does not accept a WebView renderer as a native phone signal outside Android", () => {
    vi.stubGlobal("plus", undefined);
    expect(collectDeviceSignals("observed browser GPU").gpu).toBe("");
  });
});
