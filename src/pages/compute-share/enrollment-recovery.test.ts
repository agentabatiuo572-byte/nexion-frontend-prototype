import { describe, expect, it } from "vitest";
import {
  createComputeShareEnrollmentJournal,
  type ComputeShareEnrollmentStorage,
} from "./enrollment-recovery";

function storage(): ComputeShareEnrollmentStorage & { value: unknown } {
  return {
    value: "",
    read() { return this.value; },
    write(value) { this.value = value; },
    remove() { this.value = ""; },
  };
}

describe("compute share enrollment recovery journal", () => {
  it("timestamps a new intent once and preserves that deadline through reload and enrollment attachment", () => {
    const backing = storage();
    const journal = createComputeShareEnrollmentJournal(backing);
    const initial = journal.retainOrCreate("account-a", "NVIDIA RTX 4070", () => "original-key");
    expect(initial.kind).toBe("intent");
    if (initial.kind !== "intent") throw new Error("expected an intent");
    expect(initial.intent.createdAt).toBeGreaterThan(0);
    expect(journal.save("account-a", initial.intent)).toBe(true);
    expect(journal.attachEnrollmentNo("account-a", "CSE-01JXYZ")).toBe(true);
    const restored = createComputeShareEnrollmentJournal(backing);
    expect(restored.retainOrCreate("account-a", "NVIDIA RTX 4090", () => "different-key")).toEqual({
      kind: "intent", created: false, intent: { ...initial.intent, enrollmentNo: "CSE-01JXYZ" },
    });
  });
  it("persists a new command key and proves it can be read back before submission", () => {
    const backing = storage();
    const journal = createComputeShareEnrollmentJournal(backing);
    const intent = { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "compute-share-key-1" };

    expect(journal.save("account-a", intent)).toBe(true);
    expect(journal.read("account-a")).toEqual({ kind: "ok", pending: intent });
  });

  it("keeps an ambiguous pending command when a different GPU is selected", () => {
    const journal = createComputeShareEnrollmentJournal(storage());
    const retained = { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "compute-share-key-1" };
    expect(journal.save("account-a", retained)).toBe(true);

    expect(journal.retainOrCreate("account-a", "NVIDIA RTX 4090", () => "new-key")).toEqual({
      kind: "intent",
      intent: retained,
      created: false,
    });
  });

  it("isolates journals by account and records a known enrollment number for read-back recovery", () => {
    const journal = createComputeShareEnrollmentJournal(storage());
    const intent = { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "compute-share-key-1" };
    expect(journal.save("account-a", intent)).toBe(true);
    expect(journal.attachEnrollmentNo("account-a", "CSE-01JXYZ")).toBe(true);

    expect(journal.read("account-a")).toEqual({ kind: "ok", pending: { ...intent, enrollmentNo: "CSE-01JXYZ" } });
    expect(journal.read("account-b")).toEqual({ kind: "ok", pending: null });
  });

  it("blocks a command when durable storage cannot be read back", () => {
    const backing: ComputeShareEnrollmentStorage = {
      read: () => "",
      write: () => {},
      remove: () => {},
    };
    const journal = createComputeShareEnrollmentJournal(backing);

    expect(journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "compute-share-key-1" })).toBe(false);
  });

  it("fails closed instead of replacing a malformed nonempty journal", () => {
    const backing: ComputeShareEnrollmentStorage & { value: unknown } = {
      value: "not-a-journal",
      read() { return this.value; },
      write(value) { this.value = value; },
      remove() { this.value = ""; },
    };
    const journal = createComputeShareEnrollmentJournal(backing);

    expect(journal.read("account-a")).toEqual({ kind: "unavailable" });
    expect(journal.retainOrCreate("account-a", "NVIDIA RTX 4090", () => "new-key")).toEqual({ kind: "unavailable" });
    expect(journal.save("account-a", { requestedGpuModel: "NVIDIA RTX 4090", idempotencyKey: "new-key" })).toBe(false);
    expect(backing.value).toBe("not-a-journal");
  });

  it("fails closed when reading storage throws", () => {
    const journal = createComputeShareEnrollmentJournal({
      read: () => { throw new Error("storage unavailable"); },
      write: () => {},
      remove: () => {},
    });

    expect(journal.read("account-a")).toEqual({ kind: "unavailable" });
    expect(journal.retainOrCreate("account-a", "NVIDIA RTX 4090", () => "new-key")).toEqual({ kind: "unavailable" });
  });

  it.each([
    ["invalid model", { requestedGpuModel: "x", idempotencyKey: "old-key" }],
    ["missing key", { requestedGpuModel: "NVIDIA RTX 4070" }],
    ["invalid known enrollment", { requestedGpuModel: "NVIDIA RTX 4070", idempotencyKey: "old-key", enrollmentNo: "not-an-enrollment" }],
  ])("fails closed when version-1 currentuser row has %s", (_case, currentuser) => {
    const backing: ComputeShareEnrollmentStorage & { value: unknown } = {
      value: { version: 1, byAccount: { currentuser } },
      read() { return this.value; },
      write(value) { this.value = value; },
      remove: () => {},
    };
    const journal = createComputeShareEnrollmentJournal(backing);

    expect(journal.read("currentuser")).toEqual({ kind: "unavailable" });
    expect(journal.retainOrCreate("currentuser", "NVIDIA RTX 4090", () => "new-key")).toEqual({ kind: "unavailable" });
    expect(journal.save("currentuser", { requestedGpuModel: "NVIDIA RTX 4090", idempotencyKey: "new-key" })).toBe(false);
    expect(backing.value).toEqual({ version: 1, byAccount: { currentuser } });
  });

  it("rejects prototype-bearing account entries instead of interpreting the journal as empty", () => {
    const backing: ComputeShareEnrollmentStorage & { value: unknown } = {
      value: JSON.parse('{"version":1,"byAccount":{"__proto__":{"requestedGpuModel":"NVIDIA RTX 4070","idempotencyKey":"old-key"}}}'),
      read() { return this.value; },
      write(value) { this.value = value; },
      remove: () => {},
    };
    const journal = createComputeShareEnrollmentJournal(backing);

    expect(journal.read("currentuser")).toEqual({ kind: "unavailable" });
    expect(journal.retainOrCreate("currentuser", "NVIDIA RTX 4090", () => "new-key")).toEqual({ kind: "unavailable" });
  });
});
