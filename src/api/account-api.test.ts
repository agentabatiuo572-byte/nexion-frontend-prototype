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
