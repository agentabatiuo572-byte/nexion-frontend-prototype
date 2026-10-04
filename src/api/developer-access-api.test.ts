import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDeveloperAccessApi } from "./developer-access-api";

describe("developer access API", () => {
  it("submits a server-owned request with an idempotency key", async () => {
    const request = vi.fn().mockResolvedValue({ requestNo: "DEV-1", idempotencyKey: "key-1", status: "PENDING",
      submittedAt: "2026-08-13T00:00:00Z", source: "server", sourceEnvironment: "PRODUCTION", runId: "" });
    const api = createDeveloperAccessApi({ request } as unknown as ApiClient, "dev");
    await expect(api.submit({ company: "NexGrid", email: "dev@example.com", useCase: "Inference workloads" }, "key-1"))
      .resolves.toMatchObject({ requestNo: "DEV-1", status: "PENDING" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "key-1" }));
  });
  it("rejects a local response", async () => {
    const request = vi.fn().mockResolvedValue({ requestNo: "DEV-1", idempotencyKey: "key-1", status: "PENDING",
      submittedAt: "2026-08-13T00:00:00Z", source: "local", sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(createDeveloperAccessApi({ request } as unknown as ApiClient).latest()).rejects.toMatchObject({ message: "DEVELOPER_ACCESS_RESPONSE_INVALID" });
  });

  it.each(["REVOKED", "EXPIRED"] as const)("keeps %s as a server historical access state", async (status) => {
    const request = vi.fn().mockResolvedValue({ requestNo: "DEV-1", idempotencyKey: "key-1", status,
      submittedAt: "2026-08-13T00:00:00Z", source: "server", sourceEnvironment: "PRODUCTION", runId: "" });

    await expect(createDeveloperAccessApi({ request } as unknown as ApiClient).latest())
      .resolves.toMatchObject({ status });
  });

  it("accepts only controlled public review reasons", async () => {
    const request = vi.fn().mockResolvedValue({ requestNo: "DEV-1", idempotencyKey: "key-1", status: "REVOKED",
      reviewReason: "ACCESS_REVOKED_BY_POLICY", submittedAt: "2026-08-13T00:00:00Z", source: "server", sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(createDeveloperAccessApi({ request } as unknown as ApiClient).latest())
      .resolves.toMatchObject({ reviewReason: "ACCESS_REVOKED_BY_POLICY" });

    request.mockResolvedValueOnce({ requestNo: "DEV-1", idempotencyKey: "key-1", status: "REVOKED",
      reviewReason: "operator free text", submittedAt: "2026-08-13T00:00:00Z", source: "server", sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(createDeveloperAccessApi({ request } as unknown as ApiClient).latest())
      .rejects.toMatchObject({ message: "DEVELOPER_ACCESS_RESPONSE_INVALID" });
  });
});
