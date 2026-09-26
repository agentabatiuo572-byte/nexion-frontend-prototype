import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type { Device, CurrentTask, CompletedTask, UserState, EarningsState, GlobalStats, Withdrawal, WithdrawalFeeSnapshot, EarningBucketRoute } from "./types";
import type { DeviceKind } from "./types";
import { ONE_DAY_MS, makeInitialDevices, createDevice, backfillDeviceEconomics, MAX_DEVICES, type CreateDeviceOptions } from "./device-types";
import { pickRandomTask } from "@/mock/tasks";
import { isDegradable, getEfficiency, getMonthsOwned, installCanonicalLifecycleConfig } from "./device-lifecycle";
import { interruptInfo } from "./interrupt";
import { continuityFactor, thermalFactor, isDeviceOnline } from "@/lib/hashpower";
import { phoneRuntimePauseReason } from "@/lib/phone-runtime";
import { getDeviceId } from "@/lib/device-id";
import { readAccountSessionRecordsStrict, readCalibratedInstallation } from "@/store/session";
import { matchesPhoneBinding, phoneReplacementError, stopPhoneTask, type PhoneBinding, type PhoneActivationError } from "@/lib/phone-policy";
import { accountTotalHashrate } from "@/lib/account-hashrate";
import { getCarrier, type Carrier } from "@/lib/carrier";
import { getEntrySurface, type EntrySurface } from "@/lib/entry-surface";
import { matchGpuTier } from "@/lib/gpu-tiers";
import { publicStatsHealth } from "@/lib/platform-stats";
import { useConfig } from "@/store/config";
import { accumulateUsdAccrual, completedUsdCentDelta } from "@/lib/earnings-accrual";
import { evaluateAccountCluster } from "@/store/risk-cluster";
import {
  appendLedgerEntry,
  evaluateAttestRelease,
  hasReleaseEffect,
  _devGrantManualRelease as _devGrantManualReleaseLedger,
  type ReleaseOutcome,
} from "@/store/earning-release";
// 🔴 合并裁决(本地线 ⟵⟶ 远端线):远端线把 commitWithdrawal 整个删掉、改导入两个原语
// 却一个都没用 —— 结果是「首提标记 / 收款地址使用登记」两条本地预检输入彻底断流。
// 本地线保留 commitWithdrawal(它就是那两个原语的组合,见 withdrawal-eligibility),
// 且改成记到**入口冻结账号**。故这里恢复 commitWithdrawal,去掉那两个从未被使用的导入。
import { recordAttestation } from "@/store/risk-identity";
import { commitWithdrawal } from "@/store/withdrawal-eligibility";
import { advanceArrival, occupiesWithdrawalSlot } from "@/store/withdrawal-arrival-core";
import { mockServerNow } from "@/store/server-time";
import type { OnlineBonus, WithdrawalRiskRoute } from "@/store/config-types";
import type { DeviceCapability } from "@/lib/device-capability";
import { useReceipts } from "./receipts";
import { generateReceipt } from "@/mock/receipt";
import {
  normalizeAccountKey,
  mergeAndWriteAccountSnapshotResult,
  readAccountSnapshot,
  type AccountCloudSnapshot,
} from "./account-cloud";
import {
  deviceE3Api,
  appHomeApi,
  fundsSandboxApi,
  mockFundsEnabled,
  fundsServerEnabled,
  remoteApiEnabled,
  sessionVault,
  taskAssignmentApi,
  withdrawalApi,
} from "@/api/runtime";
import type { AppHomeOverview } from "@/api/app-home-api";
import { toCanonicalWithdrawal } from "@/api/withdrawal-api";
import {
  sandboxEvidenceFromOverview,
  type FundsSandboxEvidence,
  type FundsSandboxOrder,
  type FundsSandboxWallet,
} from "@/api/funds-sandbox-api";
import type { CanonicalE3Device } from "@/api/device-e3-api";
import type { CanonicalTaskAssignment, CanonicalTaskAssignments, TrustedTaskCompletionProof } from "@/api/task-assignment-api";
import type { UserSession } from "@/api/contracts";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import {
  bindPendingFundsMutationOrder,
  finishPendingFundsMutationByOrder,
  fundsAmountFingerprint,
  pendingFundsMutationKey,
  type FundsMutationIdentity,
} from "@/lib/funds-mutation-key";
import {
  captureFundsSandboxRequestScope,
  fundsSandboxStaleRequestError,
  isCurrentFundsSandboxRequestScope,
  isFundsSandboxStaleRequestError,
} from "@/lib/funds-sandbox-request-scope";

// Ported from Nexion-prototype/lib/store/index.ts (useApp), zustand → Pinia.
// MOCK-ONLY: entire earnings simulation runs client-side. Production replaces
// tick() with the candidate aggregate read + stream contract documented in PRD
// §9.11c.1 (`GET /api/me/earnings?range=…` + SSE `/api/me/earnings/stream`).
// SPEC-4: user/devices/earnings now persist through the account-cloud mock, so
// the same accountKey can be rebound by H5 / signed app / white-app carriers.

const ONE_DAY = ONE_DAY_MS;

// ── module-level tick state (mirrors original module scope) ──
const deviceTimers = new Map<string, { vital: number }>();
const lastTickAggregate = { usd: 0, nex: 0 };
let remoteTaskSyncInFlight = false;
let remoteTaskSyncAfter = 0;
const REMOTE_TASK_SYNC_MS = 5000;

function normalRandom(mean: number, std: number, min: number, max: number) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(min, Math.min(max, mean + z * std));
}

/** ms granularity floor for one settlement — throttles accrual to ≥1800ms windows
 *  and batches the market/variation jitter (as the old tick-time batch did).
 *  NOTE (pre-existing mock characteristic, predates SPEC-1, NOT fixed here): for a
 *  low daily-rate device (≲ $24/day USDT or ≲ 240/day NEX) one window's increment
 *  falls below the todayEarnings toFixed(3)/(2) rounding floor, so its steady-state
 *  per-device counter barely moves — only higher-rate devices and large reopen-Δ
 *  catch-ups register. A display-layer sub-cent carry would smooth this (product
 *  改进, out of SPEC-1 scope). A reopen produces one large Δ → settled in one shot
 *  (uncapped: PROD's server settle + daily reset bound it; mock leaves it raw). */
const SETTLE_MIN_MS = 1800;

function createEarningBuckets(withdrawableUsdt: number, now = Date.now()): UserState["earningBuckets"] {
  return {
    withdrawableUsdt,
    pendingReviewUsdt: 0,
    bonusLockedUsdt: 0,
    lockedNex: 0,
    policyVersion: "mock-seed-v1",
    lastBucketedAt: now,
  };
}

/**
 * 资金三元组快照 —— 冲正(退款 / 回滚)的基准。三个字段就是全部会被资金原语动到的量:
 * debitBalance 同时改 usdtBalance 与 withdrawableUsdt(clamp),debitNex 改 nexBalance。
 * 少一个字段,退款就还原不回扣款前(见 restoreMoney 头注)。
 *
 * `applied` 是**本标签页自己动过多少钱**的读数(见 restoreMoney 头注)。冲正按增量回滚
 * 而不是写绝对值,靠的就是它 —— 三个绝对值只用于 UI/日志与合法性校验,不参与算账。
 */
export interface MoneySnapshot {
  usdtBalance: number;
  nexBalance: number;
  withdrawableUsdt: number;
  applied: MoneyDelta;
}

/** 一次资金变更在**合并之前**对本地三元组产生的增量(正=加,负=减)。 */
interface MoneyDelta {
  usdtBalance: number;
  nexBalance: number;
  withdrawableUsdt: number;
}

function withDefaultEarningBuckets(user: UserState): UserState {
  return {
    ...user,
    appliedRewardKeys: user.appliedRewardKeys ?? {},
    earningBuckets: {
      ...createEarningBuckets(user.usdtBalance, user.joinedAt),
      ...(user.earningBuckets ?? {}),
    },
  };
}

function bucketUserEarnings(
  current: UserState,
  route: EarningBucketRoute,
  usdt: number,
  nex: number,
  policyVersion: string,
  now = Date.now(),
): UserState {
  const buckets = withDefaultEarningBuckets(current).earningBuckets;
  const nextBuckets = { ...buckets, policyVersion, lastBucketedAt: now };
  const nextUser: UserState = { ...current, earningBuckets: nextBuckets };
  if (usdt <= 0 && nex <= 0) return nextUser;
  if (route === "withdrawable") {
    nextBuckets.withdrawableUsdt = +(nextBuckets.withdrawableUsdt + usdt).toFixed(2);
    nextUser.usdtBalance = +(nextUser.usdtBalance + usdt).toFixed(2);
    nextUser.nexBalance = +(nextUser.nexBalance + nex).toFixed(2);
  } else if (route === "pending_review") {
    nextBuckets.pendingReviewUsdt = +(nextBuckets.pendingReviewUsdt + usdt).toFixed(2);
    nextBuckets.lockedNex = +(nextBuckets.lockedNex + nex).toFixed(2);
  } else if (route === "bonus_locked") {
    nextBuckets.bonusLockedUsdt = +(nextBuckets.bonusLockedUsdt + usdt).toFixed(2);
    nextBuckets.lockedNex = +(nextBuckets.lockedNex + nex).toFixed(2);
  }
  return nextUser;
}

function createInitialUser(email = "alex@nexgrid.ai"): UserState {
  const usdtBalance = 24856.56;
  return {
    email,
    tier: "L2",
    joinedAt: Date.now() - 30 * ONE_DAY,
    cumulativeDepositUsdt: 0,
    referralCode: "NEXGRID-8K9X",
    usdtBalance,
    nexBalance: 1240,
    pendingEarnings: 2.31,
    earningBuckets: createEarningBuckets(usdtBalance),
  };
}

function createInitialEarnings(): EarningsState {
  const now = Date.now();
  return {
    today: 247.83,
    todayNEX: 612.4,
    thisWeek: 1247.65,
    thisMonth: 5184.62,
    total: 28452.18,
    history: [
      { ts: now - 1 * 3600 * 1000, amount: 0.23 },
      { ts: now - 2 * 3600 * 1000, amount: 0.19 },
      { ts: now - 3 * 3600 * 1000, amount: 0.21 },
      { ts: now - 4 * 3600 * 1000, amount: 0.18 },
    ],
  };
}

// Concurrent grid jobs seed — coherent with the regional throughput sum
// (51.2k jobs/hr global ⇒ ~5–6 min median job at this concurrency).
const ACTIVE_JOBS_SEED = 4812;

function createInitialGlobal(onlineBaseline: number): GlobalStats {
  return {
    activeDevices: onlineBaseline,
    nodes: 156,
    countries: 47,
    uptime: 99.7,
    activeJobs: ACTIVE_JOBS_SEED,
  };
}

// FEAT-DEV02: legacy persisted snapshots (pre trade-in economics fields) get
// their devices backfilled at the consumption gate — account-cloud stays
// value-import-free for the SPEC-4 VM sentinel (see device-types.ts).
function hydrateSnapshotEconomics(s: AccountCloudSnapshot | null): AccountCloudSnapshot | null {
  return s ? { ...s, devices: (s.devices ?? []).map(backfillDeviceEconomics) } : null;
}

function migratePhonePause(device: Device): Device {
  if (device.kind !== "phone" || (device.pausedReason as string | null) !== "no-charger") return device;
  return {
    ...device,
    pausedReason: phoneRuntimePauseReason(device),
    // An old pause without a start time cannot safely resume its wall-clock task.
    currentTask: device.interruptedAt == null ? null : device.currentTask,
    lastSettledAt: null,
    miningSince: null,
    onlineHeartbeatAt: null,
  };
}

// user.email 只收联系身份,不收账号内部 key:兜底链的入参既有邮箱也有账号 key
// ("default" / "user:<id>" 等),匿名 boot key 一旦流进去,profile 页会把裸 "default"
// 当邮箱渲出来(页面文案禁枚举值/字段名不变量;2026-08-15 date-locale T1 验收发现#2)。
// 判据取「像邮箱」而不是枚举 key 形状 —— key 形状是开放集合,枚举必漏。
// 分层:这里只守**铸造侧**(两个快照工厂);存量毒行在读侧治 —— readAccountSnapshot
// (全部存储读的唯一入口)把非邮箱形归一成 demo 身份,merge 三视图因此天然一致。
const asEmailIdentity = (identity: string) => (identity.includes("@") ? identity : "");

function createSeedSnapshot(accountKey: string, email: string, entrySurface: EntrySurface): AccountCloudSnapshot {
  return {
    schema: 1,
    accountKey: normalizeAccountKey(accountKey),
    entrySurface,
    updatedAt: Date.now(),
    user: createInitialUser(asEmailIdentity(email) || asEmailIdentity(accountKey) || "alex@nexgrid.ai"),
    devices: makeInitialDevices().map((d) => d.kind === "phone"
      ? { ...stopPhoneTask(d), activatedAt: null } : d),
    earnings: createInitialEarnings(),
    withdrawals: [],
  };
}

/**
 * A server-mode subject must start from an explicit empty projection.  Never
 * derive this object from account-cloud/localStorage: doing so would retain
 * withdrawals, reward idempotency keys or another account's merge base while
 * the authoritative refresh is still in flight (or unavailable).
 */
function createServerEmptySnapshot(accountKey: string, email: string, entrySurface: EntrySurface): AccountCloudSnapshot {
  const emptyUser = createInitialUser(asEmailIdentity(email) || asEmailIdentity(accountKey));
  return {
    schema: 1,
    accountKey: normalizeAccountKey(accountKey),
    entrySurface,
    updatedAt: 0,
    user: {
      ...emptyUser,
      tier: "L0",
      joinedAt: 0,
      cumulativeDepositUsdt: 0,
      referralCode: "",
      usdtBalance: 0,
      nexBalance: 0,
      pendingEarnings: 0,
      earningBuckets: createEarningBuckets(0, 0),
      appliedRewardKeys: {},
    },
    devices: [],
    earnings: { today: 0, todayNEX: 0, thisWeek: 0, thisMonth: 0, total: 0, history: [] },
    withdrawals: [],
  };
}

/** PRD §6.11 — the single earnings-accrual path (settle-single-source).
 *  Accrues a device by the WALL-CLOCK Δ since its `lastSettledAt` anchor (NOT by
 *  accumulated tick time), then re-anchors to `now`. Driving accrual off the
 *  registration anchor is what decouples earnings from the page being open: a
 *  BACKGROUNDED gap is settled in one shot on the next settle(). The account-cloud
 *  mock persists and reloads this anchor across refreshes; PROD makes the server
 *  canonical for lastSettledAt and the resulting aggregate.
 *  R7 在线分层: a phone with a fresh device heartbeat accrues continuity×thermal;
 *  a missing/stale beat produces no phone income. The view carrier is never
 *  a factor source (display uses the same isDeviceOnline seam). */
function settleDevice(d: Device, now: number, onlineBonus: OnlineBonus): Device {
  // Not earning right now (idle / offline / cloud-share / phone gated) → drop a
  // stale anchor so the idle gap is never back-paid when the device resumes.
  if (
    d.activatedAt === null ||
    d.status !== "online" ||
    d.kind === "cloud-share" ||
    d.pausedReason != null ||
    (d.kind === "phone" && (phoneRuntimePauseReason(d) != null || !isDeviceOnline(d, now)))
  ) {
    return d.lastSettledAt == null ? d : { ...d, lastSettledAt: null };
  }
  // First sight after (re)activation: anchor without paying (登记 moment).
  if (d.lastSettledAt == null) return { ...d, lastSettledAt: now };

  const deltaMs = now - d.lastSettledAt;
  if (deltaMs < SETTLE_MIN_MS) return d;

  const marketMult = 0.95 + Math.random() * 0.1;
  const variation = 0.85 + Math.random() * 0.3;
  const lifeEff = isDegradable(d.kind) ? getEfficiency(getMonthsOwned(d.purchasedAt)) : 1;
  const phoneFactor =
    d.kind === "phone"
      ? isDeviceOnline(d, now)
        ? continuityFactor(now - (d.miningSince ?? now), onlineBonus.continuityFullHours * 60 * 60 * 1000) * thermalFactor(d.thermalState)
        : 0
      : 1;
  const inc = (d.baseRate * lifeEff * phoneFactor * marketMult * variation * deltaMs) / ONE_DAY;
  const incNEX = (d.baseRateNEX * lifeEff * phoneFactor * marketMult * variation * deltaMs) / ONE_DAY;
  return {
    ...d,
    todayEarnings: +(d.todayEarnings + inc).toFixed(3),
    todayEarningsNEX: +(d.todayEarningsNEX + incNEX).toFixed(2),
    // FEAT-DEV02: lifetime output accrues in lockstep with the USD increment.
    // Deactivation / today-zeroing paths never touch this field (ladder numerator).
    cumulativeEarningsUsdt: +((d.cumulativeEarningsUsdt ?? 0) + inc).toFixed(3),
    lastSettledAt: now,
  };
}

/** Pure R7 batch transition. Settlement deliberately reads the OLD heartbeat;
 * only after that wall-clock delta is priced may the resident App stamp a new
 * beat for the next tick. This prevents a killed App from reopening and
 * back-paying the entire offline gap at the online rate. */
export function settleDeviceBatch(
  current: Device[],
  carrier: Carrier,
  now: number,
  onlineBonus: OnlineBonus,
  computeShareEnabled: boolean,
  residentDeviceId?: string,
  phoneSessionKnown = true,
): { settled: Device[]; nextDevices: Device[] } {
  const settled = current.map((device) =>
    device.kind === "phone" && !phoneSessionKnown ? device : device.kind === "pc-gpu" && !computeShareEnabled
      ? freezeComputeShareDevice(device)
      : settleDevice(device, now, onlineBonus),
  );
  const nextDevices = carrier === "app" && phoneSessionKnown
    ? settled.map((device) =>
        device.kind === "phone" &&
        device.id === residentDeviceId &&
        device.status === "online" &&
        device.pausedReason == null &&
        phoneRuntimePauseReason(device) == null &&
        device.activatedAt !== null
          ? { ...device, onlineHeartbeatAt: now, lastSettledAt: device.lastSettledAt ?? now }
          : device,
      )
    : settled;
  return { settled, nextDevices };
}

function freezeComputeShareDevice(d: Device): Device {
  if (d.kind !== "pc-gpu") return d;
  return {
    ...d,
    lastSettledAt: null,
    currentTask: null,
    gpuUsage: 0,
    gpuTemp: 0,
    gpuPower: 0,
    vramUsed: 0,
  };
}

function legacyPhoneBinding(snapshot: AccountCloudSnapshot): PhoneBinding | null {
  const installationId = readCalibratedInstallation(snapshot.accountKey);
  if (!installationId) return null;
  const phone = snapshot.devices.find((d) => d.kind === "phone");
  // Existing explicit installation evidence survives migration. Unknown
  // historical change time conservatively starts the replacement interval now.
  return { version: 0, installationId, deviceId: phone?.id ?? "", changedAt: mockServerNow(), suspendedAt: null };
}

function projectPhoneDevices(snapshot: AccountCloudSnapshot, binding: PhoneBinding | null): Device[] {
  return snapshot.devices.map((d) => migratePhonePause(d.kind === "phone" && !d.phoneInstallationId && d.id === binding?.deviceId
    ? { ...d, phoneInstallationId: binding.installationId } : d));
}

export const useApp = defineStore("app", () => {
  const bootSurface = getEntrySurface();
  const bootSnapshot = remoteApiEnabled
    ? createServerEmptySnapshot("default", "", bootSurface)
    : hydrateSnapshotEconomics(readAccountSnapshot("default")) ?? createSeedSnapshot("default", "alex@nexgrid.ai", bootSurface);
  const accountKey = ref(bootSnapshot.accountKey);
  const remoteAccountEpoch = createRemoteAccountEpoch(accountKey.value);
  const entrySurface = ref<EntrySurface>(bootSnapshot.entrySurface);
  const accountCloudUpdatedAt = ref(bootSnapshot.updatedAt);
  const user = ref<UserState>(remoteApiEnabled ? {
    ...bootSnapshot.user,
    joinedAt: 0,
    usdtBalance: 0,
    nexBalance: 0,
    pendingEarnings: 0,
    earningBuckets: createEarningBuckets(0, 0),
  } : bootSnapshot.user);
  const phoneBinding = ref<PhoneBinding | null>(bootSnapshot.phoneBinding ?? legacyPhoneBinding(bootSnapshot));
  const devices = ref<Device[]>(remoteApiEnabled ? [] : projectPhoneDevices(bootSnapshot, phoneBinding.value));
  const earnings = ref<EarningsState>(remoteApiEnabled
    ? { today: 0, todayNEX: 0, thisWeek: 0, thisMonth: 0, total: 0, history: [] }
    : bootSnapshot.earnings);
  // Authenticated Home/Earn commercial facts are a server projection. Remote
  // mode intentionally starts empty: missing authority is rendered as —.
  const homeTruth = ref<AppHomeOverview | null>(null);
  const homeTruthStatus = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  const homeTruthError = ref<string | null>(null);
  let homeTruthRefreshInFlight: { key: string; request: Promise<boolean> } | null = null;
  const remoteFleetStatus = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  const remoteFleetError = ref("");
  // 🔴 在线设备锚改由展示配置驱动(规格 FEAT-HOME02 ③:「既有硬编码常量改为由此配置驱动」)。
  //   在线数 = 舰队规模 × 在线率;呼吸带 = ±onlineJitter(只影响视觉,不进任何金额派生)。
  //   配置非法时回退编译期锚 —— 全局条不许因单个参数坏而冻结(异常3 的「单项坏不拖垮」);
  //   首页脉搏卡的「该格占位」判定读配置本体,不读这里的回退值,两层各管各的。
  const cfg = useConfig();
  //   ⚠️ publicStats 整段可能缺席:若干机器门用最小配置桩装载本 store(邀请码门实测炸在这),
  //   老持久行升级期同理 —— 缺席按「配置未知」走编译期锚回退,不许在 setup 期抛。
  //   🔴 收留判据 = publicStatsHealth(R2 审计 P1:上一版 isFinite&&>0 会把
  //   「非法但为正」的越域值收留进 global.activeDevices,而 on-grid/trust/globe 三处
  //   裸消费它 —— 同一行页脚里 200 万在线 × 按 2.8 万舰队算的 $/sec。根修这一个生产点,
  //   消费者自动收敛;域判定与卡片占位共用同一个函数,两层永不打架)。
  const pulseOnlineBaseline = (): number => {
    const ps = cfg.config.publicStats;
    // R3 P2:jitter 只属呼吸带(band 自己会回退 24),越域不该把合法舰队基线拖回种子
    const h = publicStatsHealth(ps ?? null);
    if (!ps || !h.fleetOk || !h.rateOk) return 0;
    return Math.round(ps.fleetDevices * (ps.onlineRatePct / 100));
  };
  const pulseJitterBand = (): number => {
    const ps = cfg.config.publicStats;
    if (!ps || !publicStatsHealth(ps).jitterOk) return 0;
    return ps.onlineJitter;
  };
  const global = ref<GlobalStats>(createInitialGlobal(pulseOnlineBaseline()));
  // 真后端模式下 config 是异步装载的；global 比它更早创建，不能永久保留启动时的 0。
  // 只重基线展示快照，不启动本地抖动，也不把客户端值写回任何业务状态。
  if (remoteApiEnabled) {
    watch(
      () => [
        cfg.syncFailed,
        cfg.config.publicStats.fleetDevices,
        cfg.config.publicStats.onlineRatePct,
      ],
      () => {
        const activeDevices = cfg.syncFailed ? 0 : pulseOnlineBaseline();
        if (global.value.activeDevices !== activeDevices) {
          global.value = { ...global.value, activeDevices };
        }
      },
      { immediate: true },
    );
  }
  /**
   * 🔴 提现单**列表**是源真理(与真后端 GET /api/withdrawals 同构)。
   * 此前只存最新一条,第二笔建单会把第一笔整个顶掉 —— 钱已扣、单据不可达、
   * 到账推进也永不再碰它。列表化后并发/跨日的多笔各自独立推进,互不覆盖。
   */
  const withdrawals = ref<Withdrawal[]>(remoteApiEnabled ? [] : bootSnapshot.withdrawals ?? []);
  /**
   * 🔴 在途单(非终态)列表。**列表级的问题必须问它,不能问 latestWithdrawal** ——
   * 独立验收实测:模型改成列表后,三个消费者仍拿「只问最新一条」的老问法去问
   * 列表级问题,于是「一张在途单 + 一张更新的已到账单」这个组合下全部答错:
   * 账单结算结算错单、钱包入口整行消失、换绑闸被静默架空。
   */
  const inFlightWithdrawals = computed(() => withdrawals.value.filter((w) => occupiesWithdrawalSlot(w.status)));
  /**
   * 展示面的**主单**:优先最早的在途单(用户最关心还没到账的那笔),
   * 都结清了才退回最近一笔。钱包入口与追踪页共用它,口径才不会打架。
   */
  const primaryWithdrawal = computed<Withdrawal | null>(() => {
    const pending = inFlightWithdrawals.value;
    if (pending.length) return pending.reduce((a, b) => (b.submittedAt < a.submittedAt ? b : a));
    return latestWithdrawal.value;
  });
  /** 最近一笔(按提交时刻)。派生值,不是独立状态。 */
  const latestWithdrawal = computed<Withdrawal | null>(() =>
    withdrawals.value.length
      ? withdrawals.value.reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a))
      : null,
  );
  let lastCloudSnapshot: AccountCloudSnapshot = bootSnapshot;
  const fundsSandboxStatus = ref<"idle" | "loading" | "ready" | "error">(mockFundsEnabled ? "idle" : "ready");
  const fundsSandboxError = ref("");
  // It starts absent and is cleared before every read. A surface can therefore
  // never label a stale, missing, malformed, or contradictory response as a
  // sandbox success.
  const fundsSandboxEvidence = ref<FundsSandboxEvidence | null>(null);
  let fundsSandboxBootstrapInFlight: { accountKey: string; request: Promise<boolean> } | null = null;
  // cfg 声明已随「在线设备锚配置化」上移到 global 初始化之前(同一个实例,别再声明第二个)
  const computeShareEnabled = computed(() => cfg.isEnabled("computeShareEnabled"));
  const slotDevices = computed(() =>
    computeShareEnabled.value ? devices.value : devices.value.filter((d) => d.kind !== "pc-gpu"),
  );
  const visibleDevices = slotDevices;
  // Slot authority must count hidden active pc-gpu devices too. When the PC
  // share flag is off, UI hides those devices, but they still reserve backend
  // capacity; otherwise closing/reopening the flag can push the account past 6.
  const activeSlotCount = computed(() => devices.value.filter((d) => d.activatedAt !== null).length);
  /**
   * FEAT-HOME02 ③ 首页「你的排名」的入参:本账号全部在产设备的**有效算力之和**(TOPS)。
   * 口径与聚合全在 lib/account-hashrate.ts(复用既有单台模型,不新造第二套)。
   *
   * 🔴 **收 now 入参,不写成 computed**:`Date.now()` 不是响应式源。写成
   * `computed(() => accountTotalHashrate(..., Date.now(), ...))` 时 Vue 只在 devices /
   * 配置变化时才重算,而 tick() 在会话被顶号 / 登出 / 吊销时早退(见 miningPaused),
   * devices 不再被重新赋值 —— 这个值就永久冻在最后一次重算的那一刻:掉线三分钟以上的
   * 手机仍按满档计进排名,而设备卡早已翻成离线(它用的是自己那个会走的 now ref)。
   * 让调用方传自己的时钟(composables/use-now.ts 或组件的 now ref),依赖就是显式的,
   * 页面时间一走值就跟着走。
   *
   * 问 visibleDevices 而不是 devices:电脑算力开关关掉时那些设备被冻结不产出
   * (tick/settleDevice 的 freezeComputeShareDevice),算力自然也不该计。
   *
   * 0 = 没有在产设备。**「未上榜」不在这里判** —— 三态(ranked/unranked/unavailable)
   * 是 lib/network-rank.ts 的事,这里只给一个数。
   */
  function myTotalHashrateAt(now: number): number {
    // GPU 档位表从配置 store 穿进去(运营在 E6 改档 / 加识别词,排名要跟着走),
    // 与 connectComputeShareDevice / download 页同一单源 —— 禁读编译期常量。
    return accountTotalHashrate(visibleDevices.value, now, cfg.config.onlineBonus, cfg.config.computeShare.gpuTiers);
  }
  // When the session is invalidated (logged in elsewhere / logged out / admin
  // revoked), mining freezes: tick() early-returns so no earnings accrue while
  // this carrier has no valid session. Cleared by resumeMining() once a fresh
  // session is established. App.vue also gates tick on session state, so this is
  // belt-and-suspenders.
  const miningPaused = ref(false);

  function syncDeviceRuntime(nextDevices: Device[], resetTimers = false) {
    const nextIds = new Set(nextDevices.map((d) => d.id));
    if (resetTimers) {
      deviceTimers.clear();
    } else {
      Array.from(deviceTimers.keys()).forEach((id) => {
        if (!nextIds.has(id)) deviceTimers.delete(id);
      });
    }
    nextDevices.forEach((d) => {
      if (!deviceTimers.has(d.id)) deviceTimers.set(d.id, { vital: 0 });
    });
    // Seed the aggregate baseline to the devices' pre-earned today totals so the
    // next settle() doesn't treat stored/cloud counters as new local earnings.
    lastTickAggregate.usd = nextDevices.reduce((s, d) => s + d.todayEarnings, 0);
    lastTickAggregate.nex = nextDevices.reduce((s, d) => s + d.todayEarningsNEX, 0);
  }

  // seed per-device timers
  function reseedDeviceRuntime(nextDevices: Device[]) {
    syncDeviceRuntime(nextDevices, true);
  }

  function adoptAccountSnapshot(snapshot: AccountCloudSnapshot, resetRuntime = false) {
    const normalizedSnapshot = { ...snapshot, user: withDefaultEarningBuckets(snapshot.user) };
    user.value = normalizedSnapshot.user;
    // Keep the raw snapshot as the merge base: the next write persists this migration.
    phoneBinding.value = snapshot.phoneBinding ?? legacyPhoneBinding(snapshot);
    devices.value = projectPhoneDevices(snapshot, phoneBinding.value);
    earnings.value = snapshot.earnings;
    withdrawals.value = snapshot.withdrawals ?? [];
    syncDeviceRuntime(snapshot.devices, resetRuntime);
    lastCloudSnapshot = normalizedSnapshot;
    accountCloudUpdatedAt.value = normalizedSnapshot.updatedAt;
  }

  reseedDeviceRuntime(devices.value);

  function persistAccountSnapshot(): boolean {
    // 🔴🔴 返回值语义 = 「内存这一拍可以留下吗」,**不是**「有没有写磁盘」
    // (2026-08-12 双向分叉合并实测出的资金级缺陷,根治而非逐点打补丁)。
    //
    // 远端档按设计不落本地盘(状态归服务端)。但本函数有 12 个调用点,清一色是
    // `if (!persistAccountSnapshot()) { 回滚内存; return false; }` —— 于是同一个 false
    // 被当成「落盘失败」,把刚写进内存的**服务端结论**整个回滚掉。
    // 后果(远端档 = 生产档):服务端说这单被拒/已到账,客户端写进去又立刻撤回,
    // 单据永远停在处理中 → 在途闸永不释放 → 换绑收款地址与下一笔提现被永久拦死,
    // 账单行永远「处理中」。扣款 / 退款 / 奖励入账三族都会踩同一个碰撞。
    //
    // 所以这里返回 true:不落盘是**预期结果**,不是失败,内存该留下。
    // 真正的落盘失败仍由下面的 result.persisted 如实返回 false(mock 档 storage 抖动)。
    // 判据:这条不变量由 withdraw-status-mirror-runtime 的「结论落定」格看住。
    if (remoteApiEnabled) return true;
    const snapshot: AccountCloudSnapshot = {
      schema: 1,
      accountKey: accountKey.value,
      entrySurface: entrySurface.value,
      updatedAt: Date.now(),
      user: user.value,
      devices: devices.value,
      phoneBinding: phoneBinding.value,
      earnings: earnings.value,
      withdrawals: withdrawals.value,
    };
    const result = mergeAndWriteAccountSnapshotResult(lastCloudSnapshot, snapshot);
    adoptAccountSnapshot(result.snapshot);
    return result.persisted;
  }

  function canonicalKind(device: CanonicalE3Device): DeviceKind {
    const raw = `${device.productCode} ${device.deviceType}`.toLowerCase();
    if (raw.includes("phone") || raw.includes("mobile")) return "phone";
    if (raw.includes("pc-gpu") || raw.includes("compute-share")) return "pc-gpu";
    if (raw.includes("cloud")) return "cloud-share";
    if (raw.includes("rack") && raw.includes("p2")) return "stellarrack-p2";
    if (raw.includes("rack")) return "stellarrack-p1";
    if (raw.includes("pro-v2") || raw.includes("pro_v2")) return "stellarbox-pro-v2";
    if (raw.includes("pro")) return "stellarbox-pro";
    if (raw.includes("s1")) return "stellarbox-s1";
    throw new Error("E3_DEVICE_KIND_UNSUPPORTED");
  }

  function canonicalDevice(device: CanonicalE3Device, serverNow: number): Device {
    const capacity = Math.max(0, Math.min(1, device.capacityPct / 100));
    const fullDailyUsdt = capacity > 0 ? device.dailyUsdt / capacity : 0;
    const fullDailyNex = capacity > 0 ? device.dailyNex / capacity : 0;
    const active = ["ACTIVE", "ONLINE", "BUSY"].includes(device.status);
    return {
      id: String(device.id),
      rowVersion: device.rowVersion,
      kind: canonicalKind(device),
      name: device.name,
      gpu: device.gpuModel,
      gpuModel: device.gpuModel,
      vramTotal: device.vramTotalGb,
      basePower: device.basePowerW,
      baseRate: fullDailyUsdt,
      baseRateNEX: fullDailyNex,
      purchasedAt: device.purchasedAt ?? serverNow,
      activatedAt: active ? (device.activatedAt ?? serverNow) : null,
      pendingDeactivate: device.pendingDeactivate,
      lastSettledAt: null,
      onlineHeartbeatAt: null,
      status: active ? "online" : "offline",
      gpuUsage: 0,
      gpuTemp: 0,
      gpuPower: 0,
      vramUsed: 0,
      currentTask: null,
      recentTasks: [],
      taskLockUntil: null,
      todayEarnings: device.todayEarningsUsdt,
      todayEarningsNEX: device.todayEarningsNex,
      cumulativeEarningsUsdt: device.cumulativeOutputUsdt,
      paidPriceUsdt: device.actualPaidUsdt,
      location: device.location,
      pausedReason: null,
    };
  }

  function remoteTask(task: CanonicalTaskAssignment, location: string): CurrentTask {
    return {
      id: task.taskNo,
      category: task.taskClass,
      type: task.taskName,
      model: task.model,
      client: task.client,
      location,
      totalSec: task.requiredSeconds,
      startedAt: task.startedAt,
      reward: task.rewardUsdt,
    };
  }

  function applyRemoteAssignments(base: Device[], state: CanonicalTaskAssignments): Device[] {
    const byDevice = new Map(state.devices.map((entry) => [String(entry.deviceId), entry]));
    return base.map((device) => {
      const authority = byDevice.get(device.id);
      if (!authority) return { ...device, currentTask: null, recentTasks: [], taskLockUntil: null };
      return {
        ...device,
        taskLockUntil: authority.lockUntil,
        currentTask: authority.currentTask ? remoteTask(authority.currentTask, device.location ?? "") : null,
        recentTasks: authority.recentTasks.map((entry) => ({
          ...remoteTask(entry, device.location ?? ""),
          completedAt: entry.completedAt ?? entry.completableAt,
          receiptNo: entry.receiptNo,
        })),
      };
    });
  }

  async function trustedTaskProof(task: CanonicalTaskAssignment): Promise<TrustedTaskCompletionProof> {
    const provider = (globalThis as typeof globalThis & {
      __NEXION_TRUSTED_TASK_PROOF__?: (challenge: {
        taskNo: string; deviceId: number; proofNonce: string; proofExpiresAt: number;
      }) => Promise<TrustedTaskCompletionProof>;
    }).__NEXION_TRUSTED_TASK_PROOF__;
    if (!provider || !task.proofNonce || !task.proofExpiresAt) {
      throw new Error("TASK_ASSIGNMENT_TRUSTED_EXECUTOR_UNAVAILABLE");
    }
    return provider({ taskNo: task.taskNo, deviceId: task.deviceId,
      proofNonce: task.proofNonce, proofExpiresAt: task.proofExpiresAt });
  }

  // IDEMPOTENCY-FRESH-OK: 按分钟分桶:同一分钟内重试复用同一把。
  // ⚠️ 已知上限:超过 60s 再重试就是新键。任务领取/完成走的是服务端权威状态机(claim 已被别人
  //    领走会被拒),所以窗口内不会重复发奖;真要收紧应改成「按 taskNo 冻结」而不是按时间分桶。
  function taskMutationKey(scope: string): string {
    return `e18:${scope}:${Math.floor(Date.now() / 60000)}`;
  }

  async function syncRemoteTaskAssignments(): Promise<void> {
    const calledAt = Date.now();
    if (!remoteApiEnabled || miningPaused.value || remoteTaskSyncInFlight || calledAt < remoteTaskSyncAfter) return;
    const request = remoteAccountEpoch.snapshot();
    remoteTaskSyncInFlight = true;
    remoteTaskSyncAfter = calledAt + REMOTE_TASK_SYNC_MS;
    try {
      let state = await taskAssignmentApi.state();
      // before applying remote task assignments, reject any response from a prior account bind.
      if (!remoteAccountEpoch.isCurrent(request)) return;
      devices.value = applyRemoteAssignments(devices.value, state);
      for (const device of devices.value) {
        if (!remoteAccountEpoch.isCurrent(request)) return;
        const authority = state.devices.find((entry) => String(entry.deviceId) === device.id);
        if (!authority || device.status !== "online" || device.activatedAt == null) continue;
        if (authority.currentTask && authority.currentTask.completableAt <= state.serverNow) {
          const proof = await trustedTaskProof(authority.currentTask);
          if (!remoteAccountEpoch.isCurrent(request)) return;
          await taskAssignmentApi.complete(authority.currentTask.taskNo, proof,
            taskMutationKey(`complete:${authority.currentTask.taskNo}`));
        } else if (!authority.currentTask && (authority.lockUntil == null || authority.lockUntil <= state.serverNow)) {
          if (!remoteAccountEpoch.isCurrent(request)) return;
          await taskAssignmentApi.claim(authority.deviceId, taskMutationKey(`claim:${authority.deviceId}`));
        }
      }
      if (!remoteAccountEpoch.isCurrent(request)) return;
      await refreshRemoteFleet(request);
    } catch (cause) {
      if (remoteAccountEpoch.isCurrent(request)) {
        remoteFleetStatus.value = "error";
        remoteFleetError.value = cause instanceof Error ? cause.message : "TASK_ASSIGNMENT_SYNC_FAILED";
      }
    } finally {
      remoteTaskSyncInFlight = false;
    }
  }

  // 权威不可达是常态输入,不 reject(selfcheck-remote-refresh-resilience);
  // 失败信号走返回值:false = 本轮没拿到权威快照(降级态已落好)。
  function applyHomeEarnings(projection: AppHomeOverview) {
    const range = projection.earnings;
    earnings.value = {
      ...earnings.value,
      today: range.today.usdt ?? 0,
      todayNEX: range.today.nex ?? 0,
      thisWeek: range.week.usdt ?? 0,
      thisMonth: range.month.usdt ?? 0,
      total: range.all.usdt ?? 0,
    };
  }

  function refreshHomeTruth(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return Promise.resolve(true);
    const key = `${request.accountKey}:${request.epoch}`;
    if (homeTruthRefreshInFlight?.key === key) return homeTruthRefreshInFlight.request;
    const refresh = (async () => {
      const activeSession = sessionVault.read();
      if (!activeSession || request.accountKey !== `user:${activeSession.user.userId}`) return false;
      homeTruthStatus.value = "loading";
      homeTruthError.value = null;
      try {
        const projection = await appHomeApi.fetch();
        if (!remoteAccountEpoch.isCurrent(request)) throw new Error("REMOTE_ACCOUNT_CHANGED");
        homeTruth.value = projection;
        applyHomeEarnings(projection);
        homeTruthStatus.value = "ready";
        return true;
      } catch (cause) {
        if (remoteAccountEpoch.isCurrent(request)) {
          homeTruth.value = null;
          homeTruthStatus.value = "error";
          homeTruthError.value = cause instanceof Error ? cause.message : "APP_HOME_OVERVIEW_UNAVAILABLE";
        }
        return false;
      }
    })();
    homeTruthRefreshInFlight = { key, request: refresh };
    void refresh.finally(() => {
      if (homeTruthRefreshInFlight?.request === refresh) homeTruthRefreshInFlight = null;
    });
    return refresh;
  }

  async function refreshRemoteFleet(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    const expectedAccountKey = request.accountKey;
    // Remote H5 deliberately drops credentials on reload. Never turn a Login
    // page lifecycle hook or a default-account rebind into an authenticated
    // request: its late unauthorized callback could otherwise clear a newer
    // session created while that stale request was still settling.
    try {
      const activeSession = sessionVault.read();
      if (!activeSession || expectedAccountKey !== `user:${activeSession.user.userId}`) return false;
      const homeRefresh = refreshHomeTruth(request);
      remoteFleetStatus.value = "loading";
      remoteFleetError.value = "";
      const [fleet, assignmentState] = await Promise.all([deviceE3Api.fleet(), taskAssignmentApi.state()]);
      if (!remoteAccountEpoch.isCurrent(request)) throw new Error("REMOTE_ACCOUNT_CHANGED");
      installCanonicalLifecycleConfig(fleet.capacitySchedule);
      const nextDevices = applyRemoteAssignments(
        fleet.devices.map((device) => canonicalDevice(device, fleet.serverNow)), assignmentState);
      devices.value = nextDevices;
      syncDeviceRuntime(nextDevices, true);
      user.value = {
        ...user.value,
        joinedAt: fleet.userJoinedAt,
        nexBalance: fleet.walletNex,
        pendingEarnings: 0,
        ...(mockFundsEnabled ? {} : {
          usdtBalance: fleet.walletUsdt,
          earningBuckets: createEarningBuckets(fleet.walletUsdt, fleet.userJoinedAt),
        }),
      };
      earnings.value = {
        today: fleet.realizedTodayUsdt,
        todayNEX: fleet.realizedTodayNex,
        thisWeek: 0,
        thisMonth: 0,
        total: 0,
        history: [],
      };
      await homeRefresh;
      if (homeTruth.value && remoteAccountEpoch.isCurrent(request)) applyHomeEarnings(homeTruth.value);
      remoteFleetStatus.value = "ready";
      return true;
    } catch (cause) {
      if (remoteAccountEpoch.isCurrent(request)) {
        devices.value = [];
        syncDeviceRuntime([], true);
        user.value = {
          ...user.value,
          joinedAt: 0,
          nexBalance: 0,
          pendingEarnings: 0,
          ...(mockFundsEnabled ? {} : {
            usdtBalance: 0,
            earningBuckets: createEarningBuckets(0, 0),
          }),
        };
        remoteFleetStatus.value = "error";
        remoteFleetError.value = cause instanceof Error ? cause.message : "E3_FLEET_UNAVAILABLE";
      }
      return false;
    }
  }

  function bindAccount(rawAccountKey: string, surface: EntrySurface = getEntrySurface()) {
    const key = normalizeAccountKey(rawAccountKey);
    if (remoteApiEnabled) {
      remoteAccountEpoch.bind(key);
      const emptySnapshot = createServerEmptySnapshot(key, rawAccountKey, surface);
      accountKey.value = emptySnapshot.accountKey;
      entrySurface.value = emptySnapshot.entrySurface;
      miningPaused.value = false;
      adoptAccountSnapshot(emptySnapshot, true);
      withdrawals.value = [];
      lastCloudSnapshot = createServerEmptySnapshot(key, rawAccountKey, surface);
      remoteFleetStatus.value = "idle";
      remoteFleetError.value = "";
      homeTruth.value = null;
      homeTruthStatus.value = "idle";
      homeTruthError.value = null;
      fundsSandboxStatus.value = mockFundsEnabled ? "idle" : "ready";
      fundsSandboxError.value = "";
      fundsSandboxEvidence.value = null;
      void refreshRemoteFleet(); // 自吞降级(resilience 门);error 态由缝内落好
      void refreshRemoteWithdrawalList(key);
      if (mockFundsEnabled) void refreshFundsSandboxForAccount(key);
      return;
    }
    const snapshot = hydrateSnapshotEconomics(readAccountSnapshot(key)) ?? createSeedSnapshot(key, rawAccountKey, surface);
    accountKey.value = snapshot.accountKey;
    entrySurface.value = surface;
    const boundSnapshot: AccountCloudSnapshot = {
      ...snapshot,
      entrySurface: surface,
      user: { ...snapshot.user, email: snapshot.user.email || rawAccountKey || "alex@nexgrid.ai" },
    };
    miningPaused.value = false;
    adoptAccountSnapshot(boundSnapshot, true);
    // persist-verdict-ok: 换号后的首拍落盘;失败时磁盘保持原样、内存已拨回,后续每次资金动作各自落盘复验
    persistAccountSnapshot();
  }

  /** Rehydrates every historical production withdrawal after login/reload. */
  async function refreshRemoteWithdrawalList(expectedAccountKey = accountKey.value): Promise<boolean> {
    if (!remoteApiEnabled || mockFundsEnabled || expectedAccountKey !== accountKey.value) return false;
    const request = remoteAccountEpoch.snapshot();
    try {
      const rows = await withdrawalApi.list();
      if (!remoteAccountEpoch.isCurrent(request) || expectedAccountKey !== accountKey.value) return false;
      const canonical = rows.map((row) => toCanonicalWithdrawal(row, row.targetAddress ?? "", row.createdAt));
      withdrawals.value = canonical;
      lastCloudSnapshot = { ...lastCloudSnapshot, withdrawals: canonical };
      return true;
    } catch {
      return false;
    }
  }

  function tick(deltaMs: number) {
    if (remoteApiEnabled) {
      void syncRemoteTaskAssignments();
      return;
    }
    enforcePhoneRuntime();
    // ── Global platform stats jitter ──
    // Runs even while the personal session is paused — platform-wide figures
    // must not freeze on an individual's mining state. Symmetric BOUNDED
    // wobble only: the fleet/jobs figures are anchors and must not
    // extrapolate (the old always-add tick implied +130k devices/day; see
    // docs/changes/2026-07-24-platform-stats-single-anchor.md). Bands clamp
    // the O(√t) drift of an unbounded symmetric walk over long dwells.
    const devDrift = Math.random();
    const nextDevices = global.value.activeDevices + (devDrift > 0.8 ? 1 : devDrift < 0.2 ? -1 : 0);
    const nextJobs = global.value.activeJobs + Math.floor(Math.random() * 5) - 2;
    // 呼吸带跟配置走(运营改了舰队/在线率/抖幅,已开着的会话在带内自然漂过去)
    const devBase = pulseOnlineBaseline();
    const devBand = pulseJitterBand();
    global.value = {
      ...global.value,
      activeDevices: Math.min(devBase + devBand, Math.max(devBase - devBand, nextDevices)),
      activeJobs: Math.min(ACTIVE_JOBS_SEED + 36, Math.max(ACTIVE_JOBS_SEED - 36, nextJobs)),
    };
    if (miningPaused.value) return;

    // ── Per-device updates ──
    const newDevices = devices.value.map((d) => {
      if (d.kind === "pc-gpu" && !computeShareEnabled.value) return freezeComputeShareDevice(d);
      if (d.activatedAt === null) return d;
      if (d.status !== "online" || d.kind === "cloud-share") return d;
      const timer = deviceTimers.get(d.id) ?? { vital: 0 };
      timer.vital += deltaMs;
      deviceTimers.set(d.id, timer);

      const next: Device = { ...d };

      // Phone battery + network gating
      if (d.kind === "phone") {
        const allowed = phoneExecutionAllowed(d);
        if (allowed === null) return d;
        if (!allowed) return stopPhoneTask(d);
        // H5 observes fresh APP work; it never runs or completes phone tasks.
        if (getCarrier() !== "app" || d.phoneInstallationId !== getDeviceId()) return d;
        const reason = phoneRuntimePauseReason(d);
        next.pausedReason = reason;
        if (reason !== null) {
          if (next.currentTask) {
            const startedInterrupt = next.interruptedAt ?? Date.now();
            if (interruptInfo(startedInterrupt, Date.now()).expired) {
              next.currentTask = null;
              next.interruptedAt = null;
            } else {
              next.interruptedAt = startedInterrupt;
            }
          } else {
            next.interruptedAt = null;
          }
          next.gpuUsage = 0;
          next.miningSince = null; // paused → continuous-online run ends, stability bonus resets
          next.lastSettledAt = null;
          next.onlineHeartbeatAt = null;
          return next;
        }
        if (next.interruptedAt != null) {
          if (next.currentTask) {
            if (interruptInfo(next.interruptedAt, Date.now()).expired) {
              next.currentTask = null;
            } else {
              const heldMs = Date.now() - next.interruptedAt;
              next.currentTask = { ...next.currentTask, startedAt: next.currentTask.startedAt + heldMs };
            }
          }
          next.interruptedAt = null;
        }
        // Running (sufficient battery + network): start a fresh continuity run if none.
        if (next.miningSince == null) next.miningSince = Date.now();
      } else {
        next.pausedReason = null;
      }

      // GPU vitals refresh ~3s
      if (timer.vital >= 3000) {
        timer.vital = 0;
        next.gpuUsage = Math.round(normalRandom(82, 6, 65, 97));
        next.gpuTemp = Math.round(55 + next.gpuUsage * 0.18 + (Math.random() * 6 - 3));
        next.gpuPower = Math.round(d.basePower * (0.85 + (next.gpuUsage / 100) * 0.2));
        next.vramUsed = +(d.vramTotal * (0.7 + Math.random() * 0.2)).toFixed(1);
      }

      // Earnings accrual moved to settle() (PRD §6.11): yield is settled by
      // wall-clock Δ since lastSettledAt — not accumulated tick time — so a
      // closed/backgrounded gap catches up on reopen. Telemetry stays per-tick
      // here; settle() runs once below after this telemetry pass commits.

      // Task progress / rotation
      if (next.currentTask) {
        const elapsedSec = (Date.now() - next.currentTask.startedAt) / 1000;
        if (elapsedSec >= next.currentTask.totalSec) {
          const completed: CompletedTask = { ...next.currentTask, completedAt: Date.now() };
          next.recentTasks = [completed, ...next.recentTasks].slice(0, 10);
          useReceipts().add(generateReceipt(completed, d));
          if (next.pendingDeactivate) {
            next.activatedAt = null;
            next.pendingDeactivate = false;
            next.lastSettledAt = null;
            next.onlineHeartbeatAt = null;
            next.gpuUsage = 0;
            next.gpuTemp = 0;
            next.gpuPower = 0;
            next.vramUsed = 0;
            next.currentTask = null;
            next.todayEarnings = 0;
            next.todayEarningsNEX = 0;
            return next;
          }
          next.currentTask = pickRandomTask(d.vramTotal);
        }
      } else {
        next.currentTask = pickRandomTask(d.vramTotal);
      }

      return next;
    });

    // Telemetry committed; earnings settled separately via the single source.
    devices.value = newDevices;
    settle();
  }

  /** PRD §6.11 — settle every device by wall-clock Δ (settleDevice), then roll
   *  the aggregate today/week/month/total + NEX balance forward by the positive
   *  delta. Called by tick() (steady state) and on app foreground (App.vue onShow)
   *  so a backgrounded / reopened session catches its offline gap up in one shot.
   *  The SINGLE mock accrual path — PROD replaces it with the candidate aggregate
   *  GET/SSE contract in PRD §9.11c.1; no settle mutation endpoint is frozen. */
  function settle() {
    // 🔴 与上面的 tick() 同一道闸(此前只 tick 有,settle 漏了 —— 而 settle 是**唯一**的
    // 计收路径,且 App.vue 的 ensureBusinessLoopsRunning / connectComputeShareDevice 都直调它)。
    // 远端模式下这里每跑一次就凭设备墙钟给自己发一次钱:earnings.* 之外还经 bucketUserEarnings +
    // applyReleaseOutcome 直写 usdtBalance / nexBalance / withdrawableUsdt。收益归服务端
    // (GET /api/me/earnings —— PRD §9.11c.1),client 不自算。
    if (remoteApiEnabled) return;
    if (miningPaused.value) return;
    enforcePhoneRuntime();
    const cfgStore = useConfig();
    // FEAT-RISK02 异常3: 配置同步失败 → 暂停结算并由钱包显示失败态;
    // 禁止回退到前端写死默认值继续结算。
    if (cfgStore.syncFailed) return;
    const now = Date.now();
    const carrier = getCarrier();
    const onlineBonus = cfgStore.config.onlineBonus;
    // R5 簇状态实时性: 每轮结算现算当前簇,禁用注册时缓存的状态。
    const clusterEval = evaluateAccountCluster(accountKey.value);
    // R7: settle from the pre-existing heartbeat first, then stamp the App
    // heartbeat for the next tick. Reversing these two steps overpays a stale
    // offline gap after the App is reopened.
    const sourceDevices = devices.value;
    const anchorBefore = new Map(sourceDevices.map((d) => [d.id, d.lastSettledAt ?? null]));
    const onlineBefore = new Map(sourceDevices.map((d) => [d.id, isDeviceOnline(d, now)]));
    const { settled, nextDevices } = settleDeviceBatch(
      sourceDevices,
      carrier,
      now,
      onlineBonus,
      computeShareEnabled.value,
      residentPhoneDeviceId(),
      !phoneBinding.value || liveAppSession(phoneBinding.value.installationId) !== null,
    );
    // Only a delta that was already backed by a fresh device heartbeat counts
    // as App online attestation. A stale reopen tick is baseline and attests 0.
    // 用 settleDevice 实际推进的锚点差(after > before 才是真结算的墙钟那一拍),
    // 与收益累计同源;首次登记(before=null)/未达结算间隔(锚点未动)都不计,
    // 修 audit U1「复用外层旧锚点每 tick 重算全量差 → 系统性多计 ~1.5x」。
    // R7: onlineBefore is the device-heartbeat signal; carrier only proves this
    // mock tick originated from the resident App.
    if (carrier === "app") {
      for (const d of settled) {
        if (d.kind !== "phone" || d.pausedReason != null || !onlineBefore.get(d.id)) continue;
        const before = anchorBefore.get(d.id) ?? null;
        const after = d.lastSettledAt ?? null;
        if (before != null && after != null && after > before) {
          recordAttestation(accountKey.value, after - before);
        }
      }
    }

    const aggregateToday = settled.reduce((sum, d) => sum + d.todayEarnings, 0);
    const aggregateTodayNEX = settled.reduce((sum, d) => sum + d.todayEarningsNEX, 0);
    const positiveUsdDelta = Math.max(0, aggregateToday - lastTickAggregate.usd);
    const positiveNexDelta = Math.max(0, aggregateTodayNEX - lastTickAggregate.nex);
    lastTickAggregate.usd = aggregateToday;
    lastTickAggregate.nex = aggregateTodayNEX;

    const currentTodayUSD = earnings.value.today;
    const nextTodayUSD = accumulateUsdAccrual(currentTodayUSD, positiveUsdDelta);
    const nextTodayNEX = +(earnings.value.todayNEX + positiveNexDelta).toFixed(2);

    devices.value = nextDevices;
    earnings.value = {
      ...earnings.value,
      today: nextTodayUSD,
      todayNEX: nextTodayNEX,
      thisWeek: accumulateUsdAccrual(earnings.value.thisWeek, positiveUsdDelta),
      thisMonth: accumulateUsdAccrual(earnings.value.thisMonth, positiveUsdDelta),
      total: accumulateUsdAccrual(earnings.value.total, positiveUsdDelta),
    };
    const routedUsd = completedUsdCentDelta(currentTodayUSD, nextTodayUSD);
    const routedNex = +positiveNexDelta.toFixed(2);
    user.value = {
      ...bucketUserEarnings(
        user.value,
        clusterEval.bucketRoute,
        routedUsd,
        routedNex,
        clusterEval.configVersion,
        now,
      ),
      pendingEarnings: nextTodayUSD,
    };
    // R1: 非可提路线的入账记分录 —— 释放引擎只认 attest/manual,不认时间。
    if (clusterEval.bucketRoute === "pending_review" || clusterEval.bucketRoute === "bonus_locked") {
      appendLedgerEntry(accountKey.value, clusterEval.clusterId, clusterEval.bucketRoute, routedUsd, routedNex);
    }
    // R1 释放判定: attest 达标 → 释放待审/锁定;熔断命中 → 待审升锁定。
    user.value = applyReleaseOutcome(user.value, evaluateAttestRelease(accountKey.value, clusterEval), now);
    // persist-verdict-ok: 收益结算 tick 每秒重跑,这一拍没落盘下一拍从磁盘状态重算(单调、幂等)
    persistAccountSnapshot();
  }

  /** 把释放引擎的结果落到资金桶(台账为辅助账,金额 clamp 到桶余额,漂移容忍)。 */
  function applyReleaseOutcome(current: UserState, outcome: ReleaseOutcome, now: number): UserState {
    if (!hasReleaseEffect(outcome)) return current;
    const buckets = { ...withDefaultEarningBuckets(current).earningBuckets, lastBucketedAt: now };
    // 待审 → 可提
    const relPendUsd = Math.min(outcome.releasedPendingUsdt, buckets.pendingReviewUsdt);
    buckets.pendingReviewUsdt = +(buckets.pendingReviewUsdt - relPendUsd).toFixed(2);
    // 锁定 → 可提
    const relLockUsd = Math.min(outcome.releasedLockedUsdt, buckets.bonusLockedUsdt);
    buckets.bonusLockedUsdt = +(buckets.bonusLockedUsdt - relLockUsd).toFixed(2);
    // 熔断: 待审 → 锁定(在释放之后应用,操作的是未释放余量)
    const escUsd = Math.min(outcome.escalatedUsdt, buckets.pendingReviewUsdt);
    buckets.pendingReviewUsdt = +(buckets.pendingReviewUsdt - escUsd).toFixed(2);
    buckets.bonusLockedUsdt = +(buckets.bonusLockedUsdt + escUsd).toFixed(2);
    // NEX 锁定 → 余额
    const relNex = Math.min(outcome.releasedPendingNex + outcome.releasedLockedNex, buckets.lockedNex);
    buckets.lockedNex = +(buckets.lockedNex - relNex).toFixed(2);
    const relUsd = +(relPendUsd + relLockUsd).toFixed(2);
    buckets.withdrawableUsdt = +(buckets.withdrawableUsdt + relUsd).toFixed(2);
    return {
      ...current,
      earningBuckets: buckets,
      usdtBalance: +(current.usdtBalance + relUsd).toFixed(2),
      nexBalance: +(current.nexBalance + relNex).toFixed(2),
    };
  }

  /** ⚠️ DEV/DEMO-ONLY: 模拟 D2 人工放行本账户全部待审收益(mock 双端不打通,DR-7)。 */
  function _devGrantManualRelease() {
    if (import.meta.env.PROD) return; // 资金释放入口,store 层二层 guard(硬规则5)
    user.value = applyReleaseOutcome(user.value, _devGrantManualReleaseLedger(accountKey.value), Date.now());
    // persist-verdict-ok: dev 入口,非生产路径
    persistAccountSnapshot();
  }

  // ⚠️ MOCK-ONLY demo helper (ported from index.ts setPhoneRuntime). Lets the
  // device card toggle isCharging / isWifiConnected / batteryLevel on a phone so
  // reviewers can simulate low battery / losing network and watch the gating fire.
  // Real backend pulls these from candidate POST /api/device/:id/heartbeat
  // (PRD §6.11/§12.2) — client must NOT mutate. Only patches phone-kind devices.
  function setPhoneRuntime(
    id: string,
    patch: Partial<Pick<Device, "isCharging" | "isWifiConnected" | "batteryLevel">>,
  ) {
    devices.value = devices.value.map((d) => {
      if (d.id !== id || d.kind !== "phone") return d;
      const next = { ...d, ...patch };
      const pausedReason = phoneRuntimePauseReason(next);
      return pausedReason == null && d.pausedReason == null
        ? { ...next, pausedReason }
        : {
            ...next,
            pausedReason,
            interruptedAt: pausedReason != null && next.currentTask ? next.interruptedAt ?? Date.now() : next.interruptedAt,
            gpuUsage: pausedReason != null ? 0 : next.gpuUsage,
            miningSince: null,
            lastSettledAt: null,
            onlineHeartbeatAt: null,
          };
    });
    // persist-verdict-ok: 手机运行态遥测,非资金;失败时内存已拨回,下一次心跳重写
    persistAccountSnapshot();
  }

  // Apply a calibration result to the phone device: refreshes its yield baseline
  // + displayed NPU spec from the (deterministic, per-device) capability, and
  // starts a fresh continuity run. Called by the onboarding/recalibration ritual
  // after measureDeviceCapability(). PROD: GET /api/onboarding/calibrate/result
  // returns score/tier/yield baseline; the client applies that result here.
  function phoneActivationError(): PhoneActivationError | null {
    if (getCarrier() === "app" && phoneBinding.value && phoneBinding.value.installationId !== getDeviceId()
      && (cfg.syncFailed || cfg.loading)) return "config-unavailable";
    const error = phoneReplacementError(phoneBinding.value, getDeviceId(), getCarrier(), cfg.config.phoneBinding, mockServerNow());
    if (error) return error;
    const live = liveAppSession(getDeviceId());
    return live === null ? "storage-failed" : live ? null : "reauth-required";
  }

  function liveAppSession(installationId: string): boolean | null {
    const now = Date.now();
    const records = readAccountSessionRecordsStrict(accountKey.value);
    if (records === null) return null;
    return records.some((s) => s.entrySurface === "signed-app"
      && s.deviceId === installationId && now >= s.lastSeenAt && now - s.lastSeenAt < 180000);
  }

  function residentPhoneDeviceId(): string | undefined {
    const binding = phoneBinding.value;
    if (!binding || binding.suspendedAt !== null || getCarrier() !== "app" || binding.installationId !== getDeviceId()) return;
    return liveAppSession(binding.installationId) ? binding.deviceId : undefined;
  }

  function phoneExecutionAllowed(d: Device): boolean | null {
    if (!matchesPhoneBinding(d, phoneBinding.value) || phoneBinding.value?.suspendedAt !== null) return false;
    const live = liveAppSession(phoneBinding.value!.installationId);
    if (live !== true) return live;
    return d.id === residentPhoneDeviceId() || isDeviceOnline(d, Date.now());
  }

  function enforcePhoneRuntime() {
    const latest = readAccountSnapshot(accountKey.value);
    if (latest && JSON.stringify(latest.phoneBinding ?? null) !== JSON.stringify(phoneBinding.value)) adoptAccountSnapshot(latest);
    else if (latest && latest.devices.some((d) => d.kind === "phone"
      && (d.onlineHeartbeatAt ?? 0) > (devices.value.find((row) => row.id === d.id)?.onlineHeartbeatAt ?? 0))) {
      // Adopt funds, merge base and aggregate anchors together. Importing only
      // the phone counters would count remote earnings again as local income.
      adoptAccountSnapshot(latest);
    }
    devices.value = devices.value.map((d) => {
      if (d.kind !== "phone") return d;
      const allowed = phoneExecutionAllowed(d);
      if (allowed === null) return d;
      return !allowed || (d.onlineHeartbeatAt != null && !isDeviceOnline(d, Date.now()) && d.interruptedAt == null) ? stopPhoneTask(d) : d;
    });
  }

  // Only a completed, explicit authentication calls this. onShow/session refresh
  // cannot clear a different-phone login suspension.
  function acceptPhoneSignIn(): boolean {
    const latest = readAccountSnapshot(accountKey.value);
    if (latest) adoptAccountSnapshot(latest);
    const binding = phoneBinding.value;
    if (getCarrier() === "app" && binding && (binding.installationId !== getDeviceId() || binding.suspendedAt !== null)) {
      phoneBinding.value = { ...binding, version: binding.version + 1,
        suspendedAt: binding.installationId === getDeviceId() ? null : mockServerNow() };
      devices.value = devices.value.map(stopPhoneTask);
    }
    if (getCarrier() !== "app") enforcePhoneRuntime();
    return persistAccountSnapshot();
  }

  function applyPhoneCalibration(cap: DeviceCapability, reservedSlots = 0): PhoneActivationError | null {
    const error = phoneActivationError();
    if (error) return error;
    const installationId = getDeviceId();
    const now = mockServerNow();
    const binding = phoneBinding.value;
    const legacy = !binding ? devices.value.find((d) => d.kind === "phone" && !d.phoneInstallationId) : undefined;
    const old = devices.value.find((d) => d.id === binding?.deviceId) ?? legacy;
    const same = devices.value.find((d) => d.kind === "phone" && d.phoneInstallationId === installationId) ?? legacy;
    // Replacing an active phone consumes its existing slot. A warehouse phone
    // needs a genuinely free slot, including the trial's reservation.
    const releasing = old?.activatedAt != null ? 1 : 0;
    if (activeSlotCount.value - releasing + reservedSlots >= MAX_DEVICES) return "slots-full";
    const device = same ?? createDevice("phone", `phone-${installationId}`);
    const activated: Device = { ...stopPhoneTask(device), phoneInstallationId: installationId,
      activatedAt: now, pendingDeactivate: false, status: "online", baseRate: cap.baseRateUsdt,
      baseRateNEX: cap.baseRateNex, gpu: `Mobile NPU · ~${cap.tops} TOPS`, capabilityScore: cap.score,
      capabilityTops: cap.tops, capabilityTier: cap.tier, miningSince: now, lastSettledAt: now };
    devices.value = devices.value.map((d) => d.id === activated.id ? activated : d.kind === "phone"
      ? { ...stopPhoneTask(d), activatedAt: null, pendingDeactivate: false } : d);
    if (!same) devices.value.push(activated);
    phoneBinding.value = { version: (binding?.version ?? 0) + 1, installationId, deviceId: activated.id,
      changedAt: binding?.installationId === installationId ? binding.changedAt : now, suspendedAt: null };
    return persistAccountSnapshot() ? null : "storage-failed";
  }

  // Session invalidation cancels only this installation's phone work.
  // Purchased hardware retains its independent execution state.
  function interruptAllTasks(_reason: "kicked" | "logged-out") {
    // Account browsing sessions do not own purchased hardware execution.
    if (getCarrier() !== "app" || phoneBinding.value?.installationId !== getDeviceId()) return;
    phoneBinding.value = { ...phoneBinding.value, version: phoneBinding.value.version + 1, suspendedAt: mockServerNow() };
    devices.value = devices.value.map(stopPhoneTask);
    // persist-verdict-ok: 任务中断态,失败时内存已拨回;任务引擎下一 tick 复验
    persistAccountSnapshot();
  }

  // Re-arm the simulation after a fresh session is established (re-login /
  // recalibration complete). tick() resumes assigning tasks + accruing.
  function resumeMining() {
    miningPaused.value = false;
    // persist-verdict-ok: 任务恢复态,同上
    persistAccountSnapshot();
  }

  // ── Device lifecycle (slot CRUD) — ported from index.ts addDevice /
  // activateDevice / deactivateDevice / scheduleDeactivation.
  // orders.advanceOrder optional-chains addDevice + activateDevice, so adding
  // these here lights up the order→device-spawn probe.

  // New purchases land in inventory inactive and require explicit activation.
  // Returns the new device id so callers that chain activate/debit/bill use
  // the returned id, NOT `.filter(kind).pop()` (Batch C Round 1 P0 #4: pop()
  // picked the wrong same-kind device when inventory already held one).
  /**
   * 结算抵扣下架:只在这台设备**此刻仍在册**时才删并落盘 —— "retired" = 本实例下架成功;"absent" = 别的实例已经
   * 拿它抵扣过(或它早就没了),这一单不许再吃一次抵扣;"unpersisted" = 在册但落盘失败(内存已拨回)。
   * (审计 R9 P0:页面直写 devices.filter 对不在册的设备是 no-op,persistAccountSnapshot 只说写盘成没成,
   * 同一台旧机被两个结算实例各抵扣一次。券与发票都有 CAS,设备是梯子上第三个一次性资产。)
   */
  function retireDevice(deviceId: string): "retired" | "absent" | "unpersisted" {
    if (!devices.value.some((d) => d.id === deviceId)) return "absent";
    devices.value = devices.value.filter((d) => d.id !== deviceId);
    deviceTimers.delete(deviceId);
    return persistAccountSnapshot() ? "retired" : "unpersisted";
  }

  /** 补偿:把本实例刚下架的那台设备原样放回(只放回自己下架的;不在册才放,已在册 = 别处已还)。返回落盘结果。 */
  function restoreDevice(device: Device): boolean {
    if (devices.value.some((d) => d.id === device.id)) return true;
    devices.value = [...devices.value, device];
    deviceTimers.set(device.id, { vital: 0 });
    return persistAccountSnapshot();
  }

  /** 改一台设备的字段并落盘(页面不许直写 devices;补偿 / 回滚用)。 */
  function patchDevice(deviceId: string, patch: Partial<Device>): boolean {
    if (!devices.value.some((d) => d.id === deviceId)) return false;
    devices.value = devices.value.map((d) => (d.id === deviceId ? { ...d, ...patch } : d));
    return persistAccountSnapshot();
  }

  /** 撤回一台刚生出来、还没被任何单据引用的设备(履约推进落盘失败的补偿)。返回落盘结果。 */
  function discardSpawnedDevice(deviceId: string): boolean {
    devices.value = devices.value.filter((d) => d.id !== deviceId);
    deviceTimers.delete(deviceId);
    return persistAccountSnapshot();
  }

  /** 生一台设备。落盘失败 → 内存已被 persistAccountSnapshot 拨回磁盘那一拍(设备不在),返回 null:
   *  调用方拿不到 id 就不许把它当已存在的设备用(审计 R7 P1:此前失败照样返回 id,履约把幽灵 id 写进订单)。 */
  function addDevice(kind: DeviceKind, options: CreateDeviceOptions = {}): string | null {
    const id = `${kind}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    const newDevice = createDevice(kind, id, options);
    deviceTimers.set(id, { vital: 0 });
    devices.value = [...devices.value, newDevice];
    if (!persistAccountSnapshot()) {
      deviceTimers.delete(id);
      return null;
    }
    return id;
  }

  function connectComputeShareDevice(gpuModel = "NVIDIA GeForce RTX 4070", reservedSlots = 0): {
    ok: boolean;
    deviceId?: string;
    reason?: "disabled" | "slots-full" | "activation-failed";
  } {
    if (!computeShareEnabled.value) return { ok: false, reason: "disabled" };
    if (activeSlotCount.value + reservedSlots >= MAX_DEVICES) return { ok: false, reason: "slots-full" };

    const normalizedModel = gpuModel.trim() || "NVIDIA GeForce RTX 4070";
    const gpuTier = matchGpuTier(normalizedModel, cfg.config.computeShare.gpuTiers);
    const deviceId = addDevice("pc-gpu", { gpuModel: normalizedModel, gpuTier });
    if (!deviceId) return { ok: false, reason: "activation-failed" };
    const ok = activateDevice(deviceId, reservedSlots);
    if (!ok) {
      // persist-verdict-ok: 撤回刚生的设备;撤不掉也只是多一台未激活库存机,下面照样返回失败
      discardSpawnedDevice(deviceId);
      return { ok: false, reason: "activation-failed" };
    }
    settle();
    return { ok: true, deviceId };
  }

  // Sprint #146-1 — activation toggle. Slot cap (MAX_DEVICES) applies to ACTIVE
  // devices only. `reservedSlots` lets the caller fold in non-device slot
  // holders (e.g. a running trial reserves a shadow slot) without app.ts
  // importing the trial store — stores never import each other; the page
  // composes the reserved count. Returns false on cap hit / not found / already
  // active so the caller can surface a toast.
  function activateDevice(id: string, reservedSlots = 0): boolean {
    const device = devices.value.find((d) => d.id === id);
    if (!device || device.activatedAt !== null) return false;
    if (phoneInventoryActivationError(device)) return false;
    if (device.kind === "pc-gpu" && !computeShareEnabled.value) return false;
    if (activeSlotCount.value + reservedSlots >= MAX_DEVICES) return false;
    devices.value = devices.value.map((d) =>
      d.id === id
        ? { ...d, activatedAt: Date.now(), lastSettledAt: Date.now(), onlineHeartbeatAt: null, pendingDeactivate: false }
        : d,
    );
    // 落盘失败 = 没激活(内存已拨回):如实返 false,调用方按「激活未成」处置,别把幽灵激活当成功。
    return persistAccountSnapshot();
  }

  function phoneInventoryActivationError(device: Device): PhoneActivationError | null {
    if (device.kind !== "phone") return null;
    if (getCarrier() !== "app") return "web-only";
    if (!matchesPhoneBinding(device, phoneBinding.value) || device.phoneInstallationId !== getDeviceId()) return "device-mismatch";
    const live = liveAppSession(getDeviceId());
    if (live === null) return "storage-failed";
    if (phoneBinding.value?.suspendedAt !== null || !live) return "reauth-required";
    return null;
  }

  // Clears activatedAt + zeroes runtime telemetry so the device exits earnings
  // contribution while staying in inventory. Per spec the current-task reward
  // is forfeited (currentTask → null without dispatching its reward).
  function deactivateDevice(id: string): boolean {
    devices.value = devices.value.map((d) =>
      d.id === id
        ? {
            ...d,
            activatedAt: null,
            pendingDeactivate: false,
            lastSettledAt: null,
            onlineHeartbeatAt: null,
            gpuUsage: 0,
            gpuTemp: 0,
            gpuPower: 0,
            vramUsed: 0,
            currentTask: null,
            todayEarnings: 0,
            todayEarningsNEX: 0,
          }
        : d,
    );
    // 停用没落盘 = 没停用(内存已拨回):如实返回,调用方据此决定文案(设备页) / 是否继续(置换)。
    return persistAccountSnapshot();
  }

  // Sprint #146-1 supplement: graceful deactivation. Marks the device for
  // deactivation after its current task completes; tick() fires the actual
  // deactivate when it sees currentTask transition complete with
  // pendingDeactivate=true. If currentTask is already null, deactivate now.
  function scheduleDeactivation(id: string) {
    devices.value = devices.value.map((d) =>
      d.id === id
        ? d.currentTask === null
          ? {
              ...d,
              activatedAt: null,
              pendingDeactivate: false,
              lastSettledAt: null,
              onlineHeartbeatAt: null,
              gpuUsage: 0,
              gpuTemp: 0,
              gpuPower: 0,
              vramUsed: 0,
              todayEarnings: 0,
              todayEarningsNEX: 0,
            }
          : { ...d, pendingDeactivate: true }
        : d,
    );
    // persist-verdict-ok: 排期停用标记,失败时内存已拨回,用户可重按;非资金
    persistAccountSnapshot();
  }

  // ── Balance primitives (register/login/wallet use these) ──
  /**
   * 🔴 提现进入失败终态时把钱退回去(幂等)。
   *
   * 提现在提交那一刻就扣了款(applyDebit),所以任何「这笔最终没打出去」的终态
   * —— 驳回 / 地址无效 / 上链失败 / 已退款 —— 都必须把钱还给用户。
   * 全仓此前**没有任何退款实现**,而账单也不会被置为 failed:
   * 两个缺口分开看都像「反正 mock 里走不到」,合起来就是「钱扣了、单子废了、没人还」。
   * 退款与置账单失败必须在**同一处**完成,否则接后端时必然只做一半(审计明确点名)。
   *
   * 🔴 退的是两种币(2026-08-03 资金 P1):USDT 本金之外,NEX 抵扣费也要退 ——
   * 单据废了 = 网络费从没真付过,只退 USDT 不退 NEX 就是白烧。
   * ⚠️ 两条腿此刻**不对称**,别照着 USDT 那条读 NEX 这条(2026-08-11 z5 回源核对):
   *   · USDT 退的是**本客户端自己扣过**的那一笔(applyWithdrawalDebit ⇄ refundWithdrawalDebit,
   *     判据是扣款幂等标记,自洽闭环);
   *   · NEX 是**服务端烧**的,客户端从没 debitNex 过(全仓零调用点 —— 这行上一版写的
   *     「页面在提交前已 debitNex 真扣了 NEX」是 2026-08-10 remote 对齐前的旧事实,已失效)。
   *     于是这条腿仍走 creditRewardBucketOnce,在 remote 模式下恒 no-op;要接的是
   *     「失败提现退还已烧 NEX」那条服务端契约(App.vue ②b 头注),独立成卡,本包不动。
   * 幂等键**必须拆两个**(USDT 用 wd-refund:、NEX 用 refund-nex:):复用单键会让
   * 「USDT 退过 → NEX 因同键判已处理 → 永久跳过」。历史单 fee 是纯数字
   * (account-cloud 读盘会归一出 nexBurned:0,但内存态不保证都走过归一),
   * 故可选链取值且 >0 才退 —— undefined/0 = 本来无需退,绝不能被当成「退款失败」。
   *
   * 幂等靠 appliedRewardKeys(与赠金入账同一套):同一张单每种币各退一次。
   * 返回本次真正退了款的单号,供 App 层同步把账单行置 failed。
   */
  /** 扣款幂等键的**唯一**拼法。两个消费点:applyWithdrawalDebit(写)、
   *  refundWithdrawalDebit(读,判「这笔到底扣没扣过」)。
   *  各拼各的必然漂移 —— 改一处就静默漏另一处,而漏的后果是「退一笔从没扣过的钱」。
   *  ⚠️ 键**不带账号作用域**:它靠 appliedRewardKeys 本身住在账号快照里来隔离账号,
   *  改成跨账号共享的存储前必须先给它加作用域。 */
  function withdrawalDebitKey(id: string): string {
    return "wd-debit:" + id;
  }

  function refundFailedWithdrawals(): string[] {
    // Production and explicit sandbox withdrawals are both server-owned. Their
    // debit/refund facts arrive through authoritative readback; applying a local
    // reversal would mint a second refund in the client projection.
    if (fundsServerEnabled) return [];
    const FAILED: Withdrawal["status"][] = ["review-rejected", "address-invalid", "tx-failed", "refunded"];
    const done: string[] = [];
    for (const wd of withdrawals.value) {
      if (!FAILED.includes(wd.status)) continue;
      if (!(wd.amount > 0)) continue;
      if (refundWithdrawalDebit(wd)) done.push(wd.id);
      // NEX 抵扣费退还:独立幂等键;usdt 参数位传 0、NEX 走第 4 参(方向搞反 = 把 NEX
      // 个数当美元退)。与 USDT 行互不阻塞:任一落盘失败,各自幂等键在下次调用重放补齐。
      const burnedNex = wd.fee?.nexBurned;
      if (Number.isFinite(burnedNex) && burnedNex > 0
        && creditRewardBucketOnce("refund-nex:" + wd.id, "withdrawable", 0, burnedNex)) {
        // 🔴 钱退了就得留下**退款事实**,否则账本没有对手方(2026-08-11 独立审计 P1)。
        //
        // 冲正分录的唯一判据是单据上的 `nexRefunded`(FEAT-WD01 §4.6)。remote 模式下那个数
        // 由服务端下发;而**本地这条退款腿只在 mock 模式下真会执行**(上一行的
        // creditRewardBucketOnce 对 remote 直接早退返回 false)—— 若不在这里补写证据,
        // mock 下就成了「钱包里 NEX 加回来了、账单上一条冲正也没有」:
        // 正是本包要修的那个形态换到另一个模式复发。两条腿必须同生共死。
        //
        // 只在**真退了**(返回 true = 本次或此前已幂等落账)时写,且只增不减 ——
        // 与 account-cloud 合并层的取大语义一致,不会把服务端已知的更大值抹小。
        //
        // 🔴 证据是**金额 + 发生时刻**一对,只写金额等于让下游回落到「构造时的此刻」。
        //
        // 🔴 **必须读 adopt 之后的当前行,不能读闭包里的 `wd`**(2026-08-12 独立审计 P0):
        // `wd` 是**进循环之前**那份 `withdrawals.value` 的快照,而上一行的 `creditRewardBucketOnce`
        // 在「幂等键已落盘」时会 `adoptAccountSnapshot(stored)` 把整份内存态换掉(见 creditRewardBucketInternal)。
        // 读 stale 的 `wd` 会让「此前已退、本次只是重放」被当成「刚刚退的」,把**本次注意到的时刻**
        // 写成退款时刻 —— 冲正行落进错的月份且永不自愈,正是本包要修的缺陷的镜像。
        // 同理:返回 true 只保证「退过」,**不保证刚刚退的**,所以已有时刻时一律不覆盖。
        const cur = withdrawals.value.find((w) => w.id === wd.id) ?? wd;
        const already = typeof cur.nexRefunded === "number" ? cur.nexRefunded : 0;
        if (already < burnedNex) {
          const refundedAt = cur.nexRefundedAt ?? mockServerNow();
          withdrawals.value = withdrawals.value.map((w) =>
            (w.id === wd.id ? { ...w, nexRefunded: burnedNex, nexRefundedAt: refundedAt } : w));
          // persist-verdict-ok: 退款证据没落盘 → 下次调用按幂等键重放补写(见上文注释)
          persistAccountSnapshot();
        }
      }
    }
    return done;
  }

  /**
   * 提现落定 → 扣款。与账单主行(`-wd.amount`)是同一笔事实的两个面。
   *
   * 🔴 ⚠️ 已过期,勿再据此判断(2026-08-16 回源 + 运行时实证推翻):
   * 这里原写着「`usdtBalance` 在本仓**没有服务端源**可拉,所以只能本地扣减」。
   * 那句话把范围限死在 account-api 上了 —— 余额的服务端源不在那儿,在**舰队端点**:
   * `deviceE3Api.fleet()` 回的 `walletUsdt`,由 refreshRemoteFleet 整体覆写进 usdtBalance
   * 与 earningBuckets(见本文件 refreshRemoteFleet)。4c32a50 起 remote 轨的余额权威在服务端,
   * 提现页建单成功后 `await app.refreshRemoteFleet()` 重读,本函数在 remote 下按首行守卫空转。
   * 运行时实证(remote 载真 store、服务端余额可控):服务端 1000 → 本地 1000;服务端扣到 700
   * → 重拉 → 本地 700;此间本函数不动本地余额并如实回 false。
   * 下面「本地扣减」那套仍然是 **mock 轨**的正解(mock 下没有服务端持有余额),故保留。
   * PRD §9.3 同口径:「当日笔数门…即不建单不扣款」(建单⇔扣款)、「提交为原子操作」。
   *
   * 🔴 全有或全无,余额不够整笔不扣并报假,**绝不夹到 0**:夹了的话实扣 < `wd.amount`,
   * 而退款按 `wd.amount` 退,差额就是凭空造出来的钱。报假由调用方交底,不静默。
   *
   * 🔴 金额取服务端回执的**全额** `wd.amount`(手续费含在其中),与账单主行同一个数、
   * 同一个源(PRD:全额出金,费用为其中差额);不取本地报价 snap.*。
   *
   * 🔴 扣款与幂等标记**一次赋值、一次落盘**:分两次写会留下「钱扣了、标记没落盘」的中间态,
   * 而退款正是按这个标记判「这笔到底扣没扣过」—— 判错就是退一笔从没扣过的钱。
   *
   * NEX 抵扣费**不在这里扣**:它是服务端烧的,而「失败提现退还已烧 NEX」至今没有服务端契约,
   * 客户端单方面扣掉就造出一条只烧不退的路。那一项独立成卡(见 refundFailedWithdrawals 头注)。
   *
   * PRODUCTION:整个函数消失 —— 扣款由 `POST /api/withdrawals` 同事务完成,client 只读回执。
   */
  function applyWithdrawalDebit(wd: Withdrawal): boolean {
    // Production withdrawals are already debited atomically by the server;
    // this local projection is sandbox/mock-only defense in depth.
    if (remoteApiEnabled) return false;
    // 🔴 sandbox 轨的钱包由服务端持有:建单响应里的 `order.wallet` 已经是**扣完之后**的余额,
    // 且 adoptFundsSandboxWallet 已经把它整体投影进来。这里再扣一次就是双计。
    // 回 true 而不是 false:钱确实动了(在服务端),调用方不该弹「扣款失败」。
    // 与 refundFailedWithdrawals 的 sandbox 闸成对 —— 那条轨扣与退都归服务端。
    if (mockFundsEnabled) return true;
    const amount = wd.amount;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const key = withdrawalDebitKey(wd.id);
    // 🔴🔴 写前**复读磁盘**,与同文件 creditRewardBucketInternal 逐字同形(见其 readAccountSnapshot 段)。
    // 只查内存是不够的,而且是我这版最初的错:内存里的 `appliedRewardKeys` 与 `usdtBalance`
    // **必然陈旧** —— 全仓没有任何跨标签页 storage 监听(App.vue 只监听 session 键),
    // 而 `usdtBalance` 在 account-cloud 的 ADDITIVE_NUMBER_KEYS 里按**增量累加**合并:
    // 内存判重挡不住另一个标签页再加一笔 delta,两笔都会落到余额上。
    // z5 三份独立审计各自实跑复现:重复退款 40→100→160、超卖被夹 100→40→0。
    const stored = readAccountSnapshot(accountKey.value);
    // 已扣过:重放(自愈补写 / 用户回退再进)不再动钱,如实回真 —— 调用方要的是
    // 「这笔的扣款到位了没有」,不是「本次有没有写」。盘上有键就以盘为准并把内存拉齐。
    if (stored?.user.appliedRewardKeys?.[key]) {
      adoptAccountSnapshot(stored);
      return true;
    }
    const currentUser = withDefaultEarningBuckets(user.value);
    if (currentUser.appliedRewardKeys?.[key]) return true;
    // 🔴 余额闸取**内存与磁盘的较小者**。只看内存会放行「另一标签页已经花掉这笔钱」的扣款,
    // 合并后余额为负、被 clampAccountFundInvariants 静默夹到 0 —— 实扣 < amount,
    // 而退款按 amount 全额退,差额就是凭空造出来的钱(红队实测:$100 余额买 $100 商品 + 提 $100,
    // 失败退款后净得 $100 商品 + $100 余额)。取较小者后这条路被堵在扣款之前。
    // 诚实边界:localStorage 没有锁,「读」与「写」终究两步,亚毫秒级双写窗口仍在 ——
    // 那是本仓全部资金原语的同族既有暴露(debitBalance 同形),不是本函数独有,已登记成卡。
    // 判据是**磁盘值**,不是 min(内存, 磁盘)。合并层的真值是 `disk + (next − base)`,
    // 而 base ≡ 上次落盘时的内存态,所以本次扣款落盘后余额 = `disk − amount` —— 判 disk 才对。
    // 上一版写 min() 是错的(独立复核实测):disk 比内存**多**时(另一标签页刚退款 / 刚入金,
    // 本页内存还没合并到)会把一笔本该成功的扣款拒掉,正好退回本包要修的那个原状态。
    // 取不到盘(storage 不可用)才回落内存。
    // 🔴 本函数返回 false 之后**没有任何自愈**:幂等键不置位,而提现页只弹一条 toast 就再不重试。
    // ⚠️ 2026-08-13 曾在 App.vue 对账里加过一格补扣来兜这个缺口,被 R1 独立审计整格否决并回退 ——
    // 别再照着「反正有自愈」放宽本闸。否决理由与正确修法方向(提交时落一个本地待扣款标记,
    // 只对带标记的单重试)见 docs/changes/2026-08-13-z6-audit-R1.md 与 2026-08-11-z5-out-of-scope-findings.md B 段。
    const authoritativeBalance = typeof stored?.user?.usdtBalance === "number"
      ? stored.user.usdtBalance
      : currentUser.usdtBalance;
    if (authoritativeBalance < amount) return false;
    const previousSnapshot = lastCloudSnapshot;
    const nextUsdt = +(currentUser.usdtBalance - amount).toFixed(2);
    const buckets = currentUser.earningBuckets;
    user.value = {
      ...currentUser,
      usdtBalance: nextUsdt,
      // 与 debitBalance 同一条不变量:withdrawableUsdt ≤ usdtBalance(先吃不可提部分)。
      earningBuckets: { ...buckets, withdrawableUsdt: Math.min(buckets.withdrawableUsdt, nextUsdt) },
      appliedRewardKeys: { ...currentUser.appliedRewardKeys, [key]: true },
    };
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    // 🔴🔴 **刻意不进 moneyApplied**,与 recordDeposit 同一条禁令(见其头注)。
    // moneyApplied 是 restoreMoney 的冲正基准 = 「本标签页动过、且**可以回滚**的钱」。
    // 提现的钱由服务端在建单事务里落定,**不可回滚**;记进去的话,别处一次
    // 「captureMoney → 失败 → restoreMoney」就会把这笔提现连同它的退款一起冲掉:
    // 退款被吞而 `wd-refund:` 键已置位、永不重试 = 用户的钱静默消失(z5 独立审计)。
    // 触发不需要同一条调用链 —— App.vue 的 5s 对账是定时器驱动的,能落进任何一个
    // capture/restore 窗口(质押 / 复投 / 结算都有)。
    // 下一个照着 debitBalance 给这里补 addMoneyApplied 的人,会造出一条很难查的丢钱路径。
    return true;
  }

  /**
   * 失败提现退款 —— **只退本客户端真的扣过的那一笔**(判据 = 扣款幂等标记),按单号幂等。
   *
   * 🔴 为什么不复用 creditRewardBucketOnce(USDT 腿原来走的那条):它内部第一行就是
   * `if (remoteApiEnabled) return false`,而提现单**只在 remote 模式下建得出来**
   * (mock 模式 apiClient 一律 reject,建不出单)。也就是说退款在「唯一会产生提现的那个模式」里
   * 恒为 no-op。在没有扣款的原状态下这不造成损失(没人扣钱,退不退都一样);
   * 一旦扣款接上,那条 no-op 就变成「服务端拒单 = 用户的钱凭空烧掉」。
   * **扣款与退款必须在同一个模式下同时有效** —— 只修一半比不修更坏,所以这一对一起改。
   *
   * 退款额恒等于扣款额(两边同为 `wd.amount`,且扣款全有或全无),故不会退多。
   *
   * 🔴 只加回 `usdtBalance`,**不动 withdrawableUsdt**:扣款那步的 clamp 是有损的
   * (`min(w, u−a)` 不可逆),盲加 `+amount` 会把可提额度抬到比提现前还高 = 凭空多出可提额度。
   * 方向刻意取保守侧:可提桶宁可偏低(它随收益自然回升,且提现页的可提上限本就取
   * `usdtBalance − 锁定桶`、不读这个桶),绝不能偏高。
   *
   * PRODUCTION:整个函数消失 —— 退款由服务端在拒单同事务里完成,client 只读回执。
   */
  function refundWithdrawalDebit(wd: Withdrawal): boolean {
    const amount = wd.amount;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const debitKey = withdrawalDebitKey(wd.id);
    const refundKey = "wd-refund:" + wd.id;
    // 🔴🔴 写前**复读磁盘**(同 applyWithdrawalDebit 头注,同 creditRewardBucketInternal 范式)。
    // 退款是这条链上唯一「加钱」的动作,只查内存的后果最重:两个标签页的 5s 对账各退一次,
    // 而 usdtBalance 按增量累加合并 —— 两笔 `+amount` 全部计入 = 退了两倍。
    // 三份独立审计各自实跑复现(40 → 100 → **160**)。
    const stored = readAccountSnapshot(accountKey.value);
    const storedKeys = stored?.user.appliedRewardKeys;
    // 条件直接写 `stored?.` 而不是 `storedKeys?.` —— tsc 只在前者上把 stored 收窄成非 null。
    // 🔴 命中即**直接返回,不 adopt**。这条路被 App.vue 的 5s 对账每一拍都走一遍
    // (失败单永不离开 withdrawals 列表),而 adoptAccountSnapshot 是**整体覆写**
    // user/devices/earnings/withdrawals 并重置 tick 聚合 —— 等于 12 次/分钟的全量状态覆写;
    // 且 stored 是未过 hydrateSnapshotEconomics 的原始行,会把 legacy 设备的派生字段写回 undefined。
    // 这里只需要「别退第二次」,不需要同步任何东西(独立复核实测发现的新引入问题)。
    if (stored?.user.appliedRewardKeys?.[refundKey]) return false;
    const currentUser = withDefaultEarningBuckets(user.value);
    // 没扣过就没得退(remote 对齐期建的存量单、或扣款那步失败的单)——
    // 退一笔没扣过的钱就是凭空造钱,这一条比「漏退」严重得多。
    // 内存与磁盘任一记着扣过即算扣过:扣款可能发生在**另一个标签页**。
    if (!currentUser.appliedRewardKeys?.[debitKey] && !storedKeys?.[debitKey]) return false;
    if (currentUser.appliedRewardKeys?.[refundKey]) return false;
    const previousSnapshot = lastCloudSnapshot;
    user.value = {
      ...currentUser,
      usdtBalance: +(currentUser.usdtBalance + amount).toFixed(2),
      appliedRewardKeys: { ...currentUser.appliedRewardKeys, [refundKey]: true },
    };
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    // 🔴🔴 与扣款同一条禁令:**不进 moneyApplied**(见 applyWithdrawalDebit 尾注)。
    return true;
  }

  /**
   * 🔴 四个资金原语:落盘失败必须让调用方看见(2026-08-04 R4「钱动了、账没记上」同族根治)。
   *
   * 原实现都是「改内存 → persistAccountSnapshot() → **丢弃返回值**」。落盘失败时磁盘还是
   * 旧值、内存已是新值 —— 刷新即回退,用户眼里就是「钱凭空回来 / 凭空消失」;而调用方按
   * 「一定成功」继续铸货、写账单、弹成功提示。修法直接沿用本文件既有范式(recordDeposit /
   * creditRewardBucketInternal):失败即 adoptAccountSnapshot(previousSnapshot) 把内存退回
   * 与磁盘一致的那一份,并报假。
   *
   * 🔴 成功路径逐字节等价:守卫、clamp、金额计算、赋值内容与写盘顺序一个字没改;新增的只有
   * 「失败时回滚 + 返回 false」这条原本不存在的分支。credit 两函数由 void 拓宽为 boolean —
   * 全部既有调用点都在语句位丢弃返回值,行为不变。
   */
  function creditBalance(amount: number): boolean {
    // NaN/Infinity/负数守卫(对齐 recordDeposit):脏 amount 会把余额污染成 NaN,
    // 此后一切 debit 检查恒过 = 无限钱(审计 P2-5)。
    if (!Number.isFinite(amount) || amount < 0) return false;
    const previousSnapshot = lastCloudSnapshot;
    const before = moneyValues();
    user.value = { ...user.value, usdtBalance: +(user.value.usdtBalance + amount).toFixed(2) };
    const applied = moneyDeltaSince(before);
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    addMoneyApplied(applied);
    return true;
  }
  function debitBalance(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (user.value.usdtBalance < amount) return false;
    const previousSnapshot = lastCloudSnapshot;
    const before = moneyValues();
    const nextUsdt = +(user.value.usdtBalance - amount).toFixed(2);
    // 维护不变量 withdrawableUsdt ≤ usdtBalance:花钱先消耗不可提部分(如充值本金),
    // 花穿后才吃可提收益,可提额度随之收敛到剩余总余额。缺此 clamp,提现门(submitWithdrawal
    // 只看 withdrawableUsdt)会放行超过总余额的提现 → usdtBalance 变负(凭空取钱,原 P0)。
    const buckets = withDefaultEarningBuckets(user.value).earningBuckets;
    user.value = {
      ...user.value,
      usdtBalance: nextUsdt,
      earningBuckets: { ...buckets, withdrawableUsdt: Math.min(buckets.withdrawableUsdt, nextUsdt) },
    };
    const applied = moneyDeltaSince(before);
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    addMoneyApplied(applied);
    return true;
  }
  function creditNex(amount: number): boolean {
    // NaN/Infinity/负数守卫(对齐 creditBalance):脏 amount 会把 nexBalance 污染成 NaN,
    // 此后一切 debitNex 检查恒过 = 无限 NEX。
    if (!Number.isFinite(amount) || amount < 0) return false;
    const previousSnapshot = lastCloudSnapshot;
    const before = moneyValues();
    user.value = { ...user.value, nexBalance: +(user.value.nexBalance + amount).toFixed(2) };
    const applied = moneyDeltaSince(before);
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    addMoneyApplied(applied);
    return true;
  }
  function debitNex(amount: number): boolean {
    // 对齐 debitBalance:负数 amount 会让 `bal < amount` 恒 false 而反向增币,NaN 污染余额。
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (user.value.nexBalance < amount) return false;
    const previousSnapshot = lastCloudSnapshot;
    const before = moneyValues();
    user.value = { ...user.value, nexBalance: +(user.value.nexBalance - amount).toFixed(2) };
    const applied = moneyDeltaSince(before);
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    addMoneyApplied(applied);
    return true;
  }

  /**
   * 🔴 本标签页自己动过的资金累计(**合并前**的本地增量之和,单调累加、永不清零)。
   *
   * 为什么需要它:account-cloud 把余额当计数器做三路合并(delta = next − base,见
   * ADDITIVE_NUMBER_KEYS),而 base 是本页的 lastCloudSnapshot —— 它在 capture 之后
   * 会**吸收别的标签页的扣款**(每次 persist 都 adopt 合并结果)。此时若冲正照旧写
   * 「扣款前的绝对值」,delta 就等于「我的那笔 + 别人的那笔」,别人那笔被我一起"退"给了
   * 用户:两个标签页各扣一次、各回滚一次,余额比开始时还多(审计实测 $100 → $130,凭空造钱)。
   * 单页场景两者恒等,所以这条洞在单实例下永远测不出来 —— 必须双实例并发靶。
   *
   * 为什么是一个单调计数器而不是日志:冲正只需要「我自己动了多少」这一个差值,
   * 快照记下自己那一刻的读数即可(嵌套 capture 各记各的),无需保留每笔明细、也就没有
   * 清理与生命周期问题。别的标签页写了多少完全不进这个数,所以它天生与并发无关。
   */
  const moneyApplied: MoneyDelta = { usdtBalance: 0, nexBalance: 0, withdrawableUsdt: 0 };
  /** 当前三元组(只读)。算本地增量与写快照共用一处,免得两边各读各的读出分歧。 */
  function moneyValues(): MoneyDelta {
    const u = withDefaultEarningBuckets(user.value);
    return { usdtBalance: u.usdtBalance, nexBalance: u.nexBalance, withdrawableUsdt: u.earningBuckets.withdrawableUsdt };
  }
  /**
   * 本地增量 = 现在 − before。🔴 **必须在 persistAccountSnapshot 之前取**:落盘会把
   * 合并结果 adopt 回内存,之后再算就把别的标签页的增量也算进"我自己动的"里。
   */
  function moneyDeltaSince(before: MoneyDelta): MoneyDelta {
    const now = moneyValues();
    return {
      usdtBalance: +(now.usdtBalance - before.usdtBalance).toFixed(6),
      nexBalance: +(now.nexBalance - before.nexBalance).toFixed(6),
      withdrawableUsdt: +(now.withdrawableUsdt - before.withdrawableUsdt).toFixed(6),
    };
  }
  /** 只在**落盘成功后**记账:失败路径已 adopt 回滚,本地等于什么都没动过。 */
  function addMoneyApplied(d: MoneyDelta) {
    moneyApplied.usdtBalance = +(moneyApplied.usdtBalance + d.usdtBalance).toFixed(6);
    moneyApplied.nexBalance = +(moneyApplied.nexBalance + d.nexBalance).toFixed(6);
    moneyApplied.withdrawableUsdt = +(moneyApplied.withdrawableUsdt + d.withdrawableUsdt).toFixed(6);
  }

  /** 资金三元组快照 —— 冲正(退款)唯一正确的基准。 */
  function captureMoney(): MoneySnapshot {
    return { ...moneyValues(), applied: { ...moneyApplied } };
  }

  /**
   * 🔴 精确冲正:把资金三元组**还原**到扣款前那份快照,而不是反向调一次 creditBalance。
   *
   * 为什么非有不可:debitBalance 会把 withdrawableUsdt clamp 到扣款后的总余额,而
   * creditBalance 只加总余额、**不还原可提额度** —— 「扣款 → 后续失败 → 退款」走一遍,
   * 用户的可提额度就被永久压低一次(审计场景:可提 $8000 的账号买一次创世节点失败退款后
   * 只剩 $1,钱回来了但提不出去)。退款语义必须与扣款语义对称,对称的唯一实现是还原快照。
   *
   * 🔴 **按增量回滚,不写绝对值**(2026-08-04 R5 并发靶):合并层把余额当计数器,写绝对值时
   * delta = 绝对值 − 本页 base,而 base 在 capture 之后会吸收别的标签页的扣款(见
   * moneyApplied 头注)—— 那部分会被这一笔冲正一起"还"给用户。改成「从**当前**值里减去
   * 我自己动过的那部分」后,delta 恒等于我那一笔的反向增量,别人的改动一分不动。
   * 与提现落盘重放同一条纪律:先取现状,再基于它推导增量(见 submitWithdrawal 重放段)。
   *
   * 副作用:期间本页发生的**别的**入账(算力结算 / 奖励)不再被这一笔冲正抹平 —— 它们不在
   * moneyApplied 的这段差值里(那些路径不走这四个原语),写绝对值时则会被一起回退。
   */
  function restoreMoney(snap: MoneySnapshot): boolean {
    if (![snap.usdtBalance, snap.nexBalance, snap.withdrawableUsdt].every((v) => Number.isFinite(v) && v >= 0)) return false;
    // 「我自己动了多少」= 现在的读数 − 快照那一刻的读数。别的标签页写多少都不进这个数。
    const owedUsdt = moneyApplied.usdtBalance - snap.applied.usdtBalance;
    const owedNex = moneyApplied.nexBalance - snap.applied.nexBalance;
    const owedWithdrawable = moneyApplied.withdrawableUsdt - snap.applied.withdrawableUsdt;
    // 一分钱都没动过(第一腿就落盘失败、它自己已经 adopt 回滚了)→ 无事可做,直接成功。
    // 🔴 不能在这里空转写一次盘:storage 正坏着,那一次写必然失败,于是「什么都没发生」
    // 会被报成「回滚失败 = 钱卡住了」,凭空吓用户一跳并污染待对账队列。
    if (owedUsdt === 0 && owedNex === 0 && owedWithdrawable === 0) return true;
    const previousSnapshot = lastCloudSnapshot;
    const before = moneyValues();
    const target = {
      usdtBalance: +(before.usdtBalance - owedUsdt).toFixed(2),
      nexBalance: +(before.nexBalance - owedNex).toFixed(2),
      withdrawableUsdt: +(before.withdrawableUsdt - owedWithdrawable).toFixed(2),
    };
    if (!Object.values(target).every((v) => Number.isFinite(v))) return false;
    const current = withDefaultEarningBuckets(user.value);
    user.value = {
      ...current,
      usdtBalance: target.usdtBalance,
      nexBalance: target.nexBalance,
      earningBuckets: { ...current.earningBuckets, withdrawableUsdt: target.withdrawableUsdt },
    };
    const applied = moneyDeltaSince(before);
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    addMoneyApplied(applied);
    return true;
  }
  function recordDeposit(amount: number): boolean {
    if (fundsServerEnabled) return false;
    // Input validation mirrors source: reject NaN/±Infinity/≤0/absurd (>1e9).
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return false;
    // 落盘结果必须接:此前丢弃返回值无条件 return true,调用方(三条入金轨的 settle)
    // 据此认为钱已入账并继续写账单/改状态,而落盘失败时余额其实被 adopt 回滚了 ——
    // 「返回成功但钱没加」。对齐 creditRewardBucketInternal 的既有范式:失败即回滚 + 报假。
    //
    // 🔴 **刻意不进 moneyApplied 账**(2026-08-04 对抗审计 P2-3,钉死这条不变量):
    // 四个资金原语都会 addMoneyApplied,而入金**不能**——moneyApplied 是 restoreMoney 的
    // 冲正基准,入金一旦记进去,别处一次冲正就会把用户**真的转进来的钱**一起退掉。
    // 入金是外部已到账的事实,不属于「本标签页动过的钱」那本账。
    // 下一个照着 creditBalance 给这里补 addMoneyApplied 的人,会造出一个很难查的丢钱路径。
    const previousSnapshot = lastCloudSnapshot;
    user.value = {
      ...user.value,
      usdtBalance: +(user.value.usdtBalance + amount).toFixed(2),
      cumulativeDepositUsdt: +(user.value.cumulativeDepositUsdt + amount).toFixed(2),
    };
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    return true;
  }
  function creditRewardBucket(route: EarningBucketRoute, usdt: number, nex = 0): boolean {
    return creditRewardBucketInternal(route, usdt, nex, null);
  }

  /**
   * Registration/reward recovery path. The receipt key and balance delta live
   * in the same account-cloud snapshot, so replay after a crash is a no-op.
   */
  function creditRewardBucketOnce(idempotencyKey: string, route: EarningBucketRoute, usdt: number, nex = 0): boolean {
    if (fundsServerEnabled) return false;
    const key = idempotencyKey.trim();
    if (!key) return false;
    return creditRewardBucketInternal(route, usdt, nex, key);
  }

  function creditRewardBucketInternal(
    route: EarningBucketRoute,
    usdt: number,
    nex: number,
    idempotencyKey: string | null,
  ): boolean {
    if (remoteApiEnabled) return false;
    if (!Number.isFinite(usdt) || !Number.isFinite(nex) || usdt < 0 || nex < 0) return false;
    if (route === "no_issue") return true;
    if (idempotencyKey) {
      const stored = readAccountSnapshot(accountKey.value);
      if (stored?.user.appliedRewardKeys?.[idempotencyKey]) {
        adoptAccountSnapshot(stored);
        return true;
      }
    }
    const previousSnapshot = lastCloudSnapshot;
    const currentUser = withDefaultEarningBuckets(user.value);
    if (idempotencyKey && currentUser.appliedRewardKeys?.[idempotencyKey]) return true;
    const buckets = currentUser.earningBuckets;
    const nextBuckets = { ...buckets, lastBucketedAt: Date.now() };
    const nextUser: UserState = {
      ...currentUser,
      earningBuckets: nextBuckets,
      appliedRewardKeys: idempotencyKey
        ? { ...currentUser.appliedRewardKeys, [idempotencyKey]: true }
        : currentUser.appliedRewardKeys,
    };
    if (route === "withdrawable") {
      nextBuckets.withdrawableUsdt = +(nextBuckets.withdrawableUsdt + usdt).toFixed(2);
      nextUser.usdtBalance = +(nextUser.usdtBalance + usdt).toFixed(2);
      nextUser.nexBalance = +(nextUser.nexBalance + nex).toFixed(2);
    } else if (route === "pending_review") {
      nextBuckets.pendingReviewUsdt = +(nextBuckets.pendingReviewUsdt + usdt).toFixed(2);
      nextBuckets.lockedNex = +(nextBuckets.lockedNex + nex).toFixed(2);
    } else {
      nextBuckets.bonusLockedUsdt = +(nextBuckets.bonusLockedUsdt + usdt).toFixed(2);
      nextBuckets.lockedNex = +(nextBuckets.lockedNex + nex).toFixed(2);
    }
    // R1 台账现由服务端持有,客户端 appendLedgerEntry 是恒 false 的过渡空壳
    // (earning-release.ts 里就是一行 `return false`)—— 与 settle 路径同形 fire-and-forget,
    // 🔴 不得再拿它的返回值判死:否则 mock 模式下 held 两路由的入桶(风控标记账号的赠金/奖励)
    // 无条件失败(z1 判决包 B8,register 重试链实锤)。
    //
    // 🔴 合并裁决:远端线把这里改回了「拿返回值判死」,并附理由「非可提的赠金也必须记台账分录,
    // 否则释放引擎(attest/manual)永远放不出它」。理由本身成立,但那个改法达不到它 ——
    // 空壳恒 false,判死只会把入桶整个打掉,分录一条也不会多。真正的解法是服务端把分录写进
    // 释放引擎(已在后端交接书里),客户端这层在空壳期只能 fire-and-forget。
    if (route === "pending_review" || route === "bonus_locked") {
      appendLedgerEntry(accountKey.value,
        evaluateAccountCluster(accountKey.value).clusterId,
        route,
        usdt,
        nex,
        idempotencyKey ?? undefined,
      );
    }
    user.value = nextUser;
    if (!persistAccountSnapshot()) {
      adoptAccountSnapshot(previousSnapshot);
      return false;
    }
    return true;
  }

  // D5: create the withdrawal exclusively through the real backend transaction.
  function adoptFundsSandboxWallet(wallet: FundsSandboxWallet): void {
    const current = withDefaultEarningBuckets(user.value);
    user.value = {
      ...current,
      usdtBalance: wallet.availableUsdt,
      earningBuckets: {
        ...current.earningBuckets,
        withdrawableUsdt: wallet.availableUsdt,
        policyVersion: "funds-sandbox-v1",
        lastBucketedAt: Date.now(),
      },
    };
  }

  /** Server auth is the only source for this display identity in remote modes. */
  function projectServerIdentity(identity: UserSession) {
    if (!remoteApiEnabled) return;
    user.value = { ...user.value, email: `${identity.countryCode}${identity.phone}` };
  }

  function canonicalFundsSandboxWithdrawal(order: FundsSandboxOrder, fallback?: Withdrawal): Withdrawal {
    if (order.kind !== "WITHDRAWAL" || !order.targetAddress) throw new Error("FUNDS_SANDBOX_ORDER_INVALID");
    const submittedAt = Date.parse(order.createdAt);
    const status: Withdrawal["status"] = order.status === "CONFIRMED"
      ? "confirmed"
      : order.status === "FAILED"
        ? "tx-failed"
        : "submitted";
    return {
      id: order.orderNo,
      amount: order.amount,
      network: "USDT-BEP20",
      address: order.targetAddress,
      fee: fallback?.fee ?? { networkConfirmUsd: 0, nexBurned: 0, actualFeeUsd: 0 },
      status,
      riskRoute: fallback?.riskRoute ?? "pass",
      riskReasons: fallback?.riskReasons ?? [],
      submittedAt,
      // Informational only. Server modes are guarded from ETA-based finalization below.
      estimatedCompletion: submittedAt,
      ...(order.settledAt && status === "confirmed" ? { confirmedAt: Date.parse(order.settledAt) } : {}),
      serverVersion: order.version,
      source: "mock",
      sourceEnvironment: "SANDBOX",
    };
  }

  async function refreshFundsSandbox(): Promise<void> {
    if (!mockFundsEnabled) {
      fundsSandboxEvidence.value = null;
      return;
    }
    const request = remoteAccountEpoch.snapshot();
    const expectedAccountKey = accountKey.value;
    const expectedScope = captureFundsSandboxRequestScope(expectedAccountKey, request.epoch);
    fundsSandboxStatus.value = "loading";
    fundsSandboxError.value = "";
    fundsSandboxEvidence.value = null;
    try {
      const overview = await fundsSandboxApi.overview();
      if (expectedAccountKey !== accountKey.value) throw new Error("FUNDS_SANDBOX_ACCOUNT_CHANGED");
      if (!remoteAccountEpoch.isCurrent(request)
          || !isCurrentFundsSandboxRequestScope(expectedScope, accountKey.value, remoteAccountEpoch.snapshot().epoch)) {
        throw fundsSandboxStaleRequestError();
      }
      adoptFundsSandboxWallet(overview.wallet);
      const existing = new Map(withdrawals.value.map((item) => [item.id, item]));
      withdrawals.value = overview.orders
        .filter((item) => item.kind === "WITHDRAWAL")
        .map((item) => canonicalFundsSandboxWithdrawal(item, existing.get(item.orderNo)));
      overview.orders
        .filter((item) => item.kind === "WITHDRAWAL" && (item.status === "CONFIRMED" || item.status === "FAILED"))
        .forEach((item) => finishPendingFundsMutationByOrder(expectedAccountKey, "SANDBOX", item.orderNo));
      fundsSandboxEvidence.value = sandboxEvidenceFromOverview(overview);
      fundsSandboxStatus.value = "ready";
    } catch (cause) {
      const current = remoteAccountEpoch.isCurrent(request)
        && isCurrentFundsSandboxRequestScope(expectedScope, accountKey.value, remoteAccountEpoch.snapshot().epoch);
      if (current && !isFundsSandboxStaleRequestError(cause)) {
        const current = withDefaultEarningBuckets(user.value);
        user.value = {
          ...current,
          usdtBalance: 0,
          earningBuckets: { ...current.earningBuckets, withdrawableUsdt: 0 },
        };
        withdrawals.value = [];
        fundsSandboxStatus.value = "error";
        fundsSandboxError.value = cause instanceof Error ? cause.message : "FUNDS_SANDBOX_REFRESH_FAILED";
        fundsSandboxEvidence.value = null;
      }
      throw current ? cause : fundsSandboxStaleRequestError();
    }
  }

  /**
   * Login and H5 bootstrap call this after binding an account. It is purposely
   * stricter than the API client default: a sandbox read only starts when the
   * current server session belongs to that account and carries a Bearer token.
   * This prevents a fresh context from briefly presenting local/zero money as
   * a successful sandbox while its authenticated wallet authority was never
   * actually queried.
   */
  function refreshFundsSandboxForAccount(rawAccountKey: string): Promise<boolean> {
    const expectedAccountKey = normalizeAccountKey(rawAccountKey);
    if (!mockFundsEnabled) {
      fundsSandboxEvidence.value = null;
      return Promise.resolve(false);
    }
    if (fundsSandboxBootstrapInFlight?.accountKey === expectedAccountKey) {
      return fundsSandboxBootstrapInFlight.request;
    }
    const request = (async () => {
      const session = sessionVault.read();
      const sessionMatchesAccount = !!session
        && session.accessToken.trim().length > 0
        && session.tokenType.toLowerCase() === "bearer"
        && `user:${session.user.userId}` === expectedAccountKey;
      if (!sessionMatchesAccount || expectedAccountKey !== accountKey.value) {
        if (expectedAccountKey === accountKey.value) {
          fundsSandboxStatus.value = "error";
          fundsSandboxError.value = "FUNDS_SANDBOX_BEARER_SESSION_REQUIRED";
          fundsSandboxEvidence.value = null;
        }
        return false;
      }
      try {
        await refreshFundsSandbox();
        return true;
      } catch {
        return false;
      }
    })();
    const slot = { accountKey: expectedAccountKey, request };
    fundsSandboxBootstrapInFlight = slot;
    void request.finally(() => {
      if (fundsSandboxBootstrapInFlight === slot) fundsSandboxBootstrapInFlight = null;
    });
    return request;
  }

  async function submitWithdrawal(
    amount: number,
    network: Withdrawal["network"],
    address: string,
    fee: WithdrawalFeeSnapshot,
    offsetWithNex: boolean,
    policyVersion: string,
    // 🔴 幂等键由**调用方**传入,不在这里现造(合并裁决,资金安全级)。
    // 远端线把这个参数删了、改在函数内用 lib/funds-mutation-key 的生产侧工厂现造一把 ——
    // 那个工厂每调一次就 randomUUID 一次,于是「超时重试」在服务端眼里是一次**全新请求**,
    // 第二笔真出账。页面按「一笔提现意图」只 mint 一次并跨重试复用
    // (wallet-withdraw.vue `currentIdempotencyKey`),只有拿到确定性结局才换键。
    // 沙箱轨例外:走远端线的持久注册表(见下方 `mutation`),它跨重载/跨标签页更强。
    idempotencyKey: string,
    riskRoute: WithdrawalRiskRoute = "pass",
    riskReasons: string[] = [],
    // FEAT-WD01a:快车道留痕随单落盘 —— 只算不存的话,事后审计与客服都还原不出
    // 「这单当时免了哪几道闸」,等于没做。与 riskReasons 同源同去处。
    fastLaneApplied = false,
    waivedGates: string[] = [],
    // 🔴 返回**整张单**而不是单号:调用方要按服务端真实回执记账 —— 手续费实际烧了多少 NEX
    // 由服务端定(submission.nexBurned),本地报价只是预览。回单号的话调用方只能拿本地
    // 报价去写账单 = 账本上那个数字指不到单源(本仓禁令),或者回头去 app.withdrawals 里
    // 按 id 反查 —— 而那个列表会被 bindAccount 整体换掉,换号那一刻正好查空。
    // 🔴 不返回 null:拒单路径全在服务端,失败一律**抛** ApiError 冒泡给页面分诊。
  ): Promise<Withdrawal> {
    // 🔴 入口冻结账号(z4 R1 独立审计 P0)。本函数跨一个最长 30s 的 await,期间跨标签页
    // 登出 / 运营吊销 / 重新登录都会 `bindAccount`,把 `accountKey.value` 与
    // `withdrawals.value` 整体换成**另一个账号**的。原来 await 之后仍读活值,于是:
    // 服务端按**发起时**那个账号的会话扣了钱,单据却落到换后的账号头上 —— 新账号凭空多一张
    // 别人的在途单(占它的日限、锁死它的换址闸、失败时把 NEX 退给它),而真正被扣的账号
    // 有扣款无单据,追踪页深链「查无此单」。
    // 页面侧的账单行早已钉死 `snap.account`,只钉一半反而更糟:账与单分家,对账永远配不上。
    const acct = accountKey.value;
    // Durable pending mutation keys belong only to the isolated server sandbox.
    // 生产轨的幂等键由调用方传入(见参数头注),不在这里现造。
    const mutation: FundsMutationIdentity | null = mockFundsEnabled ? {
      accountKey: acct,
      environment: "SANDBOX",
      method: `WITHDRAWAL:${network}`,
      fingerprint: JSON.stringify({
        channel: "CREGIS_USDT_BEP20",
        amount: fundsAmountFingerprint(amount),
        targetAddress: address.trim(),
      }),
    } : null;
    if (mockFundsEnabled) {
      if (!mutation) throw new Error("FUNDS_SANDBOX_MUTATION_IDENTITY_MISSING");
      const sandboxKey = pendingFundsMutationKey(mutation);
      // A sandbox withdrawal is only possible after the *same* authenticated
      // wallet read supplied an explicit isolated policy. Never borrow a
      // production D5/J1 rule, a local seed, or a stale wallet value here.
      const sandboxPolicy = fundsSandboxEvidence.value?.withdrawalPolicy;
      if (!sandboxPolicy
          || fundsSandboxStatus.value !== "ready"
          || fundsSandboxEvidence.value?.source !== "mock"
          || fundsSandboxEvidence.value?.sourceEnvironment !== "SANDBOX"
          || fundsSandboxEvidence.value?.mode !== "LOCAL_SANDBOX") {
        throw new Error("FUNDS_SANDBOX_WITHDRAWAL_POLICY_REQUIRED");
      }
      if (network !== sandboxPolicy.network
          || sandboxPolicy.channel !== "CREGIS_USDT_BEP20"
          || sandboxPolicy.withdrawalEnabled !== true
          || sandboxPolicy.enabledNetworks.length !== 1
          || sandboxPolicy.enabledNetworks[0] !== network) {
        throw new Error("FUNDS_SANDBOX_WITHDRAWAL_CHANNEL_DISABLED");
      }
      const sandboxAvailable = user.value.usdtBalance * sandboxPolicy.balanceMaxRatio;
      if (amount < sandboxPolicy.minAmount || amount > sandboxAvailable) {
        throw new Error("FUNDS_SANDBOX_INSUFFICIENT_BALANCE");
      }
      const order = await fundsSandboxApi.createWithdrawal(amount, address, sandboxKey);
      if (acct !== accountKey.value) throw new Error("FUNDS_SANDBOX_ACCOUNT_CHANGED");
      if (!order.wallet) throw new Error("FUNDS_SANDBOX_WALLET_MISSING");
      bindPendingFundsMutationOrder(mutation, sandboxKey, order.orderNo);
      adoptFundsSandboxWallet(order.wallet);
      const canonical = canonicalFundsSandboxWithdrawal(order, {
        id: order.orderNo,
        amount,
        network,
        address,
        fee,
        status: "submitted",
        riskRoute,
        riskReasons,
        fastLaneApplied,
        waivedGates,
        submittedAt: Date.parse(order.createdAt),
        estimatedCompletion: Date.parse(order.createdAt),
      });
      withdrawals.value = [canonical, ...withdrawals.value.filter((item) => item.id !== canonical.id)];
      if (order.status === "CONFIRMED" || order.status === "FAILED") {
        finishPendingFundsMutationByOrder(acct, "SANDBOX", order.orderNo);
      }
      return canonical;
    }
    // D5 real boundary: the backend re-prices the request under policyVersion and
    // commits wallet reservation, optional NEX burn, order and ledgers atomically.
    // The local store only mirrors the returned order for rendering; it never
    // debits balances or chooses a fee bucket.
    const submission = await withdrawalApi.submit(
      amount,
      network,
      address,
      policyVersion,
      offsetWithNex,
      idempotencyKey,
    );
    const canonical = toCanonicalWithdrawal(submission, address);
    // 🔴 换号了:这一单属于 acct,当前绑定的是别人。直接写进**冻结账号**的那一行,
    // 内存(现在装的是新账号的视图)一个字都不碰 —— 与 bills.addManyForAccountOnce 同一条纪律。
    // 落盘成败都要把单交还调用方:服务端已经建单,吞掉它 = 旧账号有扣款无凭证。
    //
    // 🔴 合并裁决:远端线在 await 之后直接 `throw REMOTE_ACCOUNT_CHANGED`,已按本分支取代。
    // 两边同样冻结账号、同样拒绝把单写进新账号的内存(隔离意图一致),但抛的那条把
    // **服务端已经建好、已经扣过钱的单据**整个丢掉 —— 页面 catch 到的是一次失败,
    // 账单不写、追踪页查不到,用户只剩「钱少了、什么都没有」。本分支把单落到冻结账号并
    // 交还调用方(页面据此写 snap.account 的账单行并提示「已提交到另一账号」)。
    if (accountKey.value !== acct) {
      const stored = readAccountSnapshot(acct);
      // 🔴 诚实边界:冻结账号在盘上**没有行**时(它从没落过盘)这一单写不进去,
      // 而且不该硬写 —— 手上唯一能拿来拼快照的是**当前账号**的余额/设备/收益,
      // 拿它冒充另一个账号的经济状态,比丢一条单据坏得多。
      // 此时页面侧的账单行仍会落到 acct(bills 那条路自己会 hydrate 出基线),
      // 单据以服务端为准;这是降级,不是静默成功。
      // 落盘结果要接住:写不进去时这一单只活在服务端,客户端两边都没有(内存装的是新账号)。
      // 这是**降级不是成功**,所以如实交给日志式注释而不是静默丢弃返回值(z4 R2 P2-6)。
      //
      // 🔴 已知限制,别把它写成「会自愈」(z4 R3-bis 指出我上一版在这里许了做不到的承诺):
      // App.vue ⓪ 的自愈**以单据可见为前提** —— 它遍历的是 `app.withdrawals`,而那份列表由
      // `bindAccount` 从**本地快照**水合。若这一单从没写进该账号的本地快照(`stored` 为 null,
      // 或下面这次写盘失败),那么重新绑回该账号也读不出它,⓪ **无源可补**。
      // 触发要「提交中换号」叠加「该账号本地无快照 / 写盘失败」,概率很低,但不是零 ——
      // 真正的兜底在服务端(单据是它建的),客户端到此为止。
      if (stored) {
        const list = [canonical, ...(stored.withdrawals ?? []).filter((item) => item.id !== canonical.id)];
        const written = mergeAndWriteAccountSnapshotResult(stored, { ...stored, withdrawals: list, updatedAt: Date.now() });
        if (!written.persisted) {
          // 与本函数主路径同口径:单据是服务端既成事实,不因为本地写不进去就吞掉它。
          // 调用方拿到 canonical 照常写账单行(账单是另一张表,可能写得进去)。
        }
      }
      // 风控台账同样记到冻结账号,不记当前绑定(首提标记 / 共用地址强信号都是按账号的)。
      commitWithdrawal(acct, network, address);
      return canonical;
    }
    withdrawals.value = [canonical, ...withdrawals.value.filter((item) => item.id !== canonical.id)];
    // 🔴 建单成功**必须落盘**。此前这里只改内存:刷新一次单据就没了,而它同时是
    // 「今日提了几笔」的唯一凭据(日限预检)与「有没有在途单」的唯一凭据(换址闸)——
    // 按一下 F5 两道闸一起失效(z2 R1 独立审计实测)。本函数之外没有兜底:
    // 全文件的周期性落盘在 remote 模式下早退,到账推进要等几小时后到点才写盘。
    //
    // 🔴 落盘失败要把这一单**放回内存**,而不是任其消失。
    //
    // 这里必须显式做,不能只写注释:`persistAccountSnapshot()` 内部**无条件**
    // `adoptAccountSnapshot(result.snapshot)`,而 account-cloud 在写失败时返回的
    // `snapshot` 是**磁盘上的旧行**(`stored ?? merged`)—— 于是刚建的这一单会被
    // 静默地从内存抹掉。R2 独立审计两路各自注入实测复现;此前这段注释写的是
    // 「失败不回滚」,与实际行为完全相反(本包第三次「注释声称了不存在的行为」)。
    //
    // 为什么是放回而不是接受回滚:单据是**服务端已经创建**的既成事实,抹掉它会让
    // 用户跳到追踪页看见「查无此单」,而钱已经动了;这一单也会同时退出日限计数与
    // 在途判定,连带把「在途期间禁止更换收款地址」那道闸一起架空。
    // 落盘失败只是「刷新后会丢」,是降级;丢单是错乱,后者严重得多。
    // 代价:内存有、磁盘无,直到下一次成功落盘补上。真闸在服务端,不会因此放行超额提现。
    if (!persistAccountSnapshot()) {
      withdrawals.value = [canonical, ...withdrawals.value.filter((item) => item.id !== canonical.id)];
      // 🔴🔴 基准也要一起补,否则「放回内存」只活到下一次资金写为止。
      // 兄弟资金原语(creditBalance / debitBalance / 奖励入账…)失败时一律
      // `adoptAccountSnapshot(previousSnapshot)`,而 previousSnapshot 就是这个
      // lastCloudSnapshot —— 它此刻还是**磁盘上那份不含本单的旧行**,回滚一次就把单又抹掉。
      // 而触发它的条件(存储写不进去)与触发本分支的条件是**同一个**,所以必然连着发生。
      // R3 独立审计在沙箱复现,我在真 store 上复验:放回=true → creditBalance 失败回滚 → 仍在=false。
      lastCloudSnapshot = { ...lastCloudSnapshot, withdrawals: withdrawals.value };
    }
    // Client-side risk ledger (first-withdrawal mark + address use) feeds the local
    // pre-check engine; the server keeps its own authoritative copy.
    // 账号取入口冻结值(此分支下它与 accountKey.value 相等,写死 acct 是为了让「本函数只认一个
    // 账号」这件事在两条分支上同形 —— 不留一个读活值的口子给下一次改动)。
    commitWithdrawal(acct, network, address);
    return canonical;
  }

  /**
   * FEAT-WD01b 到账推进:到点把 pass 路由单据补齐到 confirmed。
   *
   * 由 App 层在前台轮询 + onShow 调用 —— 关 App 三天再打开时,一次调用就补齐,
   * 不按天数循环推进(判定只看「now ≥ 预计到账」,与离线多久无关)。
   * 幂等性在纯函数里:推进过的单再进来返回 null,这里 null 就不写盘、不通知。
   *
   * 🔴 只改状态与到账时间,**不碰余额**:钱在提交时已扣,推进不是记账事件。
   * PROD:整块删掉,状态改由 GET /api/withdrawals/:id(或 SSE)权威回传。
   */
  /**
   * 到点推进,返回**本次真正推进了哪几笔的单号**(空数组 = 没有可推进的)。
   * 🔴 返回 boolean 不够:推进是全表扫,而调用方要按单号去结算对应的账单行 ——
   * 只回一个 true 会让调用方退回去问「最新一笔是谁」,于是结算结到别的单上
   * (独立验收实测:到账那笔账单永远处理中,还在处理的那笔反被标成已入账)。
   */
  function advanceWithdrawalArrival(): string[] {
    if (fundsServerEnabled) return [];
    // 🔴 全表扫:每一笔各自到点各自推进。单条版只看最新一笔,
    // 前面那笔到点了也永远推不动(列表化后这个洞自动消失)。
    const now = mockServerNow();
    const prev = withdrawals.value;
    // 🔴 远端模式的**真判据**在 advanceArrival 里(必填 ctx):判据留在纯函数里,才有一个
    // 能 node 直跑的落点(见 remote-authority-simulation.test.mjs)。上面那行
    // `if (fundsServerEnabled) return []` 是远端线加的第二道同向闸(fundsServerEnabled ≡
    // remoteApiEnabled),行为完全重合,保留它只是为了让「客户端 ETA 永不推进服务端单据」
    // 这件事在函数入口就一眼可见(funds-server-sandbox-contract 也钉了它)。
    const next = prev.map((w) => advanceArrival(w, now, { serverAuthoritative: remoteApiEnabled }) ?? w);
    const advancedIds = next.filter((w, i) => w !== prev[i]).map((w) => w.id);
    if (!advancedIds.length) return [];
    withdrawals.value = next;
    // 诚实返回落盘结果:落盘失败时内存说已到账、磁盘还是处理中,而内存一旦置 confirmed
    // 后续轮询就恒返回 false 永不重试(只有整页重载才自愈)。失败即回滚内存,下个 tick 再试。
    if (!persistAccountSnapshot()) {
      withdrawals.value = prev;
      // 🔴🔴 与 refreshRemoteWithdrawals / submitWithdrawal 同形:基准一起还原。
      // 写失败时 persistAccountSnapshot 内部已把 lastCloudSnapshot 换成磁盘旧行,
      // 只还原内存 = 下一次资金写失败回滚时按被污染的基准把单据抹掉(硬规则:修一处补全同形)。
      lastCloudSnapshot = { ...lastCloudSnapshot, withdrawals: withdrawals.value };
      return [];
    }
    return advancedIds;
  }

  /**
   * 远端模式的**替代品**:把服务端单据状态镜像回本地(GET /api/withdrawals/:id,
   * PRD §9.11f)。没有这一步,单纯关掉本地推进会把一个缺陷换成另一个 ——
   * 在途单永不终结 → occupiesWithdrawalSlot 恒真 → 收款地址换绑入口
   * (payout-address.hasInFlightWithdrawalOn)与「同时只能有一笔」的下一笔提现
   * **永久**被拦,账单行也永远停在处理中。
   *
   * 只读不裁决:状态、到账时刻全取服务端值;拉不到就保持原样(下一拍再试),
   * 绝不因为「问不到」就自己判一个。返回本次真正变动的单号,与
   * advanceWithdrawalArrival 同形状,供 App 层按单号结算对应账单行。
   */
  async function refreshRemoteWithdrawals(): Promise<string[]> {
    if (!remoteApiEnabled || mockFundsEnabled) return [];
    const expectedAccountKey = accountKey.value;
    // List is the durable source of truth; a fresh session may have no local rows
    // at all, so hydrate it before polling in-flight snapshots.
    await refreshRemoteWithdrawalList(expectedAccountKey);
    // 注:本包一度加过一道「同一实例内只许一拍在途」的闸,已按主人 2026-08-12 的范围决定撤回。
    // 撤回理由不是它没用,而是它**解决不了它声称的问题、却新引进一个**:闸是 store 实例级的,
    // 跨标签页/跨 webview 原样敞开(那正是并发的真实来源);而它没有超时兜底,
    // 一次不 settle 的请求就能让本会话的回读**永久停摆** —— 恰好复现本包要消灭的那个缺陷。
    // 乱序响应的真正解法是服务端下发「结论时刻」并按它裁决,属独立的仲裁重构(已独立立卡)。
    // 当前口径:乱序最坏是状态被旧结论覆盖一拍,下一拍(5s)自愈;而**信息字段不会丢** ——
    // 同状态两份快照按字段合并(account-cloud.mergeSameStatusWithdrawal)。
    const targets = inFlightWithdrawals.value;
    if (!targets.length) return [];
    const mirrors = await Promise.all(targets.map((w) =>
      withdrawalApi.get(w.id).catch(() => null)));
    if (expectedAccountKey !== accountKey.value) return [];
    const patches = new Map<string, Withdrawal>();
    targets.forEach((target, i) => {
      const remote = mirrors[i];
      if (!remote) return;
      // 🔴 基底取 **await 之后的当前行**,不是发请求那一刻捕获的那份(R2 审计):
      // `...w` 展开陈旧整行会把这段时间里别处(另一个 tab 合并回来、或上一拍)写入的
      // confirmedAt / terminalReason / retriable 一并抹掉。单据一进终态就不再被回查 ——
      // 抹掉即永久。(合并层同状态按字段合并是第二道网,这里是第一道:别先把值弄丢。)
      const w = withdrawals.value.find((row) => row.id === target.id);
      if (!w) return; // 这段时间里单据没了(换账号 / 被合并掉)——本拍的结论不再适用
      // 🔴 判「变没变」要把**三个字段**都算上,不能只看 status:状态没动、只有终态原因
      // 或可重试判定变了的那一拍,只比 status 会被整个丢掉。
      // 这样写是为了**不依赖一个没写进契约的服务端假设**(「原因一定和终态状态同一个响应发」)。
      // ⚠️ 但它救不了终态:单据一进终态就离开 inFlightWithdrawals,之后根本不会再被回查 ——
      // 服务端晚发的原因确实补不回来。那一半的责任在服务端,已写进后端交接书 U-9 让后端同发。
      // 本判据实际覆盖的是仍在途的单(如 frozen 被人工改写结论)。
      const reasonChanged = remote.terminalReason !== null && remote.terminalReason !== w.terminalReason;
      const retriableChanged = remote.retriable !== null && remote.retriable !== w.retriable;
      const nexRefundedChanged = remote.nexRefunded !== null && remote.nexRefunded !== w.nexRefunded;
      const nexRefundedAtChanged = remote.nexRefundedAt !== null && remote.nexRefundedAt !== w.nexRefundedAt;
      if (remote.status === w.status && !reasonChanged && !retriableChanged
          && !nexRefundedChanged && !nexRefundedAtChanged) return;
      patches.set(w.id, {
        ...w,
        status: remote.status,
        // 🔴 盖上「这份结论是什么时候从服务端问来的」。没有它,三路合并在平局时只能留磁盘旧行,
        // 上面那套判据就全是空转(独立审计实测:同状态改原因 100% 丢失)。
        // 用本机时钟即可:它只在**本机自己的两份快照之间**比大小,不与服务端时间对齐。
        // 服务端没给到账时刻就不编一个:仍按「到点即已到」记 estimatedCompletion,
        // 与 mock 推进同口径(见 advanceArrival 的 confirmedAt 注释)。
        ...(remote.status === "confirmed"
          ? { confirmedAt: remote.confirmedAt ?? w.estimatedCompletion }
          : {}),
        // 🔴 `null`(没给)与 `false`/具体码是两回事:没给就**保留已存的旧值**,不覆盖成空。
        // 覆盖的话,一次「服务端这拍没带原因」就把客服唯一能查的那条线索抹了。
        ...(remote.terminalReason !== null ? { terminalReason: remote.terminalReason } : {}),
        ...(remote.retriable !== null ? { retriable: remote.retriable } : {}),
        // 🔴 退款事实**成对**落单,与上面同一条规则:没给就保留旧值,不覆盖成空。
        // 这一行是冲正分录的唯一进料口 —— 解析层认出来了但不落到单据上,等于没接
        // (包 z8 焊的 ⑪ 判据防的就是这种半截:回查面在、字段不在,冲正永远不触发)。
        ...(remote.nexRefunded !== null
          ? { nexRefunded: remote.nexRefunded, nexRefundedAt: remote.nexRefundedAt ?? w.nexRefundedAt }
          : {}),
      });
    });
    if (!patches.size) return [];
    const prev = withdrawals.value;
    withdrawals.value = prev.map((w) => patches.get(w.id) ?? w);
    // 落盘失败即回滚内存 —— 与 advanceWithdrawalArrival 同一套「诚实返回落盘结果」。
    if (!persistAccountSnapshot()) {
      withdrawals.value = prev;
      // 🔴🔴 基准也要一起还原(R2 审计;submitWithdrawal 早就为**同一个坑**补过这一行)。
      // persistAccountSnapshot 无条件 adoptAccountSnapshot(result.snapshot),而写失败时
      // 那份 snapshot 是**磁盘旧行** —— 于是 lastCloudSnapshot 已被改写。只还原
      // withdrawals.value 的话,下一次任意资金原语写失败时会 adopt 这份被污染的基准,
      // 把单据从内存里抹掉:追踪页「查无此单」,而服务端已经扣款持单。
      lastCloudSnapshot = { ...lastCloudSnapshot, withdrawals: withdrawals.value };
      return [];
    }
    return [...patches.keys()];
  }

  // ⚠️ DEV/DEMO-ONLY(SPEC-7 收编): 仅 pass 路由的提现可由 demo 驱动推进主链
  // 状态;manual/delay/freeze 的状态推进属于服务端/人工处置,client 永不推进。
  // PRODUCTION: status comes from server webhook/SSE/polling only.
  function _devAdvanceWithdrawal() {
    if (import.meta.env.PROD || fundsServerEnabled) return; // demo-only 状态推进,store 层二层 guard(硬规则5)
    // 🔴 PROD 构建 ≠ 远端模式:remote 是默认档(runtime-config.ts),dev 构建里这个
    // demo 驱动照样在线,一按就把服务端单据在本地改成已到账。三条闸各挡一面
    // (PROD 构建 / 服务端资金轨 / 远端 API 模式)。
    if (remoteApiEnabled) return;
    const wd = latestWithdrawal.value;
    if (!wd) return;
    const pos = withdrawals.value.findIndex((w) => w.id === wd.id);
    if (pos < 0) return;
    if (wd.riskRoute && wd.riskRoute !== "pass") return;
    const order: Withdrawal["status"][] = [
      "submitted",
      "review-passed",
      "processing",
      "sent",
      "confirmed",
    ];
    const idx = order.indexOf(wd.status);
    if (idx === -1 || idx >= order.length - 1) return;
    const nextStatus = order[idx + 1];
    // demo 手动推到 confirmed 时也要记到账时间,否则追踪页的「实际到账」是空的
    // (真实推进路径在 advanceWithdrawalArrival,两条路必须产出同形状的单)。
    const updated: Withdrawal =
      nextStatus === "confirmed" ? { ...wd, status: nextStatus, confirmedAt: wd.estimatedCompletion } : { ...wd, status: nextStatus };
    withdrawals.value = withdrawals.value.map((w, i) => (i === pos ? updated : w));
    // persist-verdict-ok: dev 入口,非生产路径
    persistAccountSnapshot();
  }

  async function applyFundsSandboxCallback(orderNo: string, status: "CONFIRMED" | "FAILED"): Promise<boolean> {
    if (!mockFundsEnabled) return false;
    const expectedAccountKey = accountKey.value;
    const current = withdrawals.value.find((item) => item.id === orderNo);
    if (!current || current.serverVersion === undefined || current.status !== "submitted") return false;
    const eventId = `SBX-APP-${orderNo}-${status}`;
    const order = await fundsSandboxApi.applyCallback(orderNo, status, current.serverVersion, eventId);
    if (expectedAccountKey !== accountKey.value) throw new Error("FUNDS_SANDBOX_ACCOUNT_CHANGED");
    if (!order.wallet) throw new Error("FUNDS_SANDBOX_WALLET_MISSING");
    adoptFundsSandboxWallet(order.wallet);
    const canonical = canonicalFundsSandboxWithdrawal(order, current);
    withdrawals.value = withdrawals.value.map((item) => item.id === orderNo ? canonical : item);
    if (order.status === "CONFIRMED" || order.status === "FAILED") {
      finishPendingFundsMutationByOrder(expectedAccountKey, "SANDBOX", orderNo);
    }
    return true;
  }

  return {
    accountKey, entrySurface, accountCloudUpdatedAt,
    user, devices, visibleDevices, slotDevices, activeSlotCount, myTotalHashrateAt, earnings, global,
    homeTruth, homeTruthStatus, homeTruthError,
    remoteFleetStatus, remoteFleetError,
    withdrawals, latestWithdrawal, inFlightWithdrawals, primaryWithdrawal, miningPaused,
    bindAccount, projectServerIdentity, persistAccountSnapshot, refreshHomeTruth, refreshRemoteFleet, syncRemoteTaskAssignments, refreshFundsSandbox, refreshFundsSandboxForAccount,
    fundsSandboxStatus, fundsSandboxError, fundsSandboxEvidence,
    tick, settle, setPhoneRuntime, applyPhoneCalibration, interruptAllTasks, resumeMining,
    phoneBinding, phoneActivationError, phoneInventoryActivationError, acceptPhoneSignIn,
    creditBalance, debitBalance, creditNex, debitNex, captureMoney, restoreMoney,
    recordDeposit, creditRewardBucket, creditRewardBucketOnce,
    submitWithdrawal, applyWithdrawalDebit, advanceWithdrawalArrival, refreshRemoteWithdrawals, refreshRemoteWithdrawalList,
    applyFundsSandboxCallback, refundFailedWithdrawals,
    _devAdvanceWithdrawal, _devGrantManualRelease,
    addDevice, discardSpawnedDevice, retireDevice, restoreDevice, patchDevice, activateDevice, deactivateDevice, scheduleDeactivation, connectComputeShareDevice,
  };
});
