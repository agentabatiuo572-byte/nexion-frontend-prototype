/**
 * Janus C2 控制台(K6)— 策略规则评估器(PRD §6.2 / §13.5 判定轨迹)。
 * 纯函数,backend-replaceable(真后台同款逻辑搬服务端)。
 * 产出 DecisionSnapshot:逐叶规则通过/未通过 + 最终动作 + 冲突策略。
 * 判定轨迹(SPEC 1 设备详情)与干跑(SPEC 4)共用此评估器。
 */
import { NOW_MS } from "./scoring.ts";
import { STATUS_LABEL, channelLabel } from "./labels.ts";
import { compareStrategyOrder } from "./contract-reducers.ts";
export { compareStrategyOrder } from "./contract-reducers.ts";
import {
  isRuleGroup,
  type DecisionRuleResult,
  type DecisionSnapshot,
  type Device,
  type DeviceStatus,
  type LedgerTakeoverCommand,
  type PolicyBundle,
  type Rule,
  type RuleGroup,
  type Strategy,
} from "./types.ts";

/** 规则 field → 设备实际值(扁平化 maturity / environment 嵌套)。 */
function resolveField(d: Device, field: string): unknown {
  switch (field) {
    case "environmentRiskScore": return d.environmentRiskScore;
    case "activated": return d.activated;
    case "installDays": return d.installDays;
    case "status": return d.status;
    case "inviteCode": return d.inviteCode;
    case "channel": return d.channel;
    case "maturityScore": return d.maturityScore;
    case "recommendationScore": return d.recommendationScore;
    case "appOpenCount": return d.maturity.appOpenCount;
    case "sessionCount": return d.maturity.sessionCount;
    case "repeatStreakDays": return d.maturity.repeatStreakDays;
    case "foregroundDurationSeconds": return d.maturity.foregroundDurationSeconds;
    case "benchmarkViewed": return d.maturity.benchmarkViewed;
    case "optimizeDone": return d.maturity.optimizeDone;
    case "marketViewed": return d.maturity.marketViewed;
    case "walletViewed": return d.maturity.walletViewed;
    case "isHeadless": return d.environment.isHeadless;
    case "automationSignalCount": return d.environment.automationSignalCount;
    case "fpBlocklistHit": return d.environment.fpBlocklistHit;
    case "screenAnomaly": return d.environment.screenAnomaly;
    case "timezoneMismatch": return d.environment.timezoneMismatch;
    case "languageMismatch": return d.environment.languageMismatch;
    case "cohortId": return d.cohortId;
    // 新增 field 必须在此注册,否则规则恒取 undefined → 静默不通过。
    default: return undefined;
  }
}

function applyOp(actual: unknown, op: Rule["op"], value: unknown): boolean {
  const a = actual;
  const n = (x: unknown): number => Number(x);
  switch (op) {
    case "=": return a === value;
    case "!=": return a !== value;
    case ">": return n(a) > n(value);
    case ">=": return n(a) >= n(value);
    case "<": return n(a) < n(value);
    case "<=": return n(a) <= n(value);
    case "in": return Array.isArray(value) && (value as unknown[]).includes(a);
    case "notIn": return Array.isArray(value) && !(value as unknown[]).includes(a);
    case "between": return Array.isArray(value) && n(a) >= n((value as unknown[])[0]) && n(a) <= n((value as unknown[])[1]);
    case "contains": return String(a).includes(String(value));
    default: return false;
  }
}

/** 实际值的运营可读说明(判定轨迹「说明」列),按 field 补单位避免运营心算。 */
function describe(field: string, actual: unknown): string {
  if (typeof actual === "boolean") return `当前 ${actual ? "是" : "否"}`;
  if (actual === undefined || actual === null) return "当前无此项";
  const n = Number(actual);
  switch (field) {
    case "status": return `当前 ${STATUS_LABEL[actual as DeviceStatus] ?? String(actual)}`;
    case "channel": return `当前 ${channelLabel(String(actual))}`;
    case "inviteCode": return `当前 ${String(actual)}`;
    case "cohortId": return `当前 ${String(actual)}`;
    case "foregroundDurationSeconds": return `当前 ${Math.round(n / 60)} 分钟`;
    case "installDays":
    case "repeatStreakDays": return `当前 ${n} 天`;
    case "appOpenCount":
    case "sessionCount": return `当前 ${n} 次`;
    case "automationSignalCount": return `当前 ${n} 个`;
    default: return `当前 ${String(actual)}`;
  }
}

const ok = (label: string, detail: string): DecisionRuleResult => ({ label, detail, passed: true });
const blocked = (label: string, detail: string): DecisionRuleResult => ({ label, detail, passed: false });

function bucketFor(strategyId: string, deviceId: string): number {
  const key = `${strategyId}:${deviceId}`;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 100;
}

function lastDecisionAt(d: Device): number | undefined {
  return d.latestDecision?.decidedAt ?? d.latestSession?.lastDecision?.decidedAt ?? d.manualOverride?.createdAt;
}

function strategyApplicability(strategy: Strategy, d: Device): { passed: boolean; leaves: DecisionRuleResult[] } {
  const leaves: DecisionRuleResult[] = [];
  const channels = strategy.scope.channels?.filter(Boolean) ?? [];
  if (channels.length) {
    const pass = !!d.channel && channels.includes(d.channel);
    leaves.push((pass ? ok : blocked)(`适用渠道:${channels.map(channelLabel).join(" / ")}`, `当前 ${channelLabel(d.channel)}`));
  }

  const inviteCodes = strategy.scope.inviteCodes?.map((x) => x.trim()).filter(Boolean) ?? [];
  if (inviteCodes.length) {
    const pass = !!d.inviteCode && inviteCodes.includes(d.inviteCode);
    leaves.push((pass ? ok : blocked)(`定向邀请码:${inviteCodes.join(" / ")}`, d.inviteCode ? `当前 ${d.inviteCode}` : "当前无邀请码"));
  }

  const scopeCohorts = strategy.scope.cohortIds?.map((x) => x.trim()).filter(Boolean) ?? [];
  if (scopeCohorts.length) {
    const pass = !!d.cohortId && scopeCohorts.includes(d.cohortId);
    leaves.push((pass ? ok : blocked)(`适用分组:${scopeCohorts.join(" / ")}`, d.cohortId ? `当前 ${d.cohortId}` : "当前无分组"));
  }

  const rollout = strategy.rollout;
  if (rollout) {
    const percent = Math.max(0, Math.min(100, rollout.percent));
    const bucket = bucketFor(strategy.strategyId, d.deviceId);
    leaves.push((bucket < percent ? ok : blocked)(`灰度比例:${percent}%`, `当前分桶 ${bucket + 1}`));
    if (rollout.startedAt && rollout.startedAt > NOW_MS) leaves.push(blocked("灰度开始时间", "尚未开始"));
    if (rollout.endsAt && rollout.endsAt < NOW_MS) leaves.push(blocked("灰度结束时间", "已结束"));
    const rolloutCohorts = rollout.cohortIds?.map((x) => x.trim()).filter(Boolean) ?? [];
    if (rolloutCohorts.length) {
      const pass = !!d.cohortId && rolloutCohorts.includes(d.cohortId);
      leaves.push((pass ? ok : blocked)(`灰度分组:${rolloutCohorts.join(" / ")}`, d.cohortId ? `当前 ${d.cohortId}` : "当前无分组"));
    }
  }

  const freshMinutes = strategy.safeguards.requireFreshReportMinutes;
  if (freshMinutes != null) {
    const elapsed = Math.max(0, Math.round((NOW_MS - d.lastSeenAt) / 60_000));
    const pass = elapsed <= freshMinutes;
    leaves.push((pass ? ok : blocked)(`最近上报不超过 ${freshMinutes} 分钟`, `当前 ${elapsed} 分钟前`));
  }

  const minHours = strategy.safeguards.minDecisionIntervalHours;
  if (minHours != null) {
    const lastAt = lastDecisionAt(d);
    const elapsedHours = lastAt ? (NOW_MS - lastAt) / 3_600_000 : undefined;
    const pass = elapsedHours === undefined || elapsedHours >= minHours;
    const detail = elapsedHours === undefined ? "当前无近期判定" : `当前间隔 ${Math.round(elapsedHours * 10) / 10} 小时`;
    leaves.push((pass ? ok : blocked)(`最小决策间隔 ${minHours} 小时`, detail));
  }

  return { passed: leaves.every((r) => r.passed), leaves };
}

function evalLeaf(d: Device, rule: Rule): DecisionRuleResult {
  const actual = resolveField(d, rule.field);
  return { label: rule.label, passed: applyOp(actual, rule.op, rule.value), detail: describe(rule.field, actual) };
}

/** 递归评估规则组,返回是否通过 + 扁平叶规则结果(供轨迹展示)。 */
function evalGroup(d: Device, group: RuleGroup): { passed: boolean; leaves: DecisionRuleResult[] } {
  const leaves: DecisionRuleResult[] = [];
  const childPassed: boolean[] = group.rules.map((node) => {
    if (isRuleGroup(node)) {
      const sub = evalGroup(d, node);
      leaves.push(...sub.leaves);
      return sub.passed;
    }
    const r = evalLeaf(d, node);
    leaves.push(r);
    return r.passed;
  });

  let passed: boolean;
  switch (group.mode) {
    case "ALL": passed = childPassed.every(Boolean); break;
    case "ANY": passed = childPassed.some(Boolean); break;
    case "NOT": passed = !childPassed.some(Boolean); break;
    case "N_OF_M": passed = childPassed.filter(Boolean).length >= (group.required ?? childPassed.length); break;
    case "WEIGHTED_SCORE": {
      const total = group.rules.reduce((sum, node, i) => {
        if (isRuleGroup(node)) return sum;
        return sum + (childPassed[i] ? (node.weight ?? 0) : 0);
      }, 0);
      passed = total >= (group.threshold ?? 0);
      break;
    }
    default: passed = false;
  }
  return { passed, leaves };
}

/** 单策略对单设备的判定快照(PRD §13.5)。 */
export function evaluateStrategy(strategy: Strategy, d: Device, policyBundleVersion = 0): DecisionSnapshot {
  const applicability = strategyApplicability(strategy, d);
  const { passed, leaves } = evalGroup(d, strategy.ruleTree);
  const finalPassed = applicability.passed && passed;
  const blockedReason = applicability.leaves.filter((r) => !r.passed).map((r) => `${r.label}(${r.detail})`).join("; ") || undefined;
  const failedRules = [...applicability.leaves, ...leaves].filter((result) => !result.passed).map((result) => result.label).join("、");
  const reason = finalPassed ? "适用范围与规则均命中" : blockedReason ?? (failedRules ? `未通过：${failedRules}` : "规则未命中");
  return {
    decisionId: `DEC-${policyBundleVersion}-${strategy.strategyId}-${strategy.version}-${d.deviceId}-${d.latestSessionId}-${d.signalRevision}`,
    deviceId: d.deviceId,
    sessionId: d.latestSessionId,
    policyBundleVersion,
    signalRevision: d.signalRevision,
    strategyId: strategy.strategyId,
    strategyName: strategy.name,
    strategyVersion: strategy.version,
    decidedAt: NOW_MS,
    action: finalPassed ? strategy.action.type : "BENIGN",
    matched: finalPassed,
    strategyVersions: [{ strategyId: strategy.strategyId, contentVersion: strategy.version }],
    candidates: [{ strategyId: strategy.strategyId, strategyName: strategy.name, contentVersion: strategy.version, matched: finalPassed, action: strategy.action.type, reason, rank: 1, winner: true }],
    ruleResults: [...applicability.leaves, ...leaves],
    blockedReason,
  };
}

/** 在线判定只读取 C2 已应用的不可变版本;最新发布仍 PENDING 时继续使用旧 applied 版本。 */
function bundledStrategy(strategy: Strategy, contentVersion: number): Strategy | undefined {
  const v = strategy.versions.find((x) => x.version === contentVersion);
  if (!v) return undefined;
  return {
    ...strategy,
    name: v.name ?? strategy.name,
    description: v.description ?? strategy.description,
    owner: v.owner ?? strategy.owner,
    priority: v.priority ?? strategy.priority,
    scope: v.scope ?? strategy.scope,
    ruleTree: v.ruleTree,
    action: v.action,
    safeguards: v.safeguards ?? strategy.safeguards,
    rollout: v.rollout,
    healthConfig: v.healthConfig ? { ...v.healthConfig } : undefined,
    version: contentVersion,
  };
}

/**
 * 设备当前判定轨迹(PRD §6.6 冲突优先)。
 * primary = 实际命中(通过)的最高优先级策略(决定设备状态的那条);
 * 若都没通过,取优先级最高的生效策略展示(全未通过 → 保持白壳);
 * 命中策略名匹配时优先选它;其余通过策略列为冲突。
 * 冲突先按不可绕过的安全动作序,同一安全层级才比较数值 priority。
 */
export function decisionTrace(device: Device, strategies: Strategy[], bundle?: PolicyBundle): DecisionSnapshot | undefined {
  if (!bundle || bundle.applyStatus !== "APPLIED") return undefined;
  const active = bundle.entries.map((entry) => {
    const strategy = strategies.find((s) => s.strategyId === entry.strategyId);
    return strategy ? bundledStrategy(strategy, entry.contentVersion) : undefined;
  }).filter((s): s is Strategy => !!s);
  if (!active.length) return undefined;
  const evaluated = active.map((s) => ({ strategy: s, snap: evaluateStrategy(s, device, bundle.bundleVersion) }));
  const ordered = [...evaluated].sort((a, b) => Number(b.snap.matched) - Number(a.snap.matched) || compareStrategyOrder(a.strategy, b.strategy));
  const passing = ordered.filter((x) => x.snap.matched);
  const primary = ordered[0];
  const snap = primary.snap;
  const conflicts = passing.filter((x) => x.strategy.strategyId !== primary.strategy.strategyId).map((x) => `${x.strategy.name} v${x.strategy.version}`);
  const strategyVersions = ordered.map((x) => ({ strategyId: x.strategy.strategyId, contentVersion: x.strategy.version }));
  const candidates = ordered.map((item, index) => ({
    strategyId: item.strategy.strategyId,
    strategyName: item.strategy.name,
    contentVersion: item.strategy.version,
    matched: item.snap.matched,
    action: item.strategy.action.type,
    reason: item.snap.candidates[0]?.reason ?? (item.snap.matched ? "规则命中" : "规则未命中"),
    rank: index + 1,
    winner: item.strategy.strategyId === primary.strategy.strategyId,
  }));
  const decisionId = `DEC-${bundle.bundleVersion}-${device.deviceId}-${device.latestSessionId}-${device.signalRevision}`;
  return conflicts.length ? { ...snap, decisionId, strategyVersions, candidates, conflicts } : { ...snap, decisionId, strategyVersions, candidates };
}

/** 发布干跑与发布动作共同校验的内容哈希；只覆盖会影响设备判定的字段。 */
export function strategyContentHash(strategy: Strategy): string {
  const source = JSON.stringify({
    name: strategy.name,
    priority: strategy.priority,
    scope: strategy.scope,
    ruleTree: strategy.ruleTree,
    action: strategy.action,
    safeguards: strategy.safeguards,
    rollout: strategy.rollout,
    healthConfig: strategy.healthConfig,
  });
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 自动动作只从持久 DecisionSnapshot 物化账本命令，人工/自动因果源不会混用。 */
export function commandFromDecisionSnapshot(device: Device, snapshot: DecisionSnapshot, strategy: Strategy, catalogVersion: number, at: number): LedgerTakeoverCommand | undefined {
  const existing = device.takeover.commandHistory.find((command) => command.cause.kind === "decision" && command.cause.decisionId === snapshot.decisionId);
  if (existing) return existing;
  if (!snapshot.matched || snapshot.strategyId !== strategy.strategyId || !strategy.action.remoteTargetKey || strategy.action.remoteTargetVersion == null
    || !["REVERSAL_IMMEDIATE", "REVERSAL_SESSION_EDGE"].includes(snapshot.action)) return undefined;
  const targetUnchanged = device.takeover.appliedMode === "REMOTE"
    && device.takeover.appliedRemoteTargetKey === strategy.action.remoteTargetKey
    && device.takeover.appliedRemoteTargetVersion === strategy.action.remoteTargetVersion;
  if (targetUnchanged) return undefined;
  const commandVersion = device.takeover.commandVersion + 1;
  return {
    commandId: `CMD-${snapshot.decisionId}`,
    deviceId: device.deviceId,
    commandVersion,
    policyBundleVersion: snapshot.policyBundleVersion,
    catalogVersion,
    type: device.takeover.appliedMode === "REMOTE" ? "CHANGE_TARGET" : "ACTIVATE",
    idempotencyKey: `IDEM-${snapshot.decisionId}`,
    expectedCommandVersion: device.takeover.commandVersion,
    effectiveTiming: snapshot.action === "REVERSAL_SESSION_EDGE" ? "session_edge" : "immediate",
    issuedAt: at,
    validUntil: at + 30 * 60_000,
    remoteTargetKey: strategy.action.remoteTargetKey,
    remoteTargetVersion: strategy.action.remoteTargetVersion,
    cause: { kind: "decision", decisionId: snapshot.decisionId },
  };
}

export interface DryRunResult {
  evaluated: number;
  hit: number;
  recommend: number;
  filtered: number;
  takeover: number;
  other: number;
  conflicts: number;
  hitRate: number;
}

/**
 * 干跑(PRD §14.3):对当前(有效)设备集评估策略规则树,预估命中 / 动作分布 / 冲突,不产生真实下发。
 * activeStrategies 用于统计冲突数(同设备同时命中其它生效策略)。
 */
export function dryRunStrategy(strategy: Strategy, devices: Device[], activeStrategies: Strategy[] = []): DryRunResult {
  const others = activeStrategies.filter((s) => s.status === "active" && s.strategyId !== strategy.strategyId);
  const a = strategy.action.type;
  const cap = a === "RECOMMEND"
    ? strategy.safeguards.maxDailyRecommendations
    : (a === "REVERSAL_SESSION_EDGE" || a === "REVERSAL_IMMEDIATE" ? strategy.safeguards.maxDailyHits : undefined);
  let hit = 0;
  let conflicts = 0;
  for (const d of devices) {
    const snap = evaluateStrategy(strategy, d);
    if (!snap.matched) continue;
    if (cap != null && hit >= cap) continue;
    hit += 1;
    if (others.some((s) => evaluateStrategy(s, d).matched)) conflicts += 1;
  }
  const recommend = a === "RECOMMEND" ? hit : 0;
  const filtered = a === "ENV_FILTER" ? hit : 0;
  const takeover = a === "REVERSAL_SESSION_EDGE" || a === "REVERSAL_IMMEDIATE" ? hit : 0;
  return {
    evaluated: devices.length,
    hit,
    recommend,
    filtered,
    takeover,
    other: hit - recommend - filtered - takeover,
    conflicts,
    hitRate: devices.length ? Math.round((hit / devices.length) * 100) : 0,
  };
}
