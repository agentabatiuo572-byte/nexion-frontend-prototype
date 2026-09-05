import type { EarningBucketRoute } from "@/store/types";
import { useConfig } from "@/store/config";
import { normalizeAccountKey } from "@/store/account-cloud";
import { normalizeRefCode } from "@/store/sponsorship";
import {
  buildCandidateRecord,
  getRiskRecord,
  listRiskRecords,
  recordRegistration,
  riskHash,
  type RiskIdentityRecord,
} from "@/store/risk-identity";

// SPEC-7 K1 聚簇引擎(mock 决策层,推倒重写版)。
//
// §5b 维度表: 强维(设备 / IP+24h 时间窗 / 提现地址)任一命中即入簇(OR);
// 中弱维(支付工具 / 推荐链 / UA / 注册时序)按 K4 权重叠加,达
// riskScore.weakSignalClusterThreshold 才入簇;空维度不计分(空值降权)。
//
// R5 簇状态实时性: 本模块【无任何缓存】—— evaluateAccountCluster 每次调用
// 都重扫注册表 + 重算连通分量;结算 / 释放 / 提现三处都必须现调本函数,
// 禁止读注册时留下的快照。
//
// PROD: 整个引擎被 K1 服务端替换,client 只消费 RiskClusterSummary。

const OVERRIDE_KEY = "nexgrid-cluster-override-v1";

export type ClusterStatus = "clear" | "watch" | "flagged" | "frozen" | "released";

export type RegistrationGateRoute = "proceed" | "manual_or_reject";

export interface RiskClusterSummary {
  clusterId: string;
  status: ClusterStatus;
  accountCount: number;
  /** 本账户在簇内按注册时间的序号(1-based)。 */
  slotIndexInCluster: number;
  /** 结算/赠金入桶路线(由 status + R4 绑定门派生)。 */
  bucketRoute: EarningBucketRoute;
  /** mock K4 分 = 命中维度权重和(cap 1)。 */
  score: number;
  /** 稳定 reason code(工程侧;页面渲染时映射 i18n,禁直出)。 */
  reasons: string[];
  freeSlotsUsed: number;
  configVersion: string;
  evaluatedAt: number;
}

export interface RegistrationAssessment {
  /** 注册闸: IP 24h 超限 → manual_or_reject(停留注册页,不建号)。 */
  gateRoute: RegistrationGateRoute;
  cluster: RiskClusterSummary;
  /** 新人礼入桶路线(welcomeGift.lockMode 决定是否跟随风险桶)。 */
  giftRoute: EarningBucketRoute;
}

// ── 簇状态人工处置(mock D2/K1 面) ────────────────────────────────────
// PROD: K1 处置(标记/冻结/解除)由后台写服务端;mock 双端不真打通(DR-7),
// uniapp 用 override 表模拟「服务端已下发的簇处置结论」。按 accountKey 记,
// 评估时聚合到整簇(任一成员带 frozen → 全簇 frozen;released 同理)。

interface OverrideTable {
  schema: 1;
  byAccount: Record<string, ClusterStatus>;
}

function readOverrides(): OverrideTable {
  try {
    const raw = uni.getStorageSync(OVERRIDE_KEY) as OverrideTable | "";
    if (raw && typeof raw === "object" && raw.schema === 1 && raw.byAccount) return raw;
  } catch {
    // storage unavailable
  }
  return { schema: 1, byAccount: {} };
}

/** ⚠️ DEV/DEMO-ONLY: 模拟后台 K1 处置结论下发(P6 演示 S5 解除误判用)。 */
export function _devSetClusterStatus(accountKey: string, status: ClusterStatus | null): void {
  if (import.meta.env.PROD) return; // 风控簇状态入口,store 层二层 guard(硬规则5)
  const table = readOverrides();
  const key = normalizeAccountKey(accountKey);
  const byAccount = { ...table.byAccount };
  if (status === null) delete byAccount[key];
  else byAccount[key] = status;
  try {
    uni.setStorageSync(OVERRIDE_KEY, { schema: 1, byAccount });
  } catch {
    // storage unavailable
  }
}

// ── 聚簇 ──────────────────────────────────────────────────────────────

const SIGNUP_IP_WINDOW_MS = 24 * 3600 * 1000;
const SIGNUP_BURST_WINDOW_MS = 3600 * 1000;

interface DimensionHit {
  dimension: keyof ReturnType<typeof weights>;
  strong: boolean;
  /** 稳定的额外风险原因；页面必须经 i18n 映射后再展示。 */
  reason?: string;
}

function weights() {
  return useConfig().config.riskScore.dimensionWeights;
}

function shareHash(a: { hash: string }[], b: { hash: string }[]): boolean {
  if (!a.length || !b.length) return false;
  const set = new Set(a.map((x) => x.hash));
  return b.some((x) => set.has(x.hash));
}

/** 两账户共用的工具 hash；空值不形成风险维度。 */
function sharedHashes(a: { hash: string }[], b: { hash: string }[]): string[] {
  if (!a.length || !b.length) return [];
  const right = new Set(b.map((x) => x.hash));
  return [...new Set(a.map((x) => x.hash).filter((hash) => right.has(hash)))];
}

/**
 * 支付工具默认是中维；只有同一 hash 的不同账号数严格超过后台上限，才升为强维。
 * 计数必须基于完整风险表，而不能只看 BFS 尚未弹出的 pool，否则连边顺序会改变结论。
 */
function hasOverusedPaymentInstrument(
  a: RiskIdentityRecord,
  b: RiskIdentityRecord,
  allRecords: RiskIdentityRecord[],
): boolean {
  const limit = useConfig().config.riskCluster.maxAccountsPerPaymentInstrument;
  return sharedHashes(a.paymentInstruments, b.paymentInstruments).some((hash) => {
    const accounts = new Set(
      allRecords
        .filter((record) => record.paymentInstruments.some((instrument) => instrument.hash === hash))
        .map((record) => record.accountKey),
    );
    return accounts.size > limit;
  });
}

/** 两账户间的维度命中(空维度自然不命中 = 空值降权)。 */
function dimensionHits(
  a: RiskIdentityRecord,
  b: RiskIdentityRecord,
  allRecords: RiskIdentityRecord[],
): DimensionHit[] {
  const hits: DimensionHit[] = [];
  if (a.deviceHint && a.deviceHint === b.deviceHint) hits.push({ dimension: "serverDeviceId", strong: true });
  if (a.ipBucket === b.ipBucket && Math.abs(a.registeredAt - b.registeredAt) < SIGNUP_IP_WINDOW_MS)
    hits.push({ dimension: "ipBucket", strong: true });
  if (shareHash(a.withdrawAddresses, b.withdrawAddresses)) hits.push({ dimension: "withdrawAddress", strong: true });
  if (shareHash(a.paymentInstruments, b.paymentInstruments)) {
    const overused = hasOverusedPaymentInstrument(a, b, allRecords);
    hits.push({
      dimension: "paymentInstrument",
      strong: overused,
      reason: overused ? "payment-instrument-overuse" : undefined,
    });
  }
  if (a.sponsorId && a.sponsorId === b.sponsorId) hits.push({ dimension: "sponsor", strong: false });
  if (a.uaFingerprint && a.uaFingerprint === b.uaFingerprint) hits.push({ dimension: "uaFingerprint", strong: false });
  if (a.ipBucket === b.ipBucket && Math.abs(a.registeredAt - b.registeredAt) < SIGNUP_BURST_WINDOW_MS)
    hits.push({ dimension: "signupTiming", strong: false });
  return hits;
}

/** 连边判定: 任一强维 OR 中弱维权重和达阈。 */
function linked(a: RiskIdentityRecord, b: RiskIdentityRecord, allRecords: RiskIdentityRecord[]): boolean {
  const hits = dimensionHits(a, b, allRecords);
  if (hits.some((h) => h.strong)) return true;
  const w = weights();
  const weak = hits.filter((h) => !h.strong).reduce((sum, h) => sum + (w[h.dimension] ?? 0), 0);
  return weak >= useConfig().config.riskScore.weakSignalClusterThreshold;
}

function isBareIdentity(record: RiskIdentityRecord): boolean {
  return !record.sponsorId && !record.withdrawAddresses.length && !record.paymentInstruments.length;
}

/** R4 有效绑定 = 支付工具 / 推荐关系 / App 在线证明 之一。 */
function hasValidBinding(record: RiskIdentityRecord): boolean {
  const cfg = useConfig().config.riskCluster;
  return (
    !!normalizeRefCode(record.sponsorId) ||
    record.paymentInstruments.length > 0 ||
    record.attestedOnlineMs >= cfg.appAttestationReleaseHours * 3600 * 1000
  );
}

function configVersion(): string {
  const rc = useConfig().config.riskCluster;
  return `rc:${rc.freePhoneSlotsPerCluster}/${rc.duplicateAccountPendingFrom}/${rc.duplicateAccountFreezeFrom}/${rc.maxSignupPerIp24h}/${rc.maxAccountsPerDevice}/${rc.maxAccountsPerPaymentInstrument}/${rc.releaseMode}/${rc.freeSlotRequiresBinding ? "bind" : "nobind"}`;
}

function evaluate(records: RiskIdentityRecord[], self: RiskIdentityRecord): RiskClusterSummary {
  const cfg = useConfig().config.riskCluster;
  const allRecords = [...records.filter((record) => record.accountKey !== self.accountKey), self];
  // 连通分量(含 self;表规模 = mock 演示量级,O(n²) 扫描足够)。
  // ponytail: O(n²) BFS, swap in union-find if the registry ever grows past demo scale.
  const pool = records.filter((r) => r.accountKey !== self.accountKey);
  const members: RiskIdentityRecord[] = [self];
  const queue: RiskIdentityRecord[] = [self];
  while (queue.length) {
    const current = queue.pop()!;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (linked(current, pool[i], allRecords)) {
        const [hit] = pool.splice(i, 1);
        members.push(hit);
        queue.push(hit);
      }
    }
  }
  members.sort((a, b) => a.registeredAt - b.registeredAt || a.accountKey.localeCompare(b.accountKey));
  const slotIndex = members.findIndex((m) => m.accountKey === self.accountKey) + 1;
  const clusterId = `CL-${riskHash(members[0].accountKey).toUpperCase()}`;

  // 分数: self 对簇内任一其他成员命中过的维度,权重求和 cap 1。
  const w = weights();
  const hitDims = new Set<string>();
  const hitReasons = new Set<string>();
  for (const other of members) {
    if (other.accountKey === self.accountKey) continue;
    for (const hit of dimensionHits(self, other, allRecords)) {
      hitDims.add(hit.dimension);
      if (hit.reason) hitReasons.add(hit.reason);
    }
  }
  const reasons: string[] = [];
  let score = 0;
  hitDims.forEach((dim) => {
    score += w[dim as keyof typeof w] ?? 0;
    reasons.push(`dim-${dim}`);
  });
  reasons.push(...hitReasons);
  score = Math.min(1, +score.toFixed(2));

  // 人工处置聚合(修 audit U2「released 传染全簇 = 解除一个误判后全簇永久免疫」):
  // - frozen 连坐全簇(冻结是收紧,连坐安全);
  // - released / flagged 只作用被点名账户【自身】,不传染给簇内后来新增的成员——
  //   呼应规格「released 后禁止继续沿旧命中理由自动冻结,必须重新评估」:新成员各自
  //   按自己的 slotIndex/裸号规则重评,不搭已解除账户的便车。
  const overrides = readOverrides().byAccount;
  const clusterFrozen = members.some((m) => overrides[m.accountKey] === "frozen");
  const selfOverride = overrides[self.accountKey];
  const overrideStatus: ClusterStatus | null = clusterFrozen
    ? "frozen"
    : selfOverride === "released" || selfOverride === "flagged"
      ? selfOverride
      : null;

  let status: ClusterStatus;
  if (overrideStatus) {
    status = overrideStatus;
    reasons.push(`disposition-${overrideStatus}`);
  } else if (slotIndex >= cfg.duplicateAccountFreezeFrom) {
    status = "flagged";
    reasons.push("duplicate-freeze-line");
  } else if (slotIndex >= cfg.duplicateAccountPendingFrom) {
    status = "watch";
    reasons.push("duplicate-pending-line");
  } else if (isBareIdentity(self)) {
    // R3 裸号: 仅手机号、其余维度全空 → 不判 clear,入 watch。
    status = "watch";
    reasons.push("bare-identity");
  } else {
    status = "clear";
  }

  // 入桶路线(结算/赠金共用): R4 绑定门只作用于 clear/released 的首槽。
  let bucketRoute: EarningBucketRoute;
  if (status === "frozen" || status === "flagged") {
    bucketRoute = "bonus_locked";
  } else if (status === "watch") {
    bucketRoute = "pending_review";
  } else if (cfg.freeSlotRequiresBinding && !hasValidBinding(self)) {
    bucketRoute = "pending_review";
    reasons.push("unbound-free-slot");
  } else {
    bucketRoute = "withdrawable";
  }

  return {
    clusterId,
    status,
    accountCount: members.length,
    slotIndexInCluster: slotIndex,
    bucketRoute,
    score,
    reasons,
    freeSlotsUsed: Math.min(members.length, cfg.freePhoneSlotsPerCluster),
    configVersion: configVersion(),
    evaluatedAt: Date.now(),
  };
}

/**
 * R5 实时簇评估 —— 结算 / 释放 / 提现三处的唯一入口。
 * 账户未在注册表(老账号/演示种子)按「当前环境的候选身份」评估,不落表。
 */
export function evaluateAccountCluster(accountKey: string): RiskClusterSummary {
  const key = normalizeAccountKey(accountKey);
  const records = listRiskRecords();
  const self = getRiskRecord(key) ?? buildCandidateRecord(key, null);
  return evaluate(records, self);
}

/** 注册前评估(FEAT-RISK01): 候选身份参与聚簇 + IP/设备双注册闸。 */
export function evaluateRegistration(
  candidateAccountKey: string,
  opts: { sponsorId?: string | null } = {},
): RegistrationAssessment {
  const cfg = useConfig().config;
  const candidate = buildCandidateRecord(candidateAccountKey, normalizeRefCode(opts.sponsorId));
  const records = listRiskRecords().filter((r) => r.accountKey !== candidate.accountKey);

  const cluster = evaluate(records, candidate);

  // 注册闸: 同 IP 桶 24h 或同设备既有账号数达上限 → 人工或拒绝,不建号。
  // 两条上限皆来自 K1 参数，任何一条命中即阻断后续 reserve / 风控落表。
  const now = Date.now();
  const ipSignups = records.filter(
    (r) => r.ipBucket === candidate.ipBucket && now - r.registeredAt < SIGNUP_IP_WINDOW_MS,
  ).length;
  const deviceAccounts = records.filter(
    (r) => !!candidate.deviceHint && r.deviceHint === candidate.deviceHint,
  ).length;
  const gateRoute: RegistrationGateRoute =
    ipSignups >= cfg.riskCluster.maxSignupPerIp24h || deviceAccounts >= cfg.riskCluster.maxAccountsPerDevice
      ? "manual_or_reject"
      : "proceed";

  const giftRoute: EarningBucketRoute =
    cfg.rewards.welcomeGift.lockMode === "direct" ? "withdrawable" : cluster.bucketRoute;

  return { gateRoute, cluster, giftRoute };
}

/** 注册事务的风险落表步骤；账号目录保持 pending，直到其余副作用完成后才 active。 */
export function commitRegistration(accountKey: string, opts: { sponsorId?: string | null } = {}): boolean {
  return recordRegistration(accountKey, normalizeRefCode(opts.sponsorId));
}
