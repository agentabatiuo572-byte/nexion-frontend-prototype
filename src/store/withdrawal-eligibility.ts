import { normalizeAccountKey } from "@/store/account-cloud";
import { mockServerNow } from "@/store/server-time";
import { useConfig } from "@/store/config";
import { evaluateAccountCluster } from "@/store/risk-cluster";
import {
  getRiskRecord,
  listRiskRecords,
  markWithdrawn,
  recordWithdrawAddressUse,
  withdrawAddressHash,
} from "@/store/risk-identity";
import type { Withdrawal } from "@/store/types";
import type { WithdrawalRiskRoute } from "@/store/config-types";
import { decideFromStores, isDailyLimitReached, nextDayResetAt } from "@/store/withdrawal-eligibility-core";
import { usePayoutAddress } from "@/store/payout-address";
import { remoteApiEnabled, withdrawalApi } from "@/api/runtime";
import {
  fromWithdrawNetwork,
  NEW_ADDRESS_AGE_DAYS,
  NEW_ADDRESS_LARGE_AMOUNT_USDT,
} from "@/store/payout-address-core";

// SPEC-7 提现前置风控(mock K3,推倒重写版)。
//
// 六输入(FEAT-RISK03 + 整改 R2/R5 + PAY04 异常4):
//   1. 账户当前簇状态(R5: 每次评估现算,禁用注册缓存)
//   2. 同提现地址跨账户复用(强信号 → withdrawRules.sameAddressRoute)
//   3. 首次提现标记(R2 冷启动保守: firstWithdrawalManual 时无条件 manual)
//   4. 提现地址新绑定期(R2: 首见未满 newAddressHoldHours → delay)
//   5. mock K4 分(簇评估附带;达冻结建议线 → manual 升级)
//   6. 换绑地址账龄(PAY04 异常4: 绑定 verifiedAt 起账龄 < 7 天且请求金额
//      ≥ $1,000 → 强制 manual;对齐 K3「新地址持有期」既有输入,不新造维度)
// 路由优先级: reject > freeze > manual > delay > pass;reject 不建单不扣款,
// freeze/manual/delay 建单进对应队列(资金占用),由服务端/人工推进。
//
// PROD: 整个模块被 K3 服务端评估替换;client 只消费 WithdrawalEligibility。

export interface WithdrawalEligibility {
  canSubmit: boolean;
  maxWithdrawableUsdt: number;
  route: WithdrawalRiskRoute;
  /** 稳定 reason code(页面渲染时映射 i18n,禁直出工程码)。 */
  riskReasons: string[];
  /** FEAT-WD01a:本次是否命中小额免审快车道。 */
  fastLaneApplied: boolean;
  /** FEAT-WD01a:被快车道免掉的闸名(本会命中但因小额而未生效的);未命中时为空数组。 */
  waivedGates: string[];
  /** FEAT-WD01b:今日笔数是否已用完 */
  dailyLimitReached: boolean;
  /** FEAT-WD01b:下次可提时间(明日 0 点),用于文案插值 */
  dailyCountResetAt: number;
  configVersion: string;
}

// ROUTE_SEVERITY / worse() 已迁到 withdrawal-eligibility-core.ts —— 判定逻辑单源在那边,
// 这里留副本会让人以为改这里就能改行为(实际改了没用),故删净不留。

/**
 * FEAT-WD01b 日限判定所需的两件事实,一律由调用方从**权威源**取好传进来
 * (本模块不自己去摸,免得又长出第二份口径 —— 这正是 z1 审计 P0-1 的根因族)。
 *
 * 🔴 limitCount 只许来自服务端 `GET /api/withdrawals/policy`。本地
 * `config.withdrawRules` 的远端同步不覆盖 withdrawRules,取它等于按前端写死值拦人。
 * 🔴 withdrawals 直接给 `app.withdrawals` 原件 —— 今日笔数由 core 现算,
 * 这里不许 filter / length,外壳一个表达式都不留。
 */
export interface WithdrawalDailyFacts {
  limitCount: number;
  withdrawals: ReadonlyArray<{ submittedAt: number }>;
}

export function evaluateWithdrawal(
  accountKey: string,
  network: Withdrawal["network"],
  address: string,
  withdrawableUsdt: number,
  daily: WithdrawalDailyFacts,
  requestedUsdt?: number,
): WithdrawalEligibility {
  // 本函数只做一件事:**从各 store 把事实取齐**,然后交给纯函数判定。
  // 判定逻辑一行都不在这里 —— 见 withdrawal-eligibility-core.ts 的 decideWithdrawalRoute。
  // 这样拆的原因(2026-07-31 熔断结论):判定是纯函数才能被行为测试直接跑,
  // 而「小额免审不得越过风控」是行为约束,只有行为测试守得住(源码结构哨兵被连续攻破四种绕法)。
  const cfg = useConfig().config;
  const rules = cfg.withdrawRules;
  const key = normalizeAccountKey(accountKey);

  // 🔴 本段**只许转发 store 原始对象**,不许有任何表达式(判空 / 三元 / 查找 / 遍历都不行)。
  // 第 4 轮复验实证:外壳只要还留着表达式,原攻击就能一字不改地搬过来
  // (S4 = 原 Bypass C 搬到外壳,五个外壳注入全绿全是真免闸)。
  // 取字段、判空、找元素、跨账户比对全在 core 的 toRawFacts 里 —— 那边行为哨兵覆盖得到。
  const cluster = evaluateAccountCluster(key);
  const decision = decideFromStores({
    now: mockServerNow(),
    // binding = 该网络当前提现地址的快照({freezeUntil, verifiedAt})。取数加工在
    // payout-address-core.eligibilityBindingFor(selfcheck-rebind 行为覆盖),这里仍只转发。
    binding: usePayoutAddress().bindingFor(fromWithdrawNetwork(network)),
    ownRecord: getRiskRecord(key),
    allRecords: listRiskRecords(),
    accountKey: key,
    addressHash: withdrawAddressHash(network, address.trim()),
    address,
    cluster,
    freezeSuggestThreshold: cfg.riskCluster.clusterFreezeSuggestThreshold,
    newAddressHoldHours: rules.newAddressHoldHours,
    newAddressAgeDays: NEW_ADDRESS_AGE_DAYS,
    largeAmountUsdt: NEW_ADDRESS_LARGE_AMOUNT_USDT,
    requestedUsdt,
    withdrawableUsdt,
    smallAmountThresholdUsd: rules.smallAmountThresholdUsd,
    minWithdrawableUsdt: rules.minWithdrawableUsdt,
    sameAddressRoute: rules.sameAddressRoute,
    firstWithdrawalManual: rules.firstWithdrawalManual,
    withdrawals: daily.withdrawals,
    dailyWithdrawLimitCount: daily.limitCount,
  });

  return {
    canSubmit: decision.canSubmit,
    maxWithdrawableUsdt: withdrawableUsdt,
    route: decision.route,
    riskReasons: decision.riskReasons,
    // FEAT-WD01a:是否走了小额快车道 + 被免掉的闸名(审计与客服解释用)。
    // PROD:server 权威回传,client 仅 UI cache。
    fastLaneApplied: decision.fastLaneApplied,
    waivedGates: decision.waivedGates,
    dailyLimitReached: decision.dailyLimitReached,
    dailyCountResetAt: nextDayResetAt(mockServerNow()),
    configVersion: `wr:${rules.minWithdrawableUsdt}/${rules.sameAddressRoute}/${rules.firstWithdrawalManual ? "first-manual" : "first-open"}/${rules.newAddressHoldHours}h/fl:${rules.smallAmountThresholdUsd} · ${cluster.configVersion}`,
  };
}

/**
 * FEAT-WD01b:今日额度状态。追踪页「再提一笔」判置灰用。
 * 本段同样只转发,判据在 core 的 isDailyLimitReached —— 与提现页那条置灰同一对函数,
 * 两页才不会一个说能提一个说不能提。
 */
export function dailyLimitStatus(daily: WithdrawalDailyFacts): { reached: boolean; resetAt: number } {
  const now = mockServerNow();
  return {
    reached: isDailyLimitReached(daily.withdrawals, daily.limitCount, now),
    resetAt: nextDayResetAt(now),
  };
}

/** 提现单创建成功后登记地址使用 + 首提标记(K1 回溯聚簇的强维输入)。 */
export function commitWithdrawal(accountKey: string, network: Withdrawal["network"], address: string): void {
  recordWithdrawAddressUse(accountKey, network, address);
  markWithdrawn(accountKey);
  // 🔴 每日笔数**不在这里** +1,以后也别加回来:今日笔数由 core 从提现单列表现算
  // (countWithdrawalsOnPlatformDay),提交成功那一刻单据已经进列表,不需要第二份状态。
  // 沿革:曾在这里事后 +1(独立验收 3 轮 3 中复现并发绕过)→ 改成建单前占额度 →
  // c37e642 让渡服务端事务后占额度调用被删,计数器从此无人递增、预检恒不触发
  // (z1 审计 P0-1)。凡是「再存一个计数」的修法都会重蹈同一条路。
}

// ── 提交时点的服务端评估形态(⑤ 加载态 + 异常3 超时)────────────────────
// PROD: POST /api/withdrawals/eligibility → 服务端 K3 评估;client 只消费。
// 显示层可用同步 evaluateWithdrawal 做预览,但「提交」必须走本异步形态,
// 超时不乐观扣款(reject 由调用方 catch 后提示重试)。
let devEligibilityTimeout = false;

/** ⚠️ DEV/DEMO-ONLY: 模拟 K3 评估超时(FEAT-RISK03 异常3)。 */
export function _devSetEligibilityTimeout(value: boolean): void {
  if (import.meta.env.PROD) return; // 提现前置评估入口,store 层二层 guard(硬规则5)
  devEligibilityTimeout = value;
}

export function requestWithdrawalEligibility(
  accountKey: string,
  network: Withdrawal["network"],
  address: string,
  withdrawableUsdt: number,
  daily: WithdrawalDailyFacts,
  requestedUsdt?: number,
): Promise<WithdrawalEligibility> {
  if (remoteApiEnabled) {
    return withdrawalApi.eligibility({
      amount: requestedUsdt ?? 0,
      chain: network,
      address,
    }).then((snapshot) => ({
      canSubmit: snapshot.canSubmit,
      maxWithdrawableUsdt: snapshot.maxWithdrawableUsdt,
      route: snapshot.route,
      riskReasons: snapshot.riskReasons,
      fastLaneApplied: snapshot.fastLaneApplied,
      waivedGates: snapshot.waivedGates,
      dailyLimitReached: snapshot.dailyLimitReached,
      dailyCountResetAt: snapshot.dailyCountResetAt,
      configVersion: snapshot.configVersion,
    }));
  }
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (devEligibilityTimeout) {
        reject(new Error("risk-check-timeout"));
        return;
      }
      resolve(evaluateWithdrawal(accountKey, network, address, withdrawableUsdt, daily, requestedUsdt));
    }, 600);
  });
}
