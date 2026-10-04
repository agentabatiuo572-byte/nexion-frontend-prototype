import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import ts from "typescript";
import source from "./register.vue?raw";
import { ApiError } from "@/api/errors";
import { registerAndLogin } from "@/auth/registration-auto-login";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const parsed = ts.createSourceFile("register.ts", source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1], ts.ScriptTarget.Latest, true);
const names = ["finish", "verifyCode", "recoverRejectedRegistration", "invalidateOtpFlow", "isCurrentRemoteRegistrationAttempt", "registrationErrorText", "resend"];
const functions = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
if (functions.length !== names.length) throw new Error("Production registration handlers missing");
const handlers = ts.transpileModule(functions.map((node) => node.getText(parsed)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(failure: unknown, messages = en, language: "en" | "vi" | "zh" = "en") {
  vi.useFakeTimers();
  const code = ref(["1", "2", "3", "4", "5", "6"]);
  const otpRequestId = ref<string | null>("old-challenge");
  const authApi = { register: vi.fn().mockRejectedValue(failure), verifyRegistrationOtp: vi.fn(), login: vi.fn(), discardSessionIfCurrent: vi.fn() };
  const requestCode = vi.fn(async () => { otpRequestId.value = "fresh-challenge"; });
  const deps = {
    ApiError, registerAndLogin, authApi, requestCode, code, otpRequestId,
    codeStr: computed(() => code.value.join("")), codeOk: computed(() => /^\d{6}$/.test(code.value.join(""))), completing: ref(false), verifying: ref(false),
    error: ref<string | null>(null), step: ref(3), verifiedToken: ref<string | null>("old-token"),
    focusIdx: ref(5), resendLeft: ref(12), pwdOk: ref(true), pwdMatch: ref(true), remoteApiEnabled: true,
    fullPhone: ref("+8619900009112"), country: ref("+86"), phoneClean: ref("19900009112"), password: ref("fixture-only"),
    currentSponsorCode: () => null, geoText: () => null, t: ref(messages),
    completeSignIn: vi.fn().mockReturnValue({ ok: true }), useLocaleStore: () => ({ code: language }),
    registrationCompletionDestination: () => "/pages/register/success", stageRemoteRegistrationReceipt: vi.fn(),
    launchRegistrationSuccess: vi.fn(), toast: { success: vi.fn() }, clearInterval,
  };
  const timer = setInterval(() => { deps.resendLeft.value--; }, 1000);
  const run = new Function(...Object.keys(deps), "timer", `let otpFlowVersion=7; let mounted=true; let resendTimer=timer; ${handlers}
    return { finish, verifyCode, resend, invalidateOtpFlow, leave: () => { mounted = false; invalidateOtpFlow(); }, snapshot: () => ({ version: otpFlowVersion, timer: resendTimer }) };`)(...Object.values(deps), timer);
  return { ...deps, ...run };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

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
    expect(page.authApi.login).not.toHaveBeenCalled();
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
    expect(page.authApi.login).not.toHaveBeenCalled();
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
    new ApiError({ kind: "business", status: 422, message: "USER_REGISTRATION_OTP_INVALID" }),
  ])("keeps unrelated refusals out of the OTP and K1 recovery branches", async (failure) => {
    const page = fixture(failure);
    await page.finish();
    expect(page.step.value).toBe(3);
    expect(page.otpRequestId.value).toBe("old-challenge");
    expect(page.snapshot().version).toBe(7);
    expect(page.error.value).toBe(en.authOtp.errorServiceUnavailable);
  });
});
