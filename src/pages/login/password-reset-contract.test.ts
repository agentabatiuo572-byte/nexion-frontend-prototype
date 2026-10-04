import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { ApiError } from "@/api/errors";

const page = (import.meta.glob("./login.vue", { query: "?raw", import: "default", eager: true })["./login.vue"] ?? "") as string;
const messages = import.meta.glob("../../i18n/messages/{en,zh,vi}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// Run the page's actual input and verification handlers with only the network
// response held pending, so source-shape checks cannot hide an ordering race.
function otpHarness(flow: "reset" | "otp" | "two-factor" | "password") {
  const script = page.split('<script setup lang="ts">')[1].split("</script>")[0];
  const ast = ts.createSourceFile("login.ts", script, ts.ScriptTarget.Latest, true);
  const names = new Set(["inputVal", "onCode", "onPwd", "clearSignIn", "invalidateOtpFlow", "isCurrentOtpFlow", "isCurrentPasswordFlow", "isCurrentPasswordAttempt", "isCurrentRemoteTwoFactorAttempt", "isCurrentPasswordResetAttempt", "signInWithPassword", "verifyRemoteTwoFactor", "verifyCode", "finishReset"]);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text));
  expect(functions).toHaveLength(names.size);
  const compiled = ts.transpileModule(functions.map((node) => node.getText(ast)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  let resolve!: (value: unknown) => void;
  let reject!: (cause: unknown) => void;
  const response = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  const ref = <T,>(value: T) => ({ value });
  const verifyRequest = vi.fn(() => response);
  const state = {
    mounted: true, otpFlowVersion: 1, signInTimer: null, remoteApiEnabled: true,
    loading: ref(false), error: ref<string | null>(null), code: ref("123456".split("")), focusIdx: ref(0),
    fullPhone: ref("+84912345678"), phoneClean: ref("912345678"), country: ref("+84"), password: ref("Example123!"),
    newPwdOk: ref(true), pwdMatch: ref(true), newPassword: ref("NewPassword123!"),
    phoneOk: ref(true), pwdOk: ref(true), otpVerifyToken: ref(null),
    otpScene: ref(flow === "reset" ? "reset" : "login"), mode: ref(flow === "two-factor" ? "password" : flow),
    step: ref(flow === "password" ? 1 : 2), otpRequestId: ref<string | null>("CHALLENGE"), remoteTwoFactorChallenge: ref(flow === "two-factor" ? "2FA" : null),
    t: ref({ login: { errorInvalidCode: "invalid code" }, authOtp: { errorOtpNotFound: "missing challenge", errorServiceUnavailable: "unavailable", errorOtpInvalidOrExpired: "invalid or expired code" } }),
    authApi: {
      login: verifyRequest, verifyPasswordResetOtp: verifyRequest, completePasswordReset: verifyRequest, completeOtpLogin: verifyRequest, completeTwoFactor: verifyRequest,
      discardSessionIfCurrent: vi.fn(),
    },
    finishSignIn: vi.fn(), authenticatedAccountId: () => "user:1", remoteLoginError: () => "invalid code", ApiError,
  };
  const deps = { ...state, codeOk: { get value() { return /^\d{6}$/.test(state.code.value.join("")); } } };
  const immutableDeps = Object.keys(deps).filter((name) => name !== "otpFlowVersion" && name !== "signInTimer");
  const handlers = new Function("deps", `const { ${immutableDeps.join(",")} } = deps; let { otpFlowVersion, signInTimer } = deps; ${compiled}; return { verifyCode, onCode, onPwd, finishReset, signInWithPassword, invalidateOtpFlow };`)(deps) as {
    verifyCode: () => Promise<void>;
    finishReset: () => Promise<void>;
    signInWithPassword: () => Promise<void>;
    invalidateOtpFlow: () => void;
    onPwd: (event: { detail: { value: string } }) => void;
    onCode: (index: number, event: { detail: { value: string } }) => void;
  };
  return { state, handlers, resolve, reject, verifyRequest };
}

describe.each(["reset", "otp", "two-factor"] as const)("%s OTP response ordering", (flow) => {
  const success = () => flow === "reset"
    ? { status: "PASSWORD_RESET_OTP_VERIFIED" }
    : { kind: "authenticated", vaultRevision: 7, user: { onboardingComplete: true } };

  it("waits for real verification before advancing", async () => {
    const h = otpHarness(flow);
    const pending = h.handlers.verifyCode();
    expect(h.state.step.value).toBe(2);
    expect(h.state.finishSignIn).not.toHaveBeenCalled();
    expect(h.state.loading.value).toBe(true);
    h.resolve(success());
    await pending;
    if (flow === "reset") expect(h.state.step.value).toBe(3);
    else expect(h.state.finishSignIn).toHaveBeenCalledOnce();
  });

  it("keeps an invalid six-digit code on the OTP step", async () => {
    const h = otpHarness(flow);
    const pending = h.handlers.verifyCode();
    h.reject(new ApiError({ kind: "business", message: "OTP_CODE_INVALID" }));
    await pending;
    expect(h.state.step.value).toBe(2);
    expect(h.state.finishSignIn).not.toHaveBeenCalled();
    expect(h.state.loading.value).toBe(false);
    expect(h.state.error.value).toBe(flow === "reset" ? "invalid or expired code" : "invalid code");
  });

  it("ignores an old success after editing the code and releases the pending state", async () => {
    const h = otpHarness(flow);
    const pending = h.handlers.verifyCode();
    h.handlers.onCode(0, { detail: { value: "9" } });
    expect(h.verifyRequest).toHaveBeenCalledOnce();
    h.resolve(success());
    await pending;
    expect(h.state.code.value.join("")).toBe("923456");
    expect(h.state.step.value).toBe(2);
    expect(h.state.finishSignIn).not.toHaveBeenCalled();
    expect(h.state.loading.value).toBe(false);
    expect(h.state.error.value).toBeNull();
    if (flow !== "reset") expect(h.state.authApi.discardSessionIfCurrent).toHaveBeenCalledWith(7);
  });

  it("does not attach an old rejection to newly entered digits", async () => {
    const h = otpHarness(flow);
    const pending = h.handlers.verifyCode();
    h.handlers.onCode(0, { detail: { value: "9" } });
    h.reject(new ApiError({ kind: "business", message: "OTP_CODE_INVALID" }));
    await pending;
    expect(h.state.step.value).toBe(2);
    expect(h.state.loading.value).toBe(false);
    expect(h.state.error.value).toBeNull();
  });
});

describe("password login response ordering", () => {
  it.each(["success", "rejection"])("releases busy state after a password edit and old %s", async (result) => {
    const h = otpHarness("password");
    const pending = h.handlers.signInWithPassword();
    h.handlers.onPwd({ detail: { value: "EditedPassword123!" } });
    await h.handlers.signInWithPassword();
    expect(h.verifyRequest).toHaveBeenCalledOnce();
    if (result === "success") h.resolve({ kind: "authenticated", vaultRevision: 7, user: { onboardingComplete: true } });
    else h.reject(new Error("USER_INVALID_CREDENTIALS"));
    await pending;
    expect(h.state.loading.value).toBe(false);
    expect(h.state.error.value).toBeNull();
    expect(h.state.finishSignIn).not.toHaveBeenCalled();
    if (result === "success") expect(h.state.authApi.discardSessionIfCurrent).toHaveBeenCalledWith(7);
    else expect(h.state.authApi.discardSessionIfCurrent).not.toHaveBeenCalled();
    await h.handlers.signInWithPassword();
    expect(h.verifyRequest).toHaveBeenCalledTimes(2);
  });

  it.each(["success", "rejection"])("does not clear a newer flow's busy state on an old %s", async (result) => {
    const h = otpHarness("password");
    const oldPending = h.handlers.signInWithPassword();
    h.handlers.invalidateOtpFlow();
    let resolveNew!: (value: unknown) => void;
    h.verifyRequest.mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
    const newPending = h.handlers.signInWithPassword();
    if (result === "success") h.resolve({ kind: "authenticated", vaultRevision: 7, user: { onboardingComplete: true } });
    else h.reject(new Error("USER_INVALID_CREDENTIALS"));
    await oldPending;
    expect(h.state.loading.value).toBe(true);
    expect(h.state.error.value).toBeNull();
    expect(h.state.finishSignIn).not.toHaveBeenCalled();
    resolveNew({ kind: "authenticated", vaultRevision: 8, user: { onboardingComplete: true } });
    await newPending;
    expect(h.state.finishSignIn).toHaveBeenCalledWith(expect.objectContaining({ serverSessionRevision: 8 }));
    expect(h.state.authApi.discardSessionIfCurrent).not.toHaveBeenCalledWith(8);
  });
});

describe("password reset session and error contract", () => {
  it("states the reset-specific minimum in every new-password placeholder", () => {
    for (const source of Object.values(messages)) {
      expect(source).toMatch(/newPasswordPlaceholder:\s*"[^"\n]*12–64/);
    }
  });
  it("reports an expired code after password entry using the existing three-language OTP message", async () => {
    const h = otpHarness("reset");
    h.state.step.value = 3;
    const pending = h.handlers.finishReset();
    h.reject(new ApiError({ kind: "business", message: "USER_PASSWORD_RESET_CHALLENGE_INVALID" }));
    await pending;
    expect(h.state.error.value).toBe("invalid or expired code");
    expect(h.state.loading.value).toBe(false);
    expect(h.state.finishSignIn).not.toHaveBeenCalled();
    expect(Object.keys(messages)).toHaveLength(3);
    for (const source of Object.values(messages)) expect(source).toMatch(/errorOtpInvalidOrExpired:\s*["'][^"']+["']/);
  });

  it("verifies the remote OTP before opening the new-password step", () => {
    const remoteBranch = page.slice(
      page.indexOf("if (remoteApiEnabled)"),
      page.indexOf('if (mode.value !== "reset" && otpVerifyToken.value)'),
    );
    expect(page).toContain("await authApi.verifyPasswordResetOtp({");
    expect(page).toMatch(/verifyPasswordResetOtp\([\s\S]{0,500}isCurrentOtpFlow\(context\)[\s\S]{0,200}step\.value = 3/);
    expect(remoteBranch).not.toMatch(/if \(mode\.value === "reset"\) \{\s*loading\.value = false;\s*step\.value = 3;/);
  });

  it("returns to sign-in after reset and never claims a session was issued", () => {
    expect(page).toContain('mode.value = "password"');
    expect(page).toContain("t.value.login.resetSuccess");
    for (const source of Object.values(messages)) {
      expect(source).not.toMatch(/resetSuccess:\s*["'][^"']*(\u5df2\u767b\u5f55|signed in|đã đăng nhập)/i);
      expect(source).not.toMatch(/finishReset:\s*["'][^"']*(\u5e76\u767b\u5f55|and sign in|và đăng nhập)/i);
    }
  });

  it("uses a dedicated same-password message instead of reporting password strength", () => {
    expect(page).toContain("t.value.login.errorPasswordUnchanged");
    expect(page).not.toMatch(/USER_NEW_PASSWORD_MUST_DIFFER[\s\S]{0,100}errorWeakPassword/);
    for (const source of Object.values(messages)) expect(source).toContain("errorPasswordUnchanged:");
  });

  it("ignores a password-reset completion after the user leaves that flow", () => {
    expect(page).toContain("const resetAttempt: PasswordResetAttemptContext = {");
    expect(page).toMatch(/completePasswordReset\([\s\S]{0,600}if \(!isCurrentPasswordResetAttempt\(resetAttempt\)\) return;/);
    expect(page).toMatch(/catch \(cause\) \{\s*if \(!isCurrentPasswordResetAttempt\(resetAttempt\)\) return;/);
  });
});
