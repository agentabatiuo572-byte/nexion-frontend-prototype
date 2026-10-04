import { afterEach, expect, it, vi } from "vitest";
import { _devResetDeviceIdentity, getDeviceIdentity } from "./device-id";

afterEach(() => {
  _devResetDeviceIdentity();
  vi.unstubAllGlobals();
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
