import { getDeviceId, getDeviceIdentity } from "@/lib/device-id";
import { normalizeAccountKey } from "@/store/account-cloud";
import { normalizeRefCode } from "@/store/sponsorship";
import { mockServerUuid } from "@/store/mock-id";

// SPEC-7 风险身份注册表 — mock K1 的数据层(单一事实来源)。
//
// ⚠️ MOCK-ONLY: PROD 里这张表活在服务端注册、推荐绑定、绑卡/提现事务(服务端落
// RiskIdentity,敏感值只存 hash);client 永远只收 K1 的结论摘要,不持有原始表。
// 当前 PRD 列出认证、推荐绑定与提现业务 endpoint，但没有公开的 RiskIdentity
// client endpoint；本模块不把任何本地函数冒充真实网络路由。
// 本模块与会话/账户云存储【故意分离】:普通登出、清会话不清风险注册表。
// 但清空整个 localStorage 会同时清掉本 mock 的风险证据，不能冒充持久反作弊；
// PROD 必须由服务端 RiskIdentity 表跨设备/网络保留并回溯关联维度。

const REGISTRY_KEY = "nexgrid-risk-registry-v1";
const IP_BUCKET_KEY = "nexgrid-ip-bucket-v1";

export interface RiskHashUse {
  hash: string;
  firstSeenAt: number;
}

export interface RiskIdentityRecord {
  accountKey: string;
  // client device id 只是 hint(证据),mock 里兼任 serverDeviceId 的位置。
  deviceHint: string;
  // mock 无真 IP: 同一浏览器环境 = 同一 IP 桶(独立持久 key,清库=换网络环境)。
  ipBucket: string;
  uaFingerprint: string;
  sponsorId: string | null;
  registeredAt: number;
  withdrawAddresses: RiskHashUse[];
  paymentInstruments: RiskHashUse[];
  // R2 冷启动保守: 首次提现标记。
  hasWithdrawn: boolean;
  // App 在线证明累计时长(ms)。settle() 在 App 载体、设备真在线时累加;
  // 达 config.riskCluster.appAttestationReleaseHours 即具备释放资格(R1)。
  attestedOnlineMs: number;
}

interface RiskRegistry {
  schema: 2;
  accounts: Record<string, RiskIdentityRecord>;
}

/** 目录上线前的风险表。schema 是唯一可验证的迁移来源，不从字段猜测。 */
interface LegacyRiskRegistry {
  schema: 1;
  accounts: Record<string, RiskIdentityRecord>;
}

type ReadableRiskRegistry = RiskRegistry | LegacyRiskRegistry;

export type StrictRiskRecordsResult =
  | { ok: true; sourceSchema: "empty" | 1 | 2; records: RiskIdentityRecord[] }
  | { ok: false; error: "risk_registry_unavailable" };

function isRiskHashUse(value: unknown): value is RiskHashUse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RiskHashUse>;
  return typeof candidate.hash === "string" && candidate.hash.length > 0 && Number.isFinite(candidate.firstSeenAt);
}

function isRiskIdentityRecord(record: unknown): record is RiskIdentityRecord {
  return !!record
    && typeof record === "object"
    && typeof (record as Partial<RiskIdentityRecord>).accountKey === "string"
    && typeof (record as Partial<RiskIdentityRecord>).deviceHint === "string"
    && typeof (record as Partial<RiskIdentityRecord>).ipBucket === "string"
    && typeof (record as Partial<RiskIdentityRecord>).uaFingerprint === "string"
    && ((record as Partial<RiskIdentityRecord>).sponsorId === null || typeof (record as Partial<RiskIdentityRecord>).sponsorId === "string")
    && Number.isFinite((record as Partial<RiskIdentityRecord>).registeredAt)
    && Array.isArray((record as Partial<RiskIdentityRecord>).withdrawAddresses)
    && (record as Partial<RiskIdentityRecord>).withdrawAddresses!.every(isRiskHashUse)
    && Array.isArray((record as Partial<RiskIdentityRecord>).paymentInstruments)
    && (record as Partial<RiskIdentityRecord>).paymentInstruments!.every(isRiskHashUse)
    && typeof (record as Partial<RiskIdentityRecord>).hasWithdrawn === "boolean"
    && Number.isFinite((record as Partial<RiskIdentityRecord>).attestedOnlineMs);
}

function isReadableRiskRegistry(raw: unknown): raw is ReadableRiskRegistry {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Partial<ReadableRiskRegistry>;
  return (candidate.schema === 1 || candidate.schema === 2)
    && !!candidate.accounts
    && typeof candidate.accounts === "object"
    && !Array.isArray(candidate.accounts)
    && Object.values(candidate.accounts).every(isRiskIdentityRecord);
}

/**
 * 账号目录的旧数据迁移必须区分“确实没有旧数据”和“旧数据读坏了”。
 * 普通风控消费仍可用宽容的 listRiskRecords；认证迁移只能走这个失败关闭入口。
 */
export function readRiskRecordsStrict(): StrictRiskRecordsResult {
  try {
    const raw = uni.getStorageSync(REGISTRY_KEY) as unknown;
    if (raw === "" || raw === null || raw === undefined) return { ok: true, sourceSchema: "empty", records: [] };
    if (!isReadableRiskRegistry(raw)) return { ok: false, error: "risk_registry_unavailable" };
    return { ok: true, sourceSchema: raw.schema, records: Object.values(raw.accounts) };
  } catch {
    return { ok: false, error: "risk_registry_unavailable" };
  }
}

function readRegistry(): ReadableRiskRegistry {
  try {
    const raw = uni.getStorageSync(REGISTRY_KEY) as unknown;
    if (isReadableRiskRegistry(raw)) return raw;
  } catch {
    // storage unavailable
  }
  return { schema: 2, accounts: {} };
}

function writeRegistry(registry: RiskRegistry): boolean {
  try {
    uni.setStorageSync(REGISTRY_KEY, registry);
    return true;
  } catch {
    return false;
  }
}

/**
 * Auth02 首次建立手机号目录时的迁移栅栏：只接受明确的 schema1 老表，先把风险表
 * 升为 schema2，再允许目录迁移。以后目录被删但表仍为 schema2 时必须失败关闭，
 * 绝不能把本轮 pending 注册误升为 active。
 */
export function sealLegacyRiskRegistryForAuthDirectory(): boolean {
  try {
    const raw = uni.getStorageSync(REGISTRY_KEY) as unknown;
    if (!isReadableRiskRegistry(raw) || raw.schema !== 1) return false;
    return writeRegistry({ schema: 2, accounts: { ...raw.accounts } });
  } catch {
    return false;
  }
}

// djb2 → base36. mock 只要稳定散列,不需要密码学强度。
export function riskHash(value: string): string {
  let h = 5381;
  const s = value.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function withdrawAddressHash(network: string, address: string): string {
  return riskHash(`${network}:${address}`);
}

/** 同一浏览器环境的稳定伪 IP 桶(mock)。 */
export function getIpBucket(): string {
  try {
    const cached = uni.getStorageSync(IP_BUCKET_KEY) as string | "";
    if (cached && typeof cached === "string") return cached;
  } catch {
    // first run
  }
  const bucket = `ipb-${riskHash(mockServerUuid())}`;
  try {
    uni.setStorageSync(IP_BUCKET_KEY, bucket);
  } catch {
    // storage unavailable
  }
  return bucket;
}

export function getUaFingerprint(): string {
  return riskHash(getDeviceIdentity().deviceName);
}

export function getRiskRecord(accountKey: string): RiskIdentityRecord | null {
  return readRegistry().accounts[normalizeAccountKey(accountKey)] ?? null;
}

export function listRiskRecords(): RiskIdentityRecord[] {
  return Object.values(readRegistry().accounts);
}

/** 构造一条「尚未注册」的候选记录(注册前评估用,不落表)。 */
export function buildCandidateRecord(accountKey: string, sponsorId: string | null): RiskIdentityRecord {
  const normalizedSponsor = normalizeRefCode(sponsorId);
  return {
    accountKey: normalizeAccountKey(accountKey),
    deviceHint: getDeviceId(),
    ipBucket: getIpBucket(),
    uaFingerprint: getUaFingerprint(),
    sponsorId: normalizedSponsor?.toLowerCase() ?? null,
    registeredAt: Date.now(),
    withdrawAddresses: [],
    paymentInstruments: [],
    hasWithdrawn: false,
    attestedOnlineMs: 0,
  };
}

function upsert(accountKey: string, patch: (record: RiskIdentityRecord) => RiskIdentityRecord): boolean {
  const key = normalizeAccountKey(accountKey);
  const registry = readRegistry();
  const existing = registry.accounts[key] ?? buildCandidateRecord(key, null);
  return writeRegistry({
    schema: 2,
    accounts: { ...registry.accounts, [key]: patch({ ...existing }) },
  });
}

/** 注册落表(账户创建成功后调用;失败不落 = 不产生半成品身份)。 */
export function recordRegistration(accountKey: string, sponsorId: string | null): boolean {
  const normalizedSponsor = normalizeRefCode(sponsorId);
  return upsert(accountKey, (r) => ({
    ...r,
    sponsorId: normalizedSponsor?.toLowerCase() ?? r.sponsorId,
  }));
}

/**
 * 登记提现地址首见。seenAt 缺省 = 现在;存量迁移(payout-address)传原配对验证时刻,
 * 让既有「新地址持有期」信号把迁移地址视为老地址(规格 RM01a 异常6:无新保护期)。
 * 已登记过的地址不覆盖(first-seen wins)。
 */
export function recordWithdrawAddressUse(accountKey: string, network: string, address: string, seenAt?: number): void {
  const hash = withdrawAddressHash(network, address);
  upsert(accountKey, (r) =>
    r.withdrawAddresses.some((a) => a.hash === hash)
      ? r
      : { ...r, withdrawAddresses: [...r.withdrawAddresses, { hash, firstSeenAt: seenAt ?? Date.now() }] },
  );
}

export function recordPaymentInstrument(accountKey: string, instrument: string): void {
  const hash = riskHash(instrument);
  upsert(accountKey, (r) =>
    r.paymentInstruments.some((p) => p.hash === hash)
      ? r
      : { ...r, paymentInstruments: [...r.paymentInstruments, { hash, firstSeenAt: Date.now() }] },
  );
}

export function markWithdrawn(accountKey: string): void {
  upsert(accountKey, (r) => ({ ...r, hasWithdrawn: true }));
}

/** App 在线证明累计(P3: settle 在 App 载体、设备真在线时调用)。 */
export function recordAttestation(accountKey: string, deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
  upsert(accountKey, (r) => ({ ...r, attestedOnlineMs: r.attestedOnlineMs + deltaMs }));
}
