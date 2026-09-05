import { rebindAccountScopedStores } from "@/lib/account-scope";
import { useApp } from "@/store/app";
import { resolveAuthAccountById } from "@/store/auth-account";
import { useAuth } from "@/store/auth";
import { readAccountSessionRecords, useSession } from "@/store/session";
import { refreshEarningsReleaseStatus } from "@/store/earning-release";

/**
 * ⚠️ MOCK-ONLY CROSS-STORE MUTATION：恢复 active 新账号的本地登录收口。
 * 顺序为 active 目录校验 → app 绑定/账户作用域重绑 → auth signUp → session
 * resume/claim → session 持久化复核。任一步失败会 signOut auth/session，并回到
 * default 账户作用域。注册首次完成与 finalize 响应丢失重试共用此链，不复制活跃
 * session。PROD 注册 endpoint/回执契约仍 TBD；客户端只重绑服务端原子回执。
 */
export function restoreActivatedRegistrationSession(accountId: string): boolean {
  const account = resolveAuthAccountById(accountId);
  if (!account.ok || account.account?.status !== "active") return false;
  const app = useApp();
  const auth = useAuth();
  const session = useSession();
  const abortRestore = (): boolean => {
    session.signOutSession();
    auth.signOut();
    app.bindAccount("default");
    rebindAccountScopedStores("default");
    return false;
  };
  app.bindAccount(accountId);
  rebindAccountScopedStores(accountId);
  if (!auth.signUp(accountId)) return abortRestore();
  const resumed = session.resumeOrClaim(accountId);
  if (resumed.status !== "active") session.claim(accountId);
  const sessionPersisted = readAccountSessionRecords(accountId)
    .some((record) => record.sessionId === session.sessionId);
  if (!sessionPersisted) return abortRestore();
  void refreshEarningsReleaseStatus(accountId).catch(() => {});
  return true;
}
