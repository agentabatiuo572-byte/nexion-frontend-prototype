import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDeveloperAccessApi } from "./developer-access-api";

describe("developer access API", () => {
  it("submits a server-owned request with an idempotency key", async () => {
    const request = vi.fn().mockResolvedValue({ requestNo: "DEV-1", idempotencyKey: "key-1", status: "PENDING",
      submittedAt: "2026-08-13T00:00:00Z", source: "server", sourceEnvironment: "SANDBOX", runId: "run-1" });
    const api = createDeveloperAccessApi({ request } as unknown as ApiClient);
    await expect(api.submit({ company: "NexGrid", email: "dev@example.com", useCase: "Inference workloads" }, "key-1"))
      .resolves.toMatchObject({ requestNo: "DEV-1", status: "PENDING" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "key-1" }));
  });
  it("rejects a local response", async () => {
    const request = vi.fn().mockResolvedValue({ requestNo: "DEV-1", idempotencyKey: "key-1", status: "PENDING",
      submittedAt: "2026-08-13T00:00:00Z", source: "local", sourceEnvironment: "SANDBOX", runId: "run-1" });
    await expect(createDeveloperAccessApi({ request } as unknown as ApiClient).latest()).rejects.toMatchObject({ message: "DEVELOPER_ACCESS_RESPONSE_INVALID" });
  });
});
