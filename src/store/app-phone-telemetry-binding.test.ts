import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Device } from "./types";
import type { CanonicalE3Fleet } from "@/api/device-e3-api";
import type { CanonicalTaskAssignments } from "@/api/task-assignment-api";
import { ApiError } from "@/api/errors";
import completeSignInSource from "@/auth/complete-sign-in.ts?raw";

const local = vi.hoisted(() => ({
  collect: vi.fn(),
  deviceId: vi.fn(),
  nativeAvailable: true,
  calibrated: true,
  clearCalibrated: vi.fn(),
}));
const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  fundsServerEnabled: true,
  expectedApiEnvironment: "dev",
  sessionVault: { read: vi.fn() },
  deviceE3Api: { fleet: vi.fn() },
  taskAssignmentApi: { state: vi.fn(), reportPhoneRuntime: vi.fn() },
  appHomeApi: { fetch: vi.fn() },
  withdrawalApi: { submit: vi.fn(), list: vi.fn(), get: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);
vi.mock("@/lib/native-phone-runtime", () => ({
  collectNativePhoneRuntime: local.collect,
  hasNativeAndroidPhoneRuntime: () => local.nativeAvailable,
}));
vi.mock("./session", () => ({ useSession: () => ({ clearCalibrated: local.clearCalibrated,
  isCurrentDeviceCalibrated: () => local.calibrated }) }));
vi.mock("@/lib/device-id", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/device-id")>(),
  getDeviceId: local.deviceId,
}));

const { useApp } = await import("./app");

const assignments: CanonicalTaskAssignments = {
  serverNow: 1,
  devices: [],
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  serverCanonical: true,
};

function phoneAssignments(status: "PAUSED" | "RUNNING"): CanonicalTaskAssignments {
  return { ...assignments, devices: [{
    deviceId: 811, instanceNo: "PHONE-811", deviceType: "MOBILE", lockUntil: null, recentTasks: [],
    currentTask: {
      taskNo: "CTA-811", deviceId: 811, taskId: "ll-1", taskName: "Inference", taskClass: "LL",
      model: "Model", client: "UVEL App", status, rewardUsdt: 0.25, requiredSeconds: 60,
      startedAt: 1, completableAt: status === "RUNNING" ? 61 : null, completedAt: null,
      receiptNo: null, proofNonce: null, proofExpiresAt: null,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    },
  }] };
}

function phoneFleet(runtimeStatus: "ONLINE" | "OFFLINE"): CanonicalE3Fleet {
  return {
    dailyUsdt: 0, dailyNex: 0, realizedTodayUsdt: 0, realizedTodayNex: 0,
    walletUsdt: 100, walletNex: 0, userJoinedAt: 1, serverNow: 1, timezone: "UTC", slotCap: 1,
    capacitySchedule: {
      stageEarlyEnd: "3", stageMidEnd: "8", capacityFloorPct: "22", capacitySubsidyDays: "30",
      capacityBand1DeltaPct: "-4", capacityBand2DeltaPct: "-6", capacityBand3DeltaPct: "-23.7",
      capacityApplyToPhone: "false", capacityApplyToCloudShare: "false", capacityApplyToPcGpu: "false",
      capacityApplyToS1: "true", capacityApplyToPro: "true", capacityApplyToProV2: "true",
      capacityApplyToRackP1: "true", capacityApplyToRackP2: "true",
    },
    source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    devices: [{
      id: 811, rowVersion: 1, instanceNo: "PHONE-811", name: "Phone", deviceType: "MOBILE",
      productCode: "", status: "ACTIVE", runtimeStatus, pendingDeactivate: false,
      activatedAt: 1, deactivatedAt: null, purchasedAt: 1,
      dailyUsdt: 0, dailyNex: 0, todayEarningsUsdt: 0, todayEarningsNex: 0,
      gpuModel: "", capabilityTops: 30, capabilityTier: 3, vramTotalGb: 0, basePowerW: 0,
      location: "", capacityPct: 100, capacityAgeMonths: 0, capacityConfigKey: "",
      capacitySubsidized: false, capacitySubsidyDays: 0, capacitySubsidyRemainingDays: 0,
      capacitySubsidyEndsAt: null, actualPaidUsdt: 0, cumulativeOutputUsdt: 0,
    }],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  remote.sessionVault.read.mockReturnValue({ user: { userId: 1001 } });
  remote.taskAssignmentApi.state.mockResolvedValue(assignments);
  remote.withdrawalApi.list.mockResolvedValue([]);
  local.deviceId.mockReturnValue("local-install-abc");
  local.nativeAvailable = true;
  local.calibrated = true;
  local.clearCalibrated.mockImplementation(() => { local.calibrated = false; return true; });
  local.collect.mockResolvedValue({ batteryLevel: 87, networkReachable: true, isCharging: null });
});
afterEach(() => vi.restoreAllMocks());

it("reports the current installation instead of another activated phone in the account", async () => {
  const app = useApp();
  app.bindAccount("user:1001");
  app.devices = [{ id: "811", kind: "phone", activatedAt: 1 } as Device];

  await app.syncRemoteTaskAssignments();

  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledExactlyOnceWith(
    "local-install-abc", 87, true, null,
  );
});

it("does not report when this client has no native battery observation", async () => {
  local.collect.mockResolvedValue(null);
  const app = useApp();
  app.bindAccount("user:1001");
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).not.toHaveBeenCalled();
});

it("retries a missing native sample after 15 seconds without inventing a healthy heartbeat", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  local.collect.mockResolvedValueOnce(null);
  const app = useApp();
  app.bindAccount("user:1001");
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).not.toHaveBeenCalled();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);
  now += 14_999;
  await app.syncRemoteTaskAssignments();
  expect(local.collect).toHaveBeenCalledTimes(1);
  now += 1;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledExactlyOnceWith(
    "local-install-abc", 87, true, null,
  );
});

it("keeps H5/iOS read-only refreshes at 60 seconds when the Android bridge is absent", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  local.nativeAvailable = false;
  local.collect.mockResolvedValue(null);
  const app = useApp();
  app.bindAccount("user:1001");
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);
  expect(remote.taskAssignmentApi.reportPhoneRuntime).not.toHaveBeenCalled();
  now += 15_000;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);
  now += 45_000;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);
  expect(remote.taskAssignmentApi.reportPhoneRuntime).not.toHaveBeenCalled();
});

it("uses a 60-second combined cadence and refreshes immediately on foreground return", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const app = useApp();
  app.bindAccount("user:1001");

  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1);
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);

  now += 59_999;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1);
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);

  now += 1;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(2);
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);

  app.setRemoteTaskForeground(false);
  now += 1;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(2);
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);

  app.setRemoteTaskForeground(true);
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(3);
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(3);
});

it("reads fresh assignments at the next poll even when the previous GET finished late", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  remote.taskAssignmentApi.state.mockImplementationOnce(async () => {
    now += 1_000;
    return assignments;
  });
  const app = useApp();
  app.bindAccount("user:1001");

  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);

  now = 1_060_000;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);
});

it("does not start a report or read from a sample that finishes after backgrounding", async () => {
  let resolveSample!: (value: { batteryLevel: number; networkReachable: boolean; isCharging: null }) => void;
  local.collect.mockReturnValueOnce(new Promise((resolve) => { resolveSample = resolve; }));
  const app = useApp();
  app.bindAccount("user:1001");
  const pending = app.syncRemoteTaskAssignments();
  app.setRemoteTaskForeground(false);
  resolveSample({ batteryLevel: 87, networkReachable: true, isCharging: null });
  await pending;
  expect(remote.taskAssignmentApi.reportPhoneRuntime).not.toHaveBeenCalled();
  expect(remote.taskAssignmentApi.state).not.toHaveBeenCalled();
});

it("retries a failed report after 15 seconds without skipping the read", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  remote.taskAssignmentApi.reportPhoneRuntime.mockRejectedValueOnce(new Error("offline"));
  const app = useApp();
  app.bindAccount("user:1001");

  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1);
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);

  now += 14_999;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1);

  now += 1;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(2);
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);
});

it("does not short-retry a rejected calibration binding", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  remote.taskAssignmentApi.reportPhoneRuntime.mockRejectedValueOnce(
    new ApiError({ kind: "http", status: 409, message: "TASK_ASSIGNMENT_PHONE_BINDING_INVALID" }),
  );
  const app = useApp();
  app.bindAccount("user:1001");

  await app.syncRemoteTaskAssignments();
  now += 15_000;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1);

  now += 45_000;
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(2);
});

it("invalidates B's stale local activation after C replaces it, then accepts B after reactivation", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  remote.taskAssignmentApi.reportPhoneRuntime.mockRejectedValueOnce(
    new ApiError({ kind: "business", status: 200, code: 409,
      message: "TASK_ASSIGNMENT_PHONE_BINDING_INVALID" }),
  );
  const app = useApp();
  app.bindAccount("user:1001");
  await app.syncRemoteTaskAssignments();
  expect(local.clearCalibrated).toHaveBeenCalledExactlyOnceWith("user:1001");
  expect(local.calibrated).toBe(false);
  expect(app.remotePhoneBindingInvalid).toBe(true);

  // B completes its own calibration/activation; the next accepted report
  // restores only B's local presentation state.
  local.calibrated = true;
  now += 60_000;
  await app.syncRemoteTaskAssignments();
  expect(app.remotePhoneBindingInvalid).toBe(false);
  expect(local.calibrated).toBe(true);
});

it("starts a fresh foreground sync while the old epoch's read remains in flight", async () => {
  let resolveOldState!: (value: CanonicalTaskAssignments) => void;
  remote.taskAssignmentApi.state.mockReturnValueOnce(new Promise((resolve) => { resolveOldState = resolve; }));
  const app = useApp();
  app.bindAccount("user:1001");
  const oldSync = app.syncRemoteTaskAssignments();
  await vi.waitFor(() => expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1));

  app.setRemoteTaskForeground(false);
  app.setRemoteTaskForeground(true);
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);

  resolveOldState(assignments);
  await oldSync;
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);
  expect(app.remoteAssignmentStatus).toBe("ready");
});

it("serializes old and new foreground POSTs and samples the new battery only after the old POST", async () => {
  let finishOldReport!: () => void;
  const events: string[] = [];
  local.collect.mockImplementationOnce(async () => {
    events.push("sample-old");
    return { batteryLevel: 87, networkReachable: true, isCharging: null };
  }).mockImplementationOnce(async () => {
    events.push("sample-new");
    return { batteryLevel: 15, networkReachable: false, isCharging: null };
  });
  remote.taskAssignmentApi.reportPhoneRuntime.mockImplementationOnce(() => {
    events.push("post-old");
    return new Promise<void>((resolve) => { finishOldReport = () => { events.push("finish-old"); resolve(); }; });
  }).mockImplementationOnce(() => { events.push("post-new"); return Promise.resolve(); });
  const app = useApp();
  app.bindAccount("user:1001");
  const oldSync = app.syncRemoteTaskAssignments();
  await vi.waitFor(() => expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1));
  app.setRemoteTaskForeground(false);
  app.setRemoteTaskForeground(true);
  const newSync = app.syncRemoteTaskAssignments();
  await Promise.resolve();
  expect(events).toEqual(["sample-old", "post-old"]);
  finishOldReport();
  await Promise.all([oldSync, newSync]);
  expect(events).toEqual(["sample-old", "post-old", "finish-old", "sample-new", "post-new"]);
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenNthCalledWith(2,
    "local-install-abc", 15, false, null,
  );
});

it("waits for the foreground runtime POST before reading task assignments", async () => {
  let finishReport!: () => void;
  remote.taskAssignmentApi.reportPhoneRuntime.mockReturnValueOnce(new Promise<void>((resolve) => { finishReport = resolve; }));
  const app = useApp();
  app.bindAccount("user:1001");
  const sync = app.syncRemoteTaskAssignments();
  await vi.waitFor(() => expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1));
  expect(remote.taskAssignmentApi.state).not.toHaveBeenCalled();

  finishReport();
  await sync;
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);
});

it("discards a cached PAUSED assignment after the runtime POST resumes the phone", async () => {
  remote.taskAssignmentApi.state.mockResolvedValueOnce(phoneAssignments("PAUSED"))
    .mockResolvedValueOnce(phoneAssignments("RUNNING"));
  remote.deviceE3Api.fleet.mockResolvedValue(phoneFleet("ONLINE"));
  const app = useApp();
  app.bindAccount("user:1001");
  expect(await app.refreshRemoteFleet()).toBe(true);
  expect(app.devices[0]?.currentTask?.status).toBe("PAUSED");

  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);
  expect(app.devices[0]?.currentTask?.status).toBe("RUNNING");
});

it("fences a pre-POST PAUSED read while preserving its fleet readback caller", async () => {
  let finishOldAssignment!: (value: CanonicalTaskAssignments) => void;
  let finishOldFleet!: (value: CanonicalE3Fleet) => void;
  let finishReport!: () => void;
  remote.taskAssignmentApi.state.mockReturnValueOnce(new Promise((resolve) => { finishOldAssignment = resolve; }))
    .mockResolvedValueOnce(phoneAssignments("RUNNING"));
  remote.deviceE3Api.fleet.mockReturnValueOnce(new Promise((resolve) => { finishOldFleet = resolve; }))
    .mockResolvedValueOnce(phoneFleet("ONLINE"));
  remote.taskAssignmentApi.reportPhoneRuntime.mockReturnValueOnce(
    new Promise<void>((resolve) => { finishReport = resolve; }),
  );
  const app = useApp();
  app.bindAccount("user:1001");
  const mutationReadback = app.refreshRemoteFleet();
  await vi.waitFor(() => expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1));

  const sync = app.syncRemoteTaskAssignments();
  await vi.waitFor(() => expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1));
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(1);
  finishReport();
  await vi.waitFor(() => expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2));
  finishOldAssignment(phoneAssignments("PAUSED"));
  finishOldFleet(phoneFleet("OFFLINE"));

  expect(await mutationReadback).toBe(true);
  await sync;
  expect(remote.deviceE3Api.fleet).toHaveBeenCalledTimes(2);
  expect(app.devices[0]?.currentTask?.status).toBe("RUNNING");
  expect(app.devices[0]?.runtimeStatus).toBe("ONLINE");
  expect(app.remoteFleetStatus).toBe("ready");
});

it("waits for in-flight healthy reports, then reports this phone offline before logout", async () => {
  let finishHealthyReport!: () => void;
  remote.taskAssignmentApi.reportPhoneRuntime.mockReturnValueOnce(
    new Promise<void>((resolve) => { finishHealthyReport = resolve; }),
  );
  const app = useApp();
  app.bindAccount("user:1001");
  const sync = app.syncRemoteTaskAssignments();
  await vi.waitFor(() => expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1));

  const pause = app.pauseLocalPhoneRuntimeBeforeSignOut();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(1);
  finishHealthyReport();
  await pause;
  await sync;

  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenLastCalledWith(
    "local-install-abc", null, false, null,
  );
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(2);
  expect(remote.taskAssignmentApi.state).not.toHaveBeenCalled();
});

it("pauses an Android phone on logout even when native sampling is unavailable", async () => {
  local.collect.mockResolvedValue(null);
  const app = useApp();
  app.bindAccount("user:1001");
  await app.pauseLocalPhoneRuntimeBeforeSignOut();
  expect(local.collect).not.toHaveBeenCalled();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledExactlyOnceWith(
    "local-install-abc", null, false, null,
  );
});

it("does not send a phone offline report from H5/iOS logout", async () => {
  local.nativeAvailable = false;
  const app = useApp();
  app.bindAccount("user:1001");
  await app.pauseLocalPhoneRuntimeBeforeSignOut();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).not.toHaveBeenCalled();
});

it("rearms B's runtime sync on same-process sign-in without waiting for App.onShow", async () => {
  const acceptedSignIn = completeSignInSource.split("// Apply on every accepted server login")[1]
    ?.split("// Login completion is a re-ack checkpoint")[0] ?? "";
  expect(acceptedSignIn).toContain("app.setRemoteTaskForeground(true)");

  const app = useApp();
  app.bindAccount("user:1001");
  await app.syncRemoteTaskAssignments();
  await app.pauseLocalPhoneRuntimeBeforeSignOut();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(2);

  remote.sessionVault.read.mockReturnValue({ user: { userId: 1002 } });
  local.deviceId.mockReturnValue("local-install-b");
  app.bindAccount("user:1002");
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenCalledTimes(2);

  // completeSignIn rearms the store after the new server identity is accepted.
  app.setRemoteTaskForeground(true);
  await app.syncRemoteTaskAssignments();
  expect(remote.taskAssignmentApi.reportPhoneRuntime).toHaveBeenLastCalledWith(
    "local-install-b", 87, true, null,
  );
  expect(remote.taskAssignmentApi.state).toHaveBeenCalledTimes(2);
  expect(remote.deviceE3Api.fleet).toHaveBeenCalled();
  expect(remote.appHomeApi.fetch).toHaveBeenCalled();
});

it("still requests fleet and Home when the first assignment read fails", async () => {
  remote.taskAssignmentApi.state.mockRejectedValueOnce(new Error("task API unavailable"));
  const app = useApp();
  app.bindAccount("user:1001");

  await app.syncRemoteTaskAssignments();

  expect(remote.deviceE3Api.fleet).toHaveBeenCalled();
  expect(remote.appHomeApi.fetch).toHaveBeenCalled();
});
