/**
 * Janus C2 控制台(K6)— 数据模型(PRD §16)。
 * 外部 DTO 与内部只读投影都保持纯可序列化；边界适配器必须显式且有 fixture 验证。
 * 文案不在这里 —— 所有 code→运营可读中文映射在 labels.ts(单源)。
 */

// ===== 设备状态机(PRD §8.1)=====
export type DeviceStatus =
  | "NEW"
  | "OBSERVING"
  | "RECOMMENDED"
  | "HIT"
  | "ACTIVATED"
  | "ENV_FILTERED"
  | "MANUAL_HOLD"
  | "MANUAL_FORCED"
  | "BLOCKED"
  | "STALE"
  | "RESET"
  | "ERROR";

/** 状态来源(PRD §4 状态来源 / §7.2)。 */
export type StatusSource = "system" | "strategy" | "environment" | "manual" | "error";

/** 角色(PRD §15)。 */
export type Role = "viewer" | "operator" | "senior_operator" | "admin";

// ===== 规则与策略(PRD §6 / §16.3 / §16.4)=====
export type RuleOp =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "notIn"
  | "between"
  | "contains";

export type RuleMode = "ALL" | "ANY" | "N_OF_M" | "NOT" | "WEIGHTED_SCORE";

export interface Rule {
  field: string;
  op: RuleOp;
  value: unknown;
  /** WEIGHTED_SCORE 模式下的权重。 */
  weight?: number;
  /** 运营可读的规则说明(自然语言,展示用)。 */
  label: string;
}

export interface RuleGroup {
  mode: RuleMode;
  /** N_OF_M 模式下需满足的条数。 */
  required?: number;
  /** WEIGHTED_SCORE 模式下的命中阈值。 */
  threshold?: number;
  rules: Array<Rule | RuleGroup>;
}

export function isRuleGroup(node: Rule | RuleGroup): node is RuleGroup {
  return (node as RuleGroup).mode !== undefined;
}

export type StrategyStatus = "draft" | "active" | "paused" | "archived";

export type StrategyActionType =
  | "BENIGN"
  | "RECOMMEND"
  | "REVERSAL_IMMEDIATE"
  | "REVERSAL_SESSION_EDGE"
  | "ENV_FILTER"
  | "MANUAL_HOLD"
  | "BLOCK"
  | "DRY_RUN_ONLY";

/** 只能引用服务端批准目录中的目标键,前端永不接收或保存裸 URL。 */
/** 服务端批准目录键；原型 seed 有 default/backup/promo，但 Admin 可新增，不得用前端固定 union 封死。 */
export type ApprovedRemoteTargetKey = string;

export interface StrategyAction {
  type: StrategyActionType;
  /** 接管类动作引用的批准目标键。 */
  remoteTargetKey?: ApprovedRemoteTargetKey;
  remoteTargetVersion?: number;
}

export interface StrategyScope {
  channels?: string[];
  inviteCodes?: string[];
  cohortIds?: string[];
}

export interface StrategySafeguards {
  maxDailyRecommendations?: number;
  maxDailyHits?: number;
  requireFreshReportMinutes?: number;
  minDecisionIntervalHours?: number;
}

export interface RolloutConfig {
  /** 灰度比例 0–100。 */
  percent: number;
  cohortIds?: string[];
  startedAt?: number;
  endsAt?: number;
}

export interface HealthConfig {
  maxHitRate?: number;
  maxFilterRate?: number;
  minActivationRate?: number;
}

/** 策略版本快照(PRD §14.4,不可变)。 */
export interface StrategyVersion {
  /** 策略自身内容版本；与全局 PolicyBundle.bundleVersion 分域。 */
  version: number;
  /** 发布 / 暂停 / 回滚基线。 */
  note: string;
  actorId: string;
  createdAt: number;
  name?: string;
  description?: string;
  owner?: string;
  priority?: number;
  scope?: StrategyScope;
  ruleTree: RuleGroup;
  action: StrategyAction;
  safeguards?: StrategySafeguards;
  rollout?: RolloutConfig;
  healthConfig?: HealthConfig;
}

export type PolicyCompileStatus = "NOT_COMPILED" | "PENDING" | "SUCCEEDED" | "FAILED";
export type PolicyApplyStatus = "NOT_APPLIED" | "PENDING" | "APPLIED" | "FAILED";

export interface Strategy {
  strategyId: string;
  /** 草稿内容每次保存都递增；与已发布 strategyVersion 分离。 */
  contentRevision: number;
  name: string;
  description: string;
  status: StrategyStatus;
  version: number;
  priority: number;
  owner: string;
  scope: StrategyScope;
  ruleTree: RuleGroup;
  action: StrategyAction;
  safeguards: StrategySafeguards;
  rollout?: RolloutConfig;
  healthConfig?: HealthConfig;
  /** 模板键:从 §14.2 预设模板派生时标记。 */
  templateKey?: string;
  versions: StrategyVersion[];
  createdAt: number;
  publishedAt?: number;
  /** 最近一次纳入发布包的策略内容版本；不是全局包版本。 */
  publishedContentVersion?: number;
  /** 最近一次纳入的全局包版本，仅用于追溯发布关系。 */
  lastPublishedBundleVersion?: number;
  derivedFromStrategyId?: string;
  derivedFromVersion?: number;
}

export interface PolicyBundleEntry {
  strategyId: string;
  contentVersion: number;
}

/** C2 唯一、全局、原子策略产物。编译与应用状态只属于 bundle，不属于单条策略。 */
export interface PolicyBundle {
  bundleVersion: number;
  schemaVersion: string;
  adapterVersion: string;
  remoteTargetCatalogVersion: number;
  entries: PolicyBundleEntry[];
  compileStatus: PolicyCompileStatus;
  applyStatus: PolicyApplyStatus;
  publishedAt: number;
  publishedBy: string;
  note: string;
  failureReason?: string;
  compiledAt?: number;
  appliedAt?: number;
}

interface PolicyBundleReceiptBase {
  receiptId: string;
  bundleVersion: number;
  stage: "compile" | "apply";
  receivedAt: number;
  ignoredReason?: "UNKNOWN_BUNDLE" | "STALE_BUNDLE" | "INVALID_STAGE" | "INVALID_RECEIPT" | "DUPLICATE";
}

export type PolicyBundleReceipt =
  | (PolicyBundleReceiptBase & { outcome: "succeeded"; failedReason?: never })
  | (PolicyBundleReceiptBase & { outcome: "failed"; /** 服务端真实失败原因，失败分支必填。 */ failedReason: string });

// ===== 判定轨迹(PRD §13.5)=====
export interface DecisionRuleResult {
  label: string;
  passed: boolean;
  /** 实际值说明,如「当前 3 天」。 */
  detail: string;
}

export interface DecisionCandidateResult {
  strategyId: string;
  strategyName: string;
  contentVersion: number;
  matched: boolean;
  action: StrategyActionType;
  reason: string;
  rank: number;
  winner: boolean;
}

export interface DecisionSnapshot {
  decisionId: string;
  deviceId: string;
  sessionId: string;
  policyBundleVersion: number;
  signalRevision: number;
  strategyId: string;
  strategyName: string;
  strategyVersion: number;
  decidedAt: number;
  action: StrategyActionType;
  /** 规则真值与 BENIGN 动作正交；BENIGN 也可以是已命中的安全动作。 */
  matched: boolean;
  /** 本次裁决实际参与全序比较的全部不可变策略内容版本。 */
  strategyVersions: Array<{ strategyId: string; contentVersion: number }>;
  /** 每个参赛版本的真值、动作、原因与稳定全序；用于完整重放。 */
  candidates: DecisionCandidateResult[];
  ruleResults: DecisionRuleResult[];
  /** 冲突策略名(同设备多策略命中)。 */
  conflicts?: string[];
  /** 被保护规则阻断的原因。 */
  blockedReason?: string;
}

// ===== 手动覆盖(PRD §9.2 / §16.5)=====
export type ConfirmationMode = "standard" | "strong_single";
export type EffectiveTiming = "immediate" | "session_edge";

export interface ManualOverride {
  targetStatus: DeviceStatus;
  reasonCategory: string;
  reasonText: string;
  operatorId: string;
  effectiveTiming: EffectiveTiming;
  expireAt?: number;
  createdAt: number;
  confirmationMode: ConfirmationMode;
  roleGate: Role;
  remoteTargetKey?: ApprovedRemoteTargetKey;
  remoteTargetVersion?: number;
  impactAcknowledgement?: ImpactAcknowledgement;
}

export interface ImpactAcknowledgement {
  acknowledgementId: string;
  deviceId: string;
  sessionId?: string;
  observedDesiredCommandVersion?: number;
  observedAppliedCommandVersion?: number;
  observedAccountLeaseState: ActorLeaseState;
  observedActorLeaseId?: string;
  remoteTargetKey?: string;
  remoteTargetVersion?: number;
  impactScope: string;
  acknowledgedAt: number;
  expiresAt: number;
}

export interface DryRunCredential {
  credentialId: string;
  strategyId: string;
  contentRevision: number;
  contentHash: string;
  result: "pass" | "fail";
  issuedAt: number;
  expiresAt: number;
}

// ===== 审计日志(PRD §16.6 / §19)=====
export interface AuditLog {
  auditId: string;
  actorId: string;
  action: string;
  targetType: "device" | "strategy" | "config";
  targetId: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  reasonCategory?: string;
  reasonText?: string;
  /** 来源 IP / 后台登录上下文(PRD §19;mock 填占位,真后台注入)。 */
  sourceContext?: string;
  createdAt: number;
  requestId: string;
}

// ===== 会话与设备(PRD §16.1 / §16.2)=====
export interface Session {
  sessionId: string;
  deviceId: string;
  startedAt: number;
  lastSeenAt: number;
  appPhase?: string;
  simDay?: number;
  ua?: string;
  deviceFp?: Record<string, unknown>;
  foregroundDurationSeconds?: number;
  pageViews?: string[];
  actions?: string[];
  lastDecision?: DecisionSnapshot;
  reportIds?: string[];
}

export interface ReportCumulativeSignals {
  appOpenCount: number;
  sessionCount: number;
  foregroundDurationSeconds: number;
}

export interface ReportInstantaneousSignals {
  appPhase: string;
  environmentRiskScore: number;
  ua?: string;
}

/** 完整设备上报信封；设备、会话、boot 与序号共同决定摄取投影。 */
export interface ReportEnvelope {
  reportId: string;
  deviceId: string;
  sessionId: string;
  bootId: string;
  sequence: number;
  /** 本会话由设备固定生成的诊断起点；后续 Report 不得改写，但不参与 current 排序。 */
  sessionStartedAt: number;
  /** 设备已持久化应用的命令水位；与 PolicyBundle 版本正交。 */
  appliedCommandVersion: number;
  observedAt: number;
  schemaVersion: "1.0";
  eventType: "session_started" | "session_boundary" | "foreground" | "heartbeat";
  boundaryId?: string;
  cumulativeSignals: ReportCumulativeSignals;
  instantaneousSignals: ReportInstantaneousSignals;
}

export type ReportIngestDisposition = "APPLIED" | "HISTORICAL_SESSION" | "IGNORED";
export type ReportIngestReason = "idempotency_conflict" | "stale_sequence" | "schema_unsupported" | "schema_invalid" | "session_mismatch" | "session_started_at_mismatch";

/** C2 对设备 ReportEnvelope 的服务端摄取回执；receivedAt 绝不由设备提交。 */
export interface ReportIngestAck {
  reportId: string;
  disposition: ReportIngestDisposition;
  ignoredReason?: ReportIngestReason;
  receivedAt: number;
  arrivalIndex: number;
  deviceProjectionRevision: string;
  sessionProjectionRevision: string;
}

export interface IngestedReport extends ReportEnvelope {
  receivedAt: number;
  arrivalIndex: number;
  ingestDisposition: ReportIngestDisposition;
  ignoredReason?: ReportIngestReason;
  deviceProjectionRevision: string;
  sessionProjectionRevision: string;
}

export interface ReportSessionProjection {
  sessionId: string;
  deviceId: string;
  /** 设备诊断时间；current 与分页顺序只认 C2 establishmentOrder。 */
  startedAt: number;
  /** C2 首次接受该 session 的服务端时间；session-edge 只能与 ACK 到达时间同域比较。 */
  establishedAt: number;
  /** C2 最近接受本 session Report 的时间；设备 observedAt 仅保留在报告诊断字段。 */
  lastSeenAt: number;
  latestBootId: string;
  latestSequence: number;
  reportIds: string[];
  /** 由服务端到达顺序分配，不能被客户端时间戳倒置。 */
  establishmentOrder: number;
}

export interface ReportProjection {
  deviceId: string;
  /** device+boot 级水位；同 boot 跨 session 也不得回退。旧投影缺失时从 acceptedReports 重建。 */
  bootSequenceWatermarks?: Record<string, number>;
  latestSessionId?: string;
  /** 最近一次 current/APPLIED Report 的设备诊断时间，不是服务端 freshness 水位。 */
  latestObservedAt?: number;
  appliedCommandVersion?: number;
  cumulativeSignals?: ReportCumulativeSignals;
  instantaneousSignals?: ReportInstantaneousSignals;
  sessions: ReportSessionProjection[];
  acceptedReports: IngestedReport[];
  ignoredReports: IngestedReport[];
}

export type RemoteTargetStatus = "active" | "disabled";
export interface RemoteTarget {
  catalogVersion: number;
  remoteTargetKey: ApprovedRemoteTargetKey;
  remoteTargetVersion: number;
  status: RemoteTargetStatus;
  label: string;
  url: string;
  /** URL 的真实 origin，例如 https://approved.example。 */
  origin: string;
  /** 记录来源与 URL origin 是两个正交事实。 */
  source: "admin" | "seed";
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  changeReason: string;
}

/** 接管意图与设备实际结果必须分开,不能把策略命中或命令发出当作成功。 */
export type TakeoverMode = "CLOAK" | "REMOTE";
export type TakeoverExecutionPhase =
  | "NONE"
  | "HIT_NOT_REQUESTED"
  | "COMMAND_PENDING_ACK"
  | "RECEIVED"
  | "WAITING_SESSION_EDGE"
  | "LOADING"
  | "HANDOFF_FETCHING"
  | "HANDOFF_MERGING"
  | "HANDOFF_ACKED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REVOKE_PENDING_ACK"
  | "REVOKED";

export type TakeoverCommandType = "ACTIVATE" | "REVOKE" | "CHANGE_TARGET";
export type AckStatus =
  | "received"
  | "waiting_session_edge"
  | "session_boundary"
  | "webview_loading"
  | "handoff_fetching"
  | "handoff_merging"
  | "handoff_acked"
  | "succeeded"
  | "failed"
  | "cancelled";
export type FailureCode =
  | "DELIVERY_UNREACHABLE"
  | "WAITING_SESSION_EDGE_EXPIRED"
  | "TARGET_DISABLED"
  | "TARGET_CONTRACT_MISMATCH"
  | "WEBVIEW_LOAD_TIMEOUT"
  | "WEBVIEW_LOAD_ERROR"
  | "HANDOFF_GRANT_FAILED"
  | "HANDOFF_CLAIM_FAILED"
  | "HANDOFF_MERGE_FAILED"
  | "LEASE_ACK_MISMATCH"
  | "PENDING_HANDOFF_ABORT_FAILED"
  | "REVOKE_CLIENT_CLEANUP_FAILED"
  | "REVOKE_ACCOUNT_CANCEL_FAILED"
  | "CONTRACT_INVALID";
export type FailureClass = "delivery" | "target" | "webview" | "handoff" | "lease" | "cleanup" | "contract";
export type Retryability = "retryable" | "terminal";
export type FailureStage =
  | "delivery"
  | "waiting_session_edge"
  | "target_resolution"
  | "webview_loading"
  | "handoff_fetching"
  | "handoff_merging"
  | "handoff_ack"
  | "pending_handoff_abort"
  | "revoke_client_cleanup"
  | "revoke_account_cancel";
export type CommandCancellationReason = "superseded" | "expired" | "target_disabled";

export type CommandCause =
  | { kind: "manual"; requestId: string; auditId: string; impactAcknowledgementId: string }
  | { kind: "decision"; decisionId: string };

export interface LedgerTakeoverCommand {
  commandId: string;
  deviceId: string;
  commandVersion: number;
  /** 全局 PolicyBundle 版本。 */
  policyBundleVersion: number;
  catalogVersion: number;
  type: TakeoverCommandType;
  idempotencyKey: string;
  expectedCommandVersion: number;
  effectiveTiming: EffectiveTiming;
  issuedAt: number;
  validUntil: number;
  remoteTargetKey?: ApprovedRemoteTargetKey;
  remoteTargetVersion?: number;
  cause: CommandCause;
}

export interface CommandClaim {
  claimId: string;
  commandId: string;
  commandVersion: number;
  attemptId: string;
  claimedSessionId: string;
  /** 旧持久态诊断字段；不得用于边界先后判断。 */
  claimedSessionStartedAt?: number;
  /** claimed session 在 C2 的首次接受时间；不使用设备 sessionStartedAt 做边界判定。 */
  claimedSessionEstablishedAt?: number;
  claimedSessionEstablishmentOrder?: number;
  /** 领取瞬间 C2 已分配的最后到达号；边界证据必须严格晚于该水位。 */
  claimedReportArrivalIndex?: number;
  executionSessionId?: string;
  /** C2 接收 received ACK 的服务端时间。 */
  ackReceivedAt?: number;
  /** received 时已固化的唯一正式下行命令；旧持久态可缺失，但不得再签发 grant。 */
  deliveredCommand?: DeliveredTakeoverCommand;
  /** 兼容旧持久态；新 claim 与 ackReceivedAt 写同一服务端值。 */
  claimedAt: number;
}

export interface CommandCancellationFact {
  cancellationId: string;
  deviceId: string;
  commandId: string;
  attemptId: string;
  commandVersion: number;
  cancelledAt: number;
  reason: CommandCancellationReason;
  supersedingCommandId?: string;
  catalogVersion?: number;
}

export interface HandoffGrant {
  handoffId: string;
  accountSubjectRef: string;
  operation: "ACTIVATE" | "CHANGE_TARGET";
  commandId: string;
  attemptId: string;
  snapshotVersion: number;
  handoffEpoch: number;
  actorLeaseId: string;
  replacesActorLeaseId?: string;
  handoffToken: string;
  targetOrigin: string;
  leaseState: "TRANSFERRING";
  expiresAt: number;
}

/** 账户服务在签发 grant 时固化的 attempt 事实；claim ACK 只能回放该事实。 */
export interface HandoffGrantAttemptBinding {
  attemptId: string;
  claimedSessionId: string;
  executionSessionId: string;
  eventSeq: number;
  status: "received" | "session_boundary";
}

/** grant 签发时的恢复上下文；缺失时 claim 必须失败关闭。 */
export interface HandoffGrantRecoveryContext {
  deliveredCommand: DeliveredTakeoverCommand;
  attemptBinding: HandoffGrantAttemptBinding;
}

/** 正式 claim body；Origin 只能来自外部可信 HTTP 上下文，不得放入 body。 */
export interface HandoffClaimRequest {
  /** Janus 按本次授权生成；远程 H5 只能在重试时原样复用。 */
  claimRequestId: string;
  handoffToken: string;
  commandId: string;
  attemptId: string;
  snapshotVersion: number;
  handoffEpoch: number;
  actorLeaseId: string;
}

/** Janus 只向 grant.targetOrigin 投递该能力；远程 H5 再自行调用正式 claim。 */
export interface HandoffGrantMessage {
  type: "nexgrid:handoff-grant";
  schemaVersion: "1.0";
  /** handoffId 供远端拼 URL path；正式 claim body 只取其余七个字段。 */
  grantClaim: HandoffClaimRequest & { handoffId: string };
}

/** 正式 lease-acks body，禁止把 Origin、subject 或自报 fence 混入顶层。 */
export interface HandoffLeaseAckRequest {
  claimId: string;
  grant: HandoffGrant;
}

export interface HandoffSnapshotEnvelope {
  schemaVersion: "1.0";
  snapshotId: string;
  accountSubjectRef: string;
  snapshotVersion: number;
  handoffBinding: {
    handoffId: string;
    commandId: string;
    attemptId: string;
  };
  authorityFence: {
    accountSubjectRef: string;
    handoffEpoch: number;
    actorLeaseId: string;
  };
  mergePolicy: {
    mode: "apply_once_if_fence_current";
    idempotencyKey: string;
  };
  generatedAt: number;
  payload: {
    schemaVersion: "prototype-1.0";
    kind: "account_snapshot";
    records: unknown[];
  };
}

export interface HandoffClaimAck {
  claimId: string;
  claimRequestId: string;
  handoffId: string;
  accountSubjectRef: string;
  commandId: string;
  attemptId: string;
  snapshotVersion: number;
  handoffEpoch: number;
  actorLeaseId: string;
  targetOrigin: string;
  leaseState: "TRANSFERRING";
  claimedAt: number;
  command: DeliveredTakeoverCommand;
  attempt: HandoffGrantAttemptBinding;
  snapshotEnvelope: HandoffSnapshotEnvelope;
}

/** claim 成功回执只追加不改写；canonicalPayload 同时绑定可信 Origin。 */
export interface HandoffClaimReceipt {
  /** 来自正式 URL path，不属于 request body。 */
  handoffId: string;
  request: HandoffClaimRequest;
  trustedOrigin: string;
  canonicalPayload: string;
  commandVersion: number;
  grantExpiresAt: number;
  ack: HandoffClaimAck;
}

export interface HandoffLeaseAck {
  leaseAckId: string;
  /** 只能来自账户服务已持久化的 claim receipt。 */
  claimId: string;
  commandId: string;
  attemptId: string;
  accountSubjectRef: string;
  handoffId: string;
  snapshotVersion: number;
  handoffEpoch: number;
  actorLeaseId: string;
  replacedActorLeaseId?: string;
  leaseState: "REMOTE_ACTIVE";
  leaseAckAt: number;
}

export interface HandoffCancelAck {
  kind: "lease_cancelled";
  cancelAckId: string;
  commandId: string;
  attemptId: string;
  accountSubjectRef: string;
  cancelledAppliedActorLeaseId?: string;
  cancelledCandidateActorLeaseIds: string[];
  handoffEpoch: number;
  leaseState: "WHITE_ACTIVE";
  cancelAckAt: number;
}

export interface AlreadyWhiteAck {
  kind: "already_white";
  alreadyWhiteAckId: string;
  commandId: string;
  attemptId: string;
  accountSubjectRef: string;
  handoffEpoch: number;
  leaseState: "WHITE_ACTIVE";
  verifiedAt: number;
}

export type RevokeAuthorityAck = HandoffCancelAck | AlreadyWhiteAck;

export interface PendingHandoffAbortAck {
  abortAckId: string;
  commandId: string;
  attemptId: string;
  accountSubjectRef: string;
  handoffId: string;
  cancelledCandidateActorLeaseId: string;
  survivingAppliedActorLeaseId?: string;
  handoffEpoch: number;
  leaseState: "WHITE_ACTIVE" | "REMOTE_ACTIVE";
  abortAckAt: number;
}

/** C2 在下行边界解析目录；账本命令本身始终不保存裸 URL。 */
export interface ResolvedTarget {
  remoteTargetKey: ApprovedRemoteTargetKey;
  remoteTargetVersion: number;
  catalogVersion: number;
  url: string;
  origin: string;
  status: "active";
  resolvedAt: number;
}

export interface DeliveredTakeoverCommand extends LedgerTakeoverCommand {
  schemaVersion: "1.0";
  resolvedTarget?: ResolvedTarget;
}

/** Janus 与 K6 直接交换的唯一 ACK schema。 */
export interface AckEvent {
  schemaVersion: "1.0";
  attemptId: string;
  eventId: string;
  eventSeq: number;
  commandId: string;
  deviceId: string;
  /** 仅 handoff/cancel 类事件回显账户服务派生的 opaque 引用。 */
  accountSubjectRef?: string;
  commandVersion: number;
  commandType: TakeoverCommandType;
  policyBundleVersion: number;
  sessionId: string;
  status: AckStatus;
  observedAt: number;
  idempotencyKey: string;
  failureCode?: FailureCode;
  failureReason?: string;
  failureClass?: FailureClass;
  retryability?: Retryability;
  failureStage?: FailureStage;
  handoffId?: string;
  snapshotVersion?: number;
  handoffEpoch?: number;
  actorLeaseId?: string;
  leaseState?: ActorLeaseState;
  claimId?: string;
  leaseAckId?: string;
  revokeAuthorityAckKind?: RevokeAuthorityAck["kind"];
  handoffCancelAckId?: string;
  alreadyWhiteAckId?: string;
  pendingHandoffAbortAckId?: string;
  revokeTargetCleared?: boolean;
  boundaryId?: string;
  boundaryReportId?: string;
}

export interface RecordedAckEvent extends AckEvent {
  ignoredReason?: "DUPLICATE" | "OUT_OF_ORDER" | "STALE_COMMAND" | "TYPE_MISMATCH" | "INVALID_PHASE" | "TERMINAL" | "SESSION_BOUNDARY_REQUIRED" | "LEASE_ACK_REQUIRED";
}

export type ActorLeaseState = "WHITE_ACTIVE" | "TRANSFERRING" | "REMOTE_ACTIVE";

export interface AppliedLease {
  accountSubjectRef: string;
  handoffId: string;
  snapshotVersion: number;
  handoffEpoch: number;
  actorLeaseId: string;
  /** 只能来自账户服务已持久化的 claim receipt。 */
  claimId: string;
  leaseAckId: string;
  leaseAckAt: number;
}

/**
 * 账户服务的共享事实投影。设备级执行态不得自行铸造这些字段；同一账户最多一个
 * active actor，候选租约也必须在同一 subject 下统一裁定。
 */
export interface AccountAuthorityActor extends AppliedLease {
  deviceId: string;
  commandId: string;
  attemptId: string;
  commandVersion: number;
  /** CHANGE_TARGET 时由权威 active lease query 返回，证明旧 actor 已被原子替换。 */
  replacedActorLeaseId?: string;
}

export interface AccountAuthorityCandidate extends HandoffGrant {
  deviceId: string;
  commandVersion: number;
}

export type AccountAuthorityRequestRejectionReason =
  | "active_actor_exists"
  | "replacement_missing"
  | "replacement_mismatch"
  | "replacement_owned_by_other_device"
  | "unexpected_replacement"
  | "request_conflict"
  | "candidate_exists"
  | "recovery_binding_missing"
  | "wrong_command_type"
  | "invalid_effective_timing"
  | "authority_quarantined"
  | "stale_command";

/** 账户服务的幂等请求账本；结果可重放，既有记录不得原地改写或删除。 */
export interface AccountAuthorityRequestReceipt {
  receiptId: string;
  commandId: string;
  attemptId: string;
  commandVersion: number;
  commandType: TakeoverCommandType;
  accountSubjectRef: string;
  deviceId: string;
  canonicalPayload: string;
  outcome: "grant_issued" | "revoke_acknowledged" | "rejected";
  grant?: HandoffGrant;
  deliveredCommand?: DeliveredTakeoverCommand;
  attemptBinding?: HandoffGrantAttemptBinding;
  revokeAck?: RevokeAuthorityAck;
  rejectionReason?: AccountAuthorityRequestRejectionReason;
  recordedAt: number;
}

/** REVOKE 专用 canonical 幂等账本；即使 subject 后续重新激活，旧 ACK 仍可精确重放。 */
export interface AccountAuthorityRevokeReceipt {
  commandId: string;
  attemptId: string;
  deviceId: string;
  commandVersion: number;
  requestFingerprint: string;
  ack: RevokeAuthorityAck;
}

export interface AccountAuthorityProjection {
  accountSubjectRef: string;
  handoffEpoch: number;
  /** subject 级已接受命令水位；设备自己的 commandVersion 不得绕开此栅栏。 */
  maxCommandVersion: number;
  /** subject 级已签发/预留水位；先于 authority 受理推进，避免跨设备并发签出同一版本。 */
  issuedCommandVersion: number;
  /** 最近一次已接受 REVOKE 的版本；不高于此版本的 grant 永久失效。 */
  revokeFloor: number;
  leaseState: ActorLeaseState;
  /** 仅设备态声称存在 lease/candidate、但权威 receipts 不完整时必须阻断一切新变更。 */
  quarantineReason?: "UNVERIFIED_DEVICE_AUTHORITY";
  activeActor?: AccountAuthorityActor;
  pendingCandidates: AccountAuthorityCandidate[];
  requestReceipts: AccountAuthorityRequestReceipt[];
  /** 远程 H5 对 grant 的领取事实；同 handoff 至多一个 canonical claim。 */
  claimReceipts: HandoffClaimReceipt[];
  /** 同 commandId/attemptId + fingerprint 重放必须返回原 ACK，不得再次推进 epoch。 */
  revokeReceipts: AccountAuthorityRevokeReceipt[];
  updatedAt: number;
}

export interface TakeoverExecution {
  desiredMode: TakeoverMode;
  appliedMode: TakeoverMode;
  phase: TakeoverExecutionPhase;
  desiredRemoteTargetKey?: ApprovedRemoteTargetKey;
  desiredRemoteTargetVersion?: number;
  appliedRemoteTargetKey?: ApprovedRemoteTargetKey;
  appliedRemoteTargetVersion?: number;
  commandVersion: number;
  appliedCommandVersion: number;
  actorState: ActorLeaseState;
  appliedLease?: AppliedLease;
  pendingHandoff?: HandoffGrant;
  currentCommand?: LedgerTakeoverCommand;
  commandHistory: LedgerTakeoverCommand[];
  currentClaim?: CommandClaim;
  claims: CommandClaim[];
  cancellations: CommandCancellationFact[];
  /** 抢占/失败时由账户权威确认的精确候选中止事实；append-only。 */
  handoffAbortFacts?: PendingHandoffAbortAck[];
  attempts: RecordedAckEvent[];
  commandId?: string;
  attemptId?: string;
  requestedAt?: number;
  acknowledgedAt?: number;
  leaseAckAt?: number;
  pendingHandoffAbortAckAt?: number;
  revokeAuthorityAckAt?: number;
  failureReason?: string;
  failureClass?: FailureClass;
  failureCode?: FailureCode;
  retryability?: Retryability;
  failureStage?: FailureStage;
}

/** 设备成熟度信号(PRD §6.3.2 / §13.3)。 */
export interface MaturitySignals {
  appOpenCount: number;
  sessionCount: number;
  repeatStreakDays: number;
  foregroundDurationSeconds: number;
  benchmarkViewed: boolean;
  optimizeDone: boolean;
  marketViewed: boolean;
  walletViewed: boolean;
}

/** 环境风险信号(PRD §6.3.5 / §13.4)。 */
export interface EnvironmentSignals {
  environmentRiskScore: number;
  riskReasons: string[];
  isHeadless: boolean;
  automationSignalCount: number;
  fpBlocklistHit: boolean;
  screenAnomaly: boolean;
  timezoneMismatch: boolean;
  languageMismatch: boolean;
}

export interface Device {
  /** 稳定设备主键;覆盖、审计与 UI 均以此关联。 */
  deviceId: string;
  /** 账户服务提供的 opaque 主体引用；多个设备可共享同一账户主体。 */
  accountSubjectRef: string;
  firstSeenAt: number;
  lastSeenAt: number;
  installAt?: number;
  installDays: number;
  inviteCode?: string;
  channel?: string;
  cohortId?: string;
  status: DeviceStatus;
  statusSource: StatusSource;
  /** 兼容策略条件的设备实态投影:仅 appliedMode=REMOTE 时为 true。 */
  activated: boolean;
  takeover: TakeoverExecution;
  maturityScore: number;
  recommendationScore: number;
  environmentRiskScore: number;
  priorityScore: number;
  ua?: string;
  platform: "iOS" | "Android";
  model: string;
  osName: string;
  browser: string;
  maturity: MaturitySignals;
  environment: EnvironmentSignals;
  /** 最近命中的策略名 + 版本。 */
  hitStrategy?: string;
  hitStrategyVersion?: number;
  latestDecision?: DecisionSnapshot;
  signalRevision: number;
  sessions: Session[];
  latestSessionId: string;
  latestSession?: Session;
  latestReport: ReportEnvelope;
  reports: ReportEnvelope[];
  ignoredReports: IngestedReport[];
  manualOverride?: ManualOverride;
  /** 最近人工操作人 + 原因(队列列展示)。 */
  lastOperatorId?: string;
  lastOperationReason?: string;
  activationKind?: "auto" | "manual" | "session_edge" | "immediate";
  tags: string[];
}

// ===== 健康度(PRD §12)=====
export type HealthLevel = "HEALTHY" | "WARNING" | "RISK" | "CRITICAL";

export interface HealthIndicator {
  key: string;
  label: string;
  value: string;
  level: HealthLevel;
  /** 异常判定说明 + 建议动作(PRD §12.3 / §12.4)。 */
  note: string;
}

export interface HealthReport {
  level: HealthLevel;
  indicators: HealthIndicator[];
  /** 异常原因下钻。 */
  reasons: string[];
  /** 建议处理动作。 */
  suggestions: string[];
}

// ===== 建议等级(PRD §10.3)=====
export type RecommendationLevel =
  | "STRONG"
  | "NORMAL"
  | "OBSERVE"
  | "REJECT"
  | "REVIEW"
  | "FILTER";

/** 首页看板汇总(PRD §5.2 / §20.1)。 */
export interface C2Summary {
  totalDevices: number;
  activeDevices: number;
  newDevices: number;
  recommended: number;
  hit: number;
  activated: number;
  commandPending: number;
  loading: number;
  failed: number;
  revokePending: number;
  revoked: number;
  envFiltered: number;
  manualHold: number;
  manualOverrides: number;
  hitRate: number;
}
