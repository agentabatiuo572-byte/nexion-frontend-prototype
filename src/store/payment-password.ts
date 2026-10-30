import { reactive } from "vue";
import { apiClient, sessionVault } from "@/api/runtime";
import { createPaymentPasswordApi, type PaymentPasswordApi, type PaymentPasswordAuthorization, type PaymentPasswordChallenge, type PaymentPasswordProof, type PaymentPasswordReceipt, type PaymentPasswordState } from "@/api/payment-password-api";
import { ApiError, asApiError, isAmbiguousOutcome } from "@/api/errors";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";

export type { PaymentPasswordAuthorization } from "@/api/payment-password-api";
export interface PaymentPasswordContext {
  amount: number | string;
  currency: string;
  summary: string;
  details?: { name: string; quantity?: number; amount?: number | string }[];
}
type Stage = "loading" | "read-error" | "setup" | "confirm" | "pay" | "recovery" | "reset" | "reset-confirm" | "pending";
type ErrorKey = "" | "readFailed" | "failed" | "mismatch" | "simple" | "incorrect" | "locked" | "versionChanged" | "recoveryUnavailable" | "codeInvalid" | "proofExpired" | "samePassword";
type PendingCommand = { commandKey: string; operation: "setup" | "change" | "reset" };
interface PendingStorage { read(): unknown; write(command: PendingCommand | null): boolean }

export function validPaymentPassword(value: string): boolean { return /^[0-9]{6}$/.test(value); }
export function simplePaymentPassword(value: string): boolean {
  return /^(.)\1{5}$/.test(value) || "0123456789012345".includes(value) || "9876543210987654".includes(value);
}
export function paymentPasswordErrorKey(error: unknown): ErrorKey {
  const message = asApiError(error).message;
  if (message === "PAYMENT_PASSWORD_INCORRECT") return "incorrect";
  if (message === "PAYMENT_PASSWORD_LOCKED") return "locked";
  if (/PAYMENT_PASSWORD_(VERSION_CONFLICT|ALREADY_CONFIGURED|NOT_CONFIGURED)/.test(message)) return "versionChanged";
  if (message === "PAYMENT_PASSWORD_TOO_SIMPLE") return "simple";
  if (message === "PAYMENT_PASSWORD_CONFIRM_MISMATCH") return "mismatch";
  if (message === "PAYMENT_PASSWORD_NEW_MUST_DIFFER") return "samePassword";
  if (message.includes("RECOVERY_UNAVAILABLE")) return "recoveryUnavailable";
  if (/PROOF|RESET_EXPIRED/.test(message)) return "proofExpired";
  if (/CODE|CHALLENGE/.test(message)) return "codeInvalid";
  return "failed";
}

/** Secrets stay in these in-memory fields only. The coordinator never executes a purchase. */
export function createPaymentPasswordCoordinator(api: PaymentPasswordApi, identity: () => string, randomId = requireCryptoUuid, pendingStorage?: PendingStorage) {
  const ui = reactive({
    visible: false, stage: "loading" as Stage, context: null as PaymentPasswordContext | null,
    state: null as PaymentPasswordState | null, busy: false, error: "" as ErrorKey,
    notice: "" as "" | "setupDonePay" | "resetDonePay", challenge: null as PaymentPasswordChallenge | null,
    resendAt: 0, now: Date.now(), revision: 0,
    completedOperation: "" as "" | "setup" | "change" | "reset", completedRevision: 0,
    changeError: "" as ErrorKey, pendingOperation: "" as "" | PendingCommand["operation"],
  });
  let firstPassword = "";
  let proof: PaymentPasswordProof | null = null;
  let owner = "";
  let generation = 0;
  let resolve: ((auth: PaymentPasswordAuthorization | null) => void) | null = null;
  let personalResolve: ((success: boolean) => void) | null = null;
  let pending: (PendingCommand & { owner: string }) | null = null;
  let lastPaymentError: ErrorKey = "";
  let serverOffset = 0;

  function clearSecrets() { firstPassword = ""; proof = null; ui.challenge = null; ui.resendAt = 0; ui.revision++; }
  function clearInputs() { firstPassword = ""; ui.revision++; }
  function current(token: number) { return token === generation && owner === identity(); }
  function restorePending() {
    if (!pendingStorage || pending?.owner === identity()) return;
    const value = pendingStorage.read();
    if (value === null) { pending = null; ui.pendingOperation = ""; return; }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PAYMENT_PASSWORD_COMMAND_INVALID");
    const row = value as Record<string, unknown>;
    if (typeof row.commandKey !== "string" || !row.commandKey || !["setup", "change", "reset"].includes(row.operation as string)
      || Object.keys(row).some(key => key !== "commandKey" && key !== "operation")) throw new Error("PAYMENT_PASSWORD_COMMAND_INVALID");
    pending = { commandKey: row.commandKey, operation: row.operation as PendingCommand["operation"], owner: identity() };
    ui.pendingOperation = pending.operation;
  }
  function savePending(command: PendingCommand): boolean {
    if (pendingStorage && !pendingStorage.write(command)) return false;
    pending = { ...command, owner }; ui.pendingOperation = command.operation; return true;
  }
  function retirePending(): boolean {
    if (pendingStorage && !pendingStorage.write(null)) return false;
    pending = null; ui.pendingOperation = ""; return true;
  }
  function setState(state: PaymentPasswordState) { ui.state = state; serverOffset = Date.parse(state.serverTime) - Date.now(); ui.now = Date.now() + serverOffset; }
  function cancel() {
    generation++; clearSecrets(); ui.visible = false; ui.busy = false; ui.context = null; ui.error = ""; ui.notice = "";
    resolve?.(null); resolve = null; personalResolve?.(false); personalResolve = null;
  }
  function accountChanged() { cancel(); pending = null; ui.pendingOperation = ""; ui.state = null; ui.changeError = ""; lastPaymentError = ""; }
  async function refreshStatus(): Promise<PaymentPasswordState | null> {
    const account = identity();
    try { const result = await api.status(); if (account !== identity()) return null; setState(result); return result; }
    catch { if (account === identity()) ui.state = null; return null; }
  }
  async function load() {
    const token = generation; ui.stage = "loading"; ui.busy = true; ui.error = "";
    try {
      restorePending();
      if (pending?.owner === owner) { ui.stage = "pending"; ui.busy = false; await query(); return; }
      const state = await api.status(); if (!current(token)) return; setState(state);
      if (state.configured && !ui.context) { const done = personalResolve; personalResolve = null; ui.visible = false; done?.(false); return; }
      ui.stage = state.configured ? "pay" : "setup";
      ui.error = lastPaymentError; lastPaymentError = "";
    } catch { if (current(token)) { ui.stage = "read-error"; ui.error = "readFailed"; } }
    finally { if (current(token)) ui.busy = false; }
  }
  function open(context: PaymentPasswordContext | null): void {
    cancel(); owner = identity(); ui.context = context ? { ...context, details: context.details?.map(item => ({ ...item })) } : null;
    ui.visible = true; void load();
  }
  function request(context: PaymentPasswordContext): Promise<PaymentPasswordAuthorization | null> {
    open(context); return new Promise(done => { resolve = done; });
  }
  function setup(): Promise<boolean> { open(null); return new Promise(done => { personalResolve = done; }); }
  async function resumePending(): Promise<boolean> {
    try { restorePending(); }
    catch { ui.changeError = "failed"; return false; }
    if (!pending) return false;
    if (!ui.visible) { cancel(); owner = identity(); ui.visible = true; ui.stage = "pending"; }
    await query(); return true;
  }
  async function recover(): Promise<boolean> {
    cancel(); owner = identity(); ui.visible = true;
    const result = new Promise<boolean>(done => { personalResolve = done; });
    void startRecovery(); return result;
  }
  function finishMutation(receipt: PaymentPasswordReceipt): boolean {
    if (receipt.status !== "SUCCEEDED") return false;
    if (receipt.state) setState(receipt.state);
    const operation = pending?.operation;
    ui.completedOperation = operation ?? ""; ui.completedRevision++;
    retirePending(); clearSecrets(); ui.error = "";
    if (ui.context) { ui.stage = "pay"; ui.notice = operation === "reset" ? "resetDonePay" : "setupDonePay"; }
    else { const done = personalResolve; personalResolve = null; ui.visible = false; done?.(true); }
    return true;
  }
  function next(password: string) {
    if (!validPaymentPassword(password) || ui.busy) return;
    if (simplePaymentPassword(password)) { ui.error = "simple"; return; }
    if (ui.stage === "reset" && (!proof || Date.parse(proof.expiresAt) <= Date.now() + serverOffset)) {
      clearSecrets(); ui.stage = "recovery"; ui.error = "proofExpired"; return;
    }
    firstPassword = password; ui.stage = ui.stage === "reset" ? "reset-confirm" : "confirm"; ui.error = ""; ui.revision++;
  }
  function restart() { clearInputs(); ui.error = ""; ui.stage = ui.stage === "reset-confirm" ? "reset" : "setup"; }
  async function confirm(password: string) {
    if (ui.busy || !validPaymentPassword(password)) return;
    if (password !== firstPassword) { ui.error = "mismatch"; ui.revision++; return; }
    const reset = ui.stage === "reset-confirm";
    if (reset && (!proof || Date.parse(proof.expiresAt) <= Date.now() + serverOffset)) {
      clearSecrets(); ui.stage = "recovery"; ui.error = "proofExpired"; return;
    }
    const token = generation;
    const command: PendingCommand = { commandKey: randomId(), operation: reset ? "reset" : "setup" };
    if (!savePending(command)) { ui.error = "failed"; return; }
    ui.busy = true; ui.error = "";
    const input = { newPassword: firstPassword, confirmPassword: password, commandKey: command.commandKey };
    const resetInput = reset ? { ...input, resetProof: proof!.resetProof, expectedCredentialVersion: ui.state!.credentialVersion } : null;
    clearSecrets();
    try {
      const result = resetInput ? await api.reset(resetInput) : await api.setup(input);
      if (!current(token)) return;
      if (!finishMutation(result)) ui.stage = "pending";
    } catch (error) {
      if (!current(token)) return;
      if (isAmbiguousOutcome(error)) ui.stage = "pending";
      else {
        if (!retirePending()) { ui.stage = "pending"; ui.error = "failed"; return; }
        ui.error = paymentPasswordErrorKey(error); ui.stage = reset ? "recovery" : "setup";
        if (ui.error === "versionChanged") { lastPaymentError = "versionChanged"; await load(); }
      }
    } finally { if (current(token)) ui.busy = false; }
  }
  async function query() {
    if (!pending || ui.busy) return;
    const token = generation; ui.busy = true; ui.error = "";
    try {
      const result = await api.receipt(pending.commandKey); if (!current(token)) return;
      if (finishMutation(result)) return;
      if (result.status === "REJECTED") {
        const operation = pending.operation;
        if (!retirePending()) { ui.error = "failed"; return; }
        clearSecrets();
        ui.error = paymentPasswordErrorKey(new ApiError({ kind: "business", message: result.message ?? "PAYMENT_PASSWORD_UPDATE_REJECTED" }));
        if (operation === "change") { ui.changeError = ui.error; ui.visible = false; await refreshStatus(); return; }
        ui.stage = operation === "reset" ? "recovery" : "setup";
      }
      // NOT_SEEN is not proof of a failed command. Only query or leave is safe.
    } catch { if (current(token)) ui.error = "failed"; }
    finally { if (current(token)) ui.busy = false; }
  }
  function authorize(password: string) {
    if (ui.stage !== "pay" || ui.busy || !validPaymentPassword(password) || !ui.state?.configured || ui.state.lockedUntil !== null) return;
    const auth = { paymentPassword: password, credentialVersion: ui.state.credentialVersion, attemptNo: randomId() };
    const done = resolve; resolve = null; clearSecrets(); ui.visible = false; ui.context = null; done?.(auth);
  }
  function locked(): boolean { return !!ui.state?.lockedUntil && Date.parse(ui.state.lockedUntil) > ui.now; }
  async function startRecovery() {
    if (ui.busy) return; clearSecrets(); ui.stage = "recovery"; ui.error = "";
    await sendChallenge();
  }
  function unavailableRecovery() { clearSecrets(); ui.stage = "recovery"; ui.error = "recoveryUnavailable"; }
  async function sendChallenge() {
    if (ui.busy || ui.resendAt > ui.now) return;
    const token = generation; ui.busy = true; ui.error = "";
    try {
      const state = await api.status(); if (!current(token)) return; setState(state);
      const challenge = await api.challenge(); if (!current(token)) return;
      ui.challenge = challenge; ui.resendAt = Date.now() + serverOffset + challenge.resendAfterSec * 1000;
    } catch (error) { if (current(token)) ui.error = paymentPasswordErrorKey(error); }
    finally { if (current(token)) ui.busy = false; }
  }
  async function verify(code: string) {
    if (ui.busy || !ui.challenge || !/^[0-9]{6}$/.test(code)) return;
    const token = generation; ui.busy = true; ui.error = ""; ui.revision++;
    try { const result = await api.verify(ui.challenge.challengeNo, code); if (!current(token)) return;
      proof = result; ui.stage = "reset"; ui.challenge = null;
    } catch (error) { if (current(token)) ui.error = paymentPasswordErrorKey(error); }
    finally { if (current(token)) ui.busy = false; }
  }
  async function change(currentPassword: string, newPassword: string, confirmPassword: string): Promise<boolean> {
    if (ui.busy || !ui.state?.configured) return false;
    try { restorePending(); } catch { ui.changeError = "failed"; return false; }
    if (pending) { await resumePending(); return false; }
    owner = identity(); const token = generation; ui.changeError = "";
    const commandKey = randomId();
    if (!savePending({ commandKey, operation: "change" })) { ui.changeError = "failed"; return false; }
    ui.busy = true;
    try {
      const result = await api.change({ currentPassword, newPassword, confirmPassword, expectedCredentialVersion: ui.state.credentialVersion, commandKey, attemptNo: randomId() });
      if (!current(token)) return false;
      if (finishMutation(result)) return true;
      ui.visible = true; ui.stage = "pending"; return false;
    } catch (error) {
      if (!current(token)) return false;
      if (isAmbiguousOutcome(error)) { ui.visible = true; ui.stage = "pending"; }
      else {
        if (!retirePending()) { ui.visible = true; ui.stage = "pending"; ui.error = "failed"; return false; }
        ui.changeError = paymentPasswordErrorKey(error); await refreshStatus();
      }
      return false;
    } finally { if (current(token)) ui.busy = false; }
  }
  function report(error: unknown): boolean {
    const message = asApiError(error).message;
    if (!/^PAYMENT_PASSWORD_/.test(message)) return false;
    lastPaymentError = paymentPasswordErrorKey(error); return true;
  }
  function tick() { ui.now = Date.now() + serverOffset; }
  return { ui, cancel, accountChanged, refreshStatus, request, setup, recover, resumePending, load, next, restart, confirm, query, authorize, startRecovery, unavailableRecovery, sendChallenge, verify, change, report, locked, tick };
}

const coordinator = createPaymentPasswordCoordinator(createPaymentPasswordApi(apiClient), () => {
  const session = sessionVault.read(); return session ? `${session.user.userId}:${session.sessionChainId}` : "";
}, requireCryptoUuid, {
  read: () => {
    const account = sessionVault.read()?.user.userId;
    if (!account) return null;
    return readAccountRow<{ pending: unknown }>("nexgrid-payment-password-commands-accounts-v1", `user:${account}`, true)?.pending ?? null;
  },
  write: pending => {
    const account = sessionVault.read()?.user.userId;
    return !!account && writeAccountRow("nexgrid-payment-password-commands-accounts-v1", `user:${account}`, { pending });
  },
});
sessionVault.subscribe?.((_previous, _next, continuation) => { if (!continuation) coordinator.accountChanged(); });
export const usePaymentPassword = () => coordinator;
export const requestPaymentPassword = coordinator.request;
export const reportPaymentPasswordError = coordinator.report;
export const cancelPaymentPassword = coordinator.cancel;
