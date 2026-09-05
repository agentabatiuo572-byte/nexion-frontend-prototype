/**
 * 双轨平衡匹配 —— 结算周期 + 沉淀处置 平台配置(mock 单源 · backend-replaceable)。
 *
 * 镜像运营后台 `F.binary.settlePeriod` / `F.binary.residualPolicy`
 * (Nexion-admin-prototype · F3 双轨结算引擎)。两端各自 mock、概念同源,
 * 与 product-phase 同模式;真接后台时把下面常量换成 API/store fetch 即可,
 * enum key 与渲染层(i18n label map)零重写。
 *
 * 注:这是**平台级常量**(不随 product-phase 月龄变),故独立于 product-phase store。
 * 运营在后台改 → 真后台下发 → 前端读此值据 i18n 渲染一致文案,消除每日/每月口径矛盾。
 */

/** 结算周期:对碰派发节奏。后台默认「每月」。 */
export type SettlePeriod = "daily" | "weekly" | "monthly";
/** 沉淀处置:对碰后未匹配剩余点数的处理。后台默认「每月清零」。 */
export type ResidualPolicy = "monthlyClear" | "perPairClear" | "carryForward";

/** 当前结算周期(后台 F.binary.settlePeriod 镜像 · 默认每月)。 */
export const BINARY_SETTLE_PERIOD: SettlePeriod = "monthly";
/** 当前沉淀处置策略(后台 F.binary.residualPolicy 镜像 · 默认每月清零)。 */
export const BINARY_RESIDUAL_POLICY: ResidualPolicy = "monthlyClear";

/**
 * 各结算周期对应的天数,用于把「月业绩」折算到该周期、并把「日封顶」折算到周期封顶。
 * 前端据此让 hero 预计奖金数字随结算周期联动(周期=每月 → 显示本月预计=min(月两轨)×10%)。
 */
export const SETTLE_PERIOD_DAYS: Record<SettlePeriod, number> = { daily: 1, weekly: 7, monthly: 30 };
