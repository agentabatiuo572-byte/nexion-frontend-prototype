import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { PaymentPasswordApi, PaymentPasswordState } from "@/api/payment-password-api";
vi.mock("@/api/runtime", () => ({ apiClient: {}, sessionVault: { read: () => null, subscribe: () => () => undefined } }));
import { createPaymentPasswordCoordinator, simplePaymentPassword } from "./payment-password";

const context = { amount: "0.00", currency: "USDT", summary: "Device" };
const makeState = (configured = true, version = configured ? 1 : 0): PaymentPasswordState => ({ configured, credentialVersion: version, lockedUntil: null, remainingAttempts: 5, serverTime: new Date().toISOString() });
function harness(persistence?: Parameters<typeof createPaymentPasswordCoordinator>[3]) {
  let account = "user-a"; let sequence = 0;
  const api = {
    status: vi.fn(async () => makeState()),
    setup: vi.fn(async () => ({ commandKey: "key", status: "SUCCEEDED" as const, state: makeState(), canResumeSameKey: false })),
    change: vi.fn(async () => ({ commandKey: "key", status: "SUCCEEDED" as const, state: makeState(true, 2), canResumeSameKey: false })),
    receipt: vi.fn(async () => ({ commandKey: "key", status: "SUCCEEDED" as const, state: makeState(), canResumeSameKey: false })),
    challenge: vi.fn(async () => ({ phoneMasked: "+84 *** 1234", challengeNo: "challenge", resendAfterSec: 60, expiresAt: new Date(Date.now() + 600000).toISOString() })),
    verify: vi.fn(async () => ({ resetProof: "proof", expiresAt: new Date(Date.now() + 600000).toISOString() })),
    reset: vi.fn(async () => ({ commandKey: "key", status: "SUCCEEDED" as const, state: makeState(true, 2), canResumeSameKey: false })),
  };
  const pin = createPaymentPasswordCoordinator(api as PaymentPasswordApi, () => account, () => `random-${++sequence}`, persistence);
  return { pin, api, switchAccount: () => { account = "user-b"; pin.accountChanged(); } };
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
afterEach(() => { vi.useRealTimers(); });
describe("payment password coordinator", () => {
  it("does not expose setup when the server state cannot be read", async () => {
    const { pin, api } = harness(); api.status.mockRejectedValue(new Error("offline"));
    const result = pin.request(context); await settle();
    expect(pin.ui.stage).toBe("read-error"); expect(pin.ui.state).toBeNull();
    pin.cancel(); await expect(result).resolves.toBeNull();
  });
  it("sets two matching inputs, clears them and requires a third input before authorizing", async () => {
    const { pin, api } = harness(); api.status.mockResolvedValue(makeState(false));
    const result = pin.request(context); await settle(); expect(pin.ui.stage).toBe("setup");
    pin.next("039417"); expect(pin.ui.stage).toBe("confirm");
    await pin.confirm("039418"); expect(api.setup).not.toHaveBeenCalled(); expect(pin.ui.error).toBe("mismatch");
    await pin.confirm("039417"); expect(pin.ui.stage).toBe("pay"); expect(pin.ui.visible).toBe(true);
    expect(api.setup).toHaveBeenCalledWith({ newPassword: "039417", confirmPassword: "039417", commandKey: "random-1" });
    pin.authorize("039417");
    await expect(result).resolves.toEqual({ paymentPassword: "039417", credentialVersion: 1, attemptNo: "random-2" });
    expect(pin.ui.context).toBeNull(); expect(pin.ui.visible).toBe(false);
  });
  it("keeps the original mutation command after a timeout and queries without replaying the PIN", async () => {
    const { pin, api } = harness(); api.status.mockResolvedValue(makeState(false));
    api.setup.mockRejectedValue(new ApiError({ kind: "network", message: "TIMEOUT" }));
    const result = pin.request(context); await settle(); pin.next("039417"); await pin.confirm("039417");
    expect(pin.ui.stage).toBe("pending"); await pin.query();
    expect(api.setup).toHaveBeenCalledTimes(1); expect(api.receipt).toHaveBeenCalledWith("random-1");
    expect(pin.ui.stage).toBe("pay"); pin.cancel(); await result;
  });
  it("does not turn a NOT_SEEN response into a new setup command", async () => {
    const { pin, api } = harness(); api.status.mockResolvedValue(makeState(false));
    api.setup.mockRejectedValue(new ApiError({ kind: "network", message: "TIMEOUT" }));
    api.receipt.mockResolvedValue({ commandKey: "random-1", status: "NOT_SEEN", canResumeSameKey: false } as never);
    const result = pin.request(context); await settle(); pin.next("039417"); await pin.confirm("039417"); await pin.query();
    expect(pin.ui.stage).toBe("pending"); expect(api.setup).toHaveBeenCalledTimes(1); pin.cancel(); await result;
  });
  it("ignores a late state response after cancellation or account switching", async () => {
    const { pin, api, switchAccount } = harness(); let answer!: (state: PaymentPasswordState) => void;
    api.status.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const result = pin.request(context); switchAccount(); answer(makeState(false)); await settle();
    expect(pin.ui.visible).toBe(false); expect(pin.ui.state).toBeNull(); await expect(result).resolves.toBeNull();
  });
  it("uses a fresh attempt for each newly entered payment PIN and server remaining attempts", async () => {
    const { pin, api } = harness(); const first = pin.request(context); await settle(); pin.authorize("039417");
    expect((await first)?.attemptNo).toBe("random-1");
    expect(pin.report(new ApiError({ kind: "business", status: 422, message: "PAYMENT_PASSWORD_INCORRECT" }))).toBe(true);
    api.status.mockResolvedValue({ ...makeState(), remainingAttempts: 3 });
    const second = pin.request(context); await settle(); expect(pin.ui.error).toBe("incorrect"); expect(pin.ui.state?.remainingAttempts).toBe(3);
    pin.authorize("493017"); expect((await second)?.attemptNo).toBe("random-2");
  });
  it("blocks input until a lock has been re-read even when local time reaches its deadline", async () => {
    vi.useFakeTimers(); const { pin, api } = harness();
    api.status.mockResolvedValue({ ...makeState(), lockedUntil: new Date(Date.now() + 1000).toISOString(), remainingAttempts: 0 });
    const result = pin.request(context); await settle(); vi.advanceTimersByTime(2000); pin.tick();
    pin.authorize("039417"); expect(pin.ui.visible).toBe(true);
    api.status.mockResolvedValue(makeState()); await pin.load(); pin.authorize("039417"); expect((await result)?.paymentPassword).toBe("039417");
  });
  it("recovers through the existing verified phone and clears the proof before authorizing a payment", async () => {
    const { pin, api } = harness(); const result = pin.request(context); await settle();
    await pin.startRecovery(); expect(pin.ui.challenge?.phoneMasked).toBe("+84 *** 1234"); expect(api.challenge).toHaveBeenCalledWith();
    await pin.verify("012345"); expect(pin.ui.stage).toBe("reset"); pin.next("039417"); await pin.confirm("039417");
    expect(api.reset).toHaveBeenCalledWith(expect.objectContaining({ resetProof: "proof", expectedCredentialVersion: 1 }));
    expect(pin.ui.stage).toBe("pay"); expect(pin.ui.notice).toBe("resetDonePay"); expect(pin.ui.challenge).toBeNull();
    pin.authorize("039417"); expect((await result)?.credentialVersion).toBe(2);
  });
  it("finishes a personal-center setup without asking for a payment PIN", async () => {
    const { pin, api } = harness(); api.status.mockResolvedValue(makeState(false));
    const result = pin.setup(); await settle(); pin.next("039417"); await pin.confirm("039417");
    await expect(result).resolves.toBe(true); expect(pin.ui.visible).toBe(false);
  });
  it("persists only a non-sensitive command and restores it by receipt after restart", async () => {
    let stored: unknown = null;
    const persistence = { read: () => stored, write: (value: unknown) => { stored = structuredClone(value); return true; } };
    const first = harness(persistence); first.api.status.mockResolvedValue(makeState(false));
    first.api.setup.mockRejectedValue(new ApiError({ kind: "network", message: "TIMEOUT" }));
    const waiting = first.pin.request(context); await settle(); first.pin.next("039417"); await first.pin.confirm("039417");
    expect(stored).toEqual({ commandKey: "random-1", operation: "setup" });
    expect(JSON.stringify(stored)).not.toMatch(/039417|password|proof|code/i);
    first.pin.cancel(); await waiting;
    const restarted = harness(persistence); const result = restarted.pin.request(context); await settle();
    expect(restarted.api.receipt).toHaveBeenCalledWith("random-1"); expect(restarted.api.setup).not.toHaveBeenCalled();
    expect(restarted.pin.ui.stage).toBe("pay"); expect(stored).toBeNull(); restarted.pin.cancel(); await result;
  });
  it("does not send a mutation when its recovery command cannot be persisted", async () => {
    const { pin, api } = harness({ read: () => null, write: () => false }); api.status.mockResolvedValue(makeState(false));
    const result = pin.request(context); await settle(); pin.next("039417"); await pin.confirm("039417");
    expect(api.setup).not.toHaveBeenCalled(); expect(pin.ui.error).toBe("failed"); pin.cancel(); await result;
  });
  it("does not project payment errors into the personal-center change form", async () => {
    const { pin, api } = harness(); pin.report(new ApiError({ kind: "business", message: "PAYMENT_PASSWORD_INCORRECT" }));
    const result = pin.request(context); await settle(); expect(pin.ui.error).toBe("incorrect"); expect(pin.ui.changeError).toBe(""); pin.cancel(); await result;
    api.change.mockRejectedValue(new ApiError({ kind: "business", message: "PAYMENT_PASSWORD_INCORRECT" }));
    await pin.refreshStatus(); await pin.change("930417", "493017", "493017");
    expect(pin.ui.changeError).toBe("incorrect"); expect(pin.ui.error).toBe("");
  });
  it("rejects repeated and consecutive simple values while preserving valid leading zeros", () => {
    for (const value of ["111111", "012345", "987654"]) expect(simplePaymentPassword(value)).toBe(true);
    expect(simplePaymentPassword("039417")).toBe(false);
  });
});
