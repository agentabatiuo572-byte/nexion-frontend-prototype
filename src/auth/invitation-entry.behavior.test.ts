import { expect, test, vi } from "vitest";
import * as Vue from "vue";
import { compile, parse as parseTemplate } from "@vue/compiler-dom";
import { parse as parseSfc } from "@vue/compiler-sfc";
import ts from "typescript";
import login from "@/pages/login/login.vue?raw";
import register from "@/pages/register/register.vue?raw";
import landing from "@/pages/ref/code.vue?raw";
import { normalizeRegistrationSponsorCode } from "./registration-sponsor";
import { createOAuthProviderApi, type ThirdPartyProvider } from "@/api/oauth-provider-api";
import { resolveReferralAttributionCode, type ReferralPreviewState } from "@/lib/referral-preview-state";
import { ApiError } from "@/api/errors";

const code = "NXFA9066CFACA9";
function page(source: string, dependencies: Record<string, unknown>, names: string[]) {
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const ast = ts.createSourceFile("page.ts", script, ts.ScriptTarget.Latest, true);
  const load = ast.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "onLoad")!;
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
  const compiled = ts.transpileModule([load, ...functions].map(node => node.getText(ast)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let onLoad!: (options?: Record<string, string>) => Promise<void> | void;
  const run = new Function(...Object.keys(dependencies), "onLoad", `let mounted=true; let sponsorPreviewLoadVersion=0; let referralLoadVersion=0; let referralMounted=true; ${compiled}; return { ${names.join(",")} };`)(
    ...Object.values(dependencies), (handler: typeof onLoad) => { onLoad = handler; });
  return { ...run, load: (options?: Record<string, string>) => onLoad(options) };
}
function loginPage(query = "") {
  const refOnLogin = Vue.ref<string | null>(null), navReset = vi.fn();
  return { refOnLogin, navReset, ...page(login, {
    refOnLogin, navReset, normalizeRegistrationSponsorCode, remoteApiEnabled: true,
    syncLoginRecovery: vi.fn(), invalidateOtpFlow: vi.fn(), takeNavigationQuery: () => query,
    returnParam: Vue.ref(null), serverSessionReloadNotice: Vue.ref(false), browserUnsupportedNotice: Vue.ref(false),
  }, ["goRegister"]) };
}
function registerPage(query = "", preview = vi.fn().mockResolvedValue({ code, sponsor: { displayName: "A", vRank: "V0" } })) {
  const lockedRef = Vue.ref<string | null>(null), invite = Vue.ref(""), navReset = vi.fn();
  return { lockedRef, invite, navReset, ...page(register, {
    lockedRef, invite, navReset, normalizeRegistrationSponsorCode, remoteApiEnabled: true, ApiError,
    takeNavigationQuery: () => query, privacyHref: Vue.ref(""), privacyPolicyHref: () => "privacy",
    remotePreview: Vue.ref(null), sponsorPreview: Vue.ref(null), publicSponsorPreviewApi: { preview },
  }, ["goLogin"]) };
}
function providerSponsor(source: string, state: Record<string, unknown>): string | null {
  const template = parseSfc(source).descriptor.template!.content;
  // Render the production provider node, including its actual prop binding.
  const tree = parseTemplate(template);
  const find = (node: any): any => node.tag === "ThirdPartyAuth" ? node : node.children?.map(find).find(Boolean);
  const element = find(tree);
  const compiled = compile(element.loc.source, { mode: "function" });
  const render = new Function("Vue", compiled.code)({ ...Vue, resolveComponent: (name: string) => name });
  const vnode = render({ loginRecoveryPending: false, remoteApiEnabled: true, step: 1, mode: "password",
    loading: false, busy: false, authApi: { pendingLogin: () => false }, returnParam: null, ...state }, []);
  return vnode.props["sponsor-code"];
}
const flow = { flowId: `OIDC-${"a".repeat(32)}`, flowKey: "k".repeat(43), expiresInSec: 600,
  authorizationUrl: `https://example.test/auth/users/oauth/provider/authorize/${"s".repeat(43)}` };
test.each(["GOOGLE", "APPLE", "TELEGRAM"] as ThirdPartyProvider[])("%s retains attribution through QR/link landing, login and registration", async provider => {
  for (const queryFallback of [false, true]) {
    const navTo = vi.fn(), referralCode = Vue.ref(""), remotePreviewState = Vue.ref<ReferralPreviewState>("idle");
    const referralAttribution = Vue.computed(() => resolveReferralAttributionCode(true, remotePreviewState.value, referralCode.value));
    const landingPage = page(landing, {
      takeNavigationQuery: () => queryFallback ? `?code=${code}` : "", privacyHref: Vue.ref(""), privacyPolicyHref: () => "privacy",
      remoteApiEnabled: true, code: referralCode, remotePreview: Vue.ref(null), remotePreviewState,
      normalizeRegistrationSponsorCode, referralAttribution, navTo, requestedCode: Vue.ref(null), ApiError,
      publicSponsorPreviewApi: { preview: vi.fn().mockResolvedValue({ code }) },
      isCurrentReferralLoad: () => true,
    }, ["goLogin", "goRegister", "loadRemotePreview"]);
    await landingPage.load(queryFallback ? {} : { code });
    // The preview-confirmed landing route carries the code to either auth page.
    expect(referralAttribution.value).toBe(code);
    for (const destination of ["goLogin", "goRegister"]) {
      landingPage[destination]();
      expect(navTo).toHaveBeenLastCalledWith(`/pages/${destination === "goLogin" ? "login/login" : "register/register"}?ref=${code}`);
    }
    const signIn = loginPage(queryFallback ? `?ref=nx-fa9066-cfaca9` : "");
    await signIn.load(queryFallback ? {} : { ref: "nx-fa9066-cfaca9" });
    expect(signIn.refOnLogin.value).toBe(code);
    const request = vi.fn().mockResolvedValue(flow);
    await createOAuthProviderApi({ request } as never, { pendingLogin: () => false } as never)
      .start(provider, "LOGIN", providerSponsor(login, { refOnLogin: signIn.refOnLogin.value }));
    expect(request.mock.calls[0][0].body).toEqual({ provider, intent: "LOGIN", sponsorCode: code });
    signIn.goRegister();
    expect(signIn.navReset).toHaveBeenCalledWith(expect.objectContaining({ url: `/pages/register/register?ref=${code}` }));
  }
});

test("manual invitation survives switching to login and back", async () => {
  const signUp = registerPage(); await signUp.load({});
  signUp.invite.value = " nx-fa9066-cfaca9 "; signUp.goLogin();
  const url = signUp.navReset.mock.calls[0][0].url;
  const signIn = loginPage(url.slice(url.indexOf("?"))); await signIn.load({});
  expect(providerSponsor(login, { refOnLogin: signIn.refOnLogin.value })).toBe(code);
  expect(providerSponsor(register, { lockedRef: signUp.lockedRef.value, invite: signUp.invite.value })).toBe(signUp.invite.value);
  signIn.goRegister();
  expect(signIn.navReset).toHaveBeenCalledWith(expect.objectContaining({ url: `/pages/register/register?ref=${code}` }));
});

test("registration keeps the incoming code before preview completes and after preview failure", async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise((_resolve, fail) => { reject = fail; });
  const signUp = registerPage(`?ref=${code}`, vi.fn().mockReturnValue(pending));
  const loading = signUp.load({});
  expect(providerSponsor(register, { lockedRef: signUp.lockedRef.value, invite: "OTHER123" })).toBe(code);
  reject(new Error("network unavailable")); await loading;
  expect(signUp.lockedRef.value).toBe(code);
  signUp.goLogin();
  expect(signUp.navReset).toHaveBeenCalledWith(expect.objectContaining({ url: `/pages/login/login?ref=${code}` }));
});

test.each(["network", "REFERRAL_PREVIEW_NOT_FOUND"])("landing preserves the code during preview and handles %s without losing a valid invitation", async message => {
  let reject!: (reason: Error) => void;
  const pending = new Promise((_resolve, fail) => { reject = fail; });
  const requestedCode = Vue.ref(null), navTo = vi.fn();
  const entry = page(landing, {
    takeNavigationQuery: () => `?code=${code}`, privacyHref: Vue.ref(""), privacyPolicyHref: () => "privacy",
    remoteApiEnabled: true, code: Vue.ref(""), remotePreview: Vue.ref(null), remotePreviewState: Vue.ref("idle"),
    normalizeRegistrationSponsorCode, referralAttribution: Vue.ref(null), navTo, requestedCode, ApiError,
    publicSponsorPreviewApi: { preview: () => pending }, isCurrentReferralLoad: () => true,
  }, ["goLogin", "goRegister", "loadRemotePreview"]);
  const loading = entry.load({});
  entry.goLogin(); expect(navTo).toHaveBeenLastCalledWith(`/pages/login/login?ref=${code}`);
  reject(message === "network" ? new Error(message) : new ApiError({ kind: "business", code: 404, message }));
  await loading;
  entry.goRegister();
  expect(navTo).toHaveBeenLastCalledWith(`/pages/register/register${message === "network" ? `?ref=${code}` : ""}`);
});

test("a definitive invalid sponsor response restores the editable registration input", async () => {
  const signUp = registerPage(`?ref=${code}`, vi.fn().mockRejectedValue(new ApiError({ kind: "business", code: 404, message: "REFERRAL_PREVIEW_NOT_FOUND" })));
  await signUp.load({}); expect(signUp.lockedRef.value).toBeNull();
});

test("ordinary login clears any old invitation and rejects malformed codes", async () => {
  const signIn = loginPage(); await signIn.load({ ref: code }); await signIn.load({});
  expect(signIn.refOnLogin.value).toBeNull();
  await signIn.load({ ref: "NX/INVALID" }); expect(signIn.refOnLogin.value).toBeNull();
  signIn.goRegister();
  expect(signIn.navReset).toHaveBeenLastCalledWith(expect.objectContaining({ url: "/pages/register/register" }));
});
