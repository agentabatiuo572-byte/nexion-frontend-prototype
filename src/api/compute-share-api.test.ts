import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createComputeShareApi } from "./compute-share-api";

function client(data: unknown): ApiClient {
  return { request: vi.fn().mockResolvedValue(data) } as unknown as ApiClient;
}

describe("compute share enrollment API", () => {
  it("accepts a pending server pairing receipt", async () => {
    const api = createComputeShareApi(client({
      enrollmentNo: "CSE-01JXYZ",
      pairingCode: "731904",
      status: "PENDING",
      requestedGpuModel: "NVIDIA RTX 4070",
      expiresAt: "2026-08-13T00:10:00Z",
      deviceId: null,
      source: "server",
    }));

    await expect(api.create("NVIDIA RTX 4070", "pair-key-1")).resolves.toMatchObject({
      enrollmentNo: "CSE-01JXYZ",
      pairingCode: "731904",
      status: "PENDING",
      source: "server",
    });
  });

  it("rejects a client-minted connected receipt", async () => {
    const api = createComputeShareApi(client({
      enrollmentNo: "CSE-01JXYZ",
      pairingCode: "731904",
      status: "CONNECTED",
      requestedGpuModel: "NVIDIA RTX 4070",
      expiresAt: "2026-08-13T00:10:00Z",
      deviceId: null,
      source: "local",
    }));

    await expect(api.create("NVIDIA RTX 4070", "pair-key-1")).rejects.toMatchObject({
      message: "COMPUTE_SHARE_ENROLLMENT_RESPONSE_INVALID",
    });
  });
});
