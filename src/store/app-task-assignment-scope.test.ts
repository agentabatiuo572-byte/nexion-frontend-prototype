import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/api/api-client";
import { createTaskAssignmentApi } from "@/api/task-assignment-api";

describe("task assignment consumer provenance scope", () => {
  it("accepts the production authority projection in development", async () => {
    const request = vi.fn().mockResolvedValue({
      serverNow: "2026-08-19T11:00:00Z", source: "server", sourceEnvironment: "PRODUCTION",
      runId: "", serverCanonical: true, devices: [],
    });
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient, "dev");

    await expect(api.state()).resolves.toMatchObject({ runId: "", devices: [] });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-empty run id in development", async () => {
    let release!: (value: unknown) => void;
    const request = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const pending = createTaskAssignmentApi({ request } as unknown as ApiClient, "dev").state();
    release({
      serverNow: "2026-08-19T11:00:00Z", source: "server", sourceEnvironment: "PRODUCTION",
      runId: "development-run-stale", serverCanonical: true, devices: [],
    });

    await expect(pending).rejects.toMatchObject({ message: "TASK_ASSIGNMENT_PROVENANCE_INVALID" });
  });
});
