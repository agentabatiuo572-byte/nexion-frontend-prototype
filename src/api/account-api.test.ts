import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { createAccountApi, type AccountApi } from "./account-api";

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

const nullableDeletionFields = ["reviewedAt", "completedAt", "cancelledAt", "reason", "blockReason"] as const;
const requestedDeletion = {
  requestNo: deletion.requestNo,
  status: "REQUESTED",
  version: 0,
  requestedAt: "2026-10-12 16:50:44",
};
const deletionCalls = [
  ["status", (api: AccountApi) => api.accountDeletionStatus(), { method: "GET", path: "/api/app/security/account-deletion" }],
  ["request", (api: AccountApi) => api.requestAccountDeletion("offline-password", "request-key"), {
    method: "POST", path: "/api/app/security/account-deletion",
    body: { currentPassword: "offline-password", confirmation: "DELETE" }, idempotencyKey: "request-key",
  }],
  ["cancel", (api: AccountApi) => api.cancelAccountDeletion(0, "cancel-key"), {
    method: "POST", path: "/api/app/security/account-deletion/cancel",
    body: { expectedVersion: 0, reason: "USER_REQUESTED_CANCEL" }, idempotencyKey: "cancel-key",
  }],
] as const;

describe("account deletion authority contract", () => {
  it.each(deletionCalls)("accepts omitted nullable fields for %s without changing the command", async (name, invoke, command) => {
    const payload = name === "cancel"
      ? { ...requestedDeletion, status: "CANCELLED", version: 1, cancelledAt: "2026-10-12 17:00:00" }
      : requestedDeletion;
    const response = Object.freeze({ ...payload });
    const request = vi.fn().mockResolvedValue(response);
    const result = await invoke(createAccountApi({ request } as never));
    expect(result).toEqual({
      reviewedAt: null, completedAt: null, cancelledAt: null, reason: null, blockReason: null, ...payload,
    });
    expect(response).toEqual(payload);
    expect(request).toHaveBeenCalledExactlyOnceWith(command);
  });

  it.each(nullableDeletionFields)("normalizes only the omitted %s field", async (field) => {
    const response: Record<string, unknown> = { ...deletion };
    delete response[field];
    const request = vi.fn().mockResolvedValue(response);
    expect(await createAccountApi({ request } as never).accountDeletionStatus()).toEqual({ ...deletion, [field]: null });
  });

  it.each([
    { status: "REQUESTED" },
    { status: "IN_REVIEW", reviewedAt: deletion.reviewedAt, reason: "review" },
    { status: "BLOCKED", reviewedAt: deletion.reviewedAt, blockReason: "pending obligations" },
    { status: "COMPLETED", completedAt: "2026-10-13T01:02:03Z" },
    { status: "CANCELLED", cancelledAt: "2026-10-12 17:00:00", reason: "USER_REQUESTED_CANCEL" },
  ])("preserves explicit null and valid values for $status", async (fields) => {
    const response = {
      ...requestedDeletion, reviewedAt: null, completedAt: null, cancelledAt: null, reason: null, blockReason: null, ...fields,
    };
    const request = vi.fn().mockResolvedValue(response);
    expect(await createAccountApi({ request } as never).accountDeletionStatus()).toEqual(response);
  });

  it.each<[string, unknown]>([
    ...["requestNo", "status", "version", "requestedAt"].map((field): [string, unknown] => [field, undefined]),
    ["requestNo", "ADR-invalid"], ["requestNo", 42], ["status", "UNKNOWN"], ["status", "NONE"],
    ["version", -1], ["version", 0.5], ["version", "0"], ["version", null],
    ["version", Number.NaN], ["version", Number.POSITIVE_INFINITY], ["version", Number.MAX_SAFE_INTEGER + 1],
    ["requestedAt", "not-a-date"], ["requestedAt", 0], ["requestedAt", null],
    ...["reviewedAt", "completedAt", "cancelledAt"].flatMap<[string, unknown]>((field) => [
      [field, "not-a-date"], [field, ""], [field, 0], [field, false],
    ]),
    ...["reason", "blockReason"].flatMap<[string, unknown]>((field) => [[field, 0], [field, false], [field, {}]]),
    ...nullableDeletionFields.map((field): [string, unknown] => [field, undefined]),
    ["unexpected", null], ["userId", 42],
  ])("rejects invalid deletion field %s=%s", async (field, value) => {
    const response: Record<string, unknown> = { ...requestedDeletion, [field]: value };
    if (value === undefined && !nullableDeletionFields.some((nullable) => nullable === field)) delete response[field];
    const request = vi.fn().mockResolvedValue(response);
    await expect(createAccountApi({ request } as never).accountDeletionStatus())
      .rejects.toEqual(new ApiError({ kind: "protocol", message: "ACCOUNT_DELETION_RESPONSE_INVALID" }));
  });

  it("keeps NONE exact and rejects additional fields", async () => {
    const request = vi.fn().mockResolvedValueOnce({ status: "NONE" }).mockResolvedValueOnce({ status: "NONE", reason: null });
    const api = createAccountApi({ request } as never);
    expect(await api.accountDeletionStatus()).toEqual({ status: "NONE" });
    await expect(api.accountDeletionStatus())
      .rejects.toEqual(new ApiError({ kind: "protocol", message: "ACCOUNT_DELETION_RESPONSE_INVALID" }));
  });

  it.each(deletionCalls)("preserves upstream permission and version errors for %s", async (_name, invoke) => {
    for (const error of [
      new ApiError({ kind: "auth", message: "SESSION_UNAVAILABLE", status: 403 }),
      new ApiError({ kind: "business", message: "ACCOUNT_DELETION_VERSION_CONFLICT", status: 409 }),
    ]) {
      const request = vi.fn().mockRejectedValue(error);
      await expect(invoke(createAccountApi({ request } as never))).rejects.toBe(error);
      expect(request).toHaveBeenCalledOnce();
    }
  });

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
