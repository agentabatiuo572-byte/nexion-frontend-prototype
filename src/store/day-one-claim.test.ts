import { createPinia, setActivePinia } from "pinia";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { state, claim } = vi.hoisted(() => ({ state: vi.fn(), claim: vi.fn() }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, questApi: { state, claim } }));
import { useQuest } from "./quest";

const snapshot = (status = "COMPLETED") => ({
  dayOneRewardNex: 500,
  dayOneRequiredTaskCount: 6,
  dayOneSnapshotStatus: "SNAPSHOT" as const,
  quests: Array.from({ length: 6 }, (_, i) => ({
  questCode: `q${i}`, layer: "DAY_ONE", status, rewardNex: 0, instanceKey: "DAY_ONE:test",
  eligible: true, eligibleFrom: "2026-09-08T00:00:00Z", eligibleUntil: "2026-09-11T00:00:00Z",
  })),
});

describe("DayOne claim command", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
    setActivePinia(createPinia()); state.mockReset(); claim.mockReset();
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it("requires explicit action and coalesces repeated taps until server readback", async () => {
    state.mockResolvedValue(snapshot()); const store = useQuest(); await store.refreshRemote();
    expect(claim).not.toHaveBeenCalled();
    let finish!: (value: unknown) => void;
    claim.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = store.claimDayOne();
    expect(store.dayOneClaiming).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    await expect(store.claimDayOne()).resolves.toBe(false);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith("q0", "h3-quest-claim:q0:DAY_ONE:test", "DAY_ONE:test");
    state.mockResolvedValue(snapshot("CLAIMED"));
    finish({ status: "CLAIMED", instanceKey: "DAY_ONE:test" });
    await expect(pending).resolves.toBe(true);
    expect(store.remoteQuests.every(row => row.status === "CLAIMED")).toBe(true);
    expect(store.dayOneClaiming).toBe(false);
    await store.claimDayOne(); expect(claim).toHaveBeenCalledTimes(1);
  });
  it("blocks pending and expired tasks", async () => {
    state.mockResolvedValue(snapshot("PENDING")); const store = useQuest(); await store.refreshRemote();
    await store.claimDayOne();
    state.mockResolvedValue(snapshot()); await store.refreshRemote();
    vi.setSystemTime(new Date("2026-09-11T00:00:00Z")); await store.claimDayOne();
    expect(claim).not.toHaveBeenCalled();
  });
  it("keeps legacy rows readable but refuses a group claim when the snapshot header is unavailable", async () => {
    state.mockResolvedValue({
      ...snapshot(),
      dayOneRequiredTaskCount: null,
      dayOneSnapshotStatus: "LEGACY_UNVERIFIED",
    });
    const store = useQuest(); await store.refreshRemote();
    expect(store.remoteQuests).toHaveLength(6);
    expect(store.dayOneRequiredTaskCount).toBeNull();
    await expect(store.claimDayOne()).resolves.toBe(false);
    expect(claim).not.toHaveBeenCalled();
  });
  it("keeps the confirmed snapshot metadata on a same-account read failure", async () => {
    state.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error("offline"));
    const store = useQuest(); await store.refreshRemote();
    await expect(store.refreshRemote()).resolves.toBe(false);
    expect(store.remoteQuests).toHaveLength(6);
    expect(store.dayOneRequiredTaskCount).toBe(6);
    expect(store.dayOneSnapshotStatus).toBe("SNAPSHOT");
    expect(store.dayOneRewardNex).toBe(500);
  });
  it("clears a prior account's metadata and rejects its late snapshot after rebind", async () => {
    let settleOld!: (value: unknown) => void;
    state.mockResolvedValueOnce(snapshot())
      .mockImplementationOnce(() => new Promise(resolve => { settleOld = resolve; }))
      .mockResolvedValueOnce({ ...snapshot(), dayOneRequiredTaskCount: null, dayOneSnapshotStatus: "LEGACY_UNVERIFIED" });
    const store = useQuest(); await store.refreshRemote();
    const stale = store.refreshRemote(); await Promise.resolve();
    store.bindAccount("other-user");
    await Promise.resolve(); await Promise.resolve();
    settleOld(snapshot());
    await stale;
    expect(store.dayOneRequiredTaskCount).toBeNull();
    expect(store.dayOneSnapshotStatus).toBe("LEGACY_UNVERIFIED");
    expect(store.remoteQuests).toHaveLength(6);
  });
  it("keeps uncertain failures visible without fabricating completion", async () => {
    state.mockResolvedValue(snapshot()); const store = useQuest(); await store.refreshRemote();
    claim.mockRejectedValue(new Error("network"));
    await expect(store.claimDayOne()).resolves.toBe(false);
    expect(store.dayOneClaimError).toBe(true); expect(store.dayOneClaiming).toBe(false);
    expect(store.isComplete("q0")).toBe(false);
  });
  it("does not submit against a stale snapshot when its preflight read fails", async () => {
    state.mockResolvedValueOnce(snapshot()).mockRejectedValue(new Error("offline"));
    const store = useQuest(); await store.refreshRemote();
    await expect(store.claimDayOne()).resolves.toBe(false);
    expect(claim).not.toHaveBeenCalled(); expect(store.dayOneClaimError).toBe(true);
  });
  it("does not report success when the post-claim projection is still unclaimed", async () => {
    state.mockResolvedValue(snapshot()); const store = useQuest(); await store.refreshRemote();
    claim.mockResolvedValue({ status: "CLAIMED", instanceKey: "DAY_ONE:test" });
    await expect(store.claimDayOne()).resolves.toBe(false);
    expect(store.dayOneClaimError).toBe(true); expect(store.isComplete("q0")).toBe(false);
  });
  it("requires the whole group in the successful claim readback", async () => {
    const partial = snapshot(); partial.quests[0].status = "CLAIMED";
    state.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(partial);
    const store = useQuest(); await store.refreshRemote();
    claim.mockResolvedValue({ status: "CLAIMED", instanceKey: "DAY_ONE:test" });
    await expect(store.claimDayOne()).resolves.toBe(false);
    expect(store.dayOneClaimError).toBe(true);
  });
  it("does not leak a late failure into a different account", async () => {
    state.mockResolvedValue(snapshot()); const store = useQuest(); await store.refreshRemote();
    let fail!: (error: Error) => void;
    claim.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const pending = store.claimDayOne();
    await Promise.resolve(); await Promise.resolve();
    state.mockResolvedValue(snapshot("PENDING")); store.bindAccount("other-user");
    fail(new Error("network")); await pending;
    expect(store.dayOneClaimError).toBe(false); expect(store.dayOneClaiming).toBe(false);
  });
});
