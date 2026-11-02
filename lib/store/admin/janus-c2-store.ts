/**
 * Janus C2 控制台(K6)— 原型变更 store(设备手动覆盖 + 审计投影)。
 * backend-replaceable:这里只表达 K6→C2 的产品契约,不冒充真实设备控制链路。
 * 时间戳用 Date.now() —— 仅在点击 handler(applyOverride / 非渲染期)取值,无 SSR 水合问题。
 * 持久化 localStorage(版本化 key);console 全客户端渲染,持久态不引发水合错位。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JANUS_DEVICES } from "@/lib/mock/admin/janus-c2/devices";
import { INITIAL_POLICY_BUNDLES, JANUS_STRATEGIES, deepClone } from "@/lib/mock/admin/janus-c2/strategies";
import {
  cancellationReasonForCommandClaim,
  canonicalCommandEffectiveTiming,
  claimHighestValidCommand,
  commandCanPreempt,
  commandHasTerminalOutcome,
  compressCommandQueue,
  deliverTakeoverCommand,
  ingestDeviceReport,
  pendingHandoffAbortForPreemption,
  projectDeviceLastSeenAt,
  receiptSampleCompatible,
  reduceCommandAck,
  reducePolicyReceipt,
  reserveSubjectCommandVersion,
} from "@/lib/mock/admin/janus-c2/contract-reducers";
import { commandFromDecisionSnapshot, decisionTrace, dryRunStrategy, strategyContentHash } from "@/lib/mock/admin/janus-c2/evaluate";
import * as accountAuthorityReducer from "@/lib/mock/admin/janus-c2/account-authority";
import { computePriorityScore, computeRecommendationScore } from "@/lib/mock/admin/janus-c2/scoring";
import { REMOTE_URL_LABEL, STATUS_LABEL } from "@/lib/mock/admin/janus-c2/labels";
import type {
  ApprovedRemoteTargetKey,
  AccountAuthorityProjection,
  AccountAuthorityRevokeReceipt,
  AuditLog,
  AckEvent,
  ConfirmationMode,
  Device,
  DecisionSnapshot,
  DeviceStatus,
  EffectiveTiming,
  DryRunCredential,
  CommandCancellationReason,
  ImpactAcknowledgement,
  HandoffClaimRequest,
  HandoffGrant,
  HandoffGrantMessage,
  HandoffGrantRecoveryContext,
  HandoffLeaseAck,
  HandoffLeaseAckRequest,
  PolicyBundle,
  PolicyBundleReceipt,
  PendingHandoffAbortAck,
  RemoteTarget,
  ReportEnvelope,
  ReportIngestAck,
  ReportProjection,
  RevokeAuthorityAck,
  Role,
  Strategy,
  StrategyStatus,
  StrategyVersion,
  StatusSource,
  LedgerTakeoverCommand,
  TakeoverExecution,
} from "@/lib/mock/admin/janus-c2/types";
import { executionTransitions, ROLE_ORDER, TRANSITIONS, type Transition } from "@/lib/mock/admin/janus-c2/transitions";

/** K6 只能选择批准目录中的键,不能录入裸 URL。 */
export const REMOTE_TARGET_CATALOG: RemoteTarget[] = [
  { catalogVersion: 5, remoteTargetKey: "default", remoteTargetVersion: 7, status: "active", label: REMOTE_URL_LABEL.default, url: "https://approved.example/main", origin: "https://approved.example", source: "seed", ownerId: "platform", createdAt: 1_720_000_000_000, updatedAt: 1_720_000_000_000, updatedBy: "system", changeReason: "初始批准目录" },
  { catalogVersion: 5, remoteTargetKey: "backup", remoteTargetVersion: 4, status: "disabled", label: REMOTE_URL_LABEL.backup, url: "https://approved.example/backup", origin: "https://approved.example", source: "seed", ownerId: "platform", createdAt: 1_720_000_000_000, updatedAt: 1_720_000_000_000, updatedBy: "system", changeReason: "备用目标已停用" },
  { catalogVersion: 5, remoteTargetKey: "promo", remoteTargetVersion: 2, status: "active", label: REMOTE_URL_LABEL.promo, url: "https://approved.example/promo", origin: "https://approved.example", source: "seed", ownerId: "growth", createdAt: 1_720_000_000_000, updatedAt: 1_720_000_000_000, updatedBy: "system", changeReason: "初始批准目录" },
];

export interface OverrideForm {
  reasonCategory: string;
  reasonText: string;
  effectiveTiming: EffectiveTiming;
  expireAt?: number;
  remoteTargetKey?: ApprovedRemoteTargetKey;
  remoteTargetVersion?: number;
  confirmationMode: ConfirmationMode;
  impactAcknowledgement?: ImpactAcknowledgement;
}

export const impactScopeFor = (transitionId: string, timing: EffectiveTiming): string => `transition:${transitionId}:${timing}`;

/**
 * 原型系统事实注入能力。角色只能表达“谁可操作”，不能证明当前运行面是隔离沙盒；
 * 因此样例回执还必须同时由 DEV 构建和显式 contractMock 查询参数授权。
 */
export function isK6ContractMockEnabled(): boolean {
  return process.env.NODE_ENV === "development"
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("contractMock") === "1";
}

export function buildAccountAuthorityProjections(devices: Device[] = JANUS_DEVICES): Record<string, AccountAuthorityProjection> {
  return accountAuthorityReducer.buildAccountAuthorityProjections(devices);
}

const INITIAL_ACCOUNT_AUTHORITIES = buildAccountAuthorityProjections();

export function normalizeAuthorityMap(authorities: Record<string, AccountAuthorityProjection>, devices: Device[] = []): Record<string, AccountAuthorityProjection> {
  const deviceProvesActor = (actor: NonNullable<AccountAuthorityProjection["activeActor"]>): boolean => {
    const device = devices.find((candidate) => candidate.deviceId === actor.deviceId);
    const lease = device?.takeover.appliedLease;
    if (!device || !lease || device.accountSubjectRef !== actor.accountSubjectRef
      || device.takeover.appliedCommandVersion !== actor.commandVersion
      || lease.accountSubjectRef !== actor.accountSubjectRef || lease.handoffId !== actor.handoffId
      || lease.snapshotVersion !== actor.snapshotVersion || lease.handoffEpoch !== actor.handoffEpoch
      || lease.actorLeaseId !== actor.actorLeaseId || lease.claimId !== actor.claimId
      || lease.leaseAckId !== actor.leaseAckId || lease.leaseAckAt !== actor.leaseAckAt) return false;
    return device.takeover.attempts.some((event) =>
      !event.ignoredReason && event.status === "handoff_acked"
      && event.deviceId === actor.deviceId && event.commandId === actor.commandId
      && event.commandVersion === actor.commandVersion && event.attemptId === actor.attemptId
      && event.accountSubjectRef === actor.accountSubjectRef && event.handoffId === actor.handoffId
      && event.snapshotVersion === actor.snapshotVersion && event.handoffEpoch === actor.handoffEpoch
      && event.actorLeaseId === actor.actorLeaseId && event.claimId === actor.claimId
      && event.leaseAckId === actor.leaseAckId && event.leaseState === "REMOTE_ACTIVE");
  };
  const normalized = Object.fromEntries(Object.entries(authorities).map(([subject, authority]) => {
    const requestReceipts = authority.requestReceipts ?? [];
    const claimReceipts = authority.claimReceipts ?? [];
    const receiptCommandVersion = (commandId: string, attemptId: string): number | undefined =>
      requestReceipts.find((receipt) => receipt.commandId === commandId && receipt.attemptId === attemptId)?.commandVersion;
    const commandVersion = (commandId: string, attemptId: string): number => receiptCommandVersion(commandId, attemptId) ?? 0;
    const validWatermark = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const hasInvalidPersistedWatermark = [authority.handoffEpoch, authority.maxCommandVersion, authority.issuedCommandVersion, authority.revokeFloor]
      .some((value) => value !== undefined && !validWatermark(value));
    const persistedHandoffEpoch = validWatermark(authority.handoffEpoch) ? authority.handoffEpoch : 0;
    const persistedMaxCommandVersion = validWatermark(authority.maxCommandVersion) ? authority.maxCommandVersion : 0;
    const persistedIssuedCommandVersion = validWatermark(authority.issuedCommandVersion) ? authority.issuedCommandVersion : 0;
    const revokeFloor = validWatermark(authority.revokeFloor) ? authority.revokeFloor : 0;
    type LegacyPendingCandidate = Omit<AccountAuthorityProjection["pendingCandidates"][number], "commandVersion"> & { commandVersion?: number };
    const persistedPendingCandidates = (authority.pendingCandidates ?? []) as LegacyPendingCandidate[];
    const rawPendingCandidates = persistedPendingCandidates.flatMap((candidate) => {
      const resolvedCommandVersion = candidate.commandVersion ?? receiptCommandVersion(candidate.commandId, candidate.attemptId);
      return typeof resolvedCommandVersion === "number" && Number.isSafeInteger(resolvedCommandVersion) && resolvedCommandVersion > revokeFloor
        ? [{ ...candidate, commandVersion: resolvedCommandVersion }]
        : [];
    });
    const pendingCandidates = rawPendingCandidates.length === 1 && (() => {
      const candidate = rawPendingCandidates[0];
      const { deviceId: _deviceId, commandVersion: _commandVersion, ...expectedGrant } = candidate;
      return !!accountAuthorityReducer.recoverAccountAuthorityGrant(
        { ...authority, pendingCandidates: rawPendingCandidates, requestReceipts, claimReceipts },
        candidate.commandId,
        candidate.attemptId,
        expectedGrant,
      );
    })() ? rawPendingCandidates : [];
    type LegacyActiveActor = Omit<NonNullable<AccountAuthorityProjection["activeActor"]>, "claimId"> & { claimId?: string };
    const rawActor = authority.activeActor as LegacyActiveActor | undefined;
    const actorClaimReceipt = rawActor ? claimReceipts.find((receipt) =>
      (!rawActor.claimId || receipt.ack.claimId === rawActor.claimId)
      && receipt.ack.accountSubjectRef === rawActor.accountSubjectRef
      && receipt.ack.commandId === rawActor.commandId
      && receipt.ack.attemptId === rawActor.attemptId
      && receipt.ack.handoffId === rawActor.handoffId
      && receipt.ack.snapshotVersion === rawActor.snapshotVersion
      && receipt.ack.handoffEpoch === rawActor.handoffEpoch
      && receipt.ack.actorLeaseId === rawActor.actorLeaseId) : undefined;
    // 旧持久态只有 grant/lease 但没有可核验 claim receipt 时失败关闭；不得在迁移时自铸 claimId。
    const normalizedActor = rawActor && actorClaimReceipt ? {
      ...rawActor,
      claimId: actorClaimReceipt.ack.claimId,
      commandVersion: rawActor.commandVersion ?? commandVersion(rawActor.commandId, rawActor.attemptId),
    } : undefined;
    const authorityWithNormalizedActor: AccountAuthorityProjection = {
      ...authority,
      requestReceipts,
      claimReceipts,
      activeActor: normalizedActor,
    };
    const activeActor = normalizedActor && normalizedActor.commandVersion > revokeFloor
      && accountAuthorityReducer.accountAuthorityActorHasCanonicalClaimChain(authorityWithNormalizedActor, normalizedActor)
      && deviceProvesActor(normalizedActor)
      ? normalizedActor
      : undefined;
    const rawActorCommandVersion = rawActor
      ? rawActor.commandVersion ?? receiptCommandVersion(rawActor.commandId, rawActor.attemptId)
      : undefined;
    const rawActorIsProvenStale = typeof rawActorCommandVersion === "number"
      && Number.isSafeInteger(rawActorCommandVersion) && rawActorCommandVersion > 0 && rawActorCommandVersion <= revokeFloor;
    const allDroppedPendingEvidenceIsProvenStale = persistedPendingCandidates.every((candidate) => {
      const resolvedCommandVersion = candidate.commandVersion ?? receiptCommandVersion(candidate.commandId, candidate.attemptId);
      return typeof resolvedCommandVersion === "number" && Number.isSafeInteger(resolvedCommandVersion)
        && resolvedCommandVersion > 0 && resolvedCommandVersion <= revokeFloor;
    });
    const hasInvalidCurrentAuthorityEvidence = hasInvalidPersistedWatermark || (
      !!rawActor && !activeActor && !rawActorIsProvenStale
    ) || (
      persistedPendingCandidates.length > 0 && pendingCandidates.length === 0 && !allDroppedPendingEvidenceIsProvenStale
    );
    // 不能把“有权威声称但证明链坏了”静默洗成 WHITE；否则下一条命令会覆盖仍可能有效的远端 actor。
    const quarantineReason = hasInvalidCurrentAuthorityEvidence
      ? authority.quarantineReason ?? "UNVERIFIED_DEVICE_AUTHORITY"
      : activeActor || pendingCandidates.length
        ? undefined
        : authority.quarantineReason;
    const revokeReceipts = ((authority.revokeReceipts ?? []) as unknown[]).map((raw): AccountAuthorityRevokeReceipt => {
      if (raw && typeof raw === "object" && "ack" in raw) return raw as AccountAuthorityRevokeReceipt;
      const ack = raw as RevokeAuthorityAck;
      const journal = requestReceipts.find((receipt) => receipt.commandId === ack.commandId && receipt.attemptId === ack.attemptId);
      return {
        commandId: ack.commandId,
        attemptId: ack.attemptId,
        deviceId: journal?.deviceId ?? "legacy-unknown-device",
        commandVersion: journal?.commandVersion ?? revokeFloor,
        requestFingerprint: journal?.canonicalPayload ?? "legacy-unverifiable-request",
        ack,
      };
    });
    const handoffEpoch = Math.max(persistedHandoffEpoch, activeActor?.handoffEpoch ?? 0, ...pendingCandidates.map((candidate) => candidate.handoffEpoch));
    const maxCommandVersion = Math.max(persistedMaxCommandVersion, revokeFloor, activeActor?.commandVersion ?? 0, ...pendingCandidates.map((candidate) => candidate.commandVersion));
    const issuedCommandVersion = Math.max(persistedIssuedCommandVersion, maxCommandVersion, revokeFloor);
    return [subject, {
      ...authority,
      handoffEpoch,
      maxCommandVersion,
      issuedCommandVersion,
      revokeFloor,
      leaseState: pendingCandidates.length ? "TRANSFERRING" : activeActor ? "REMOTE_ACTIVE" : "WHITE_ACTIVE",
      quarantineReason,
      activeActor,
      pendingCandidates,
      requestReceipts,
      claimReceipts,
      revokeReceipts,
    }];
  })) as Record<string, AccountAuthorityProjection>;
  const rebuilt = buildAccountAuthorityProjections(devices);
  for (const [subject, deviceAuthority] of Object.entries(rebuilt)) {
    const authority = normalized[subject];
    if (!authority) {
      normalized[subject] = deviceAuthority;
      continue;
    }
    const revokeFloor = Math.max(authority.revokeFloor ?? 0, deviceAuthority.revokeFloor ?? 0);
    // 设备 rebuild 只贡献水位；active actor 只能来自上一步已验证的 authority receipt chain。
    const activeActor = authority.activeActor && authority.activeActor.commandVersion > revokeFloor ? authority.activeActor : undefined;
    const pendingCandidates = [...authority.pendingCandidates, ...deviceAuthority.pendingCandidates]
      .filter((candidate, index, all) => candidate.commandVersion > revokeFloor && all.findIndex((item) => item.actorLeaseId === candidate.actorLeaseId) === index);
    const claimReceipts = [...authority.claimReceipts, ...deviceAuthority.claimReceipts]
      .filter((receipt, index, all) => all.findIndex((item) => item.ack.claimId === receipt.ack.claimId) === index);
    // 第一遍已识别的坏 authority 证据优先；已验证 actor 只可压掉“设备投影单独声称 lease”的隔离标记。
    const quarantineReason = authority.quarantineReason
      ?? (activeActor || pendingCandidates.length ? undefined : deviceAuthority.quarantineReason);
    normalized[subject] = {
      ...authority,
      handoffEpoch: Math.max(authority.handoffEpoch, deviceAuthority.handoffEpoch),
      maxCommandVersion: Math.max(authority.maxCommandVersion, deviceAuthority.maxCommandVersion, revokeFloor),
      issuedCommandVersion: Math.max(authority.issuedCommandVersion ?? 0, deviceAuthority.issuedCommandVersion ?? 0),
      revokeFloor,
      leaseState: pendingCandidates.length ? "TRANSFERRING" : activeActor ? "REMOTE_ACTIVE" : "WHITE_ACTIVE",
      quarantineReason,
      activeActor,
      pendingCandidates,
      claimReceipts,
      updatedAt: Math.max(authority.updatedAt, deviceAuthority.updatedAt),
    };
  }
  return normalized;
}

type AuthorityGrantResult = ReturnType<typeof accountAuthorityReducer.requestAccountAuthorityGrant>;

/** 账户服务原型 reducer：设备只能请求 grant，不能自行决定 epoch/lease。 */
export function requestAccountAuthorityGrant(
  authority: AccountAuthorityProjection,
  device: Device,
  command: LedgerTakeoverCommand,
  attemptId: string,
  targetOrigin: string,
  at: number,
  recovery: HandoffGrantRecoveryContext,
): AuthorityGrantResult {
  return accountAuthorityReducer.requestAccountAuthorityGrant(
    authority,
    device,
    command,
    attemptId,
    targetOrigin,
    at,
    command.type === "CHANGE_TARGET" ? device.takeover.appliedLease?.actorLeaseId : undefined,
    recovery,
  );
}

export function abortAccountAuthorityCandidate(authority: AccountAuthorityProjection, ack: PendingHandoffAbortAck): AccountAuthorityProjection | undefined {
  return accountAuthorityReducer.abortAccountAuthorityCandidate(authority, ack);
}

export function activateAccountAuthorityCandidate(
  authority: AccountAuthorityProjection,
  grant: HandoffGrant,
  deviceId: string,
  claimId: string,
  leaseAckId: string,
  leaseAckAt: number,
): AccountAuthorityProjection | undefined {
  return accountAuthorityReducer.activateAccountAuthorityCandidate(authority, grant, deviceId, claimId, leaseAckId, leaseAckAt);
}

export function revokeAccountAuthority(
  authority: AccountAuthorityProjection,
  command: LedgerTakeoverCommand,
  attemptId: string,
  at: number,
): ReturnType<typeof accountAuthorityReducer.revokeAccountAuthority> {
  return accountAuthorityReducer.revokeAccountAuthority(authority, command, attemptId, at);
}

export interface DeviceOverride extends OverrideForm {
  status: DeviceStatus;
  statusSource?: StatusSource;
  operatorId: string;
  /** 执行该流转要求的最低角色(PRD §16.5 roleGate,来自 transition.role)。 */
  roleGate: Role;
  createdAt: number;
  takeover: TakeoverExecution;
  reportProjection?: ReportProjection;
  decisionSnapshot?: DecisionSnapshot;
}

/** R10 前持久态只在 hydrate 边界从精确 handoff ACK 补 claimId；无证据时整条 override 隔离。 */
export function normalizePersistedOverrides(overrides: Record<string, DeviceOverride>): Record<string, DeviceOverride> {
  return Object.fromEntries(Object.entries(overrides).flatMap(([deviceId, override]) => {
    type LegacyAppliedLease = Omit<NonNullable<TakeoverExecution["appliedLease"]>, "claimId"> & { claimId?: string };
    const rawLease = override.takeover.appliedLease as LegacyAppliedLease | undefined;
    const requiresAppliedLease = override.takeover.actorState === "REMOTE_ACTIVE"
      || override.takeover.appliedMode === "REMOTE"
      || ["HANDOFF_ACKED", "SUCCEEDED", "REVOKE_PENDING_ACK"].includes(override.takeover.phase);
    if (!rawLease) return requiresAppliedLease ? [] : [[deviceId, override]];
    const leaseAcks = override.takeover.attempts.filter((event) =>
      !event.ignoredReason
      && event.status === "handoff_acked"
      && event.deviceId === deviceId
      && event.accountSubjectRef === rawLease.accountSubjectRef
      && event.handoffId === rawLease.handoffId
      && event.snapshotVersion === rawLease.snapshotVersion
      && event.handoffEpoch === rawLease.handoffEpoch
      && event.actorLeaseId === rawLease.actorLeaseId
      && event.leaseState === "REMOTE_ACTIVE"
      && event.leaseAckId === rawLease.leaseAckId);
    const currentLeasePhase = override.takeover.phase === "HANDOFF_ACKED" || override.takeover.phase === "SUCCEEDED";
    const currentCommand = override.takeover.currentCommand;
    const currentClaim = override.takeover.currentClaim;
    const currentExecutionSessionId = currentClaim?.executionSessionId ?? currentClaim?.claimedSessionId;
    const matchingAck = currentLeasePhase
      ? leaseAcks.findLast((event) => !!currentCommand
        && currentCommand.type !== "REVOKE"
        && event.commandId === currentCommand.commandId
        && event.commandVersion === currentCommand.commandVersion
        && event.commandType === currentCommand.type
        && event.policyBundleVersion === currentCommand.policyBundleVersion
        && event.attemptId === override.takeover.attemptId
        && event.sessionId === currentExecutionSessionId)
      : leaseAcks.at(-1);
    const matchingSuccess = override.takeover.phase === "SUCCEEDED"
      ? override.takeover.attempts.findLast((event) => !!currentCommand && !!matchingAck
        && !event.ignoredReason && event.status === "succeeded" && event.schemaVersion === "1.0"
        && event.deviceId === deviceId && event.commandId === currentCommand.commandId
        && event.commandVersion === currentCommand.commandVersion && event.commandType === currentCommand.type
        && event.policyBundleVersion === currentCommand.policyBundleVersion
        && event.attemptId === override.takeover.attemptId && event.sessionId === currentExecutionSessionId
        && event.eventSeq > matchingAck.eventSeq)
      : undefined;
    const storedClaimId = typeof rawLease.claimId === "string" && rawLease.claimId.trim() ? rawLease.claimId : undefined;
    const ackClaimId = typeof matchingAck?.claimId === "string" && matchingAck.claimId.trim() ? matchingAck.claimId : undefined;
    if (!ackClaimId || typeof rawLease.leaseAckId !== "string" || !rawLease.leaseAckId.trim() || !Number.isFinite(rawLease.leaseAckAt)
      || (storedClaimId && storedClaimId !== ackClaimId)) return [];
    if (currentLeasePhase && (
      !currentCommand || currentCommand.type === "REVOKE"
      || override.takeover.commandId !== currentCommand.commandId
      || override.takeover.commandVersion !== currentCommand.commandVersion
      || !override.takeover.attemptId || matchingAck?.attemptId !== override.takeover.attemptId
      || !currentClaim || currentClaim.commandId !== currentCommand.commandId
      || currentClaim.commandVersion !== currentCommand.commandVersion || currentClaim.attemptId !== override.takeover.attemptId
      || !currentExecutionSessionId
      || override.takeover.leaseAckAt !== rawLease.leaseAckAt
      || override.takeover.actorState !== "REMOTE_ACTIVE"
      || override.takeover.desiredMode !== "REMOTE"
      || currentCommand.remoteTargetKey === undefined || currentCommand.remoteTargetVersion === undefined
      || override.takeover.desiredRemoteTargetKey !== currentCommand.remoteTargetKey
      || override.takeover.desiredRemoteTargetVersion !== currentCommand.remoteTargetVersion
      || (override.takeover.phase === "SUCCEEDED" && (
        override.takeover.appliedCommandVersion !== currentCommand.commandVersion
        || override.takeover.appliedMode !== "REMOTE"
        || override.takeover.appliedRemoteTargetKey !== currentCommand.remoteTargetKey
        || override.takeover.appliedRemoteTargetVersion !== currentCommand.remoteTargetVersion
        || !Number.isFinite(override.takeover.acknowledgedAt)
        || !matchingSuccess
      ))
    )) return [];
    return [[deviceId, {
      ...override,
      takeover: {
        ...override.takeover,
        appliedLease: { ...rawLease, claimId: ackClaimId },
      },
    }]];
  }));
}

interface JanusC2State {
  overrides: Record<string, DeviceOverride>;
  /** DEV+contractMock 回执样例的隔离投影；不得回写正式 overrides。 */
  sandboxOverrides: Record<string, DeviceOverride>;
  audit: AuditLog[];
  strategies: Strategy[];
  policyBundles: PolicyBundle[];
  policyReceipts: PolicyBundleReceipt[];
  sandboxPolicyBundles: PolicyBundle[];
  sandboxPolicyReceipts: PolicyBundleReceipt[];
  dryRunCredentials: DryRunCredential[];
  /** 自动/人工判定的 append-only 机器证据；旧 command.decisionId 必须永久可解析。 */
  decisionSnapshots: DecisionSnapshot[];
  sandboxDecisionSnapshots: DecisionSnapshot[];
  /** 账户服务共享权威投影；同一 accountSubjectRef 的设备共用。 */
  accountAuthorities: Record<string, AccountAuthorityProjection>;
  sandboxAccountAuthorities: Record<string, AccountAuthorityProjection>;
  publishedBundleVersion?: number;
  appliedBundleVersion?: number;
  sandboxPublishedBundleVersion?: number;
  sandboxAppliedBundleVersion?: number;
  remoteTargets: RemoteTarget[];
  catalogVersion: number;
  applyOverride: (device: Device, transitionId: string, form: OverrideForm, operatorId: string, operatorRole: Role) => void;
  /** 批量同动作覆盖(PRD §9.1.7,先预览后提交;此处提交)。 */
  applyBatch: (devices: Device[], transitionId: string, form: OverrideForm, operatorId: string, operatorRole: Role) => void;
  /** C2 报告摄取入口；只有 APPLIED 当前会话信号会触发新决策。 */
  ingestReport: (report: ReportEnvelope, receivedAt?: number) => ReportIngestAck | undefined;
  /** 策略新建 / 编辑(PRD §6/§14)。 */
  saveStrategy: (strategy: Strategy, operatorId: string, operatorRole: Role, isNew: boolean) => void;
  /** 策略状态切换:草稿/发布/暂停/归档(PRD §6.1 / §14.3)。发布(active)可带发布说明 note。 */
  issueDryRunCredential: (strategyId: string, operatorId: string, operatorRole: Role, targetVersion?: number) => string | undefined;
  setStrategyStatus: (id: string, status: StrategyStatus, operatorId: string, operatorRole: Role, note?: string, impact?: string, dryRunCredentialId?: string) => void;
  deleteStrategy: (id: string, operatorId: string, operatorRole: Role) => void;
  duplicateStrategy: (id: string, operatorId: string, operatorRole: Role) => void;
  /** 回滚到历史版本(PRD §14.4),生成新版本快照,回滚原因必填。 */
  rollbackStrategy: (id: string, version: number, operatorId: string, operatorRole: Role, reason: string, dryRunCredentialId?: string) => void;
  /** 明示为原型回执样例;只推进 mock 状态,不代表真实联控。 */
  simulatePolicyReceipt: (bundleVersion: number, stage: "compile" | "apply", outcome: "succeeded" | "failed", operatorId: string, operatorRole: Role, failedReason?: string) => void;
  simulateCommandReceipt: (deviceId: string, outcome: "success" | "handoff_failed" | "revoke_succeeded" | "old_version_ignored" | "duplicate_ignored" | "session_edge_wait", operatorId: string, operatorRole: Role) => void;
  saveRemoteTargetVersion: (key: ApprovedRemoteTargetKey, label: string, url: string, owner: string, reason: string, impact: string, operatorId: string, operatorRole: Role) => void;
  disableRemoteTarget: (key: ApprovedRemoteTargetKey, version: number, reason: string, impact: string, operatorId: string, operatorRole: Role) => void;
  /** 报表 / 审计导出留痕(PRD §19:导出报表为必审计动作)。 */
  recordExport: (label: string, operatorId: string, operatorRole: Role, detail: Record<string, unknown>) => boolean;
  resetAll: () => void;
}

let seq = 0;
const nextId = (prefix: string, at: number): string => `${prefix}-${at.toString(36).toUpperCase()}-${(seq += 1).toString().padStart(3, "0")}`;

export function effectiveRemoteTargets(targets: RemoteTarget[], catalogVersion = Number.MAX_SAFE_INTEGER): RemoteTarget[] {
  const latest = new Map<string, RemoteTarget>();
  for (const target of targets.filter((item) => item.catalogVersion <= catalogVersion).sort((a, b) => a.catalogVersion - b.catalogVersion)) {
    latest.set(`${target.remoteTargetKey}:${target.remoteTargetVersion}`, target);
  }
  return [...latest.values()];
}

function findTarget(targets: RemoteTarget[], key?: ApprovedRemoteTargetKey, version?: number, catalogVersion?: number): RemoteTarget | undefined {
  return effectiveRemoteTargets(targets, catalogVersion).find((x) => x.remoteTargetKey === key && x.remoteTargetVersion === version && x.status === "active");
}

export function cancellationReasonForClaim(command: LedgerTakeoverCommand, takeover: TakeoverExecution, appliedCommandVersion: number, latestVersion: number, at: number, targets = REMOTE_TARGET_CATALOG): CommandCancellationReason | undefined {
  return cancellationReasonForCommandClaim(command, takeover, appliedCommandVersion, latestVersion, at, targets);
}

/** 服务端领取前压缩必须留下独立取消事实，不能回写不可变账本命令。 */
export function compressOfflineCommandQueue(takeover: TakeoverExecution, appliedCommandVersion: number, at: number, targets = REMOTE_TARGET_CATALOG): TakeoverExecution {
  return compressCommandQueue(takeover, appliedCommandVersion, at, targets);
}

/** 领取请求显式携客户端 appliedCommandVersion；返回压缩后的取消事实与最高有效命令。 */
export function claimLatestValidCommand(takeover: TakeoverExecution, appliedCommandVersion: number, at: number, targets = REMOTE_TARGET_CATALOG): { execution: TakeoverExecution; command?: LedgerTakeoverCommand } {
  return claimHighestValidCommand(takeover, appliedCommandVersion, at, targets);
}

function takeoverForTransition(device: Device, t: Transition, form: OverrideForm, at: number, requestId: string, auditId: string, targets: RemoteTarget[], policyBundleVersion: number, catalogVersion: number, subjectMaxCommandVersion: number, subjectIssuedCommandVersion: number): TakeoverExecution {
  const current = device.takeover;
  if (t.transitionId === "exec.revoke_query") return current;
  const type = t.commandType;
  if (!type) {
    return {
      ...current,
      desiredMode: "CLOAK",
      phase: "NONE",
      desiredRemoteTargetKey: undefined,
      desiredRemoteTargetVersion: undefined,
      failureReason: undefined,
      failureClass: undefined,
    };
  }

  const selected = findTarget(targets, form.remoteTargetKey, form.remoteTargetVersion);
  const retainedKey = current.desiredRemoteTargetKey ?? current.appliedRemoteTargetKey;
  const retainedVersion = current.desiredRemoteTargetVersion ?? current.appliedRemoteTargetVersion;
  const retryOriginal = t.transitionId === "exec.retry_activate";
  const remoteTargetKey = type === "ACTIVATE" || type === "CHANGE_TARGET" ? (selected?.remoteTargetKey ?? (retryOriginal ? retainedKey : undefined)) : undefined;
  const remoteTargetVersion = type === "ACTIVATE" || type === "CHANGE_TARGET" ? (selected?.remoteTargetVersion ?? (retryOriginal ? retainedVersion : undefined)) : undefined;
  const { commandVersion } = reserveSubjectCommandVersion(current.commandVersion, subjectMaxCommandVersion, subjectIssuedCommandVersion);
  const commandId = nextId("CMD", at);
  const command: LedgerTakeoverCommand = {
    commandId,
    deviceId: device.deviceId,
    commandVersion,
    policyBundleVersion,
    catalogVersion,
    type,
    idempotencyKey: `IDEM-${commandId}`,
    expectedCommandVersion: current.commandVersion,
    effectiveTiming: canonicalCommandEffectiveTiming(type, form.effectiveTiming),
    issuedAt: at,
    validUntil: at + 30 * 60_000,
    remoteTargetKey,
    remoteTargetVersion,
    cause: { kind: "manual", requestId, auditId, impactAcknowledgementId: form.impactAcknowledgement!.acknowledgementId },
  };
  const superseded = current.currentCommand && !commandHasTerminalOutcome(current, current.currentCommand) ? current.currentCommand : undefined;
  const attemptId = nextId("ATT", at);
  const cancellation = superseded ? {
    cancellationId: nextId("CAN", at),
    deviceId: superseded.deviceId,
    commandId: superseded.commandId,
    attemptId: current.attemptId ?? `UNCLAIMED-${superseded.commandId}`,
    commandVersion: superseded.commandVersion,
    cancelledAt: at,
    reason: "superseded" as const,
    supersedingCommandId: commandId,
  } : undefined;
  const revoking = type === "REVOKE";
  const handoffAbortFact = (type === "REVOKE" || type === "CHANGE_TARGET")
    ? pendingHandoffAbortForPreemption(current, at)
    : undefined;
  return {
    ...current,
    desiredMode: revoking ? "CLOAK" : "REMOTE",
    appliedMode: current.appliedMode,
    phase: revoking ? "REVOKE_PENDING_ACK" : "COMMAND_PENDING_ACK",
    desiredRemoteTargetKey: revoking ? undefined : remoteTargetKey,
    desiredRemoteTargetVersion: revoking ? undefined : remoteTargetVersion,
    commandVersion,
    currentCommand: command,
    commandHistory: [...current.commandHistory, command],
    currentClaim: undefined,
    claims: current.claims ?? [],
    cancellations: cancellation ? [...(current.cancellations ?? []), cancellation] : (current.cancellations ?? []),
    handoffAbortFacts: handoffAbortFact ? [...(current.handoffAbortFacts ?? []), handoffAbortFact] : current.handoffAbortFacts,
    attempts: current.attempts,
    pendingHandoff: handoffAbortFact ? undefined : current.pendingHandoff,
    commandId,
    attemptId,
    requestedAt: at,
    acknowledgedAt: undefined,
    failureReason: undefined,
    failureClass: undefined,
  };
}

function buildAudit(device: Device, t: Transition, override: DeviceOverride, operatorId: string, at: number, requestId: string, auditId: string): AuditLog {
  const action = t.transitionId === "exec.revoke_query"
    ? "查询设备应用态"
    : override.takeover.phase === "COMMAND_PENDING_ACK"
    ? "发起手动接管命令"
    : override.takeover.phase === "REVOKE_PENDING_ACK"
      ? "发起撤销命令"
      : `手动改为「${STATUS_LABEL[t.to]}」`;
  return {
    auditId,
    actorId: operatorId,
    action,
    targetType: "device",
    targetId: device.deviceId,
    beforeSnapshot: { status: device.status, statusSource: device.statusSource, desiredMode: device.takeover.desiredMode, appliedMode: device.takeover.appliedMode, takeoverPhase: device.takeover.phase },
    afterSnapshot: { status: t.to, statusSource: "manual", desiredMode: override.takeover.desiredMode, appliedMode: override.takeover.appliedMode, takeoverPhase: override.takeover.phase, remoteTargetKey: override.takeover.desiredRemoteTargetKey ?? null, remoteTargetVersion: override.takeover.desiredRemoteTargetVersion ?? null, commandId: override.takeover.commandId ?? null, commandVersion: override.takeover.commandVersion, impactAcknowledgementId: t.commandType ? override.impactAcknowledgement?.acknowledgementId : undefined, impactAcknowledgement: override.impactAcknowledgement },
    reasonCategory: override.reasonCategory,
    reasonText: override.reasonText,
    sourceContext: `后台 · ${operatorId}`,
    createdAt: at,
    requestId,
  };
}

function strategyAudit(action: string, s: Strategy, before: unknown, after: unknown, operatorId: string, at: number, reason?: string): AuditLog {
  return {
    auditId: nextId("AUD", at),
    actorId: operatorId,
    action,
    targetType: "strategy",
    targetId: s.strategyId,
    beforeSnapshot: before,
    afterSnapshot: after,
    reasonText: reason,
    sourceContext: `后台 · ${operatorId}`,
    createdAt: at,
    requestId: nextId("REQ", at),
  };
}

const STATUS_VERB: Record<StrategyStatus, string> = { draft: "存为草稿", active: "发布", paused: "暂停", archived: "归档" };
const ACK_SAMPLE_LABEL: Record<string, string> = { success: "接管成功", handoff_failed: "账户交接失败", revoke_succeeded: "撤销成功", old_version_ignored: "旧版本忽略", duplicate_ignored: "重复事件忽略", session_edge_wait: "等待新会话边界" };
const ACK_IGNORE_LABEL: Record<string, string> = { DUPLICATE: "重复事件", OUT_OF_ORDER: "乱序事件", STALE_COMMAND: "旧命令", TYPE_MISMATCH: "类型不匹配", INVALID_PHASE: "阶段不匹配", TERMINAL: "终态不可回退", SESSION_BOUNDARY_REQUIRED: "尚无新会话", LEASE_ACK_REQUIRED: "缺少账户租约确认" };

const isReversal = (s: Strategy): boolean => s.action.type === "REVERSAL_IMMEDIATE" || s.action.type === "REVERSAL_SESSION_EDGE";
const hasApprovedStrategyTarget = (s: Strategy, targets: RemoteTarget[]): boolean => !isReversal(s) || !!findTarget(targets, s.action.remoteTargetKey, s.action.remoteTargetVersion);

function snapshotStrategy(s: Strategy, version: number, actorId: string, at: number, note: string): StrategyVersion {
  return {
    version,
    note,
    actorId,
    createdAt: at,
    name: s.name,
    description: s.description,
    owner: s.owner,
    priority: s.priority,
    scope: deepClone(s.scope),
    ruleTree: deepClone(s.ruleTree),
    action: { ...s.action },
    safeguards: deepClone(s.safeguards),
    rollout: s.rollout ? deepClone(s.rollout) : undefined,
    healthConfig: s.healthConfig ? deepClone(s.healthConfig) : undefined,
  };
}

function restoreStrategyContent(strategy: Strategy, version: StrategyVersion): Strategy {
  return {
    ...strategy,
    contentRevision: strategy.contentRevision + 1,
    name: version.name ?? strategy.name,
    description: version.description ?? strategy.description,
    owner: version.owner ?? strategy.owner,
    priority: version.priority ?? strategy.priority,
    scope: deepClone(version.scope ?? strategy.scope),
    ruleTree: deepClone(version.ruleTree),
    action: { ...version.action },
    safeguards: deepClone(version.safeguards ?? strategy.safeguards),
    rollout: version.rollout ? deepClone(version.rollout) : undefined,
    healthConfig: version.healthConfig ? deepClone(version.healthConfig) : undefined,
  };
}

function currentDevice(deviceId: string, overrides: Record<string, DeviceOverride>): Device | undefined {
  const base = JANUS_DEVICES.find((x) => x.deviceId === deviceId);
  const o = overrides[deviceId];
  return base && o ? { ...base, status: o.status, statusSource: "manual", takeover: o.takeover, activated: o.takeover.appliedMode === "REMOTE" } : base;
}

function canonicalTransitionAtCommit(device: Device, transitionId: string, role: Role): Transition | undefined {
  const candidates = executionTransitions(device.takeover) ?? TRANSITIONS[device.status];
  const canonical = candidates.find((x) => x.transitionId === transitionId);
  return canonical && ROLE_ORDER[role] >= ROLE_ORDER[canonical.role] ? canonical : undefined;
}

function validCommandTarget(device: Device, t: Transition, form: OverrideForm, targets: RemoteTarget[]): boolean {
  if ((t.commandType === "ACTIVATE" || t.commandType === "CHANGE_TARGET") && t.transitionId !== "exec.retry_activate") return !!findTarget(targets, form.remoteTargetKey, form.remoteTargetVersion);
  if (t.transitionId === "exec.retry_activate") return !!findTarget(targets,
    device.takeover.desiredRemoteTargetKey ?? device.takeover.appliedRemoteTargetKey,
    device.takeover.desiredRemoteTargetVersion ?? device.takeover.appliedRemoteTargetVersion,
  );
  return true;
}

function validOverrideForm(device: Device, t: Transition, form: OverrideForm, targets: RemoteTarget[], at: number, batch: boolean): boolean {
  if (!form.reasonCategory || form.reasonText.trim().length < 8) return false;
  if (t.commandType && !commandCanPreempt(device.takeover, t.commandType)) return false;
  if (t.commandType === "REVOKE" && form.effectiveTiming !== "immediate") return false;
  if ((t.strong || (!!t.commandType && form.effectiveTiming === "immediate")) && form.confirmationMode !== "strong_single") return false;
  if (t.needsExpire && (!form.expireAt || form.expireAt <= at)) return false;
  if (batch && (t.noBatch || t.highRisk || (!!t.commandType && form.effectiveTiming === "immediate"))) return false;
  if (t.commandType) {
    const acknowledgement = form.impactAcknowledgement;
    const expectedTargetKey = form.remoteTargetKey ?? device.takeover.desiredRemoteTargetKey ?? device.takeover.appliedRemoteTargetKey;
    const expectedTargetVersion = form.remoteTargetVersion ?? device.takeover.desiredRemoteTargetVersion ?? device.takeover.appliedRemoteTargetVersion;
    const observedActorLeaseId = device.takeover.appliedLease?.actorLeaseId ?? device.takeover.pendingHandoff?.actorLeaseId;
    if (!acknowledgement || !acknowledgement.acknowledgementId
      || acknowledgement.deviceId !== device.deviceId || acknowledgement.sessionId !== device.latestSessionId
      || acknowledgement.observedDesiredCommandVersion !== device.takeover.commandVersion
      || acknowledgement.observedAppliedCommandVersion !== device.takeover.appliedCommandVersion
      || acknowledgement.observedAccountLeaseState !== device.takeover.actorState
      || acknowledgement.observedActorLeaseId !== observedActorLeaseId
      || acknowledgement.remoteTargetKey !== expectedTargetKey || acknowledgement.remoteTargetVersion !== expectedTargetVersion
      || acknowledgement.impactScope !== impactScopeFor(t.transitionId, form.effectiveTiming)
      || acknowledgement.acknowledgedAt > at || acknowledgement.expiresAt < at || acknowledgement.expiresAt > acknowledgement.acknowledgedAt + 10 * 60_000) return false;
  }
  return validCommandTarget(device, t, form, targets);
}

const LEGAL_LIFECYCLE: Record<StrategyStatus, StrategyStatus[]> = {
  draft: ["active"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  archived: [],
};

function createPolicyBundle(strategies: Strategy[], bundles: PolicyBundle[], catalogVersion: number, actorId: string, note: string, at: number): PolicyBundle {
  const bundleVersion = Math.max(0, ...bundles.map((b) => b.bundleVersion)) + 1;
  return {
    bundleVersion,
    schemaVersion: "1.0",
    adapterVersion: "janus-c2-v1",
    remoteTargetCatalogVersion: catalogVersion,
    entries: strategies.filter((s) => s.status === "active").map((s) => ({ strategyId: s.strategyId, contentVersion: s.publishedContentVersion ?? s.version })),
    compileStatus: "PENDING",
    applyStatus: "NOT_APPLIED",
    publishedAt: at,
    publishedBy: actorId,
    note,
  };
}

function stampBundleMembership(strategies: Strategy[], bundle: PolicyBundle): Strategy[] {
  const entries = new Map(bundle.entries.map((entry) => [entry.strategyId, entry.contentVersion]));
  return strategies.map((s) => entries.has(s.strategyId)
    ? { ...s, publishedContentVersion: entries.get(s.strategyId), lastPublishedBundleVersion: bundle.bundleVersion }
    : s);
}

export function canHardDeleteStrategy(strategy: Strategy, bundles: PolicyBundle[], devices: Device[], audit: AuditLog[], strategies: Strategy[], decisionSnapshots: DecisionSnapshot[] = []): boolean {
  if (strategy.status !== "draft" || strategy.publishedAt || strategy.publishedContentVersion != null || strategy.lastPublishedBundleVersion != null || strategy.versions.length) return false;
  if (bundles.some((bundle) => bundle.entries.some((entry) => entry.strategyId === strategy.strategyId))) return false;
  if (strategies.some((item) => item.derivedFromStrategyId === strategy.strategyId)) return false;
  if (devices.some((device) => device.latestDecision?.strategyId === strategy.strategyId || device.sessions.some((session) => session.lastDecision?.strategyId === strategy.strategyId))) return false;
  if (decisionSnapshots.some((snapshot) => snapshot.strategyVersions.some((version) => version.strategyId === strategy.strategyId))) return false;
  return !audit.some((entry) => entry.targetId === strategy.strategyId && !/^(新建|编辑草稿|派生草稿)/.test(entry.action));
}

function materializeAutomaticDecisions(state: Pick<JanusC2State, "overrides" | "strategies" | "remoteTargets" | "catalogVersion" | "decisionSnapshots" | "accountAuthorities">, appliedBundle: PolicyBundle, at: number): { overrides: Record<string, DeviceOverride>; accountAuthorities: Record<string, AccountAuthorityProjection>; audit: AuditLog[]; decisionSnapshots: DecisionSnapshot[] } {
  const overrides = { ...state.overrides };
  const accountAuthorities = { ...state.accountAuthorities };
  const audit: AuditLog[] = [];
  const decisionSnapshots = [...(state.decisionSnapshots ?? [])];
  for (const device of effectiveDevices(state.overrides)) {
    const snapshot = decisionTrace(device, state.strategies, appliedBundle);
    if (!snapshot) continue;
    if (!decisionSnapshots.some((item) => item.decisionId === snapshot.decisionId)) decisionSnapshots.unshift(deepClone(snapshot));
    const strategy = state.strategies.find((item) => item.strategyId === snapshot.strategyId);
    if (!strategy) continue;
    // 普通自动 ACTIVATE 不得抢占已领取/执行中的 attempt；只有显式更高 REVOKE/CHANGE_TARGET 可抢占。
    if (["COMMAND_PENDING_ACK", "RECEIVED", "WAITING_SESSION_EDGE", "LOADING", "HANDOFF_FETCHING", "HANDOFF_MERGING", "HANDOFF_ACKED", "REVOKE_PENDING_ACK"].includes(device.takeover.phase)) continue;
    const alreadyMaterialized = device.takeover.commandHistory.some((command) => command.cause.kind === "decision" && command.cause.decisionId === snapshot.decisionId);
    const draftCommand = commandFromDecisionSnapshot(device, snapshot, strategy, state.catalogVersion, at);
    if (!draftCommand || alreadyMaterialized) continue;
    const authority = accountAuthorities[device.accountSubjectRef] ?? buildAccountAuthorityProjections([device])[device.accountSubjectRef];
    const { commandVersion, issuedCommandVersion } = reserveSubjectCommandVersion(
      device.takeover.commandVersion,
      authority.maxCommandVersion,
      authority.issuedCommandVersion ?? 0,
    );
    const command = { ...draftCommand, commandVersion };
    if (!deliverTakeoverCommand(command, state.remoteTargets)) continue;
    accountAuthorities[device.accountSubjectRef] = { ...authority, issuedCommandVersion };
    const attemptId = nextId("ATT", at);
    const previous = overrides[device.deviceId];
    const takeover: TakeoverExecution = {
      ...device.takeover,
      desiredMode: "REMOTE",
      phase: "COMMAND_PENDING_ACK",
      desiredRemoteTargetKey: command.remoteTargetKey,
      desiredRemoteTargetVersion: command.remoteTargetVersion,
      commandVersion: command.commandVersion,
      currentCommand: command,
      commandHistory: [...device.takeover.commandHistory, command],
      currentClaim: undefined,
      claims: device.takeover.claims ?? [],
      // 已完成命令保持原终态；未领取命令压缩由投递 reducer 单独追加 CommandCancellationFact。
      cancellations: device.takeover.cancellations ?? [],
      commandId: command.commandId,
      attemptId,
      requestedAt: at,
      acknowledgedAt: undefined,
      pendingHandoff: undefined,
      failureCode: undefined,
      failureClass: undefined,
      retryability: undefined,
      failureStage: undefined,
      failureReason: undefined,
    };
    overrides[device.deviceId] = {
      status: "HIT", statusSource: "strategy", operatorId: "c2-decision-engine", roleGate: "admin", createdAt: at,
      reasonCategory: "策略自动判定", reasonText: `判定 ${snapshot.decisionId} 生成不可变命令`, effectiveTiming: command.effectiveTiming,
      confirmationMode: "standard", remoteTargetKey: command.remoteTargetKey, remoteTargetVersion: command.remoteTargetVersion,
      takeover, reportProjection: previous?.reportProjection, decisionSnapshot: snapshot,
    };
    audit.push({
      auditId: nextId("AUD", at), actorId: "c2-decision-engine", action: "自动判定生成接管命令", targetType: "device", targetId: device.deviceId,
      beforeSnapshot: { commandVersion: device.takeover.commandVersion, appliedMode: device.takeover.appliedMode },
      afterSnapshot: { decisionId: snapshot.decisionId, strategyVersions: snapshot.strategyVersions, commandId: command.commandId, commandVersion: command.commandVersion },
      sourceContext: "C2 判定服务原型", createdAt: at, requestId: `REQ-${snapshot.decisionId}`,
    });
  }
  return { overrides, accountAuthorities, audit, decisionSnapshots };
}

export const useJanusC2Store = create<JanusC2State>()(
  persist(
    (set) => ({
      overrides: {},
      sandboxOverrides: {},
      audit: [],
      strategies: JANUS_STRATEGIES,
      policyBundles: INITIAL_POLICY_BUNDLES,
      policyReceipts: [],
      sandboxPolicyBundles: deepClone(INITIAL_POLICY_BUNDLES),
      sandboxPolicyReceipts: [],
      dryRunCredentials: [],
      decisionSnapshots: [],
      sandboxDecisionSnapshots: [],
      accountAuthorities: INITIAL_ACCOUNT_AUTHORITIES,
      sandboxAccountAuthorities: deepClone(INITIAL_ACCOUNT_AUTHORITIES),
      publishedBundleVersion: 5,
      appliedBundleVersion: 5,
      sandboxPublishedBundleVersion: 5,
      sandboxAppliedBundleVersion: 5,
      remoteTargets: REMOTE_TARGET_CATALOG,
      catalogVersion: 5,
      applyOverride: (device, transitionId, form, operatorId, operatorRole) => {
        const at = Date.now();
        set((s) => {
          // 提交时重新读取 store 当前投影,拒绝基于旧详情快照的越权或重复命令。
          const current = currentDevice(device.deviceId, s.overrides);
          if (!current) return s;
          const t = canonicalTransitionAtCommit(current, transitionId, operatorRole);
          if (!t) return s;
          if (!validOverrideForm(current, t, form, s.remoteTargets, at, false)) return s;
          const requestId = nextId("REQ", at);
          const auditId = nextId("AUD", at);
          if (t.transitionId === "exec.revoke_query") {
            const audit = buildAudit(current, t, { ...form, status: current.status, operatorId, roleGate: t.role, createdAt: at, takeover: current.takeover }, operatorId, at, requestId, auditId);
            return { audit: [audit, ...s.audit] };
          }
          const authority = s.accountAuthorities[current.accountSubjectRef]
            ?? buildAccountAuthorityProjections(effectiveDevices(s.overrides))[current.accountSubjectRef];
          const takeover = takeoverForTransition(current, t, form, at, requestId, auditId, s.remoteTargets, s.appliedBundleVersion ?? 0, s.catalogVersion, authority?.maxCommandVersion ?? 0, authority?.issuedCommandVersion ?? 0);
          const abortFact = takeover.handoffAbortFacts?.at(-1);
          const isNewAbort = !!abortFact && !(current.takeover.handoffAbortFacts ?? []).some((fact) => fact.abortAckId === abortFact.abortAckId);
          const abortedAuthority = isNewAbort && authority ? abortAccountAuthorityCandidate(authority, abortFact) : authority;
          if (isNewAbort && !abortedAuthority) return s;
          const reservedAuthority = abortedAuthority && t.commandType
            ? { ...abortedAuthority, issuedCommandVersion: Math.max(abortedAuthority.issuedCommandVersion ?? 0, takeover.commandVersion) }
            : abortedAuthority;
          const override: DeviceOverride = { ...form, status: t.to, operatorId, roleGate: t.role, createdAt: at, takeover };
          const audit = buildAudit(current, t, override, operatorId, at, requestId, auditId);
          return {
            overrides: { ...s.overrides, [current.deviceId]: override },
            accountAuthorities: reservedAuthority ? { ...s.accountAuthorities, [current.accountSubjectRef]: reservedAuthority } : s.accountAuthorities,
            audit: [audit, ...s.audit],
          };
        });
      },
      // 批量同动作覆盖(PRD §9.1.7,UI 批量入口为后续 SPEC;高风险 noBatch 流转禁止批量)。
      applyBatch: (devices, transitionId, form, operatorId, operatorRole) => {
        const at = Date.now();
        set((s) => {
          const overrides = { ...s.overrides };
          const accountAuthorities = { ...s.accountAuthorities };
          const audits: AuditLog[] = [];
          devices.forEach((d) => {
            const current = currentDevice(d.deviceId, overrides);
            if (!current) return;
            const t = canonicalTransitionAtCommit(current, transitionId, operatorRole);
            if (!t || !validOverrideForm(current, t, form, s.remoteTargets, at, true)) return;
            const requestId = nextId("REQ", at);
            const auditId = nextId("AUD", at);
            const authority = accountAuthorities[current.accountSubjectRef]
              ?? buildAccountAuthorityProjections(effectiveDevices(overrides))[current.accountSubjectRef];
            const takeover = takeoverForTransition(current, t, form, at, requestId, auditId, s.remoteTargets, s.appliedBundleVersion ?? 0, s.catalogVersion, authority?.maxCommandVersion ?? 0, authority?.issuedCommandVersion ?? 0);
            const abortFact = takeover.handoffAbortFacts?.at(-1);
            const isNewAbort = !!abortFact && !(current.takeover.handoffAbortFacts ?? []).some((fact) => fact.abortAckId === abortFact.abortAckId);
            const abortedAuthority = isNewAbort && authority ? abortAccountAuthorityCandidate(authority, abortFact) : authority;
            if (isNewAbort && !abortedAuthority) return;
            if (abortedAuthority) accountAuthorities[current.accountSubjectRef] = t.commandType
              ? { ...abortedAuthority, issuedCommandVersion: Math.max(abortedAuthority.issuedCommandVersion ?? 0, takeover.commandVersion) }
              : abortedAuthority;
            const override: DeviceOverride = { ...form, status: t.to, operatorId, roleGate: t.role, createdAt: at, takeover };
            overrides[current.deviceId] = override;
            audits.push(buildAudit(current, t, override, operatorId, at, requestId, auditId));
          });
          return { overrides, accountAuthorities, audit: [...audits, ...s.audit] };
        });
      },
      ingestReport: (report, receivedAt = Date.now()) => {
        let ack: ReportIngestAck | undefined;
        set((st) => {
          const device = currentDevice(report.deviceId, st.overrides);
          if (!device) return st;
          const projection = st.overrides[report.deviceId]?.reportProjection
            ?? device.reports.reduce<ReportProjection>((current, seed, index) => ingestDeviceReport(current, seed, seed.observedAt + index).projection, { deviceId: device.deviceId, sessions: [], acceptedReports: [], ignoredReports: [] });
          const result = ingestDeviceReport(projection, report, receivedAt);
          const { projection: _projection, report: _storedReport, ...receipt } = result;
          ack = receipt;
          const existing = st.overrides[report.deviceId];
          const reportOverride: DeviceOverride = existing ? { ...existing, reportProjection: result.projection } : {
            status: device.status,
            statusSource: device.statusSource,
            operatorId: "c2-report-reducer",
            roleGate: "admin",
            createdAt: receivedAt,
            reasonCategory: "系统报告摄取",
            reasonText: "权威 Report reducer 更新设备信号投影",
            effectiveTiming: "session_edge",
            confirmationMode: "standard",
            takeover: device.takeover,
            reportProjection: result.projection,
          };
          const overrides = { ...st.overrides, [report.deviceId]: reportOverride };
          if (result.disposition !== "APPLIED") return { overrides };
          const appliedBundle = st.policyBundles.find((bundle) => bundle.bundleVersion === st.appliedBundleVersion && bundle.applyStatus === "APPLIED");
          if (!appliedBundle) return { overrides };
          const automatic = materializeAutomaticDecisions({ ...st, overrides }, appliedBundle, receivedAt);
          return { overrides: automatic.overrides, accountAuthorities: automatic.accountAuthorities, decisionSnapshots: automatic.decisionSnapshots, audit: [...automatic.audit, ...st.audit] };
        });
        return ack;
      },
      saveStrategy: (strategy, operatorId, operatorRole, isNew) => {
        if (ROLE_ORDER[operatorRole] < ROLE_ORDER.senior_operator || strategy.name.trim().length < 2) return;
        const at = Date.now();
        set((st) => {
          const exists = st.strategies.find((x) => x.strategyId === strategy.strategyId);
          if (!hasApprovedStrategyTarget(strategy, st.remoteTargets)) return st;
          // 已发布/暂停/归档的运行对象不可原地编辑;任何内容修改派生独立 draft。
          const derivesDraft = !!exists && exists.status !== "draft";
          const normalized: Strategy = derivesDraft
            ? {
                ...strategy,
                strategyId: nextId("STRAT", at),
                contentRevision: 1,
                status: "draft",
                version: 0,
                versions: [],
                createdAt: at,
                publishedAt: undefined,
                publishedContentVersion: undefined,
                lastPublishedBundleVersion: undefined,
                derivedFromStrategyId: exists.strategyId,
                derivedFromVersion: exists.publishedContentVersion ?? exists.version,
              }
            : exists
              ? { ...strategy, contentRevision: exists.contentRevision + 1, status: "draft", version: 0, versions: [], publishedAt: undefined, publishedContentVersion: undefined, lastPublishedBundleVersion: undefined, createdAt: exists.createdAt }
              : { ...strategy, contentRevision: 1, status: "draft", version: 0, versions: [], publishedAt: undefined, publishedContentVersion: undefined, lastPublishedBundleVersion: undefined, createdAt: at };
          const strategies = derivesDraft || !exists
            ? [normalized, ...st.strategies]
            : st.strategies.map((x) => (x.strategyId === strategy.strategyId ? normalized : x));
          const audit = strategyAudit(
            `${isNew ? "新建" : derivesDraft ? "派生草稿" : "编辑草稿"}策略「${normalized.name}」`,
            normalized,
            exists ? { status: exists.status, priority: exists.priority, action: exists.action.type } : null,
            { status: normalized.status, priority: normalized.priority, action: normalized.action.type },
            operatorId,
            at,
          );
          return { strategies, audit: [audit, ...st.audit] };
        });
      },
      issueDryRunCredential: (strategyId, operatorId, operatorRole, targetVersion) => {
        if (operatorRole !== "admin") return undefined;
        const at = Date.now();
        let issuedId: string | undefined;
        set((st) => {
          const strategy = st.strategies.find((item) => item.strategyId === strategyId);
          if (!strategy) return st;
          const historical = targetVersion == null ? undefined : strategy.versions.find((item) => item.version === targetVersion);
          if (targetVersion != null && !historical) return st;
          const candidate = historical ? restoreStrategyContent(strategy, historical) : strategy;
          const dryRun = dryRunStrategy(candidate, effectiveDevices(st.overrides), st.strategies);
          const credential: DryRunCredential = {
            credentialId: nextId("DRY", at), strategyId, contentRevision: candidate.contentRevision,
            contentHash: strategyContentHash(candidate), result: "pass", issuedAt: at, expiresAt: at + 10 * 60_000,
          };
          issuedId = credential.credentialId;
          return {
            dryRunCredentials: [credential, ...st.dryRunCredentials],
            audit: [{
              auditId: nextId("AUD", at), actorId: operatorId, action: "执行策略发布干跑", targetType: "strategy", targetId: strategyId,
              beforeSnapshot: null, afterSnapshot: { ...credential, targetVersion, dryRun },
              sourceContext: `后台 · ${operatorId}`, createdAt: at, requestId: nextId("REQ", at),
            }, ...st.audit],
          };
        });
        return issuedId;
      },
      setStrategyStatus: (id, status, operatorId, operatorRole, note, impact, dryRunCredentialId) => {
        const at = Date.now();
        set((st) => {
          const s = st.strategies.find((x) => x.strategyId === id);
          if (!s) return st;
          const reason = note?.trim() ?? "";
          const impactText = impact?.trim() ?? "";
          if (!LEGAL_LIFECYCLE[s.status].includes(status) || reason.length < 4) return st;
          const dryRunCredential = status === "active" ? st.dryRunCredentials.find((credential) => credential.credentialId === dryRunCredentialId) : undefined;
          if (status === "active" && (operatorRole !== "admin" || !hasApprovedStrategyTarget(s, st.remoteTargets)
            || !dryRunCredential || dryRunCredential.strategyId !== s.strategyId || dryRunCredential.contentRevision !== s.contentRevision
            || dryRunCredential.contentHash !== strategyContentHash(s) || dryRunCredential.result !== "pass" || dryRunCredential.expiresAt < at)) return st;
          if (status === "paused" && (ROLE_ORDER[operatorRole] < ROLE_ORDER.senior_operator || impactText.length < 4)) return st;
          if (status === "archived" && (operatorRole !== "admin" || impactText.length < 4)) return st;
          let updated: Strategy;
          if (status === "active") {
            // 内容版本先冻结，再由全局原子 bundle 统一进入编译 pending。
            const version = s.version + 1;
            const snap = snapshotStrategy(s, version, operatorId, at, reason);
            updated = {
              ...s,
              status,
              version,
              publishedAt: at,
              publishedContentVersion: version,
              versions: [snap, ...s.versions],
            };
          } else {
            updated = { ...s, status };
          }
          const desiredStrategies = st.strategies.map((x) => x.strategyId === id
            ? updated
            : status === "active" && s.derivedFromStrategyId === x.strategyId
              ? { ...x, status: "archived" as const }
              : x);
          const bundle = createPolicyBundle(desiredStrategies, st.policyBundles, st.catalogVersion, operatorId, `${STATUS_VERB[status]}策略「${s.name}」:${reason}`, at);
          const strategies = stampBundleMembership(desiredStrategies, bundle);
          const audit = strategyAudit(`${STATUS_VERB[status]}策略「${s.name}」`, s, { status: s.status, appliedBundleVersion: st.appliedBundleVersion }, { status, contentVersion: updated.version, bundleVersion: bundle.bundleVersion, compileStatus: bundle.compileStatus, impact: impactText || undefined }, operatorId, at, reason);
          return {
            strategies,
            policyBundles: [bundle, ...st.policyBundles],
            publishedBundleVersion: bundle.bundleVersion,
            dryRunCredentials: dryRunCredential ? st.dryRunCredentials.filter((credential) => credential.credentialId !== dryRunCredential.credentialId) : st.dryRunCredentials,
            audit: [audit, ...st.audit],
          };
        });
      },
      deleteStrategy: (id, operatorId, operatorRole) => {
        const at = Date.now();
        set((st) => {
          const s = st.strategies.find((x) => x.strategyId === id);
          if (!s || operatorRole !== "admin" || !canHardDeleteStrategy(s, st.policyBundles, effectiveDevices(st.overrides), st.audit, st.strategies, st.decisionSnapshots)) return st;
          const audit = strategyAudit(`删除策略「${s.name}」`, s, { status: s.status }, null, operatorId, at);
          return { strategies: st.strategies.filter((x) => x.strategyId !== id), audit: [audit, ...st.audit] };
        });
      },
      duplicateStrategy: (id, operatorId, operatorRole) => {
        if (ROLE_ORDER[operatorRole] < ROLE_ORDER.senior_operator) return;
        const at = Date.now();
        set((st) => {
          const s = st.strategies.find((x) => x.strategyId === id);
          if (!s) return st;
          const copy: Strategy = {
            ...s,
            strategyId: nextId("STRAT", at),
            contentRevision: 1,
            name: `${s.name}(副本)`,
            status: "draft",
            version: 0,
            ruleTree: deepClone(s.ruleTree),
            action: { ...s.action },
            safeguards: { ...s.safeguards },
            scope: deepClone(s.scope),
            versions: [],
            createdAt: at,
            publishedAt: undefined,
            publishedContentVersion: undefined,
            lastPublishedBundleVersion: undefined,
            derivedFromStrategyId: s.strategyId,
            derivedFromVersion: s.publishedContentVersion ?? s.version,
          };
          const audit = strategyAudit(`复制策略「${s.name}」为草稿`, copy, null, { name: copy.name, status: "draft" }, operatorId, at);
          return { strategies: [copy, ...st.strategies], audit: [audit, ...st.audit] };
        });
      },
      rollbackStrategy: (id, version, operatorId, operatorRole, reason, dryRunCredentialId) => {
        if (operatorRole !== "admin" || reason.trim().length < 4) return;
        const at = Date.now();
        set((st) => {
          const s = st.strategies.find((x) => x.strategyId === id);
          if (!s) return st;
          const v = s.versions.find((x) => x.version === version);
          if (!v || !findTarget(st.remoteTargets, v.action.remoteTargetKey, v.action.remoteTargetVersion) && (v.action.type === "REVERSAL_IMMEDIATE" || v.action.type === "REVERSAL_SESSION_EDGE")) return st;
          const restored = restoreStrategyContent(s, v);
          const dryRunCredential = st.dryRunCredentials.find((credential) => credential.credentialId === dryRunCredentialId);
          if (!dryRunCredential || dryRunCredential.strategyId !== s.strategyId || dryRunCredential.contentRevision !== restored.contentRevision
            || dryRunCredential.contentHash !== strategyContentHash(restored) || dryRunCredential.result !== "pass" || dryRunCredential.expiresAt < at) return st;
          const newVersion = s.version + 1;
          const snap = snapshotStrategy(restored, newVersion, operatorId, at, `回滚自 v${version} · ${reason.trim()}`);
          const updated: Strategy = { ...restored, status: "active", version: newVersion, publishedAt: at, publishedContentVersion: newVersion, versions: [snap, ...s.versions] };
          const desiredStrategies = st.strategies.map((x) => x.strategyId === id ? updated : x);
          const bundle = createPolicyBundle(desiredStrategies, st.policyBundles, st.catalogVersion, operatorId, `回滚策略「${s.name}」到内容 v${version}`, at);
          const strategies = stampBundleMembership(desiredStrategies, bundle);
          const audit = strategyAudit(`回滚策略「${s.name}」到 v${version}`, s, { contentVersion: s.version, appliedBundleVersion: st.appliedBundleVersion }, { contentVersion: newVersion, rolledBackFrom: version, bundleVersion: bundle.bundleVersion, compileStatus: "PENDING" }, operatorId, at, reason.trim());
          return { strategies, policyBundles: [bundle, ...st.policyBundles], publishedBundleVersion: bundle.bundleVersion, dryRunCredentials: st.dryRunCredentials.filter((credential) => credential.credentialId !== dryRunCredential.credentialId), audit: [audit, ...st.audit] };
        });
      },
      simulatePolicyReceipt: (bundleVersion, stage, outcome, operatorId, operatorRole, failedReason) => {
        if (operatorRole !== "admin" || !isK6ContractMockEnabled() || (outcome === "failed" && (failedReason?.trim().length ?? 0) === 0)) return;
        const at = Date.now();
        set((st) => {
          const receiptId = nextId("PRC", at);
          const receipt: PolicyBundleReceipt = outcome === "failed"
            ? { receiptId, bundleVersion, stage, outcome, failedReason: failedReason!.trim(), receivedAt: at }
            : { receiptId, bundleVersion, stage, outcome, receivedAt: at };
          const reduced = reducePolicyReceipt({ bundles: st.sandboxPolicyBundles, publishedBundleVersion: st.sandboxPublishedBundleVersion, appliedBundleVersion: st.sandboxAppliedBundleVersion, receipts: st.sandboxPolicyReceipts }, receipt);
          const stored = reduced.receipts[0];
          const audit: AuditLog = {
            auditId: nextId("AUD", at), actorId: operatorId, action: `原型 PolicyBundle 回执:${stage}/${outcome}`,
            targetType: "config", targetId: `sandbox:PolicyBundle-v${bundleVersion}`,
            beforeSnapshot: { sandboxAppliedBundleVersion: st.sandboxAppliedBundleVersion },
            afterSnapshot: { 全局包版本: bundleVersion, 回执阶段: stage === "compile" ? "编译" : "应用", 回执结果: outcome === "succeeded" ? "成功" : "失败", 忽略原因: stored?.ignoredReason ? ({ UNKNOWN_BUNDLE: "未知包版本", STALE_BUNDLE: "迟到旧包", INVALID_STAGE: "阶段不匹配", INVALID_RECEIPT: "失败回执缺少有效原因", DUPLICATE: "重复回执" }[stored.ignoredReason]) : "已受理", 当前已应用包: reduced.appliedBundleVersion },
            reasonText: "只推进 DEV contractMock 隔离投影，不改正式 PolicyBundle", sourceContext: `后台沙盒 · ${operatorId}`, createdAt: at, requestId: nextId("REQ", at),
          };
          const appliedBundle = !stored?.ignoredReason && stage === "apply" && outcome === "succeeded"
            ? reduced.bundles.find((bundle) => bundle.bundleVersion === reduced.appliedBundleVersion)
            : undefined;
          const automatic = appliedBundle
            ? materializeAutomaticDecisions({ ...st, overrides: st.sandboxOverrides, decisionSnapshots: st.sandboxDecisionSnapshots, accountAuthorities: st.sandboxAccountAuthorities }, appliedBundle, at)
            : { overrides: st.sandboxOverrides, accountAuthorities: st.sandboxAccountAuthorities, audit: [], decisionSnapshots: st.sandboxDecisionSnapshots };
          const sandboxAutomaticAudit = automatic.audit.map((entry) => ({ ...entry, action: `沙盒样例·${entry.action}`, sourceContext: "DEV contractMock 隔离投影" }));
          return {
            sandboxPolicyBundles: reduced.bundles,
            sandboxPolicyReceipts: reduced.receipts,
            sandboxAppliedBundleVersion: reduced.appliedBundleVersion,
            sandboxOverrides: automatic.overrides,
            sandboxAccountAuthorities: automatic.accountAuthorities,
            sandboxDecisionSnapshots: automatic.decisionSnapshots,
            audit: [audit, ...sandboxAutomaticAudit, ...st.audit],
          };
        });
      },
      simulateCommandReceipt: (deviceId, outcome, operatorId, operatorRole) => {
        if (operatorRole !== "admin" || !isK6ContractMockEnabled()) return;
        const at = Date.now();
        set((st) => {
          // sandbox 只能从不可变 seed + 自己的 override 启动；正式 command/attempt/report 水位永不作为 fallback。
          const device = currentDevice(deviceId, st.sandboxOverrides);
          const command = device?.takeover.currentCommand;
          if (!device || !command) return st;
          if (!receiptSampleCompatible(command, device.takeover.phase, outcome)) return st;
          const takeover = device.takeover;
          const authorities = st.sandboxAccountAuthorities ?? buildAccountAuthorityProjections(effectiveDevices(st.sandboxOverrides));
          const authority = authorities[device.accountSubjectRef]
            ?? buildAccountAuthorityProjections([device])[device.accountSubjectRef];
          let nextAuthority: AccountAuthorityProjection = {
            ...authority,
            activeActor: authority.activeActor ? { ...authority.activeActor } : undefined,
            pendingCandidates: authority.pendingCandidates.map((candidate) => ({ ...candidate })),
            requestReceipts: [...(authority.requestReceipts ?? [])],
            claimReceipts: [...(authority.claimReceipts ?? [])],
            revokeReceipts: [...(authority.revokeReceipts ?? [])],
          };
          const emitted: AckEvent[] = [];
          let nextTakeover = takeover;
          const recoveredHandoff = takeover.pendingHandoff
            ? accountAuthorityReducer.recoverAccountAuthorityGrant(nextAuthority, command.commandId, takeover.attemptId ?? "", takeover.pendingHandoff)
            : undefined;
          let handoffGrant: HandoffGrant | undefined = recoveredHandoff?.grant;
          let handoffLeaseAck: HandoffLeaseAck | undefined;
          let revokeAuthorityAck: RevokeAuthorityAck | undefined;
          let pendingHandoffAbortAck: PendingHandoffAbortAck | undefined;
          const deliveryCatalogVersion = Math.max(0, ...st.remoteTargets.map((target) => target.catalogVersion));
          const deliveredCommand = recoveredHandoff?.deliveredCommand
            ?? deliverTakeoverCommand(command, st.remoteTargets, deliveryCatalogVersion, at);
          let reportProjection = st.sandboxOverrides[deviceId]?.reportProjection
            ?? device.reports.reduce<ReportProjection>((projection, report, index) => ingestDeviceReport(projection, report, report.observedAt + index).projection, { deviceId: device.deviceId, sessions: [], acceptedReports: [], ignoredReports: [] });
          const emit = (status: AckEvent["status"], options: Partial<AckEvent> = {}) => {
            const attemptId = options.attemptId ?? nextTakeover.attemptId ?? nextId("ATT", at);
            const eventSeq = options.eventSeq ?? Math.max(0, ...nextTakeover.attempts.filter((x) => x.attemptId === attemptId).map((x) => x.eventSeq)) + 1;
            const event: AckEvent = {
              schemaVersion: "1.0",
              attemptId, eventId: options.eventId ?? nextId("EVT", at + emitted.length), eventSeq,
              commandId: options.commandId ?? command.commandId, deviceId: device.deviceId, accountSubjectRef: options.accountSubjectRef,
              commandVersion: options.commandVersion ?? command.commandVersion, commandType: options.commandType ?? command.type, policyBundleVersion: command.policyBundleVersion,
              sessionId: options.sessionId ?? nextTakeover.currentClaim?.executionSessionId ?? nextTakeover.currentClaim?.claimedSessionId ?? device.latestSessionId,
              status, observedAt: at + emitted.length, idempotencyKey: `IDEM-${command.commandId}-${attemptId}-${eventSeq}`,
              failureCode: options.failureCode, failureReason: options.failureReason, failureClass: options.failureClass, retryability: options.retryability, failureStage: options.failureStage,
              handoffId: options.handoffId, snapshotVersion: options.snapshotVersion, handoffEpoch: options.handoffEpoch, actorLeaseId: options.actorLeaseId,
              leaseState: options.leaseState, claimId: options.claimId, leaseAckId: options.leaseAckId,
              revokeAuthorityAckKind: options.revokeAuthorityAckKind,
              handoffCancelAckId: options.handoffCancelAckId,
              alreadyWhiteAckId: options.alreadyWhiteAckId,
              pendingHandoffAbortAckId: options.pendingHandoffAbortAckId,
              revokeTargetCleared: options.revokeTargetCleared,
              boundaryId: options.boundaryId, boundaryReportId: options.boundaryReportId,
            };
            const ackReceivedAt = Math.max(at + emitted.length + 1, status === "handoff_acked" ? (handoffLeaseAck?.leaseAckAt ?? 0) : 0);
            const reduced = reduceCommandAck(nextTakeover, event, { ackReceivedAt, reportProjection, deliveredCommand, handoffGrant, handoffLeaseAck, revokeAuthorityAck, authorityAccountSubjectRef: device.accountSubjectRef, pendingHandoffAbortAck });
            // handoff_acked 只有权威 claim/lease 证据全量通过 reducer 后才进入样例事件流。
            if (status === "handoff_acked" && reduced.disposition !== "APPLIED") return reduced;
            emitted.push(event);
            nextTakeover = reduced.execution;
            return reduced;
          };
          const abortPendingHandoff = (failure: Required<Pick<AckEvent, "failureCode" | "failureReason" | "failureClass" | "retryability" | "failureStage">>): boolean => {
            const pending = nextTakeover.pendingHandoff;
            if (!pending) return false;
            const abortAck: PendingHandoffAbortAck = {
              abortAckId: `HAB-${command.commandId}-${pending.actorLeaseId}`,
              commandId: command.commandId,
              attemptId: nextTakeover.attemptId ?? "",
              accountSubjectRef: device.accountSubjectRef,
              handoffId: pending.handoffId,
              handoffEpoch: pending.handoffEpoch,
              cancelledCandidateActorLeaseId: pending.actorLeaseId,
              survivingAppliedActorLeaseId: nextTakeover.appliedLease?.actorLeaseId,
              leaseState: nextTakeover.appliedLease ? "REMOTE_ACTIVE" : "WHITE_ACTIVE",
              abortAckAt: at + emitted.length + 1,
            };
            const abortedAuthority = abortAccountAuthorityCandidate(nextAuthority, abortAck);
            if (!abortedAuthority) return false;
            pendingHandoffAbortAck = abortAck;
            nextAuthority = abortedAuthority;
            const failed = emit("failed", {
              accountSubjectRef: device.accountSubjectRef,
              handoffId: pending.handoffId,
              snapshotVersion: pending.snapshotVersion,
              handoffEpoch: pending.handoffEpoch,
              actorLeaseId: pending.actorLeaseId,
              leaseState: abortAck.leaseState,
              ...failure,
              pendingHandoffAbortAckId: abortAck.abortAckId,
            });
            return failed.disposition === "APPLIED" && nextTakeover.phase === "FAILED";
          };

          if (outcome === "old_version_ignored") {
            emit("received", { commandVersion: Math.max(0, command.commandVersion - 1), eventSeq: 1 });
          } else if (outcome === "duplicate_ignored") {
            const existing = nextTakeover.attempts.findLast((event) => event.commandId === command.commandId);
            if (existing) nextTakeover = reduceCommandAck(nextTakeover, existing).execution;
          } else {
            if (["COMMAND_PENDING_ACK", "REVOKE_PENDING_ACK"].includes(nextTakeover.phase)) emit("received");
            if (nextTakeover.phase === "RECEIVED" && command.type !== "REVOKE" && command.effectiveTiming === "session_edge") emit("waiting_session_edge");
            if (outcome === "session_edge_wait") {
              // received 已把 session_edge 命令推进 WAITING_SESSION_EDGE；不伪造新会话。
            } else {
              if (nextTakeover.phase === "WAITING_SESSION_EDGE") {
                const sessionId = `${device.latestSessionId}-NEXT`;
                const sessionStartReport: ReportEnvelope = {
                  reportId: `RPT-${command.commandId}-SESSION-START`, deviceId: device.deviceId, sessionId, bootId: `BOOT-${sessionId}`, sequence: 1,
                  sessionStartedAt: at, appliedCommandVersion: takeover.appliedCommandVersion, observedAt: at, schemaVersion: "1.0", eventType: "session_started",
                  cumulativeSignals: reportProjection.cumulativeSignals ?? { appOpenCount: 0, sessionCount: 0, foregroundDurationSeconds: 0 },
                  instantaneousSignals: reportProjection.instantaneousSignals ?? { appPhase: "unknown", environmentRiskScore: device.environmentRiskScore },
                };
                reportProjection = ingestDeviceReport(reportProjection, sessionStartReport, at + emitted.length + 1).projection;
                emit("session_boundary", { sessionId });
              }
              if (command.type === "REVOKE") {
                if (nextTakeover.phase === "RECEIVED") {
                  const revoked = revokeAccountAuthority(nextAuthority, command, nextTakeover.attemptId ?? "", at + emitted.length);
                  nextAuthority = revoked.authority;
                  if (!revoked.ok) {
                    emit("failed", { failureCode: "REVOKE_ACCOUNT_CANCEL_FAILED", failureReason: `账户服务拒绝撤销:${revoked.reason}`, failureClass: "lease", retryability: "terminal", failureStage: "revoke_account_cancel" });
                  } else {
                    revokeAuthorityAck = revoked.ack;
                    emit("succeeded", revoked.ack.kind === "lease_cancelled"
                      ? { accountSubjectRef: device.accountSubjectRef, revokeTargetCleared: true, leaseState: "WHITE_ACTIVE", revokeAuthorityAckKind: revoked.ack.kind, handoffCancelAckId: revoked.ack.cancelAckId, handoffEpoch: revoked.ack.handoffEpoch }
                      : { accountSubjectRef: device.accountSubjectRef, revokeTargetCleared: true, leaseState: "WHITE_ACTIVE", revokeAuthorityAckKind: revoked.ack.kind, alreadyWhiteAckId: revoked.ack.alreadyWhiteAckId, handoffEpoch: revoked.ack.handoffEpoch });
                  }
                }
              } else {
                if (nextTakeover.phase === "RECEIVED") emit("webview_loading");
                if (nextTakeover.phase === "LOADING") {
                  const attemptId = nextTakeover.attemptId ?? "";
                  const claim = nextTakeover.currentClaim;
                  const bindingEvent = nextTakeover.attempts.findLast((event) =>
                    !event.ignoredReason
                    && event.attemptId === attemptId
                    && (event.status === "received" || event.status === "session_boundary"));
                  const bindingStatus = bindingEvent?.status === "received" || bindingEvent?.status === "session_boundary"
                    ? bindingEvent.status
                    : undefined;
                  const bindingSessionId = bindingStatus === "session_boundary" ? claim?.executionSessionId : claim?.claimedSessionId;
                  if (!deliveredCommand?.resolvedTarget || !claim || claim.commandId !== command.commandId
                    || claim.commandVersion !== command.commandVersion || claim.attemptId !== attemptId
                    || !bindingEvent || !bindingStatus || !bindingSessionId
                    || bindingEvent.commandId !== command.commandId || bindingEvent.commandVersion !== command.commandVersion
                    || bindingEvent.deviceId !== device.deviceId || bindingEvent.sessionId !== bindingSessionId
                    || !Number.isInteger(bindingEvent.eventSeq) || bindingEvent.eventSeq <= 0) {
                    emit("failed", {
                      accountSubjectRef: device.accountSubjectRef,
                      failureCode: "HANDOFF_GRANT_FAILED",
                      failureReason: "账户服务拒绝交接:recovery_binding_missing",
                      failureClass: "handoff",
                      retryability: "terminal",
                      failureStage: "handoff_fetching",
                    });
                  } else {
                    const recovery: HandoffGrantRecoveryContext = {
                      deliveredCommand,
                      attemptBinding: {
                        attemptId,
                        claimedSessionId: claim.claimedSessionId,
                        executionSessionId: claim.executionSessionId ?? claim.claimedSessionId,
                        eventSeq: bindingEvent.eventSeq,
                        status: bindingStatus,
                      },
                    };
                    const authorityDevice: Device = { ...device, takeover: nextTakeover };
                    const requested = requestAccountAuthorityGrant(
                      nextAuthority,
                      authorityDevice,
                      command,
                      attemptId,
                      deliveredCommand.resolvedTarget.origin,
                      at + emitted.length,
                      recovery,
                    );
                    nextAuthority = requested.authority;
                    if (!requested.ok) {
                      emit("failed", {
                        accountSubjectRef: device.accountSubjectRef,
                        failureCode: "HANDOFF_GRANT_FAILED",
                        failureReason: `账户服务拒绝交接:${requested.reason}`,
                        failureClass: "handoff",
                        retryability: "terminal",
                        failureStage: "handoff_fetching",
                      });
                    } else {
                      handoffGrant = requested.grant;
                      emit("handoff_fetching", {
                        accountSubjectRef: device.accountSubjectRef,
                        handoffId: handoffGrant.handoffId,
                        snapshotVersion: handoffGrant.snapshotVersion,
                        handoffEpoch: handoffGrant.handoffEpoch,
                        actorLeaseId: handoffGrant.actorLeaseId,
                      });
                    }
                  }
                }
                if ((nextTakeover.phase === "HANDOFF_FETCHING" || nextTakeover.phase === "HANDOFF_MERGING")
                  && nextTakeover.pendingHandoff && handoffGrant) {
                  const recoveredClaim = accountAuthorityReducer.recoverAccountAuthorityClaim(nextAuthority, handoffGrant);
                  // Janus 只投递 capability；handoffId 留在正式 URL path，远端 body 只有七字段。
                  const handoffGrantMessage: HandoffGrantMessage = {
                    type: "nexgrid:handoff-grant",
                    schemaVersion: "1.0",
                    grantClaim: recoveredClaim
                      ? { handoffId: handoffGrant.handoffId, ...recoveredClaim.request }
                      : {
                        handoffId: handoffGrant.handoffId,
                        claimRequestId: `HCR-${command.commandId}-${handoffGrant.attemptId}`,
                        handoffToken: handoffGrant.handoffToken,
                        commandId: handoffGrant.commandId,
                        attemptId: handoffGrant.attemptId,
                        snapshotVersion: handoffGrant.snapshotVersion,
                        handoffEpoch: handoffGrant.handoffEpoch,
                        actorLeaseId: handoffGrant.actorLeaseId,
                      },
                  };
                  const { handoffId: claimPathHandoffId, ...claimBodyFields } = handoffGrantMessage.grantClaim;
                  const remoteClaimBody: HandoffClaimRequest = claimBodyFields;
                  // targetOrigin 模拟可信 HTTP Origin 上下文，不进入远端 claim body。
                  const claimed = accountAuthorityReducer.claimAccountAuthorityHandoff(
                    nextAuthority,
                    claimPathHandoffId,
                    remoteClaimBody,
                    handoffGrant.targetOrigin,
                    at + emitted.length + 1,
                  );
                  if (!claimed.ok) {
                    abortPendingHandoff({
                      failureCode: "HANDOFF_CLAIM_FAILED",
                      failureReason: `账户交接领取失败:${claimed.reason}`,
                      failureClass: "handoff",
                      retryability: "terminal",
                      failureStage: "handoff_fetching",
                    });
                  } else {
                    nextAuthority = claimed.authority;
                    const merged = nextTakeover.phase === "HANDOFF_FETCHING"
                      ? emit("handoff_merging", {
                        accountSubjectRef: device.accountSubjectRef,
                        handoffId: handoffGrant.handoffId,
                        snapshotVersion: handoffGrant.snapshotVersion,
                        handoffEpoch: handoffGrant.handoffEpoch,
                        actorLeaseId: handoffGrant.actorLeaseId,
                      })
                      : { disposition: "APPLIED" as const, execution: nextTakeover };
                    if (outcome === "handoff_failed") {
                      abortPendingHandoff({
                        failureCode: "HANDOFF_MERGE_FAILED",
                        failureReason: "账户交接合并失败,账户服务已确认候选中止",
                        failureClass: "handoff",
                        retryability: "retryable",
                        failureStage: "handoff_merging",
                      });
                    } else if (merged.disposition === "APPLIED" && merged.execution.phase === "HANDOFF_MERGING") {
                      // 远端 LeaseAck 消息只触发 reconciliation；正式 body 恰为 {claimId, grant}。
                      const leaseAckRequest: HandoffLeaseAckRequest = { claimId: claimed.ack.claimId, grant: handoffGrant };
                      const recoveredActiveActor = recoveredHandoff?.activeActor?.claimId === claimed.ack.claimId
                        ? recoveredHandoff.activeActor
                        : undefined;
                      const leaseAckId = recoveredActiveActor?.leaseAckId ?? `LACK-${command.commandId}`;
                      const leaseAckAt = recoveredActiveActor?.leaseAckAt ?? (at + emitted.length + 1);
                      const activatedAuthority = activateAccountAuthorityCandidate(
                        nextAuthority,
                        leaseAckRequest.grant,
                        device.deviceId,
                        leaseAckRequest.claimId,
                        leaseAckId,
                        leaseAckAt,
                      );
                      // 该 actor 模拟 GET /handoffs/:id/lease 的权威查询结果；消息本身从不作为成功证明。
                      const activeLease = activatedAuthority?.activeActor;
                      const activeLeaseIsExact = !!activeLease
                        && activatedAuthority.leaseState === "REMOTE_ACTIVE"
                        && activeLease.accountSubjectRef === handoffGrant.accountSubjectRef
                        && activeLease.deviceId === device.deviceId
                        && activeLease.commandId === handoffGrant.commandId
                        && activeLease.commandVersion === command.commandVersion
                        && activeLease.attemptId === handoffGrant.attemptId
                        && activeLease.handoffId === handoffGrant.handoffId
                        && activeLease.snapshotVersion === handoffGrant.snapshotVersion
                        && activeLease.handoffEpoch === handoffGrant.handoffEpoch
                        && activeLease.actorLeaseId === handoffGrant.actorLeaseId
                        && activeLease.claimId === leaseAckRequest.claimId
                        && activeLease.leaseAckId === leaseAckId
                        && Number.isFinite(activeLease.leaseAckAt)
                        && activeLease.leaseAckAt >= claimed.ack.claimedAt
                        && activeLease.leaseAckAt <= leaseAckAt
                        && activeLease.replacedActorLeaseId === handoffGrant.replacesActorLeaseId;
                      if (!activatedAuthority || !activeLease || !activeLeaseIsExact) {
                        abortPendingHandoff({
                          failureCode: "LEASE_ACK_MISMATCH",
                          failureReason: "权威 active lease 查询与远端 LeaseAck 触发事实不一致",
                          failureClass: "lease",
                          retryability: "terminal",
                          failureStage: "handoff_ack",
                        });
                      } else {
                        handoffLeaseAck = {
                          leaseAckId: activeLease.leaseAckId,
                          claimId: activeLease.claimId,
                          commandId: activeLease.commandId,
                          attemptId: activeLease.attemptId,
                          accountSubjectRef: activeLease.accountSubjectRef,
                          handoffId: activeLease.handoffId,
                          snapshotVersion: activeLease.snapshotVersion,
                          handoffEpoch: activeLease.handoffEpoch,
                          actorLeaseId: activeLease.actorLeaseId,
                          replacedActorLeaseId: activeLease.replacedActorLeaseId,
                          leaseState: "REMOTE_ACTIVE",
                          leaseAckAt: activeLease.leaseAckAt,
                        };
                        const handoffAcked = emit("handoff_acked", {
                          accountSubjectRef: handoffLeaseAck.accountSubjectRef,
                          handoffId: handoffLeaseAck.handoffId,
                          snapshotVersion: handoffLeaseAck.snapshotVersion,
                          handoffEpoch: handoffLeaseAck.handoffEpoch,
                          actorLeaseId: handoffLeaseAck.actorLeaseId,
                          leaseState: handoffLeaseAck.leaseState,
                          claimId: handoffLeaseAck.claimId,
                          leaseAckId: handoffLeaseAck.leaseAckId,
                        });
                        if (handoffAcked.disposition === "APPLIED"
                          && nextTakeover.appliedLease?.claimId === handoffLeaseAck.claimId
                          && nextTakeover.appliedLease.actorLeaseId === handoffLeaseAck.actorLeaseId) {
                          nextAuthority = activatedAuthority;
                          emit("succeeded");
                        } else {
                          abortPendingHandoff({
                            failureCode: "LEASE_ACK_MISMATCH",
                            failureReason: "K6 未接受权威 active lease 对账结果",
                            failureClass: "lease",
                            retryability: "terminal",
                            failureStage: "handoff_ack",
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          const status: DeviceStatus = nextTakeover.phase === "SUCCEEDED" ? "ACTIVATED" : nextTakeover.phase === "REVOKED" ? "RESET" : nextTakeover.phase === "FAILED" ? "ERROR" : device.status;
          const override: DeviceOverride = {
            status,
            operatorId,
            roleGate: "senior_operator",
            createdAt: at,
            reasonCategory: "现场演示需要",
            reasonText: "仅推进原型回执样例,不代表真实设备联控",
            effectiveTiming: command.effectiveTiming,
            confirmationMode: "strong_single",
            remoteTargetKey: command.remoteTargetKey,
            remoteTargetVersion: command.remoteTargetVersion,
            takeover: nextTakeover,
            reportProjection,
          };
          const audit: AuditLog = {
            auditId: nextId("AUD", at), actorId: operatorId,
            action: `沙盒命令回执样例:${ACK_SAMPLE_LABEL[outcome]}`, targetType: "device", targetId: `sandbox:${device.deviceId}`,
            beforeSnapshot: { phase: takeover.phase, appliedCommandVersion: takeover.appliedCommandVersion },
            afterSnapshot: { phase: nextTakeover.phase, appliedCommandVersion: nextTakeover.appliedCommandVersion, eventIds: emitted.map((x) => x.eventId), ignored: nextTakeover.attempts.filter((x) => emitted.some((e) => e.eventId === x.eventId) && x.ignoredReason).map((x) => ACK_IGNORE_LABEL[x.ignoredReason ?? ""] ?? "未知忽略原因") },
            reasonText: "只推进 DEV contractMock 隔离投影，不改正式设备实态", sourceContext: `后台沙盒 · ${operatorId}`,
            createdAt: at, requestId: nextId("REQ", at),
          };
          return {
            sandboxOverrides: { ...st.sandboxOverrides, [device.deviceId]: override },
            sandboxAccountAuthorities: { ...authorities, [device.accountSubjectRef]: nextAuthority },
            audit: [audit, ...st.audit],
          };
        });
      },
      saveRemoteTargetVersion: (key, label, url, owner, reason, impact, operatorId, operatorRole) => {
        if (operatorRole !== "admin" || label.trim().length < 2 || owner.trim().length < 2 || reason.trim().length < 4 || impact.trim().length < 4) return;
        let targetOrigin: string;
        try { const parsed = new URL(url); if (parsed.protocol !== "https:") return; targetOrigin = parsed.origin; } catch { return; }
        const at = Date.now();
        set((st) => {
          const remoteTargetVersion = Math.max(0, ...st.remoteTargets.filter((t) => t.remoteTargetKey === key).map((t) => t.remoteTargetVersion)) + 1;
          const catalogVersion = st.catalogVersion + 1;
          const target: RemoteTarget = {
            catalogVersion, remoteTargetKey: key, remoteTargetVersion, status: "active", label: label.trim(), url,
            origin: targetOrigin, source: "admin", ownerId: owner.trim(), createdAt: at, updatedAt: at, updatedBy: operatorId, changeReason: reason.trim(),
          };
          const audit: AuditLog = {
            auditId: nextId("AUD", at), actorId: operatorId, action: `新增批准目标版本「${target.label}」v${remoteTargetVersion}`,
            targetType: "config", targetId: `${key}:v${remoteTargetVersion}`, beforeSnapshot: null,
            afterSnapshot: { ...target, impact: impact.trim(), prototypeOnly: true }, reasonText: reason.trim(), sourceContext: `后台 · ${operatorId}`, createdAt: at, requestId: nextId("REQ", at),
          };
          return { remoteTargets: [...st.remoteTargets, target], catalogVersion, audit: [audit, ...st.audit] };
        });
      },
      disableRemoteTarget: (key, version, reason, impact, operatorId, operatorRole) => {
        if (operatorRole !== "admin" || reason.trim().length < 4 || impact.trim().length < 4) return;
        const at = Date.now();
        set((st) => {
          const target = findTarget(st.remoteTargets, key, version);
          if (!target) return st;
          const catalogVersion = st.catalogVersion + 1;
          const disabledRecord: RemoteTarget = { ...target, status: "disabled", catalogVersion, updatedAt: at, updatedBy: operatorId, changeReason: reason.trim() };
          const remoteTargets = [...st.remoteTargets, disabledRecord];
          const overrides = { ...st.overrides };
          let cancelledCommands = 0;
          for (const device of effectiveDevices(st.overrides)) {
            const command = device.takeover.currentCommand;
            if (!command || device.takeover.phase !== "COMMAND_PENDING_ACK" || command.remoteTargetKey !== key || command.remoteTargetVersion !== version) continue;
            cancelledCommands += 1;
            const cancellation = {
              cancellationId: nextId("CAN", at), deviceId: command.deviceId, commandId: command.commandId,
              attemptId: device.takeover.attemptId ?? `UNCLAIMED-${command.commandId}`, commandVersion: command.commandVersion,
              cancelledAt: at, reason: "target_disabled" as const, catalogVersion,
            };
            const previous = st.overrides[device.deviceId];
            overrides[device.deviceId] = {
              status: previous?.status ?? device.status,
              operatorId,
              roleGate: "admin",
              createdAt: previous?.createdAt ?? at,
              reasonCategory: previous?.reasonCategory ?? "批准目标目录变更",
              reasonText: previous?.reasonText ?? "批准目标已停用，未领取命令取消",
              effectiveTiming: previous?.effectiveTiming ?? command.effectiveTiming,
              expireAt: previous?.expireAt,
              remoteTargetKey: previous?.remoteTargetKey ?? command.remoteTargetKey,
              remoteTargetVersion: previous?.remoteTargetVersion ?? command.remoteTargetVersion,
              confirmationMode: previous?.confirmationMode ?? "strong_single",
              impactAcknowledgement: previous?.impactAcknowledgement,
              reportProjection: previous?.reportProjection,
              takeover: {
                ...device.takeover, desiredMode: device.takeover.appliedMode, phase: "CANCELLED", currentClaim: undefined,
                cancellations: [...(device.takeover.cancellations ?? []), cancellation], failureCode: undefined, failureClass: "target",
                retryability: "terminal", failureStage: "target_resolution", failureReason: "批准目标已停用,未领取命令已取消",
              },
            };
          }
          const affectedStrategies = st.strategies.filter((s) => s.action.remoteTargetKey === key && s.action.remoteTargetVersion === version).map((s) => s.strategyId);
          const audit: AuditLog = {
            auditId: nextId("AUD", at), actorId: operatorId, action: `停用批准目标「${target.label}」v${version}`,
            targetType: "config", targetId: `${key}:v${version}`,
            beforeSnapshot: target, afterSnapshot: { status: "disabled", catalogVersion, affectedStrategies, cancelledCommands, impact: impact.trim(), prototypeOnly: true },
            reasonText: reason.trim(), sourceContext: `后台 · ${operatorId}`, createdAt: at, requestId: nextId("REQ", at),
          };
          return { remoteTargets, catalogVersion, overrides, audit: [audit, ...st.audit] };
        });
      },
      recordExport: (label, operatorId, operatorRole, detail) => {
        if (operatorRole === "viewer") return false;
        const at = Date.now();
        const audit: AuditLog = {
          auditId: nextId("AUD", at), actorId: operatorId, action: label,
          targetType: "config", targetId: "export",
          beforeSnapshot: null, afterSnapshot: detail,
          sourceContext: `后台 · ${operatorId}`, createdAt: at, requestId: nextId("REQ", at),
        };
        set((s) => ({ audit: [audit, ...s.audit] }));
        return true;
      },
      resetAll: () => set({
        overrides: {}, sandboxOverrides: {}, audit: [], strategies: JANUS_STRATEGIES,
        policyBundles: INITIAL_POLICY_BUNDLES, policyReceipts: [],
        sandboxPolicyBundles: deepClone(INITIAL_POLICY_BUNDLES), sandboxPolicyReceipts: [],
        dryRunCredentials: [], decisionSnapshots: [], sandboxDecisionSnapshots: [],
        accountAuthorities: INITIAL_ACCOUNT_AUTHORITIES, sandboxAccountAuthorities: deepClone(INITIAL_ACCOUNT_AUTHORITIES),
        publishedBundleVersion: 5, appliedBundleVersion: 5, sandboxPublishedBundleVersion: 5, sandboxAppliedBundleVersion: 5,
        remoteTargets: REMOTE_TARGET_CATALOG, catalogVersion: 5,
      }),
    }),
    {
      name: "nexgrid-admin-janus-c2-v4",
      merge: (persisted, current) => {
        const old = persisted as Partial<JanusC2State>;
        const overrides = normalizePersistedOverrides(old.overrides ?? {});
        const sandboxOverrides = normalizePersistedOverrides(old.sandboxOverrides ?? {});
        return {
          ...current,
          ...old,
          overrides,
          sandboxOverrides,
          sandboxPolicyBundles: old.sandboxPolicyBundles ?? deepClone(INITIAL_POLICY_BUNDLES),
          sandboxPolicyReceipts: old.sandboxPolicyReceipts ?? [],
          sandboxDecisionSnapshots: old.sandboxDecisionSnapshots ?? [],
          sandboxPublishedBundleVersion: old.sandboxPublishedBundleVersion ?? 5,
          sandboxAppliedBundleVersion: old.sandboxAppliedBundleVersion ?? 5,
          accountAuthorities: normalizeAuthorityMap(old.accountAuthorities ?? buildAccountAuthorityProjections(effectiveDevices(overrides)), effectiveDevices(overrides)),
          sandboxAccountAuthorities: normalizeAuthorityMap(old.sandboxAccountAuthorities ?? deepClone(INITIAL_ACCOUNT_AUTHORITIES), effectiveDevices(sandboxOverrides)),
        };
      },
    },
  ),
);

/** 基础设备 + 手动覆盖 → 有效设备(状态/来源/操作人/优先级 live 派生,单源不缓存)。 */
export function effectiveDevices(overrides: Record<string, DeviceOverride>): Device[] {
  return JANUS_DEVICES.map((d) => {
    const o = overrides[d.deviceId];
    if (!o) return d;
    const projectedSessions = o.reportProjection?.sessions.map((projection) => {
      const existing = d.sessions.find((session) => session.sessionId === projection.sessionId);
      return existing ? {
        ...existing,
        startedAt: projection.startedAt,
        lastSeenAt: projection.lastSeenAt,
        reportIds: projection.reportIds,
        appPhase: projection.sessionId === o.reportProjection?.latestSessionId ? o.reportProjection.instantaneousSignals?.appPhase : existing.appPhase,
      } : {
        sessionId: projection.sessionId,
        deviceId: projection.deviceId,
        startedAt: projection.startedAt,
        lastSeenAt: projection.lastSeenAt,
        appPhase: projection.sessionId === o.reportProjection?.latestSessionId ? o.reportProjection.instantaneousSignals?.appPhase : undefined,
        reportIds: projection.reportIds,
      };
    });
    const projectedReports = o.reportProjection?.acceptedReports ?? d.reports;
    const currentAppliedReports = projectedReports.filter((report) => !("ingestDisposition" in report) || report.ingestDisposition === "APPLIED");
    const latestProjectedReport = currentAppliedReports.at(-1) ?? d.latestReport;
    const cumulative = o.reportProjection?.cumulativeSignals;
    const instantaneous = o.reportProjection?.instantaneousSignals;
    const maturity = cumulative ? {
      ...d.maturity,
      appOpenCount: cumulative.appOpenCount,
      sessionCount: cumulative.sessionCount,
      foregroundDurationSeconds: cumulative.foregroundDurationSeconds,
    } : d.maturity;
    const environmentRiskScore = instantaneous?.environmentRiskScore ?? d.environmentRiskScore;
    const environment = { ...d.environment, environmentRiskScore };
    const newCurrentReports = currentAppliedReports.filter((report) => !d.reports.some((seed) => seed.reportId === report.reportId)).length;
    const maturityScore = Math.min(
      100,
      Math.min(20, maturity.appOpenCount * 4) + Math.min(15, maturity.repeatStreakDays * 5)
        + (maturity.benchmarkViewed ? 15 : 0) + (maturity.optimizeDone ? 15 : 0)
        + Math.min(10, Math.floor(maturity.foregroundDurationSeconds / 60) * 2)
        + (d.inviteCode ? 10 : 0) + Math.min(15, d.installDays * 2),
    );
    const merged: Device = {
      ...d,
      status: o.status,
      statusSource: o.statusSource ?? "manual",
      activated: o.takeover.appliedMode === "REMOTE",
      takeover: o.takeover,
      sessions: projectedSessions ?? d.sessions,
      latestSessionId: o.reportProjection?.latestSessionId ?? d.latestSessionId,
      latestSession: projectedSessions?.find((session) => session.sessionId === o.reportProjection?.latestSessionId) ?? d.latestSession,
      latestReport: latestProjectedReport,
      reports: projectedReports,
      ignoredReports: o.reportProjection?.ignoredReports ?? d.ignoredReports,
      lastSeenAt: projectDeviceLastSeenAt(d.lastSeenAt, currentAppliedReports),
      maturity,
      maturityScore,
      environment,
      environmentRiskScore,
      signalRevision: d.signalRevision + newCurrentReports,
      latestDecision: o.decisionSnapshot ?? d.latestDecision,
      lastOperatorId: o.operatorId,
      lastOperationReason: o.reasonText,
      manualOverride: (o.statusSource ?? "manual") === "manual" ? {
        targetStatus: o.status,
        reasonCategory: o.reasonCategory,
        reasonText: o.reasonText,
        operatorId: o.operatorId,
        effectiveTiming: o.effectiveTiming,
        expireAt: o.expireAt,
        createdAt: o.createdAt,
        confirmationMode: o.confirmationMode,
        roleGate: o.roleGate,
        remoteTargetKey: o.remoteTargetKey,
        remoteTargetVersion: o.remoteTargetVersion,
        impactAcknowledgement: o.impactAcknowledgement,
      } : undefined,
    };
    // 状态变了 → 优先级/建议分 live 重算(不缓存旧值)。
    const recommendationScore = computeRecommendationScore(merged);
    const withRec = { ...merged, recommendationScore };
    return { ...withRec, priorityScore: computePriorityScore(withRec) };
  });
}
