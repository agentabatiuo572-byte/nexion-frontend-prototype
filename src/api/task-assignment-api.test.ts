import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createTaskAssignmentApi } from "./task-assignment-api";
import { createApiClient } from "./api-client";
import { createSessionVault } from "./session-vault";

it("preserves a Spring binding rejection carried in a successful HTTP envelope", async () => {
  const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {
    code: 409, message: "TASK_ASSIGNMENT_PHONE_BINDING_INVALID", data: null,
  } });
  const client = createApiClient({ baseUrl: "https://api.example.com", vault: createSessionVault(),
    transport: { request } });
  await expect(client.request({ path: "/api/tasks/phone/runtime", authenticated: false }))
    .rejects.toMatchObject({ kind: "business", status: 200, code: 409,
      message: "TASK_ASSIGNMENT_PHONE_BINDING_INVALID" });
});

describe("task assignment server receipt projection", () => {
  it("accepts the production-shaped development projection returned by Java", async () => {
    const request = vi.fn().mockResolvedValue({
      serverNow: "2026-08-21 16:50:36",
      devices: [{
        deviceId: 811,
        instanceNo: "DEV-HOME-PHONE-60723152670",
        deviceType: "MOBILE",
        lockUntil: null,
        currentTask: null,
        recentTasks: [],
      }],
      source: "server",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
    });

    await expect(createTaskAssignmentApi({ request } as unknown as ApiClient, "dev").state())
      .resolves.toMatchObject({
        serverNow: Date.parse("2026-08-21T08:50:36Z"),
        devices: [{ deviceId: 811, recentTasks: [] }],
        sourceEnvironment: "PRODUCTION",
        runId: "",
      });
  });

  it("preserves the backend-issued receiptNo on completed assignments", async () => {
    const request = vi.fn().mockResolvedValue({
      serverNow: "2026-08-15T00:00:00Z",
      source: "server",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
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
          source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
        }],
      }],
    });
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient, "prod");
    await expect(api.state()).resolves.toMatchObject({
      devices: [{ recentTasks: [{ receiptNo: "CTR-CTA-1" }] }],
      source: "server",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/tasks/assignments" });
  });

  it("loads and validates the canonical Proof-of-Compute receipt detail", async () => {
    const request = vi.fn().mockResolvedValue({
      receiptNo: "R-CTA-1", taskNo: "CTA-1", deviceId: 7, deviceInstanceNo: "D-7",
      deviceName: "你的手机", deviceType: "MOBILE", deviceGpu: "Adreno", vramTotalGb: 8,
      taskId: "ll-1", taskName: "LLM inference", taskClass: "LL", model: "Gemma",
      client: "Gemma AI Support", rewardUsdt: 0.25, rewardNex: 0,
      earningStatus: "SETTLED", proofHash: "a".repeat(64),
      startedAt: "2026-08-14T23:59:00Z", completedAt: "2026-08-15T00:00:00Z", durationSec: 60,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient, "dev");

    await expect(api.receipt("R-CTA-1")).resolves.toMatchObject({
      receiptNo: "R-CTA-1", proofHash: "a".repeat(64), settledAt: Date.parse("2026-08-15T00:00:00Z"),
      sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/tasks/receipts/R-CTA-1" });
  });

  it("rejects a canonical receipt when the response identity differs from the requested receipt", async () => {
    const request = vi.fn().mockResolvedValue({
      receiptNo: "R-CTA-OTHER", taskNo: "CTA-OTHER", deviceId: 7, deviceInstanceNo: "D-7",
      deviceName: "你的手机", deviceType: "MOBILE", deviceGpu: "Adreno", vramTotalGb: 8,
      taskId: "ll-1", taskName: "LLM inference", taskClass: "LL", model: "Gemma",
      client: "Gemma AI Support", rewardUsdt: 0.25, rewardNex: 0,
      earningStatus: "SETTLED", proofHash: "a".repeat(64),
      startedAt: "2026-08-14T23:59:00Z", completedAt: "2026-08-15T00:00:00Z", durationSec: 60,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });

    await expect(createTaskAssignmentApi({ request } as unknown as ApiClient, "prod").receipt("R-CTA-1"))
      .rejects.toMatchObject({ kind: "protocol", message: "TASK_RECEIPT_RESPONSE_INVALID" });
  });

  it("paginates canonical Proof-of-Compute receipt summaries independently of device previews", async () => {
    const request = vi.fn().mockResolvedValue({
      items: [{
        receiptNo: "R-CTA-2", taskNo: "CTA-2", taskClass: "LL", model: "Gemma",
        client: "Gemma AI Support", rewardUsdt: 0.25, rewardNex: 0,
        earningStatus: "SETTLED", completedAt: "2026-08-15T00:00:00Z",
      }],
      nextOffset: 20,
      total: 11,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient, "dev");

    await expect(api.receipts(0, 20)).resolves.toMatchObject({
      items: [{ receiptNo: "R-CTA-2", rewardUsdt: 0.25, completedAt: Date.parse("2026-08-15T00:00:00Z") }],
      nextOffset: 20,
      total: 11,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/tasks/receipts?offset=0&limit=20" });
  });

  it("keeps the receipt total unknown when an older canonical server has not supplied it", async () => {
    const request = vi.fn().mockResolvedValue({
      items: [], nextOffset: null,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });

    await expect(createTaskAssignmentApi({ request } as unknown as ApiClient, "prod").receipts())
      .resolves.toMatchObject({ items: [], nextOffset: null, total: null });
  });

  it("sends the server-issued receipt cursor for a stable subsequent page", async () => {
    const request = vi.fn().mockResolvedValue({
      items: [], nextOffset: 40, nextCursor: "R-CTA-20", total: null,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient, "prod");

    await expect(api.receipts(20, 20, "R-CTA-20")).resolves.toMatchObject({
      nextOffset: 40,
      nextCursor: "R-CTA-20",
    });
    expect(request).toHaveBeenCalledWith({
      path: "/api/tasks/receipts?offset=20&limit=20&cursor=R-CTA-20",
    });
  });

  it("rejects an unsettled receipt summary before rendering the history list", async () => {
    const request = vi.fn().mockResolvedValue({
      items: [{
        receiptNo: "R-PENDING", taskNo: "CTA-PENDING", taskClass: "LL", model: "Gemma",
        client: "Gemma AI Support", rewardUsdt: 0.25, rewardNex: 0,
        earningStatus: "PENDING", completedAt: "2026-08-15T00:00:00Z",
      }],
      nextOffset: null,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });

    await expect(createTaskAssignmentApi({ request } as unknown as ApiClient, "prod").receipts())
      .rejects.toMatchObject({ kind: "protocol", message: "TASK_RECEIPT_PAGE_RESPONSE_INVALID" });
  });

  it("rejects a receipt whose proof or canonical provenance is missing", async () => {
    const request = vi.fn().mockResolvedValue({
      receiptNo: "R-CTA-1", taskNo: "CTA-1", deviceId: 7, deviceInstanceNo: "D-7",
      deviceName: "你的手机", deviceType: "MOBILE", deviceGpu: "Adreno", vramTotalGb: 8,
      taskId: "ll-1", taskName: "LLM inference", taskClass: "LL", model: "Gemma",
      client: "Gemma AI Support", rewardUsdt: 0.25, rewardNex: 0,
      earningStatus: "SETTLED", proofHash: "not-a-proof",
      startedAt: "2026-08-14T23:59:00Z", completedAt: "2026-08-15T00:00:00Z", durationSec: 60,
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    });

    await expect(createTaskAssignmentApi({ request } as unknown as ApiClient, "prod").receipt("R-CTA-1"))
      .rejects.toMatchObject({ kind: "protocol", message: "TASK_RECEIPT_RESPONSE_INVALID" });
  });

  it("rejects a non-canonical or non-production remote projection before consumption", async () => {
    const request = vi.fn().mockResolvedValue({
      serverNow: "2026-08-15T00:00:00Z", source: "server", sourceEnvironment: "SANDBOX",
      runId: "", serverCanonical: false, devices: [],
    });
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient, "prod");

    await expect(api.state()).rejects.toMatchObject({
      kind: "protocol", message: "TASK_ASSIGNMENT_PROVENANCE_INVALID",
    });
  });

  it("exposes read projections plus the phone telemetry report without task money mutations", () => {
    const request = vi.fn();
    const devApi = createTaskAssignmentApi({ request } as unknown as ApiClient, "dev");
    const prodApi = createTaskAssignmentApi({ request } as unknown as ApiClient, "prod");

    expect(Object.keys(devApi).sort()).toEqual(["receipt", "receipts", "reportPhoneRuntime", "state"]);
    expect(Object.keys(prodApi).sort()).toEqual(["receipt", "receipts", "reportPhoneRuntime", "state"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps a server-paused phone task without inventing a completion estimate", async () => {
    const request = vi.fn().mockResolvedValue({
      serverNow: "2026-09-26 18:00:00", source: "server", sourceEnvironment: "PRODUCTION",
      runId: "", serverCanonical: true,
      devices: [{
        deviceId: 811, instanceNo: "PHONE-811", deviceType: "MOBILE", lockUntil: null,
        recentTasks: [], currentTask: {
          taskNo: "CTA-PAUSED", deviceId: 811, taskId: "ll-1", taskName: "Inference",
          taskClass: "LL", model: "Model", client: "UVEL App", status: "PAUSED",
          rewardUsdt: 0.25, requiredSeconds: 60, startedAt: "2026-09-26 17:58:00",
          completableAt: null, completedAt: null, receiptNo: null, proofNonce: null,
          proofExpiresAt: null, source: "server", sourceEnvironment: "PRODUCTION",
          runId: "", serverCanonical: true,
        },
      }],
    });
    const projection = await createTaskAssignmentApi({ request } as unknown as ApiClient, "dev").state();
    expect(projection.devices[0]?.currentTask).toMatchObject({ status: "PAUSED", completableAt: null });
  });

  it("reports validated native phone observations without using charging as an eligibility input", async () => {
    const request = vi.fn().mockResolvedValue(null);
    const api = createTaskAssignmentApi({ request } as unknown as ApiClient, "dev");
    await api.reportPhoneRuntime("local-install-abc", 19, true, false);
    expect(request).toHaveBeenCalledWith({
      path: "/api/tasks/phone/runtime", method: "POST",
      body: { calibrationDeviceId: "local-install-abc", batteryLevel: 19, networkReachable: true, isCharging: false },
    });
    await api.reportPhoneRuntime("local-install-abc", 19, true, null);
    expect(request).toHaveBeenLastCalledWith({
      path: "/api/tasks/phone/runtime", method: "POST",
      body: { calibrationDeviceId: "local-install-abc", batteryLevel: 19, networkReachable: true, isCharging: null },
    });
    await api.reportPhoneRuntime("local-install-abc", null, false, null);
    expect(request).toHaveBeenLastCalledWith({
      path: "/api/tasks/phone/runtime", method: "POST",
      body: { calibrationDeviceId: "local-install-abc", batteryLevel: null, networkReachable: false, isCharging: null },
    });
    await expect(api.reportPhoneRuntime("local-install-abc", null, true, null)).rejects.toMatchObject({
      kind: "configuration", message: "PHONE_RUNTIME_SIGNALS_INVALID",
    });
    await expect(api.reportPhoneRuntime("local-install-abc", -1, true, false)).rejects.toMatchObject({
      kind: "configuration", message: "PHONE_RUNTIME_SIGNALS_INVALID",
    });
    await expect(api.reportPhoneRuntime("", 19, true, false)).rejects.toMatchObject({
      kind: "configuration", message: "PHONE_RUNTIME_SIGNALS_INVALID",
    });
    await expect(api.reportPhoneRuntime("other device", 19, true, false)).rejects.toMatchObject({
      kind: "configuration", message: "PHONE_RUNTIME_SIGNALS_INVALID",
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
