// 首页「你的排名」派生(规格 FEAT-HOME02 ③)。
//
// 纯函数,server 与 mock 同构,便于将来后端接管。**禁随机数参与、禁缓存名次** ——
// 每次由「当前算力 + 当前配置」现算,同输入必同输出。
//
// 算力口径**复用既有单台设备模型**(lib/hashpower.ts 的 computeLiveHashpower),
// 本文件只做「聚合 + 百分位映射」,不新造第二套算力算法(规格 ⑦)。
//
// Backend-replaceable:PROD 由 `GET /api/platform/rank` 返回同一套派生结果;
// 分位表与虚拟人口是后台 H 域参数(server-canonical),client 仅消费。

/** 虚拟人口的算力分布档。tops 升序、cumPct 单调不减且 ≤ 100。 */
export interface PercentileBand {
  /** 该档对应的有效算力(TOPS)。 */
  tops: number;
  /** 到这一档为止,累计超过了百分之多少的人。 */
  cumPct: number;
}

/** 排名结果。三态分开,**不要用 null 同时表示两件事** ——
 *  「没上榜」(用户零算力,该给引导)与「算不出来」(配置坏了,该给占位+重试)
 *  在界面上是两种完全不同的东西,合并成 null 会逼 UI 去猜。 */
export type RankResult =
  | { kind: "ranked"; rank: number; percentile: number }
  | { kind: "unranked" }      // 零算力:未上榜,给「激活设备后进入排名」引导
  | { kind: "unavailable" };  // 配置非法/缺失:给占位 + 重试,禁回退写死值

/**
 * 分位表健全性(规格 异常3)。任一违反 → 该项判为不可用,**不拖垮其它两格**。
 *
 * 🔴 判「至少 2 档」不是形式主义:1 档无法插值,只能退化成阶跃,
 * 而阶跃会让「加一点算力名次猛跳」——违反规格「排名单调且可信」的要求。
 */
export function isValidPercentileTable(table: readonly PercentileBand[] | null | undefined): boolean {
  if (!Array.isArray(table) || table.length < 2) return false;
  let prevTops = -Infinity;
  let prevPct = -Infinity;
  for (const band of table) {
    if (typeof band?.tops !== "number" || typeof band?.cumPct !== "number") return false;
    if (!Number.isFinite(band.tops) || !Number.isFinite(band.cumPct)) return false;
    if (band.tops < 0 || band.cumPct < 0 || band.cumPct > 100) return false;
    if (band.tops <= prevTops) return false;     // tops 必须严格升序
    if (band.cumPct < prevPct) return false;     // cumPct 单调不减
    prevTops = band.tops;
    prevPct = band.cumPct;
  }
  return true;
}

/**
 * 算力 → 百分位(线性插值)。
 *
 * 🔴 表下方按原点 (0,0) 插值:算力低于最低档的用户不该直接拿到最低档的百分位,
 * 那会让「刚激活一台手机」和「刚好卡在最低档」的人排名相同。
 * 🔴 表上方**封顶在最高档**(规格 异常5):不外推,避免「第 1 名」这类不可信结果;
 * 算力异常大也按最高档处理,不影响其它用户的口径。
 */
export function percentileForTops(table: readonly PercentileBand[], tops: number): number {
  if (tops <= 0) return 0;
  const first = table[0];
  if (tops <= first.tops) {
    // 原点 → 首档 的线性段
    return first.tops === 0 ? first.cumPct : (tops / first.tops) * first.cumPct;
  }
  for (let i = 1; i < table.length; i++) {
    const lo = table[i - 1];
    const hi = table[i];
    if (tops <= hi.tops) {
      const span = hi.tops - lo.tops;
      const ratio = span === 0 ? 1 : (tops - lo.tops) / span;
      return lo.cumPct + ratio * (hi.cumPct - lo.cumPct);
    }
  }
  return table[table.length - 1].cumPct; // 封顶,不外推
}

export interface RankInput {
  /** 该账号全部**已激活**设备的有效算力之和。未激活 / 离线不计。 */
  myTotalHashrate: number;
  /** 虚拟人口算力分布档。 */
  table: readonly PercentileBand[] | null | undefined;
  /** 真实人口(平台已注册且有设备的账号数;mock 期由展示配置给)。 */
  realPopulation: number;
  /** 虚拟人口规模。允许为 0(等于只按真实人口排),但那会让名次大幅提前。 */
  virtualPopulation: number;
}

/**
 * 名次 = `floor((1 − 百分位/100) × 总人口) + 1`(规格 ③)。
 *
 * **单调性**:cumPct 随 tops 单调不减 ⇒ (1−cumPct) 单调不增 ⇒ 名次单调不增,
 * 即「加算力只会前进或持平,永不倒退」(规格 阳光路径4)。这条由分位表的
 * 单调性保证,所以 `isValidPercentileTable` 拒收非单调表**不是洁癖**,是这条承诺的地基。
 */
export function computeRank(input: RankInput): RankResult {
  if (!isValidPercentileTable(input.table)) return { kind: "unavailable" };
  // 🔴 负虚拟人口 = 非法配置(规格异常3 点名「负数」),不是「小一点的分母」——
  //   独立审计实测小幅负值会溜进分母照常出 ranked。非法即 unavailable,别猜。
  if (!Number.isFinite(input.virtualPopulation) || input.virtualPopulation < 0) return { kind: "unavailable" };
  const population = Math.floor(input.realPopulation) + Math.floor(input.virtualPopulation);
  if (!Number.isFinite(population) || population <= 0) return { kind: "unavailable" };
  if (!Number.isFinite(input.myTotalHashrate) || input.myTotalHashrate <= 0) return { kind: "unranked" };

  const percentile = percentileForTops(input.table!, input.myTotalHashrate);
  const rank = Math.floor((1 - percentile / 100) * population) + 1;
  // 名次落在 [1, population];封顶已由 percentileForTops 保证不会小于 1,这里只兜边界。
  return { kind: "ranked", rank: Math.min(Math.max(rank, 1), population), percentile };
}
