import { ApiError, isIdempotencyConflict, isSettledRejection } from "@/api/errors";

/**
 * 🔴🔴 提现提交失败的**唯一**判决处 —— 页面与机器门共用这一份,不许各写一份。
 *
 * 为什么必须抽出来(2026-08-12 第四轮独立审计的结论,实测出来的):
 * 上一版把规则写在页面的 catch 里,门在自己内部**重新推导了一遍**。于是门与实现分叉时
 * 门看不见 —— 实测三个必然出事的变异(「结果未知也退役键」「日限重放也退役」
 * 「地区拒单无条件退役」)让门 32/32 全绿。其中第一个正是这整套机制存在的唯一理由所要防的 bug。
 * 两个真理源 = 门给的是假保证。
 *
 * ── 判决的两个问题,顺序不能反 ──
 * ① **要判的是哪一次?** 首次提交问「这一次」,重放问「**上一次**那笔落库了没有」。
 *    401 鉴权、429 限流、地区策略都是**边缘层**拒绝,排在服务端幂等查询之前,
 *    对「上一次」零信息量 —— 拿它们退役键 ⇒ 下次新键 ⇒ 服务端出第二笔。
 * ② **这一次定局了没有?** 由 `isSettledRejection` 回答(单一真理源在 api/errors.ts)。
 */
export type AttemptFate = "retire" | "keep";

export type TriageKind =
  | "daily-limit"        // 今日笔数已达上限
  | "already-on-file"    // 409:服务端已有该幂等键的记录
  | "geo"                // 地区策略拒绝(有专属话术)
  | "business"           // 服务端完整应答的业务拒绝
  | "declined"           // 其它定局拒绝
  | "resend-declined"    // 重放被拒,但先前那笔状态仍未知
  | "unknown";           // 结果未知:请求可能已落库

export interface TriageInput {
  /** 本次提交是否在重放一笔已落盘的未收口尝试 */
  isReplay: boolean;
  /** 服务端应答是否可识别为「今日笔数已满」。判据在页面(要读 i18n / 服务端文案) */
  isDailyLimit: boolean;
  /** 是否可识别为地区策略拒绝。同上,判据在页面 */
  isGeo: boolean;
}

export interface TriageDecision {
  /** 幂等键的去留。🔴 这是本文件唯一真正涉钱的输出 */
  fate: AttemptFate;
  /** 页面据此选文案 */
  kind: TriageKind;
  /**
   * 是否重新拉取费率策略。
   * 🔴 只在**非重放的定局拒绝**上为 true:刷了 policyVersion 就变,
   * 而重放的请求体里冻着旧的 policyVersion —— 刷完再重放就是「同 key 异 body」→ 409 + 安全事件。
   */
  refreshPolicy: boolean;
}

export function triageWithdrawFailure(err: unknown, ctx: TriageInput): TriageDecision {
  const { isReplay, isDailyLimit, isGeo } = ctx;

  // ① 日限:排在最前,因为它比下面任何一档都具体。
  //
  // 🔴 首次提交**退役键**,且**不再叠加 `isSettledRejection` 那个合取项**。
  // 上一版写的是 `!isReplay && isSettledRejection(err)` —— 独立审计实测证明它**恒假**:
  // 日限拒单的真实线型是 HTTP 429(页面注释自陈实测),而 429 被**故意**放进 UNSETTLED_4XX
  // (网关限流时上游可能已转发过一次)⇒ `isSettledRejection(429) === false`。
  // 于是那一档在它唯一的现实输入上永不退役 —— 首提撞日限即把账号锁进重放模式,
  // 而重放每次又撞同一个日限,闭环。「加一个恒假的合取项」不是收敛,是把路堵死。
  //
  // 🔴 线型守卫(2026-08-13 第五轮审计后加,消掉上一版的另一侧风险):`isDailyLimit` 是对 `err.message` 的子串匹配,而 api-client 对**任何非 2xx**
  // (含 500 / 502 / 504)都把服务端 envelope 的 message 原样透传。实测:
  //   `500 + "DAILY_LIMIT_CHECK_FAILED"` / `504 + "WITHDRAW_LIMIT_EXCEEDED_UPSTREAM"` → 都会命中。
  // 若不加这道守卫,「首提已建单 → 下游 5xx,文案里带上限额规则名」会被判成日限拒单并**退役键**,
  // 用户按提示重提 = 新键 = **第二笔**。上一版为了躲这个风险加的是 `isSettledRejection`,
  // 那个在 429 上恒假(429 被故意归为歧义),等于把整档判死 —— 见 docs/PORT-PITFALLS.md P-092。
  //
  // 这里换成**非空**的线型判据:日限拒单必然是「服务端回话了的 4xx / 业务拒绝」。
  // 429 通得过(现实中日限就走 429),5xx / 断网 / 读不懂一律不认。
  const serverRefusal = err instanceof ApiError
    && (err.kind === "business"
      || (err.kind === "http" && typeof err.status === "number" && err.status >= 400 && err.status < 500));
  if (isDailyLimit && serverRefusal) {
    return { fate: isReplay ? "keep" : "retire", kind: "daily-limit", refreshPolicy: false };
  }
  // 认得出日限文案、但线型不对(5xx 等)→ 不当日限,落回下面的通用判定(结果未知 ⇒ 保留键)。

  // ② 409 —— 重放路径上**唯一**成立的定局:服务端明确说「这个键我这儿已有记录」。
  if (isIdempotencyConflict(err)) {
    return { fate: "retire", kind: "already-on-file", refreshPolicy: false };
  }

  // ③ 服务端完整应答并拒绝 —— **仅在首次提交时**才等于「没建单」。
  if (isSettledRejection(err)) {
    if (isReplay) {
      // 🔴 重放时连地区拒单也走这一支:本次被拒 ≠ 先前那笔没成功,
      // 用首提的地区话术会让用户以为「那就是没成功」,转头去开新的一笔。
      return { fate: "keep", kind: "resend-declined", refreshPolicy: false };
    }
    if (isGeo) return { fate: "retire", kind: "geo", refreshPolicy: false };
    if (isBusiness(err)) return { fate: "retire", kind: "business", refreshPolicy: false };
    return { fate: "retire", kind: "declined", refreshPolicy: true };
  }

  // ④ 结果未知:请求**可能已经落库**。键与 body 原样留着,下次原样重放。
  return { fate: "keep", kind: "unknown", refreshPolicy: false };
}

function isBusiness(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { kind?: unknown }).kind === "business";
}
