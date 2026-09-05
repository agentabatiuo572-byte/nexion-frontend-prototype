import type { AuthApi } from "./auth-api";
import type { SessionSnapshot, SessionVault } from "./session-vault";
import type { UserSession } from "./contracts";
import { ApiError } from "./errors";
import { normalizeAccountKey } from "@/store/account-cloud";
import { deleteAuthAccount } from "@/store/auth-account";
import { clearAuthOtpStateForPhone } from "@/store/auth-otp";
import { removeAccountScopedPersistentState } from "@/store/account-scoped-storage";

/**
 * mock 档的本地 AuthApi 实现(主人 2026-08-15 拍板包 zm T0)。
 *
 * 背景:服务端权威化批次后 auth 全链 server-backed,mock 客户端对一切调用抛
 * REMOTE_API_DISABLED_IN_MOCK_MODE —— 注册/登录在演示档彻底不可用(只能存储注入绕过)。
 * 本文件按「Mock 100% 真后台结构」不变量补上 mock 层实现:**接口契约与真实现逐方法对齐**
 * (含 vault 乐观并发/丢弃语义),切回 sandbox/remote 档零改动。
 *
 * 演示语义(产品面不露 demo):
 * - 验证码:挑战号本地签发,任意 6 位数字通过(老演示约定;文案仍是「输入 6 位验证码」)。
 * - OTP 登录未注册号码自动开户(演示不设死胡同);密码登录仍校验已设密码。
 * - userId 由 国家码+号码 稳定派生 —— 同一手机号跨会话同一账号,account-cloud 按此自初始化。
 */

interface MockUserRecord {
  userId: number;
  password: string | null;
  nickname: string;
  twoFactorEnabled?: boolean;
}

interface MockUserRegistry {
  schema: 1;
  users: Record<string, MockUserRecord>;
}

const REGISTRY_KEY = "nexgrid-mock-auth-users-v1";

function identityOf(countryCode: string, phone: string): string {
  return `${countryCode} ${phone}`.trim();
}

/** 稳定正整数 userId(djb2):同号码跨会话不变,避免本地账本换主。 */
function deriveUserId(identity: string): number {
  let h = 5381;
  for (let i = 0; i < identity.length; i++) h = ((h * 33) ^ identity.charCodeAt(i)) >>> 0;
  return (h % 2_000_000_000) + 1_000_000;
}

function maskedHint(phone: string): string {
  const tail = phone.slice(-4);
  return `••• ${tail}`;
}

function loadRegistry(): MockUserRegistry {
  try {
    const raw = uni.getStorageSync(REGISTRY_KEY) as MockUserRegistry | "";
    if (raw && raw.schema === 1 && raw.users && typeof raw.users === "object") return raw;
  } catch {
    // first run / storage unavailable
  }
  return { schema: 1, users: {} };
}

function saveRegistry(reg: MockUserRegistry): boolean {
  try {
    uni.setStorageSync(REGISTRY_KEY, reg);
    return true;
  } catch {
    // storage unavailable — session survives in memory via vault only
    return false;
  }
}

function ensureUser(reg: MockUserRegistry, countryCode: string, phone: string): MockUserRecord {
  const id = identityOf(countryCode, phone);
  const existing = reg.users[id];
  if (existing) return existing;
  const created: MockUserRecord = { userId: deriveUserId(id), password: null, nickname: phone.slice(-4) };
  reg.users[id] = created;
  saveRegistry(reg);
  return created;
}

function assertSixDigit(code: string): void {
  if (!/^\d{6}$/.test(code)) {
    throw new ApiError({ kind: "business", message: "OTP_CODE_INVALID" });
  }
}

function snapshotFor(user: UserSession): SessionSnapshot {
  return {
    accessToken: `mock-access-${user.userId}-${Date.now()}`,
    refreshToken: `mock-refresh-${user.userId}`,
    tokenType: "Bearer",
    user,
  };
}

function sessionUser(countryCode: string, phone: string, rec: MockUserRecord): UserSession {
  return { userId: rec.userId, countryCode, phone, nickname: rec.nickname };
}

function accountIdForIdentity(identity: string): string {
  const compact = identity.replace(/\s+/g, "");
  return normalizeAccountKey(`${compact}@demo.nexgrid.ai`);
}

function findUser(reg: MockUserRegistry, accountId: string): { identity: string; record: MockUserRecord } | null {
  const normalized = normalizeAccountKey(accountId);
  const entry = Object.entries(reg.users).find(([identity, record]) =>
    accountIdForIdentity(identity) === normalized || `user:${record.userId}` === normalized,
  );
  return entry ? { identity: entry[0], record: entry[1] } : null;
}

function requireMockUser(accountId: string): { registry: MockUserRegistry; identity: string; record: MockUserRecord } {
  const registry = loadRegistry();
  const found = findUser(registry, accountId);
  if (!found) throw new ApiError({ kind: "business", message: "USER_INVALID_CREDENTIALS" });
  return { registry, ...found };
}

export function mockAuthSecurityState(accountId: string): { twoFactorEnabled: boolean } | null {
  const found = findUser(loadRegistry(), accountId);
  return found ? { twoFactorEnabled: found.record.twoFactorEnabled === true } : null;
}

export function changeMockAuthPassword(accountId: string, currentPassword: string, newPassword: string): void {
  const found = requireMockUser(accountId);
  if (!found.record.password || found.record.password !== currentPassword) {
    throw new ApiError({ kind: "business", message: "USER_INVALID_CREDENTIALS" });
  }
  found.record.password = newPassword;
  saveRegistry(found.registry);
}

export function setMockAuthTwoFactor(accountId: string, enabled: boolean, currentPassword: string): void {
  const found = requireMockUser(accountId);
  if (!found.record.password || found.record.password !== currentPassword) {
    throw new ApiError({ kind: "business", message: "USER_INVALID_CREDENTIALS" });
  }
  found.record.twoFactorEnabled = enabled;
  saveRegistry(found.registry);
}

/** Delete the mock auth account plus every account-keyed local projection. */
export function deleteMockAuthAccount(accountId: string): boolean {
  const found = findUser(loadRegistry(), accountId);
  if (!found) return false;
  deleteAuthAccount(accountId);
  const registry = loadRegistry();
  delete registry.users[found.identity];
  saveRegistry(registry);
  // OTP uses compact E.164. Keep the spaced legacy form as well for older
  // records that were written before the identity normalizer was introduced.
  clearAuthOtpStateForPhone(found.identity.replace(/\s+/g, ""));
  clearAuthOtpStateForPhone(found.identity);
  removeAccountScopedPersistentState(accountId);
  // The mock auth registry is the primary login authority; a missing legacy
  // phone-directory row is harmless for accounts created through the newer
  // password path, so deletion succeeds after the user row is removed.
  return true;
}

let challengeSeq = 0;
const twoFactorChallenges = new Map<string, { identity: string; expiresAt: number }>();

/**
 * 注册页 mock 分支(legacy 本地链)完成时同步写入本注册表 —— 否则密码登录结构性死路:
 * legacy 账号目录(nexgrid-auth-accounts-v1)不存密码,login() 永远查无此人(独立验收 F2)。
 */
export function registerMockAuthCredential(countryCode: string, phone: string, password: string): void {
  const reg = loadRegistry();
  const rec = ensureUser(reg, countryCode, phone);
  rec.password = password;
  rec.twoFactorEnabled = rec.twoFactorEnabled === true;
  saveRegistry(reg);
}

/**
 * Fixed-preview seed: restore a deterministic local credential and remove any
 * optional 2FA challenge so the reusable account can never strand the demo at
 * registration/login. This is deliberately separate from normal registration,
 * which must preserve a user's 2FA choice.
 */
export function provisionMockAuthCredential(countryCode: string, phone: string, password: string): boolean {
  const reg = loadRegistry();
  const rec = ensureUser(reg, countryCode, phone);
  rec.password = password;
  rec.twoFactorEnabled = false;
  return saveRegistry(reg);
}

export function createMockAuthApi(vault: SessionVault): AuthApi {
  const issueChallenge = () => ({
    challengeNo: `MOCK-CH-${++challengeSeq}`,
    resendAfterSec: 60,
  });
  const persistLogin = (user: UserSession, revision: number): { kind: "authenticated"; user: UserSession; vaultRevision: number } => {
    // 与真实现同语义:以进入时的 revision 做乐观写;并发被抢先则按脏会话拒绝。
    if (!vault.saveIfUnchanged(snapshotFor(user), revision)) {
      throw new ApiError({ kind: "protocol", message: "SESSION_VAULT_CONFLICT" });
    }
    return { kind: "authenticated", user, vaultRevision: vault.revision() };
  };
  const discardSessionIfCurrent = (expectedRevision: number): void => {
    if (vault.revision() !== expectedRevision) return;
    if (!vault.read()) return;
    vault.clearIfUnchanged(expectedRevision);
  };

  return {
    async login(request) {
      const reg = loadRegistry();
      const rec = reg.users[identityOf(request.countryCode, request.phone)];
      if (!rec || rec.password === null || rec.password !== request.password) {
        // 错误码钉页面契约名(login.vue 映射 USER_INVALID_CREDENTIALS;独立验收 F3:
        // 自造码会落兜底「服务不可用」,连「手机号或密码不正确」都显不出来)。
        throw new ApiError({ kind: "business", message: "USER_INVALID_CREDENTIALS" });
      }
      if (rec.twoFactorEnabled === true) {
        const challengeNo = `MOCK-2FA-${++challengeSeq}`;
        twoFactorChallenges.set(challengeNo, { identity: identityOf(request.countryCode, request.phone), expiresAt: Date.now() + 5 * 60 * 1000 });
        return {
          kind: "challenge",
          user: sessionUser(request.countryCode, request.phone, rec),
          challengeNo,
          deliveryHint: maskedHint(request.phone),
        };
      }
      return persistLogin(sessionUser(request.countryCode, request.phone, rec), vault.revision());
    },
    async sendLoginOtp(request) {
      return { ...issueChallenge(), deliveryHint: maskedHint(request.phone) };
    },
    async completeOtpLogin(request) {
      assertSixDigit(request.code);
      const reg = loadRegistry();
      const rec = ensureUser(reg, request.countryCode, request.phone);
      return persistLogin(sessionUser(request.countryCode, request.phone, rec), vault.revision());
    },
    async sendPasswordResetOtp(request) {
      return { ...issueChallenge(), deliveryHint: maskedHint(request.phone) };
    },
    async completePasswordReset(request) {
      assertSixDigit(request.code);
      const reg = loadRegistry();
      const rec = ensureUser(reg, request.countryCode, request.phone);
      rec.password = request.newPassword;
      saveRegistry(reg);
      return { status: "PASSWORD_RESET", revokedSessionCount: 0 };
    },
    async completeTwoFactor(request) {
      assertSixDigit(request.code);
      const challenge = twoFactorChallenges.get(request.challengeNo);
      const identity = identityOf(request.countryCode, request.phone);
      if (!challenge || challenge.identity !== identity || challenge.expiresAt <= Date.now()) {
        twoFactorChallenges.delete(request.challengeNo);
        throw new ApiError({ kind: "business", message: "USER_TWO_FACTOR_CHALLENGE_INVALID" });
      }
      const reg = loadRegistry();
      const rec = reg.users[identity];
      if (!rec || rec.password !== request.password || rec.twoFactorEnabled !== true) {
        throw new ApiError({ kind: "business", message: "USER_INVALID_CREDENTIALS" });
      }
      twoFactorChallenges.delete(request.challengeNo);
      return persistLogin(sessionUser(request.countryCode, request.phone, rec), vault.revision());
    },
    async sendRegistrationOtp(request) {
      return { ...issueChallenge(), deliveryHint: maskedHint(request.phone) };
    },
    async register(request) {
      assertSixDigit(request.code);
      const reg = loadRegistry();
      const rec = ensureUser(reg, request.countryCode, request.phone);
      rec.password = request.password;
      rec.nickname = request.phone.slice(-4);
      saveRegistry(reg);
      return persistLogin(sessionUser(request.countryCode, request.phone, rec), vault.revision());
    },
    async oauthExchange() {
      // Mock mode has no external identity provider. Keep the full AuthApi
      // contract while failing closed if a caller bypasses the page-level gate.
      throw new ApiError({ kind: "business", message: "OAUTH_PROVIDER_UNAVAILABLE" });
    },
    async restore() {
      // 真实现走 refreshSession 换新 access token;mock 无服务端,本地重签同语义。
      const snapshot = vault.read();
      if (!snapshot?.refreshToken) return null;
      const renewed = snapshotFor(snapshot.user);
      vault.save(renewed);
      return renewed;
    },
    discardSessionIfCurrent(expectedRevision) {
      discardSessionIfCurrent(expectedRevision);
    },
    discardSessionForIdentity(identity) {
      const expectedRevision = vault.revision();
      const snapshot = vault.read();
      if (!snapshot) return;
      if (`user:${snapshot.user.userId}` !== identity) return;
      discardSessionIfCurrent(expectedRevision);
    },
    async logout() {
      twoFactorChallenges.clear();
      vault.clear();
    },
  };
}
