import { afterEach, expect, it, vi } from "vitest";
import { _devResetDeviceIdentity, getDeviceIdentity } from "./device-id";

afterEach(() => {
  _devResetDeviceIdentity();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false])("uses original installation storage operations and fixed reused=%s stages", reused => {
  const stages: string[] = [], invoke = vi.fn((_target, _method, _tag, stage) => { stages.push(stage); return 0; });
  vi.stubGlobal("plus", { android: { invoke } });
  const cached = { deviceId: "synthetic-install-value", deviceName: "synthetic-private-device-name" };
  const get = vi.fn(() => reused ? cached : ""), set = vi.fn();
  vi.stubGlobal("uni", { getStorageSync: get, setStorageSync: set, removeStorageSync: vi.fn(), getSystemInfoSync: () => ({ brand: "Samsung", model: "Synthetic" }) });
  const first = getDeviceIdentity(), second = getDeviceIdentity();
  expect(first).toEqual(second); expect(get).toHaveBeenCalledTimes(1); expect(set).toHaveBeenCalledTimes(reused ? 0 : 1);
  expect(stages).toEqual([reused ? "INSTALLATION_REUSED" : "INSTALLATION_CREATED"]);
  expect(JSON.stringify(invoke.mock.calls)).not.toContain("synthetic");
});

it("keeps the original fail-soft installation identity when native and console logs throw", () => {
  const invoke = vi.fn((_target: string, _method: string, _tag: string, _stage: string) => { throw new Error("synthetic-secret-native-log-failure"); });
  vi.stubGlobal("plus", { android: { invoke } });
  vi.spyOn(console, "info").mockImplementation(() => { throw new Error("synthetic-secret-console-log-failure"); });
  const get = vi.fn(() => ""), set = vi.fn(() => { throw new Error("synthetic-secret-storage-failure"); });
  vi.stubGlobal("uni", { getStorageSync: get, setStorageSync: set, removeStorageSync: vi.fn(), getSystemInfoSync: () => ({ brand: "Samsung", model: "Synthetic" }) });
  expect(getDeviceIdentity()).toEqual(getDeviceIdentity());
  expect(get).toHaveBeenCalledTimes(1); expect(set).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls.map(args => args[3])).toEqual(["INSTALLATION_CREATED", "INSTALLATION_WRITE_THREW"]);
});

it("keeps one installation ID during a run when native storage reads and writes fail", () => {
  vi.stubGlobal("uni", {
    getStorageSync: () => { throw new Error("storage unavailable"); },
    setStorageSync: () => { throw new Error("storage unavailable"); },
    removeStorageSync: () => undefined,
    getSystemInfoSync: () => ({ brand: "Samsung", model: "SM-A5760" }),
  });
  const first = getDeviceIdentity();
  const second = getDeviceIdentity();
  expect(first.deviceId).toBeTruthy();
  expect(second).toEqual(first);
  expect(second).not.toBe(first);
});
