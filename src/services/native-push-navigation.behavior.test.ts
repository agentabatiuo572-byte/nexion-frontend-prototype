import { expect, it, vi } from "vitest";
import ts from "typescript";
import appSource from "@/App.vue?raw";
import { isStaticReviewRoute } from "@/lib/static-review-routes";
import { isPublicAuthRoute } from "@/lib/auth-route-visibility";
import { createSessionVault, type SessionSnapshot } from "@/api/session-vault";
import { createNativePushController, type NativePushPort } from "./native-push-controller";
import type { ApiClient, ApiRequest } from "@/api/api-client";

// Exercise the actual App navigation closure together with the real pending-click controller.
const ast = ts.createSourceFile("App.ts", appSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1], ts.ScriptTarget.Latest, true);
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ["canRefreshRemoteAccount", "isAuthWhitelisted"].includes(node.name?.text ?? "")).map(node => node.getText(ast)).join("\n");
let navigation = "";
function find(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "installNativePush") {
    const options = node.arguments[0] as ts.ObjectLiteralExpression;
    navigation = (options.properties.find(prop => prop.name?.getText(ast) === "canNavigate") as ts.PropertyAssignment).initializer.getText(ast);
  }
  ts.forEachChild(node, find);
}
find(ast);
const code = ts.transpileModule(`${helpers}\nconst canNavigate = ${navigation};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const turn = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const snapshot = (userId = 7): SessionSnapshot => ({ accessToken: `test-${userId}`, refreshToken: "test-refresh", tokenType: "Bearer",
  sessionGroup: "APP", installationId: "test-install", appSessionVersion: 1, sessionChainId: `chain-${userId}`,
  user: { userId, phone: "00000000000", countryCode: "+86", nickname: "Test", onboardingComplete: false } });
function harness(cold = false) {
  const vault = createSessionVault();
  const auth = { isAuthenticated: !cold, accountId: cold ? "default" : "user:7", onboardingComplete: false };
  let route = cold ? "" : "pages/me/preferences", click!: (event: { type: string; data: unknown }) => void;
  if (!cold) vault.save(snapshot());
  const canNavigate = new Function("remoteApiEnabled", "sessionVault", "useAuth", "readCurrentRoute", "isPublicAuthRoute", "currentPublicPromotionRoute", "isStaticReviewRoute",
    `${code}; return canNavigate;`)(true, vault, () => auth, () => route, isPublicAuthRoute, () => false, isStaticReviewRoute);
  const request = vi.fn(async (_request: ApiRequest) => ({ notificationId: "43890", route: "/pages/support/chat?cid=CV-test" }));
  const port: NativePushPort = { platform: "ios", appVersion: "1", installationId: () => "test-install", bindingToken: () => "a".repeat(64),
    permission: async () => "unknown", token: vi.fn(), stop() {}, listen: callback => { click = callback; },
    navigate: vi.fn(async () => true), canNavigate, received() {} };
  const push = createNativePushController({ request } as unknown as ApiClient, vault, port); vault.subscribe!(push.sessionChanged); push.start();
  return { auth, vault, request, port, push, route: (value: string) => { route = value; }, click: () => click({ type: "click", data: { notificationId: "43890" } }) };
}

it("opens an owned support notification before device onboarding without bypassing backend resolution", async () => {
  const h = harness(); h.click(); await turn();
  expect(h.request.mock.calls[0][0]).toMatchObject({ path: "/api/me/push-notifications/43890", headers: { Authorization: "Bearer test-7" } });
  expect(h.port.navigate).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=CV-test");
  expect(h.request.mock.calls[1][0]).toMatchObject({ method: "POST", path: "/api/me/push-notifications/43890/opened", body: { installationId: "test-install" } });
});
it("retains a cold click until the same accepted account and a usable route are ready", async () => {
  const h = harness(true); h.click(); await turn(); expect(h.request).not.toHaveBeenCalled();
  h.vault.save(snapshot()); await turn(); expect(h.request).not.toHaveBeenCalled();
  h.auth.isAuthenticated = true; h.auth.accountId = "user:7"; h.route("pages/login/login"); h.push.foreground(); await turn();
  expect(h.request).not.toHaveBeenCalled();
  h.route("pages/me/me"); h.push.foreground(); await turn();
  expect(h.port.navigate).toHaveBeenCalledOnce();
});
it.each(["", "pages/login/login", "pages/onboarding/intro", "pages/entry-surfaces/catalog"])("does not resolve a click while route %s is not ready", async route => {
  const h = harness(); h.route(route); h.click(); await turn(); expect(h.request).not.toHaveBeenCalled();
});
it("does not trust an authenticated UI shell belonging to a different server account", async () => {
  const h = harness(); h.auth.accountId = "user:8"; h.click(); await turn(); expect(h.request).not.toHaveBeenCalled();
});
it("drops a pending cold click on logout/account replacement", async () => {
  const h = harness(true); h.vault.save(snapshot()); h.click(); await turn();
  h.vault.clear(); h.vault.save(snapshot(8)); h.auth.isAuthenticated = true; h.auth.accountId = "user:8"; h.route("pages/me/me");
  h.push.foreground(); await turn(); expect(h.request).not.toHaveBeenCalled();
});

it("does not resolve from an unauthenticated shell even if a stale vault remains", async () => {
  const h = harness(); h.auth.isAuthenticated = false; h.click(); await turn(); expect(h.request).not.toHaveBeenCalled();
});
