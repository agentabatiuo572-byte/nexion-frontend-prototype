import { describe, expect, test, vi } from "vitest";
import { createBankWithdrawalApi, hasVerifiedBankIdentity, parseBankQuote, parseBankRecovery } from "./bank-withdrawal-api";
import { createWithdrawalApi, toCanonicalWithdrawal } from "./withdrawal-api";

const quote = {
  quoteNo: "BQ-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", amountUsdt: "100.000000", feeUsdt: "1.000000", netUsdt: "99.000000",
  rateVnd: "25000.000000", amountVnd: "2475000", bankCode: "VCB", bankName: "Vietcombank", maskedAccount: "****6789",
  expiresAt: "2026-09-15T10:05:00Z",
};
const receipt = { state: "COMMITTED", withdrawalNo: "WD-TEST", withdrawal: { withdrawalNo: "WD-TEST", chain: "BANK-VND", status: "SENT" }, providerState: "PENDING", bank: quote };
describe("bank withdrawal server contract", () => {
  test("binding rejects a receipt for another bank/account and never accepts an unmasked recipient", async () => {
    const saved = { bankCode: "", bankName: "BANKQR", maskedAccount: "****6789", effectiveAt: "2026-09-17T00:00:00Z", nextChangeAt: "2026-09-23T00:00:00Z", canWithdraw: true };
    const body = { bankCode: "", account: "00123456789", holder: "NGUYEN VAN A", accountRoutingConfirmed: true as const };
    const request = vi.fn().mockResolvedValue({ beneficiary: saved });
    const api = createBankWithdrawalApi({ request } as never);
    await expect(api.bind(body, "bind-test")).resolves.toMatchObject({ ...saved, canWithdraw: false });
    for (const invalid of [{ ...saved, bankCode: "ACB" }, { ...saved, maskedAccount: "****1234" }, { ...saved, maskedAccount: "00123456789" }]) {
      request.mockResolvedValue({ beneficiary: invalid });
      await expect(api.bind(body, "bind-test")).rejects.toThrow("BANK_WITHDRAWAL_RESPONSE_INVALID");
    }
  });
  test("replacement SMS accepts only the dedicated challenge with bounded expiry and resend delay", async () => {
    const receipt={challengeNo:"PAYOUT-BANK-"+"a".repeat(32),expiresInSeconds:300,retryAfterSeconds:60};
    const request=vi.fn().mockResolvedValue(receipt), api=createBankWithdrawalApi({request} as never);
    await expect(api.sendOtp()).resolves.toEqual(receipt);
    expect(request).toHaveBeenCalledWith({path:"/api/withdrawals/bank/beneficiary/otp",method:"POST",authenticated:true});
    for(const invalid of [{...receipt,challengeNo:"PAYOUT-other"},{...receipt,expiresInSeconds:0},{...receipt,retryAfterSeconds:0}]) {
      request.mockResolvedValue(invalid); await expect(api.sendOtp()).rejects.toThrow("BANK_WITHDRAWAL_RESPONSE_INVALID");
    }
  });
  test("placeholder BANKQR quotes remain readable for recovery, but not a verified bank identity", async () => {
    expect(parseBankQuote({ ...quote, bankCode: "", bankName: "BANKQR" }).bankCode).toBe("");
    expect(hasVerifiedBankIdentity({ bankCode: "", bankName: "BANKQR", bankRoutingVerified: true })).toBe(false);
    expect(hasVerifiedBankIdentity({ bankCode: "", bankName: "ACCOUNT_ROUTED" })).toBe(false);
    expect(hasVerifiedBankIdentity({ bankCode: "", bankName: "ACCOUNT_ROUTED", bankRoutingVerified: true })).toBe(true);
    expect(hasVerifiedBankIdentity({ bankCode: "VCB", bankName: "ACCOUNT_ROUTED", bankRoutingVerified: true })).toBe(false);
    expect(hasVerifiedBankIdentity({ bankCode: "VCB", bankName: "BANKQR", bankRoutingVerified: true })).toBe(false);
    expect(hasVerifiedBankIdentity({ bankCode: "VCB", bankName: "Vietcombank" })).toBe(false);
    expect(hasVerifiedBankIdentity({ bankCode: "VCB", bankName: "Vietcombank", bankRoutingVerified: true })).toBe(true);
    for (const bankCode of [null, undefined, " ", 0]) expect(() => parseBankQuote({ ...quote, bankCode })).toThrow();
    const request = vi.fn().mockResolvedValue({ enabled: false, banks: [], beneficiary: null });
    const api = createBankWithdrawalApi({ request } as never);
    expect(await api.config()).toMatchObject({ bankCodeRequired: true, bindingOtpRequired: true });
    request.mockResolvedValue({ enabled: false, banks: [], beneficiary: null, bankCodeRequired: false, bindingOtpRequired: false, payType: "BANKQR" });
    expect(await api.config()).toMatchObject({ bankCodeRequired: false, bindingOtpRequired: false, payType: "BANKQR", bankRoutingVerified: false });
    request.mockResolvedValue({ enabled: false, banks: [], beneficiary: null, bankRoutingVerified: true });
    expect(await api.config()).toMatchObject({ bankRoutingVerified: true });
    request.mockResolvedValue({ enabled: true, banks: [], beneficiary: { bankCode: "", bankName: "BANKQR", maskedAccount: "****6789",
      effectiveAt: "2026-09-17T00:00:00Z", nextChangeAt: "2026-09-23T00:00:00Z", canWithdraw: true }, unresolvedIntent: null });
    expect(await api.config()).toMatchObject({ beneficiary: { canWithdraw: false }, unresolvedIntent: null });
    request.mockResolvedValue({ enabled: true, banks: [], beneficiary: { bankCode: "", bankName: "ACCOUNT_ROUTED", maskedAccount: "****6789",
      effectiveAt: "2026-09-17T00:00:00Z", nextChangeAt: "2026-09-23T00:00:00Z", canWithdraw: true, bankRoutingVerified: true }, unresolvedIntent: null });
    expect(await api.config()).toMatchObject({ beneficiary: { canWithdraw: true }, unresolvedIntent: null });
    expect(parseBankQuote({ ...quote, bankCode: "", bankName: "ACCOUNT_ROUTED", bankRoutingVerified: true })).toMatchObject({ bankCode: "", bankRoutingVerified: true });
  });
  test("rejects a contradictory bank routing contract instead of treating it as an older server", async () => {
    const response = { enabled: true, banks: [], beneficiary: null, bankCodeRequired: false, bindingOtpRequired: false, payType: "BANKQR" };
    const request = vi.fn().mockResolvedValue(response);
    const api = createBankWithdrawalApi({ request } as never);
    await expect(api.config()).resolves.toMatchObject({ bankSelection: undefined });
    request.mockResolvedValue({ ...response, bankSelection: "ACCOUNT_ROUTED" });
    await expect(api.config()).resolves.toMatchObject({ bankSelection: "ACCOUNT_ROUTED" });
    for (const bankSelection of ["USER_SELECTED", "", null]) {
      request.mockResolvedValue({ ...response, bankSelection });
      await expect(api.config()).rejects.toThrow("BANK_WITHDRAWAL_RESPONSE_INVALID");
    }
  });
  test("keeps VND integer amount separate from the USDT balance debit", () => {
    expect(parseBankQuote(quote)).toMatchObject({ amountUsdt: 100, feeUsdt: 1, netUsdt: 99, amountVnd: 2475000 });
    for (const bad of [{ ...quote, netUsdt: 100 }, { ...quote, amountVnd: 2475000.1 }, { ...quote, feeUsdt: true }, { ...quote, rateVnd: 0 }]) {
      expect(() => parseBankQuote(bad)).toThrow("BANK_WITHDRAWAL_RESPONSE_INVALID");
    }
  });
  test("acceptance and processing are not successful bank receipt", () => {
    expect(parseBankRecovery(receipt)).toMatchObject({ status: "SENT", providerState: "PENDING" });
    expect(() => parseBankRecovery({ ...receipt, withdrawal: { ...receipt.withdrawal, chain: "USDT-TRC20" } })).toThrow();
    expect(() => parseBankRecovery({ ...receipt, providerState: "UNKNOWN_NEW_STATUS" })).toThrow();
  });
  test("exact receipt APIs reject another order or quote instead of clearing pending proof", async () => {
    const request = vi.fn().mockResolvedValue(receipt);
    const api = createBankWithdrawalApi({ request } as never);
    await expect(api.get("WD-OTHER")).rejects.toThrow("BANK_WITHDRAWAL_RESPONSE_INVALID");
    await expect(api.recover("BQ-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).rejects.toThrow("BANK_WITHDRAWAL_RESPONSE_INVALID");
    await expect(api.submit("BQ-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "stable-key")).rejects.toThrow("BANK_WITHDRAWAL_RESPONSE_INVALID");
  });
  test("cancellation is a server-side fence, and a committed order wins the race", async () => {
    const request = vi.fn().mockResolvedValueOnce({ state: "ABANDONED" }).mockResolvedValueOnce(receipt);
    const api = createBankWithdrawalApi({ request } as never);
    await expect(api.abandon(quote.quoteNo)).resolves.toEqual({ state: "ABANDONED" });
    expect(request).toHaveBeenCalledWith({ path: `/api/withdrawals/bank/quotes/${quote.quoteNo}/abandon`, method: "POST", authenticated: true });
    await expect(api.abandon(quote.quoteNo)).resolves.toMatchObject({ withdrawalNo: "WD-TEST", state: "COMMITTED" });
  });
  test("bank manual-review rows coexist with crypto history without declaring a refund", async () => {
    const row = {
      withdrawalNo: "WD-TEST", targetAddress: "BANK-VND:BNK-fixture", amount: 100, chain: "BANK-VND", status: "TX_ORPHANED",
      holdUntil: "2026-09-15T10:00:00Z", createdAt: "2026-09-15T09:00:00Z", networkConfirmUsd: 1, networkFee: 1,
      penaltyFee: 0, grossFee: 1, nexBurned: 0, feeWaived: 0, actualFee: 1, netReceive: 99,
      policyVersion: "p1", useNexFeeOffset: false, riskRoute: "manual", idSource: "server",
    };
    const api = createWithdrawalApi({ request: async () => ({ source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION",
      withdrawals: [row], page: { pageNum: 1, pageSize: 50, total: 1, hasMore: false } }) } as never);
    const [bank] = await api.list();
    expect(toCanonicalWithdrawal(bank, row.targetAddress)).toMatchObject({ network: "BANK-VND", status: "frozen" });
  });
});
