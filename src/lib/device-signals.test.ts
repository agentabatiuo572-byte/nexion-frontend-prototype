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
  it("does not accept a WebView renderer as a native phone signal outside Android", () => {
    vi.stubGlobal("plus", undefined);
    expect(collectDeviceSignals("observed browser GPU").gpu).toBe("");
  });
});
