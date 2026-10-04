import { afterEach, describe, expect, it, vi } from "vitest";
import { collectDeviceSignals } from "./device-signals";
import { readAndroidGpu } from "./native-phone-gpu";

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
  it("reads the native GPU without a DOM and releases its offscreen context", () => {
    const invoke = vi.fn((_object: unknown, method: string) => {
      if (["eglInitialize", "eglChooseConfig", "eglMakeCurrent", "equals"].includes(method)) return true;
      if (method === "glGetString") return "Adreno test renderer";
      return {};
    });
    const android = { invoke, importClass: () => ({ EGL_NO_CONTEXT: {}, EGL_NO_SURFACE: {} }) } as unknown as PlusAndroid;
    expect(readAndroidGpu(android)).toBe("Adreno test renderer");
    expect(invoke.mock.calls.some((call) => call[1] === "eglDestroySurface")).toBe(true);
    expect(invoke.mock.calls.some((call) => call[1] === "eglDestroyContext")).toBe(true);
    expect(invoke.mock.calls.some((call) => call[1] === "eglTerminate")).toBe(false);
  });
});
