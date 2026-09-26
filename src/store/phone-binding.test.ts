import { createPinia, setActivePinia } from "pinia";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useApp, settleDeviceBatch } from "./app";
import { useSession } from "./session";
import { useConfig } from "./config";
import { fallbackCapability } from "@/lib/device-capability";
import { readAccountSnapshot, mergeAndWriteAccountSnapshotResult } from "./account-cloud";

const target = vi.hoisted(() => ({ carrier: "app" }));
vi.mock("@/lib/carrier", () => ({ getCarrier: () => target.carrier }));
const storage = new Map<string, unknown>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const now = 1_800_000_000_000;
function device(id: string) { storage.set("nexgrid-device-id-v1", { deviceId: id, deviceName: id }); }
function signIn(id: string) {
  device(id);
  useSession().claim("default", target.carrier === "app" ? "signed-app" : "h5");
  return useApp().acceptPhoneSignIn();
}

describe("phone binding lifecycle", () => {
  beforeEach(() => {
    target.carrier = "app";
    storage.clear();
    vi.useFakeTimers(); vi.setSystemTime(now);
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.has(key) ? clone(storage.get(key)) : "",
      setStorageSync: (key: string, value: unknown) => storage.set(key, clone(value)),
      removeStorageSync: (key: string) => storage.delete(key),
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    });
    setActivePinia(createPinia());
    useConfig()._devSetConfigSyncFailed(false);
    signIn("old");
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("binds first phone, persists on reload, and cannot execute an unbound legacy phone", () => {
    const app = useApp(); app.tick(1000);
    expect(app.devices.find((d) => d.kind === "phone")?.currentTask).toBeNull();
    expect(app.applyPhoneCalibration(fallbackCapability())).toBeNull();
    app.tick(1000);
    expect(app.devices.find((d) => d.id === app.phoneBinding?.deviceId)?.currentTask).not.toBeNull();
    setActivePinia(createPinia());
    expect(useApp().phoneBinding?.installationId).toBe("old");
  });

  it("different-phone sign-in pauses only phone and passive old session cannot resume", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    const purchased = clone(app.devices.filter((d) => d.kind !== "phone"));
    signIn("new");
    expect(app.phoneActivationError()).toBe("replacement-disabled");
    expect(app.devices.filter((d) => d.kind !== "phone")).toEqual(purchased);
    device("old"); useSession().resumeOrClaim("default", "signed-app"); app.tick(1000);
    expect(app.applyPhoneCalibration(fallbackCapability())).toBe("reauth-required");
    expect(app.devices.find((d) => d.kind === "phone")?.currentTask).toBeNull();
    signIn("old"); app.tick(1000);
    expect(app.phoneBinding?.suspendedAt).toBeNull();
    expect(app.devices.find((d) => d.kind === "phone")?.currentTask).not.toBeNull();
  });

  it("replaces atomically and rejects the mismatching warehouse phone", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability());
    const oldId = app.phoneBinding!.deviceId;
    useConfig().config.phoneBinding = { allowReplacement: true, minReplacementIntervalDays: 0 };
    signIn("new");
    expect(app.applyPhoneCalibration(fallbackCapability())).toBeNull();
    expect(app.devices.find((d) => d.id === oldId)?.activatedAt).toBeNull();
    expect(app.activateDevice(oldId)).toBe(false);
    expect(app.devices.filter((d) => d.kind === "phone" && d.activatedAt !== null)).toHaveLength(1);
    expect(app.phoneBinding?.installationId).toBe("new");
  });

  it("rejects cached replacement permission when config fails or is loading", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability());
    const cfg = useConfig();
    cfg.config.phoneBinding = { allowReplacement: true, minReplacementIntervalDays: 0 };
    signIn("new");
    const before = clone(app.phoneBinding);
    cfg._devSetConfigSyncFailed(true);
    expect(app.applyPhoneCalibration(fallbackCapability())).toBe("config-unavailable");
    cfg._devSetConfigSyncFailed(false); cfg.loading = true;
    expect(app.applyPhoneCalibration(fallbackCapability())).toBe("config-unavailable");
    expect(app.phoneBinding).toEqual(before);
    cfg.loading = false;
    expect(app.applyPhoneCalibration(fallbackCapability())).toBeNull();
  });

  it("H5 observes a fresh APP heartbeat without renewing it, then cancels stale work", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    const id = app.phoneBinding!.deviceId;
    const beat = app.devices.find((d) => d.id === id)!.onlineHeartbeatAt;
    target.carrier = "h5"; signIn("browser");
    app.tick(1000);
    expect(app.devices.find((d) => d.id === id)!.onlineHeartbeatAt).toBe(beat);
    expect(app.applyPhoneCalibration(fallbackCapability())).toBe("web-only");
    vi.setSystemTime(now + 180000); app.tick(1000);
    expect(app.devices.find((d) => d.id === id)!.currentTask).toBeNull();
    expect(app.devices.find((d) => d.id === id)!.lastSettledAt).toBeNull();
  });

  it("unknown session reads preserve live APP work without H5 settlement or heartbeat", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    const id = app.phoneBinding!.deviceId;
    target.carrier = "h5"; signIn("browser");
    const before = clone(app.devices.find(d => d.id === id)!);
    const sessionsBefore = clone(storage.get("nexgrid-account-sessions-v1"));
    const original = uni.getStorageSync;
    const reader = vi.spyOn(uni, "getStorageSync").mockImplementation((key: string) => {
      if (key === "nexgrid-account-sessions-v1") throw new Error("session read unavailable");
      return original(key);
    });
    vi.setSystemTime(now + 10000);
    expect(useSession().validate()).toBe("active");
    useSession().resumeOrClaim("default", "h5");
    app.tick(1000); app.settle();
    expect(app.devices.find(d => d.id === id)).toEqual(before);
    expect(readAccountSnapshot("default")!.devices.find(d => d.id === id)).toEqual(before);
    expect(storage.get("nexgrid-account-sessions-v1")).toEqual(sessionsBefore);
    reader.mockRestore();
    app.tick(1000);
    expect(app.devices.find(d => d.id === id)?.currentTask).toEqual(before.currentTask);
  });

  it("unknown session state cannot renew a previously resolved resident heartbeat", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    const phone = clone(app.devices.find(d => d.id === app.phoneBinding?.deviceId)!);
    const result = settleDeviceBatch([phone], "app", now + 10000, useConfig().config.onlineBonus, true, phone.id, false);
    expect(result.settled).toEqual([phone]);
    expect(result.nextDevices).toEqual([phone]);
  });

  it("rejects stale replacement/earnings writes and failed storage never activates", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability());
    const base = readAccountSnapshot("default")!;
    signIn("new");
    const stale = clone(base); stale.user.usdtBalance += 100;
    expect(mergeAndWriteAccountSnapshotResult(base, stale).persisted).toBe(false);
    expect(readAccountSnapshot("default")!.user.usdtBalance).toBe(base.user.usdtBalance);
    useConfig().config.phoneBinding = { allowReplacement: true, minReplacementIntervalDays: 0 };
    const previous = clone(app.phoneBinding);
    vi.spyOn(uni, "setStorageSync").mockImplementation(() => { throw new Error("quota"); });
    expect(app.applyPhoneCalibration(fallbackCapability())).toBe("storage-failed");
    expect(app.phoneBinding).toEqual(previous);
  });

  it("a stale H5 cannot erase a heartbeat renewed by APP without a binding change", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    const base = readAccountSnapshot("default")!;
    const live = clone(base);
    vi.setSystemTime(now + 10000);
    const phone = live.devices.find((d) => d.id === app.phoneBinding!.deviceId)!;
    phone.onlineHeartbeatAt = now + 10000;
    expect(mergeAndWriteAccountSnapshotResult(base, live).persisted).toBe(true);
    const stale = clone(base);
    stale.devices.find((d) => d.id === phone.id)!.onlineHeartbeatAt = null;
    expect(mergeAndWriteAccountSnapshotResult(base, stale).persisted).toBe(false);
    expect(readAccountSnapshot("default")!.devices.find((d) => d.id === phone.id)!.onlineHeartbeatAt).toBe(now + 10000);
  });

  it("preserves an explicit legacy installation instead of treating a new phone as first binding", () => {
    storage.set("nexgrid-calibrated-device-v1", { default: "old" });
    signIn("new");
    expect(useApp().phoneBinding?.installationId).toBe("old");
    expect(useApp().applyPhoneCalibration(fallbackCapability())).toBe("replacement-disabled");
    expect(readAccountSnapshot("default")!.phoneBinding?.installationId).toBe("old");
  });

  it("imports fresh APP earnings with their account baseline, without counting them twice", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    const base = readAccountSnapshot("default")!;
    const live = clone(base);
    vi.setSystemTime(now + 10000);
    for (const d of live.devices) {
      d.lastSettledAt = now + 10000;
      if (d.kind === "phone") { d.onlineHeartbeatAt = now + 10000; d.todayEarnings += 1; }
    }
    live.earnings.total += 1; live.earnings.today += 1;
    expect(mergeAndWriteAccountSnapshotResult(base, live).persisted).toBe(true);
    target.carrier = "h5";
    app.settle();
    expect(readAccountSnapshot("default")!.earnings.total).toBe(live.earnings.total);
    expect(readAccountSnapshot("default")!.earnings.today).toBe(live.earnings.today);
  });

  it("H5 stops a revoked APP immediately even if its last heartbeat is fresh", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    useSession().signOutSession();
    target.carrier = "h5";
    app.tick(1000);
    expect(app.devices.find((d) => d.kind === "phone")!.currentTask).toBeNull();
    expect(app.devices.find((d) => d.kind === "phone")!.onlineHeartbeatAt).toBeNull();
  });

  it("normal same-phone login preserves its current task and continuity", () => {
    const app = useApp(); app.applyPhoneCalibration(fallbackCapability()); app.tick(1000);
    const before = clone(app.devices.find((d) => d.kind === "phone")!);
    signIn("old");
    const after = app.devices.find((d) => d.kind === "phone")!;
    expect(after.currentTask).toEqual(before.currentTask);
    expect(after.miningSince).toBe(before.miningSince);
    expect(after.onlineHeartbeatAt).toBe(before.onlineHeartbeatAt);
  });
});
