import { describe, expect, it } from "vitest";
import { createPaymentPasswordApi, parsePaymentPasswordState } from "./payment-password-api";

const state = { configured: true, credentialVersion: 1, lockedUntil: null, remainingAttempts: 5, serverTime: "2026-10-30T00:00:00Z" };
describe("payment password API boundary", () => {
  it("rejects unknown state instead of treating it as unconfigured", () => {
    for (const value of [null, {}, { ...state, configured: "true" }, { ...state, credentialVersion: 0 }, { ...state, lockedUntil: "invalid" }, { ...state, remainingAttempts: -1 }]) {
      expect(() => parsePaymentPasswordState(value)).toThrow("PAYMENT_PASSWORD_RESPONSE_INVALID");
    }
    expect(parsePaymentPasswordState({ ...state, configured: false, credentialVersion: 0 })).toMatchObject({ configured: false });
  });
  it("uses real security endpoints and never silently refreshes and replays PIN/code commands", async () => {
    const requests: any[] = [];
    const api = createPaymentPasswordApi({ request: async (request: any) => {
      requests.push(request);
      if (request.path.endsWith("/reset/challenge")) return { phoneMasked: "+84 *** 1234", challengeNo: "challenge", resendAfterSec: 60, expiresAt: "2026-10-30T00:10:00Z" };
      if (request.path.endsWith("/reset/verify")) return { resetProof: "proof", expiresAt: "2026-10-30T00:10:00Z" };
      if (!request.method) return request.path.includes("/commands/") ? { commandKey: "key", status: "SUCCEEDED", state } : state;
      return { commandKey: "key", status: "SUCCEEDED", state };
    } } as never);
    await api.status();
    await api.setup({ newPassword: "039417", confirmPassword: "039417", commandKey: "key" });
    await api.change({ currentPassword: "039417", newPassword: "493017", confirmPassword: "493017", expectedCredentialVersion: 1, attemptNo: "attempt", commandKey: "key" });
    await api.challenge(); await api.verify("challenge", "012345");
    await api.reset({ resetProof: "proof", newPassword: "493017", confirmPassword: "493017", expectedCredentialVersion: 1, commandKey: "key" });
    await api.receipt("key");
    expect(requests.every(request => request.path.startsWith("/api/app/security/payment-password"))).toBe(true);
    for (const index of [1, 2, 4, 5]) expect(requests[index].retryAfterAuth).toBe(false);
    expect(requests[1]).toMatchObject({ idempotencyKey: "key", body: { newPassword: "039417", confirmPassword: "039417" } });
    expect(requests[1].body).not.toHaveProperty("commandKey");
    expect(requests[3].body).toBeUndefined();
    expect(requests[4].body).toEqual({ challengeNo: "challenge", code: "012345" });
  });
  it("requires a server state for a successful mutation receipt", async () => {
    const api = createPaymentPasswordApi({ request: async () => ({ commandKey: "key", status: "SUCCEEDED" }) } as never);
    await expect(api.setup({ newPassword: "039417", confirmPassword: "039417", commandKey: "key" })).rejects.toMatchObject({ kind: "protocol" });
  });
});
