import type { WithdrawalRiskRoute } from "./config-types";

// 提现风控路由**纯逻辑**(SPEC-7 K3 + FEAT-WD01a 小额免审)。
// 零依赖(vue / pinia / uni / 其它 store 均不引),与 fx-core / deposits-core /
// payout-address-core 同一分层惯例:core = 判定,store = 取数接线。
//
// 🔴 为什么必须抽出来(2026-07-31 熔断后的结论):
// 「小额免审只免两道冷启动闸、永不越过风控裁决」是一条**行为**约束。
// 早先用源码结构哨兵(检查代码长什么样)去守它,被独立验收连续攻破四种绕法 ——
// 其中「把闸的升级动作搬进免审块」这种改法,所有被 pin 的文本一字未动而风控闸真被免掉。
// 词法检查永远覆盖不了控制流可达性;唯一守得住的是**直接测行为**。
// 抽成纯函数后,scripts/selfcheck-fastlane.mjs 可以真跑各种组合断言路由结果,
// 任何绕法只要改变了行为就会被抓到 —— 而不改变行为的"绕法"本就不是漏洞。

const ROUTE_SEVERITY: Record<WithdrawalRiskRoute, number> = {
  pass: 0,
  delay: 1,
  manual: 2,
  freeze: 3,
  reject: 4,
};

/**
 * 🔴 未知路由值一律按 **manual** 计,不能当「不存在」。
 *
 * 原写法 `ROUTE_SEVERITY[b] > ROUTE_SEVERITY[a]` 在 b 取不到时是 `undefined > n` = false,
 * 于是整道闸静默放行(fail-open)。而 withdrawRules 在 PROD 来自 `GET /api/config/platform`,
 * 是不可信边界 —— 后台下发个大小写不同 / 带空格 / 改名的枚举,共用地址闸就没了,
 * 钱按 pass 建单自动出账,而 riskReasons 里还记着 shared-address(信号命中却什么都没发生)。
 * 坏配置的正确方向是**转人工**,不是放行。
 */
/**
 * 🔴 归一化**值本身**,不是只改比较权重。
 * 上一版只在比大小时兜底,worseRoute 仍把脏值原样返回 —— 而下游全是
 * `=== "reject"` / `=== "freeze"` 这类等值判断,一个都不命中:
 * 钱照扣、单据落进 pass 车道、到账推进又因路由不是 pass 而永不推进 = 钱卡死。
 * 对抗证伪实测:修前是静默放行,那一版更糟。坏配置的正确落点是**真的变成 manual**。
 */
function normalizeRoute(r: WithdrawalRiskRoute): WithdrawalRiskRoute {
  return r in ROUTE_SEVERITY ? r : "manual";
}

export function worseRoute(a: WithdrawalRiskRoute, b: WithdrawalRiskRoute): WithdrawalRiskRoute {
  const x = normalizeRoute(a);
  const y = normalizeRoute(b);
  return ROUTE_SEVERITY[y] > ROUTE_SEVERITY[x] ? y : x;
}

/**
 * 数值型风控参数的边界兜底:非法值回落到**保守**默认,不是回落到「关闸」。
 * 与网络费三件套的 feeConfigValid 同一原则(在信任边界校验外部数据)。
 */
export function safeNumber(v: number, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 判定所需的全部外部事实。调用方(store)负责从各 store 取齐后传入。 */
export interface WithdrawalRiskInput {
  /** 换绑后 24h 冻结窗内 */
  rebindFrozen: boolean;
  /** 账户所在风险簇状态 */
  clusterStatus: "clear" | "watch" | "flagged" | "frozen" | "released";
  /** 风险分(0–1) */
  clusterScore: number;
  /** 风险分达此线即人工 */
  freezeSuggestThreshold: number;
  /** 提现地址是否被别的账户用过 */
  addressReusedByOther: boolean;
  /** 地址为空/未填时为 true —— 地址相关两道闸整体跳过 */
  addressBlank: boolean;
  /** 提现地址首见未满 hold 时长(含"从未见过") */
  newAddressWithinHold: boolean;
  /** 该账户此前是否提现过 */
  hasWithdrawn: boolean;
  /** 绑定账龄未满 7 天 且 金额达大额线 */
  youngBindingLargeAmount: boolean;
  /** 用户请求金额;undefined = 还没输 */
  requestedUsdt: number | undefined;
  /** 当前可提余额 */
  withdrawableUsdt: number;
  // ── 配置(后台 D5 可配)──
  smallAmountThresholdUsd: number;
  minWithdrawableUsdt: number;
  sameAddressRoute: WithdrawalRiskRoute;
  firstWithdrawalManual: boolean;
  /** FEAT-WD01b:今日已提笔数 */
  todayWithdrawCount: number;
  /** FEAT-WD01b:每日笔数上限 */
  dailyWithdrawLimitCount: number;
}

export interface WithdrawalRiskDecision {
  route: WithdrawalRiskRoute;
  riskReasons: string[];
  fastLaneApplied: boolean;
  waivedGates: string[];
  canSubmit: boolean;
  /** FEAT-WD01b:是否因今日笔数用完而被拦(用于文案与下次可提时间) */
  dailyLimitReached: boolean;
}

/**
 * 外壳从各 store 拿到的**原始事实**。与 WithdrawalRiskInput 的区别:
 * 这里是"没加工过的",入参是"加工后的判定事实"。
 *
 * 🔴 为什么连取数也要抽出来(2026-07-31 第 3 轮复验结论):
 * 只把判定抽成纯函数时,缝隙**搬到了入参边界** —— 外壳可以对纯函数撒谎
 * (恒传 addressReusedByOther:false / rebindFrozen:false,或只在小额时隐瞒共用地址),
 * 判定逻辑再对也没用,而只测判定的哨兵完全看不见。独立验收实测 5 种撒谎注入全绿,
 * 其中 4 种端到端证明是真免闸(含换绑冻结期直接可提)。
 * 把"原始事实 → 判定事实"这一步也变成纯函数后,外壳只剩「调 store 拿值」这一件事,
 * 没有可藏逻辑的地方,行为哨兵也能覆盖到这一层。
 */
export interface WithdrawalRawFacts {
  now: number;
  freezeUntil: number | undefined;
  clusterStatus: WithdrawalRiskInput["clusterStatus"];
  clusterScore: number;
  freezeSuggestThreshold: number;
  /** 地址原文(未 trim) */
  address: string;
  /** 该地址是否被别的账户登记过 */
  addressSeenByOtherAccount: boolean;
  /** 本账户该地址的首见时间;undefined = 从未见过 */
  ownAddressFirstSeenAt: number | undefined;
  newAddressHoldHours: number;
  hasWithdrawn: boolean;
  /** 当前绑定的生效时间 */
  bindingVerifiedAt: number | undefined;
  newAddressAgeDays: number;
  largeAmountUsdt: number;
  requestedUsdt: number | undefined;
  withdrawableUsdt: number;
  smallAmountThresholdUsd: number;
  minWithdrawableUsdt: number;
  sameAddressRoute: WithdrawalRiskRoute;
  firstWithdrawalManual: boolean;
  todayWithdrawCount: number;
  dailyWithdrawLimitCount: number;
}

/** 原始事实 → 判定事实。纯函数,外壳不得在此之外自行加工。 */
export function toRiskInput(f: WithdrawalRawFacts): WithdrawalRiskInput {
  const addressBlank = f.address.trim().length === 0;
  return {
    rebindFrozen: f.freezeUntil !== undefined && f.now < f.freezeUntil,
    clusterStatus: f.clusterStatus,
    clusterScore: f.clusterScore,
    freezeSuggestThreshold: f.freezeSuggestThreshold,
    addressBlank,
    // 地址为空时两个地址维度一律置 false —— 判定层也有 addressBlank 兜底,双保险。
    addressReusedByOther: addressBlank ? false : f.addressSeenByOtherAccount,
    newAddressWithinHold: addressBlank
      ? false
      : f.ownAddressFirstSeenAt === undefined ||
        f.now - f.ownAddressFirstSeenAt < f.newAddressHoldHours * 3600 * 1000,
    hasWithdrawn: f.hasWithdrawn,
    youngBindingLargeAmount:
      f.requestedUsdt !== undefined &&
      f.bindingVerifiedAt !== undefined &&
      f.now - f.bindingVerifiedAt < f.newAddressAgeDays * 24 * 3600 * 1000 &&
      f.requestedUsdt >= f.largeAmountUsdt,
    requestedUsdt: f.requestedUsdt,
    withdrawableUsdt: f.withdrawableUsdt,
    smallAmountThresholdUsd: f.smallAmountThresholdUsd,
    minWithdrawableUsdt: f.minWithdrawableUsdt,
    sameAddressRoute: f.sameAddressRoute,
    firstWithdrawalManual: f.firstWithdrawalManual,
    todayWithdrawCount: f.todayWithdrawCount,
    dailyWithdrawLimitCount: f.dailyWithdrawLimitCount,
  };
}

/** 端到端:原始事实 → 路由决策。 */
export function decideFromRawFacts(f: WithdrawalRawFacts): WithdrawalRiskDecision {
  return decideWithdrawalRoute(toRiskInput(f));
}

// ── 外壳直传层 ────────────────────────────────────────────────
// 🔴 第 4 轮复验结论:每把逻辑往 core 收一层,**外面那层就变成新攻击面**。
// 独立验收实测 S4 = 原 Bypass C「一字未改搬到外壳」,五个外壳注入全绿且全是真免闸。
// 追着缝隙跑没有尽头,除非外壳里**一个表达式都不剩**。
// 故这里再收一层:外壳只把 store 的**原始对象**丢进来,取字段、判空、找元素、
// 遍历比对全在 core 做。外壳退化成「把几个 store 对象转发过来」,没有可注入的地方。

/** store 原始对象(外壳原样转发,不做任何加工)。 */
export interface WithdrawalStoreSnapshot {
  now: number;
  /** 当前生效的提现地址绑定;未绑定为 undefined */
  binding: { freezeUntil?: number; verifiedAt?: number } | null | undefined;
  /** 本账户的风险档案 */
  ownRecord:
    | { hasWithdrawn?: boolean; withdrawAddresses: Array<{ hash: string; firstSeenAt: number }> }
    | null
    | undefined;
  /** 全部账户的风险档案(用于查地址跨账户复用) */
  allRecords: Array<{ accountKey: string; withdrawAddresses: Array<{ hash: string }> }>;
  accountKey: string;
  /** 本次提现地址的哈希;地址为空时传空串 */
  addressHash: string;
  address: string;
  cluster: { status: WithdrawalRiskInput["clusterStatus"]; score: number };
  freezeSuggestThreshold: number;
  newAddressHoldHours: number;
  newAddressAgeDays: number;
  largeAmountUsdt: number;
  requestedUsdt: number | undefined;
  withdrawableUsdt: number;
  smallAmountThresholdUsd: number;
  minWithdrawableUsdt: number;
  sameAddressRoute: WithdrawalRiskRoute;
  firstWithdrawalManual: boolean;
  /**
   * 本账户的提现单列表(外壳原样转发 app.withdrawals)。今日笔数在 core 现算 ——
   * 单据本身就是「今天提过几笔」的凭据,不另存计数器(见 countWithdrawalsOnPlatformDay)。
   */
  withdrawals: ReadonlyArray<{ submittedAt: number }> | null | undefined;
  /**
   * 🔴 每日笔数上限,**必须**来自服务端 `GET /api/withdrawals/policy` 的 dailyLimitCount ——
   * 也就是提交时真正执行的那把尺子。曾经取本地 config.withdrawRules.dailyWithdrawLimitCount,
   * 而那份配置的远端同步压根不覆盖 withdrawRules(永远是前端写死的 1):
   * 页面文案按服务端的数说「每日最多 3 笔」、预检按本地的 1 拦 —— 用户被自己的 App 挡在门外。
   */
  dailyWithdrawLimitCount: number;
}

/** store 快照 → 原始事实。取字段/判空/查找/遍历都在这里,外壳不许自己做。 */
export function toRawFacts(s: WithdrawalStoreSnapshot): WithdrawalRawFacts {
  // 以**地址原文**判空,不以 hash 判 —— 空串照样能算出一个 hash,拿 hash 判会把
  // 「没填地址」误判成「填了个地址」,两道地址闸就会误触发。
  const hasAddress = s.address.trim().length > 0;
  return {
    now: s.now,
    freezeUntil: s.binding?.freezeUntil,
    clusterStatus: s.cluster.status,
    clusterScore: s.cluster.score,
    freezeSuggestThreshold: s.freezeSuggestThreshold,
    address: s.address,
    addressSeenByOtherAccount: hasAddress
      ? s.allRecords.some(
          (r) => r.accountKey !== s.accountKey && r.withdrawAddresses.some((a) => a.hash === s.addressHash),
        )
      : false,
    ownAddressFirstSeenAt: hasAddress
      ? s.ownRecord?.withdrawAddresses.find((a) => a.hash === s.addressHash)?.firstSeenAt
      : undefined,
    newAddressHoldHours: s.newAddressHoldHours,
    hasWithdrawn: s.ownRecord?.hasWithdrawn ?? false,
    bindingVerifiedAt: s.binding?.verifiedAt,
    newAddressAgeDays: s.newAddressAgeDays,
    largeAmountUsdt: s.largeAmountUsdt,
    requestedUsdt: s.requestedUsdt,
    withdrawableUsdt: s.withdrawableUsdt,
    smallAmountThresholdUsd: s.smallAmountThresholdUsd,
    minWithdrawableUsdt: s.minWithdrawableUsdt,
    sameAddressRoute: s.sameAddressRoute,
    firstWithdrawalManual: s.firstWithdrawalManual,
    todayWithdrawCount: countWithdrawalsOnPlatformDay(s.withdrawals, s.now),
    dailyWithdrawLimitCount: s.dailyWithdrawLimitCount,
  };
}

/** 🔴 外壳唯一该调的入口:store 快照 → 路由决策。全链路都在 core,行为哨兵全覆盖。 */
export function decideFromStores(s: WithdrawalStoreSnapshot): WithdrawalRiskDecision {
  return decideFromRawFacts(toRawFacts(s));
}

// ── FEAT-WD01b 每日提现笔数 ────────────────────────────────
// 🔴 计数与判定从一开始就放纯函数里(第 5 轮教训:留在外壳的逻辑没有哨兵覆盖)。

/**
 * 平台时区偏移(小时)。**越南是权威运营市场**(UTC+7),平台日就按当地自然日切,
 * 「每日一笔」对目标用户才是字面意义上的每日。
 *
 * 🔴 原来写死 UTC 是错的:越南用户的额度在当地早上 7 点重置,中国用户 8 点,
 * 谁的「一天」都不是自己的一天(独立验收 F4 / code review MEDIUM-1 各自实测到)。
 * PROD:服务端按平台时区裁决,client 这份只用于预判与文案。
 */
export const PLATFORM_UTC_OFFSET_HOURS = 7;
const PLATFORM_OFFSET_MS = PLATFORM_UTC_OFFSET_HOURS * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** 平台时区下的自然日序号。 */
export function platformDayIndex(ts: number): number {
  return Math.floor((ts + PLATFORM_OFFSET_MS) / DAY_MS);
}

/** 下一个平台自然日 0 点(UTC 时间戳)。文案按用户本地时钟展示这一刻。 */
export function nextDayResetAt(ts: number): number {
  return (platformDayIndex(ts) + 1) * DAY_MS - PLATFORM_OFFSET_MS;
}

/**
 * 今日已提笔数 —— 从**提现单列表**现算,不另存计数器。
 *
 * 🔴 为什么是单据而不是计数器(2026-08-11,z1 审计 P0-1 的修法):
 * 早先在 localStorage 存「日序 + 计数」,由建单前的 claimWithdrawSlot 递增。
 * c37e642 把建单整体让渡服务端事务后,那个递增点随本地扣款链一起删掉了 ——
 * 计数器从此无人递增,读出来恒空,预检恒不触发,而页面还在承诺「每日最多 N 笔」。
 * 单据列表本身就是「今天提过几笔」的凭据:每笔成功提交恰好落一行(带服务端单号)、
 * 随账号快照持久、按账号隔离、就是追踪页渲染的那份数据。**没有第二份状态就不会失配。**
 *
 * 🔴 已驳回 / 已退款 / 上链失败的单据**仍然计数**(主人 2026-08-11 确认维持原规则):
 * 「每日最多 N 笔」的 N 数的是**发起次数**,不是成功次数。
 *
 * 🔴 并发面不再由客户端兜底:两个标签页可能都预检通过而各自提交,
 * 由服务端事务拒掉第二笔。这是正确的分工 —— 客户端预检只为省一次白跑,
 * 真闸永远在服务端(PROD 亦然)。此前的 CAS + 令牌 + 回读那套是在解
 * 「客户端必须在建单前原子占用一格」,而建单权已经不在客户端了。
 *
 * 列表来自持久化存储(不可信边界):不是数组就当空 —— 那一步会真的抛异常
 * (for...of 一个 {length:n} 对象),把整页判定带崩,所以必须显式挡。
 */
export function countWithdrawalsOnPlatformDay(
  rows: ReadonlyArray<{ submittedAt: number }> | null | undefined,
  now: number,
): number {
  if (!Array.isArray(rows)) return 0;
  const today = platformDayIndex(now);
  let count = 0;
  // 🔴 判据是**严格相等**,坏行因此天然出局:submittedAt 缺失 / NaN / Infinity /
  // 字符串 / Date 对象算出来的日序都不等于今天。这里刻意**不写** typeof / isFinite 消毒 ——
  // 红测两次实证:加或不加,没有任何输入能让断言变化(字符串走的是字符串拼接,
  // 算出的日序离今天十万八千里,与被跳过同样得 0)。红测证明不了的防御 = 死代码。
  //
  // ⚠️ 两个代价写在这,改之前先看:
  //  1. 把 === 放宽成 >= / <=,Infinity 会被算进今日额度、把用户当天锁死;
  //  2. 后端若下发**字符串 / ISO 时间戳**,整张列表会静默计 0、日限再次失效 ——
  //     与本包修的缺陷同型同样无声。那不是这里加消毒能救的(消毒的结果同样是 0),
  //     得在契约层解决:见 HANDOFF U-7。
  for (const row of rows) {
    if (platformDayIndex(row?.submittedAt) === today) count++;
  }
  return count;
}

export interface WithdrawalLimitFactsInput {
  perWithdrawalMaximum: number;
  dailyLimitCount: number;
  withdrawals: ReadonlyArray<{ submittedAt: number }> | null | undefined;
  now: number;
}

export interface WithdrawalLimitFacts {
  perWithdrawalMaximum: number;
  dailyLimitConfigured: boolean;
  dailyUsedCount: number;
  dailyRemainingCount: number | null;
  /** The current server policy has no monetary daily-cap field. */
  dailyAmountLimitConfigured: false;
}

/**
 * Presentation facts derived from the same daily counter used by the submit
 * gate. A per-request maximum and a daily count allowance stay separate.
 */
export function withdrawalLimitFacts(input: WithdrawalLimitFactsInput): WithdrawalLimitFacts {
  const perWithdrawalMaximum = Number.isFinite(input.perWithdrawalMaximum)
    ? Math.max(0, input.perWithdrawalMaximum)
    : 0;
  const dailyUsedCount = countWithdrawalsOnPlatformDay(input.withdrawals, input.now);
  const dailyLimitConfigured = Number.isFinite(input.dailyLimitCount) && input.dailyLimitCount > 0;
  return {
    perWithdrawalMaximum,
    dailyLimitConfigured,
    dailyUsedCount,
    dailyRemainingCount: dailyLimitConfigured
      ? Math.max(0, input.dailyLimitCount - dailyUsedCount)
      : null,
    dailyAmountLimitConfigured: false,
  };
}

/**
 * 🔴 「今日额度用满没有」的**唯一**判据。上限 ≤0 / 非法(含被下发成字符串)= 运营未配置
 * → 不限制(坏配置不该把提现锁死),但计数照记。
 *
 * 抽成共用谓词是因为它曾有两份实现:一份用 Number.isFinite 严判、一份靠隐式转换,
 * 配置被下发成字符串 "2" 时两份结论**相反** —— 真闸判「不限制」而 UI 判「已达上限」,
 * 追踪页说能提、提现页说不能提。判据只许有一份。
 */
export function isOverDailyCap(used: number, limitCount: number): boolean {
  const capped = Number.isFinite(limitCount) && limitCount > 0;
  return capped && used >= limitCount;
}

/**
 * 今日额度是否已用完。给「再提一笔」这类按钮判置灰用。
 * 与 decideWithdrawalRoute 里那句 dailyLimitReached 走同一对函数
 * (countWithdrawalsOnPlatformDay + isOverDailyCap),不另写一套 —— 两套判据迟早对不上。
 */
export function isDailyLimitReached(
  rows: ReadonlyArray<{ submittedAt: number }> | null | undefined,
  limitCount: number,
  now: number,
): boolean {
  return isOverDailyCap(countWithdrawalsOnPlatformDay(rows, now), limitCount);
}

/**
 * 小额免审是否生效。
 * 阈值 0 = 运营关闭快车道;金额未输入(undefined)或非正数不启用 ——
 * 否则"还没输金额"会被当成 0 ≤ 阈值而误判成小额。
 */
export function isFastLane(requestedUsdt: number | undefined, thresholdUsd: number): boolean {
  if (!(thresholdUsd > 0)) return false;
  if (requestedUsdt === undefined || !(requestedUsdt > 0)) return false;
  return requestedUsdt <= thresholdUsd;
}

/**
 * 提现风控路由判定。
 *
 * 🔴 免审只作用于两道**冷启动保守闸**:首提必审 / 新地址 hold。
 * 风控闸(换绑冻结 · 冻结簇 · 标记簇 · 风险分 · 共用地址 · 大额账龄)**恒不受影响**。
 * 这条由 selfcheck-fastlane 的行为断言守:每道风控闸都有「免审为真时仍照常拦」的固定靶。
 */
export function decideWithdrawalRoute(input: WithdrawalRiskInput): WithdrawalRiskDecision {
  const reasons: string[] = [];
  const waivedGates: string[] = [];
  let route: WithdrawalRiskRoute = "pass";

  const fastLane = isFastLane(input.requestedUsdt, input.smallAmountThresholdUsd);

  // ── 风控闸(免审一律不参与)────────────────────────────────
  if (input.rebindFrozen) {
    route = worseRoute(route, "freeze");
    reasons.push("rebind-freeze");
  }
  if (input.clusterStatus === "frozen") {
    route = worseRoute(route, "freeze");
    reasons.push("frozen-cluster");
  } else if (input.clusterStatus === "flagged") {
    route = worseRoute(route, "manual");
    reasons.push("flagged-cluster");
  }
  if (input.clusterScore >= input.freezeSuggestThreshold) {
    route = worseRoute(route, "manual");
    reasons.push("high-risk-score");
  }
  if (!input.addressBlank && input.addressReusedByOther) {
    route = worseRoute(route, normalizeRoute(input.sameAddressRoute));
    reasons.push("shared-address");
  }
  if (input.youngBindingLargeAmount) {
    route = worseRoute(route, "manual");
    reasons.push("new-address-large-amount");
  }

  // ── 冷启动保守闸(小额免审只免这两道)──────────────────────
  if (!input.addressBlank && input.newAddressWithinHold) {
    if (fastLane) {
      waivedGates.push("new-address-hold");
    } else {
      route = worseRoute(route, "delay");
      reasons.push("new-address-hold");
    }
  }
  if (input.firstWithdrawalManual && !input.hasWithdrawn) {
    if (fastLane) {
      waivedGates.push("first-withdrawal-review");
    } else {
      route = worseRoute(route, "manual");
      reasons.push("first-withdrawal-review");
    }
  }

  // 🔴 FEAT-WD01b 每日笔数上限:达上限即**不建单不扣款**(与换绑冻结同档,
  // 区别于 manual/delay 那种"建单进队列、资金被占用"的路由)。
  // 上限 ≤ 0 视为未配置 → 不限制(避免坏配置把提现整个锁死)。
  // 判据只此一份:isOverDailyCap(追踪页的 isDailyLimitReached 也走它)。
  // 曾有第二份就地实现,配置被下发成字符串 "2" 时两份结论相反 ——
  // 真闸判「不限制」而 UI 判「已达上限」,追踪页说能提、提现页说不能提。
  const dailyLimitReached = isOverDailyCap(input.todayWithdrawCount, input.dailyWithdrawLimitCount);

  return {
    route,
    riskReasons: reasons,
    fastLaneApplied: fastLane,
    waivedGates,
    dailyLimitReached,
    canSubmit:
      route !== "reject" &&
      !input.rebindFrozen &&
      !dailyLimitReached &&
      input.withdrawableUsdt >= input.minWithdrawableUsdt,
  };
}
