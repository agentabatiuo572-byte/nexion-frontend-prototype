import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, getActivePinia, setActivePinia } from "pinia";
import { advanceRuntimeRevision } from "@/api/order-api";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  teamNetworkApi: { snapshot: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);

const { useNetwork } = await import("./network");

const snapshot = (id: string) => ({
  totalMembers: 1, directMembers: 1, activeMembers: 1, monthVolumeUsdt: 10, lifetimeVolumeUsdt: null,
  members: [{ id, name: id, avatarUrl: null, vRank: 1, layer: 1 as const, leg: "A" as const,
    joinedAt: "2026-08-13T00:00:00Z", monthVolumeUsdt: 10, lifetimeVolumeUsdt: null,
    status: "ACTIVE" as const, region: "SG" }], source: "server" as const,
  sourceEnvironment: "SANDBOX" as const, runId: "TEAM-RUN-20260816", serverCanonical: true as const,
  generatedAt: "2026-08-13T00:00:00Z",
});

beforeEach(() => {
  setActivePinia(createPinia());
  remote.teamNetworkApi.snapshot.mockReset();
  advanceRuntimeRevision("TEAM-RUN-20260816");
});
afterEach(() => { const pinia = getActivePinia(); if (pinia) disposePinia(pinia); });

describe("team network remote scope", () => {
  it("retains a confirmed same-account snapshot while loading but clears it on rebind", async () => {
    remote.teamNetworkApi.snapshot.mockResolvedValueOnce(snapshot("confirmed"));
    const store = useNetwork();
    await store.ensureCanonicalNetwork();
    remote.teamNetworkApi.snapshot.mockReturnValue(new Promise(() => {}));
    void store.refreshCanonicalNetwork();
    expect(store.remoteStatus).toBe("loading");
    expect(store.hasRemoteSnapshot).toBe(true);
    store.bindAccount("replacement");
    expect(store.hasRemoteSnapshot).toBe(false);
    expect(store.members).toEqual([]);
  });
  it.each(["account", "runtime", "explicit refresh"])("keeps the replacement flight when an old %s read settles", async (replacement) => {
    let resolveOld!: (value: ReturnType<typeof snapshot>) => void;
    let resolveNew!: (value: ReturnType<typeof snapshot>) => void;
    remote.teamNetworkApi.snapshot
      .mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
      .mockReturnValueOnce(new Promise(done => { resolveNew = done; }));
    const store = useNetwork();
    const oldRead = store.ensureCanonicalNetwork();
    if (replacement === "account") store.bindAccount("new-account");
    else if (replacement === "runtime") advanceRuntimeRevision("TEAM-RUN-20260818");
    else void store.refreshCanonicalNetwork();
    const currentRead = store.ensureCanonicalNetwork();
    expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(2);
    resolveOld(snapshot("stale-member"));
    await expect(oldRead).resolves.toBe(false);
    expect(store.members).toEqual([]);
    const joinedAgain = store.ensureCanonicalNetwork();
    expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(2);
    resolveNew(snapshot("current-member"));
    await expect(currentRead).resolves.toBe(true);
    await expect(joinedAgain).resolves.toBe(true);
    expect(store.members[0]?.id).toBe("current-member");
    expect(store.remoteStatus).toBe("ready");
  });

  it("retries after a joined failure without treating the old flight as current", async () => {
    remote.teamNetworkApi.snapshot.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce(snapshot("recovered"));
    const store = useNetwork();
    const first = store.ensureCanonicalNetwork(), joined = store.ensureCanonicalNetwork();
    expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(false);
    await expect(joined).resolves.toBe(false);
    expect(store.remoteStatus).toBe("error");
    await expect(store.ensureCanonicalNetwork()).resolves.toBe(true);
    expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(2);
    expect(store.members[0]?.id).toBe("recovered");
  });

  it("joins the current bind read and starts fresh after it completes", async () => {
    let resolve!: (value: ReturnType<typeof snapshot>) => void;
    remote.teamNetworkApi.snapshot.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const store = useNetwork();
    store.bindAccount("a");
    const joined = store.ensureCanonicalNetwork();
    expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(1);
    resolve(snapshot("a"));
    await expect(joined).resolves.toBe(true);
    remote.teamNetworkApi.snapshot.mockResolvedValueOnce(snapshot("a-new"));
    await store.ensureCanonicalNetwork();
    expect(remote.teamNetworkApi.snapshot).toHaveBeenCalledTimes(2);
    expect(store.members[0]?.id).toBe("a-new");
  });
  it("keeps the confirmed projection mounted when the commerce runtime moves", async () => {
    remote.teamNetworkApi.snapshot.mockResolvedValueOnce(snapshot("confirmed"));
    const store = useNetwork();
    await store.ensureCanonicalNetwork();
    expect(store.hasRemoteSnapshot).toBe(true);
    remote.teamNetworkApi.snapshot.mockReturnValueOnce(new Promise(() => {}));
    advanceRuntimeRevision("TEAM-RUN-20260819");
    expect(store.remoteStatus).toBe("loading");
    expect(store.hasRemoteSnapshot).toBe(true);
    expect(store.members.map(member => member.id)).toEqual(["confirmed"]);
    expect(store.totalMembers).toBe(1);
  });

  it("drops a response captured before the sandbox run changes", async () => {
    let resolve!: (value: ReturnType<typeof snapshot>) => void;
    remote.teamNetworkApi.snapshot
      .mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockReturnValueOnce(new Promise(() => {}));
    const store = useNetwork();
    const request = store.refreshCanonicalNetwork();

    advanceRuntimeRevision("TEAM-RUN-20260817");
    resolve(snapshot("run-a-member"));

    await expect(request).resolves.toBe(false);
    expect(store.members).toEqual([]);
    expect(store.totalMembers).toBe(0);
  });

  it("drops a response captured before the account epoch changes", async () => {
    let resolve!: (value: ReturnType<typeof snapshot>) => void;
    remote.teamNetworkApi.snapshot
      .mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockResolvedValue(snapshot("account-b-member"));
    const store = useNetwork();
    const request = store.refreshCanonicalNetwork();

    store.bindAccount("account-b");
    resolve(snapshot("account-a-member"));

    await expect(request).resolves.toBe(false);
    await Promise.resolve();
    expect(store.members[0]?.id).toBe("account-b-member");
  });

  it("keeps sandbox facts unavailable instead of falling back to the local seed", async () => {
    remote.teamNetworkApi.snapshot.mockRejectedValue(new ApiError({
      kind: "http", status: 503, message: "TEAM_NETWORK_SANDBOX_FACTS_UNAVAILABLE",
    }));
    const store = useNetwork();

    await expect(store.refreshCanonicalNetwork()).resolves.toBe(false);
    expect(store.remoteStatus).toBe("error");
    expect(store.members).toEqual([]);
    expect(store.totalMembers).toBe(0);
    expect(store.totalMonthVolumeUSD).toBe(0);
  });
});
