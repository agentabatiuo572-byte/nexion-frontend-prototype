import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeLiveHashpower } from "@/lib/hashpower";
import { deviceEffectiveTops } from "@/lib/account-hashrate";
import { DEFAULT_PLATFORM_CONFIG } from "@/mock/platform-config";
import { settleDeviceBatch, useApp } from "./app";
import { createDevice } from "./device-types";
import { useConfig } from "./config";
import type { Device } from "./types";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const bonus = DEFAULT_PLATFORM_CONFIG.onlineBonus;
const gpuTiers = DEFAULT_PLATFORM_CONFIG.computeShare.gpuTiers;
const storage = new Map<string, unknown>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function phone(patch: Partial<Device> = {}): Device {
  return {
    ...createDevice("phone", "battery-policy-phone"),
    activatedAt: NOW - HOUR,
    lastSettledAt: NOW - HOUR,
    miningSince: NOW - HOUR,
    onlineHeartbeatAt: NOW - 1,
    baseRate: 240,
    baseRateNEX: 2400,
    todayEarnings: 0,
    todayEarningsNEX: 0,
    pausedReason: null,
    ...patch,
  };
}

function settle(device: Device, now = Date.now()) {
  return settleDeviceBatch([device], "app", now, bonus, true).nextDevices[0];
}

describe("phone battery task policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    storage.clear();
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.has(key) ? clone(storage.get(key)) : "",
      setStorageSync: (key: string, value: unknown) => storage.set(key, clone(value)),
      removeStorageSync: (key: string) => storage.delete(key),
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    });
    setActivePinia(createPinia());
    useConfig()._devSetConfigSyncFailed(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([true, false])("19%% pauses and 20%% earns with charging=%s", (isCharging) => {
    const low = settle(phone({ batteryLevel: 19, isCharging }));
    expect([low.todayEarnings, low.todayEarningsNEX]).toEqual([0, 0]);
    expect(low.lastSettledAt).toBeNull();
    expect(low.onlineHeartbeatAt).not.toBe(NOW);
    const ready = settle(phone({ batteryLevel: 20, isCharging }));
    expect(ready.todayEarnings).toBeGreaterThan(0);
    expect(ready.todayEarningsNEX).toBeGreaterThan(0);
    expect(ready.onlineHeartbeatAt).toBe(NOW);
  });

  it("keeps unknown battery compatible and does not gate hosted hardware", () => {
    for (const batteryLevel of [undefined, Number.NaN]) {
      expect(settle(phone({ batteryLevel, isCharging: false })).todayEarnings).toBeGreaterThan(0);
    }
    const hardware = { ...phone({ batteryLevel: 0, isCharging: false, isWifiConnected: false }), kind: "stellarbox-s1" as const };
    expect(settle(hardware).todayEarnings).toBeGreaterThan(0);
    const app = useApp();
    app.$patch({ devices: [hardware] });
    app.setPhoneRuntime(hardware.id, { batteryLevel: 19 });
    expect(app.devices[0].batteryLevel).toBe(0);
  });

  it("keeps a missing network blocked and gives network failure priority", () => {
    const app = useApp();
    app.$patch({ devices: [phone({ isWifiConnected: undefined })] });
    app.setPhoneRuntime("battery-policy-phone", { batteryLevel: 19 });
    expect(app.devices[0].pausedReason).toBe("no-network");
    expect(settle(phone({ isWifiConnected: undefined, batteryLevel: 20 })).todayEarnings).toBe(0);
    expect(deviceEffectiveTops(phone({ isWifiConnected: undefined }), NOW, bonus, gpuTiers)).toBe(0);
  });

  it("uses battery and network in live display and rank without a charging discount", () => {
    const input = { baselineTops: 30, online: true, isOnline: true, continuityMs: HOUR, nowSeed: NOW, batteryLevel: 20 };
    expect(computeLiveHashpower({ ...input, batteryLevel: 19 }).effectiveTops).toBe(0);
    expect(computeLiveHashpower({ ...input, batteryLevel: 19, online: false }).effectiveTops).toBe(0);
    expect(computeLiveHashpower({ ...input, batteryLevel: 19, isOnline: false }).dominant).toBe("offline");
    const charging = { ...input, isCharging: true };
    const unplugged = { ...input, isCharging: false };
    expect(computeLiveHashpower(charging)).toEqual(computeLiveHashpower(unplugged));
    const rank = (device: Device) => deviceEffectiveTops(device, NOW, bonus, gpuTiers);
    expect(rank(phone({ batteryLevel: 19 }))).toBe(0);
    expect(rank(phone({ batteryLevel: 20, isCharging: false }))).toBe(rank(phone({ batteryLevel: 20, isCharging: true })));
  });

  it("persists low battery, prioritizes network, and resumes without paying the paused interval", () => {
    let app = useApp();
    app.$patch({ devices: [phone()] });
    app.setPhoneRuntime("battery-policy-phone", { batteryLevel: 19, isCharging: true });
    expect(app.devices[0].pausedReason).toBe("low-battery");
    app.tick(1000);
    expect(app.devices[0].currentTask).toBeNull();
    expect(app.devices[0].todayEarnings).toBe(0);
    setActivePinia(createPinia());
    useConfig()._devSetConfigSyncFailed(false);
    app = useApp();
    expect(app.devices[0].batteryLevel).toBe(19);
    expect(app.devices[0].pausedReason).toBe("low-battery");
    app.setPhoneRuntime("battery-policy-phone", { isWifiConnected: false });
    expect(app.devices[0].pausedReason).toBe("no-network");
    vi.setSystemTime(NOW + HOUR);
    app.setPhoneRuntime("battery-policy-phone", { batteryLevel: 20, isCharging: false, isWifiConnected: true });
    app.tick(1000);
    expect(app.devices[0].pausedReason).toBeNull();
    expect(app.devices[0].currentTask).not.toBeNull();
    expect([app.devices[0].todayEarnings, app.devices[0].todayEarningsNEX]).toEqual([0, 0]);
    expect(app.devices[0].lastSettledAt).toBe(NOW + HOUR);
    vi.setSystemTime(NOW + HOUR + 60_000);
    app.settle();
    expect(app.devices[0].todayEarnings).toBeGreaterThan(0);
    expect(app.devices[0].todayEarningsNEX).toBeGreaterThan(0);
  });

  it("rehydrates legacy no-charger as current policy without back-paying its old pause", () => {
    const app = useApp();
    app.$patch({ devices: [phone({ isCharging: false, batteryLevel: 20 })] });
    app.setPhoneRuntime("battery-policy-phone", {});
    const table = clone(storage.get("nexgrid-account-cloud-v1")) as Record<string, { devices: Array<Record<string, unknown>> }>;
    table.default.devices[0].pausedReason = "no-charger";
    table.default.devices[0].lastSettledAt = NOW - HOUR;
    storage.set("nexgrid-account-cloud-v1", table);
    setActivePinia(createPinia());
    useConfig()._devSetConfigSyncFailed(false);
    const restored = useApp();
    expect(restored.devices[0].pausedReason).toBeNull();
    expect(restored.devices[0].lastSettledAt).toBeNull();
    restored.settle();
    expect([restored.devices[0].todayEarnings, restored.devices[0].todayEarningsNEX]).toEqual([0, 0]);
    const persisted = storage.get("nexgrid-account-cloud-v1") as typeof table;
    expect(persisted.default.devices[0].pausedReason).toBeNull();
    expect(persisted.default.devices[0].lastSettledAt).toBe(NOW);
  });

  it.each([10_000, 31_000])("keeps the existing task grace window when battery recovers after %d ms", (heldMs) => {
    const app = useApp();
    app.$patch({ devices: [phone({ lastSettledAt: null })] });
    app.tick(1000);
    const task = { ...app.devices[0].currentTask!, totalSec: 120 };
    app.$patch({ devices: [{ ...app.devices[0], currentTask: task }] });
    app.setPhoneRuntime("battery-policy-phone", { batteryLevel: 19 });
    expect(app.devices[0].interruptedAt).toBe(NOW);
    vi.setSystemTime(NOW + heldMs);
    app.setPhoneRuntime("battery-policy-phone", { batteryLevel: 20 });
    app.tick(1000);
    const resumed = app.devices[0];
    expect(resumed.interruptedAt).toBeNull();
    expect(resumed.recentTasks).toHaveLength(0);
    expect([resumed.todayEarnings, resumed.todayEarningsNEX]).toEqual([0, 0]);
    if (heldMs < 30_000) {
      expect(resumed.currentTask?.id).toBe(task.id);
      expect(resumed.currentTask?.startedAt).toBe(task.startedAt + heldMs);
    } else {
      expect(resumed.currentTask?.id).not.toBe(task.id);
    }
  });

  it("cancels a legacy paused task whose interruption start was never persisted", () => {
    const app = useApp();
    app.$patch({ devices: [phone({ lastSettledAt: null })] });
    app.tick(1000);
    const oldTaskId = app.devices[0].currentTask!.id;
    const table = clone(storage.get("nexgrid-account-cloud-v1")) as Record<string, { devices: Array<Record<string, unknown>> }>;
    const old = table.default.devices[0];
    old.pausedReason = "no-charger";
    old.isCharging = false;
    old.batteryLevel = 20;
    old.interruptedAt = null;
    old.currentTask = { ...(old.currentTask as object), startedAt: NOW - HOUR, totalSec: 120 };
    storage.set("nexgrid-account-cloud-v1", table);
    setActivePinia(createPinia());
    useConfig()._devSetConfigSyncFailed(false);
    const restored = useApp();
    expect(restored.devices[0].currentTask).toBeNull();
    restored.tick(1000);
    expect(restored.devices[0].currentTask?.id).not.toBe(oldTaskId);
    expect(restored.devices[0].recentTasks).toHaveLength(0);
    expect([restored.devices[0].todayEarnings, restored.devices[0].todayEarningsNEX]).toEqual([0, 0]);
  });
});
