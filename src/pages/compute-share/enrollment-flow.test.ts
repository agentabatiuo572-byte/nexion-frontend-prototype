import { describe, expect, it, vi } from "vitest";
import { COMPUTE_SHARE_REPLAY_WINDOW_MS, preserveInMemoryPairingCode, runComputeShareEnrollmentFlow } from "./enrollment-flow";
import { createComputeShareEnrollmentJournal } from "./enrollment-recovery";

function journalWith(value: unknown = "") {
  const backing = {
    value,
    read() { return this.value; },
    write(next: unknown) { this.value = next; },
    remove() { this.value = ""; },
  };
  return createComputeShareEnrollmentJournal(backing);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const pending = (pairingCode: string | null) => ({
  enrollmentNo: "CSE-01JXYZ",
  pairingCode,
  status: "PENDING" as const,
  requestedGpuModel: "NVIDIA RTX 4070",
  expiresAt: "2026-08-13T00:10:00Z",
  deviceId: null,
  source: "server" as const,
});

describe("compute share enrollment flow", () => {
  it.each([-1, 0, 1])("bounds replay at the safety deadline %s ms", async (offset) => {
    const journal = journalWith();
    const createdAt = 1_000_000;
    journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "original-key", createdAt });
    const create = vi.fn().mockResolvedValue(pending("731904"));
    const result = await runComputeShareEnrollmentFlow({
      accountKey: "account-a", requestedGpuModel: "NVIDIA RTX 4070", journal, createKey: vi.fn(),
      isCurrent: () => true, isEnabled: () => true, create, status: vi.fn().mockResolvedValue(pending(null)),
      now: () => createdAt + COMPUTE_SHARE_REPLAY_WINDOW_MS + offset,
    });
    expect(result.kind).toBe(offset < 0 ? "enrollment" : "recovery-required");
    expect(create).toHaveBeenCalledTimes(offset < 0 ? 1 : 0);
    expect(journal.read("account-a")).toMatchObject({ pending: { createdAt, idempotencyKey: "original-key" } });
  });

  it("rechecks the replay deadline after a slow status lookup", async () => {
    const journal = journalWith();
    const createdAt = 1_000_000;
    let now = createdAt;
    journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "original-key", createdAt, enrollmentNo: "CSE-01JXYZ" });
    const create = vi.fn();
    await expect(runComputeShareEnrollmentFlow({
      accountKey: "account-a", requestedGpuModel: "NVIDIA RTX 4070", journal, createKey: vi.fn(),
      isCurrent: () => true, isEnabled: () => true, create, now: () => now,
      status: async () => { now += COMPUTE_SHARE_REPLAY_WINDOW_MS; return pending(null); },
    })).resolves.toEqual({ kind: "recovery-required" });
    expect(create).not.toHaveBeenCalled();
  });
  it.each([undefined, Date.now() - 24 * 60 * 60 * 1000, Date.now() + 60_000])(
    "does not replay an unresolved command with an unsafe creation time: %s", async (createdAt) => {
      const journal = journalWith();
      journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "original-key", createdAt });
      const create = vi.fn();
      const createKey = vi.fn();
      const result = await runComputeShareEnrollmentFlow({
        accountKey: "account-a", requestedGpuModel: "NVIDIA RTX 4090", journal, createKey,
        isCurrent: () => true, isEnabled: () => true, create, status: vi.fn(),
      });
      expect(result).toEqual({ kind: "recovery-required" });
      expect(create).not.toHaveBeenCalled();
      expect(createKey).not.toHaveBeenCalled();
      expect(journal.read("account-a")).toMatchObject({ pending: { idempotencyKey: "original-key" } });
    },
  );

  it("still reads a known expired enrollment without replaying a creation request", async () => {
    const journal = journalWith();
    journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "key-1", enrollmentNo: "CSE-01JXYZ" });
    const expired = { ...pending(null), status: "EXPIRED" as const };
    const create = vi.fn();
    await expect(runComputeShareEnrollmentFlow({
      accountKey: "account-a", requestedGpuModel: "NVIDIA RTX 4070", journal, createKey: vi.fn(),
      isCurrent: () => true, isEnabled: () => true, create, status: vi.fn().mockResolvedValue(expired),
    })).resolves.toEqual({ kind: "enrollment", enrollment: expired });
    expect(create).not.toHaveBeenCalled();
  });
  it("does not POST when the recovery journal is malformed", async () => {
    const create = vi.fn();
    const result = await runComputeShareEnrollmentFlow({
      accountKey: "account-a",
      requestedGpuModel: "NVIDIA RTX 4070",
      journal: journalWith("malformed"),
      createKey: () => "new-key",
      isCurrent: () => true,
      isEnabled: () => true,
      create,
      status: vi.fn(),
    });

    expect(result).toEqual({ kind: "blocked" });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not dispatch or resume after scope becomes disabled or stale", async () => {
    const create = vi.fn();
    const status = vi.fn();
    const journal = journalWith();
    expect(journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "key-1", enrollmentNo: "CSE-01JXYZ" })).toBe(true);

    await expect(runComputeShareEnrollmentFlow({
      accountKey: "account-a",
      requestedGpuModel: "NVIDIA RTX 4070",
      journal,
      createKey: () => "new-key",
      isCurrent: () => false,
      isEnabled: () => true,
      create,
      status,
    })).resolves.toEqual({ kind: "blocked" });
    expect(create).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("retains the original key when a config suspend makes an in-flight create stale, then recovers the same enrollment", async () => {
    const journal = journalWith();
    const firstReceipt = deferred<ReturnType<typeof pending>>();
    const createKey = vi.fn(() => "original-key");
    const create = vi.fn()
      .mockReturnValueOnce(firstReceipt.promise)
      .mockResolvedValueOnce(pending("731904"));
    const status = vi.fn().mockResolvedValue(pending(null));
    let current = true;
    let enabled = true;
    const options = {
      accountKey: "account-a", requestedGpuModel: "NVIDIA RTX 4070", journal, createKey,
      isCurrent: () => current, isEnabled: () => enabled, create, status,
    };

    const inFlight = runComputeShareEnrollmentFlow(options);
    expect(create).toHaveBeenCalledWith("NVIDIA RTX 4070", "original-key");
    current = false;
    enabled = false;
    firstReceipt.resolve(pending("731904"));
    await expect(inFlight).resolves.toEqual({ kind: "blocked" });
    expect(status).not.toHaveBeenCalled();
    expect(journal.read("account-a")).toEqual({
      kind: "ok",
      pending: expect.objectContaining({ idempotencyKey: "original-key" }),
    });
    expect(journal.read("account-a")).not.toEqual({
      kind: "ok",
      pending: expect.objectContaining({ enrollmentNo: "CSE-01JXYZ" }),
    });

    current = true;
    enabled = true;
    await expect(runComputeShareEnrollmentFlow(options)).resolves.toEqual({
      kind: "enrollment", enrollment: pending("731904"),
    });
    expect(createKey).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenNthCalledWith(1, "NVIDIA RTX 4070", "original-key");
    expect(create).toHaveBeenNthCalledWith(2, "NVIDIA RTX 4070", "original-key");
    expect(status).toHaveBeenCalledExactlyOnceWith("CSE-01JXYZ");
  });

  it("reads known enrollment first then replays the original key to safely recover the one-time code", async () => {
    const journal = journalWith();
    expect(journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "key-1", enrollmentNo: "CSE-01JXYZ", createdAt: Date.now() })).toBe(true);
    const status = vi.fn().mockResolvedValue(pending(null));
    const create = vi.fn().mockResolvedValue(pending("731904"));

    await expect(runComputeShareEnrollmentFlow({
      accountKey: "account-a",
      requestedGpuModel: "NVIDIA RTX 4090",
      journal,
      createKey: () => "new-key",
      isCurrent: () => true,
      isEnabled: () => true,
      create,
      status,
    })).resolves.toEqual({ kind: "enrollment", enrollment: pending("731904") });
    expect(status).toHaveBeenCalledWith("CSE-01JXYZ");
    expect(create).toHaveBeenCalledWith("NVIDIA RTX 4070", "key-1");
  });

  it("keeps a received pairing code through later status polls only for the same account and enrollment", () => {
    const current = { accountKey: "account-a", enrollmentNo: "CSE-01JXYZ", pairingCode: "731904" };

    expect(preserveInMemoryPairingCode(pending(null), current, "account-a")).toEqual({
      enrollment: pending("731904"),
      pairingCode: current,
    });
    expect(preserveInMemoryPairingCode(pending(null), current, "account-b")).toEqual({
      enrollment: pending(null),
      pairingCode: null,
    });
  });
});
