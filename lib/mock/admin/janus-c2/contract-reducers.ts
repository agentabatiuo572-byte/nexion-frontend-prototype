import type {
  AckEvent,
  CommandCancellationReason,
  CommandClaim,
  DeliveredTakeoverCommand,
  EffectiveTiming,
  IngestedReport,
  HandoffGrant,
  HandoffLeaseAck,
  LedgerTakeoverCommand,
  PolicyBundle,
  PolicyBundleReceipt,
  PendingHandoffAbortAck,
  RemoteTarget,
  ReportEnvelope,
  ReportIngestAck,
  ReportIngestDisposition,
  ReportIngestReason,
  RecordedAckEvent,
  ReportProjection,
  ReportSessionProjection,
  RevokeAuthorityAck,
  Strategy,
  TakeoverCommandType,
  TakeoverExecution,
} from "./types.ts";

export const ACTION_HARD_SAFETY_RANK: Record<Strategy["action"]["type"], number> = {
  BLOCK: 3, MANUAL_HOLD: 2, ENV_FILTER: 1,
  BENIGN: 0, RECOMMEND: 0, DRY_RUN_ONLY: 0, REVERSAL_SESSION_EDGE: 0, REVERSAL_IMMEDIATE: 0,
};

const ACTION_CONSERVATIVE_RANK: Record<Strategy["action"]["type"], number> = {
  BENIGN: 3, DRY_RUN_ONLY: 3, RECOMMEND: 3,
  REVERSAL_SESSION_EDGE: 2, REVERSAL_IMMEDIATE: 1,
  ENV_FILTER: 0, MANUAL_HOLD: 0, BLOCK: 0,
};

/** 完整总序：硬安全层绝对优先；其余先数值优先级，再低风险，最后稳定 strategyId。 */
export function compareStrategyOrder(a: Strategy, b: Strategy): number {
  return ACTION_HARD_SAFETY_RANK[b.action.type] - ACTION_HARD_SAFETY_RANK[a.action.type]
    || b.priority - a.priority
    || ACTION_CONSERVATIVE_RANK[b.action.type] - ACTION_CONSERVATIVE_RANK[a.action.type]
    || a.strategyId.localeCompare(b.strategyId);
}

export interface PolicyReceiptProjection {
  bundles: PolicyBundle[];
  publishedBundleVersion?: number;
  appliedBundleVersion?: number;
  receipts: PolicyBundleReceipt[];
}

function validPolicyReceipt(input: PolicyBundleReceipt): boolean {
  const receipt = input as unknown as Record<string, unknown>;
  if (typeof receipt.receiptId !== "string" || receipt.receiptId.trim() === ""
    || typeof receipt.bundleVersion !== "number" || !Number.isInteger(receipt.bundleVersion) || receipt.bundleVersion < 1
    || !["compile", "apply"].includes(String(receipt.stage))
    || typeof receipt.receivedAt !== "number" || !Number.isFinite(receipt.receivedAt)
    || !["succeeded", "failed"].includes(String(receipt.outcome))) return false;
  const hasFailedReason = Object.prototype.hasOwnProperty.call(receipt, "failedReason");
  return receipt.outcome === "succeeded"
    ? !hasFailedReason
    : hasFailedReason && typeof receipt.failedReason === "string" && receipt.failedReason.trim() !== "";
}

/** 编译/应用回执只更新显式绑定的当前发布包；旧包与非法阶段仅保留历史。 */
export function reducePolicyReceipt(state: PolicyReceiptProjection, input: PolicyBundleReceipt): PolicyReceiptProjection {
  if (state.receipts.some((r) => r.receiptId === input.receiptId)) return state;
  const bundle = state.bundles.find((b) => b.bundleVersion === input.bundleVersion);
  let ignoredReason: PolicyBundleReceipt["ignoredReason"];
  if (!validPolicyReceipt(input)) ignoredReason = "INVALID_RECEIPT";
  else if (!bundle) ignoredReason = "UNKNOWN_BUNDLE";
  else if (input.bundleVersion !== state.publishedBundleVersion) ignoredReason = "STALE_BUNDLE";
  else if (input.stage === "compile" && !["PENDING", "FAILED"].includes(bundle.compileStatus)) ignoredReason = "INVALID_STAGE";
  else if (input.stage === "apply" && (bundle.compileStatus !== "SUCCEEDED" || !["PENDING", "FAILED"].includes(bundle.applyStatus))) ignoredReason = "INVALID_STAGE";

  const receipt = ignoredReason ? { ...input, ignoredReason } : input;
  if (ignoredReason || !bundle) return { ...state, receipts: [receipt, ...state.receipts] };

  const updated: PolicyBundle = input.stage === "compile"
    ? input.outcome === "succeeded"
      ? { ...bundle, compileStatus: "SUCCEEDED", applyStatus: "PENDING", compiledAt: input.receivedAt, failureReason: undefined }
      : { ...bundle, compileStatus: "FAILED", applyStatus: "NOT_APPLIED", failureReason: input.failedReason }
    : input.outcome === "succeeded"
      ? { ...bundle, applyStatus: "APPLIED", appliedAt: input.receivedAt, failureReason: undefined }
      : { ...bundle, applyStatus: "FAILED", failureReason: input.failedReason };
  return {
    ...state,
    bundles: state.bundles.map((b) => b.bundleVersion === updated.bundleVersion ? updated : b),
    appliedBundleVersion: updated.applyStatus === "APPLIED" ? updated.bundleVersion : state.appliedBundleVersion,
    receipts: [receipt, ...state.receipts],
  };
}

export type AckDisposition = "APPLIED" | NonNullable<RecordedAckEvent["ignoredReason"]>;
export interface AckReduction { execution: TakeoverExecution; disposition: AckDisposition }
export interface AckReductionContext {
  /** C2 接收本 ACK 的服务端时间；received claim 禁止回退使用设备 observedAt。 */
  ackReceivedAt?: number;
  reportProjection?: ReportProjection;
  deliveredCommand?: DeliveredTakeoverCommand;
  handoffGrant?: HandoffGrant;
  /** 只能是 GET /handoffs/:id/lease 的权威对账结果；远端 postMessage 仅可触发查询。 */
  handoffLeaseAck?: HandoffLeaseAck;
  revokeAuthorityAck?: RevokeAuthorityAck;
  /** C2 从已认证设备/账户上下文取得；AlreadyWhite 分支不能相信事件自报 subject。 */
  authorityAccountSubjectRef?: string;
  pendingHandoffAbortAck?: PendingHandoffAbortAck;
}
export type ReceiptSampleOutcome = "success" | "handoff_failed" | "revoke_succeeded" | "old_version_ignored" | "duplicate_ignored" | "session_edge_wait";

export function canonicalCommandEffectiveTiming(commandType: TakeoverCommandType, requested: EffectiveTiming): EffectiveTiming {
  return commandType === "REVOKE" ? "immediate" : requested;
}

const IN_FLIGHT_PHASES: TakeoverExecution["phase"][] = [
  "COMMAND_PENDING_ACK", "RECEIVED", "WAITING_SESSION_EDGE", "LOADING", "HANDOFF_FETCHING", "HANDOFF_MERGING", "HANDOFF_ACKED", "REVOKE_PENDING_ACK",
];

/** 普通 ACTIVATE 不得抢占已有 attempt；仅更高 REVOKE/CHANGE_TARGET 可抢占非终态。 */
export function commandCanPreempt(execution: TakeoverExecution, commandType: TakeoverCommandType): boolean {
  return !IN_FLIGHT_PHASES.includes(execution.phase) || commandType === "REVOKE" || commandType === "CHANGE_TARGET";
}

/** subject 级版本必须同时越过设备局部水位与账户权威水位。 */
export function nextSubjectCommandVersion(deviceCommandVersion: number, authorityMaxCommandVersion: number): number {
  if (![deviceCommandVersion, authorityMaxCommandVersion].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError("subject command watermarks must be non-negative safe integers");
  }
  const next = Math.max(deviceCommandVersion, authorityMaxCommandVersion) + 1;
  if (!Number.isSafeInteger(next)) throw new RangeError("subject command version exhausted the safe integer range");
  return next;
}

export function reserveSubjectCommandVersion(
  deviceCommandVersion: number,
  authorityMaxCommandVersion: number,
  issuedCommandVersion: number,
): { commandVersion: number; issuedCommandVersion: number } {
  if (![deviceCommandVersion, authorityMaxCommandVersion, issuedCommandVersion]
    .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError("subject command watermarks must be non-negative safe integers");
  }
  const commandVersion = nextSubjectCommandVersion(deviceCommandVersion, Math.max(authorityMaxCommandVersion, issuedCommandVersion));
  return { commandVersion, issuedCommandVersion: commandVersion };
}

/** 更高命令抢占前，先形成可由账户权威逐字段核验的旧候选中止事实。 */
export function pendingHandoffAbortForPreemption(execution: TakeoverExecution, at: number): PendingHandoffAbortAck | undefined {
  const pending = execution.pendingHandoff;
  const command = execution.currentCommand;
  const attemptId = execution.attemptId;
  if (!pending || !command || !attemptId || pending.commandId !== command.commandId || pending.attemptId !== attemptId) return undefined;
  return {
    abortAckId: `HAB-PREEMPT-${command.commandId}-${attemptId}`,
    commandId: command.commandId,
    attemptId,
    accountSubjectRef: pending.accountSubjectRef,
    handoffId: pending.handoffId,
    cancelledCandidateActorLeaseId: pending.actorLeaseId,
    survivingAppliedActorLeaseId: execution.appliedLease?.actorLeaseId,
    handoffEpoch: pending.handoffEpoch,
    leaseState: execution.appliedLease ? "REMOTE_ACTIVE" : "WHITE_ACTIVE",
    abortAckAt: at,
  };
}

/** 运行态 freshness 只认 C2 receivedAt；无该字段的 seed 是显式 legacy fallback。 */
export function reportFreshnessAt(report: ReportEnvelope | IngestedReport): number {
  return "receivedAt" in report ? report.receivedAt : report.observedAt;
}

export function projectDeviceLastSeenAt(baseline: number, reports: Array<ReportEnvelope | IngestedReport>): number {
  return Math.max(baseline, ...reports.map(reportFreshnessAt));
}

export function receiptSampleCompatible(command: LedgerTakeoverCommand, phase: TakeoverExecution["phase"], outcome: ReceiptSampleOutcome): boolean {
  if (outcome === "old_version_ignored" || outcome === "duplicate_ignored") return true;
  if (outcome === "revoke_succeeded") return command.type === "REVOKE" && command.effectiveTiming === "immediate" && phase === "REVOKE_PENDING_ACK";
  if (outcome === "session_edge_wait") return command.type !== "REVOKE" && command.effectiveTiming === "session_edge" && phase === "COMMAND_PENDING_ACK";
  if (outcome === "handoff_failed") return command.type !== "REVOKE" && phase !== "HANDOFF_ACKED";
  return command.type !== "REVOKE";
}

/** 账本命令到下行命令的唯一边界解析器；账本永不保存裸 URL。 */
export function deliverTakeoverCommand(
  command: LedgerTakeoverCommand,
  catalogHistory: RemoteTarget[],
  deliveryCatalogVersion = Math.max(0, ...catalogHistory.map((target) => target.catalogVersion)),
  resolvedAt = Date.now(),
): DeliveredTakeoverCommand | undefined {
  if (command.type === "REVOKE") return command.effectiveTiming === "immediate" ? { ...command, schemaVersion: "1.0" } : undefined;
  const target = [...catalogHistory]
    .filter((item) => item.catalogVersion <= deliveryCatalogVersion && item.remoteTargetKey === command.remoteTargetKey && item.remoteTargetVersion === command.remoteTargetVersion)
    .sort((a, b) => b.catalogVersion - a.catalogVersion)[0];
  if (!target || target.status !== "active"
    || target.remoteTargetKey !== command.remoteTargetKey
    || target.remoteTargetVersion !== command.remoteTargetVersion
    || command.catalogVersion > deliveryCatalogVersion) return undefined;
  return {
    ...command,
    schemaVersion: "1.0",
    resolvedTarget: {
      remoteTargetKey: target.remoteTargetKey,
      remoteTargetVersion: target.remoteTargetVersion,
      catalogVersion: command.catalogVersion,
      url: target.url,
      origin: target.origin,
      status: "active",
      resolvedAt,
    },
  };
}

const terminal = (phase: TakeoverExecution["phase"]): boolean => ["SUCCEEDED", "FAILED", "CANCELLED", "REVOKED"].includes(phase);

export function commandHasTerminalOutcome(execution: TakeoverExecution, command: LedgerTakeoverCommand): boolean {
  return (execution.currentCommand?.commandId === command.commandId && execution.currentCommand.commandVersion === command.commandVersion && terminal(execution.phase))
    || execution.attempts.some((event) => event.commandId === command.commandId && event.commandVersion === command.commandVersion && !event.ignoredReason && ["succeeded", "failed", "cancelled"].includes(event.status));
}

export function cancellationReasonForCommandClaim(
  command: LedgerTakeoverCommand,
  execution: TakeoverExecution,
  appliedCommandVersion: number,
  latestVersion: number,
  at: number,
  targets: RemoteTarget[],
): CommandCancellationReason | undefined {
  if (commandHasTerminalOutcome(execution, command)) return undefined;
  const cancellation = (execution.cancellations ?? []).find((fact) => fact.commandId === command.commandId && fact.commandVersion === command.commandVersion);
  if (cancellation) return cancellation.reason;
  if (command.validUntil < at) return "expired";
  if (command.remoteTargetKey && !deliverTakeoverCommand(command, targets)) return "target_disabled";
  if (command.commandVersion <= appliedCommandVersion || command.commandVersion < latestVersion) return "superseded";
  return undefined;
}

export function compressCommandQueue(
  execution: TakeoverExecution,
  appliedCommandVersion: number,
  at: number,
  targets: RemoteTarget[],
): TakeoverExecution {
  const cancellations = [...(execution.cancellations ?? [])];
  for (const command of execution.commandHistory) {
    if (commandHasTerminalOutcome(execution, command)) continue;
    const reason = cancellationReasonForCommandClaim(command, { ...execution, cancellations }, appliedCommandVersion, execution.commandVersion, at, targets);
    if (!reason || cancellations.some((fact) => fact.commandId === command.commandId && fact.commandVersion === command.commandVersion)) continue;
    cancellations.push({
      cancellationId: `CAN-${command.commandId}-${reason}`,
      deviceId: command.deviceId,
      commandId: command.commandId,
      attemptId: execution.attemptId ?? `UNCLAIMED-${command.commandId}`,
      commandVersion: command.commandVersion,
      cancelledAt: at,
      reason,
    });
  }
  const currentCancelled = !!execution.currentCommand && cancellations.some((fact) => fact.commandId === execution.currentCommand?.commandId && fact.commandVersion === execution.currentCommand?.commandVersion);
  return currentCancelled && ["COMMAND_PENDING_ACK", "WAITING_SESSION_EDGE"].includes(execution.phase)
    ? { ...execution, cancellations, desiredMode: execution.appliedMode, phase: "CANCELLED", failureCode: undefined, failureClass: "contract", retryability: "terminal", failureStage: execution.phase === "WAITING_SESSION_EDGE" ? "waiting_session_edge" : "delivery", failureReason: "命令在领取前已取消" }
    : { ...execution, cancellations };
}

export function claimHighestValidCommand(
  execution: TakeoverExecution,
  appliedCommandVersion: number,
  at: number,
  targets: RemoteTarget[],
): { execution: TakeoverExecution; command?: LedgerTakeoverCommand } {
  const compressed = compressCommandQueue(execution, appliedCommandVersion, at, targets);
  const command = [...compressed.commandHistory]
    .sort((a, b) => b.commandVersion - a.commandVersion)
    .find((candidate) => !commandHasTerminalOutcome(compressed, candidate)
      && !cancellationReasonForCommandClaim(candidate, compressed, appliedCommandVersion, compressed.commandVersion, at, targets)
      && !!deliverTakeoverCommand(candidate, targets));
  return { execution: compressed, command };
}

function ignored(execution: TakeoverExecution, event: AckEvent, reason: Exclude<AckDisposition, "APPLIED" | "DUPLICATE">): AckReduction {
  // 会话边界与 Report 摄取可能并发到达；未知边界可重试，不能用同 eventId 永久毒化 ACK 历史。
  if (reason === "SESSION_BOUNDARY_REQUIRED") return { execution, disposition: reason };
  return { execution: { ...execution, attempts: [...execution.attempts, { ...event, ignoredReason: reason }] }, disposition: reason };
}

function statusAllowed(execution: TakeoverExecution, event: AckEvent): boolean {
  if (event.status === "failed" || event.status === "cancelled") return !terminal(execution.phase) && !["NONE", "HANDOFF_ACKED"].includes(execution.phase);
  if (event.commandType === "REVOKE") {
    return (execution.phase === "REVOKE_PENDING_ACK" && event.status === "received")
      || (execution.phase === "RECEIVED" && event.status === "succeeded");
  }
  switch (execution.phase) {
    case "COMMAND_PENDING_ACK": return event.status === "received";
    case "RECEIVED": return execution.currentCommand?.effectiveTiming === "session_edge" && !execution.currentClaim?.executionSessionId
      ? event.status === "waiting_session_edge"
      : event.status === "webview_loading";
    case "WAITING_SESSION_EDGE": return event.status === "session_boundary";
    case "LOADING": return event.status === "handoff_fetching";
    case "HANDOFF_FETCHING": return event.status === "handoff_merging";
    case "HANDOFF_MERGING": return event.status === "handoff_acked";
    case "HANDOFF_ACKED": return event.status === "succeeded";
    default: return false;
  }
}

function sessionEstablishedAt(session: ReportSessionProjection, projection: ReportProjection): number | undefined {
  return session.establishedAt ?? projection.acceptedReports.find((report) => report.sessionId === session.sessionId)?.receivedAt;
}

function acceptedBoundary(event: AckEvent, context: AckReductionContext, claim: CommandClaim): boolean {
  const projection = context.reportProjection;
  if (!projection || !event.boundaryId || !event.boundaryReportId || projection.latestSessionId !== event.sessionId
    || event.sessionId !== claim.claimedSessionId || claim.ackReceivedAt == null
    || !Number.isInteger(claim.claimedReportArrivalIndex) || claim.claimedReportArrivalIndex! < 0) return false;
  return projection.acceptedReports.some((report) =>
    report.reportId === event.boundaryReportId
    && report.boundaryId === event.boundaryId
    && report.sessionId === event.sessionId
    && report.eventType === "session_boundary"
    && report.ingestDisposition === "APPLIED"
    && report.arrivalIndex > claim.claimedReportArrivalIndex!);
}

function acceptedNewSessionBoundary(event: AckEvent, context: AckReductionContext, claim: CommandClaim): boolean {
  const projection = context.reportProjection;
  if (!projection || event.boundaryId !== undefined || event.boundaryReportId !== undefined || event.sessionId === claim.claimedSessionId
    || projection.latestSessionId !== event.sessionId || claim.ackReceivedAt == null
    || !Number.isInteger(claim.claimedReportArrivalIndex) || claim.claimedReportArrivalIndex! < 0
    || !Number.isInteger(claim.claimedSessionEstablishmentOrder) || claim.claimedSessionEstablishmentOrder! < 1) return false;
  const session = projection.sessions.find((candidate) => candidate.sessionId === event.sessionId);
  if (!session || session.establishmentOrder <= claim.claimedSessionEstablishmentOrder!) return false;
  return projection.acceptedReports.some((report) => report.sessionId === event.sessionId
    && report.eventType === "session_started"
    && report.ingestDisposition === "APPLIED"
    && report.arrivalIndex > claim.claimedReportArrivalIndex!);
}

/** 唯一 ACK reducer：只让当前 command/attempt/session/handoff 的有效事实推进实态。 */
export function reduceCommandAck(execution: TakeoverExecution, event: AckEvent, context: AckReductionContext = {}): AckReduction {
  if (execution.attempts.some((e) => e.eventId === event.eventId)) return { execution, disposition: "DUPLICATE" };
  const command = execution.currentCommand;
  if (!command || command.commandId !== event.commandId || command.commandVersion !== event.commandVersion) return ignored(execution, event, "STALE_COMMAND");
  if (event.schemaVersion !== "1.0" || command.type !== event.commandType || command.deviceId !== event.deviceId || command.policyBundleVersion !== event.policyBundleVersion) return ignored(execution, event, "TYPE_MISMATCH");
  if (terminal(execution.phase)) return ignored(execution, event, "TERMINAL");
  if (!execution.attemptId || event.attemptId !== execution.attemptId) return ignored(execution, event, "STALE_COMMAND");
  const priorSeq = Math.max(0, ...execution.attempts.filter((e) => e.attemptId === event.attemptId && !e.ignoredReason).map((e) => e.eventSeq));
  if (event.eventSeq <= priorSeq) return ignored(execution, event, "OUT_OF_ORDER");
  if (!statusAllowed(execution, event)) return ignored(execution, event, "INVALID_PHASE");
  if (!Number.isFinite(context.ackReceivedAt)) return ignored(execution, event, "TYPE_MISMATCH");

  const claimedSessionId = execution.currentClaim?.claimedSessionId;
  const executionSessionId = execution.currentClaim?.executionSessionId ?? claimedSessionId;
  if (event.status === "received" && claimedSessionId && claimedSessionId !== event.sessionId) return ignored(execution, event, "TYPE_MISMATCH");
  if (event.status === "session_boundary") {
    const claim = execution.currentClaim;
    if (!claim) return ignored(execution, event, "TYPE_MISMATCH");
    if (!acceptedNewSessionBoundary(event, context, claim) && !acceptedBoundary(event, context, claim)) return ignored(execution, event, "SESSION_BOUNDARY_REQUIRED");
  } else if (executionSessionId && event.status !== "received" && event.sessionId !== executionSessionId) {
    return ignored(execution, event, "TYPE_MISMATCH");
  }

  if (event.status === "handoff_fetching") {
    const grant = context.handoffGrant;
    const delivered = context.deliveredCommand;
    const replacementMatches = command.type === "CHANGE_TARGET"
      ? !!execution.appliedLease && grant?.replacesActorLeaseId === execution.appliedLease.actorLeaseId
      : !grant?.replacesActorLeaseId;
    if (!grant || !delivered || delivered.commandId !== command.commandId || delivered.schemaVersion !== "1.0" || !delivered.resolvedTarget
      || grant.commandId !== event.commandId || grant.attemptId !== event.attemptId || grant.accountSubjectRef !== event.accountSubjectRef
      || grant.operation !== command.type || grant.handoffId !== event.handoffId || grant.snapshotVersion !== event.snapshotVersion
      || grant.handoffEpoch !== event.handoffEpoch || grant.actorLeaseId !== event.actorLeaseId || grant.leaseState !== "TRANSFERRING"
      || grant.targetOrigin !== delivered.resolvedTarget.origin || grant.expiresAt <= context.ackReceivedAt! || !replacementMatches) {
      return ignored(execution, event, "LEASE_ACK_REQUIRED");
    }
  }
  if (["handoff_merging", "handoff_acked"].includes(event.status)
    && (!event.accountSubjectRef || event.accountSubjectRef !== execution.pendingHandoff?.accountSubjectRef
      || !event.handoffId || event.handoffId !== execution.pendingHandoff.handoffId
      || event.snapshotVersion !== execution.pendingHandoff?.snapshotVersion
      || event.handoffEpoch !== execution.pendingHandoff?.handoffEpoch
      || event.actorLeaseId !== execution.pendingHandoff?.actorLeaseId)) {
    return ignored(execution, event, "LEASE_ACK_REQUIRED");
  }
  if (event.status === "handoff_acked") {
    const grant = context.handoffGrant;
    const leaseAck = context.handoffLeaseAck;
    const pending = execution.pendingHandoff;
    if (!pending || !grant || grant.operation !== command.type || grant.commandId !== event.commandId || grant.attemptId !== event.attemptId || grant.accountSubjectRef !== event.accountSubjectRef || grant.handoffId !== event.handoffId
      || grant.snapshotVersion !== event.snapshotVersion || grant.handoffEpoch !== event.handoffEpoch
      || grant.accountSubjectRef !== pending.accountSubjectRef || grant.handoffId !== pending.handoffId || grant.snapshotVersion !== pending.snapshotVersion
      || grant.handoffEpoch !== pending.handoffEpoch || grant.actorLeaseId !== pending.actorLeaseId || grant.replacesActorLeaseId !== pending.replacesActorLeaseId
      || !event.claimId || !event.claimId.trim() || !leaseAck || leaseAck.claimId !== event.claimId
      || leaseAck.leaseAckId !== event.leaseAckId || leaseAck.commandId !== event.commandId || leaseAck.attemptId !== event.attemptId
      || leaseAck.accountSubjectRef !== event.accountSubjectRef || leaseAck.handoffId !== event.handoffId || leaseAck.snapshotVersion !== event.snapshotVersion
      || leaseAck.handoffEpoch !== event.handoffEpoch || leaseAck.actorLeaseId !== event.actorLeaseId || leaseAck.leaseState !== event.leaseState
      || !Number.isFinite(leaseAck.leaseAckAt) || leaseAck.leaseAckAt < 0 || leaseAck.leaseAckAt > context.ackReceivedAt!
      || leaseAck.replacedActorLeaseId !== grant.replacesActorLeaseId
      || event.leaseState !== "REMOTE_ACTIVE") return ignored(execution, event, "LEASE_ACK_REQUIRED");
  }
  if (event.status === "succeeded" && command.type === "REVOKE") {
    const authorityAck = context.revokeAuthorityAck;
    const commonMismatch = !event.revokeTargetCleared || event.leaseState !== "WHITE_ACTIVE" || !authorityAck
      || authorityAck.kind !== event.revokeAuthorityAckKind || authorityAck.commandId !== event.commandId || authorityAck.attemptId !== event.attemptId
      || authorityAck.accountSubjectRef !== event.accountSubjectRef || authorityAck.accountSubjectRef !== context.authorityAccountSubjectRef
      || authorityAck.handoffEpoch !== event.handoffEpoch || authorityAck.leaseState !== "WHITE_ACTIVE";
    const knownLeaseEpoch = Math.max(execution.appliedLease?.handoffEpoch ?? 0, execution.pendingHandoff?.handoffEpoch ?? 0);
    const leaseMismatch = authorityAck?.kind === "lease_cancelled" && (
      authorityAck.cancelAckId !== event.handoffCancelAckId || !!event.alreadyWhiteAckId
      || (knownLeaseEpoch > 0 && authorityAck.handoffEpoch <= knownLeaseEpoch)
      || (!!execution.appliedLease && authorityAck.cancelledAppliedActorLeaseId !== execution.appliedLease.actorLeaseId)
      || (!!execution.pendingHandoff && !authorityAck.cancelledCandidateActorLeaseIds.includes(execution.pendingHandoff.actorLeaseId))
    );
    const whiteMismatch = authorityAck?.kind === "already_white" && (
      authorityAck.alreadyWhiteAckId !== event.alreadyWhiteAckId || !!event.handoffCancelAckId
    );
    if (commonMismatch || leaseMismatch || whiteMismatch) {
      return ignored(execution, event, "LEASE_ACK_REQUIRED");
    }
  }
  if ((event.status === "failed" || event.status === "cancelled") && (!event.failureCode || !event.failureReason || !event.failureClass || !event.retryability || !event.failureStage)) {
    return ignored(execution, event, "TYPE_MISMATCH");
  }
  if ((event.status === "failed" || event.status === "cancelled") && execution.pendingHandoff) {
    const abortAck = context.pendingHandoffAbortAck;
    const expectedLeaseState = execution.appliedLease ? "REMOTE_ACTIVE" : "WHITE_ACTIVE";
    if (!abortAck || abortAck.abortAckId !== event.pendingHandoffAbortAckId || abortAck.commandId !== event.commandId || abortAck.attemptId !== event.attemptId
      || abortAck.accountSubjectRef !== event.accountSubjectRef || abortAck.handoffId !== execution.pendingHandoff.handoffId
      || abortAck.handoffEpoch !== execution.pendingHandoff.handoffEpoch || abortAck.leaseState !== expectedLeaseState
      || abortAck.cancelledCandidateActorLeaseId !== execution.pendingHandoff.actorLeaseId
      || abortAck.survivingAppliedActorLeaseId !== execution.appliedLease?.actorLeaseId) return ignored(execution, event, "LEASE_ACK_REQUIRED");
  }

  let next: TakeoverExecution = { ...execution, attempts: [...execution.attempts, event] };
  if (event.status === "received") {
    const claimedSession = context.reportProjection?.sessions.find((session) => session.sessionId === event.sessionId);
    const ackReceivedAt = context.ackReceivedAt!;
    const claimedReportArrivalIndex = context.reportProjection
      ? Math.max(0, ...context.reportProjection.acceptedReports.map((report) => report.arrivalIndex), ...context.reportProjection.ignoredReports.map((report) => report.arrivalIndex))
      : undefined;
    const claim = {
      claimId: `CLM-${event.eventId}`, commandId: command.commandId, commandVersion: command.commandVersion, attemptId: event.attemptId,
      claimedSessionId: event.sessionId,
      claimedSessionEstablishedAt: claimedSession && context.reportProjection ? sessionEstablishedAt(claimedSession, context.reportProjection) : undefined,
      claimedSessionEstablishmentOrder: claimedSession?.establishmentOrder,
      claimedReportArrivalIndex,
      ackReceivedAt,
      deliveredCommand: context.deliveredCommand ? structuredClone(context.deliveredCommand) : undefined,
      claimedAt: ackReceivedAt,
    };
    next = { ...next, currentClaim: claim, claims: [...(next.claims ?? []), claim], phase: "RECEIVED" };
  } else if (event.status === "waiting_session_edge") next = { ...next, phase: "WAITING_SESSION_EDGE" };
  else if (event.status === "session_boundary") {
    const claim = { ...next.currentClaim!, claimId: `CLM-${event.eventId}`, executionSessionId: event.sessionId };
    next = { ...next, currentClaim: claim, claims: [...(next.claims ?? []), claim], phase: "RECEIVED" };
  } else if (event.status === "webview_loading") next = { ...next, phase: "LOADING" };
  else if (event.status === "handoff_fetching") next = { ...next, phase: "HANDOFF_FETCHING", actorState: next.appliedLease ? "REMOTE_ACTIVE" : "TRANSFERRING", pendingHandoff: context.handoffGrant };
  else if (event.status === "handoff_merging") next = { ...next, phase: "HANDOFF_MERGING" };
  else if (event.status === "handoff_acked") next = {
    ...next,
    phase: "HANDOFF_ACKED",
    leaseAckAt: context.handoffLeaseAck?.leaseAckAt,
    actorState: "REMOTE_ACTIVE",
    appliedLease: context.handoffLeaseAck ? {
      accountSubjectRef: context.handoffLeaseAck.accountSubjectRef,
      handoffId: context.handoffLeaseAck.handoffId,
      snapshotVersion: context.handoffLeaseAck.snapshotVersion,
      handoffEpoch: context.handoffLeaseAck.handoffEpoch,
      actorLeaseId: context.handoffLeaseAck.actorLeaseId,
      claimId: context.handoffLeaseAck.claimId,
      leaseAckId: context.handoffLeaseAck.leaseAckId,
      leaseAckAt: context.handoffLeaseAck.leaseAckAt,
    } : next.appliedLease,
    pendingHandoff: undefined,
  };
  else if (event.status === "failed" || event.status === "cancelled") next = {
    ...next,
    phase: event.status === "cancelled" ? "CANCELLED" : "FAILED",
    actorState: context.pendingHandoffAbortAck?.leaseState ?? (execution.appliedLease ? "REMOTE_ACTIVE" : "WHITE_ACTIVE"),
    pendingHandoff: undefined,
    pendingHandoffAbortAckAt: context.pendingHandoffAbortAck?.abortAckAt,
    failureCode: event.failureCode,
    failureClass: event.failureClass,
    retryability: event.retryability,
    failureStage: event.failureStage,
    failureReason: event.failureReason,
  };
  else if (event.status === "succeeded" && command.type === "REVOKE") next = {
    ...next,
    desiredMode: "CLOAK", appliedMode: "CLOAK", phase: "REVOKED", actorState: "WHITE_ACTIVE",
    appliedCommandVersion: command.commandVersion, acknowledgedAt: context.ackReceivedAt!,
    desiredRemoteTargetKey: undefined, desiredRemoteTargetVersion: undefined,
    appliedRemoteTargetKey: undefined, appliedRemoteTargetVersion: undefined,
    appliedLease: undefined, pendingHandoff: undefined,
    revokeAuthorityAckAt: context.revokeAuthorityAck?.kind === "lease_cancelled" ? context.revokeAuthorityAck.cancelAckAt : context.revokeAuthorityAck?.verifiedAt,
    failureCode: undefined, failureClass: undefined, retryability: undefined, failureStage: undefined, failureReason: undefined,
  };
  else if (event.status === "succeeded") {
    const lease = execution.appliedLease;
    const acceptedLeaseAck = lease && execution.attempts.findLast((attempt) =>
      !attempt.ignoredReason && attempt.status === "handoff_acked" && attempt.schemaVersion === "1.0"
      && attempt.deviceId === command.deviceId && attempt.commandId === command.commandId
      && attempt.commandVersion === command.commandVersion && attempt.commandType === command.type
      && attempt.policyBundleVersion === command.policyBundleVersion && attempt.attemptId === event.attemptId
      && attempt.accountSubjectRef === lease.accountSubjectRef && attempt.handoffId === lease.handoffId
      && attempt.snapshotVersion === lease.snapshotVersion && attempt.handoffEpoch === lease.handoffEpoch
      && attempt.actorLeaseId === lease.actorLeaseId && attempt.claimId === lease.claimId
      && attempt.leaseAckId === lease.leaseAckId && attempt.leaseState === "REMOTE_ACTIVE");
    if (execution.actorState !== "REMOTE_ACTIVE" || !lease || !acceptedLeaseAck
      || execution.pendingHandoff !== undefined
      || typeof lease.claimId !== "string" || !lease.claimId.trim()
      || typeof lease.leaseAckId !== "string" || !lease.leaseAckId.trim() || !Number.isFinite(lease.leaseAckAt)
      || execution.leaseAckAt !== lease.leaseAckAt) return ignored(execution, event, "LEASE_ACK_REQUIRED");
    next = {
      ...next,
      desiredMode: "REMOTE", appliedMode: "REMOTE", phase: "SUCCEEDED",
      appliedCommandVersion: command.commandVersion, acknowledgedAt: context.ackReceivedAt!,
      appliedRemoteTargetKey: command.remoteTargetKey, appliedRemoteTargetVersion: command.remoteTargetVersion,
      failureCode: undefined, failureClass: undefined, retryability: undefined, failureStage: undefined, failureReason: undefined,
    };
  }
  return { execution: next, disposition: "APPLIED" };
}

export interface ReportIngestResult extends ReportIngestAck { projection: ReportProjection; report: IngestedReport }

const blankReportProjection = (deviceId: string): ReportProjection => ({ deviceId, bootSequenceWatermarks: {}, sessions: [], acceptedReports: [], ignoredReports: [] });

const REPORT_EVENT_TYPES: ReportEnvelope["eventType"][] = ["session_started", "session_boundary", "foreground", "heartbeat"];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** ReportEnvelope 的运行时边界；设备时间只验类型，不参与 current/freshness 排序。 */
export function isReportEnvelope(input: unknown): input is ReportEnvelope {
  if (!record(input) || input.schemaVersion !== "1.0" || !nonEmptyString(input.reportId)
    || !nonEmptyString(input.deviceId) || !nonEmptyString(input.sessionId) || !nonEmptyString(input.bootId)
    || typeof input.sequence !== "number" || !Number.isInteger(input.sequence) || input.sequence < 1
    || typeof input.sessionStartedAt !== "number" || !Number.isFinite(input.sessionStartedAt) || input.sessionStartedAt < 0
    || typeof input.appliedCommandVersion !== "number" || !Number.isInteger(input.appliedCommandVersion) || input.appliedCommandVersion < 0
    || typeof input.observedAt !== "number" || !Number.isFinite(input.observedAt) || input.observedAt < 0
    || Object.prototype.hasOwnProperty.call(input, "receivedAt") || Object.prototype.hasOwnProperty.call(input, "arrivalIndex")
    || !REPORT_EVENT_TYPES.includes(input.eventType as ReportEnvelope["eventType"])
    || !record(input.cumulativeSignals) || !record(input.instantaneousSignals)) return false;
  const cumulative = input.cumulativeSignals;
  const instantaneous = input.instantaneousSignals;
  if (![cumulative.appOpenCount, cumulative.sessionCount, cumulative.foregroundDurationSeconds]
    .every((value) => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0)
    || !nonEmptyString(instantaneous.appPhase)
    || typeof instantaneous.environmentRiskScore !== "number" || !Number.isFinite(instantaneous.environmentRiskScore)
    || (instantaneous.ua !== undefined && typeof instantaneous.ua !== "string")) return false;
  return input.eventType === "session_boundary" ? nonEmptyString(input.boundaryId) : input.boundaryId === undefined;
}

function stableCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCanonicalValue);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, stableCanonicalValue(value[key])]));
}

function canonicalReportPayload(report: ReportEnvelope): string {
  return JSON.stringify(stableCanonicalValue({
    reportId: report.reportId,
    deviceId: report.deviceId,
    sessionId: report.sessionId,
    bootId: report.bootId,
    sequence: report.sequence,
    sessionStartedAt: report.sessionStartedAt,
    appliedCommandVersion: report.appliedCommandVersion,
    observedAt: report.observedAt,
    schemaVersion: report.schemaVersion,
    eventType: report.eventType,
    boundaryId: report.boundaryId,
    cumulativeSignals: report.cumulativeSignals,
    instantaneousSignals: report.instantaneousSignals,
  }));
}

function ingested(
  report: ReportEnvelope,
  projection: ReportProjection,
  receivedAt: number,
  disposition: ReportIngestDisposition,
  ignoredReason?: ReportIngestReason,
): IngestedReport {
  const arrivalIndex = projection.acceptedReports.length + projection.ignoredReports.length + 1;
  return {
    ...report,
    receivedAt,
    arrivalIndex,
    ingestDisposition: disposition,
    ignoredReason,
    deviceProjectionRevision: `device:${report.deviceId}:${arrivalIndex}`,
    sessionProjectionRevision: `session:${report.sessionId}:${arrivalIndex}`,
  };
}

function reportResult(projection: ReportProjection, report: IngestedReport): ReportIngestResult {
  const base = {
    projection,
    report,
    reportId: report.reportId,
    disposition: report.ingestDisposition,
    receivedAt: report.receivedAt,
    arrivalIndex: report.arrivalIndex,
    deviceProjectionRevision: report.deviceProjectionRevision,
    sessionProjectionRevision: report.sessionProjectionRevision,
  };
  return report.ignoredReason ? { ...base, ignoredReason: report.ignoredReason } : base;
}

/** 到达顺序建立 session；客户端 observedAt 永远不能让旧 session 反超当前 session。 */
export function ingestDeviceReport(current: ReportProjection | undefined, report: ReportEnvelope, receivedAt: number): ReportIngestResult {
  const projection = current ?? blankReportProjection(report.deviceId);
  const reject = (ignoredReason: ReportIngestReason): ReportIngestResult => {
    const stored = ingested(report, projection, receivedAt, "IGNORED", ignoredReason);
    return reportResult({ ...projection, ignoredReports: [...projection.ignoredReports, stored] }, stored);
  };
  const original = [...projection.acceptedReports, ...projection.ignoredReports].find((item) => item.reportId === report.reportId);
  if (original) {
    // 完全相同的重放返回第一次的原 ACK，既不分配新 arrivalIndex，也不改变任何投影。
    if (canonicalReportPayload(original) === canonicalReportPayload(report)) return reportResult(projection, original);
    return reject("idempotency_conflict");
  }
  if (!record(report) || report.schemaVersion !== "1.0") return reject("schema_unsupported");
  if (!isReportEnvelope(report)) return reject("schema_invalid");
  if (projection.deviceId !== report.deviceId) return reject("session_mismatch");
  const session = projection.sessions.find((s) => s.sessionId === report.sessionId);
  const bootSequenceWatermarks = projection.acceptedReports.reduce<Record<string, number>>((watermarks, accepted) => {
    watermarks[accepted.bootId] = Math.max(watermarks[accepted.bootId] ?? 0, accepted.sequence);
    return watermarks;
  }, { ...(projection.bootSequenceWatermarks ?? {}) });
  if (report.sequence <= (bootSequenceWatermarks[report.bootId] ?? 0)) return reject("stale_sequence");
  if (session && session.startedAt !== report.sessionStartedAt) return reject("session_started_at_mismatch");
  if (!session && report.eventType !== "session_started") return reject("session_mismatch");
  if (report.eventType === "session_boundary" && projection.latestSessionId !== report.sessionId) return reject("session_mismatch");

  const newSession = !session;
  const establishesLatest = newSession && report.eventType === "session_started";
  const historical = projection.latestSessionId !== report.sessionId && !establishesLatest;
  const establishmentOrder = session?.establishmentOrder ?? Math.max(0, ...projection.sessions.map((item) => item.establishmentOrder)) + 1;
  const nextSession: ReportSessionProjection = session
    ? {
      ...session,
      establishedAt: session.establishedAt ?? projection.acceptedReports.find((accepted) => accepted.sessionId === session.sessionId)?.receivedAt ?? receivedAt,
      lastSeenAt: Math.max(session.lastSeenAt, receivedAt),
      latestBootId: report.bootId,
      latestSequence: report.sequence,
      reportIds: [...session.reportIds, report.reportId],
    }
    : {
      sessionId: report.sessionId,
      deviceId: report.deviceId,
      startedAt: report.sessionStartedAt,
      establishedAt: receivedAt,
      lastSeenAt: receivedAt,
      latestBootId: report.bootId,
      latestSequence: report.sequence,
      reportIds: [report.reportId],
      establishmentOrder,
    };
  const sessions = session ? projection.sessions.map((s) => s.sessionId === report.sessionId ? nextSession : s) : [...projection.sessions, nextSession];
  const previousCumulative = projection.cumulativeSignals;
  const cumulativeSignals = previousCumulative ? {
    appOpenCount: Math.max(previousCumulative.appOpenCount, report.cumulativeSignals.appOpenCount),
    sessionCount: Math.max(previousCumulative.sessionCount, report.cumulativeSignals.sessionCount),
    foregroundDurationSeconds: Math.max(previousCumulative.foregroundDurationSeconds, report.cumulativeSignals.foregroundDurationSeconds),
  } : report.cumulativeSignals;
  const disposition: ReportIngestDisposition = historical ? "HISTORICAL_SESSION" : "APPLIED";
  const stored = ingested(report, projection, receivedAt, disposition);
  const nextProjection: ReportProjection = {
      ...projection,
      bootSequenceWatermarks: { ...bootSequenceWatermarks, [report.bootId]: report.sequence },
      latestSessionId: establishesLatest ? report.sessionId : projection.latestSessionId,
      latestObservedAt: historical ? projection.latestObservedAt : report.observedAt,
      appliedCommandVersion: historical ? projection.appliedCommandVersion : Math.max(projection.appliedCommandVersion ?? 0, report.appliedCommandVersion),
      cumulativeSignals: historical ? projection.cumulativeSignals : cumulativeSignals,
      instantaneousSignals: historical ? projection.instantaneousSignals : report.instantaneousSignals,
      sessions,
      acceptedReports: [...projection.acceptedReports, stored],
  };
  return reportResult(nextProjection, stored);
}

export function projectSessionPage(projection: ReportProjection, cursor: string | undefined, pageSize: number): { items: ReportSessionProjection[]; nextCursor?: string; total: number } {
  const sorted = [...projection.sessions].sort((a, b) => b.establishmentOrder - a.establishmentOrder);
  const size = Math.max(1, pageSize);
  const anchor = cursor == null ? Number.POSITIVE_INFINITY : Number(cursor);
  const eligible = sorted.filter((item) => item.establishmentOrder < anchor);
  const items = eligible.slice(0, size);
  return { items, nextCursor: items.length < eligible.length ? String(items.at(-1)?.establishmentOrder) : undefined, total: sorted.length };
}

export function projectReportPage(projection: ReportProjection, cursor: string | undefined, pageSize: number): { items: IngestedReport[]; nextCursor?: string; total: number } {
  const all = [...projection.acceptedReports, ...projection.ignoredReports].sort((a, b) => a.arrivalIndex - b.arrivalIndex);
  const size = Math.max(1, pageSize);
  const anchor = cursor == null ? 0 : Number(cursor);
  const eligible = all.filter((item) => item.arrivalIndex > anchor);
  const items = eligible.slice(0, size);
  return { items, nextCursor: items.length < eligible.length ? String(items.at(-1)?.arrivalIndex) : undefined, total: all.length };
}
