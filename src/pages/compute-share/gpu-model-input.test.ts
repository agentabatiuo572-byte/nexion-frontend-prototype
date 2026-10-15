import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./download.vue?raw";
import { GPU_TIERS } from "@/lib/gpu-tiers";
import { isRequestedGpuModelValid, normalizeRequestedGpuModel, requestedGpuTier } from "./gpu-model-input";
import { createComputeShareEnrollmentJournal } from "./enrollment-recovery";
import { runComputeShareEnrollmentFlow } from "./enrollment-flow";

describe("actual compute-share GPU input", () => {
  it.each([["", false], ["ab", false], ["abc", true], ["x".repeat(128), true], ["x".repeat(129), false]])(
    "validates the existing normalized text length: %s", (model, valid) => {
      expect(isRequestedGpuModelValid(model)).toBe(valid);
    },
  );
  it("preserves the actual model words and normalizes whitespace like the API", () => {
    expect(normalizeRequestedGpuModel("  NVIDIA   GeForce RTX 5060  ")).toBe("NVIDIA GeForce RTX 5060");
    expect(isRequestedGpuModelValid("  NVIDIA   GeForce RTX 5060  ")).toBe(true);
  });
  it("does not invent G2 or TOPS for empty, unknown or unconfigured models", () => {
    expect(requestedGpuTier("", GPU_TIERS)).toBeNull();
    expect(requestedGpuTier("NVIDIA GeForce RTX 5060", GPU_TIERS)).toBeNull();
    expect(requestedGpuTier("NVIDIA RTX 4070", [])).toBeNull();
    expect(requestedGpuTier("NVIDIA RTX 5060", [{ ...GPU_TIERS[1], keywords: [" "] }])).toBeNull();
    expect(requestedGpuTier("NVIDIA RTX 4070", GPU_TIERS)?.id).toBe("G4");
  });
});

// Execute the page's actual dispatch function, retaining the real journal and
// recovery flow. Fixtures never reach the network or a user's local storage.
const start = page.indexOf("async function createRemoteEnrollment(");
const end = page.indexOf("function connectDemoComputer()", start);
const code = ts.transpileModule(`${page.slice(start, end)}; return createRemoteEnrollment;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function dispatchFixture(model: string, storedModel?: string, corrupt = false) {
  let storage: unknown = corrupt ? "invalid" : "";
  const write = vi.fn((value: unknown) => { storage = value; });
  const remove = vi.fn(() => { storage = ""; });
  const journal = createComputeShareEnrollmentJournal({ read: () => storage, write, remove });
  if (storedModel) journal.save("account-a", { requestedGpuModel: storedModel, idempotencyKey: "retained-key", createdAt: Date.now(), enrollmentNo: "CSE-ORIGINAL" });
  write.mockClear();
  const receipt = { enrollmentNo: "CSE-ORIGINAL", requestedGpuModel: storedModel ?? normalizeRequestedGpuModel(model), status: "PENDING" as const, pairingCode: "123456", expiresAt: "2026-10-15T15:00:00Z", deviceId: null, source: "server" as const };
  const create = vi.fn().mockResolvedValue(receipt);
  const status = vi.fn().mockResolvedValue({ ...receipt, pairingCode: null });
  const createKey = vi.fn(() => "new-key");
  const selectedModel = ref(model);
  const warn = vi.fn();
  const adopt = vi.fn();
  const dispatch = new Function(
    "connecting", "isCurrent", "enabled", "enrollmentJournal", "selectedModel", "toast", "t",
    "runComputeShareEnrollmentFlow", "newEnrollmentKey", "computeShareApi", "adoptEnrollment", "isAmbiguousOutcome",
    "normalizeRequestedGpuModel", "isRequestedGpuModelValid", code,
  )(
    ref(false), () => true, ref(true), journal, selectedModel, { warn }, ref({ computeShare: { modelInvalid: "invalid", recoveryRequired: "recover", pairingFailed: "failed" } }),
    runComputeShareEnrollmentFlow, createKey, { create, status }, adopt, () => false,
    normalizeRequestedGpuModel, isRequestedGpuModelValid,
  ) as (account: string, generation: number, lifecycle: number) => Promise<void>;
  return { dispatch: () => dispatch("account-a", 0, 0), create, status, createKey, journal, selectedModel, warn, write, remove, adopt };
}

describe("page GPU editing and original intent priority", () => {
  it.each(["", "ab", "x".repeat(129)])("rejects invalid fresh input without key or journal mutation: %s", async model => {
    const s = dispatchFixture(model);
    await s.dispatch();
    expect(s.warn).toHaveBeenCalledWith("invalid");
    expect(s.createKey).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
    expect(s.remove).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
  });
  it("submits the actual model once with a new intent only when none is retained", async () => {
    const s = dispatchFixture("  NVIDIA   GeForce RTX 5060  ");
    await s.dispatch();
    expect(s.create).toHaveBeenCalledExactlyOnceWith("NVIDIA GeForce RTX 5060", "new-key");
    expect(s.createKey).toHaveBeenCalledOnce();
    expect(s.status).toHaveBeenCalledExactlyOnceWith("CSE-ORIGINAL");
  });
  it.each(["NVIDIA RTX 5060", "", "ab"])("keeps original model/key despite an edited draft: %s", async model => {
    const s = dispatchFixture(model, "NVIDIA RTX 3060");
    await s.dispatch();
    expect(s.status).toHaveBeenCalledExactlyOnceWith("CSE-ORIGINAL");
    expect(s.create).toHaveBeenCalledExactlyOnceWith("NVIDIA RTX 3060", "retained-key");
    expect(s.selectedModel.value).toBe("NVIDIA RTX 3060");
    expect(s.createKey).not.toHaveBeenCalled();
    expect(s.remove).not.toHaveBeenCalled();
    expect(s.journal.read("account-a")).toMatchObject({ pending: { enrollmentNo: "CSE-ORIGINAL", idempotencyKey: "retained-key", requestedGpuModel: "NVIDIA RTX 3060" } });
  });
  it("does not replace an unreadable intent when a valid actual model is entered", async () => {
    const s = dispatchFixture("NVIDIA RTX 5060", undefined, true);
    await s.dispatch();
    expect(s.createKey).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
    expect(s.remove).not.toHaveBeenCalled();
  });
});
