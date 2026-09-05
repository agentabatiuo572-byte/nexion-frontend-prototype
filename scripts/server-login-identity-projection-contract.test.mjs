import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("server login consumes the authoritative user returned by authentication", () => {
  const login = read("src/pages/login/login.vue");
  const completion = read("src/auth/complete-sign-in.ts");
  assert.match(login, /finishSignIn\(\{[\s\S]*?serverProfile:\s*result\.user/);
  assert.match(completion, /serverProfile\?:\s*UserSession/);
  assert.match(completion, /SERVER_PROFILE_REQUIRED/);
  assert.match(completion, /app\.projectServerIdentity\(options\.serverProfile\)/);
  assert.match(completion, /useProfile\(\)\.projectServerIdentity\(options\.serverProfile\)/);
});

test("server mode clears local profile data and the profile row cannot render a seed identity", () => {
  const profile = read("src/store/profile.ts");
  const row = read("src/components/me/profile-row.vue");
  const profilePage = read("src/pages/me/profile.vue");
  assert.match(profile, /if \(remoteApiEnabled\) \{[\s\S]*?displayName\.value = ""/);
  assert.match(profile, /function projectServerIdentity\(identity: UserSession\)/);
  assert.doesNotMatch(row, /\+1 \(415\)/);
  assert.doesNotMatch(row, /\}\}\s*· US/);
  assert.match(row, /profile\.phoneE164/);
  assert.match(profilePage, /remoteApiEnabled \? profile\.phoneE164/);
});

test("first server-mode profile render uses the projected name and masked E.164 phone, or an honest blank", () => {
  const me = read("src/pages/me/me.vue");
  const row = read("src/components/me/profile-row.vue");
  assert.match(me, /import ProfileRow from "@\/components\/me\/profile-row\.vue"/);
  assert.match(me, /<ProfileRow\s*\/>/);
  assert.match(row, /const name = computed\(\(\) => profile\.displayName\)/);
  assert.match(row, /const phoneMask = computed\(\(\) => \{[\s\S]*?if \(!phone\) return ""/);
  assert.match(row, /\$\{phone\.slice\(0, 3\)\} ••••• \$\{phone\.slice\(-4\)\}/);
  // Remote mode must not fall back to a browser-owned user:<id> seed.
  assert.match(row, /remoteApiEnabled \? profile\.phoneE164\.replace\(\/\\D\/g, ""\) : app\.user\.email/);
  assert.match(row, /v-if="!remoteApiEnabled"/);
});

test("App bootstrap reprojects the in-memory server user after account-store rebinding", () => {
  const app = read("src/App.vue");
  assert.match(app, /import \{ useProfile \} from "@\/store\/profile"/);
  assert.match(app, /app\.bindAccount\(key\);[\s\S]*?rebindAccountScopedStores\(key\);[\s\S]*?sessionVault\.read\(\)/);
  assert.match(app, /useProfile\(\)\.projectServerIdentity\(serverSession\.user\)/);
  assert.match(app, /app\.projectServerIdentity\(serverSession\.user\)/);
});

test("post-login bootstrap does not clear the catalog that the accepted login just loaded", () => {
  const app = read("src/App.vue");
  assert.match(app, /const completedRemoteLoginAlreadyBound = remoteApiEnabled/);
  assert.match(app, /app\.accountKey === auth\.accountId/);
  assert.match(app, /session\.accountKey === auth\.accountId/);
  assert.match(app, /completedRemoteLoginAlreadyBound[\s\S]*?accountSessionBootstrapped = true;[\s\S]*?return;/);
  assert.match(app, /if \(completedRemoteLoginAlreadyBound\)[\s\S]*?return;[\s\S]*?app\.bindAccount\(key\);[\s\S]*?rebindAccountScopedStores\(key\);/);
});

test("remote fleet reads cannot start without a matching in-memory server session", () => {
  const appShell = read("src/App.vue");
  const appStore = read("src/store/app.ts");
  assert.match(appShell, /function canRefreshRemoteAccount\(auth:/);
  assert.match(appShell, /sessionVault\.read\(\)[\s\S]*?auth\.accountId === `user:\$\{serverSession\.user\.userId\}`/);
  assert.match(appShell, /if \(canRefreshRemoteAccount\(auth\)\) void useApp\(\)\.refreshRemoteFleet\(\);/);
  assert.doesNotMatch(appShell, /if \(remoteApiEnabled\) void useApp\(\)\.refreshRemoteFleet\(\);/);
  assert.match(appStore, /const activeSession = sessionVault\.read\(\);/);
  assert.match(appStore, /expectedAccountKey !== `user:\$\{activeSession\.user\.userId\}`[\s\S]*?return false;/);
});

test("remote nickname and avatar mutations use server authority", () => {
  const profile = read("src/store/profile.ts");
  const page = read("src/pages/me/profile.vue");
  const api = read("src/api/profile-api.ts");

  assert.match(profile, /const init = remoteApiEnabled \? \{ displayName: "", avatarSeed: "" \} : hydrate\(boundKey\);/);
  assert.match(profile, /async function setDisplayName\(v: string\): Promise<boolean> \{[\s\S]*?if \(remoteApiEnabled\) \{[\s\S]*?profileApi\.updateNickname\(expected, desired, commandKey\)[\s\S]*?return true;/);
  assert.match(profile, /if \(!isAmbiguousOutcome\(error\)\) finishProfileCommand/);
  assert.match(api, /method: "PUT"[\s\S]*?path: "\/api\/app\/profile"[\s\S]*?body: \{ expectedNickname, nickname \}/);
  assert.match(profile, /function regenerateAvatar\(\) \{[\s\S]*?if \(remoteApiEnabled\) return false;[\s\S]*?defaultSeed\(\)[\s\S]*?persist\(\);[\s\S]*?return true;/);
  assert.match(page, /:authoritative="remoteApiEnabled"/);
  assert.match(page, /:server-candidates="profile\.nicknameCandidates"/);
  assert.match(page, /const saved = await profile\.setDisplayName\(name\.value\);[\s\S]*?toast\.success\(t\.value\.profile\.savedToast\)/);
  assert.match(api, /uploadAvatar:[\s\S]*?client\.upload\(\{[\s\S]*?path: "\/api\/app\/profile\/avatar"/);
  assert.match(page, /async function handleRegen\(\) \{[\s\S]*?if \(remoteApiEnabled\) \{[\s\S]*?uni\.chooseImage\([\s\S]*?profileApi\.uploadAvatar\(filePath, key\)[\s\S]*?profileApi\.profile\(\)\.catch/);
  assert.doesNotMatch(page, /profile\.serverReadOnlyHold/);
});

test("remote registration calls password login and enters the App with that authoritative session", () => {
  const register = read("src/pages/register/register.vue");
  const autoLogin = read("src/auth/registration-auto-login.ts");
  const completion = read("src/auth/complete-sign-in.ts");

  assert.match(register, /const registration = await registerAndLogin\(authApi, \{[\s\S]*?sponsorCode: currentSponsorCode\(\),[\s\S]*?\}, \(\) => isCurrentRemoteRegistrationAttempt\(registrationAttempt\)\);/);
  assert.match(autoLogin, /authApi\.discardSessionIfCurrent\(registration\.vaultRevision\)/);
  assert.match(autoLogin, /authApi\.login\(\{[\s\S]*?countryCode: request\.countryCode,[\s\S]*?phone: request\.phone,[\s\S]*?password: request\.password/);
  assert.match(register, /const completed = completeSignIn\(\{[\s\S]*?identity: `user:\$\{registration\.user\.userId\}`,[\s\S]*?onboardingComplete: true,[\s\S]*?serverProfile: registration\.user,[\s\S]*?serverSessionRevision: registration\.vaultRevision,[\s\S]*?\}\);/);
  assert.match(register, /onboardingComplete: true,[\s\S]*?serverProfile: registration\.user,[\s\S]*?serverSessionRevision: registration\.vaultRevision/);
  assert.doesNotMatch(register, /registration\.kind !== "authenticated"/);
  assert.match(completion, /deferNavigation\?: boolean;/);
  assert.match(completion, /if \(remoteApiEnabled\) \{[\s\S]*?options\.serverProfile\.userId[\s\S]*?onboardingComplete = options\.onboardingComplete \?\? false;/);
  assert.match(completion, /if \(options\.deferNavigation\) return \{ ok: true \};[\s\S]*?if \(!auth\.onboardingComplete\)/);
});

test("a rejected server completion consumes only the issued vault epoch", () => {
  const authApi = read("src/api/auth-api.ts");
  const completion = read("src/auth/complete-sign-in.ts");
  const login = read("src/pages/login/login.vue");
  const register = read("src/pages/register/register.vue");

  assert.match(authApi, /kind: "authenticated"; user: UserSession; vaultRevision: number/);
  assert.match(authApi, /vaultRevision: expectedRevision \+ 1/);
  assert.match(authApi, /discardSessionIfCurrent\(expectedRevision: number\): void/);
  assert.match(authApi, /if \(!vault\.clearIfUnchanged\(expectedRevision\)\) return;[\s\S]*?revokeRefreshTokenBestEffort\(snapshot\.refreshToken\)/);
  assert.match(authApi, /const revokeRefreshTokenBestEffort[\s\S]*?void client\.request\([\s\S]*?\/auth\/users\/logout/);
  assert.match(authApi, /discardSessionForIdentity\(identity: string\): void/);
  assert.match(authApi, /if \(`user:\$\{snapshot\.user\.userId\}` !== identity\) return;/);
  assert.match(completion, /serverSessionRevision\?: number;/);
  assert.match(completion, /const failRemoteCompletion = \(error: CompleteSignInResultError\)[\s\S]*?authApi\.discardSessionIfCurrent\(options\.serverSessionRevision\)[\s\S]*?authApi\.discardSessionForIdentity\(options\.identity\)/);
  assert.match(completion, /return failRemoteCompletion\("SERVER_PROFILE_REQUIRED"\);/);
  assert.match(completion, /return failRemoteCompletion\("sign_in_storage_unavailable"\);/);
  assert.match(login, /serverSessionRevision: result\.vaultRevision/);
  assert.match(register, /serverSessionRevision: registration\.vaultRevision/);
});

test("stale remote authentication responses discard only their issued vault epoch", () => {
  const login = read("src/pages/login/login.vue");
  const register = read("src/pages/register/register.vue");
  const registrationAutoLogin = read("src/auth/registration-auto-login.ts");
  const authApi = read("src/api/auth-api.ts");

  assert.match(login, /if \(!isCurrentPasswordAttempt\(passwordAttempt\)\) \{[\s\S]*?authApi\.discardSessionIfCurrent\(result\.vaultRevision\);[\s\S]*?return;/);
  assert.match(login, /if \(!isCurrentRemoteTwoFactorAttempt\(twoFactorAttempt\)\) \{[\s\S]*?authApi\.discardSessionIfCurrent\(result\.vaultRevision\);[\s\S]*?return;/);
  assert.match(register, /registerAndLogin\(authApi,[\s\S]*?\(\) => isCurrentRemoteRegistrationAttempt\(registrationAttempt\)\)/);
  assert.match(registrationAutoLogin, /authApi\.discardSessionIfCurrent\(registration\.vaultRevision\);[\s\S]*?if \(!isCurrent\(\)\) return \{ kind: "stale" \}/);
  assert.match(registrationAutoLogin, /if \(!isCurrent\(\)\) \{[\s\S]*?authApi\.discardSessionIfCurrent\(login\.vaultRevision\)/);
  assert.match(authApi, /if \(vault\.revision\(\) !== expectedRevision\) return;/);
});
