import { normalizeAccountKey } from "@/store/account-cloud";
import {
  readRiskRecordsStrict,
  sealLegacyRiskRegistryForAuthDirectory,
} from "@/store/risk-identity";
import type { RiskIdentityRecord } from "@/store/risk-identity";
import type { EarningBucketRoute } from "@/store/types";

// ⚠️ MOCK-ONLY: `POST /api/auth/otp/verify` 内部账号分流与手机号唯一索引的本地
// 目录。PRD 只高层列出注册能力，具体注册 endpoint/回执契约仍 TBD；PROD 应由
// 认证服务/数据库原子替换（candidate: `POST /api/auth/register`）。client session、
// account-cloud、risk registry 都不是账号是否存在的长期事实源。
export const AUTH_ACCOUNT_STORAGE_KEY = "nexgrid-auth-accounts-v1";
/**
 * 旧风险表(schema1)迁目录时的短期事务日志。它只允许补完一个已确认的 legacy
 * 迁移，不能用于重建 schema2 正常运行期被删掉的手机号目录。
 */
export const AUTH_ACCOUNT_LEGACY_MIGRATION_KEY = "nexgrid-auth-accounts-legacy-migration-v1";

export interface AuthAccountRecord {
  accountId: string;
  phoneE164: string;
  createdAt: number;
  status: "pending" | "active";
  onboardingComplete: boolean;
  registration: AuthRegistrationContext | null;
}

export interface AuthRegistrationContext {
  sponsorCode: string | null;
  giftRoute: EarningBucketRoute;
  giftUsdt: number;
  giftNex: number;
  giftRef: string;
}

interface AuthAccountRegistry {
  schema: 2;
  migratedLegacy: true;
  byPhone: Record<string, AuthAccountRecord>;
}

interface LegacyMigrationJournal {
  schema: 1;
  source: "risk-registry-schema1";
  /** pending 仅允许补写 legacy 目录；committed 后目录缺失一律失败关闭。 */
  state: "risk-sealed-pending-directory" | "directory-committed";
}

export type AuthAccountLookup =
  | { ok: true; account: AuthAccountRecord | null }
  | { ok: false; error: "account_directory_unavailable" };

export type AuthAccountReservation =
  | { ok: true; account: AuthAccountRecord; alreadyReserved: boolean }
  | { ok: false; error: "account_exists"; account: AuthAccountRecord }
  | { ok: false; error: "invalid_phone" | "account_directory_unavailable" | "registration_blocked" };

export type AuthAccountActivation =
  | { ok: true; account: AuthAccountRecord; alreadyActive: boolean }
  | { ok: false; error: "reservation_missing" | "account_directory_unavailable" };

const PHONE_RE = /^\+\d{6,15}$/;
const LEGACY_ACCOUNT_RE = /^(\+\d{6,15})@demo\.nexgrid\.ai$/;

/** 手机号目录身份的判别只在认证边界使用，避免残留 auth snapshot 绕过目录。 */
export function isPhoneAuthAccountId(raw: string): boolean {
  return LEGACY_ACCOUNT_RE.test(normalizeAccountKey(raw));
}

export function normalizeAuthPhone(raw: string): string | null {
  const phone = raw.replace(/\s+/g, "");
  return PHONE_RE.test(phone) ? phone : null;
}

export function authAccountKeyForPhone(raw: string): string | null {
  const phone = normalizeAuthPhone(raw);
  return phone ? normalizeAccountKey(`${phone}@demo.nexgrid.ai`) : null;
}

function writeRegistry(registry: AuthAccountRegistry): boolean {
  try {
    uni.setStorageSync(AUTH_ACCOUNT_STORAGE_KEY, registry);
    return true;
  } catch {
    return false;
  }
}

function isLegacyMigrationJournal(raw: unknown): raw is LegacyMigrationJournal {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Partial<LegacyMigrationJournal>;
  return value.schema === 1
    && value.source === "risk-registry-schema1"
    && (value.state === "risk-sealed-pending-directory" || value.state === "directory-committed");
}

function readLegacyMigrationJournal(): LegacyMigrationJournal | null {
  try {
    const raw = uni.getStorageSync(AUTH_ACCOUNT_LEGACY_MIGRATION_KEY) as unknown;
    return isLegacyMigrationJournal(raw) ? raw : null;
  } catch {
    return null;
  }
}

function beginLegacyMigration(): boolean {
  try {
    uni.setStorageSync(AUTH_ACCOUNT_LEGACY_MIGRATION_KEY, {
      schema: 1,
      source: "risk-registry-schema1",
      state: "risk-sealed-pending-directory",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 目录已成功写入后，先持久化 commit 栅栏再允许读到账号。若该写失败，目录虽在
 * 也必须暂时不可用；否则目录随后被删时，残留 pending 日志会把账号错误复活。
 */
function commitLegacyMigration(journal: LegacyMigrationJournal): boolean {
  if (journal.state === "directory-committed") return true;
  try {
    uni.setStorageSync(AUTH_ACCOUNT_LEGACY_MIGRATION_KEY, { ...journal, state: "directory-committed" });
    return true;
  } catch {
    return false;
  }
}

function clearLegacyMigration(): boolean {
  try {
    uni.removeStorageSync(AUTH_ACCOUNT_LEGACY_MIGRATION_KEY);
    return true;
  } catch {
    // commit 栅栏已经落盘时，保留它比吞掉状态更安全；下次正常读会再尝试清理。
    return false;
  }
}

function isRegistrationContext(raw: unknown): raw is AuthRegistrationContext {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Partial<AuthRegistrationContext>;
  return (
    (value.sponsorCode === null || typeof value.sponsorCode === "string")
    && (value.giftRoute === "withdrawable" || value.giftRoute === "pending_review" || value.giftRoute === "bonus_locked" || value.giftRoute === "no_issue")
    && Number.isFinite(value.giftUsdt)
    && Number.isFinite(value.giftNex)
    && (value.giftUsdt as number) >= 0
    && (value.giftNex as number) >= 0
    && typeof value.giftRef === "string"
    && value.giftRef.length > 0
  );
}

function isRegistry(raw: unknown): raw is AuthAccountRegistry {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Partial<AuthAccountRegistry>;
  if (
    candidate.schema !== 2
    || candidate.migratedLegacy !== true
    || !candidate.byPhone
    || typeof candidate.byPhone !== "object"
    || Array.isArray(candidate.byPhone)
  ) {
    return false;
  }
  return Object.entries(candidate.byPhone).every(([phone, record]) => (
    PHONE_RE.test(phone)
    && !!record
    && typeof record === "object"
    && record.phoneE164 === phone
    && record.accountId === authAccountKeyForPhone(phone)
    && Number.isFinite(record.createdAt)
    && (record.status === "pending" || record.status === "active")
    && typeof record.onboardingComplete === "boolean"
    && (record.registration === null || isRegistrationContext(record.registration))
  ));
}

interface InitializedRegistry {
  registry: AuthAccountRegistry;
  clearLegacyMigration: boolean;
}

function legacyRegistryFromRiskRecords(riskRecords: RiskIdentityRecord[]): AuthAccountRegistry {
  const byPhone: Record<string, AuthAccountRecord> = {};
  for (const record of riskRecords) {
    const accountId = normalizeAccountKey(record.accountKey);
    const match = LEGACY_ACCOUNT_RE.exec(accountId);
    if (!match) continue;
    const phoneE164 = match[1];
    byPhone[phoneE164] = {
      accountId,
      phoneE164,
      createdAt: record.registeredAt,
      status: "active",
      onboardingComplete: true,
      registration: null,
    };
  }
  return { schema: 2, migratedLegacy: true, byPhone };
}

function initializeMissingRegistry(): InitializedRegistry | null {
  const risk = readRiskRecordsStrict();
  if (!risk.ok) return null;
  if (risk.sourceSchema === "empty") return { registry: { schema: 2, migratedLegacy: true, byPhone: {} }, clearLegacyMigration: false };

  // schema1 是目录上线前唯一可验证的 legacy 来源。先写事务日志，再升级风险表；
  // 随后的目录写入若因 quota/中断失败，下一次只凭该日志补完，避免旧账号被永久
  // 锁死。没有日志的 schema2 缺目录仍失败关闭，不能把 pending 注册误升 active。
  if (risk.sourceSchema === 1) {
    if (!beginLegacyMigration() || !sealLegacyRiskRegistryForAuthDirectory()) return null;
    return { registry: legacyRegistryFromRiskRecords(risk.records), clearLegacyMigration: true };
  }
  if (readLegacyMigrationJournal()?.state !== "risk-sealed-pending-directory") return null;
  return { registry: legacyRegistryFromRiskRecords(risk.records), clearLegacyMigration: true };
}

function readRegistry(): AuthAccountRegistry | null {
  try {
    const raw = uni.getStorageSync(AUTH_ACCOUNT_STORAGE_KEY) as unknown;
    const missing = raw === "" || raw === null || raw === undefined;
    if (!missing) {
      if (!isRegistry(raw)) return null;
      const journal = readLegacyMigrationJournal();
      // 目录存在却仍是 pending，代表上次在「目录写入 → commit 栅栏」之间中断；
      // 必须先完成 commit，不能把这个中间态当作已可登录。
      if (journal?.state === "risk-sealed-pending-directory" && !commitLegacyMigration(journal)) return null;
      // 已 commit 的残留日志可以安全清理；清理失败仍保留 fail-closed 栅栏。
      if (journal?.state === "directory-committed" || journal?.state === "risk-sealed-pending-directory") clearLegacyMigration();
      return raw;
    }
    const initialized = initializeMissingRegistry();
    if (!initialized || !writeRegistry(initialized.registry)) return null;
    if (initialized.clearLegacyMigration) {
      const journal = readLegacyMigrationJournal();
      if (!journal || !commitLegacyMigration(journal)) return null;
      clearLegacyMigration();
    }
    return initialized.registry;
  } catch {
    return null;
  }
}

export function resolveAuthAccount(rawPhone: string): AuthAccountLookup {
  const phone = normalizeAuthPhone(rawPhone);
  if (!phone) return { ok: true, account: null };
  const registry = readRegistry();
  if (!registry) return { ok: false, error: "account_directory_unavailable" };
  const account = registry.byPhone[phone];
  return { ok: true, account: account?.status === "active" ? account : null };
}

/** 登录收口读取手机号账号的真实状态；非手机号演示身份不受目录约束。 */
export function resolveAuthAccountById(rawAccountId: string): AuthAccountLookup {
  const accountId = normalizeAccountKey(rawAccountId);
  const match = LEGACY_ACCOUNT_RE.exec(accountId);
  if (!match) return { ok: true, account: null };
  const registry = readRegistry();
  if (!registry) return { ok: false, error: "account_directory_unavailable" };
  return { ok: true, account: registry.byPhone[match[1]] ?? null };
}

/**
 * 注册提交端的 pending 保留位。只有 finalize 成 active 后，OTP 分流才把它认作老号；
 * 中断留下的 pending 会继续注册，不会借 signIn 跳过 K1 / onboarding。
 * MOCK ceiling：同步临界区只覆盖当前 JS 上下文；跨 H5 标签页的唯一性必须由
 * 生产认证服务的数据库唯一索引 + 事务保证，不能把 localStorage 当 CAS 使用。
 */
export function reserveAuthAccount(
  rawPhone: string,
  registration: AuthRegistrationContext,
  allowCreate = true,
): AuthAccountReservation {
  const phoneE164 = normalizeAuthPhone(rawPhone);
  if (!phoneE164 || !isRegistrationContext(registration)) return { ok: false, error: "invalid_phone" };
  const registry = readRegistry();
  if (!registry) return { ok: false, error: "account_directory_unavailable" };
  const existing = registry.byPhone[phoneE164];
  if (existing?.status === "active") return { ok: false, error: "account_exists", account: existing };
  if (existing?.status === "pending") return { ok: true, account: existing, alreadyReserved: true };
  if (!allowCreate) return { ok: false, error: "registration_blocked" };

  const accountId = authAccountKeyForPhone(phoneE164) as string;
  const account: AuthAccountRecord = {
    accountId,
    phoneE164,
    createdAt: Date.now(),
    status: "pending",
    onboardingComplete: false,
    registration,
  };
  const next: AuthAccountRegistry = {
    ...registry,
    byPhone: { ...registry.byPhone, [phoneE164]: account },
  };
  if (!writeRegistry(next)) return { ok: false, error: "account_directory_unavailable" };
  return { ok: true, account, alreadyReserved: false };
}

/** 全部注册副作用完成后的最终激活点；active 才是账号存在性事实。 */
export function activateReservedAuthAccount(rawPhone: string, expectedAccountId: string): AuthAccountActivation {
  const phoneE164 = normalizeAuthPhone(rawPhone);
  const registry = readRegistry();
  if (!phoneE164 || !registry) return { ok: false, error: "account_directory_unavailable" };
  const account = registry.byPhone[phoneE164];
  if (!account || account.accountId !== expectedAccountId) return { ok: false, error: "reservation_missing" };
  if (account.status === "active") return { ok: true, account, alreadyActive: true };
  const active: AuthAccountRecord = { ...account, status: "active" };
  const next: AuthAccountRegistry = {
    ...registry,
    byPhone: { ...registry.byPhone, [phoneE164]: active },
  };
  if (!writeRegistry(next)) return { ok: false, error: "account_directory_unavailable" };
  return { ok: true, account: active, alreadyActive: false };
}

/** Onboarding 的服务端事实镜像；不存在手机号目录的演示/历史账号无需写本表。 */
export function markAuthAccountOnboardingComplete(rawAccountId: string): boolean {
  const accountId = normalizeAccountKey(rawAccountId);
  const registry = readRegistry();
  if (!registry) return false;
  const entry = Object.entries(registry.byPhone).find(([, account]) => account.accountId === accountId);
  if (!entry) return true;
  const [phoneE164, account] = entry;
  if (account.status !== "active") return false;
  if (account.onboardingComplete) return true;
  const next: AuthAccountRegistry = {
    ...registry,
    byPhone: { ...registry.byPhone, [phoneE164]: { ...account, onboardingComplete: true } },
  };
  return writeRegistry(next);
}

/** DEV/runtime 验收只读口。 */
export function inspectAuthAccounts(): AuthAccountRecord[] {
  const registry = readRegistry();
  return registry ? Object.values(registry.byPhone).filter((account) => account.status === "active") : [];
}

/** Mock-only account deletion: remove the canonical phone-directory row. */
export function deleteAuthAccount(rawAccountId: string): { ok: true; phoneE164: string } | { ok: false } {
  const accountId = normalizeAccountKey(rawAccountId);
  const registry = readRegistry();
  if (!registry) return { ok: false };
  const entry = Object.entries(registry.byPhone).find(([, account]) => account.accountId === accountId);
  if (!entry) return { ok: false };
  const [phoneE164] = entry;
  const byPhone = { ...registry.byPhone };
  delete byPhone[phoneE164];
  if (!writeRegistry({ ...registry, byPhone })) return { ok: false };
  return { ok: true, phoneE164 };
}
