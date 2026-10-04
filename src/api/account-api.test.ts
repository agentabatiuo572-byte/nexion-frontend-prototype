import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { createAccountApi } from "./account-api";

const deletion = {
  requestNo: "ADR-0123456789abcdef0123456789abcdef",
  status: "IN_REVIEW",
  version: 1,
  requestedAt: "2026-08-15T01:02:03Z",
  reviewedAt: "2026-08-15T01:03:03Z",
  completedAt: null,
  reason: "review",
  blockReason: null,
  cancelledAt: null,
};

describe("account deletion authority contract", () => {
  it("keeps the security endpoint exact and encodes pagination as a query value", async () => {
    const request = vi.fn().mockResolvedValue({ twoFactorEnabled: false, passwordChangedAt: null, sessions: [], nextCursor: null });
    const api = createAccountApi({ request } as never);
    await api.securityOverview();
    await api.securityOverview("cursor&extra=1");
    expect(request).toHaveBeenNthCalledWith(1, { method: "GET", path: "/api/app/security" });
    expect(request).toHaveBeenNthCalledWith(2, { method: "GET", path: "/api/app/security?cursor=cursor%26extra%3D1" });
  });
  it("recovers a password receipt by GET without sending password input", async () => {
    const request = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ passwordChangedAt: "2026-09-05T01:02:03Z", revokedSessionCount: 2 });
    const api = createAccountApi({ request } as never);
    expect(await api.passwordCommandReceipt("password-key")).toBeNull();
    expect(await api.passwordCommandReceipt("password-key")).toMatchObject({ revokedSessionCount: 2 });
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/app/security/password/commands/password-key" });
  });
  it("retains the caller password command key for lost-response recovery", async () => {
    const request = vi.fn().mockResolvedValue({ passwordChangedAt: "2026-09-05T01:02:03Z", revokedSessionCount: 2 });
    await createAccountApi({ request } as never).changePassword("old", "new", "password-key");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "password-key" }));
  });
  it("rejects identity-bearing or unknown fields", async () => {
    const request = vi.fn().mockResolvedValue({ ...deletion, userId: 42 });
    await expect(createAccountApi({ request } as never).accountDeletionStatus())
      .rejects.toEqual(new ApiError({ kind: "protocol", message: "ACCOUNT_DELETION_RESPONSE_INVALID" }));
  });

  it("cancels with the server version and idempotency key", async () => {
    const request = vi.fn().mockResolvedValue(deletion);
    await createAccountApi({ request } as never).cancelAccountDeletion(1, "cancel-key");
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/app/security/account-deletion/cancel",
      body: { expectedVersion: 1, reason: "USER_REQUESTED_CANCEL" },
      idempotencyKey: "cancel-key",
    });
  });
});
