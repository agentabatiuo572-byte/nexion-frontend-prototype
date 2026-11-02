import type {
  AccountAuthorityCandidate,
  AccountAuthorityProjection,
  AccountAuthorityRevokeReceipt,
  AccountAuthorityRequestReceipt,
  AccountAuthorityRequestRejectionReason,
  DeliveredTakeoverCommand,
  Device,
  HandoffClaimAck,
  HandoffClaimReceipt,
  HandoffClaimRequest,
  HandoffCancelAck,
  HandoffGrant,
  HandoffGrantRecoveryContext,
  LedgerTakeoverCommand,
  PendingHandoffAbortAck,
  RevokeAuthorityAck,
} from "./types.ts";

type AuthorityRequestKind = "grant" | "revoke";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return nonNegativeSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function preferredAccountAuthority(
  subject: string,
  preferred: Record<string, AccountAuthorityProjection>,
  fallback: Record<string, AccountAuthorityProjection>,
): AccountAuthorityProjection | undefined {
  return preferred[subject] ?? fallback[subject];
}

function canonicalAuthorityRequest(
  authority: AccountAuthorityProjection,
  command: LedgerTakeoverCommand,
  attemptId: string,
  kind: AuthorityRequestKind,
  deviceId: string,
  deviceAccountSubjectRef?: string,
  targetOrigin?: string,
  replacesActorLeaseId?: string,
  recovery?: HandoffGrantRecoveryContext,
): string {
  const cause = command.cause.kind === "manual"
    ? [command.cause.kind, command.cause.requestId, command.cause.auditId, command.cause.impactAcknowledgementId]
    : [command.cause.kind, command.cause.decisionId];
  return canonicalJson([
    kind, authority.accountSubjectRef, deviceAccountSubjectRef ?? authority.accountSubjectRef, attemptId,
    command.commandId, deviceId, command.commandVersion, command.policyBundleVersion, command.catalogVersion,
    command.type, command.idempotencyKey, command.expectedCommandVersion, command.effectiveTiming,
    command.issuedAt, command.validUntil, command.remoteTargetKey ?? null, command.remoteTargetVersion ?? null,
    cause, targetOrigin ?? null, replacesActorLeaseId ?? null, recovery ?? null,
  ]);
}

function ledgerFromDelivered(command: DeliveredTakeoverCommand): LedgerTakeoverCommand {
  const { schemaVersion: _schemaVersion, resolvedTarget: _resolvedTarget, ...ledger } = command;
  return ledger;
}

function validRecoveryContext(
  device: Device,
  command: LedgerTakeoverCommand,
  attemptId: string,
  targetOrigin: string,
  recovery: HandoffGrantRecoveryContext,
): boolean {
  const delivered = recovery.deliveredCommand;
  const binding = recovery.attemptBinding;
  const target = delivered?.resolvedTarget;
  const currentCommand = device.takeover.currentCommand;
  const currentClaim = device.takeover.currentClaim;
  const expectedExecutionSessionId = currentClaim?.executionSessionId ?? currentClaim?.claimedSessionId;
  const expectedBindingSessionId = binding?.status === "session_boundary" ? currentClaim?.executionSessionId : currentClaim?.claimedSessionId;
  const matchingBindingEvent = binding ? device.takeover.attempts.find((event) =>
    !event.ignoredReason
    && event.schemaVersion === "1.0"
    && event.deviceId === device.deviceId
    && event.commandId === command.commandId
    && event.commandVersion === command.commandVersion
    && event.commandType === command.type
    && event.attemptId === attemptId
    && event.eventSeq === binding.eventSeq
    && event.status === binding.status
    && event.sessionId === expectedBindingSessionId) : undefined;
  if (delivered?.schemaVersion !== "1.0" || canonicalJson(ledgerFromDelivered(delivered)) !== canonicalJson(command) ||
    !binding || binding.attemptId !== attemptId || !nonEmpty(binding.claimedSessionId) || !nonEmpty(binding.executionSessionId) ||
    !Number.isInteger(binding.eventSeq) || binding.eventSeq <= 0 || !["received", "session_boundary"].includes(binding.status)) return false;
  if (!currentCommand || canonicalJson(currentCommand) !== canonicalJson(command)
    || device.takeover.attemptId !== attemptId
    || !currentClaim || currentClaim.commandId !== command.commandId || currentClaim.commandVersion !== command.commandVersion
    || currentClaim.attemptId !== attemptId || currentClaim.claimedSessionId !== binding.claimedSessionId
    || expectedExecutionSessionId !== binding.executionSessionId
    || !currentClaim.deliveredCommand || canonicalJson(currentClaim.deliveredCommand) !== canonicalJson(delivered)
    || !matchingBindingEvent) return false;
  if (command.type === "REVOKE") return target === undefined;
  if (!target || target.status !== "active" || target.origin !== targetOrigin ||
    target.remoteTargetKey !== command.remoteTargetKey || target.remoteTargetVersion !== command.remoteTargetVersion ||
    target.catalogVersion !== command.catalogVersion || !nonEmpty(target.url) || !Number.isFinite(target.resolvedAt)) return false;
  try {
    const parsedTarget = new URL(target.url);
    const parsedOrigin = new URL(targetOrigin);
    return ["http:", "https:"].includes(parsedTarget.protocol) && parsedTarget.origin !== "null"
      && parsedTarget.origin === targetOrigin && parsedOrigin.origin === targetOrigin;
  } catch {
    return false;
  }
}

function requestReceipt(authority: AccountAuthorityProjection, commandId: string, attemptId: string): AccountAuthorityRequestReceipt | undefined {
  return (authority.requestReceipts ?? []).find((receipt) => receipt.commandId === commandId && receipt.attemptId === attemptId);
}

function revokeReceipt(authority: AccountAuthorityProjection, commandId: string, attemptId: string): AccountAuthorityRevokeReceipt | undefined {
  return (authority.revokeReceipts ?? []).find((receipt) => receipt.commandId === commandId && receipt.attemptId === attemptId);
}

function appendRequestReceipt(authority: AccountAuthorityProjection, receipt: AccountAuthorityRequestReceipt, at: number): AccountAuthorityProjection {
  return {
    ...authority,
    requestReceipts: [...(authority.requestReceipts ?? []), receipt],
    updatedAt: Math.max(authority.updatedAt, at),
  };
}

function receiptBase(
  authority: AccountAuthorityProjection,
  command: LedgerTakeoverCommand,
  attemptId: string,
  canonicalPayload: string,
  at: number,
): Omit<AccountAuthorityRequestReceipt, "outcome"> {
  return {
    receiptId: `AREQ-${command.commandId}-${attemptId}`,
    commandId: command.commandId,
    attemptId,
    commandVersion: command.commandVersion,
    commandType: command.type,
    accountSubjectRef: authority.accountSubjectRef,
    deviceId: command.deviceId,
    canonicalPayload,
    recordedAt: at,
  };
}

export function buildAccountAuthorityProjections(devices: Device[]): Record<string, AccountAuthorityProjection> {
  const projections: Record<string, AccountAuthorityProjection> = {};
  for (const device of devices) {
    const subject = device.accountSubjectRef;
    const current = projections[subject] ?? {
      accountSubjectRef: subject,
      handoffEpoch: 0,
      maxCommandVersion: 0,
      issuedCommandVersion: 0,
      revokeFloor: 0,
      leaseState: "WHITE_ACTIVE" as const,
      pendingCandidates: [],
      requestReceipts: [],
      claimReceipts: [],
      revokeReceipts: [],
      updatedAt: device.lastSeenAt,
    };
    const recordedRevokeFloor = Math.max(0, ...device.takeover.attempts
      .filter((event) => !event.ignoredReason && event.commandType === "REVOKE" && event.status === "succeeded" && nonNegativeSafeInteger(event.commandVersion))
      .map((event) => event.commandVersion));
    const appliedCommandVersion = nonNegativeSafeInteger(device.takeover.appliedCommandVersion) ? device.takeover.appliedCommandVersion : 0;
    const deviceCommandVersion = nonNegativeSafeInteger(device.takeover.commandVersion) ? device.takeover.commandVersion : 0;
    const revokeFloor = Math.max(
      current.revokeFloor ?? 0,
      recordedRevokeFloor,
      // legacy seed/persisted state may predate append-only ACK history.
      device.takeover.phase === "REVOKED" ? appliedCommandVersion : 0,
    );
    // Device 执行投影只能贡献单调水位，绝不能反向铸造账户服务 candidate/active actor。
    const pendingCandidates: AccountAuthorityCandidate[] = [];
    const activeActor = undefined;
    const observedLease = device.takeover.appliedLease;
    const invalidDeviceWatermark = !nonNegativeSafeInteger(device.takeover.commandVersion)
      || !nonNegativeSafeInteger(device.takeover.appliedCommandVersion)
      || (observedLease != null && !positiveSafeInteger(observedLease.handoffEpoch))
      || (device.takeover.pendingHandoff != null && !positiveSafeInteger(device.takeover.pendingHandoff.handoffEpoch));
    const quarantineReason = current.quarantineReason
      ?? (observedLease || device.takeover.pendingHandoff || invalidDeviceWatermark ? "UNVERIFIED_DEVICE_AUTHORITY" as const : undefined);
    const handoffEpoch = Math.max(
      current.handoffEpoch,
      observedLease && positiveSafeInteger(observedLease.handoffEpoch) ? observedLease.handoffEpoch : 0,
      device.takeover.pendingHandoff && positiveSafeInteger(device.takeover.pendingHandoff.handoffEpoch) ? device.takeover.pendingHandoff.handoffEpoch : 0,
    );
    const maxCommandVersion = Math.max(
      current.maxCommandVersion ?? 0,
      revokeFloor,
      ...pendingCandidates.map((candidate) => candidate.commandVersion ?? 0),
    );
    const issuedCommandVersion = Math.max(current.issuedCommandVersion ?? 0, deviceCommandVersion, maxCommandVersion);
    projections[subject] = {
      accountSubjectRef: subject,
      handoffEpoch,
      maxCommandVersion: Math.max(maxCommandVersion, revokeFloor),
      issuedCommandVersion,
      revokeFloor,
      leaseState: pendingCandidates.length ? "TRANSFERRING" : activeActor ? "REMOTE_ACTIVE" : "WHITE_ACTIVE",
      quarantineReason,
      activeActor,
      pendingCandidates,
      requestReceipts: current.requestReceipts ?? [],
      claimReceipts: current.claimReceipts ?? [],
      revokeReceipts: current.revokeReceipts ?? [],
      updatedAt: Math.max(current.updatedAt, observedLease?.leaseAckAt ?? 0, device.lastSeenAt),
    };
  }
  return projections;
}

export type AuthorityGrantResult =
  | { ok: true; authority: AccountAuthorityProjection; grant: HandoffGrant }
  | { ok: false; authority: AccountAuthorityProjection; reason: AccountAuthorityRequestRejectionReason };

function rejectedGrant(
  authority: AccountAuthorityProjection,
  command: LedgerTakeoverCommand,
  attemptId: string,
  canonicalPayload: string,
  at: number,
  reason: AccountAuthorityRequestRejectionReason,
): AuthorityGrantResult {
  const receipt: AccountAuthorityRequestReceipt = { ...receiptBase(authority, command, attemptId, canonicalPayload, at), outcome: "rejected", rejectionReason: reason };
  return { ok: false, authority: appendRequestReceipt(authority, receipt, at), reason };
}

function grantMatchesCandidate(grant: HandoffGrant, candidate: AccountAuthorityCandidate): boolean {
  return grant.commandId === candidate.commandId
    && grant.attemptId === candidate.attemptId
    && grant.accountSubjectRef === candidate.accountSubjectRef
    && grant.operation === candidate.operation
    && grant.handoffId === candidate.handoffId
    && grant.snapshotVersion === candidate.snapshotVersion
    && grant.handoffEpoch === candidate.handoffEpoch
    && grant.actorLeaseId === candidate.actorLeaseId
    && grant.replacesActorLeaseId === candidate.replacesActorLeaseId
    && grant.handoffToken === candidate.handoffToken
    && grant.targetOrigin === candidate.targetOrigin
    && grant.leaseState === candidate.leaseState
    && grant.expiresAt === candidate.expiresAt;
}

type CanonicalGrantReceipt = AccountAuthorityRequestReceipt & {
  grant: HandoffGrant;
  deliveredCommand: DeliveredTakeoverCommand;
  attemptBinding: HandoffGrantRecoveryContext["attemptBinding"];
};

/** 持久化 hydrate/恢复不得只看“有 receipt”；其 canonical request 指纹及 grant/recovery 自洽性必须可重算。 */
function grantReceiptInternallyValid(
  authority: AccountAuthorityProjection,
  receipt: AccountAuthorityRequestReceipt | undefined,
): receipt is CanonicalGrantReceipt {
  if (!receipt || receipt.outcome !== "grant_issued" || !receipt.grant || !receipt.deliveredCommand || !receipt.attemptBinding) return false;
  const grant = receipt.grant;
  const delivered = receipt.deliveredCommand;
  const attempt = receipt.attemptBinding;
  const command = ledgerFromDelivered(delivered);
  const recovery: HandoffGrantRecoveryContext = { deliveredCommand: delivered, attemptBinding: attempt };
  return receipt.receiptId === `AREQ-${receipt.commandId}-${receipt.attemptId}`
    && receipt.accountSubjectRef === authority.accountSubjectRef && grant.accountSubjectRef === authority.accountSubjectRef
    && receipt.commandId === command.commandId && receipt.commandId === grant.commandId
    && receipt.attemptId === grant.attemptId && receipt.attemptId === attempt.attemptId
    && receipt.commandVersion === command.commandVersion && positiveSafeInteger(command.commandVersion)
    && nonNegativeSafeInteger(command.expectedCommandVersion) && receipt.commandType === command.type
    && receipt.deviceId === command.deviceId && grant.operation === command.type && grant.leaseState === "TRANSFERRING"
    && delivered.schemaVersion === "1.0" && delivered.resolvedTarget?.origin === grant.targetOrigin
    && positiveSafeInteger(grant.snapshotVersion) && positiveSafeInteger(grant.handoffEpoch)
    && Number.isFinite(receipt.recordedAt) && Number.isFinite(grant.expiresAt) && grant.expiresAt > receipt.recordedAt
    && nonEmpty(attempt.claimedSessionId) && nonEmpty(attempt.executionSessionId)
    && Number.isSafeInteger(attempt.eventSeq) && attempt.eventSeq > 0 && ["received", "session_boundary"].includes(attempt.status)
    && receipt.canonicalPayload === canonicalAuthorityRequest(
      authority,
      command,
      receipt.attemptId,
      "grant",
      receipt.deviceId,
      authority.accountSubjectRef,
      grant.targetOrigin,
      grant.replacesActorLeaseId,
      recovery,
    );
}

export interface RecoveredAccountAuthorityGrant extends HandoffGrantRecoveryContext {
  grant: HandoffGrant;
  /** lease-acks 响应丢失时返回既存 actor；其中 claim/ACK ID 均是不透明权威身份，禁止重造。 */
  activeActor?: NonNullable<AccountAuthorityProjection["activeActor"]>;
}

/** 仅从账户服务不可变 request receipt 恢复当前 grant；设备 pendingHandoff 本身不是权威来源。 */
export function recoverAccountAuthorityGrant(
  authority: AccountAuthorityProjection,
  commandId: string,
  attemptId: string,
  expectedPendingGrant?: HandoffGrant,
): RecoveredAccountAuthorityGrant | undefined {
  const receipt = (authority.requestReceipts ?? []).find((item) =>
    item.commandId === commandId && item.attemptId === attemptId && item.outcome === "grant_issued");
  if (!grantReceiptInternallyValid(authority, receipt)
    || receipt.commandVersion <= (authority.revokeFloor ?? 0)
    || (expectedPendingGrant && canonicalJson(expectedPendingGrant) !== canonicalJson(receipt.grant))) return undefined;
  const grant = receipt.grant;
  const candidateIsCurrent = authority.pendingCandidates.length === 1
    && receipt.commandVersion >= (authority.issuedCommandVersion ?? 0)
    && authority.pendingCandidates.some((candidate) => candidate.commandVersion === receipt.commandVersion && grantMatchesCandidate(grant, candidate));
  const actor = authority.activeActor;
  const actorIsCurrent = !!actor
    && authority.leaseState === "REMOTE_ACTIVE"
    && authority.pendingCandidates.length === 0
    && actor.commandId === receipt.commandId && actor.attemptId === receipt.attemptId && actor.commandVersion === receipt.commandVersion
    && actor.accountSubjectRef === grant.accountSubjectRef && actor.handoffId === grant.handoffId
    && actor.snapshotVersion === grant.snapshotVersion && actor.handoffEpoch === grant.handoffEpoch
    && actor.actorLeaseId === grant.actorLeaseId && actor.replacedActorLeaseId === grant.replacesActorLeaseId
    && accountAuthorityActorHasCanonicalClaimChain(authority, actor);
  if (!candidateIsCurrent && !actorIsCurrent) return undefined;
  return {
    grant: structuredClone(grant),
    deliveredCommand: structuredClone(receipt.deliveredCommand),
    attemptBinding: structuredClone(receipt.attemptBinding),
    activeActor: actorIsCurrent ? structuredClone(actor) : undefined,
  };
}

/** 账户服务原型 reducer：设备只能请求 grant，不能自行决定 epoch/lease。 */
export function requestAccountAuthorityGrant(
  authority: AccountAuthorityProjection,
  device: Device,
  command: LedgerTakeoverCommand,
  attemptId: string,
  targetOrigin: string,
  at: number,
  replacesActorLeaseId?: string,
  recovery?: HandoffGrantRecoveryContext,
): AuthorityGrantResult {
  const canonicalPayload = canonicalAuthorityRequest(authority, command, attemptId, "grant", device.deviceId, device.accountSubjectRef, targetOrigin, replacesActorLeaseId, recovery);
  const replay = requestReceipt(authority, command.commandId, attemptId);
  if (replay) {
    if (replay.canonicalPayload !== canonicalPayload) return { ok: false, authority, reason: "request_conflict" };
    if (replay.outcome === "grant_issued" && replay.grant) {
      if (!grantReceiptInternallyValid(authority, replay)) return { ok: false, authority, reason: "request_conflict" };
      if (replay.commandVersion <= (authority.revokeFloor ?? 0)) return { ok: false, authority, reason: "stale_command" };
      const candidateIdentityIsCurrent = authority.pendingCandidates.some((candidate) =>
        candidate.commandId === replay.commandId && candidate.attemptId === replay.attemptId && candidate.commandVersion === replay.commandVersion);
      const candidateIsCurrent = authority.pendingCandidates.some((candidate) => candidate.commandVersion === replay.commandVersion && grantMatchesCandidate(replay.grant!, candidate));
      const actor = authority.activeActor;
      const actorRequestIdentityIsCurrent = !!actor
        && actor.commandId === replay.commandId
        && actor.attemptId === replay.attemptId
        && actor.commandVersion === replay.commandVersion;
      const actorProofIsExact = actorRequestIdentityIsCurrent
        && actor.accountSubjectRef === replay.grant.accountSubjectRef
        && actor.handoffId === replay.grant.handoffId
        && actor.snapshotVersion === replay.grant.snapshotVersion
        && actor.handoffEpoch === replay.grant.handoffEpoch
        && actor.actorLeaseId === replay.grant.actorLeaseId;
      const actorIsCurrent = actorProofIsExact && accountAuthorityActorHasCanonicalClaimChain(authority, actor);
      if ((candidateIdentityIsCurrent && !candidateIsCurrent) || (actorRequestIdentityIsCurrent && !actorIsCurrent)) {
        return { ok: false, authority, reason: "request_conflict" };
      }
      if (!candidateIsCurrent && !actorIsCurrent) {
        return { ok: false, authority, reason: "stale_command" };
      }
      return { ok: true, authority, grant: structuredClone(replay.grant) };
    }
    return { ok: false, authority, reason: replay.rejectionReason ?? "request_conflict" };
  }
  if (!positiveSafeInteger(command.commandVersion) || !nonNegativeSafeInteger(command.expectedCommandVersion)) {
    return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "request_conflict");
  }
  if (command.type === "REVOKE") return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "wrong_command_type");
  if (authority.quarantineReason) return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "authority_quarantined");
  if (!recovery) return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "recovery_binding_missing");
  if (!validRecoveryContext(device, command, attemptId, targetOrigin, recovery)) {
    return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "request_conflict");
  }
  if (device.accountSubjectRef !== authority.accountSubjectRef || command.deviceId !== device.deviceId) {
    return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "request_conflict");
  }
  if (command.commandVersion <= (authority.maxCommandVersion ?? 0)
    || command.commandVersion <= (authority.revokeFloor ?? 0)
    || command.commandVersion < (authority.issuedCommandVersion ?? 0)) {
    return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "stale_command");
  }
  const existingCandidate = authority.pendingCandidates.find((candidate) => candidate.commandId === command.commandId && candidate.attemptId === attemptId);
  if (existingCandidate) {
    if (existingCandidate.commandVersion !== command.commandVersion || existingCandidate.operation !== command.type || existingCandidate.deviceId !== device.deviceId || existingCandidate.targetOrigin !== targetOrigin || existingCandidate.replacesActorLeaseId !== replacesActorLeaseId) {
      return { ok: false, authority, reason: "request_conflict" };
    }
    const { deviceId: internalDeviceId, ...grant } = existingCandidate;
    void internalDeviceId;
    const { commandVersion: internalCommandVersion, ...publicGrant } = grant;
    void internalCommandVersion;
    const receipt: AccountAuthorityRequestReceipt = {
      ...receiptBase(authority, command, attemptId, canonicalPayload, at),
      outcome: "grant_issued",
      grant: structuredClone(publicGrant),
      ...structuredClone(recovery),
    };
    return { ok: true, authority: appendRequestReceipt(authority, receipt, at), grant: structuredClone(publicGrant) };
  }
  const competingCandidate = authority.pendingCandidates.find((candidate) => candidate.commandId !== command.commandId || candidate.attemptId !== attemptId);
  if (competingCandidate) return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "candidate_exists");
  if (command.type === "ACTIVATE" && replacesActorLeaseId !== undefined) return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "unexpected_replacement");
  if (command.type === "ACTIVATE" && authority.activeActor) return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "active_actor_exists");
  if (command.type === "CHANGE_TARGET" && !authority.activeActor) return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "replacement_missing");
  if (command.type === "CHANGE_TARGET" && !replacesActorLeaseId) return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "replacement_missing");
  if (command.type === "CHANGE_TARGET" && authority.activeActor?.actorLeaseId !== replacesActorLeaseId) {
    return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "replacement_mismatch");
  }
  if (command.type === "CHANGE_TARGET" && authority.activeActor?.deviceId !== device.deviceId) {
    return rejectedGrant(authority, command, attemptId, canonicalPayload, at, "replacement_owned_by_other_device");
  }
  const handoffEpoch = authority.handoffEpoch + 1;
  const grant: HandoffGrant = {
    commandId: command.commandId,
    attemptId,
    accountSubjectRef: authority.accountSubjectRef,
    operation: command.type,
    handoffId: `HOF-${command.commandId}-${handoffEpoch}`,
    snapshotVersion: Math.max(0, authority.activeActor?.snapshotVersion ?? 0) + 1,
    handoffEpoch,
    actorLeaseId: `LEASE-${command.commandId}-${handoffEpoch}`,
    replacesActorLeaseId: command.type === "CHANGE_TARGET" ? replacesActorLeaseId : undefined,
    handoffToken: `TOKEN-${command.commandId}-${handoffEpoch}`,
    targetOrigin,
    leaseState: "TRANSFERRING",
    expiresAt: at + 60_000,
  };
  const candidate: AccountAuthorityCandidate = { ...grant, deviceId: device.deviceId, commandVersion: command.commandVersion };
  const receipt: AccountAuthorityRequestReceipt = {
    ...receiptBase(authority, command, attemptId, canonicalPayload, at),
    outcome: "grant_issued",
    grant: structuredClone(grant),
    ...structuredClone(recovery),
  };
  return {
    ok: true,
    grant: structuredClone(grant),
    authority: {
      ...authority,
      handoffEpoch,
      maxCommandVersion: Math.max(authority.maxCommandVersion ?? 0, command.commandVersion),
      issuedCommandVersion: Math.max(authority.issuedCommandVersion ?? 0, command.commandVersion),
      leaseState: "TRANSFERRING",
      pendingCandidates: [candidate],
      requestReceipts: [...(authority.requestReceipts ?? []), receipt],
      updatedAt: at,
    },
  };
}

export type AccountAuthorityClaimRejectionReason =
  | "invalid_request"
  | "handoff_not_found"
  | "origin_mismatch"
  | "token_mismatch"
  | "fence_mismatch"
  | "expired"
  | "not_current"
  | "request_conflict"
  | "claim_request_id_reused"
  | "recovery_binding_missing";

export type AuthorityClaimResult =
  | { ok: true; authority: AccountAuthorityProjection; ack: HandoffClaimAck }
  | { ok: false; authority: AccountAuthorityProjection; reason: AccountAuthorityClaimRejectionReason };

const CLAIM_REQUEST_FIELDS = [
  "claimRequestId", "handoffToken", "commandId", "attemptId", "snapshotVersion", "handoffEpoch", "actorLeaseId",
] as const;

function validClaimRequest(request: HandoffClaimRequest): boolean {
  if (!isRecord(request)) return false;
  const record = request as unknown as Record<string, unknown>;
  return Object.keys(record).length === CLAIM_REQUEST_FIELDS.length
    && CLAIM_REQUEST_FIELDS.every((field) => field in record)
    && [request.claimRequestId, request.handoffToken, request.commandId, request.attemptId, request.actorLeaseId].every(nonEmpty)
    && Number.isInteger(request.snapshotVersion) && request.snapshotVersion > 0
    && Number.isInteger(request.handoffEpoch) && request.handoffEpoch > 0;
}

function canonicalClaimRequest(handoffId: string, request: HandoffClaimRequest, trustedOrigin: string): string {
  return canonicalJson([handoffId, trustedOrigin, request]);
}

function claimAckMatchesGrant(ack: HandoffClaimAck, grant: HandoffGrant): boolean {
  return ack.handoffId === grant.handoffId
    && ack.accountSubjectRef === grant.accountSubjectRef
    && ack.commandId === grant.commandId
    && ack.attemptId === grant.attemptId
    && ack.snapshotVersion === grant.snapshotVersion
    && ack.handoffEpoch === grant.handoffEpoch
    && ack.actorLeaseId === grant.actorLeaseId
    && ack.targetOrigin === grant.targetOrigin
    && ack.leaseState === "TRANSFERRING";
}

function claimReceiptInternallyValid(receipt: HandoffClaimReceipt): boolean {
  if (!isRecord(receipt) || !isRecord(receipt.request) || !isRecord(receipt.ack)
    || !isRecord(receipt.ack.command) || !isRecord(receipt.ack.attempt) || !isRecord(receipt.ack.snapshotEnvelope)) return false;
  const request = receipt.request;
  const ack = receipt.ack;
  const snapshot = ack.snapshotEnvelope;
  return validClaimRequest(request) && nonEmpty(receipt.handoffId) && nonEmpty(receipt.trustedOrigin)
    && receipt.canonicalPayload === canonicalClaimRequest(receipt.handoffId, request, receipt.trustedOrigin)
    && nonEmpty(ack.claimId) && ack.claimRequestId === request.claimRequestId && ack.handoffId === receipt.handoffId
    && ack.targetOrigin === receipt.trustedOrigin && ack.commandId === request.commandId && ack.attemptId === request.attemptId
    && ack.snapshotVersion === request.snapshotVersion && ack.handoffEpoch === request.handoffEpoch
    && ack.actorLeaseId === request.actorLeaseId && ack.leaseState === "TRANSFERRING"
    && Number.isFinite(ack.claimedAt) && ack.claimedAt >= 0 && receipt.grantExpiresAt > ack.claimedAt
    && ack.command.schemaVersion === "1.0" && ack.command.commandId === ack.commandId
    && ack.command.commandVersion === receipt.commandVersion && ["ACTIVATE", "CHANGE_TARGET"].includes(ack.command.type)
    && ack.command.resolvedTarget?.origin === ack.targetOrigin
    && ack.attempt.attemptId === ack.attemptId && nonEmpty(ack.attempt.claimedSessionId) && nonEmpty(ack.attempt.executionSessionId)
    && Number.isInteger(ack.attempt.eventSeq) && ack.attempt.eventSeq > 0 && ["received", "session_boundary"].includes(ack.attempt.status)
    && snapshot.schemaVersion === "1.0" && nonEmpty(snapshot.snapshotId)
    && snapshot.accountSubjectRef === ack.accountSubjectRef && snapshot.snapshotVersion === ack.snapshotVersion
    && snapshot.generatedAt === ack.claimedAt
    && canonicalJson(snapshot.handoffBinding) === canonicalJson({ handoffId: ack.handoffId, commandId: ack.commandId, attemptId: ack.attemptId })
    && canonicalJson(snapshot.authorityFence) === canonicalJson({ accountSubjectRef: ack.accountSubjectRef, handoffEpoch: ack.handoffEpoch, actorLeaseId: ack.actorLeaseId })
    && canonicalJson(snapshot.mergePolicy) === canonicalJson({ mode: "apply_once_if_fence_current", idempotencyKey: ack.claimId })
    && canonicalJson(snapshot.payload) === canonicalJson({ schemaVersion: "prototype-1.0", kind: "account_snapshot", records: [] });
}

function claimReceiptMatchesGrant(receipt: HandoffClaimReceipt, grant: HandoffGrant): boolean {
  const request = receipt.request;
  const ack = receipt.ack;
  return claimReceiptInternallyValid(receipt)
    && receipt.trustedOrigin === grant.targetOrigin && receipt.grantExpiresAt === grant.expiresAt
    && receipt.handoffId === grant.handoffId
    && request.handoffToken === grant.handoffToken && request.commandId === grant.commandId
    && request.attemptId === grant.attemptId && request.snapshotVersion === grant.snapshotVersion
    && request.handoffEpoch === grant.handoffEpoch && request.actorLeaseId === grant.actorLeaseId
    && claimAckMatchesGrant(ack, grant) && ack.command.commandId === grant.commandId
    && ack.command.type === grant.operation && ack.command.resolvedTarget?.origin === grant.targetOrigin
    && ack.attempt.attemptId === grant.attemptId;
}

function claimReceiptIsCurrent(authority: AccountAuthorityProjection, receipt: HandoffClaimReceipt): boolean {
  const ack = receipt.ack;
  if (!claimReceiptInternallyValid(receipt) || receipt.commandVersion <= (authority.revokeFloor ?? 0)) return false;
  const pending = authority.pendingCandidates.find((candidate) =>
    candidate.commandVersion === receipt.commandVersion && claimReceiptMatchesGrant(receipt, candidate));
  if (pending) return authority.pendingCandidates.length === 1
    && authority.handoffEpoch === ack.handoffEpoch
    && receipt.commandVersion >= (authority.issuedCommandVersion ?? 0);
  const actor = authority.activeActor;
  return !!actor && actor.claimId === ack.claimId && actor.commandVersion === receipt.commandVersion
    && actor.deviceId === ack.command.deviceId && actor.commandId === ack.commandId && actor.attemptId === ack.attemptId
    && actor.accountSubjectRef === ack.accountSubjectRef && actor.handoffId === ack.handoffId
    && actor.snapshotVersion === ack.snapshotVersion && actor.handoffEpoch === ack.handoffEpoch
    && actor.actorLeaseId === ack.actorLeaseId;
}

/** 从不可变 claim receipt 恢复 Janus 原先签发的七字段 capability；claimRequestId 同样不可重造。 */
export function recoverAccountAuthorityClaim(
  authority: AccountAuthorityProjection,
  grant: HandoffGrant,
): Pick<HandoffClaimReceipt, "request" | "ack" | "trustedOrigin"> | undefined {
  const receipt = (authority.claimReceipts ?? []).find((item) =>
    item.handoffId === grant.handoffId && claimReceiptMatchesGrant(item, grant));
  if (!receipt || !claimReceiptIsCurrent(authority, receipt)) return undefined;
  return {
    request: structuredClone(receipt.request),
    ack: structuredClone(receipt.ack),
    trustedOrigin: receipt.trustedOrigin,
  };
}

/** hydrate 只能保留由完整 grant→claim→active actor 证据链证明的 actor。 */
export function accountAuthorityActorHasCanonicalClaimChain(
  authority: AccountAuthorityProjection,
  actor: NonNullable<AccountAuthorityProjection["activeActor"]>,
): boolean {
  const grantReceipt = (authority.requestReceipts ?? []).find((receipt) =>
    receipt.commandId === actor.commandId && receipt.attemptId === actor.attemptId);
  const claimReceipt = (authority.claimReceipts ?? []).find((receipt) => receipt.ack.claimId === actor.claimId);
  if (!grantReceiptInternallyValid(authority, grantReceipt) || !claimReceipt) return false;
  const grant = grantReceipt.grant;
  if (!claimReceiptMatchesGrant(claimReceipt, grant)
    || grantReceipt.accountSubjectRef !== actor.accountSubjectRef || grantReceipt.deviceId !== actor.deviceId
    || grantReceipt.commandType !== grant.operation || grantReceipt.commandVersion !== actor.commandVersion
    || actor.commandVersion <= (authority.revokeFloor ?? 0)
    || !nonEmpty(actor.claimId) || !nonEmpty(actor.leaseAckId)
    || !Number.isFinite(actor.leaseAckAt) || actor.leaseAckAt < claimReceipt.ack.claimedAt) return false;
  return actor.accountSubjectRef === claimReceipt.ack.accountSubjectRef
    && actor.deviceId === claimReceipt.ack.command.deviceId
    && actor.commandId === claimReceipt.ack.commandId
    && actor.attemptId === claimReceipt.ack.attemptId
    && actor.commandVersion === claimReceipt.commandVersion
    && actor.handoffId === claimReceipt.ack.handoffId
    && actor.snapshotVersion === claimReceipt.ack.snapshotVersion
    && actor.handoffEpoch === claimReceipt.ack.handoffEpoch
    && actor.actorLeaseId === claimReceipt.ack.actorLeaseId
    && actor.replacedActorLeaseId === grant.replacesActorLeaseId
    && canonicalJson(claimReceipt.ack.command) === canonicalJson(grantReceipt.deliveredCommand)
    && canonicalJson(claimReceipt.ack.attempt) === canonicalJson(grantReceipt.attemptBinding);
}

function prototypeSnapshotEnvelope(grant: HandoffGrant, claimId: string, claimedAt: number): HandoffClaimAck["snapshotEnvelope"] {
  return {
    schemaVersion: "1.0",
    snapshotId: `SNAP-${claimId}`,
    accountSubjectRef: grant.accountSubjectRef,
    snapshotVersion: grant.snapshotVersion,
    handoffBinding: { handoffId: grant.handoffId, commandId: grant.commandId, attemptId: grant.attemptId },
    authorityFence: { accountSubjectRef: grant.accountSubjectRef, handoffEpoch: grant.handoffEpoch, actorLeaseId: grant.actorLeaseId },
    mergePolicy: { mode: "apply_once_if_fence_current", idempotencyKey: claimId },
    generatedAt: claimedAt,
    payload: { schemaVersion: "prototype-1.0", kind: "account_snapshot", records: [] },
  };
}

/** 远程 H5 以短 token + 可信 Origin 领取 snapshot；body 自报 Origin 永不参与判断。 */
export function claimAccountAuthorityHandoff(
  authority: AccountAuthorityProjection,
  handoffId: string,
  request: HandoffClaimRequest,
  trustedOrigin: string,
  at: number,
): AuthorityClaimResult {
  if (!nonEmpty(handoffId) || !validClaimRequest(request) || !nonEmpty(trustedOrigin) || !Number.isFinite(at) || at < 0) {
    return { ok: false, authority, reason: "invalid_request" };
  }
  const canonicalPayload = canonicalClaimRequest(handoffId, request, trustedOrigin);
  const prior = (authority.claimReceipts ?? []).find((receipt) => receipt.handoffId === handoffId);
  if (prior) {
    if (prior.canonicalPayload !== canonicalPayload) return { ok: false, authority, reason: "request_conflict" };
    if (!claimReceiptIsCurrent(authority, prior)) return { ok: false, authority, reason: "not_current" };
    return { ok: true, authority, ack: structuredClone(prior.ack) };
  }
  if ((authority.claimReceipts ?? []).some((receipt) => receipt.request.claimRequestId === request.claimRequestId)) {
    return { ok: false, authority, reason: "claim_request_id_reused" };
  }
  const candidate = authority.pendingCandidates.find((item) => item.handoffId === handoffId);
  if (!candidate) return { ok: false, authority, reason: "handoff_not_found" };
  if (trustedOrigin !== candidate.targetOrigin) return { ok: false, authority, reason: "origin_mismatch" };
  if (request.handoffToken !== candidate.handoffToken) return { ok: false, authority, reason: "token_mismatch" };
  if (request.commandId !== candidate.commandId || request.attemptId !== candidate.attemptId
    || request.snapshotVersion !== candidate.snapshotVersion || request.handoffEpoch !== candidate.handoffEpoch
    || request.actorLeaseId !== candidate.actorLeaseId) return { ok: false, authority, reason: "fence_mismatch" };
  if (authority.pendingCandidates.length !== 1 || candidate.handoffEpoch !== authority.handoffEpoch
    || candidate.commandVersion <= (authority.revokeFloor ?? 0) || candidate.commandVersion < (authority.issuedCommandVersion ?? 0)) {
    return { ok: false, authority, reason: "not_current" };
  }
  if (candidate.expiresAt <= at) return { ok: false, authority, reason: "expired" };
  const grantReceipt = (authority.requestReceipts ?? []).find((receipt) =>
    grantReceiptInternallyValid(authority, receipt) && grantMatchesCandidate(receipt.grant, candidate));
  const command = grantReceipt?.deliveredCommand;
  const attempt = grantReceipt?.attemptBinding;
  if (!command || !attempt || command.schemaVersion !== "1.0" || command.commandId !== candidate.commandId
    || command.commandVersion !== candidate.commandVersion || command.deviceId !== candidate.deviceId || command.type !== candidate.operation
    || command.resolvedTarget?.origin !== candidate.targetOrigin || attempt.attemptId !== candidate.attemptId) {
    return { ok: false, authority, reason: "recovery_binding_missing" };
  }
  const claimId = `HC-${candidate.handoffId}-${request.claimRequestId}`;
  const ack: HandoffClaimAck = {
    claimId,
    claimRequestId: request.claimRequestId,
    handoffId: candidate.handoffId,
    accountSubjectRef: candidate.accountSubjectRef,
    commandId: candidate.commandId,
    attemptId: candidate.attemptId,
    snapshotVersion: candidate.snapshotVersion,
    handoffEpoch: candidate.handoffEpoch,
    actorLeaseId: candidate.actorLeaseId,
    targetOrigin: candidate.targetOrigin,
    leaseState: "TRANSFERRING",
    claimedAt: at,
    command,
    attempt,
    snapshotEnvelope: prototypeSnapshotEnvelope(candidate, claimId, at),
  };
  const receipt: HandoffClaimReceipt = {
    handoffId, request: { ...request }, trustedOrigin, canonicalPayload, commandVersion: candidate.commandVersion,
    grantExpiresAt: candidate.expiresAt, ack: structuredClone(ack),
  };
  return {
    ok: true,
    ack: structuredClone(ack),
    authority: {
      ...authority,
      claimReceipts: [...(authority.claimReceipts ?? []), receipt],
      updatedAt: Math.max(authority.updatedAt, at),
    },
  };
}

export function abortAccountAuthorityCandidate(
  authority: AccountAuthorityProjection,
  ack: PendingHandoffAbortAck,
): AccountAuthorityProjection | undefined {
  const candidate = authority.pendingCandidates.find((item) => item.actorLeaseId === ack.cancelledCandidateActorLeaseId);
  const expectedLeaseState = authority.activeActor ? "REMOTE_ACTIVE" : "WHITE_ACTIVE";
  if (!candidate
    || ack.accountSubjectRef !== authority.accountSubjectRef
    || candidate.commandId !== ack.commandId
    || candidate.attemptId !== ack.attemptId
    || candidate.handoffId !== ack.handoffId
    || candidate.handoffEpoch !== ack.handoffEpoch
    || ack.survivingAppliedActorLeaseId !== authority.activeActor?.actorLeaseId
    || ack.leaseState !== expectedLeaseState
    || authority.pendingCandidates.some((item) => item.actorLeaseId !== candidate.actorLeaseId)) return undefined;
  const pendingCandidates = authority.pendingCandidates.filter((item) => item.actorLeaseId !== candidate.actorLeaseId);
  return {
    ...authority,
    leaseState: expectedLeaseState,
    pendingCandidates,
    updatedAt: Math.max(authority.updatedAt, ack.abortAckAt),
  };
}

export function activateAccountAuthorityCandidate(
  authority: AccountAuthorityProjection,
  grant: HandoffGrant,
  deviceId: string,
  claimId: string,
  leaseAckId: string,
  leaseAckAt: number,
): AccountAuthorityProjection | undefined {
  const candidate = authority.pendingCandidates.find((item) => item.actorLeaseId === grant.actorLeaseId && item.commandId === grant.commandId && item.attemptId === grant.attemptId);
  const claimReceipt = (authority.claimReceipts ?? []).find((receipt) => receipt.ack.claimId === claimId);
  if (!nonEmpty(claimId) || !nonEmpty(leaseAckId) || !Number.isFinite(leaseAckAt) || leaseAckAt < 0
    || !claimReceipt || !claimReceiptMatchesGrant(claimReceipt, grant)) return undefined;
  const active = authority.activeActor;
  if (!candidate && active
    && authority.leaseState === "REMOTE_ACTIVE" && authority.pendingCandidates.length === 0
    && active.deviceId === deviceId && active.commandId === grant.commandId && active.attemptId === grant.attemptId
    && active.commandVersion === claimReceipt.commandVersion && active.accountSubjectRef === grant.accountSubjectRef
    && active.handoffId === grant.handoffId && active.snapshotVersion === grant.snapshotVersion
    && active.handoffEpoch === grant.handoffEpoch && active.actorLeaseId === grant.actorLeaseId
    && active.replacedActorLeaseId === grant.replacesActorLeaseId && active.claimId === claimId
    && active.leaseAckId === leaseAckId && active.leaseAckAt <= leaseAckAt
    && claimReceiptIsCurrent(authority, claimReceipt)) return authority;
  if (!candidate || !grantMatchesCandidate(grant, candidate)
    || claimReceipt.ack.claimId !== claimId || claimReceipt.ack.claimedAt > leaseAckAt
    || claimReceipt.commandVersion !== candidate.commandVersion || claimReceipt.grantExpiresAt !== candidate.expiresAt
    || claimReceipt.ack.claimedAt >= candidate.expiresAt
    || candidate.accountSubjectRef !== authority.accountSubjectRef
    || candidate.deviceId !== deviceId
    || candidate.handoffEpoch !== authority.handoffEpoch
    || candidate.commandVersion <= (authority.revokeFloor ?? 0)
    || candidate.commandVersion < (authority.issuedCommandVersion ?? 0)
    || authority.claimReceipts.filter((receipt) => receipt.handoffId === grant.handoffId).length !== 1) return undefined;
  if (grant.operation === "ACTIVATE" && authority.activeActor) return undefined;
  if (candidate.operation === "CHANGE_TARGET" && (
    authority.activeActor?.accountSubjectRef !== candidate.accountSubjectRef
    || authority.activeActor.deviceId !== candidate.deviceId
    || authority.activeActor.actorLeaseId !== candidate.replacesActorLeaseId
  )) return undefined;
  const pendingCandidates = authority.pendingCandidates.filter((item) => item.actorLeaseId !== candidate.actorLeaseId);
  return {
    ...authority,
    handoffEpoch: candidate.handoffEpoch,
    leaseState: pendingCandidates.length ? "TRANSFERRING" : "REMOTE_ACTIVE",
    activeActor: {
      accountSubjectRef: candidate.accountSubjectRef,
      handoffId: candidate.handoffId,
      snapshotVersion: candidate.snapshotVersion,
      handoffEpoch: candidate.handoffEpoch,
      actorLeaseId: candidate.actorLeaseId,
      claimId,
      leaseAckId,
      leaseAckAt,
      deviceId: candidate.deviceId,
      commandId: candidate.commandId,
      attemptId: candidate.attemptId,
      commandVersion: candidate.commandVersion,
      replacedActorLeaseId: candidate.replacesActorLeaseId,
    },
    pendingCandidates,
    updatedAt: leaseAckAt,
  };
}

export type AuthorityRevokeResult =
  | { ok: true; authority: AccountAuthorityProjection; ack: RevokeAuthorityAck }
  | { ok: false; authority: AccountAuthorityProjection; reason: AccountAuthorityRequestRejectionReason };

function revokeReceiptInternallyValid(
  authority: AccountAuthorityProjection,
  command: LedgerTakeoverCommand,
  attemptId: string,
  canonicalPayload: string,
  receipt: AccountAuthorityRevokeReceipt | undefined,
  request: AccountAuthorityRequestReceipt | undefined,
): receipt is AccountAuthorityRevokeReceipt {
  if (!receipt || !request || request.outcome !== "revoke_acknowledged" || !request.revokeAck) return false;
  const ack = receipt.ack;
  const commonValid = receipt.commandId === command.commandId && receipt.attemptId === attemptId
    && receipt.deviceId === command.deviceId && receipt.commandVersion === command.commandVersion
    && positiveSafeInteger(command.commandVersion) && nonNegativeSafeInteger(command.expectedCommandVersion)
    && receipt.requestFingerprint === canonicalPayload
    && request.receiptId === `AREQ-${command.commandId}-${attemptId}`
    && request.commandId === command.commandId && request.attemptId === attemptId
    && request.commandVersion === command.commandVersion && request.commandType === "REVOKE"
    && request.accountSubjectRef === authority.accountSubjectRef && request.deviceId === command.deviceId
    && request.canonicalPayload === canonicalPayload && canonicalJson(request.revokeAck) === canonicalJson(ack)
    && ack.commandId === command.commandId && ack.attemptId === attemptId
    && ack.accountSubjectRef === authority.accountSubjectRef && ack.leaseState === "WHITE_ACTIVE"
    && Number.isSafeInteger(ack.handoffEpoch) && ack.handoffEpoch >= 0;
  if (!commonValid) return false;
  return ack.kind === "lease_cancelled"
    ? nonEmpty(ack.cancelAckId) && Number.isFinite(ack.cancelAckAt) && ack.cancelAckAt >= 0
      && Array.isArray(ack.cancelledCandidateActorLeaseIds)
    : nonEmpty(ack.alreadyWhiteAckId) && Number.isFinite(ack.verifiedAt) && ack.verifiedAt >= 0;
}

function rejectedRevoke(
  authority: AccountAuthorityProjection,
  command: LedgerTakeoverCommand,
  attemptId: string,
  canonicalPayload: string,
  at: number,
  reason: AccountAuthorityRequestRejectionReason,
): AuthorityRevokeResult {
  const receipt: AccountAuthorityRequestReceipt = { ...receiptBase(authority, command, attemptId, canonicalPayload, at), outcome: "rejected", rejectionReason: reason };
  return { ok: false, authority: appendRequestReceipt(authority, receipt, at), reason };
}

export function revokeAccountAuthority(
  authority: AccountAuthorityProjection,
  command: LedgerTakeoverCommand,
  attemptId: string,
  at: number,
): AuthorityRevokeResult {
  const canonicalPayload = canonicalAuthorityRequest(authority, command, attemptId, "revoke", command.deviceId);
  const canonicalRevokeReceipt = revokeReceipt(authority, command.commandId, attemptId);
  if (canonicalRevokeReceipt) {
    if (canonicalRevokeReceipt.requestFingerprint !== canonicalPayload) return { ok: false, authority, reason: "request_conflict" };
    if (!revokeReceiptInternallyValid(authority, command, attemptId, canonicalPayload, canonicalRevokeReceipt,
      requestReceipt(authority, command.commandId, attemptId))) return { ok: false, authority, reason: "request_conflict" };
    return { ok: true, authority, ack: structuredClone(canonicalRevokeReceipt.ack) };
  }
  const replay = requestReceipt(authority, command.commandId, attemptId);
  if (replay) {
    if (replay.canonicalPayload !== canonicalPayload) return { ok: false, authority, reason: "request_conflict" };
    if (replay.outcome === "revoke_acknowledged" && replay.revokeAck
      && revokeReceiptInternallyValid(authority, command, attemptId, canonicalPayload,
        revokeReceipt(authority, command.commandId, attemptId), replay)) return { ok: true, authority, ack: structuredClone(replay.revokeAck) };
    return { ok: false, authority, reason: replay.rejectionReason ?? "request_conflict" };
  }
  if (!positiveSafeInteger(command.commandVersion) || !nonNegativeSafeInteger(command.expectedCommandVersion)) {
    return rejectedRevoke(authority, command, attemptId, canonicalPayload, at, "request_conflict");
  }
  if (command.type !== "REVOKE") return rejectedRevoke(authority, command, attemptId, canonicalPayload, at, "wrong_command_type");
  if (authority.quarantineReason) return rejectedRevoke(authority, command, attemptId, canonicalPayload, at, "authority_quarantined");
  if (command.effectiveTiming !== "immediate") return rejectedRevoke(authority, command, attemptId, canonicalPayload, at, "invalid_effective_timing");
  if (command.commandVersion <= (authority.maxCommandVersion ?? 0)
    || command.commandVersion <= (authority.revokeFloor ?? 0)
    || command.commandVersion < (authority.issuedCommandVersion ?? 0)) {
    return rejectedRevoke(authority, command, attemptId, canonicalPayload, at, "stale_command");
  }
  const revokeReceipts = authority.revokeReceipts ?? [];
  if (!authority.activeActor && authority.pendingCandidates.length === 0) {
    const ack: RevokeAuthorityAck = {
      kind: "already_white",
      alreadyWhiteAckId: `WACK-${command.commandId}`,
      commandId: command.commandId,
      attemptId,
      accountSubjectRef: authority.accountSubjectRef,
      handoffEpoch: authority.handoffEpoch,
      leaseState: "WHITE_ACTIVE",
      verifiedAt: at,
    };
    const receipt: AccountAuthorityRequestReceipt = { ...receiptBase(authority, command, attemptId, canonicalPayload, at), outcome: "revoke_acknowledged", revokeAck: structuredClone(ack) };
    const canonicalReceipt: AccountAuthorityRevokeReceipt = {
      commandId: command.commandId,
      attemptId,
      deviceId: command.deviceId,
      commandVersion: command.commandVersion,
      requestFingerprint: canonicalPayload,
      ack: structuredClone(ack),
    };
    return {
      ok: true,
      authority: {
        ...authority,
        maxCommandVersion: command.commandVersion,
        issuedCommandVersion: Math.max(authority.issuedCommandVersion ?? 0, command.commandVersion),
        revokeFloor: Math.max(authority.revokeFloor ?? 0, command.commandVersion),
        leaseState: "WHITE_ACTIVE",
        requestReceipts: [...(authority.requestReceipts ?? []), receipt],
        revokeReceipts: [...revokeReceipts, canonicalReceipt],
        updatedAt: at,
      },
      ack: structuredClone(ack),
    };
  }
  const handoffEpoch = authority.handoffEpoch + 1;
  const ack: HandoffCancelAck = {
    kind: "lease_cancelled",
    cancelAckId: `CACK-${command.commandId}`,
    commandId: command.commandId,
    attemptId,
    accountSubjectRef: authority.accountSubjectRef,
    cancelledAppliedActorLeaseId: authority.activeActor?.actorLeaseId,
    cancelledCandidateActorLeaseIds: authority.pendingCandidates.map((candidate) => candidate.actorLeaseId),
    handoffEpoch,
    leaseState: "WHITE_ACTIVE",
    cancelAckAt: at,
  };
  const receipt: AccountAuthorityRequestReceipt = { ...receiptBase(authority, command, attemptId, canonicalPayload, at), outcome: "revoke_acknowledged", revokeAck: structuredClone(ack) };
  const canonicalReceipt: AccountAuthorityRevokeReceipt = {
    commandId: command.commandId,
    attemptId,
    deviceId: command.deviceId,
    commandVersion: command.commandVersion,
    requestFingerprint: canonicalPayload,
    ack: structuredClone(ack),
  };
  return {
    ok: true,
    ack: structuredClone(ack),
    authority: {
      ...authority,
      handoffEpoch,
      maxCommandVersion: command.commandVersion,
      issuedCommandVersion: Math.max(authority.issuedCommandVersion ?? 0, command.commandVersion),
      revokeFloor: Math.max(authority.revokeFloor ?? 0, command.commandVersion),
      leaseState: "WHITE_ACTIVE",
      activeActor: undefined,
      pendingCandidates: [],
      requestReceipts: [...(authority.requestReceipts ?? []), receipt],
      revokeReceipts: [...revokeReceipts, canonicalReceipt],
      updatedAt: at,
    },
  };
}
