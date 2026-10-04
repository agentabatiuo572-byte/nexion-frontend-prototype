import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CanonicalE3Fleet } from "@/api/device-e3-api";
import type { CanonicalTaskAssignments } from "@/api/task-assignment-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  fundsServerEnabled: true,
  expectedApiEnvironment: "dev",
  sessionVault: { read: vi.fn() },
  deviceE3Api: { fleet: vi.fn() },
  taskAssignmentApi: { state: vi.fn() },
  appHomeApi: { fetch: vi.fn() },
  withdrawalApi: { submit: vi.fn(), list: vi.fn(), get: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);

const { useApp } = await import("./app");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fleet(walletUsdt: number): CanonicalE3Fleet {
  return {
    dailyUsdt: 0,
    dailyNex: 0,
    realizedTodayUsdt: 0,
    realizedTodayNex: 0,
    walletUsdt,
    walletNex: 0,
    userJoinedAt: 1,
    serverNow: 1,
    timezone: "UTC",
    slotCap: 1,
    devices: [],
    capacitySchedule: {
      stageEarlyEnd: "3",
      stageMidEnd: "8",
      capacityFloorPct: "22",
      capacitySubsidyDays: "30",
      capacityBand1DeltaPct: "-4",
      capacityBand2DeltaPct: "-6",
      capacityBand3DeltaPct: "-23.7",
      capacityApplyToPhone: "false",
      capacityApplyToCloudShare: "false",
      capacityApplyToPcGpu: "false",
      capacityApplyToS1: "true",
      capacityApplyToPro: "true",
      capacityApplyToProV2: "true",
      capacityApplyToRackP1: "true",
      capacityApplyToRackP2: "true",
    },
    source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    serverCanonical: true,
  };
}

const assignments: CanonicalTaskAssignments = {
  serverNow: 1,
  devices: [],
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  serverCanonical: true,
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  remote.sessionVault.read.mockReturnValue({ user: { userId: 1001 } });
  remote.taskAssignmentApi.state.mockResolvedValue(assignments);
});

describe("App remote fleet refresh wiring", () => {
  it.each(["success", "failure"])("keeps a delayed Home %s from the previous account out of the current wallet projection", async (outcome) => {
    const previous = deferred<unknown>();
    const overview = {
      earnings: {
        today: { usdt: 12, nex: 1 }, week: { usdt: 34, nex: 2 },
        month: { usdt: 56, nex: 3 }, all: { usdt: 78, nex: 4 },
      },
    };
    remote.appHomeApi.fetch.mockReturnValueOnce(previous.promise).mockResolvedValueOnce(overview);
    const app = useApp();
    app.bindAccount("user:1001");
    const oldRead = app.refreshHomeTruth();

    remote.sessionVault.read.mockReturnValue({ user: { userId: 2002 } });
    app.bindAccount("user:2002");
    expect(app.homeTruth).toBeNull();
    expect(app.homeTruthStatus).toBe("idle");
    await expect(app.refreshHomeTruth()).resolves.toBe(true);

    if (outcome === "success") {
      previous.resolve({ earnings: {
        today: { usdt: 999, nex: 99 }, week: { usdt: 999, nex: 99 },
        month: { usdt: 999, nex: 99 }, all: { usdt: 999, nex: 99 },
      } });
    } else {
      previous.reject(new Error("previous account offline"));
    }
    await expect(oldRead).resolves.toBe(false);
    expect(app.homeTruth).toEqual(overview);
    expect(app.earnings.today).toBe(12);
    expect(app.homeTruthStatus).toBe("ready");
    expect(app.homeTruthError).toBeNull();
  });

  it("keeps the last Home and earnings projection when a later read has a transient failure", async () => {
    const overview = {
      earnings: {
        today: { usdt: 12, nex: 1 }, week: { usdt: 34, nex: 2 },
        month: { usdt: 56, nex: 3 }, all: { usdt: 78, nex: 4 },
      },
    };
    remote.appHomeApi.fetch
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(new Error("home offline"));
    const app = useApp();
    app.bindAccount("user:1001");

    await expect(app.refreshHomeTruth()).resolves.toBe(true);
    await expect(app.refreshHomeTruth()).resolves.toBe(false);

    expect(app.homeTruth).toEqual(overview);
    expect(app.earnings.today).toBe(12);
    expect(app.homeTruthStatus).toBe("error");
  });

  it("coalesces concurrent Home lifecycle reads for the current account generation", async () => {
    const pending = deferred<unknown>();
    remote.appHomeApi.fetch.mockReturnValueOnce(pending.promise);
    const app = useApp();
    app.bindAccount("user:1001");

    const first = app.refreshHomeTruth();
    const duplicate = app.refreshHomeTruth();
    expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(1);
    pending.resolve({
      earnings: {
        today: { usdt: 0, nex: 0 }, week: { usdt: 0, nex: 0 },
        month: { usdt: 0, nex: 0 }, all: { usdt: 0, nex: 0 },
      },
    });
    await expect(Promise.all([first, duplicate])).resolves.toEqual([true, true]);
  });

  it("lets an existing lifecycle read coalesce, but makes the following default read fresh", async () => {
    const staleFleet = deferred<CanonicalE3Fleet>();
    const freshFleet = deferred<CanonicalE3Fleet>();
    remote.deviceE3Api.fleet
      .mockReturnValueOnce(staleFleet.promise)
      .mockReturnValueOnce(freshFleet.promise);
    const app = useApp();
    app.bindAccount("user:1001");
    const request = app.captureRemoteAccountRequest();

    const lifecycle = app.refreshRemoteFleet(request, { coalesce: true });
    const mutationReadback = app.refreshRemoteFleet(request);

    expect(remote.deviceE3Api.fleet).toHaveBeenCalledTimes(2);
    freshFleet.resolve(fleet(720));
    await expect(mutationReadback).resolves.toBe(true);
    expect(app.user.usdtBalance).toBe(720);
    expect(app.slotCap).toBe(1);

    staleFleet.resolve(fleet(900));
    await expect(lifecycle).resolves.toBe(false);
    expect(app.user.usdtBalance).toBe(720);
  });

  it("keeps an old-account completion from applying after the account epoch advances", async () => {
    const oldFleet = deferred<CanonicalE3Fleet>();
    const currentFleet = deferred<CanonicalE3Fleet>();
    remote.deviceE3Api.fleet
      .mockReturnValueOnce(oldFleet.promise)
      .mockReturnValueOnce(currentFleet.promise);
    const app = useApp();
    app.bindAccount("user:1001");
    const oldRequest = app.captureRemoteAccountRequest();
    const oldRead = app.refreshRemoteFleet(oldRequest, { coalesce: true });

    remote.sessionVault.read.mockReturnValue({ user: { userId: 2002 } });
    app.bindAccount("user:2002");
    expect(app.remoteFleetHasSnapshot).toBe(false);
    expect(app.remoteAssignmentHasSnapshot).toBe(false);
    const currentRead = app.refreshRemoteFleet();

    currentFleet.resolve(fleet(420));
    await expect(currentRead).resolves.toBe(true);
    expect(app.user.usdtBalance).toBe(420);
    expect(app.remoteFleetHasSnapshot).toBe(true);
    expect(app.remoteAssignmentHasSnapshot).toBe(true);

    oldFleet.resolve(fleet(900));
    await expect(oldRead).resolves.toBe(false);
    expect(app.user.usdtBalance).toBe(420);
  });

  it("keeps the last confirmed wallet and fleet snapshot when a later fleet read fails", async () => {
    remote.deviceE3Api.fleet
      .mockResolvedValueOnce(fleet(680))
      .mockRejectedValueOnce(new Error("fleet unavailable"));
    const app = useApp();
    app.bindAccount("user:1001");

    await expect(app.refreshRemoteFleet()).resolves.toBe(true);
    expect(app.remoteFleetHasSnapshot).toBe(true);
    expect(app.remoteAssignmentHasSnapshot).toBe(true);
    expect(app.user.usdtBalance).toBe(680);

    await expect(app.refreshRemoteFleet()).resolves.toBe(false);
    expect(app.remoteFleetStatus).toBe("error");
    expect(app.remoteFleetHasSnapshot).toBe(true);
    expect(app.remoteAssignmentHasSnapshot).toBe(true);
    expect(app.user.usdtBalance).toBe(680);
  });

  it("keeps confirmed fleet and assignment evidence while a background refresh is pending", async () => {
    const pendingFleet = deferred<CanonicalE3Fleet>();
    remote.deviceE3Api.fleet
      .mockResolvedValueOnce(fleet(680))
      .mockReturnValueOnce(pendingFleet.promise);
    const app = useApp();
    app.bindAccount("user:1001");

    await expect(app.refreshRemoteFleet()).resolves.toBe(true);
    const pending = app.refreshRemoteFleet();

    expect(app.remoteFleetStatus).toBe("loading");
    expect(app.remoteAssignmentStatus).toBe("loading");
    expect(app.remoteFleetHasSnapshot).toBe(true);
    expect(app.remoteAssignmentHasSnapshot).toBe(true);

    pendingFleet.resolve(fleet(681));
    await expect(pending).resolves.toBe(true);
  });

  it("keeps the first remote read unknown until current-account evidence arrives", async () => {
    const pendingFleet = deferred<CanonicalE3Fleet>();
    remote.deviceE3Api.fleet.mockReturnValueOnce(pendingFleet.promise);
    const app = useApp();
    app.bindAccount("user:1001");

    const pending = app.refreshRemoteFleet();
    expect(app.remoteFleetStatus).toBe("loading");
    expect(app.remoteAssignmentStatus).toBe("loading");
    expect(app.remoteFleetHasSnapshot).toBe(false);
    expect(app.remoteAssignmentHasSnapshot).toBe(false);

    pendingFleet.resolve(fleet(680));
    await expect(pending).resolves.toBe(true);
    expect(app.remoteFleetHasSnapshot).toBe(true);
    expect(app.remoteAssignmentHasSnapshot).toBe(true);
  });

  it("keeps the first withdrawal-list read unknown instead of treating it as zero rows", async () => {
    const pendingList = deferred<[]>();
    remote.withdrawalApi.list.mockReturnValueOnce(pendingList.promise);
    const app = useApp();
    app.bindAccount("user:1001");

    expect(app.remoteWithdrawalListStatus).toBe("loading");
    expect(app.remoteWithdrawalListHasSnapshot).toBe(false);

    pendingList.resolve([]);
    await vi.waitFor(() => expect(app.remoteWithdrawalListStatus).toBe("ready"));
    expect(app.remoteWithdrawalListHasSnapshot).toBe(true);
  });

  it("retains a same-account withdrawal-list snapshot but marks it stale after a failed refresh", async () => {
    remote.withdrawalApi.list
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("withdrawal list unavailable"));
    const app = useApp();
    app.bindAccount("user:1001");
    await vi.waitFor(() => expect(app.remoteWithdrawalListStatus).toBe("ready"));

    await expect(app.refreshRemoteWithdrawalList()).resolves.toBe(false);
    expect(app.remoteWithdrawalListStatus).toBe("error");
    expect(app.remoteWithdrawalListHasSnapshot).toBe(true);
  });

  it("does not let an old-account withdrawal list satisfy the current account's read", async () => {
    const oldList = deferred<[]>();
    const currentList = deferred<[]>();
    remote.withdrawalApi.list
      .mockReturnValueOnce(oldList.promise)
      .mockReturnValueOnce(currentList.promise);
    const app = useApp();
    app.bindAccount("user:1001");

    remote.sessionVault.read.mockReturnValue({ user: { userId: 2002 } });
    app.bindAccount("user:2002");
    oldList.resolve([]);
    await Promise.resolve();

    expect(app.remoteWithdrawalListStatus).toBe("loading");
    expect(app.remoteWithdrawalListHasSnapshot).toBe(false);
    currentList.resolve([]);
    await vi.waitFor(() => expect(app.remoteWithdrawalListStatus).toBe("ready"));
    expect(app.remoteWithdrawalListHasSnapshot).toBe(true);
  });

  it("retains an authenticated Genesis wallet receipt when the first fleet read fails", async () => {
    remote.deviceE3Api.fleet.mockRejectedValueOnce(new Error("fleet unavailable"));
    const app = useApp();
    app.bindAccount("user:1001");
    const receiptScope = app.captureRemoteAccountRequest();

    expect(app.adoptDevelopmentGenesisWallet(315.5, receiptScope, "PRODUCTION")).toBe(true);
    expect(app.remoteFleetHasSnapshot).toBe(false);
    expect(app.remoteWalletReceiptHasSnapshot).toBe(true);
    expect(app.user.usdtBalance).toBe(315.5);

    await expect(app.refreshRemoteFleet()).resolves.toBe(false);
    expect(app.remoteFleetStatus).toBe("error");
    expect(app.remoteFleetHasSnapshot).toBe(false);
    expect(app.remoteWalletReceiptHasSnapshot).toBe(true);
    expect(app.user.usdtBalance).toBe(315.5);
  });
});
