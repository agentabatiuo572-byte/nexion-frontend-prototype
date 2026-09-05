import { defineStore } from "pinia";
import { ref } from "vue";
import { eventsApi, remoteApiEnabled } from "@/api/runtime";
import type { EventSpinHistory, EventSpinSegment } from "@/api/events-api";
import { mockServerNow } from "./server-time";
import { createAccountRowCommit } from "./account-scoped-storage";

/**
 * Lucky Spin 转盘 — daily free spin + Day-30 streak milestone bonus spins.
 * Ported from Nexion-prototype/lib/store/lucky-spin.ts (zustand persist → Pinia
 * + uni storage). Surfaced from:
 *   - /events `evt-spring-spin` card "Spin now" CTA (kind === "wheel")
 *   - /daily Day-30 streak milestone (grants a bonus ticket → opens sheet)
 *
 * Prize pool (8 segments) aligns 运营后台 PRD V3 Ch13 H4 ③ Lucky Spin 奖池表:
 * EV ≈ $0.78/spin · Genesis 整台节点不进转盘 · 真实奖(usdt/coupon)受护栏.
 *
 * Real backend (mock-replaceable, 关联 feedback_mock_real_compatible):
 *   - 中奖裁决 100% server 执行 `POST /api/events/:id/spin`(server-canonical
 *     RNG + NODE_ENV guard);本 store 的 rollPrize() 是 mock 占位,生产环境
 *     概率表 server 持有、client 永不可知 / 不 roll.
 *   - 真实奖三护栏(日派彩预算 / 单奖每日全局库存 / 真实奖总开关)+ B1 兑付
 *     覆盖率红线自动降级,server 侧裁决;本 store 的 realPrizeSoldOut /
 *     coverageDegraded 是前端演示这两类降级态的 mock flag.
 *   - 每日免费一次由 server 按 `eventId × userId × spinDate`(UTC 日桶)计票,
 *     超额返 409;本 store 的 lastFreeSpinDate 是其前端镜像.
 * persist key 带版本号;时间戳 ms epoch;action-driven → 接真后台前端零重写.
 */

export type SpinPrizeKind = "nex" | "points" | "usdt" | "coupon";

export interface SpinPrize {
  id: string;
  kind: SpinPrizeKind;
  amount: number; // NEX / points / USDT 数额,或 coupon 面值(USDT)
  labelKey: string; // i18n: t.luckySpin.prizes[labelKey]
  weight: number; // 概率权重(之和 = 100)
  isReal: boolean; // 真实奖(usdt / coupon)— 受护栏 + 红线降级约束
  tint: string; // 转盘扇区色 token
  rewardName?: string;
}

/** 8 档奖池 — 对齐 PRD V3 Ch13 H4 ③ 奖池表(顺序即转盘顺时针扇区序) */
export const SPIN_PRIZES: SpinPrize[] = [
  { id: "nex5",     kind: "nex",    amount: 5,   labelKey: "nex5",     weight: 38,  isReal: false, tint: "var(--v5-brand)" },
  { id: "usdt1",    kind: "usdt",   amount: 1,   labelKey: "usdt1",    weight: 5,   isReal: true,  tint: "var(--v5-warning)" },
  { id: "nex10",    kind: "nex",    amount: 10,  labelKey: "nex10",    weight: 24,  isReal: false, tint: "var(--v5-tech-cyan)" },
  { id: "usdt20",   kind: "usdt",   amount: 20,  labelKey: "usdt20",   weight: 0.9, isReal: true,  tint: "var(--v5-warning)" },
  { id: "nex30",    kind: "nex",    amount: 30,  labelKey: "nex30",    weight: 18,  isReal: false, tint: "var(--v5-brand)" },
  { id: "coupon50", kind: "coupon", amount: 50,  labelKey: "coupon50", weight: 3,   isReal: true,  tint: "var(--v5-tech-cyan)" },
  { id: "nex50",    kind: "nex",    amount: 50,  labelKey: "nex50",    weight: 11,  isReal: false, tint: "var(--v5-brand-2)" },
  { id: "usdt500",  kind: "usdt",   amount: 500, labelKey: "usdt500",  weight: 0.1, isReal: true,  tint: "var(--v5-brand-2)" },
];

export const SEGMENT_COUNT = SPIN_PRIZES.length; // 8

/** idle → confirming → spinning → won;失败走 ui netError(本 store 退回 idle) */
export type SpinPhase = "idle" | "confirming" | "spinning" | "won";

export interface SpinWin {
  prizeId: string;
  ts: number;
}

function utcDate(ms: number): string {
  // UTC 日桶 "YYYY-MM-DD"(对齐 server spinDate 计票)
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Mock server roll — 生产环境此逻辑在 server(`POST /api/events/:id/spin`,
 * server-canonical RNG + NODE_ENV guard),client 永不可知概率表。
 * 降级态(coverageDegraded / realPrizeSoldOut)时排除真实奖档、权重并入安慰档。
 */
function rollPrize(excludeReal: boolean): SpinPrize {
  const pool = excludeReal ? SPIN_PRIZES.filter((p) => !p.isReal) : SPIN_PRIZES;
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[0];
}

/** 目标旋转角:多转若干整圈 + 落到中奖扇区中心(指针在 12 点) */
function targetAngleFor(prizeId: string, prevAngle: number, prizes: SpinPrize[] = SPIN_PRIZES): number {
  const idx = Math.max(0, prizes.findIndex((p) => p.id === prizeId));
  const turns = 5; // 至少 5 整圈的爽快旋转
  // 扇区 idx 中心相对 0° 的角度;指针固定在顶部,故转盘需反向到该扇区
  const segmentDeg = 360 / prizes.length;
  const segCenter = idx * segmentDeg + segmentDeg / 2;
  const base = Math.ceil(prevAngle / 360) * 360; // 从当前圈数往上累加,保证只正向转
  return base + turns * 360 + (360 - segCenter);
}

// 旧设备级单键 "nexgrid-lucky-spin-v1" 废弃(存量无账号归属,mock 可重建);转盘持久态按账号分行。
const ACCOUNTS_KEY = "nexgrid-lucky-spin-accounts-v1"; // { [accountKey]: persisted spin state }

interface SpinRow {
  bonusTickets: number;
  lastFreeSpinDate: string;
  history: SpinWin[];
  realPrizeSoldOut: boolean;
  coverageDegraded: boolean;
}

function defaults(): SpinRow {
  return {
    bonusTickets: 0,
    lastFreeSpinDate: "",
    history: [],
    realPrizeSoldOut: false,
    coverageDegraded: false,
  };
}

/** 磁盘行 → 转盘持久态。行不存在 → null(调用方退回 defaults / 内存态)。 */
function parseRow(raw: unknown): SpinRow | null {
  const s = raw as Partial<SpinRow> | null;
  if (!s) return null;
  return {
    bonusTickets: typeof s.bonusTickets === "number" ? s.bonusTickets : 0,
    lastFreeSpinDate: typeof s.lastFreeSpinDate === "string" ? s.lastFreeSpinDate : "",
    history: Array.isArray(s.history) ? s.history : [],
    realPrizeSoldOut: s.realPrizeSoldOut === true,
    coverageDegraded: s.coverageDegraded === true,
  };
}

export const useLuckySpin = defineStore("luckySpin", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  // ponytail: realPrizeSoldOut/coverageDegraded 名义是平台降级 flag,整块落 per-account 行——
  // 两者是 dev 演示开关(默认 false),真后台 server 全局裁决;真正需隔离的用户资产是
  // bonusTickets/lastFreeSpinDate/history(免费票/每日抽记录,换账号不得继承)。

  // ── session-only (not persisted) ──
  const open = ref(false);
  const phase = ref<SpinPhase>("idle");
  const lastWonPrizeId = ref<string | null>(null);
  const wheelAngle = ref(0);

  // ── persisted ──
  const bonusTickets = ref(0);
  const lastFreeSpinDate = ref("");
  const history = ref<SpinWin[]>([]);
  const realPrizeSoldOut = ref(false);
  const coverageDegraded = ref(false);
  const remoteSegments = ref<SpinPrize[]>([]);
  const remoteHistory = ref<EventSpinHistory[]>([]);
  let remoteGeneration = 0;
  const remoteState = ref<{
    freeAvailable: boolean;
    bonusTickets: number;
    availableSpins: number;
    nextResetAtUtc: string;
  } | null>(null);

  // 落盘唯一出口:乐观并发提交器。票是**每日配额 + 稀缺资源**,覆盖式写会让两个标签页
  // 各花掉同一张票各中一次奖(组件抽完直接 creditPrize → 白发奖)。
  const rows = createAccountRowCommit<SpinRow>({
    tableKey: ACCOUNTS_KEY,
    parse: parseRow,
    snapshot: () => ({
      bonusTickets: bonusTickets.value,
      lastFreeSpinDate: lastFreeSpinDate.value,
      history: history.value,
      realPrizeSoldOut: realPrizeSoldOut.value,
      coverageDegraded: coverageDegraded.value,
    }),
    sync: (row) => {
      bonusTickets.value = row.bonusTickets;
      lastFreeSpinDate.value = row.lastFreeSpinDate;
      history.value = row.history;
      realPrizeSoldOut.value = row.realPrizeSoldOut;
      coverageDegraded.value = row.coverageDegraded;
    },
  });

  /** 账号切换重绑:装载该账号的转盘持久态(票/记录),并重置本地会话态(转盘动画/弹层)。 */
  function bindAccount(rawAccountKey: string) {
    remoteGeneration += 1;
    remoteState.value = null;
    remoteSegments.value = [];
    remoteHistory.value = [];
    const next = rows.bind(rawAccountKey) ?? defaults();
    bonusTickets.value = next.bonusTickets;
    lastFreeSpinDate.value = next.lastFreeSpinDate;
    history.value = next.history;
    realPrizeSoldOut.value = next.realPrizeSoldOut;
    coverageDegraded.value = next.coverageDegraded;
    // 会话态清零:别把 A 的转盘动画/中奖弹层带到 B。
    open.value = false;
    phase.value = "idle";
    lastWonPrizeId.value = null;
    wheelAngle.value = 0;
  }
  bindAccount("default");

  // ── derived (call as functions, like the source's selectors) ──
  function hasFreeSpinToday(): boolean {
    if (remoteApiEnabled) return remoteState.value?.freeAvailable ?? false;
    return lastFreeSpinDate.value !== utcDate(mockServerNow());
  }
  function availableSpins(): number {
    if (remoteApiEnabled) return remoteState.value?.availableSpins ?? 0;
    return (hasFreeSpinToday() ? 1 : 0) + bonusTickets.value;
  }
  /** 真实奖档当前是否参与裁决(售罄 / 降级 → false)*/
  function realPrizeActive(): boolean {
    if (remoteApiEnabled) return true;
    return !realPrizeSoldOut.value && !coverageDegraded.value;
  }

  function nextResetAtUtc(): string | null {
    return remoteState.value?.nextResetAtUtc ?? null;
  }

  function mapRemoteSegment(segment: EventSpinSegment, index: number): SpinPrize {
    const type = segment.rewardType.toLowerCase();
    const kind: SpinPrizeKind = type === "usdt" || type === "coupon" || type === "points"
      ? type : "nex";
    return {
      id: segment.tierId,
      kind,
      amount: segment.rewardAmount,
      labelKey: segment.tierId,
      weight: 0,
      isReal: segment.realOutflow,
      tint: index % 2 === 0 ? "var(--v5-brand)" : "var(--v5-tech-cyan)",
      rewardName: segment.rewardName,
    };
  }

  async function refreshRemoteState(eventCode = "evt-spring-spin"): Promise<boolean> {
    if (!remoteApiEnabled) return false;
    const generation = remoteGeneration;
    try {
      await eventsApi.state();
      const next = await eventsApi.spinState(eventCode);
      if (generation !== remoteGeneration) return false;
      remoteState.value = {
        freeAvailable: next.freeAvailable,
        bonusTickets: next.bonusTickets,
        availableSpins: next.availableSpins,
        nextResetAtUtc: next.nextResetAtUtc,
      };
      bonusTickets.value = next.bonusTickets;
      lastFreeSpinDate.value = next.freeAvailable ? "" : next.serverDate;
      history.value = [];
      remoteSegments.value = next.segments.map(mapRemoteSegment);
      remoteHistory.value = next.history;
      return true;
    } catch {
      if (generation === remoteGeneration) remoteState.value = null;
      return false;
    }
  }

  // ── actions ──
  function openSheet() {
    open.value = true;
    phase.value = "idle";
    lastWonPrizeId.value = null;
    if (remoteApiEnabled) void refreshRemoteState();
  }

  function closeSheet() {
    open.value = false;
    phase.value = "idle";
  }

  /** Day-30 里程碑发 bonus 票。增量型:冲突时在**别处写完的最新票数**上重放这次加票。 */
  function grantBonusTicket(n: number) {
    // persist-verdict-ok: 奖池 / 票数状态更新,失败时内存已回灌磁盘行,用户看到的是磁盘真值;补票 / 中奖入账由收口点另行落盘(残余:票数增量可能丢一次,归活动包)
    rows.commit((cur) => ({ next: { ...cur, bonusTickets: cur.bonusTickets + n }, result: true as const }));
  }

  function startConfirm() {
    phase.value = "confirming";
  }
  function cancelConfirm() {
    phase.value = "idle";
  }

  /**
   * 执行一次抽奖:消费 1 张票(免费优先)、mock server roll、置 spinning + 目标角。
   * ok=true 时 prizeId 为中奖档(供组件在动画结束后 reveal + 派奖);无票 / 票被别处花掉 → ok=false。
   *
   * 🔴 顺序是「先扣票落盘,过了才转轮子」:票的存量按**磁盘最新**判,别的标签页刚用掉的
   * 今日免费次数在这里就被挡住。反过来(先转后扣)= 两个标签页各花同一张票各中一次奖,
   * 而组件拿到 prizeId 就直接 creditPrize —— 白发两份奖。
   */
  function spin(): { ok: boolean; prizeId: string | null; conflict?: boolean } {
    const today = utcDate(mockServerNow());
    const r = rows.commit((cur) => {
      const free = cur.lastFreeSpinDate !== today;
      if (!free && cur.bonusTickets <= 0) return null; // 今日免费已用 + 无 bonus 票
      // 消费票:免费优先,否则扣 bonus 票(floor 0 防御:并发/重入永不为负)
      const next = free
        ? { ...cur, lastFreeSpinDate: today }
        : { ...cur, bonusTickets: Math.max(0, cur.bonusTickets - 1) };
      return { next, result: free };
    });
    if (!r.ok) return { ok: false, prizeId: null, conflict: r.conflict };
    // 票已落盘;降级 flag 此刻是 commit 刚同步回来的最新值,roll 用它。
    const prize = rollPrize(!realPrizeActive());
    phase.value = "spinning";
    lastWonPrizeId.value = prize.id;
    wheelAngle.value = targetAngleFor(prize.id, wheelAngle.value);
    return { ok: true, prizeId: prize.id };
  }

  async function spinRemote(
    eventCode: string,
    idempotencyKey: string,
  ): Promise<{ ok: boolean; prizeId: string | null; stale?: boolean }> {
    if (!remoteApiEnabled) return spin();
    if (availableSpins() <= 0) return { ok: false, prizeId: null };
    if (remoteSegments.value.length === 0) return { ok: false, prizeId: null };
    const generation = remoteGeneration;
    try {
      const result = await eventsApi.spin(eventCode, idempotencyKey);
      if (generation !== remoteGeneration) return { ok: false, prizeId: null, stale: true };
      const prizeId = result.tierId;
      const prizes = remoteSegments.value;
      phase.value = "spinning";
      lastWonPrizeId.value = prizeId;
      wheelAngle.value = targetAngleFor(prizeId, wheelAngle.value, prizes);
      void refreshRemoteState(eventCode);
      return { ok: true, prizeId };
    } catch {
      return { ok: false, prizeId: null };
    }
  }

  /** 动画结束:置 won 态(派奖由组件 compose 各 store 完成,store 不跨 import)*/
  function reveal() {
    phase.value = "won";
  }

  /** 失败回滚:退还本次消费的票 + 回 idle(网络失败场景)*/
  function refundAndReset(wasFree: boolean) {
    phase.value = "idle";
    lastWonPrizeId.value = null;
    // 退票:免费则清除今日已抽标记,否则退还 1 张 bonus
    // persist-verdict-ok: 奖池 / 票数状态更新,失败时内存已回灌磁盘行,用户看到的是磁盘真值;补票 / 中奖入账由收口点另行落盘(残余:票数增量可能丢一次,归活动包)
    rows.commit((cur) => ({
      next: wasFree
        ? { ...cur, lastFreeSpinDate: "" }
        : { ...cur, bonusTickets: cur.bonusTickets + 1 },
      result: true as const,
    }));
  }

  /** 看完结果回 idle */
  function backToIdle() {
    phase.value = "idle";
    lastWonPrizeId.value = null;
  }

  /** 记录中奖历史(组件派奖后调用)。追加型:冲突时重放到别处写完的最新记录上,两边的都留得住。*/
  function pushHistory(prizeId: string) {
    const ts = mockServerNow();
    // persist-verdict-ok: 奖池 / 票数状态更新,失败时内存已回灌磁盘行,用户看到的是磁盘真值;补票 / 中奖入账由收口点另行落盘(残余:票数增量可能丢一次,归活动包)
    rows.commit((cur) => ({
      next: { ...cur, history: [{ prizeId, ts }, ...cur.history].slice(0, 20) },
      result: true as const,
    }));
  }

  // ── mock 演示开关(dev / 用于演示边界态)──
  function setRealPrizeSoldOut(v: boolean) {
    // persist-verdict-ok: 奖池 / 票数状态更新,失败时内存已回灌磁盘行,用户看到的是磁盘真值;补票 / 中奖入账由收口点另行落盘(残余:票数增量可能丢一次,归活动包)
    rows.commit((cur) => ({ next: { ...cur, realPrizeSoldOut: v }, result: true as const }));
  }
  function setCoverageDegraded(v: boolean) {
    // persist-verdict-ok: 奖池 / 票数状态更新,失败时内存已回灌磁盘行,用户看到的是磁盘真值;补票 / 中奖入账由收口点另行落盘(残余:票数增量可能丢一次,归活动包)
    rows.commit((cur) => ({ next: { ...cur, coverageDegraded: v }, result: true as const }));
  }
  /** dev:重置今日免费次数(便于演示)*/
  function resetDailyFree() {
    // persist-verdict-ok: 奖池 / 票数状态更新,失败时内存已回灌磁盘行,用户看到的是磁盘真值;补票 / 中奖入账由收口点另行落盘(残余:票数增量可能丢一次,归活动包)
    rows.commit((cur) => ({ next: { ...cur, lastFreeSpinDate: "" }, result: true as const }));
  }

  return {
    open,
    phase,
    bonusTickets,
    lastFreeSpinDate,
    lastWonPrizeId,
    wheelAngle,
    history,
    realPrizeSoldOut,
    coverageDegraded,
    remoteSegments,
    remoteHistory,
    hasFreeSpinToday,
    availableSpins,
    nextResetAtUtc,
    realPrizeActive,
    openSheet,
    closeSheet,
    grantBonusTicket,
    startConfirm,
    cancelConfirm,
    spin,
    spinRemote,
    refreshRemoteState,
    reveal,
    refundAndReset,
    backToIdle,
    pushHistory,
    setRealPrizeSoldOut,
    setCoverageDegraded,
    resetDailyFree,
    bindAccount,
  };
});
