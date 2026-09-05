export type ApiErrorKind = "auth" | "business" | "http" | "network" | "protocol" | "configuration";

interface ApiErrorOptions {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  code?: number;
  retryable?: boolean;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: number;
  readonly retryable: boolean;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE", retryable: true });
}

/**
 * 4xx 里**不能**当作「服务端已定局拒绝」的几个:语义都是「我可能已经收到了」。
 * 408 请求超时(服务端中途放弃,写入可能已落) · 409 幂等键冲突(记录已存在) ·
 * 425 太早(重放保护) · 429 限流(网关层拦下,但上游可能已转发过一次)。
 */
const UNSETTLED_4XX = new Set([408, 409, 425, 429]);

/**
 * 🔴🔴 这次失败**有没有可能服务端已经把请求处理了**(歧义结局)。
 *
 * 用途:决定「重试时要不要复用同一把幂等键」。歧义 → 必须复用(重试才会命中服务端去重);
 * 确定 → 作废,下一次是新的一笔意图。**判错的代价是重复出账**,所以未知一律算歧义。
 *
 * 放在这里而不是页面里的两个理由:① 它问的是「这个错误意味着什么」,是接口层的知识;
 * ② 放页面里就只能用字符串匹配当门,而这条判断的每一格都需要拿**真的 ApiError** 去验
 * (`scripts/selfcheck-withdraw-failpaths.mjs` 现在就这么测)。
 *
 * 边界不是推出来的,是用本地假后端(`scripts/dev-stub-backend.mjs` 的 `createdThen504` 档:
 * 先建单、再让网关超时)端到端实测出来的:客户端拿到 `kind:"http" status:504`,
 * 若判成「确定」→ 换新键重试 → **服务端真的出第二笔**(台账 orderCount 2)。
 * 修正后同一实验 orderCount 恒为 1。
 *
 *  · network —— 连接断/超时,请求可能已到达并被处理 → 歧义
 *  · protocol —— 响应**已经回来**只是读不懂(未知状态值 / 坏时间戳),服务端多半已处理 → 歧义
 *  · http 5xx —— 服务端已收到,处理中出错或超时 → 歧义
 *  · http 4xx —— 一般是「请求被拒绝而非被处理」→ 确定;但 UNSETTLED_4XX 里那几个例外 → 歧义
 *  · business / auth —— 服务端明确应答并拒绝 → 确定
 *  · configuration —— 归歧义(理由见下方 case,不是「它可能已发出」而是「这个前提没门看得住」)
 */
export function isAmbiguousOutcome(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true; // 不认识的错一律当歧义,保守方向是不重复出账
  switch (error.kind) {
    case "business":
    case "auth":
      // 本仓三条 auth 路径都确定没建单:① 发请求前刷新会话失败(请求根本没发出);
      // ② 这次 POST 被服务端明确判 401;③ 会话在请求中变更,是在 ② 之后才做的客户端观察。
      return false;
    case "configuration":
      // 🔴 归**歧义**,尽管今天它只在「mock 模式下拒绝外呼」一处抛、请求确实没发出去。
      // 2026-08-12 两条支线在这一格上判得正相反,各自还写了测试钉死。裁决理由:
      // `kind` 是**开放分类** —— 今天 configuration 全部抛在请求发出之前,这是个**没有任何门
      // 看得住的前提**。日后谁在响应处理里抛一个 configuration(比如解析配置化的回执映射失败),
      // 「配置错 = 确定没建单」就静默变成重复出账,而所有静态门照样全绿。
      // 保守一侧的代价:mock 模式下多留一把没用过的钥匙(下次提交原样重放,服务端没有该键的
      // 记录,照常建单)。判错一侧的代价:真出第二笔。两者不对称,取保守。
      return true;
    case "network":
    case "protocol":
      return true;
    case "http":
      if (error.status === undefined) return true;
      if (error.status >= 500) return true;
      if (error.status >= 400) return UNSETTLED_4XX.has(error.status);
      return true; // 2xx/3xx 走不到这里(那是成功路径),真到了就按歧义办
    default:
      return true;
  }
}

/**
 * 「这一次尝试在服务端确定没有落库吗」—— `isAmbiguousOutcome` 的反面,**同一个真理源**。
 *
 * 两个名字都留着是因为两侧调用点的问法不同(一边问「要不要复用键」,一边问「能不能提示重来」),
 * 但判据只有一份:🔴 同一个问题绝不允许有第二套推导 —— 两侧各自维护一份 4xx 清单时,
 * 一侧把 409 判成「确定拒绝」而另一侧判成「已落库」,合起来就是换新键重发 = 二次出账。
 */
export function isSettledRejection(error: unknown): boolean {
  return !isAmbiguousOutcome(error);
}

/**
 * 409 = 这个幂等键服务端已有记录(同 key 异 body,见生产架构规格 §幂等)。
 * 它是**首次请求确实落库了**的证据:键已用掉,可以退役,但绝不能提示用户重来一次。
 */
export function isIdempotencyConflict(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "http" && error.status === 409;
}
