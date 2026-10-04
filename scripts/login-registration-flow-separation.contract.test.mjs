import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("login completion never treats incomplete onboarding as a registration redirect", () => {
  const completion = read("src/auth/complete-sign-in.ts");
  const routeResolver = read("src/auth/post-sign-in-route.ts");
  assert.match(completion, /resolvePostSignInRoute\(\{/);
  assert.doesNotMatch(completion, /if \(!auth\.onboardingComplete\)[\s\S]*?pages\/onboarding\/estimator/);
  assert.doesNotMatch(completion, /navReset\("\/pages\/onboarding\/estimator"\)/);
  assert.doesNotMatch(routeResolver, /return "\/pages\/onboarding\//);
});

test("an authenticated main-app session is not blocked by registration onboarding state", () => {
  const app = read("src/App.vue");
  const authGuard = app.slice(app.indexOf("function checkAuthGuard"), app.indexOf("function checkSession"));
  const refreshGate = app.slice(app.indexOf("function canRefreshRemoteAccount"), app.indexOf("async function refreshAuthenticatedRemoteFleet"));
  const loopGate = app.slice(app.indexOf("function canRunBusinessLoops"), app.indexOf("function ensureBusinessLoopsAllowed"));
  const sessionGuard = app.slice(app.indexOf("function checkSession"), app.indexOf("function attachSessionWatch"));
  assert.doesNotMatch(authGuard, /onboardingComplete/);
  assert.doesNotMatch(refreshGate, /onboardingComplete/);
  assert.doesNotMatch(loopGate, /onboardingComplete/);
  assert.doesNotMatch(sessionGuard, /pages\/onboarding\//);
  assert.match(app, /enabled: remoteApiEnabled && auth\.isAuthenticated,/);
});

test("registration remains the only flow that launches registration success and onboarding", () => {
  const login = read("src/pages/login/login.vue");
  const register = read("src/pages/register/register.vue");
  const success = read("src/pages/register/success.vue");
  assert.doesNotMatch(login, /pages\/register\/success|pages\/onboarding\/estimator/);
  assert.match(register, /deferNavigation: true/);
  assert.match(register, /returnTo: registrationCompletionDestination\(\)/);
  assert.match(register, /url: registrationCompletionDestination\(\)/);
  assert.match(register, /return "\/pages\/register\/success"/);
  assert.match(success, /url: "\/pages\/onboarding\/estimator"/);
});
