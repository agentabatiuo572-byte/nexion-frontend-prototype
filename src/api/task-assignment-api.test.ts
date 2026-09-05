import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTaskAssignmentApi } from "./task-assignment-api";

describe("task assignment server receipt projection", () => {
  it("preserves the backend-issued receiptNo on completed assignments", async () => {
    const request = vi.fn().mockResolvedValue({
      serverNow: "2026-08-15T00:00:00Z",
      source: "nx_task_assignment",
      devices: [{
        deviceId: 7, instanceNo: "D-7", deviceType: "GPU", lockUntil: null,
        currentTask: null,
        recentTasks: [{
          taskNo: "CTA-1", deviceId: 7, taskId: "ig-1", taskName: "Image Gen",
          taskClass: "IG", model: "Flux", client: "Mosaic", status: "COMPLETED",
          rewardUsdt: 0.25, requiredSeconds: 60,
          startedAt: "2026-08-14T23:58:00Z", completableAt: "2026-08-14T23:59:00Z",
          completedAt: "2026-08-15T00:00:00Z", receiptNo: "CTR-CTA-1",
          proofNonce: null, proofExpiresAt: null,
        }],
      }],
    });
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient);
    await expect(api.state()).resolves.toMatchObject({
      devices: [{ recentTasks: [{ receiptNo: "CTR-CTA-1" }] }],
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/tasks/assignments" });
  });
});
