import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
import { readAccountSessionRecords, useSession } from "@/store/session";
import { useSponsorship } from "@/store/sponsorship";
import { rebindAccountScopedStores } from "@/lib/account-scope";
import { safeReturnTo } from "@/routing/safe-return-to";
import { isPhoneAuthAccountId, resolveAuthAccountById } from "@/store/auth-account";
import { refreshEarningsReleaseStatus } from "@/store/earning-release";
import { refreshRemoteFleetAfterCatalog } from "@/lib/e3-fleet-bootstrap";
import { useProfile } from "@/store/profile";
import { authApi, remoteApiEnabled } from "@/api/runtime";
import type { UserSession } from "@/api/contracts";

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
 * 才按 onboarding/recalibration/returnTo 路由。内存 idempotency key 仅防响应重试
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
  }
  // App.onShow is not guaranteed after an H5 reLaunch. Complete the fleet
  // bootstrap here as well. The catalog is the RunID authority for every
  // isolated sandbox store, so the wallet read must start only after that
  // attempt settles; firing both in parallel can make a valid first-login
  // wallet response stale and leave every Sandbox badge hidden until reload.
  if (remoteApiEnabled) {
    void refreshRemoteFleetAfterCatalog(options.identity).finally(() => {
      // authApi persisted this matching Bearer session before completeSignIn.
      // The store still rejects a failed/missing catalog or mismatched account.
      void app.refreshFundsSandboxForAccount(options.identity);
    });
  }
  // reLaunch does not reliably emit App.onShow in an existing H5 document.
  // Fetch the new account's server buckets here; a failed request leaves the
  // snapshot unavailable and the withdrawal endpoint still fails closed.
  void refreshEarningsReleaseStatus(options.identity).catch(() => {});
  if (options.deferNavigation) return { ok: true };
  if (!auth.onboardingComplete) {
    uni.reLaunch({
      url: "/pages/onboarding/estimator",
      fail: () => uni.reLaunch({ url: "/pages/onboarding/intro", fail: () => {} }),
    });
    return { ok: true };
  }
  if (requiresRecalibration) {
    uni.reLaunch({
      url: "/pages/onboarding/connect?mode=recalibrate",
      fail: () => uni.reLaunch({ url: "/pages/index/index", fail: () => {} }),
    });
    return { ok: true };
  }
  const dest = safeReturnTo(options.returnTo ?? null, "/pages/index/index");
  uni.reLaunch({ url: dest, fail: () => uni.reLaunch({ url: "/pages/index/index", fail: () => {} }) });
  return { ok: true };
}
