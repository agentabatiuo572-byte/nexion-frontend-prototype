// Platform config / feature-flag types. Shared by the config store and its
// mock seed. Future PROD wiring uses this as the `GET /api/config/platform`
// response shape. Values have domain-specific authoring sources (E/K/H3);
// the homepage task flags below are read-only projections of existing H3 data.

export interface FeatureFlags {
  // DR-1: 电脑算力(PC 共享)总开关。默认 false → 前端零入口零推送；
  // 后台一键开启后前端才长出弱入口。
  computeShareEnabled: boolean;
  // FEAT-HOME02: read-only server projections from the existing H3 authoring
  // surfaces. They are not a second pair of admin switches:
  // newcomer = H3.dayOne.tasks has at least one active task;
  // weekly card = H3 has an active WEEKLY_T1/T2 mission or an active promo banner.
  homeNewcomerTasksEnabled: boolean;
  homeWeeklyPromoEnabled: boolean;
}

// Single source: derived from FeatureFlags keys — adding a flag to the
// interface auto-extends this union (no double-maintenance).
export type FeatureFlagKey = keyof FeatureFlags;

export type GpuTierId = "G1" | "G2" | "G3" | "G4" | "G5" | "G6";

export interface GpuTier {
  id: GpuTierId;
  label: string;
  keywords: string[];
  tops: number;
}

export interface ComputeShareContent {
  zhTitle: string;
  zhGuide: string;
  enTitle: string;
  enGuide: string;
}

// SPEC-1 在线加成系数 — admin E6「算力与设备配置」is the authoring surface; keys are
// mirrored 1:1 in admin lib/admin/e6-client.ts (e6CoeffKey: h5BaseFactor/continuityFullHours;
// 原 mock 寄存器 lib/mock/admin/compute-config.ts 已死,admin 已 server-canonical)。
// PROD wires server→client; value authority lives in the real backend.
export interface OnlineBonus {
  // 无新鲜设备心跳时的基础托管系数(沿用 h5BaseFactor 配置键)∈(0,1]:
  // effectiveTops = baseline × h5BaseFactor × network × jitter.
  h5BaseFactor: number;
  // App 连续在线满额时长(小时): continuity 因子在此时长达到满额 1.0(此前自 0.85 线性爬升)。
  continuityFullHours: number;
}

// ── SPEC-7 §5 风险簇释放参数(推倒重写版)──────────────────────────────
// server/admin canonical. Client reads these as config, never as business
// constants. Defaults live only in mock/platform-config (mock seed).
// K1 是风险簇权威;K4 是评分权威;K3 是提现路由权威。

// R1(整改): pending 释放模式。没有 "auto" —— 观察窗口到达永不自动释放,
// 释放源只有 App 在线证明或 D2 人工放行。
export type PendingReleaseMode = "attest_or_manual" | "manual_only";

export interface RiskClusterConfig {
  freePhoneSlotsPerCluster: number;
  duplicateAccountPendingFrom: number;
  duplicateAccountFreezeFrom: number;
  // R1: 观察窗口只作运营/熔断统计口径 —— 到达不触发任何释放。
  pendingReleaseHours: number;
  appAttestationReleaseHours: number;
  maxSignupPerIp24h: number;
  maxAccountsPerDevice: number;
  maxAccountsPerPaymentInstrument: number;
  clusterFreezeSuggestThreshold: number;
  releaseMode: PendingReleaseMode;
  // R4: 首号免费槽收益进可提前,需至少一次有效绑定(支付/推荐/App 在线证明)。
  freeSlotRequiresBinding: boolean;
}

export type WithdrawalRiskRoute = "pass" | "delay" | "manual" | "freeze" | "reject";

export interface WithdrawRulesConfig {
  minWithdrawableUsdt: number;
  sameAddressRoute: WithdrawalRiskRoute;
  // R2 冷启动保守: 新账户首次提现无条件人工,兜「每号换指纹+换地址」的分散薅。
  firstWithdrawalManual: boolean;
  // R2: 提现地址首次绑定后 N 小时内提现走 delay/manual。
  newAddressHoldHours: number;
  // PAY04 换绑频控: 每 N 天最多更换一次提现地址(后台 D5/K3 可配)。
  rebindCooldownDays: number;
  // 🔴 FEAT-WD01a 小额免审线(USD,后台 D5 可配)。金额 ≤ 此值时免掉「首提必审」与
  //    「新地址 hold」两道**冷启动保守闸**;0 = 关闭快车道。
  //    ⚠️ 风控闸(冻结簇/共用地址/风险分/大额账龄)不受此值影响,照常裁决。
  smallAmountThresholdUsd: number;
  // 🔴 FEAT-WD01b 每日提现笔数上限**不在这里** —— 唯一来源是服务端
  //    `GET /api/withdrawals/policy` 的 dailyLimitCount(提交时真正执行的那把尺子)。
  //    本文件这份配置的远端同步只覆盖 featureFlags/onlineBonus/rewards/computeShare,
  //    withdrawRules 永远停在前端写死值;曾经文案取服务端的数、预检取这里的 1,
  //    服务端配 3 笔而客户端按 1 笔拦人(z1 审计 P0-1 同批发现)。别把它加回来。
  // 🔴 FEAT-WD01b 到账时效(小时,后台 D5 payoutSlaHours 可配,值域 1–168)。
  //    预计到账 = 提交 + 本值;24 = 次日到账(T+1)。
  payoutSlaHours: number;
  // 🔴 FEAT-WD01b 大额到账审查窗口(天,后台 D5 cooldownDays 可配;0 = 该阶段不开)。
  //    金额 ≥ 大额线时,与「提交 + 到账时效」**取更晚者**。
  //    注意与 rebindCooldownDays 不是一回事:那个是换绑频控,这个是大额到账等待。
  payoutReviewWindowDays: number;
  // 🔴 FEAT-WD02 网络确认费(后台 D5 可配,值域 [0, 25];种子 trc20/bep20 $1 · erc20 $5)。
  //    每笔**固定**、按提现网络取键,取代旧「networkFee 比例夹逼 + 按金额比例平台费」双费模型;
  //    0 = 该网络免手续费(合法值,页面显示 $0.00 不藏行)。
  //    规格 ③ 数据字典把它挂在 PlatformConfig.withdrawFee 下;工程沿用 withdrawRules 容器
  //    (叶子名/键/值域一致,容器差异已登记 T9 spec 勘误清单)。
  networkConfirmFeeUsd: Record<"trc20" | "bep20" | "erc20", number>;
}

// 新人礼发放模式: risk_bucket = 按当前风险簇分桶(默认);direct = 直入可提(运营可关闸)。
export type WelcomeGiftLockMode = "risk_bucket" | "direct";

export interface RewardsConfig {
  welcomeGift: {
    lockMode: WelcomeGiftLockMode;
    // 注册礼包金额(运营可调;admin K.rewards.welcomeGift.* 同键,CGM-F-020)。
    usdtAmount: number;
    nexAmount: number;
  };
  // 邀请人奖励:邀请人每邀请一名新用户自身获得的 NEX(运营可调;admin K.rewards.inviterReward.* 同键)。
  inviterReward: {
    nexAmount: number;
  };
}

// ── SPEC-7 §5b K1 聚簇维度权重(K4 可配)──────────────────────────────
// mock K4 分数 = 命中维度的权重和(cap 1);强维命中直接入簇(OR),
// 中/弱维叠加权重 ≥ weakSignalClusterThreshold 才入簇。空维度不计分(空值降权)。
export interface RiskScoreConfig {
  dimensionWeights: {
    serverDeviceId: number;
    ipBucket: number;
    withdrawAddress: number;
    paymentInstrument: number;
    sponsor: number;
    uaFingerprint: number;
    signupTiming: number;
  };
  weakSignalClusterThreshold: number;
}

// ── FEAT-AUTH01 OTP 发送闸门参数(PRD §4.6.2/§16.2.1;K 域风控可配)────
// server/admin canonical. Client reads as config, never as business constants.
export interface OtpGateConfig {
  // Resend 冷却(秒);client 倒计时以 otpSend 响应的 resendAfterSec 为准。
  resendSeconds: number;
  // 24h 滑动窗内成功 send 达到此值后,下一次 send 需过滑块(≥3 次触发 → 值为 2)。
  captchaAfterSends: number;
  // OTP server-side 有效期(秒)。
  otpTtlSeconds: number;
  // 单个 code 允许的 verify 错误次数,用尽即作废。
  maxVerifyAttempts: number;
  // 滑块通过后签发 ticket 的有效期(秒),单次使用。
  captchaTicketTtlSeconds: number;
  // FEAT-AUTH03: 每次发码必过滑块的场景;空数组 = 全部回落次数阈值规则。
  // 平台可配,后台可调面由包 A 登记。值域与 auth-otp 的 OtpScene 相同,
  // 内联字面量避免 config-types → auth-otp 反向依赖。
  captchaAlwaysScenes: Array<"login" | "register" | "reset" | "payout-address">;
}

// ── FEAT-SHARE01 分享链路配置(§13.3 share.*;K/E 域运营可调)─────────────
// server/admin canonical. Client reads as config, never as business constants.
// baseUrl 为空(mock/dev)时由 lib/share 回退运行时 origin,不产出死链。

// web = H5 可直接唤起的分享 intent URL;scheme = 仅 App 直发(H5 走复制降级);
// copy / poster / system = 本地动作,无外链模板。
export type ShareIntentType = "web" | "scheme" | "copy" | "poster" | "system";

export type ShareChannelKey =
  | "zalo"
  | "telegram"
  | "whatsapp"
  | "messenger"
  | "sms"
  | "x"
  | "copy"
  | "poster"
  | "system";

export interface ShareChannelDef {
  key: ShareChannelKey;
  intentType: ShareIntentType;
  // web 型必填:intent 模板,{link}/{text} 占位(URL-encode 后代入)。
  urlTemplate?: string;
  // Optional message template. New server responses provide this for enabled
  // channels; absence remains compatible with legacy local fixtures.
  textTemplate?: string;
  // App 壳已装检测参数(H5 忽略;v1 仅承载结构,检测在组件层接入)。
  androidPackage?: string;
  iosScheme?: string;
  enabled: boolean;
}

export interface ShareConfig {
  // 短链前缀(如 https://nexgrid.ai/ref/)。空串 = dev 回退运行时 origin。
  baseUrl: string;
  // 顺序即渠道面板展示序(越南盘默认 Zalo 首位)。
  channels: ShareChannelDef[];
  // 注册成功页 H5 官网下载引导;officialUrl 为空 = 显示不可用占位。
  // 旧平台直链字段保留兼容历史配置,成功页不再直接消费。
  appDownload: {
    officialUrl: string;
    iosUrl: string;
    androidUrl: string;
    apkUrl: string;
    version: string;
    releaseNotes: { zh: string; en: string };
    source: "official" | "mock" | "unavailable";
  };
}

/** 对外公布数据(规格 FEAT-HOME02 ③;后台单源 = H 域「对外公布数据」卡)。
 *
 *  🔴 `fleetDevices` 是**平台舰队规模锚**:公布日产、每秒支付流、累计支付,以及
 *  介绍页 / 信任页 / 全球网格 / 分享海报的舰队数字**全部由它派生**。各页禁止另存一份
 *  (既有 `platform_stats_anchor` 哨兵守这条)。改它 = 改一切平台级金额口径。
 *
 *  🔴 `virtualUserCount` 与 `hashratePercentileTable` 只用于**排名分母与百分位映射**,
 *  **永不**以任何形式出现在用户可见文案、字段名或接口响应的展示字段里(产品内 0 元层)。 */
export interface PublicStatsConfig {
  /** 平台舰队规模锚。合法域 [1000, 1000000]。 */
  fleetDevices: number;
  /** 在线率(%)。在线设备 = 舰队规模 × 该比例。合法域 [50, 100]。 */
  onlineRatePct: number;
  /** 在线数展示抖动幅度(台)。**只影响视觉呼吸感,不参与任何金额派生**。[0, 500]。 */
  onlineJitter: number;
  /** 注册用户展示基数。[0, 100000000]。 */
  registeredUsersBase: number;
  /** 注册用户月增速(%)。前端按时间锚派生当前值 —— **推算不累加**,故刷新不回退。[0, 50]。 */
  registeredUsersMonthlyGrowthPct: number;
  /** 派生起点(ms epoch)。运营改基数即重置锚点。 */
  registeredUsersAnchorAt: number;
  /** 服务端真实注册账号数，仅用于排名分母，不用于营销展示。 */
  realUserCount: number;
  /** 虚拟人口规模。真实人口 + 它 = 排名分母。[0, 10000000]。 */
  virtualUserCount: number;
  /** 虚拟人口算力分布档(tops 升序、cumPct 单调不减且 ≤100、至少 2 档)。
   *  校验与消费见 `lib/network-rank.ts`;非法即该项不可用,不拖垮其它两格。 */
  hashratePercentileTable: { tops: number; cumPct: number }[];
}

export interface PlatformConfig {
  featureFlags: FeatureFlags;
  publicStats: PublicStatsConfig;
  onlineBonus: OnlineBonus;
  riskCluster: RiskClusterConfig;
  withdrawRules: WithdrawRulesConfig;
  rewards: RewardsConfig;
  riskScore: RiskScoreConfig;
  otpGate: OtpGateConfig;
  computeShare: {
    downloadUrl: string;
    content: ComputeShareContent;
    gpuTiers: GpuTier[];
  };
  share: ShareConfig;
}

type RuntimeWithdrawRuleKey =
  | "smallAmountThresholdUsd"
  | "payoutSlaHours"
  | "payoutReviewWindowDays"
  | "networkConfirmFeeUsd";

/**
 * Transitional seed shape for older local Mock fixtures.
 *
 * Runtime consumers always receive a complete `PlatformConfig`; the config
 * store supplies newly required fields outside the Mock dataset boundary.
 */
export type PlatformConfigSeed = Omit<PlatformConfig, "publicStats" | "withdrawRules" | "otpGate"> & {
  publicStats?: PublicStatsConfig;
  withdrawRules: Omit<WithdrawRulesConfig, RuntimeWithdrawRuleKey> &
    Partial<Pick<WithdrawRulesConfig, RuntimeWithdrawRuleKey>>;
  otpGate: Omit<OtpGateConfig, "captchaAlwaysScenes"> &
    Partial<Pick<OtpGateConfig, "captchaAlwaysScenes">>;
};
