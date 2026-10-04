import { describe, expect, it } from "vitest";
import { createComputeSharePairingHandoff } from "./pairing-handoff";

describe("Compute Share pairing handoff", () => {
  it("copies one versioned Janus payload without identity, token, or hardware claims", () => {
    const payload = createComputeSharePairingHandoff({
      enrollmentNo: "CSE-ABC123",
      pairingCode: "482910",
      requestedGpuModel: "NVIDIA RTX 4070",
      expiresAt: "2026-09-01T12:30:00.000Z",
    });

    expect(payload).toBe("nexgrid://compute-share/pair?v=1&enrollmentNo=CSE-ABC123&pairingCode=482910&requestedGpuModel=NVIDIA+RTX+4070&expiresAt=2026-09-01T12%3A30%3A00.000Z");
    expect(payload).not.toMatch(/token|subject|user|vram|power|attestation/i);
  });

  it.each([
    { enrollmentNo: "bad", pairingCode: "482910", requestedGpuModel: "NVIDIA RTX 4070", expiresAt: "2026-09-01T12:30:00.000Z" },
    { enrollmentNo: "CSE-ABC123", pairingCode: "12345", requestedGpuModel: "NVIDIA RTX 4070", expiresAt: "2026-09-01T12:30:00.000Z" },
    { enrollmentNo: "CSE-ABC123", pairingCode: "482910", requestedGpuModel: "", expiresAt: "2026-09-01T12:30:00.000Z" },
    { enrollmentNo: "CSE-ABC123", pairingCode: "482910", requestedGpuModel: "NVIDIA RTX 4070", expiresAt: "not-a-time" },
  ])("rejects incomplete or malformed handoff facts", (value) => {
    expect(() => createComputeSharePairingHandoff(value)).toThrow("COMPUTE_SHARE_HANDOFF_INVALID");
  });
});
