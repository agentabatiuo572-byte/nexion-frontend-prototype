import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDeveloperResourcesApi } from "./developer-resources-api";

describe("developer resources API", () => {
  it("does not expose API-key creation before the OpenAPI capability is released", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce([{ id: 1, keyId: "key-1", name: "build", prefix: "sk_live_abc", last4: "wxyz", status: "ACTIVE", source: "server", sourceEnvironment: "PRODUCTION", runId: "", createdAt: "2026-08-16T00:00:00Z" }]);
    const api = createDeveloperResourcesApi({ request } as unknown as ApiClient);
    await expect(api.listKeys()).resolves.toHaveLength(1);
    expect(api).not.toHaveProperty("createKey");
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ path: "/api/app/developer/api-keys" }));
  });

  it("rejects malformed webhook response instead of showing success", async () => {
    const request = vi.fn().mockResolvedValue([{ id: 1, name: "hook", url: "http://127.0.0.1", events: ["order.updated"], status: "ACTIVE", deliveryStatus: "NOT_DELIVERED", deliveryEnabled: false, source: "local" }]);
    await expect(createDeveloperResourcesApi({ request } as unknown as ApiClient).listWebhooks()).rejects.toMatchObject({ message: "DEVELOPER_WEBHOOK_RESPONSE_INVALID" });
  });

  it("carries stable idempotency keys on every remote mutation", async () => {
    const key = { id: 1, keyId: "key-1", name: "build", prefix: "sk_live_abc", last4: "wxyz", status: "REVOKED", source: "server", sourceEnvironment: "PRODUCTION", runId: "", createdAt: "2026-08-16T00:00:00Z" };
    const hook = { id: 2, name: "hook", url: "http://127.0.0.1", events: ["order.updated"], status: "ACTIVE", deliveryStatus: "NOT_DELIVERED", deliveryEnabled: false, source: "server", sourceEnvironment: "PRODUCTION", runId: "", createdAt: "2026-08-16T00:00:00Z" };
    const request = vi.fn().mockResolvedValueOnce(key).mockResolvedValueOnce(hook).mockResolvedValueOnce(hook).mockResolvedValueOnce(undefined);
    const api = createDeveloperResourcesApi({ request } as unknown as ApiClient);
    await api.revokeKey(1, "idem-revoke");
    await api.createWebhook({ name: "hook", url: hook.url, events: hook.events }, "idem-create");
    await api.updateWebhook(2, { name: "hook", url: hook.url, events: hook.events, rotateSecret: true }, "idem-rotate");
    await api.deleteWebhook(2, "idem-delete");
    expect(request.mock.calls.map(([input]) => input.idempotencyKey)).toEqual(["idem-revoke", "idem-create", "idem-rotate", "idem-delete"]);
  });

  it("accepts server delivery states instead of treating every endpoint as NOT_DELIVERED", async () => {
    const request = vi.fn().mockResolvedValue([{ id: 2, name: "hook", url: "https://hooks.example.com", events: ["order.updated"], status: "ACTIVE", deliveryStatus: "SUCCEEDED", deliveryEnabled: true, source: "server", sourceEnvironment: "PRODUCTION", runId: "", createdAt: "2026-08-17T00:00:00Z" }]);
    await expect(createDeveloperResourcesApi({ request } as unknown as ApiClient).listWebhooks()).resolves.toMatchObject([{ deliveryStatus: "SUCCEEDED", deliveryEnabled: true }]);
  });

  it("uses the existing enable, delivery-history, and standalone secret-rotation endpoints", async () => {
    const hook = { id: 2, name: "hook", url: "https://hooks.example.com", events: ["order.updated"], status: "DISABLED", deliveryStatus: "RETRYING", deliveryEnabled: false, source: "server", sourceEnvironment: "PRODUCTION", runId: "", createdAt: "2026-08-17T00:00:00Z" };
    const delivery = { id: 11, eventId: "event-1", eventType: "order.updated", status: "RETRYING", attemptCount: 2, maxAttempts: 5, lastStatusCode: 503, lastError: "DELIVERY_HTTP_503", nextRetryAt: "2026-08-17T00:01:00Z", createdAt: "2026-08-17T00:00:00Z", updatedAt: "2026-08-17T00:00:30Z" };
    const request = vi.fn().mockResolvedValueOnce({ items: [delivery], hasMore: false, nextCursor: null }).mockResolvedValueOnce({ ...hook, status: "ACTIVE", deliveryEnabled: true }).mockResolvedValueOnce({ ...hook, secret: "whsec_once" });
    const api = createDeveloperResourcesApi({ request } as unknown as ApiClient);

    await expect(api.listWebhookDeliveries(2)).resolves.toEqual([delivery]);
    await expect(api.setWebhookEnabled(2, true, "idem-enable")).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(api.rotateWebhookSecret(2, "idem-rotate")).resolves.toMatchObject({ secret: "whsec_once" });

    expect(request.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({ path: "/api/app/developer/webhooks/2/deliveries?limit=100" }),
      expect.objectContaining({ path: "/api/app/developer/webhooks/2/enable", method: "POST", idempotencyKey: "idem-enable" }),
      expect.objectContaining({ path: "/api/app/developer/webhooks/2/rotate-secret", method: "POST", idempotencyKey: "idem-rotate" }),
    ]);
  });

  it("rejects malformed delivery history rather than rendering untrusted retry details", async () => {
    const request = vi.fn().mockResolvedValue([{ id: 11, eventId: "event-1", eventType: "order.updated", status: "RETRYING", attemptCount: -1 }]);
    await expect(createDeveloperResourcesApi({ request } as unknown as ApiClient).listWebhookDeliveries(2)).rejects.toMatchObject({ message: "DEVELOPER_WEBHOOK_DELIVERY_RESPONSE_INVALID" });
  });

  it("walks stable delivery cursors until the complete webhook history is loaded", async () => {
    const delivery = { id: 11, eventId: "event-1", eventType: "order.updated", status: "SUCCEEDED", attemptCount: 1, maxAttempts: 5, lastStatusCode: 204, lastError: null, nextRetryAt: "2026-08-17T00:01:00Z", createdAt: "2026-08-17T00:00:00Z", updatedAt: "2026-08-17T00:00:30Z" };
    const older = { ...delivery, id: 10, eventId: "event-0" };
    const request = vi.fn()
      .mockResolvedValueOnce({ items: [delivery], hasMore: true, nextCursor: "11" })
      .mockResolvedValueOnce({ items: [older], hasMore: false, nextCursor: null });

    await expect(createDeveloperResourcesApi({ request } as unknown as ApiClient).listWebhookDeliveries(2))
      .resolves.toEqual([delivery, older]);
    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      "/api/app/developer/webhooks/2/deliveries?limit=100",
      "/api/app/developer/webhooks/2/deliveries?limit=100&beforeId=11",
    ]);
  });
});
