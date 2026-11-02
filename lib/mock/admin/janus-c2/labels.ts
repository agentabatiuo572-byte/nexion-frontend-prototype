/**
 * Janus C2 控制台(K6)— 文案契约(单源)。
 * 🔴 铁律:UI 交互层禁出现工程化代码命名(ENV_FILTERED / MANUAL_HOLD / RECOMMENDED…)。
 * 任何状态 / 动作 / 来源 / 原因分类在界面必须经此映射为运营可读中文;
 * 代码 enum 仅作内部 key,如需展示原始 key 只能作 mono 小号副标。
 */
import type {
  ApprovedRemoteTargetKey,
  ConfirmationMode,
  DeviceStatus,
  IngestedReport,
  ReportEnvelope,
  EffectiveTiming,
  FailureClass,
  FailureCode,
  HealthLevel,
  RecommendationLevel,
  PolicyApplyStatus,
  PolicyCompileStatus,
  RemoteTarget,
  Role,
  RuleMode,
  RuleOp,
  StatusSource,
  StrategyActionType,
  StrategyStatus,
  TakeoverExecutionPhase,
  TakeoverMode,
} from "./types.ts";

/** 视觉色调键 → k6 css 的 .k6-bdg / .k6-status 修饰类。 */
export type Tone = "good" | "warning" | "danger" | "cyan" | "dim";

// ===== 设备状态(PRD §8.1 / §8.2)=====
export const STATUS_LABEL: Record<DeviceStatus, string> = {
  NEW: "新设备",
  OBSERVING: "继续观察",
  RECOMMENDED: "建议下发",
  HIT: "策略已命中",
  ACTIVATED: "接管成功",
  ENV_FILTERED: "环境过滤",
  MANUAL_HOLD: "人工挂起",
  MANUAL_FORCED: "手动接管命令",
  BLOCKED: "禁止下发",
  STALE: "长时间未上报",
  RESET: "撤销 / 重评",
  ERROR: "状态异常",
};

export const STATUS_TONE: Record<DeviceStatus, Tone> = {
  NEW: "dim",
  OBSERVING: "cyan",
  RECOMMENDED: "good",
  HIT: "warning",
  ACTIVATED: "good",
  ENV_FILTERED: "warning",
  MANUAL_HOLD: "cyan",
  MANUAL_FORCED: "warning",
  BLOCKED: "danger",
  STALE: "dim",
  RESET: "cyan",
  ERROR: "danger",
};

/** 状态解释文案(PRD §8.2:每个状态必须展示解释,不能只显示状态名)。 */
export const STATUS_EXPLAIN: Record<DeviceStatus, string> = {
  NEW: "首次上报或数据不足,尚未形成明确判断,继续收集行为。",
  OBSERVING: "环境未过滤,但成熟度不足或策略尚未命中,保持白壳继续观察。",
  RECOMMENDED: "成熟度达到阈值、环境风险低,建议运营确认下发。",
  HIT: "自动策略已命中,但尚不能视为接管成功;以执行阶段和设备确认结果为准。",
  ACTIVATED: "设备已确认远程页面加载成功,当前实际处于远程业务态。",
  ENV_FILTERED: "命中沙箱 / 审核 / 异常环境信号,默认不下发,可复核解除。",
  MANUAL_HOLD: "运营临时暂停自动决策,到期后恢复评估或手动释放。",
  MANUAL_FORCED: "运营已发起手动接管意图;命令待确认、加载中或失败都不等于接管成功。",
  BLOCKED: "明确禁止该设备下发,优先级高于策略命中,解除需更高权限。",
  STALE: "最近上报超过阈值,等待新上报,不建议直接下发。",
  RESET: "运营已要求撤销接管;设备确认前仍保留原实际态,确认后才回到白壳重新评估。",
  ERROR: "数据不完整、策略计算或执行尝试失败,需服务负责人或风控主管处理。",
};

/** 建议动作(PRD §7.2 建议动作列 / §18.1 主操作):状态 → 下一步运营动作。 */
export const SUGGESTED_ACTION: Record<DeviceStatus, string> = {
  NEW: "继续收集",
  OBSERVING: "继续观察",
  RECOMMENDED: "确认下发",
  HIT: "发起接管命令",
  ACTIVATED: "监控远程业务",
  ENV_FILTERED: "复核解除",
  MANUAL_HOLD: "等待恢复",
  MANUAL_FORCED: "等待设备确认",
  BLOCKED: "保持禁止",
  STALE: "等待新上报",
  RESET: "等待撤销确认",
  ERROR: "排查异常",
};

/** 渠道(PRD §4 渠道分类):内部 enum → 运营可读中文,避免英文 enum 外露。 */
export const CHANNEL_LABEL: Record<string, string> = {
  official: "官网",
  ad: "广告",
  invite: "邀请",
  test: "测试包",
  internal: "内部包",
};
export const channelLabel = (c?: string): string => (c ? CHANNEL_LABEL[c] ?? c : "—");

/** 服务端批准的远程目标目录:key 只是引用,UI 不保存或展示裸 URL。 */
export const REMOTE_URL_LABEL: Record<ApprovedRemoteTargetKey, string> = {
  default: "正盘默认首页",
  backup: "备用接管线路",
  promo: "活动接管线路",
};
export const remoteUrlLabel = (key?: string | null, catalog: RemoteTarget[] = []): string => {
  if (!key) return "—";
  const managed = [...catalog].filter((target) => target.remoteTargetKey === key).sort((a, b) => b.catalogVersion - a.catalogVersion)[0];
  if (managed) return managed.label;
  return key in REMOTE_URL_LABEL ? REMOTE_URL_LABEL[key as ApprovedRemoteTargetKey] : "未批准的接管目标";
};

export const POLICY_COMPILE_STATUS_LABEL: Record<PolicyCompileStatus, string> = {
  NOT_COMPILED: "未编译", PENDING: "编译中", SUCCEEDED: "编译成功", FAILED: "编译失败",
};
export const POLICY_APPLY_STATUS_LABEL: Record<PolicyApplyStatus, string> = {
  NOT_APPLIED: "未应用", PENDING: "应用中", APPLIED: "已应用", FAILED: "应用失败",
};

export const FAILURE_CLASS_LABEL: Record<FailureClass, string> = {
  delivery: "命令投递异常",
  target: "批准目标异常",
  webview: "远程页面异常",
  handoff: "账户交接异常",
  lease: "账户租约异常",
  cleanup: "撤销清理异常",
  contract: "运行契约异常",
};

export const FAILURE_REASON_LABEL: Record<FailureCode, string> = {
  DELIVERY_UNREACHABLE: "命令无法送达",
  WAITING_SESSION_EDGE_EXPIRED: "等待会话边界超时",
  TARGET_DISABLED: "批准目标已停用",
  TARGET_CONTRACT_MISMATCH: "接管目标契约不匹配",
  WEBVIEW_LOAD_TIMEOUT: "远程页面加载超时",
  WEBVIEW_LOAD_ERROR: "远程页面加载失败",
  HANDOFF_GRANT_FAILED: "账户交接授权失败",
  HANDOFF_CLAIM_FAILED: "账户快照领取失败",
  HANDOFF_MERGE_FAILED: "账户快照合并失败",
  LEASE_ACK_MISMATCH: "账户租约回执不匹配",
  PENDING_HANDOFF_ABORT_FAILED: "候选交接中止失败",
  REVOKE_CLIENT_CLEANUP_FAILED: "客户端撤销清理失败",
  REVOKE_ACCOUNT_CANCEL_FAILED: "账户租约取消失败",
  CONTRACT_INVALID: "运行契约无效",
};

export const REPORT_EVENT_LABEL: Record<ReportEnvelope["eventType"], string> = {
  session_started: "会话开始",
  session_boundary: "会话边界",
  foreground: "前台状态变化",
  heartbeat: "心跳上报",
};

export const REPORT_IGNORE_LABEL: Record<NonNullable<IngestedReport["ignoredReason"]>, string> = {
  idempotency_conflict: "同一上报号的内容冲突",
  stale_sequence: "同一启动内序号倒退",
  schema_unsupported: "不支持的上报格式",
  schema_invalid: "上报字段或事件关系无效",
  session_mismatch: "设备或会话不匹配",
  session_started_at_mismatch: "会话起点与已建档事实冲突",
};

// ===== 接管执行(意图 / 实态 / ACK)=====
export const TAKEOVER_MODE_LABEL: Record<TakeoverMode, string> = {
  CLOAK: "白壳",
  REMOTE: "远程业务",
};

export const TAKEOVER_PHASE_LABEL: Record<TakeoverExecutionPhase, string> = {
  NONE: "无接管动作",
  HIT_NOT_REQUESTED: "命中未发命令",
  COMMAND_PENDING_ACK: "接管命令待确认",
  RECEIVED: "设备已领命令",
  WAITING_SESSION_EDGE: "等待新会话边界",
  LOADING: "远程页面加载中",
  HANDOFF_FETCHING: "账户交接拉取中",
  HANDOFF_MERGING: "账户交接合并中",
  HANDOFF_ACKED: "账户交接已确认",
  SUCCEEDED: "接管成功",
  FAILED: "接管失败",
  CANCELLED: "命令已取消",
  REVOKE_PENDING_ACK: "撤销命令待确认",
  REVOKED: "撤销完成",
};

export const TAKEOVER_PHASE_TONE: Record<TakeoverExecutionPhase, Tone> = {
  NONE: "dim",
  HIT_NOT_REQUESTED: "warning",
  COMMAND_PENDING_ACK: "warning",
  RECEIVED: "cyan",
  WAITING_SESSION_EDGE: "warning",
  LOADING: "cyan",
  HANDOFF_FETCHING: "cyan",
  HANDOFF_MERGING: "cyan",
  HANDOFF_ACKED: "cyan",
  SUCCEEDED: "good",
  FAILED: "danger",
  CANCELLED: "dim",
  REVOKE_PENDING_ACK: "warning",
  REVOKED: "cyan",
};

export const TAKEOVER_PHASE_EXPLAIN: Record<TakeoverExecutionPhase, string> = {
  NONE: "当前没有待执行的接管或撤销命令。",
  HIT_NOT_REQUESTED: "策略命中仅代表决策结果,尚未生成设备命令。",
  COMMAND_PENDING_ACK: "服务端已记录接管意图,等待设备确认收到命令。",
  RECEIVED: "设备已领取最高有效命令版本,尚未完成远程页面加载。",
  WAITING_SESSION_EDGE: "设备已收到命令,当前会话保持白壳；只有收到新的会话或明确的会话边界上报后才开始执行。",
  LOADING: "设备已确认命令并正在加载批准目标,尚未成功。",
  HANDOFF_FETCHING: "远程页面已加载,正在以短期交接令牌拉取账户状态。",
  HANDOFF_MERGING: "账户状态已拉取,正在幂等合并,尚未确认成功。",
  HANDOFF_ACKED: "账户服务已确认交接;下一步才可记录接管成功。",
  SUCCEEDED: "远程页面加载且账户交接 ACK 均成功,实际态才切换为远程业务。",
  FAILED: "本次执行尝试失败,保留失败原因并等待重试或撤销。",
  CANCELLED: "命令在领取或生效前已取消，取消事实保留在命令账本中。",
  REVOKE_PENDING_ACK: "已发出撤销命令,设备确认前实际态保持不变。",
  REVOKED: "设备已确认撤销完成,实际态回到白壳。",
};

// ===== 状态来源(PRD §4 状态来源 / §7.2)=====
export const STATUS_SOURCE_LABEL: Record<StatusSource, string> = {
  system: "系统",
  strategy: "自动策略",
  environment: "环境识别",
  manual: "人工覆盖",
  error: "系统异常",
};

// ===== 策略状态(PRD §6.1)=====
export const STRATEGY_STATUS_LABEL: Record<StrategyStatus, string> = {
  draft: "草稿",
  active: "已发布",
  paused: "已暂停",
  archived: "已归档",
};

export const STRATEGY_STATUS_TONE: Record<StrategyStatus, Tone> = {
  draft: "dim",
  active: "good",
  paused: "warning",
  archived: "dim",
};

// ===== 策略动作(PRD §6.4)=====
export const ACTION_TYPE_LABEL: Record<StrategyActionType, string> = {
  BENIGN: "保持白壳",
  RECOMMEND: "进入建议下发",
  REVERSAL_IMMEDIATE: "当前会话发起接管",
  REVERSAL_SESSION_EDGE: "下次会话边界发命令",
  ENV_FILTER: "标记环境过滤",
  MANUAL_HOLD: "暂停自动决策",
  BLOCK: "禁止下发",
  DRY_RUN_ONLY: "仅干跑模拟",
};

// ===== 规则组合(PRD §6.2)=====
export const RULE_MODE_LABEL: Record<RuleMode, string> = {
  ALL: "全部满足",
  ANY: "任一满足",
  N_OF_M: "满足其中若干条",
  NOT: "排除",
  WEIGHTED_SCORE: "加权评分达标",
};

export const RULE_OP_LABEL: Record<RuleOp, string> = {
  "=": "等于",
  "!=": "不等于",
  ">": "大于",
  ">=": "大于等于",
  "<": "小于",
  "<=": "小于等于",
  in: "属于",
  notIn: "不属于",
  between: "介于",
  contains: "包含",
};

// ===== 建议等级(PRD §10.3)=====
export const RECOMMENDATION_LEVEL_LABEL: Record<RecommendationLevel, string> = {
  STRONG: "强建议",
  NORMAL: "普通建议",
  OBSERVE: "继续观察",
  REJECT: "不建议",
  REVIEW: "环境复核",
  FILTER: "环境过滤",
};

export const RECOMMENDATION_LEVEL_TONE: Record<RecommendationLevel, Tone> = {
  STRONG: "good",
  NORMAL: "cyan",
  OBSERVE: "dim",
  REJECT: "dim",
  REVIEW: "warning",
  FILTER: "danger",
};

// ===== 角色(PRD §15)=====
export const ROLE_LABEL: Record<Role, string> = {
  viewer: "只读",
  operator: "风控运营",
  senior_operator: "风控主管",
  admin: "超级管理员",
};

// ===== 生效时机 / 确认模式(PRD §9.2)=====
export const EFFECTIVE_TIMING_LABEL: Record<EffectiveTiming, string> = {
  immediate: "立即发出命令",
  session_edge: "下次会话发出命令",
};

export const CONFIRMATION_MODE_LABEL: Record<ConfirmationMode, string> = {
  standard: "常规确认",
  strong_single: "单人强确认",
};

// ===== 健康度等级(PRD §12.2)=====
export const HEALTH_LEVEL_LABEL: Record<HealthLevel, string> = {
  HEALTHY: "健康",
  WARNING: "轻微异常",
  RISK: "存在风险",
  CRITICAL: "严重异常",
};

export const HEALTH_LEVEL_TONE: Record<HealthLevel, Tone> = {
  HEALTHY: "good",
  WARNING: "warning",
  RISK: "warning",
  CRITICAL: "danger",
};

/** 手动修改原因分类(PRD §9.2 reasonCategory,枚举值用下拉不让手输)。 */
export const REASON_CATEGORIES: string[] = [
  "等待更多行为数据",
  "复核环境信号",
  "已知合作 / 内部设备",
  "疑似审核 / 自动化环境",
  "高风险设备排除",
  "客诉 / 线索跟进",
  "现场演示需要",
  "其他(在详细原因说明)",
];
