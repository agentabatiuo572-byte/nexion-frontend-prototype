import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import ts from "typescript";
import source from "./register.vue?raw";
import completionSource from "@/auth/complete-sign-in.ts?raw";
import authSource from "@/store/auth.ts?raw";
import { createAuthApi } from "@/api/auth-api";
import { createSessionVault } from "@/api/session-vault";
import { ApiError } from "@/api/errors";
import { registerAndLogin, requiresOriginalRegistrationRecovery } from "@/auth/registration-auto-login";
import { sanitizePhoneInput } from "@/auth/phone-number";
import { resolvePostSignInRoute } from "@/auth/post-sign-in-route";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const parsed = ts.createSourceFile("register.ts", source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1], ts.ScriptTarget.Latest, true);
const names = ["finish", "verifyCode", "recoverRejectedRegistration", "invalidateOtpFlow", "isCurrentRemoteRegistrationAttempt", "registrationErrorText", "resend", "back", "onPhone", "inputVal", "pickCountry", "onCta", "recoverOriginalLogin"];
const functions = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
if (functions.length !== names.length) throw new Error("Production registration handlers missing");
const states = parsed.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ["registrationNeedsLogin", "originalRegistrationRecoveryRequired", "ctaEnabled", "ctaDisabledReason"].includes(decl.name.getText(parsed))));
const handlers = ts.transpileModule([...states, ...functions].map((node) => node.getText(parsed)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(failure: unknown, messages = en, language: "en" | "vi" | "zh" = "en") {
  vi.useFakeTimers();
  const code = ref(["1", "2", "3", "4", "5", "6"]);
  const otpRequestId = ref<string | null>("old-challenge");
  const authApi = { register: vi.fn().mockRejectedValue(failure), verifyRegistrationOtp: vi.fn(), login: vi.fn(), recoverLogin: vi.fn(),
    pendingLogin: vi.fn(() => false), pendingLoginContext: vi.fn((): ReturnType<ReturnType<typeof createAuthApi>["pendingLoginContext"]> => null), discardSessionIfCurrent: vi.fn() };
  const requestCode = vi.fn(async () => { otpRequestId.value = "fresh-challenge"; });
  const phone = ref("19900009112");
  const deps = {
    ApiError, registerAndLogin, requiresOriginalRegistrationRecovery, authApi, navTo: vi.fn(), completedRegistrationIdentity: ref<string | null>(null),
    computed, phone, sanitizePhoneInput, phoneTouched: ref(false), registrationRisk: ref(null), showCountries: ref(false),
    phoneOk: ref(true), submitAttempted: ref(false), busy: ref(false), goSendCode: vi.fn(), requestCode, code, otpRequestId,
    codeStr: computed(() => code.value.join("")), codeOk: computed(() => /^\d{6}$/.test(code.value.join(""))), completing: ref(false), verifying: ref(false),
    error: ref<string | null>(null), step: ref(3), verifiedToken: ref<string | null>("old-token"),
    focusIdx: ref(5), resendLeft: ref(12), pwdOk: ref(true), pwdMatch: ref(true), remoteApiEnabled: true,
    fullPhone: ref("+8619900009112"), country: ref("+86"), phoneClean: phone, password: ref("fixture-only"),
    currentSponsorCode: () => null, geoText: () => null, t: ref(messages),
    completeSignIn: vi.fn().mockReturnValue({ ok: true }), useLocaleStore: () => ({ code: language }),
    registrationCompletionDestination: () => "/pages/register/success", stageRemoteRegistrationReceipt: vi.fn(),
    launchRegistrationSuccess: vi.fn(), toast: { success: vi.fn() }, clearInterval,
    clearRemoteRegistrationReceipt: vi.fn(),
  };
  const timer = setInterval(() => { deps.resendLeft.value--; }, 1000);
  const run = new Function(...Object.keys(deps), "timer", `let otpFlowVersion=7; let mounted=true; let resendTimer=timer; let pendingRegistrationRecovery=null; ${handlers}
    return { finish, verifyCode, resend, invalidateOtpFlow, back, onPhone, pickCountry, onCta, recoverOriginalLogin, registrationNeedsLogin, ctaEnabled, ctaDisabledReason, leave: () => { mounted = false; invalidateOtpFlow(); }, snapshot: () => ({ version: otpFlowVersion, timer: resendTimer }) };`)(...Object.values(deps), timer);
  return { ...deps, ...run };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function productionFunctions(raw: string, names: string[]): string {
  const ast = ts.createSourceFile("production.ts", raw, ts.ScriptTarget.Latest, true);
  const found = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
      found.set(node.name.text, node.getText(ast).replace(/^export\s+/, ""));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (found.size !== names.length) throw new Error("Production completion functions missing");
  return ts.transpileModule(names.map((name) => found.get(name)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

function realCompletion(page: ReturnType<typeof fixture>, failure: "auth-persist" | "session-readback", vault = { revision: () => 2, isRefreshContinuation: (_expectedRevision: number) => false }) {
  let failing = true;
  const authRefs = { isAuthenticated: ref(false), email: ref(""), accountId: ref("default"), onboardingComplete: ref(false) };
  const storage = vi.fn(() => { if (failing && failure === "auth-persist") throw new Error("fixture storage unavailable"); });
  const authDependencies = { ...authRefs, normalizeAccountKey: (value: string) => value,
    uni: { setStorageSync: storage }, STORAGE_KEY: "fixture-auth" };
  const authMethods = new Function(...Object.keys(authDependencies), `${productionFunctions(authSource, ["persist", "signIn", "signOut"])}
    return { signIn, signOut };`)(...Object.values(authDependencies));
  const auth = { ...authMethods, get isAuthenticated() { return authRefs.isAuthenticated.value; },
    get accountId() { return authRefs.accountId.value; }, get onboardingComplete() { return authRefs.onboardingComplete.value; } };
  const session = { sessionId: "fixture-session", claim: vi.fn(() => ({ requiresRecalibration: false })), signOutSession: vi.fn() };
  const app = { bindAccount: vi.fn(), projectServerIdentity: vi.fn(), setRemoteTaskForeground: vi.fn() };
  const dependencies = { useAuth: () => auth, useApp: () => app, useSession: () => session,
    remoteApiEnabled: true, sessionVault: vault, authApi: page.authApi, completedSignIns: new Map(), IDEMPOTENCY_TTL_MS: 600_000,
    rebindAccountScopedStores: vi.fn(), readAccountSessionRecords: () => failing && failure === "session-readback" ? [] : [{ sessionId: session.sessionId }],
    useProfile: () => ({ projectServerIdentity: vi.fn() }), hydrateCurrentProfileLocale: vi.fn(),
    afterLegalTermsAcknowledged: vi.fn(), scheduleLegalTermsGate: vi.fn(), resolvePostSignInRoute,
    navReset: vi.fn() };
  const complete = new Function(...Object.keys(dependencies), `${productionFunctions(completionSource, ["completeSignIn"])}
    return completeSignIn;`)(...Object.values(dependencies));
  page.completeSignIn.mockImplementation(complete);
  return { auth, storage, session, app, recover: () => { failing = false; } };
}

describe("Registration verifies with the server before password setup", () => {
  function otpPage(messages = en) {
    const page = fixture(null, messages);
    page.step.value = 2;
    page.verifiedToken.value = null;
    return page;
  }

  it("waits for real verification and suppresses duplicate submissions", async () => {
    const page = otpPage();
    let accept!: (value: unknown) => void;
    page.authApi.verifyRegistrationOtp.mockReturnValue(new Promise((resolve) => { accept = resolve; }));
    const pending = page.verifyCode();
    expect(page.step.value).toBe(2);
    expect(page.verifying.value).toBe(true);
    await page.verifyCode();
    expect(page.authApi.verifyRegistrationOtp).toHaveBeenCalledExactlyOnceWith({
      countryCode: "+86", phone: "19900009112", challengeNo: "old-challenge", code: "123456",
    });
    accept({ status: "REGISTRATION_OTP_VERIFIED" });
    await pending;
    expect(page.step.value).toBe(3);
    expect(page.verifying.value).toBe(false);
    expect(page.authApi.register).not.toHaveBeenCalled();
    expect(page.completeSignIn).not.toHaveBeenCalled();
  });

  it.each([en, zh, vietnamese])("keeps rejected codes on the code step with a translated error", async (messages) => {
    const page = otpPage(messages);
    page.authApi.verifyRegistrationOtp.mockRejectedValue(new ApiError({ kind: "http", status: 422, message: "USER_REGISTRATION_OTP_INVALID" }));
    await page.verifyCode();
    expect(page.step.value).toBe(2);
    expect(page.error.value).toBe(messages.authOtp.errorOtpInvalidOrExpired);
    expect(page.otpRequestId.value).toBe("old-challenge");
    expect(page.verifying.value).toBe(false);
  });

  it("keeps network failures retryable without claiming the code was wrong", async () => {
    const page = otpPage();
    page.authApi.verifyRegistrationOtp.mockRejectedValue(new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" }));
    await page.verifyCode();
    expect(page.step.value).toBe(2);
    expect(page.error.value).toBe(en.authOtp.errorServiceUnavailable);
    expect(page.verifying.value).toBe(false);
    page.authApi.verifyRegistrationOtp.mockResolvedValue({ status: "REGISTRATION_OTP_VERIFIED" });
    await page.verifyCode();
    expect(page.step.value).toBe(3);
  });

  it.each(["phone", "challenge", "code", "back", "leave"])("ignores a success after changing %s", async (change) => {
    const page = otpPage();
    let accept!: (value: unknown) => void;
    page.authApi.verifyRegistrationOtp.mockReturnValue(new Promise((resolve) => { accept = resolve; }));
    const pending = page.verifyCode();
    if (change === "phone") page.fullPhone.value = "+8619900009222";
    if (change === "challenge") page.otpRequestId.value = "fresh-challenge";
    if (change === "code") page.code.value = ["6", "5", "4", "3", "2", "1"];
    if (change === "back") { page.invalidateOtpFlow(); page.step.value = 1; }
    if (change === "leave") page.leave();
    accept({ status: "REGISTRATION_OTP_VERIFIED" });
    await pending;
    expect(page.step.value).not.toBe(3);
    expect(page.authApi.register).not.toHaveBeenCalled();
  });
});

describe("Registration rejection recovery", () => {
  it.each([
    ["initial-success", "auth-persist"], ["unknown-recovery", "auth-persist"],
    ["initial-success", "session-readback"], ["unknown-recovery", "session-readback"],
  ] as const)("%s with real %s completion failure requires explicit sign-in without another registration", async (origin, failureStage) => {
    const failure = new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" });
    const authenticated = { kind: "authenticated", user: { userId: 7, onboardingComplete: false }, vaultRevision: 2 };
    const page = fixture(failure);
    const completion = realCompletion(page, failureStage);
    if (origin === "initial-success") page.authApi.register.mockResolvedValue(authenticated);
    else {
      page.authApi.recoverLogin.mockRejectedValueOnce(failure);
      await page.finish();
      expect(page.completeSignIn).not.toHaveBeenCalled();
    }
    page.authApi.recoverLogin.mockResolvedValue(authenticated);
    await page.finish();
    expect(page.completeSignIn).toHaveReturnedWith({ ok: false, error: "sign_in_storage_unavailable" });
    expect(completion.auth.isAuthenticated).toBe(false);
    expect(page.authApi.discardSessionIfCurrent).toHaveBeenCalledWith(2);
    expect(page.step.value).toBe(3);
    expect(page.completing.value).toBe(false);
    expect(page.error.value).toBe(en.register.registrationSignInRequired);
    expect(page.registrationNeedsLogin.value).toBe(true);
    expect(page.stageRemoteRegistrationReceipt).not.toHaveBeenCalled();
    expect(page.launchRegistrationSuccess).not.toHaveBeenCalled();
    completion.recover();
    const recoveryCalls = page.authApi.recoverLogin.mock.calls.length;
    await page.finish();
    expect(page.authApi.register).toHaveBeenCalledTimes(1);
    expect(page.authApi.recoverLogin).toHaveBeenCalledTimes(recoveryCalls);
    expect(page.authApi.login).not.toHaveBeenCalled();
    expect(page.launchRegistrationSuccess).not.toHaveBeenCalled();
  });

  it("real auth issuance completes its attempt before local failure and offers only explicit sign-in", async () => {
    const page = fixture(null), vault = createSessionVault();
    let saved: unknown;
    const request = vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 7, countryCode: "+86", phone: "19900009112", nickname: "New", onboardingComplete: false } });
    const realApi = createAuthApi({ request } as never, vault, { clientSurface: "APP", installationId: () => "install",
      attemptStorage: { get: () => saved, set: value => { saved = value; }, remove: () => { saved = undefined; } } });
    page.authApi.register.mockImplementation(realApi.register);
    page.authApi.recoverLogin.mockImplementation(realApi.recoverLogin);
    page.authApi.discardSessionIfCurrent.mockImplementation(realApi.discardSessionIfCurrent);
    realCompletion(page, "auth-persist", vault);
    await page.finish();
    expect(realApi.pendingLogin()).toBe(false); expect(saved).toBeUndefined(); expect(vault.read()).toBeNull();
    expect(page.registrationNeedsLogin.value).toBe(true);
    expect(page.error.value).toBe(en.register.registrationSignInRequired);
    page.invalidateOtpFlow(); await page.finish();
    expect(page.authApi.register).toHaveBeenCalledTimes(1);
    expect(page.authApi.recoverLogin).not.toHaveBeenCalled(); expect(page.authApi.login).not.toHaveBeenCalled();
    expect(source).toMatch(/v-if="registrationNeedsLogin"[\s\S]*?@click="goLogin"/);
    expect(source).toMatch(/const ctaEnabled = computed\(\(\) => !registrationNeedsLogin\.value/);
    expect(page.launchRegistrationSuccess).not.toHaveBeenCalled();
  });

  it("binds the completed-registration guidance to its phone and country across back and edits", async () => {
    const page = fixture(null);
    page.authApi.register.mockResolvedValue({ kind: "authenticated", user: { userId: 7, onboardingComplete: false }, vaultRevision: 2 });
    realCompletion(page, "auth-persist"); await page.finish();
    page.back(); page.back();
    expect(page.registrationNeedsLogin.value).toBe(true); expect(page.ctaEnabled.value).toBe(false);
    page.onCta(); expect(page.error.value).toBe(en.register.registrationSignInRequired);
    await page.finish(); expect(page.authApi.register).toHaveBeenCalledTimes(1);
    page.onPhone({ detail: { value: "19900009222" } });
    expect(page.registrationNeedsLogin.value).toBe(false); expect(page.ctaEnabled.value).toBe(true);
    page.onPhone({ detail: { value: "19900009112" } });
    expect(page.registrationNeedsLogin.value).toBe(true);
    page.onCta(); expect(page.error.value).toBe(en.register.registrationSignInRequired);
    page.pickCountry("+84"); expect(page.registrationNeedsLogin.value).toBe(false); expect(page.error.value).toBeNull();
    page.pickCountry("+86"); expect(page.registrationNeedsLogin.value).toBe(true);
    expect(page.authApi.recoverLogin).not.toHaveBeenCalled(); expect(page.authApi.login).not.toHaveBeenCalled();
  });

  it("retries result recovery before another registration after both responses are unknown", async () => {
    const failure = new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" });
    const page = fixture(failure);
    page.authApi.recoverLogin.mockRejectedValue(failure);
    await page.finish();
    expect(page.error.value).toBe(en.register.registrationOutcomeUnknown);
    expect(page.step.value).toBe(3);
    expect(page.completing.value).toBe(false);
    expect(page.authApi.register).toHaveBeenCalledTimes(1);
    expect(page.authApi.recoverLogin).toHaveBeenCalledTimes(1);
    page.password.value = "edited-after-unknown";
    await page.finish();
    expect(page.authApi.register).toHaveBeenCalledTimes(1);
    expect(page.authApi.recoverLogin).toHaveBeenCalledTimes(2);
    expect(page.authApi.recoverLogin).toHaveBeenLastCalledWith();
    expect(page.authApi.login).not.toHaveBeenCalled();
    expect(page.completeSignIn).not.toHaveBeenCalled();
    page.authApi.recoverLogin.mockResolvedValue({ kind: "authenticated", user: { userId: 7, onboardingComplete: false }, vaultRevision: 2 });
    await page.finish();
    expect(page.authApi.register).toHaveBeenCalledTimes(1);
    expect(page.authApi.recoverLogin).toHaveBeenCalledTimes(3);
    expect(page.completeSignIn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ identity: "user:7", serverSessionRevision: 2 }));
    expect(page.launchRegistrationSuccess).toHaveBeenCalledTimes(1);
  });

  it.each(["phone", "country"])("changing %s cannot complete the original unknown account through another registration form", async (changed) => {
    const failure = new ApiError({ kind: "network", message: "RESPONSE_LOST" });
    const page = fixture(failure), vault = createSessionVault();
    let saved: unknown;
    const recovered = { accessToken: "original-access", refreshToken: "original-refresh", tokenType: "Bearer",
      user: { userId: 7, countryCode: "+86", phone: "19900009112", nickname: "Original", onboardingComplete: false } };
    const request = vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce(failure).mockResolvedValue(recovered);
    const realApi = createAuthApi({ request } as never, vault, { clientSurface: "APP", installationId: () => "install",
      attemptStorage: { get: () => saved, set: value => { saved = value; }, remove: () => { saved = undefined; } } });
    page.authApi.register.mockImplementation(realApi.register); page.authApi.recoverLogin.mockImplementation(realApi.recoverLogin);
    page.authApi.pendingLogin.mockImplementation(realApi.pendingLogin); page.authApi.pendingLoginContext.mockImplementation(realApi.pendingLoginContext);
    await page.finish();
    const original = JSON.stringify(saved);
    expect(realApi.pendingLogin()).toBe(true);
    const originalAttempt = saved as { loginAttemptId: string; recoveryProof: string };
    const recoveryPath = `/auth/users/login/attempts/${originalAttempt.loginAttemptId}/recover`;
    expect(request.mock.calls.map(([call]) => call.path)).toEqual(["/auth/users/register", recoveryPath]);
    page.back(); page.back();
    if (changed === "phone") page.onPhone({ detail: { value: "19900009222" } });
    else page.pickCountry("+84");
    expect(page.ctaEnabled.value).toBe(false);
    page.onCta(); expect(page.goSendCode).not.toHaveBeenCalled();
    expect(page.error.value).toBe(en.login.unknownAttempt);
    page.step.value = 3; page.otpRequestId.value = "another-challenge";
    await page.finish();
    expect(realApi.pendingLogin()).toBe(true); expect(JSON.stringify(saved)).toBe(original);
    expect(request.mock.calls.map(([call]) => call.path)).toEqual(["/auth/users/register", recoveryPath]);
    expect(page.authApi.register).toHaveBeenCalledTimes(1);
    expect(page.authApi.recoverLogin).toHaveBeenCalledTimes(1);
    expect(page.authApi.login).not.toHaveBeenCalled(); expect(vault.read()).toBeNull();
    expect(page.completeSignIn).not.toHaveBeenCalled(); expect(page.launchRegistrationSuccess).not.toHaveBeenCalled();
    page.recoverOriginalLogin(); expect(page.navTo).toHaveBeenCalledWith("/pages/login/login");
    // Only the explicit recovery route may now recover A; B's form never completes it.
    expect(await realApi.recoverLogin()).toMatchObject({ kind: "authenticated", user: { userId: 7 } });
    expect(request.mock.calls[2][0]).toEqual(request.mock.calls[1][0]);
    expect(request.mock.calls[2][0].body).toMatchObject({ authMethod: "REGISTRATION", authReference: "+86:19900009112",
      recoveryProof: originalAttempt.recoveryProof });
    expect(page.completeSignIn).not.toHaveBeenCalled();
  });

  it("the same original registration form can recover its unknown account without another issuance", async () => {
    const failure = new ApiError({ kind: "network", message: "RESPONSE_LOST" });
    const page = fixture(failure), vault = createSessionVault();
    const request = vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce(failure).mockResolvedValue({
      accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 7, countryCode: "+86", phone: "19900009112", nickname: "Original", onboardingComplete: false },
    });
    const realApi = createAuthApi({ request } as never, vault);
    page.authApi.register.mockImplementation(realApi.register); page.authApi.recoverLogin.mockImplementation(realApi.recoverLogin);
    page.authApi.pendingLogin.mockImplementation(realApi.pendingLogin); page.authApi.pendingLoginContext.mockImplementation(realApi.pendingLoginContext);
    await page.finish();
    expect(realApi.pendingLogin()).toBe(true); expect(page.completeSignIn).not.toHaveBeenCalled();
    await page.finish();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.filter(([call]) => call.path === "/auth/users/register")).toHaveLength(1);
    expect(request.mock.calls[2][0]).toEqual(request.mock.calls[1][0]);
    expect(realApi.pendingLogin()).toBe(false);
    expect(page.completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ identity: "user:7" }));
    expect(page.launchRegistrationSuccess).toHaveBeenCalledTimes(1);
  });

  it("clears only the page recovery input when mocked authentication accepts another phone flow", async () => {
    const failure = new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" });
    const page = fixture(failure);
    page.authApi.recoverLogin.mockRejectedValue(failure);
    await page.finish();
    page.invalidateOtpFlow();
    page.fullPhone.value = "+8619900009222";
    page.phoneClean.value = "19900009222";
    page.otpRequestId.value = "another-challenge";
    page.password.value = "another-fixture";
    page.authApi.register.mockResolvedValue({ kind: "authenticated", user: { userId: 8, onboardingComplete: false }, vaultRevision: 3 });
    await page.finish();
    expect(page.authApi.register).toHaveBeenCalledTimes(2);
    expect(page.authApi.register).toHaveBeenLastCalledWith(expect.objectContaining({ phone: "19900009222", challengeNo: "another-challenge", password: "another-fixture" }));
    expect(page.authApi.recoverLogin).toHaveBeenCalledTimes(1);
    expect(page.completeSignIn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ identity: "user:8" }));
  });

  it("ignores a late recovery session after cancelling into another registration flow", async () => {
    const failure = new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" });
    const page = fixture(failure);
    page.authApi.recoverLogin.mockRejectedValueOnce(failure);
    await page.finish();
    let accept!: (value: unknown) => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => { began = resolve; });
    const response = new Promise((resolve) => { accept = resolve; });
    page.authApi.recoverLogin.mockImplementation(() => { began(); return response; });
    const pending = page.finish();
    await started;
    page.invalidateOtpFlow();
    page.fullPhone.value = "+8619900009222";
    page.otpRequestId.value = "another-challenge";
    page.error.value = "new-flow-message";
    accept({ kind: "authenticated", user: { userId: 7 }, vaultRevision: 2 });
    await pending;
    expect(page.completeSignIn).not.toHaveBeenCalled();
    expect(page.error.value).toBe("new-flow-message");
    expect(page.authApi.discardSessionIfCurrent).toHaveBeenCalledWith(2);
  });

  it.each(["en", "vi", "zh"] as const)("sends the selected %s language with registration", async (language) => {
    const page = fixture(new Error("offline"), en, language);
    await page.finish();
    expect(page.authApi.register).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ language }));
  });
  it.each([en, zh, vietnamese])("returns an invalid or expired OTP to a translated fresh-code step", async (messages) => {
    const page = fixture(new ApiError({ kind: "http", status: 422, message: "USER_REGISTRATION_OTP_INVALID" }), messages);
    await page.finish();
    expect(page.step.value).toBe(2);
    expect(page.error.value).toBe(messages.authOtp.errorOtpInvalidOrExpired);
    expect(page.otpRequestId.value).toBeNull();
    expect(page.verifiedToken.value).toBeNull();
    expect(page.code.value).toEqual(["", "", "", "", "", ""]);
    expect(page.focusIdx.value).toBe(0);
    expect(page.snapshot()).toEqual({ version: 8, timer: undefined });
    vi.advanceTimersByTime(2000);
    expect(page.resendLeft.value).toBe(0);
    expect(page.requestCode).not.toHaveBeenCalled();
    expect(page.authApi.recoverLogin).not.toHaveBeenCalled();
    expect(page.completeSignIn).not.toHaveBeenCalled();
    await page.finish();
    expect(page.authApi.register).toHaveBeenCalledTimes(1);
  });

  it("uses only the new challenge after the user explicitly requests another code", async () => {
    const page = fixture(new ApiError({ kind: "http", status: 422, message: "USER_REGISTRATION_OTP_INVALID" }));
    await page.finish();
    page.resend();
    expect(page.requestCode).toHaveBeenCalledExactlyOnceWith();
    page.code.value = ["6", "5", "4", "3", "2", "1"];
    page.step.value = 3;
    page.authApi.register.mockResolvedValue({ kind: "authenticated", user: { userId: 7, onboardingComplete: false }, vaultRevision: 2 });
    await page.finish();
    expect(page.authApi.register).toHaveBeenLastCalledWith(expect.objectContaining({ challengeNo: "fresh-challenge", code: "654321" }));
    expect(page.completeSignIn).toHaveBeenCalledTimes(1);
    expect(page.launchRegistrationSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows a network signup limit without reusing its consumed challenge or attempting login", async () => {
    const page = fixture(new ApiError({ kind: "http", status: 409, message: "USER_REGISTRATION_K1_IP_LIMIT" }));
    await page.finish();
    expect(page.step.value).toBe(1);
    expect(page.error.value).toBe(en.register.errorSignupLimited);
    expect(page.otpRequestId.value).toBeNull();
    expect(page.verifiedToken.value).toBeNull();
    expect(page.phoneClean.value).toBe("19900009112");
    expect(page.requestCode).not.toHaveBeenCalled();
    expect(page.authApi.recoverLogin).not.toHaveBeenCalled();
    expect(page.completeSignIn).not.toHaveBeenCalled();
  });

  it("ignores a rejection from the previous phone or challenge after the user starts another flow", async () => {
    const page = fixture(null);
    let reject!: (failure: unknown) => void;
    page.authApi.register.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const pending = page.finish();
    page.fullPhone.value = "+8619900009222";
    page.otpRequestId.value = "another-challenge";
    page.error.value = "current-flow-message";
    reject(new ApiError({ kind: "http", status: 422, message: "USER_REGISTRATION_OTP_INVALID" }));
    await pending;
    expect(page.otpRequestId.value).toBe("another-challenge");
    expect(page.error.value).toBe("current-flow-message");
    expect(page.snapshot().version).toBe(7);
    expect(page.completeSignIn).not.toHaveBeenCalled();
  });

  it.each([
    new ApiError({ kind: "http", status: 409, message: "USER_REGISTRATION_ACCOUNT_EXISTS" }),
    new ApiError({ kind: "http", status: 422, message: "USER_REGISTRATION_REQUEST_INVALID" }),
    new ApiError({ kind: "http", status: 403, message: "USER_REGISTRATION_OTP_INVALID" }),
    new ApiError({ kind: "business", status: 200, code: 422, message: "USER_REGISTRATION_OTP_INVALID" }),
  ])("keeps unrelated refusals out of the OTP and K1 recovery branches", async (failure) => {
    const page = fixture(failure);
    await page.finish();
    expect(page.step.value).toBe(3);
    expect(page.otpRequestId.value).toBe("old-challenge");
    expect(page.snapshot().version).toBe(7);
    expect(page.error.value).toBe(en.authOtp.errorServiceUnavailable);
  });
});
