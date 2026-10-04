import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import { parseServerTimestamp } from "./server-time";

export interface BankBeneficiary {
  bankCode: string; bankName: string; maskedAccount: string; effectiveAt: string; nextChangeAt: string;
  beneficiaryNo?: string; canWithdraw?: boolean; bankRoutingVerified?: boolean;
}
export interface BankIntent {
  state: "NOT_SUBMITTED" | "COMMITTED"; quoteNo: string; withdrawalNo: string | null;
  expiresAt: string; providerState: string | null;
}
export interface BankUnresolvedIntent {
  state: "NOT_SUBMITTED" | "COMMITTED" | "MULTIPLE"; intents: BankIntent[];
  quoteNo: string | null; withdrawalNo: string | null;
}
export interface BankConfig {
  enabled: boolean; banks: { code: string; name: string }[]; beneficiary: BankBeneficiary | null;
  bankCodeRequired?: boolean; bindingOtpRequired?: boolean; payType?: string;
  bankRoutingVerified?: boolean;
  // The provider routes by receiving account number, so the user cannot choose a bank.
  // ACCOUNT_ROUTED means "submit the account only; the bank is identified at payout".
  bankSelection?: "ACCOUNT_ROUTED"; bankSelectionNotice?: string; bankNameSource?: string;
  // undefined means an older server has not proved there is no unresolved intent.
  unresolvedIntent?: BankUnresolvedIntent | null;
  policy?: BankWithdrawalPolicy;
  capacity?: BankWithdrawalCapacity;
}
export interface BankWithdrawalPolicy {
  version: number; minAmountUsd: number; maxAmountUsd: number;
  feeRatePct: number; feeMinUsd: number; feeMaxUsd: number;
}
export interface BankWithdrawalCapacity {
  maxWithdrawableUsdt: number; dailyRemainingCount: number; dailyLimitCount: number;
  dailyCountResetAt: string; withdrawalEnabled: boolean;
}
export interface BankQuote {
  quoteNo: string; amountUsdt: number; feeUsdt: number; netUsdt: number; rateVnd: number;
  amountVnd: number; bankCode: string; bankName: string; maskedAccount: string; expiresAt: string;
  bankRoutingVerified?: boolean;
}
export interface BankSettlementEvidence {
  status: "unconfirmed" | "paid" | "refunded" | "review_required"; evidenceRef: string | null;
  providerOrderId: string | null; providerStatus: number | null; checkedAt: string | null; amountUsdt: number | null;
}
export interface BankOrder { state: "COMMITTED"; withdrawalNo: string; status: string; providerState: string; bank: BankQuote; settlementEvidence?: BankSettlementEvidence }
export type BankRecovery = BankOrder | { state: "NOT_SUBMITTED"; quote: BankQuote } | { state: "ABANDONED" | "EXPIRED" };
const invalid = () => new ApiError({ kind: "protocol", message: "BANK_WITHDRAWAL_RESPONSE_INVALID" });
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw invalid(); return value; }
function bankCode(value: unknown): string { if (typeof value !== "string" || !/^(?:[A-Za-z0-9]{2,16})?$/.test(value)) throw invalid(); return value; }
/** A server-confirmed payout routing contract, not verification of a bank or account holder. */
export function hasVerifiedBankIdentity(bank: { bankCode: string; bankName: string; bankRoutingVerified?: boolean }): boolean {
  if (bank.bankRoutingVerified !== true) return false;
  if (!bank.bankCode.trim()) return bank.bankName === "ACCOUNT_ROUTED";
  return bank.bankCode.trim().toUpperCase() !== "BANKQR"
    && !!bank.bankName.trim() && !["BANKQR", "ACCOUNT_ROUTED"].includes(bank.bankName.trim().toUpperCase());
}
function number(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw invalid();
  const n = Number(value); if (!Number.isFinite(n) || n < 0) throw invalid(); return n;
}
function date(value: unknown): string {
  const s = text(value); if (parseServerTimestamp(s) == null) throw invalid(); return s;
}
function optionalText(value: unknown): string | null { return value == null ? null : text(value); }
function optionalDate(value: unknown): string | null { return value == null ? null : date(value); }
function optionalEvidence<T>(read: () => T): T | undefined {
  try { return read(); } catch (error) {
    if (error instanceof ApiError && error.kind === "protocol") return undefined;
    throw error;
  }
}
function usdt(value: unknown): number {
  if (typeof value === "string" && !/^\d+(?:\.\d{1,6})?$/.test(value.trim())) throw invalid();
  const amount = number(value);
  if (amount > Number.MAX_SAFE_INTEGER / 1e6 || Number(amount.toFixed(6)) !== amount) throw invalid();
  return amount;
}
function option<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}
function beneficiary(value: unknown): BankBeneficiary {
  const r = record(value);
  if (typeof r.maskedAccount !== "string" || !/^[*•]{2,}[0-9]{4}$/.test(r.maskedAccount)) throw invalid();
  const identity = { bankCode: bankCode(r.bankCode), bankName: text(r.bankName), bankRoutingVerified: r.bankRoutingVerified === true };
  return { ...identity, maskedAccount: text(r.maskedAccount),
    effectiveAt: date(r.effectiveAt), nextChangeAt: date(r.nextChangeAt),
    beneficiaryNo: optionalText(r.beneficiaryNo) ?? undefined,
    canWithdraw: r.canWithdraw === true && hasVerifiedBankIdentity(identity) };
}
function policy(value: unknown): BankWithdrawalPolicy {
  const r = record(value);
  const p = { version: number(r.version), minAmountUsd: usdt(r.minAmountUsd), maxAmountUsd: usdt(r.maxAmountUsd),
    feeRatePct: number(r.feeRatePct), feeMinUsd: usdt(r.feeMinUsd), feeMaxUsd: usdt(r.feeMaxUsd) };
  if (!Number.isSafeInteger(p.version) || p.maxAmountUsd <= 0 || p.minAmountUsd > p.maxAmountUsd
      || p.feeRatePct > 5 || p.feeMinUsd > p.feeMaxUsd) throw invalid();
  return p;
}
function capacity(value: unknown): BankWithdrawalCapacity {
  const r = record(value);
  const c = { maxWithdrawableUsdt: usdt(r.maxWithdrawableUsdt), dailyRemainingCount: number(r.dailyRemainingCount),
    dailyLimitCount: number(r.dailyLimitCount), dailyCountResetAt: date(r.dailyCountResetAt), withdrawalEnabled: r.withdrawalEnabled === true };
  if (typeof r.withdrawalEnabled !== "boolean" || !Number.isSafeInteger(c.dailyRemainingCount)
      || !Number.isSafeInteger(c.dailyLimitCount) || c.dailyLimitCount < 1 || c.dailyRemainingCount > c.dailyLimitCount) throw invalid();
  return c;
}
export function parseBankUnresolvedIntent(value: unknown): BankUnresolvedIntent | null {
  if (value === null) return null;
  const r = record(value);
  if (!["NOT_SUBMITTED", "COMMITTED", "MULTIPLE"].includes(String(r.state)) || !Array.isArray(r.intents) || !r.intents.length) throw invalid();
  const intents: BankIntent[] = r.intents.map(item => {
    const i = record(item), quoteNo = text(i.quoteNo), withdrawalNo = optionalText(i.withdrawalNo);
    if (!/^BQ-[a-f0-9]{32}$/.test(quoteNo) || !["NOT_SUBMITTED", "COMMITTED"].includes(String(i.state))
      || (i.state === "COMMITTED" ? !withdrawalNo || !/^WD-[A-Z0-9]+$/.test(withdrawalNo) : withdrawalNo !== null)) throw invalid();
    return { state: i.state as BankIntent["state"], quoteNo, withdrawalNo, expiresAt: date(i.expiresAt), providerState: optionalText(i.providerState) };
  });
  const quoteNo = optionalText(r.quoteNo), withdrawalNo = optionalText(r.withdrawalNo);
  if (r.state === "MULTIPLE" ? intents.length < 2 || quoteNo !== null || withdrawalNo !== null
    : intents.length !== 1 || intents[0].state !== r.state || intents[0].quoteNo !== quoteNo || intents[0].withdrawalNo !== withdrawalNo) throw invalid();
  return { state: r.state as BankUnresolvedIntent["state"], intents, quoteNo, withdrawalNo };
}
function settlement(value: unknown): BankSettlementEvidence | undefined {
  if (value == null) return undefined;
  return optionalEvidence(() => {
  const r = record(value);
  if (r.providerStatus != null && (typeof r.providerStatus !== "number" || !Number.isInteger(r.providerStatus))) throw invalid();
  return { status: option(r.status, ["unconfirmed", "paid", "refunded", "review_required"], "review_required"),
    evidenceRef: optionalText(r.evidenceRef), providerOrderId: optionalText(r.providerOrderId),
    providerStatus: r.providerStatus == null ? null : number(r.providerStatus), checkedAt: optionalDate(r.checkedAt),
    amountUsdt: r.amountUsdt == null ? null : usdt(r.amountUsdt) };
  });
}
export function parseBankQuote(value: unknown): BankQuote {
  const r = record(value);
  const q: BankQuote = { quoteNo: text(r.quoteNo), amountUsdt: usdt(r.amountUsdt), feeUsdt: usdt(r.feeUsdt),
    netUsdt: usdt(r.netUsdt), rateVnd: number(r.rateVnd), amountVnd: number(r.amountVnd), bankCode: bankCode(r.bankCode),
    bankName: text(r.bankName), maskedAccount: text(r.maskedAccount), expiresAt: date(r.expiresAt),
    bankRoutingVerified: r.bankRoutingVerified === true };
  if (!/^BQ-[a-f0-9]{32}$/.test(q.quoteNo) || q.amountUsdt <= 0 || q.netUsdt <= 0 || q.rateVnd <= 0
      || !Number.isSafeInteger(q.amountVnd) || q.amountVnd <= 0
      || Math.round(q.amountUsdt * 1e6) !== Math.round(q.feeUsdt * 1e6) + Math.round(q.netUsdt * 1e6)) throw invalid();
  return q;
}
export function parseBankRecovery(value: unknown): BankRecovery {
  const r = record(value);
  if (r.state === "ABANDONED" || r.state === "EXPIRED") return { state: r.state };
  if (r.state === "NOT_SUBMITTED") return { state: "NOT_SUBMITTED", quote: parseBankQuote(r.quote) };
  const withdrawal = record(r.withdrawal);
  const no = text(r.withdrawalNo);
  if (r.state !== "COMMITTED" || !/^WD-[A-Z0-9]+$/.test(no) || withdrawal.withdrawalNo !== no || withdrawal.chain !== "BANK-VND") throw invalid();
  const status = text(withdrawal.status);
  if (!["REVIEW_PENDING", "REVIEWING", "REVIEW_PASSED", "DELAYED", "EXTENDED_HOLD", "FROZEN", "PROCESSING", "SENT", "TX_ORPHANED", "CONFIRMED", "FAILED", "REFUNDED", "REVIEW_REJECTED"].includes(status)) throw invalid();
  const providerState = text(r.providerState);
  if (!["READY", "DISPATCHING", "PENDING", "PAID", "FAILED", "MANUAL_REVIEW"].includes(providerState)) throw invalid();
  return { state: "COMMITTED", withdrawalNo: no, status, providerState, bank: parseBankQuote(r.bank), settlementEvidence: settlement(r.settlementEvidence) };
}
function forQuote(value: BankRecovery, quoteNo: string): BankRecovery {
  if (value.state === "COMMITTED" && value.bank.quoteNo !== quoteNo) throw invalid();
  if (value.state === "NOT_SUBMITTED" && value.quote.quoteNo !== quoteNo) throw invalid();
  return value;
}
export function createBankWithdrawalApi(client: ApiClient) {
  const base = "/api/withdrawals/bank";
  return {
    async config(): Promise<BankConfig> {
      const r = record(await client.request({ path: `${base}/config`, authenticated: true }));
      if (typeof r.enabled !== "boolean" || !Array.isArray(r.banks)) throw invalid();
      if (r.bankSelection !== undefined && r.bankSelection !== "ACCOUNT_ROUTED") throw invalid();
      return { enabled: r.enabled, banks: r.banks.map(v => { const b = record(v); return { code: text(b.code), name: text(b.name) }; }),
        bankCodeRequired: r.bankCodeRequired !== false, bindingOtpRequired: r.bindingOtpRequired !== false,
        payType: typeof r.payType === "string" ? r.payType : undefined,
        bankRoutingVerified: r.bankRoutingVerified === true,
        // Absent on older servers: undefined keeps the page from claiming a routing contract
        // the backend has not confirmed.
        bankSelection: r.bankSelection === "ACCOUNT_ROUTED" ? "ACCOUNT_ROUTED" : undefined,
        bankSelectionNotice: typeof r.bankSelectionNotice === "string" ? r.bankSelectionNotice : undefined,
        bankNameSource: typeof r.bankNameSource === "string" ? r.bankNameSource : undefined,
        policy: optionalEvidence(() => policy(r.policy)), capacity: optionalEvidence(() => capacity(r.capacity)),
        unresolvedIntent: r.unresolvedIntent === undefined ? undefined : parseBankUnresolvedIntent(r.unresolvedIntent),
        beneficiary: r.beneficiary == null ? null : beneficiary(r.beneficiary) };
    },
    async sendOtp(): Promise<{ challengeNo: string; expiresInSeconds: number; retryAfterSeconds: number }> {
      const r = record(await client.request({ path: `${base}/beneficiary/otp`, method: "POST", authenticated: true }));
      const challengeNo = text(r.challengeNo), expiresInSeconds = number(r.expiresInSeconds), retryAfterSeconds = number(r.retryAfterSeconds);
      if (!/^PAYOUT-BANK-[a-f0-9]{32}$/i.test(challengeNo) || !Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > 300
        || !Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 60 || retryAfterSeconds > 86400) throw invalid();
      return { challengeNo, expiresInSeconds, retryAfterSeconds };
    },
    async bind(body: { bankCode: string; account: string; holder: string; accountRoutingConfirmed: true; challengeNo?: string; code?: string }, key: string): Promise<BankBeneficiary> {
      const r = record(await client.request({ path: `${base}/beneficiary`, method: "POST", body, idempotencyKey: key, authenticated: true }));
      const saved = beneficiary(r.beneficiary);
      if (saved.bankCode !== body.bankCode || !saved.maskedAccount.endsWith(body.account.slice(-4))) throw invalid();
      return saved;
    },
    async quote(amountUsdt: string): Promise<BankQuote> {
      return parseBankQuote(await client.request({ path: `${base}/quotes`, method: "POST", body: { amountUsdt }, authenticated: true }));
    },
    async submit(quoteNo: string, key: string): Promise<BankOrder> {
      const r = parseBankRecovery(await client.request({ path: `${base}/orders`, method: "POST", body: { quoteNo }, idempotencyKey: key, authenticated: true }));
      if (r.state !== "COMMITTED" || r.bank.quoteNo !== quoteNo) throw invalid(); return r;
    },
    async recover(quoteNo: string): Promise<BankRecovery> {
      return forQuote(parseBankRecovery(await client.request({ path: `${base}/quotes/${encodeURIComponent(quoteNo)}`, authenticated: true })), quoteNo);
    },
    async abandon(quoteNo: string): Promise<BankRecovery> {
      return forQuote(parseBankRecovery(await client.request({ path: `${base}/quotes/${encodeURIComponent(quoteNo)}/abandon`, method: "POST", authenticated: true })), quoteNo);
    },
    async get(orderNo: string): Promise<BankOrder> {
      const r = parseBankRecovery(await client.request({ path: `${base}/orders/${encodeURIComponent(orderNo)}`, authenticated: true }));
      if (r.state !== "COMMITTED" || r.withdrawalNo !== orderNo) throw invalid(); return r;
    },
  };
}
