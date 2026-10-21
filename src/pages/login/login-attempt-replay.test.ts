import { expect, it, vi } from "vitest";
import { ref, nextTick } from "vue";
import ts from "typescript";
import source from "./login.vue?raw";
import { ApiError } from "@/api/errors";
import { createAuthApi } from "@/api/auth-api";
import { createSessionVault } from "@/api/session-vault";

it.each(["retryOriginalLogin", "recoverLoginResult"].flatMap(method => [false, true].map(newerSession => [method, newerSession] as const)))
  ("%s cleans up unmounted success by its exact revision (newer session: %s)", async (method, newerSession) => {
    const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
    const ast = ts.createSourceFile("login.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === method)!;
    const code = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const vault = createSessionVault();
    const request = vi.fn().mockResolvedValue(undefined);
    const auth = createAuthApi({ request } as never, vault);
    let complete!: (result: unknown) => void;
    const pending = new Promise(resolve => { complete = resolve; });
    const authApi = { pendingLogin: () => true, retryLogin: () => pending, recoverLogin: () => pending,
      discardSessionIfCurrent: vi.fn(auth.discardSessionIfCurrent) };
    const deps = { authApi, loading: ref(false), replayAvailable: ref(true), retryContext: ref({ authMethod: "PASSWORD" }),
      retryNeedsPassword: ref(true), retryPassword: ref("private-input"), retryNeedsCode: ref(false), retryCode: ref(""),
      showCaptcha: ref(false), captchaPurpose: ref("replay"), syncLoginRecovery: vi.fn(), finishSignIn: vi.fn() };
    const page = new Function(...Object.keys(deps), `let mounted = true; ${code}; return { invoke: ${method}, unmount() { mounted = false; } };`)(...Object.values(deps));
    const operation = page.invoke();
    page.unmount();
    const user = { userId: 1, countryCode: "+86", phone: "13800000001", nickname: "Test", onboardingComplete: true };
    const snapshot = { accessToken: "old-access", refreshToken: "old-refresh", tokenType: "Bearer", user };
    vault.save(snapshot);
    const issuedRevision = vault.revision();
    complete({ kind: "authenticated", user, vaultRevision: issuedRevision });
    if (newerSession) vault.save({ ...snapshot, accessToken: "new-access", refreshToken: "new-refresh", user: { ...user, userId: 2 } });
    await operation;
    expect(authApi.discardSessionIfCurrent).toHaveBeenCalledTimes(1);
    expect(authApi.discardSessionIfCurrent).toHaveBeenCalledWith(issuedRevision);
    expect(deps.finishSignIn).not.toHaveBeenCalled();
    expect(deps.syncLoginRecovery).not.toHaveBeenCalled();
    if (newerSession) {
      expect(vault.read()).toMatchObject({ accessToken: "new-access", user: { userId: 2 } });
      expect(request).not.toHaveBeenCalled();
    } else {
      expect(vault.read()).toBeNull();
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/auth/users/logout", body: { refreshToken: "old-refresh" } }));
    }
  });

it("restores an actionable challenge panel and never queries an unissued MFA result", async () => {
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const ast = ts.createSourceFile("login.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && ["syncLoginRecovery", "recoverLoginResult", "cancelLoginVerification"].includes(node.name?.text ?? ""))
    .map(node => node.getText(ast)).join("\n");
  const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { authMethod: "OAUTH", pending: false, context: { provider: "TELEGRAM", challengeNo: "original" } };
  const authApi = { pendingLogin: () => false, pendingLoginContext: vi.fn().mockReturnValue(context),
    recoverLogin: vi.fn(), cancelLoginChallenge: vi.fn() };
  authApi.cancelLoginChallenge.mockImplementation(() => authApi.pendingLoginContext.mockReturnValue(null));
  const deps = { authApi, loading: ref(false), retryContext: ref(null), loginResultUnknown: ref(false),
    loginRecoveryPending: ref(false), replayAvailable: ref(false), mounted: true, error: ref(null),
    retryPassword: ref(""), retryCode: ref("000000"), showCaptcha: ref(false), remoteTwoFactorChallenge: ref(null), step: ref(1) };
  const page = new Function(...Object.keys(deps), `${code}; return { syncLoginRecovery, recoverLoginResult, cancelLoginVerification };`)(...Object.values(deps));
  page.syncLoginRecovery();
  expect(deps.loginRecoveryPending.value).toBe(true); expect(deps.replayAvailable.value).toBe(true);
  await page.recoverLoginResult();
  expect(authApi.recoverLogin).not.toHaveBeenCalled(); expect(deps.retryContext.value).toEqual(context);
  page.cancelLoginVerification();
  expect(deps.loginRecoveryPending.value).toBe(false); expect(deps.retryCode.value).toBe("");
  expect(source).toContain('v-if="loginResultUnknown"');
});

it("routes the existing captcha challenge back into the original-attempt retry without a fresh password login", async () => {
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const ast = ts.createSourceFile("login.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && ["retryOriginalLogin", "onCaptchaOk"].includes(node.name?.text ?? "")).map(node => node.getText(ast)).join("\n");
  const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const authApi = { pendingLogin: () => true, retryLogin: vi.fn()
    .mockRejectedValueOnce(new ApiError({ kind: "http", status: 428, message: "USER_CAPTCHA_REQUIRED" }))
    .mockResolvedValueOnce({ kind: "authenticated", vaultRevision: 1, user: { userId: 1, onboardingComplete: true } }) };
  const showCaptcha = ref(false), captchaPurpose = ref("otp"), retryPassword = ref("private-input"), retryCode = ref("");
  const finishSignIn = vi.fn(), signInWithPassword = vi.fn(), requestCode = vi.fn();
  const deps = { loading: ref(false), replayAvailable: ref(true), retryContext: ref({ authMethod: "PASSWORD", context: { countryCode: "+86", phone: "13800000001" } }),
    retryNeedsPassword: ref(true), retryNeedsCode: ref(false), retryPassword, retryCode, authApi, mounted: true,
    loginRecoveryPending: ref(true), country: ref("+84"), phone: ref("other"), password: ref(""), remoteTwoFactorChallenge: ref(null),
    mode: ref("password"), step: ref(1), code: ref([]), finishSignIn, authenticatedAccountId: () => "user:1",
    error: ref(null), syncLoginRecovery: vi.fn(), remoteLoginError: vi.fn(), ApiError, showCaptcha, captchaPurpose, signInWithPassword, requestCode };
  const names = Object.keys(deps);
  const page = new Function(...names, `${code}; return { retryOriginalLogin, onCaptchaOk };`)(...Object.values(deps));
  await page.retryOriginalLogin();
  expect(showCaptcha.value).toBe(true); expect(captchaPurpose.value).toBe("replay");
  expect(retryPassword.value).toBe("private-input");
  page.onCaptchaOk("server-issued-ticket");
  for (let i = 0; i < 8; i++) await nextTick();
  expect(authApi.retryLogin).toHaveBeenNthCalledWith(2, { password: "private-input", code: undefined, captchaTicket: "server-issued-ticket" });
  expect(finishSignIn).toHaveBeenCalledOnce(); expect(signInWithPassword).not.toHaveBeenCalled(); expect(requestCode).not.toHaveBeenCalled();
  expect(retryPassword.value).toBe("");
});
