import { reactive } from "vue";
import type { BankConfig, BankBeneficiary, createBankWithdrawalApi } from "@/api/bank-withdrawal-api";
import { isAmbiguousOutcome } from "@/api/errors";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { BANK_HOLDER_NAME_RE } from "@/lib/native-unicode-regex";

type Recipient = { account: string; holder: string };
type BindingApi = Pick<ReturnType<typeof createBankWithdrawalApi>, "config" | "bind" | "sendOtp">;
type BindBody = Parameters<BindingApi["bind"]>[0];
type Phase = "details" | "uncertain" | "saved";
export function validBankRecipient(draft: Recipient): boolean {
  const name = draft.holder.trim();
  return /^[0-9]{6,32}$/.test(draft.account.trim()) && name.length >= 2 && name.length <= 100
    && BANK_HOLDER_NAME_RE.test(name);
}
/** Account-only binding needs explicit server proof that bank routing is verified. */
export function directBankBindingAvailable(config: BankConfig | null): boolean {
  return config?.bankRoutingVerified === true && config.bankSelection === "ACCOUNT_ROUTED"
    && config.banks.length === 0 && config.payType === "BANKQR" && config.bankCodeRequired === false
    && config.bindingOtpRequired === !!config.beneficiary;
}
function sameBeneficiary(a: BankBeneficiary | null, b: BankBeneficiary): boolean {
  return !!a && a.bankCode === b.bankCode && a.maskedAccount === b.maskedAccount
    && a.beneficiaryNo === b.beneficiaryNo
    && a.effectiveAt === b.effectiveAt && a.nextChangeAt === b.nextChangeAt;
}

/** Recipient and change OTP stay in page memory only; ambiguous writes replay the exact request. */
export function createBankBindingForm(api: BindingApi, identity: () => string, clock = Date.now) {
  const state = reactive({ config: null as BankConfig | null, account: "", holder: "",
    busy: false, phase: "details" as Phase, error: "", code: "", challengeNo: "", otpExpiresAt: 0, resendAt: 0 });
  let revision = 0;
  let pending: { body: BindBody; key: string; receipt: BankBeneficiary | null } | null = null;
  const canContinue = () => !state.busy && state.phase === "details" && directBankBindingAvailable(state.config)
    && (!state.config?.beneficiary || (!!state.challengeNo && /^[0-9]{6}$/.test(state.code) && state.otpExpiresAt > clock()))
    && validBankRecipient(state);
  const canSendOtp = () => !state.busy && state.phase === "details" && directBankBindingAvailable(state.config)
    && !!state.config?.beneficiary && state.resendAt <= clock();
  function scope() {
    const id = ++revision, owner = identity();
    return () => id === revision && owner === identity();
  }
  function clearOtp() { state.code = ""; state.challengeNo = ""; state.otpExpiresAt = 0; }
  function clearDraft() { state.account = ""; state.holder = ""; clearOtp(); state.resendAt = 0; pending = null; }
  function reset() {
    revision++; clearDraft(); state.config = null; state.phase = "details"; state.busy = false; state.error = "";
  }
  async function load() {
    if (state.busy || state.phase === "uncertain") return;
    const current = scope(); state.busy = true; state.error = "";
    try {
      const config = await api.config(); if (!current()) return;
      state.config = config; clearOtp();
      if (!directBankBindingAvailable(config)) state.error = config.bankRoutingVerified === true ? "unsupported" : "routingUnverified";
    } catch { if (current()) { state.config = null; state.error = "load"; } }
    finally { if (current()) state.busy = false; }
  }
  async function sendOtp() {
    if (!canSendOtp()) return;
    const current = scope(); state.busy = true; state.error = ""; clearOtp();
    // An unknown delivery result must not invite immediate duplicate SMS sends.
    state.resendAt = clock() + 60000;
    try {
      const receipt = await api.sendOtp(); if (!current()) return;
      state.challengeNo = receipt.challengeNo; state.otpExpiresAt = clock() + receipt.expiresInSeconds * 1000;
      state.resendAt = clock() + receipt.retryAfterSeconds * 1000;
    } catch (error) {
      if (current()) state.error = error instanceof Error && /BANK_CHANGE_OTP_(COOLDOWN|DAILY_LIMIT)/.test(error.message) ? "otpRateLimited" : "otpSend";
    } finally { if (current()) state.busy = false; }
  }
  async function submit(accountRoutingConfirmed = false) {
    if (state.busy || (state.phase !== "uncertain" && (!accountRoutingConfirmed || !canContinue()))) return;
    if (state.phase === "uncertain" && !pending) return;
    if (!pending) {
      try {
        pending = { body: { bankCode: "", account: state.account.trim(), holder: state.holder.trim(), accountRoutingConfirmed: true,
          ...(state.config?.beneficiary ? { challengeNo: state.challengeNo, code: state.code } : {}) },
          key: `bank-bind:${requireCryptoUuid()}`, receipt: null };
      } catch { state.error = "bind"; return; }
    }
    const operation = pending, current = scope(); state.busy = true; state.error = "";
    try {
      if (!operation.receipt) {
        const receipt = await api.bind({ ...operation.body }, operation.key); if (!current()) return;
        operation.receipt = receipt;
      }
      const config = await api.config(); if (!current()) return;
      if (!sameBeneficiary(config.beneficiary, operation.receipt)) throw new Error("BANK_BIND_READBACK_MISMATCH");
      state.config = config; clearDraft(); state.phase = "saved";
    } catch (error) {
      if (!current()) return;
      if (operation.receipt || isAmbiguousOutcome(error)) { state.phase = "uncertain"; state.error = "unknown"; }
      else { pending = null; state.phase = "details";
        state.error = error instanceof Error && error.message === "BANK_CHANGE_OTP_INVALID" ? "otpInvalid" : "bind";
        if (state.error === "otpInvalid") state.code = "";
      }
    } finally { if (current()) state.busy = false; }
  }
  return { state, canContinue, canSendOtp, sendOtp, load, reset, submit };
}
