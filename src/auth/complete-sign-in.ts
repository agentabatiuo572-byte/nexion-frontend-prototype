import { navReset } from "@/lib/route";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
import { readAccountSessionRecords, useSession } from "@/store/session";
import { useSponsorship } from "@/store/sponsorship";
import { rebindAccountScopedStores, captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { isPhoneAuthAccountId, resolveAuthAccountById } from "@/store/auth-account";
import { refreshEarningsReleaseStatus } from "@/store/earning-release";
import { refreshRemoteFleetAfterCatalog } from "@/lib/e3-fleet-bootstrap";
import { useProfile } from "@/store/profile";
import { authApi, onboardingCalibrationApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { hasNativeAndroidPhoneRuntime } from "@/lib/native-phone-runtime";
import { getDeviceId } from "@/lib/device-id";
import { hydrateCurrentProfileLocale } from "@/lib/locale-profile-sync-runtime";
import { afterLegalTermsAcknowledged, hasPendingLegalTermsRequirement, scheduleLegalTermsGate } from "@/lib/legal-terms-gate-runtime";
import type { UserSession } from "@/api/contracts";
import type { LocaleCode } from "@/i18n";
import { resolvePostSignInRoute } from "@/auth/post-sign-in-route";

interface CompleteSignInOptions {
  identity: string;
  returnTo?: string | null;
  sponsorCode?: string | null;
  idempotencyKey?: string | null;
  onboardingComplete?: boolean;
  /** Required in server mode: this is the only identity projection authority. */
  serverProfile?: UserSession;
  /** Exact vault epoch issued by authApi; protects a later account from cleanup. */
  serverSessionRevision?: number;
  /** Registration needs to show its success interstitial before onboarding routing. */
  deferNavigation?: boolean;
  /** Only a registration uses its form language to initialize the new profile. */
  registrationLocale?: LocaleCode;
}

interface CompletedSignIn {
  identity: string;
  requiresRecalibration: boolean;
  completedAt: number;
}

export type CompleteSignInResult =
  | { ok: true }
  | { ok: false; error: CompleteSignInResultError };

type CompleteSignInResultError = "account_directory_unavailable" | "account_not_found" | "account_pending" | "sign_in_conflict" | "sign_in_storage_unavailable" | "SERVER_PROFILE_REQUIRED";

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const COMPLETED_SIGN_INS_KEY = "__nexgridAuthCompletedSignIns";
const runtimeScope = globalThis as unknown as Record<string, unknown>;
const completedSignIns = runtimeScope[COMPLETED_SIGN_INS_KEY] instanceof Map
  ? runtimeScope[COMPLETED_SIGN_INS_KEY] as Map<string, CompletedSignIn>
  : new Map<string, CompletedSignIn>();
runtimeScope[COMPLETED_SIGN_INS_KEY] = completedSignIns;

export function _devHasCompletedSignIn(idempotencyKey: string): boolean {
  return import.meta.env.DEV && completedSignIns.has(idempotencyKey);
}

/**
 * ⚠️ MOCK-ONLY CROSS-STORE MUTATION：密码登录、OTP 登录和注册入口老号共用链。
 * PROD 由主 PRD 既有 `POST /api/auth/login` / `POST /api/auth/otp/verify` /
 * `POST /api/auth/password/reset` 原子校验账号目录、创建 session、处理 sponsor
 * first-wins 并返回 canonical session；client 只消费该结果。mock 顺序：先写
 * auth，再绑定 app 与所有账号域 store，再 claim/resume session，最后绑定 sponsor；
 * 任一持久化校验失败都会清 session/auth 并重绑 default，绝不保留半登录态，然后
 * 才按 recalibration/returnTo 路由。注册成功与 onboarding 由注册入口独立负责，
 * 不能由登录时的 onboarding 状态触发。内存 idempotency key 仅防响应重试
 * 重复 claim session，不替代服务端事务。
 */
export function completeSignIn(options: CompleteSignInOptions): CompleteSignInResult {
  const auth = useAuth();
  const app = useApp();
  const session = useSession();
  const sponsorship = remoteApiEnabled ? null : useSponsorship();
  const failRemoteCompletion = (error: CompleteSignInResultError): CompleteSignInResult => {
    if (remoteApiEnabled) {
      if (typeof options.serverSessionRevision === "number") {
        authApi.discardSessionIfCurrent(options.serverSessionRevision);
      } else {
        // Legacy/manual call sites have no issued epoch. Restrict cleanup to
        // the requested user rather than risking a different active account.
        authApi.discardSessionForIdentity(options.identity);
      }
    }
    return { ok: false, error };
  };
  const abortSignIn = (): CompleteSignInResult => {
    session.signOutSession();
    auth.signOut();
    app.bindAccount("default");
    rebindAccountScopedStores("default");
    return failRemoteCompletion("sign_in_storage_unavailable");
  };

  // Do not promote a server session into a browser-owned demo profile. A
  // missing authority projection remains an honest empty state and blocks
  // entry rather than reviving a local seed.
  if (remoteApiEnabled && !options.serverProfile) return failRemoteCompletion("SERVER_PROFILE_REQUIRED");

  // Remote identities are issued by the server and deliberately do not exist
  // in the mock-only phone directory.  Binding them to that browser table
  // would reject every genuine login/registration and invite a local fallback.
  // The server user must instead match the account identity exactly.
  let onboardingComplete: boolean;
  if (remoteApiEnabled) {
    if (!options.serverProfile || options.identity !== `user:${options.serverProfile.userId}`) {
      return failRemoteCompletion("SERVER_PROFILE_REQUIRED");
    }
    onboardingComplete = options.onboardingComplete ?? false;
  } else {
    // 手机号账号必须先恢复目录里的 canonical 状态。pending 绝不能借普通
    // 密码/OTP 登录拿到 auth/session；active 的 onboarding 事实也不能由调用方覆盖。
    const accountLookup = resolveAuthAccountById(options.identity);
    if (!accountLookup.ok) return { ok: false, error: accountLookup.error };
    if (isPhoneAuthAccountId(options.identity) && accountLookup.account?.status !== "active") {
      return { ok: false, error: accountLookup.account ? "account_pending" : "account_not_found" };
    }
    if (accountLookup.account?.status === "pending") return { ok: false, error: "account_pending" };
    onboardingComplete = accountLookup.account?.onboardingComplete ?? options.onboardingComplete ?? true;
  }

  const now = Date.now();
  for (const [key, result] of completedSignIns) {
    if (now - result.completedAt > IDEMPOTENCY_TTL_MS) completedSignIns.delete(key);
  }

  const idempotencyKey = options.idempotencyKey ?? null;
  const completed = idempotencyKey ? completedSignIns.get(idempotencyKey) : null;
  if (completed && completed.identity !== options.identity) {
    return remoteApiEnabled ? failRemoteCompletion("sign_in_conflict") : { ok: false, error: "sign_in_conflict" };
  }

  let requiresRecalibration = completed?.requiresRecalibration ?? false;
  const completionStillApplied = !!completed
    && auth.isAuthenticated
    && auth.accountId === options.identity
    && session.accountKey === options.identity
    && session.status === "active";
  if (!completionStillApplied) {
    if (!auth.signIn(options.identity, onboardingComplete)) {
      return remoteApiEnabled ? failRemoteCompletion("sign_in_storage_unavailable") : { ok: false, error: "sign_in_storage_unavailable" };
    }
    app.bindAccount(options.identity);
    rebindAccountScopedStores(options.identity);
    if (completed) {
      const resumed = session.resumeOrClaim(options.identity);
      ({ requiresRecalibration } = resumed.status === "active" ? resumed : session.claim(options.identity));
    } else {
      ({ requiresRecalibration } = session.claim(options.identity));
    }
    if (!readAccountSessionRecords(options.identity).some((record) => record.sessionId === session.sessionId)) {
      return abortSignIn();
    }
    if (!remoteApiEnabled && options.sponsorCode && !sponsorship?.bind(options.sponsorCode)) {
      return abortSignIn();
    }
    if (idempotencyKey) {
      completedSignIns.set(idempotencyKey, { identity: options.identity, requiresRecalibration, completedAt: now });
    }
  } else if (auth.onboardingComplete !== onboardingComplete) {
    if (!auth.signIn(options.identity, onboardingComplete)) {
      return remoteApiEnabled ? failRemoteCompletion("sign_in_storage_unavailable") : { ok: false, error: "sign_in_storage_unavailable" };
    }
  }
  // Apply on every accepted server login, including a token-refresh/retry that
  // reused the same completion key. This prevents an earlier browser profile
  // from surviving a cross-account or refreshed server identity.
  if (remoteApiEnabled && options.serverProfile) {
    app.projectServerIdentity(options.serverProfile);
    useProfile().projectServerIdentity(options.serverProfile);
    // Account language is hydrated before any server write. An explicit picker
    // selection made during this read wins; a device default never overwrites
    // the account preference merely because the user signed in.
    hydrateCurrentProfileLocale(options.registrationLocale);
    // Logout disarms the phone poll. A same-process login can reLaunch without
    // another App.onShow, so rearm only after this server session is accepted.
    app.setRemoteTaskForeground(true);
  }
  // Login completion is a re-ack checkpoint. The helper fences its request to
  // this exact bearer/account and only starts business reads after the server
  // confirms the current version is acknowledged.
  if (remoteApiEnabled && options.serverProfile) {
    const expectedUserId = options.serverProfile.userId;
    afterLegalTermsAcknowledged(async () => {
      const current = sessionVault.read();
      if (!current || current.user.userId !== expectedUserId) return;
      if (hasPendingLegalTermsRequirement()) return false;
      if (hasNativeAndroidPhoneRuntime()) {
        const phoneScope = captureAccountScope();
        let phoneStatus = "UNAVAILABLE";
        try { phoneStatus = await onboardingCalibrationApi.phoneLogin(getDeviceId()); } catch { /* The phone screen owns retry; other assets remain available. */ }
        const latest = sessionVault.read();
        if (!isCurrentAccountScope(phoneScope) || !latest || latest.user.userId !== expectedUserId) return;
        if (hasPendingLegalTermsRequirement()) return false;
        if (phoneStatus === "BOUND") session.markCalibrated(options.identity);
        if (phoneStatus !== "BOUND" && !options.deferNavigation) {
          void navReset({ url: "/pages/onboarding/connect?mode=login", fail: () => {} });
        }
      }
      // App.onShow is not guaranteed after an H5 reLaunch. Complete the
      // canonical catalogue/fleet bootstrap only after the legal boundary.
      void app.refreshHomeTruth();
      void refreshRemoteFleetAfterCatalog(options.identity);
      // A failed request leaves the snapshot unavailable and withdrawal still
      // fails closed at the server endpoint.
      void refreshEarningsReleaseStatus(options.identity).catch(() => {});
    });
    void scheduleLegalTermsGate(options.returnTo ?? "/pages/index/index");
  }
  const dest = resolvePostSignInRoute({
    onboardingComplete: auth.onboardingComplete,
    requiresRecalibration,
    returnTo: options.returnTo,
    deferNavigation: options.deferNavigation,
  });
  if (!dest) return { ok: true };
  void navReset(dest);
  return { ok: true };
}
