import { describe, expect, it } from "vitest";
import { isApiKeyRevoked, isWebhookDeleted, isWebhookEnabled, readDeveloperResourceSnapshot } from "./developer-resource-reconciliation";

describe("developer resource failure reconciliation", () => {
  const key = { id: 9, status: "ACTIVE" as const };
  const revoked = { ...key, status: "REVOKED" as const };
  const webhook = { id: 3, status: "ACTIVE" as const, deliveryEnabled: true };

  it("only confirms a revoke from an authoritative revoked status", () => {
    expect(isApiKeyRevoked([revoked], 9)).toBe(true);
    expect(isApiKeyRevoked([key], 9)).toBe(false);
    expect(isApiKeyRevoked([], 9)).toBe(false);
  });

  it("only confirms a delete when the authoritative list no longer has the webhook", () => {
    expect(isWebhookDeleted([], 3)).toBe(true);
    expect(isWebhookDeleted([webhook], 3)).toBe(false);
  });

  it("only confirms an enable or disable when both server fields match", () => {
    expect(isWebhookEnabled([webhook], 3, true)).toBe(true);
    expect(isWebhookEnabled([{ ...webhook, deliveryEnabled: false }], 3, true)).toBe(false);
    expect(isWebhookEnabled([{ ...webhook, status: "DISABLED" as const, deliveryEnabled: false }], 3, false)).toBe(true);
    expect(isWebhookEnabled([], 3, false)).toBe(false);
  });

  it("retains a canonical snapshot even when it does not confirm the requested outcome", async () => {
    await expect(readDeveloperResourceSnapshot(
      async () => [webhook], () => true, (items) => isWebhookEnabled(items, 3, false),
    )).resolves.toEqual({ items: [webhook], confirmed: false });
  });

  it("discards a read from an expired account or page scope", async () => {
    await expect(readDeveloperResourceSnapshot(
      async () => [revoked], () => false, (items) => isApiKeyRevoked(items, 9),
    )).resolves.toBeNull();
  });
});
