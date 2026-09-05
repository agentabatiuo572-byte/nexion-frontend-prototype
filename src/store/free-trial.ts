import { defineStore } from "pinia";
import { ref } from "vue";
import { useTrialConfig, computeDiscountedPrice, computeTrialOffset, resolveTrialDeviceName } from "./trial-config";
import { mockServerNow, ONE_DAY_MS } from "./server-time";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { remoteApiEnabled, trialApi } from "@/api/runtime";
import type { TrialAuthorityState } from "@/api/trial-api";
import { asApiError } from "@/api/errors";
import {
  resolveTrialAt,
  accruedShadow,
  type TrialBoundaryConfig,
  type TrialRowSnapshot,
  type TrialStatus,
} from "./trial-boundary";

/**
 * Free trial — FEAT-TRIAL02 cardless machine (spec signed 2026-07-31).
 *
 * State machine (spec ④):
 *   none →(claim)active →(expiry)grace →(grace end)ended
 *   active|grace →(buy with credit via checkout)converted   (terminal)
 *   active →(explicit user cancel)ended
 *
 * Hard behavior boundaries (spec ④): NEVER auto-charge, NEVER auto-order,
 * NEVER require a payment method to claim; `ended` stops shadow accrual;
 * `converted` is terminal (no rollback). Conversion money/order side effects
 * live in the checkout page (cross-store composition, P-031/032) — this store
 * only moves its own state.
 *
 * Eligibility (spec 异常2): one trial per account — `ended`/`converted` are
 * permanently ineligible ("已用过"/"已购机"); the spec state machine has no
 * ended→claim edge, so there is no cooldown-based re-claim.
 *
 * ⚠️ MOCK-VS-PRODUCTION: every action maps to a REST endpoint (PRD §9.11a).
 *   start()        → POST /api/trial/start          (no body — cardless)
 *   convert()      → POST /api/trial/convert       (PRD §9.11a.2 / §9.11e — server
 *                                                   settles offset + creates the order
 *                                                   in one transaction)
 *   cancel()       → POST /api/trial/cancel
 *   eligibility()  → GET  /api/trial/eligibility → { ok, reason? }
 *   poll()         → GET  /api/trial/state (server cron advances the machine)
 *
 * 🔴 时间边界单一不变量(2026-08-03):所有时钟判定收敛到 trial-boundary.ts 的
 * `resolveTrialAt` —— poll/convert/eligibility/影子累计全部调它,本文件不再
 * 出现任何 `now >= 边界` 的手写比对(cancel 是用户显式动作、非时钟判定,除外)。
 */

export type { TrialStatus } from "./trial-boundary";

/** Why the trial can't start right now (spec 异常2 — concrete reasons, no generic error).
 *  "risk" = spec 异常2 第三具名原因(风控命中)。MOCK 无风控引擎,本地 eligibility()
 *  无触发路径;生产由后端 GET /api/trial/eligibility 下发该 reason。 */
export type TrialIneligibleReason = "in-progress" | "converted" | "used" | "phase-closed" | "risk" | "unknown";

/** Persisted row shape — single source lives in trial-boundary.ts (resolver 同型)。 */
type FreeTrialState = TrialRowSnapshot;

const INITIAL: FreeTrialState = {
  status: "none",
  startedAt: null,
  expiresAt: null,
  graceEndsAt: null,
  finishedAt: null,
  shadowFrozenAtUSD: 0,
  shadowFrozenAtNEX: 0,
  legacyCardMigrated: false,
};

// 存量键不换(规格 异常6):旧行在 hydrate 时就地迁移到新状态机。
const ACCOUNTS_KEY = "nexgrid-trial-accounts-v1"; // { [accountKey]: FreeTrialState }

/** Legacy (card-era) persisted row shape — superset read for migration.
 *  `status` widens to string because legacy rows carry retired enum values. */
interface LegacyTrialRow extends Omit<Partial<FreeTrialState>, "status"> {
  status?: string;
  cardTokenId?: string | null;
  activeEndsAt?: number | null;
  extendedEndsAt?: number | null;
}

/**
 * Migrate a persisted row (legacy or current) to the FEAT-TRIAL02 shape
 * (spec 异常6): idle→none · extended→grace (graceEndsAt takes the later of the
 * two boundaries) · redeemed→converted · failed|cancelled→ended (finishedAt
 * kept for the "ended at" display). A card-era row still active/grace gets
 * `legacyCardMigrated` so the trial page can show the rules-changed notice.
 * 同根补齐(2026-08-03):legacy 行进到 grace 却缺 `shadowFrozenAtUSD/NEX`
 * (卡时代无此字段)时,用 resolver 同一个 `accruedShadow` 公式按冻结窗口
 * 就地补齐 —— 迁移与边界推进共用唯一冻结公式,不允许第二套算法。
 */
function migrateRow(row: LegacyTrialRow, cfg: TrialBoundaryConfig): FreeTrialState {
  let status: TrialStatus;
  let graceEndsAt = row.graceEndsAt ?? null;
  let legacyCardMigrated = row.legacyCardMigrated ?? false;
  switch (row.status) {
    case "idle":
      status = "none";
      break;
    case "extended": {
      status = "grace";
      const merged = Math.max(graceEndsAt ?? 0, row.extendedEndsAt ?? 0);
      graceEndsAt = merged > 0 ? merged : null;
      break;
    }
    case "redeemed":
      status = "converted";
      break;
    case "failed":
    case "cancelled":
      status = "ended";
      break;
    case "none":
    case "active":
    case "grace":
    case "ended":
    case "converted":
      status = row.status;
      break;
    default:
      return { ...INITIAL };
  }
  if ((status === "active" || status === "grace") && row.cardTokenId) legacyCardMigrated = true;
  const out: FreeTrialState = {
    status,
    startedAt: row.startedAt ?? null,
    expiresAt: row.expiresAt ?? row.activeEndsAt ?? null,
    graceEndsAt,
    finishedAt: row.finishedAt ?? null,
    shadowFrozenAtUSD: row.shadowFrozenAtUSD ?? 0,
    shadowFrozenAtNEX: row.shadowFrozenAtNEX ?? 0,
    legacyCardMigrated,
  };
  // legacy extended→grace 行缺冻结影子值:按冻结窗口在边界时刻补齐(公式单源
  // accruedShadow;窗口锚点缺失时补 0 —— fail-closed,不发明收益)。
  if (out.status === "grace" && out.shadowFrozenAtUSD === 0 && out.shadowFrozenAtNEX === 0 && out.expiresAt !== null) {
    const frozen = accruedShadow(out, out.expiresAt, cfg);
    out.shadowFrozenAtUSD = frozen.usd;
    out.shadowFrozenAtNEX = frozen.nex;
  }
  return out;
}

function hydrate(accountKey: string, cfg: TrialBoundaryConfig): FreeTrialState {
  const row = readAccountRow<LegacyTrialRow>(ACCOUNTS_KEY, accountKey);
  if (row && typeof row.status === "string") return migrateRow(row, cfg);
  return { ...INITIAL };
}

export const useFreeTrial = defineStore("freeTrial", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  const init = remoteApiEnabled ? { ...INITIAL } : hydrate(boundKey, useTrialConfig().config);
  const status = ref<TrialStatus>(init.status);
  const startedAt = ref<number | null>(init.startedAt);
  const expiresAt = ref<number | null>(init.expiresAt);
  const graceEndsAt = ref<number | null>(init.graceEndsAt);
  const finishedAt = ref<number | null>(init.finishedAt);
  const shadowFrozenAtUSD = ref<number>(init.shadowFrozenAtUSD);
  const shadowFrozenAtNEX = ref<number>(init.shadowFrozenAtNEX);
  const legacyCardMigrated = ref<boolean>(init.legacyCardMigrated);
  const authorityStatus = ref<"mock" | "loading" | "ready" | "unknown" | "error">(
    remoteApiEnabled ? "unknown" : "mock",
  );
  const authorityError = ref<string | null>(null);
  const authoritativeShadowUSD = ref(0);
  const authoritativeShadowNEX = ref(0);
  const remoteCanStart = ref(false);
  const remoteEligibilityReason = ref<TrialIneligibleReason>("unknown");
  const authorityClaimNo = ref<string | null>(null);
  const authorityVersion = ref(0);
  let refreshInFlight: Promise<boolean> | null = null;
  let refreshInFlightAccount: string | null = null;
  let pendingStartKey: string | null = null;
  let authorityRequestSequence = 0;
  let lastAppliedSequence = 0;

  /** Current row as a plain snapshot — resolver 的唯一输入形态(生产 = GET /api/trial/state 行)。 */
  function snapshot(): FreeTrialState {
    return {
      status: status.value,
      startedAt: startedAt.value,
      expiresAt: expiresAt.value,
      graceEndsAt: graceEndsAt.value,
      finishedAt: finishedAt.value,
      shadowFrozenAtUSD: shadowFrozenAtUSD.value,
      shadowFrozenAtNEX: shadowFrozenAtNEX.value,
      legacyCardMigrated: legacyCardMigrated.value,
    };
  }

  /** 远端档不落本地盘 = 预期结果;mock 档如实返回写入结果(convert 据此决定终态算不算落定)。 */
  function persist(): boolean {
    if (remoteApiEnabled) return true;
    return writeAccountRow<FreeTrialState>(ACCOUNTS_KEY, boundKey, snapshot());
  }

  /** 边界推进唯一入口:resolve 后有变化才落盘(poll/convert 共用;渲染路径禁调)。 */
  function advanceTo(now: number): FreeTrialState {
    if (remoteApiEnabled) return snapshot();
    const row = snapshot();
    const resolved = resolveTrialAt(row, now, useTrialConfig().config);
    if (resolved !== row) {
      load(resolved);
      persist(); // persist-verdict-ok: 边界推进 = 行 + now 纯推导,没落盘下次从旧行重算得到同一结果
    }
    return resolved;
  }

  function load(next: FreeTrialState) {
    status.value = next.status;
    startedAt.value = next.startedAt;
    expiresAt.value = next.expiresAt;
    graceEndsAt.value = next.graceEndsAt;
    finishedAt.value = next.finishedAt;
    shadowFrozenAtUSD.value = next.shadowFrozenAtUSD;
    shadowFrozenAtNEX.value = next.shadowFrozenAtNEX;
    legacyCardMigrated.value = next.legacyCardMigrated;
  }

  function clearRemoteFacts(nextStatus: "unknown" | "error" = "unknown", error: string | null = null) {
    load({ ...INITIAL });
    authoritativeShadowUSD.value = 0;
    authoritativeShadowNEX.value = 0;
    remoteCanStart.value = false;
    remoteEligibilityReason.value = "unknown";
    authorityClaimNo.value = null;
    authorityVersion.value = 0;
    authorityStatus.value = nextStatus;
    authorityError.value = error;
  }

  function applyAuthority(next: TrialAuthorityState, sequence: number): boolean {
    if (sequence < lastAppliedSequence) return false;
    if (authorityStatus.value === "ready" && authorityClaimNo.value === next.claimNo
        && next.version < authorityVersion.value) return false;
    lastAppliedSequence = sequence;
    load({
      status: next.status,
      startedAt: next.startedAt,
      expiresAt: next.expiresAt,
      graceEndsAt: next.graceEndsAt,
      finishedAt: next.finishedAt,
      // Remote shadow values are server projections, never locally accrued facts.
      shadowFrozenAtUSD: next.shadowUSD,
      shadowFrozenAtNEX: next.shadowNEX,
      legacyCardMigrated: false,
    });
    authoritativeShadowUSD.value = next.shadowUSD;
    authoritativeShadowNEX.value = next.shadowNEX;
    remoteCanStart.value = next.canStart;
    remoteEligibilityReason.value = next.eligibilityReason ?? "unknown";
    authorityClaimNo.value = next.claimNo;
    authorityVersion.value = next.version;
    useTrialConfig().applyAuthoritative(next.config);
    authorityStatus.value = "ready";
    authorityError.value = null;
    return true;
  }

  async function refreshRemote(force = false): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    if (!force && refreshInFlight && refreshInFlightAccount === boundKey) return refreshInFlight;
    const requestedAccount = boundKey;
    const sequence = ++authorityRequestSequence;
    authorityStatus.value = "loading";
    authorityError.value = null;
    let request!: Promise<boolean>;
    request = trialApi.state()
      .then((next) => {
        if (requestedAccount !== boundKey) return false;
        return applyAuthority(next, sequence);
      })
      .catch((error: unknown) => {
        if (requestedAccount === boundKey && sequence >= lastAppliedSequence) {
          lastAppliedSequence = sequence;
          clearRemoteFacts("error", asApiError(error).message);
        }
        return false;
      })
      .finally(() => {
        if (refreshInFlight === request) {
          refreshInFlight = null;
          refreshInFlightAccount = null;
        }
      });
    refreshInFlight = request;
    refreshInFlightAccount = requestedAccount;
    return request;
  }

  async function refreshEligibilityRemote(): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    const requestedAccount = boundKey;
    const sequence = ++authorityRequestSequence;
    authorityStatus.value = "loading";
    authorityError.value = null;
    try {
      const next = await trialApi.eligibility();
      return requestedAccount === boundKey && applyAuthority(next, sequence);
    } catch (error) {
      if (requestedAccount === boundKey && sequence >= lastAppliedSequence) {
        lastAppliedSequence = sequence;
        clearRemoteFacts("error", asApiError(error).message);
      }
      return false;
    }
  }

  /** 账号切换重绑:装载该账号的试用状态机(防跨账号继承试用资格/影子收益)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    if (remoteApiEnabled) {
      lastAppliedSequence = ++authorityRequestSequence;
      clearRemoteFacts();
      void refreshRemote();
      return;
    }
    load(hydrate(boundKey, useTrialConfig().config));
  }

  // PRODUCTION: GET /api/trial/eligibility → { ok, reason? }
  // 判定基于 resolveTrialAt 解析后的状态(只读、不落盘):离线跨过边界的行在
  // 内存状态推进前就按真实时点判 —— 真 ended 的行拿 "used" 而不是 "in-progress"。
  function eligibility(): { ok: boolean; reason?: TrialIneligibleReason } {
    if (remoteApiEnabled) {
      if (authorityStatus.value !== "ready") return { ok: false, reason: "unknown" };
      return remoteCanStart.value
        ? { ok: true }
        : { ok: false, reason: remoteEligibilityReason.value };
    }
    const cfg = useTrialConfig().config;
    const resolved = resolveTrialAt(snapshot(), mockServerNow(), cfg);
    if (resolved.status === "active" || resolved.status === "grace") return { ok: false, reason: "in-progress" };
    if (resolved.status === "converted") return { ok: false, reason: "converted" };
    if (resolved.status === "ended") return { ok: false, reason: "used" };
    if (!cfg.phaseOpen) return { ok: false, reason: "phase-closed" };
    return { ok: true };
  }

  /** Boolean view of eligibility() — kept for the many entry-surface gates. */
  function canStart(): boolean {
    return eligibility().ok;
  }

  // PRODUCTION: POST /api/trial/start (no card token — cardless claim, spec ③).
  // Idempotent: a second call while ineligible is a no-op (spec 异常3 — one
  // trial per account, concurrent taps produce exactly one).
  async function start(): Promise<{ ok: boolean; reason?: TrialIneligibleReason }> {
    if (remoteApiEnabled) {
      if (!await refreshEligibilityRemote()) return { ok: false, reason: "unknown" };
      const remoteEligibility = eligibility();
      if (!remoteEligibility.ok) return { ok: false, reason: remoteEligibility.reason };
      const deviceName = resolveTrialDeviceName(useTrialConfig().config.trialProductId);
      if (!deviceName) {
        clearRemoteFacts("error", "TRIAL_CONFIG_RESPONSE_INVALID");
        return { ok: false, reason: "unknown" };
      }
      pendingStartKey ??= commandKey("start");
      try {
        const sequence = ++authorityRequestSequence;
        const receipt = await trialApi.start(pendingStartKey, deviceName);
        applyAuthority(receipt, sequence);
        const expectedClaimNo = receipt.claimNo;
        const confirmed = await refreshRemote(true);
        if (!confirmed || !expectedClaimNo || authorityClaimNo.value !== expectedClaimNo
            || (status.value !== "active" && status.value !== "grace")) {
          clearRemoteFacts("unknown", "TRIAL_START_RESULT_UNKNOWN");
          return { ok: false, reason: "unknown" };
        }
        pendingStartKey = null;
        return { ok: true };
      } catch (error) {
        const reason = commandFailureReason(error);
        authorityError.value = asApiError(error).message;
        const reconciled = await refreshRemote();
        if (reconciled && authorityClaimNo.value
            && (status.value === "active" || status.value === "grace")) {
          pendingStartKey = null;
          return { ok: true };
        }
        return { ok: false, reason };
      }
    }
    const elig = eligibility();
    if (!elig.ok) return { ok: false, reason: elig.reason };
    const cfg = useTrialConfig().config;
    const now = mockServerNow();
    const exp = now + cfg.trialDays * ONE_DAY_MS;
    // 🔴 快照取在**任何**字段改动之前(审计 R7 P0:曾取在 status 置 active 之后,落盘失败回滚成
    // 「active + 全空边界」的坏行,解析器 fail-closed 判 ended 并被 poll 落盘 —— 一次性试用资格被永久烧掉)。
    const beforeStart = snapshot();
    status.value = "active";
    startedAt.value = now;
    expiresAt.value = exp;
    graceEndsAt.value = exp + cfg.graceDays * ONE_DAY_MS;
    finishedAt.value = null;
    shadowFrozenAtUSD.value = 0;
    shadowFrozenAtNEX.value = 0;
    legacyCardMigrated.value = false;
    if (!persist()) {
      load(beforeStart); // 没落盘 = 没开始:别让页面宣布「试用已开始」而刷新后什么都没有
      return { ok: false, reason: "unknown" };
    }
    return { ok: true };
  }

  // PRODUCTION: POST /api/trial/convert (PRD §9.11a.2 / §9.11e — order + convert atomic).
  // Only active|grace convert (spec ④); terminal, no rollback. Returns false
  // when the machine isn't convertible — the checkout must have bailed earlier.
  // 🔴 P0 防线:convert 内部自己取 mockServerNow() 并先 resolveTrialAt 推进边界,
  // 绝不信任调用方(结算页)缓存的 now 或内存里的旧 status —— 用户离线跨过宽限期
  // 后趁 poll 未跑下单,这里按真实时点判到 ended 即拒绝(边界推进结果已落盘)。
  async function convert(productNo?: string, expectedAmountUsdt?: number): Promise<{
    ok: boolean; reason?: TrialIneligibleReason; orderNo?: string;
  }> {
    const requestedProductNo = productNo ?? useTrialConfig().config.trialProductId;
    if (remoteApiEnabled) {
      if (authorityStatus.value !== "ready") await refreshRemote(true);
      if (authorityStatus.value !== "ready" || !authorityClaimNo.value) return { ok: false, reason: "unknown" };
      const requestedAccount = boundKey;
      const expectedClaimNo = authorityClaimNo.value;
      const key = `h2-convert:${expectedClaimNo}:${requestedProductNo}`;
      try {
        const sequence = ++authorityRequestSequence;
        const receipt = await trialApi.convert(requestedProductNo, expectedAmountUsdt ?? null, key);
        if (requestedAccount !== boundKey) return { ok: false, reason: "unknown" };
        const confirmed = await refreshRemote(true);
        if (!confirmed || authorityClaimNo.value !== expectedClaimNo || status.value !== "converted") {
          clearRemoteFacts("unknown", "TRIAL_CONVERT_RESULT_UNKNOWN");
          return { ok: false, reason: "unknown" };
        }
        lastAppliedSequence = Math.max(lastAppliedSequence, sequence);
        return { ok: true, orderNo: receipt.orderNo };
      } catch (error) {
        authorityError.value = asApiError(error).message;
        // A lost HTTP response is reconciled with the same key first. The
        // idempotency record can replay the original order receipt without a
        // second stock reservation; only then do we fall back to state readback.
        try {
          const replay = await trialApi.convert(requestedProductNo, expectedAmountUsdt ?? null, key);
          const reconciled = await refreshRemote(true);
          if (requestedAccount === boundKey && reconciled && authorityClaimNo.value === expectedClaimNo
              && status.value === "converted") return { ok: true, orderNo: replay.orderNo };
        } catch {
          // Continue to the authoritative state readback below.
        }
        const reconciled = await refreshRemote(true);
        if (requestedAccount === boundKey && reconciled && authorityClaimNo.value === expectedClaimNo
            && status.value === "converted") {
          // State readback proves the trial is terminal, but without the
          // receipt/order number the checkout cannot safely present or poll
          // the created order. Keep this unknown and retain the same key so a
          // later retry can replay the idempotent receipt.
          return { ok: false, reason: "unknown" };
        }
        return { ok: false, reason: "unknown" };
      }
    }
    const now = mockServerNow();
    const resolved = advanceTo(now);
    if (resolved.status !== "active" && resolved.status !== "grace") return { ok: false, reason: "used" };
    const prevStatus = status.value;
    const prevFinishedAt = finishedAt.value;
    status.value = "converted";
    finishedAt.value = now;
    // 终态必须落盘才算裁决成立:写不进去就退回内存,报 ok:false —— 否则调用方按「已转化」发放试用减免与
    // 入账,刷新后试用行仍是 active,同一份福利可再吃一次(审计 R5 P1)。
    if (!persist()) {
      status.value = prevStatus;
      finishedAt.value = prevFinishedAt;
      return { ok: false, reason: "unknown" };
    }
    return { ok: true };
  }

  // PRODUCTION: POST /api/trial/cancel. Spec ④: only `active →(用户主动取消)ended`
  // — grace has nothing left to cancel (production already stopped).
  async function cancel(): Promise<{ ok: boolean; reason?: TrialIneligibleReason }> {
    if (remoteApiEnabled) {
      if (authorityStatus.value !== "ready") await refreshRemote(true);
      if (authorityStatus.value !== "ready" || !authorityClaimNo.value) {
        return { ok: false, reason: "unknown" };
      }
      const expectedClaimNo = authorityClaimNo.value;
      const key = `h2-cancel:${expectedClaimNo}`;
      try {
        const sequence = ++authorityRequestSequence;
        const receipt = await trialApi.cancel("explicit", key);
        applyAuthority(receipt, sequence);
        const confirmed = await refreshRemote(true);
        if (!confirmed || authorityClaimNo.value !== expectedClaimNo || status.value !== "ended") {
          clearRemoteFacts("unknown", "TRIAL_CANCEL_RESULT_UNKNOWN");
          return { ok: false, reason: "unknown" };
        }
        return { ok: true };
      } catch (error) {
        authorityError.value = asApiError(error).message;
        const reconciled = await refreshRemote();
        if (reconciled && authorityClaimNo.value === expectedClaimNo && status.value === "ended") {
          return { ok: true };
        }
        return { ok: false, reason: commandFailureReason(error) };
      }
    }
    if (status.value !== "active") return { ok: false, reason: eligibility().reason ?? "unknown" };
    const beforeEnd = snapshot();
    status.value = "ended";
    finishedAt.value = mockServerNow();
    if (!persist()) {
      load(beforeEnd);
      return { ok: false, reason: "unknown" };
    }
    return { ok: true };
  }

  // PRODUCTION: client polls GET /api/trial/state; advancement runs server-side
  // by cron. Spec ④ 禁止动作:grace→ended flips STATE ONLY — zero debit, zero
  // order, zero device writes ever happen here. 边界判定/级联/补齐全在
  // resolveTrialAt(冻结窗口、finishedAt=真边界、null graceEndsAt 就地补齐)。
  async function poll(now: number): Promise<boolean> {
    if (remoteApiEnabled) return refreshRemote();
    advanceTo(now);
    return true;
  }

  function commandKey(operation: string): string {
    const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `h2-${operation}:${suffix}`;
  }

  function commandFailureReason(error: unknown): TrialIneligibleReason {
    switch (asApiError(error).message) {
      case "TRIAL_ALREADY_ACTIVE": return "in-progress";
      case "TRIAL_ALREADY_REDEEMED": return "converted";
      case "TRIAL_COOLDOWN_ACTIVE": return "used";
      case "TRIAL_CYCLE_RISK_BLOCKED": return "risk";
      case "TRIAL_PHASE_CLOSED":
      case "TRIAL_KILL_SWITCH_DISABLED": return "phase-closed";
      default: return "unknown";
    }
  }

  return {
    status, startedAt, expiresAt, graceEndsAt, finishedAt,
    shadowFrozenAtUSD, shadowFrozenAtNEX, legacyCardMigrated,
    authorityStatus, authorityError, authoritativeShadowUSD, authoritativeShadowNEX,
    authorityClaimNo, authorityVersion,
    eligibility, canStart, start, convert, cancel, poll, bindAccount, snapshot,
    refreshRemote, refreshEligibilityRemote,
  };
});

/** Live shadow accrual — accrues during active, frozen during grace, 0 on
 *  none/ended/converted (spec ④: `ended` never accrues further).
 *  渲染路径游离函数:只读 resolveTrialAt 的解析结果拿正确时点语义(离线跨界的
 *  行按真实状态显示,累计上限 = 冻结窗口),绝不在此写状态/落盘(Vue 反模式);
 *  落盘由 poll/convert 独占。 */
export function liveShadowUSD(now: number): number {
  const s = useFreeTrial();
  if (remoteApiEnabled) return s.authoritativeShadowUSD;
  const cfg = useTrialConfig().config;
  const r = resolveTrialAt(s.snapshot(), now, cfg);
  if (r.status === "active") return accruedShadow(r, now, cfg).usd;
  if (r.status === "grace") return r.shadowFrozenAtUSD;
  return 0;
}

export function liveShadowNEX(now: number): number {
  const s = useFreeTrial();
  if (remoteApiEnabled) return s.authoritativeShadowNEX;
  const cfg = useTrialConfig().config;
  const r = resolveTrialAt(s.snapshot(), now, cfg);
  if (r.status === "active") return accruedShadow(r, now, cfg).nex;
  if (r.status === "grace") return r.shadowFrozenAtNEX;
  return 0;
}

/** Remaining ms until the next state boundary. */
export function remainingMs(now: number): number {
  const s = useFreeTrial();
  if (s.status === "active" && s.expiresAt !== null) return Math.max(0, s.expiresAt - now);
  if (s.status === "grace" && s.graceEndsAt !== null) return Math.max(0, s.graceEndsAt - now);
  return 0;
}

const SLOT_RESERVING_STATUSES: TrialStatus[] = ["active", "grace"];

/** Non-reactive variant for store actions (e.g. useApp.activateDevice slot cap). */
export function trialReservesSlotNow(): boolean {
  return SLOT_RESERVING_STATUSES.includes(useFreeTrial().status);
}

export { computeDiscountedPrice, computeTrialOffset };
