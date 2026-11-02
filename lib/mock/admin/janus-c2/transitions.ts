/**
 * Janus C2 控制台(K6)— 手动状态流转矩阵(PRD §9.3 允许 / §9.4 禁止 / §15 权限)。
 * 矩阵只列「允许」流转;未列即禁止(§9.4 列举的高危禁止由此自然覆盖 + 注释标注)。
 * 每条流转带:目标态、最低角色、是否单人强确认、是否需远程地址、是否需过期时间、是否高风险、规则说明。
 * backend-replaceable:真后台据此做服务端校验,前端只是预呈现。
 */
import type { DeviceStatus, Role, TakeoverCommandType, TakeoverExecution, TakeoverExecutionPhase } from "./types.ts";

export const ROLE_ORDER: Record<Role, number> = { viewer: 0, operator: 1, senior_operator: 2, admin: 3 };

export interface Transition {
  /** 提交唯一键；store 只接收此键并回源完整 canonical 元数据。 */
  transitionId: string;
  to: DeviceStatus;
  label?: string;
  commandType?: TakeoverCommandType;
  /** 最低执行角色。 */
  role: Role;
  /** 单人强确认(高风险动作,PRD §9.1.3 / §15)。 */
  strong?: boolean;
  /** 接管命令:必须选服务端批准目标键。 */
  needsRemoteUrl?: boolean;
  /** 挂起类:必须设过期时间(PRD §9.2 expireAt)。 */
  needsExpire?: boolean;
  /** 高风险(PRD §15 高风险动作清单)。约定:highRisk 必同时 strong。 */
  highRisk?: boolean;
  /** 不允许批量(PRD §9.3 BLOCKED→MANUAL_FORCED / §9.4 ENV_FILTERED 批量直转禁令)。 */
  noBatch?: boolean;
  /** 规则说明(运营可读,展示在弹窗操作简述)。 */
  note: string;
}

/** §9.3 允许切换矩阵。 */
export const TRANSITIONS: Record<DeviceStatus, Transition[]> = {
  NEW: [
    { transitionId: "new.observe", to: "OBSERVING", role: "operator", note: "人工确认设备进入观察。" },
    { transitionId: "new.filter", to: "ENV_FILTERED", role: "operator", note: "需选择环境过滤原因。" },
    { transitionId: "new.hold", to: "MANUAL_HOLD", role: "operator", needsExpire: true, note: "挂起须设置过期时间,到期回到策略评估。" },
    { transitionId: "new.activate", to: "MANUAL_FORCED", role: "senior_operator", commandType: "ACTIVATE", strong: true, needsRemoteUrl: true, highRisk: true, note: "绕过策略强制下发,需单人强确认并选择批准目标。" },
  ],
  OBSERVING: [
    { transitionId: "observing.recommend", to: "RECOMMENDED", role: "operator", note: "仅产生建议,不直接下发。" },
    { transitionId: "observing.filter", to: "ENV_FILTERED", role: "operator", note: "需选择过滤原因。" },
    { transitionId: "observing.activate", to: "MANUAL_FORCED", role: "senior_operator", commandType: "ACTIVATE", strong: true, needsRemoteUrl: true, highRisk: true, note: "强制下发,需单人强确认。" },
    { transitionId: "observing.block", to: "BLOCKED", role: "senior_operator", strong: true, highRisk: true, noBatch: true, note: "禁止下发,须强确认并填写禁止原因。" },
  ],
  RECOMMENDED: [
    { transitionId: "recommended.activate", to: "MANUAL_FORCED", role: "senior_operator", commandType: "ACTIVATE", needsRemoteUrl: true, note: "发起接管命令;设备 ACK、加载和账户交接成功前不算已接管。" },
    { transitionId: "recommended.filter", to: "ENV_FILTERED", role: "operator", note: "需说明为何推翻建议。" },
    { transitionId: "recommended.hold", to: "MANUAL_HOLD", role: "operator", needsExpire: true, note: "挂起等待更多数据。" },
    { transitionId: "recommended.block", to: "BLOCKED", role: "senior_operator", strong: true, highRisk: true, noBatch: true, note: "禁止下发需强确认及高风险原因。" },
  ],
  HIT: [
    { transitionId: "hit.activate", to: "MANUAL_FORCED", role: "senior_operator", commandType: "ACTIVATE", needsRemoteUrl: true, note: "发起接管命令;禁止人工直接改成接管成功。" },
    { transitionId: "hit.filter", to: "ENV_FILTERED", role: "operator", note: "尚未激活可直接改;已下发需走回退。" },
    { transitionId: "hit.hold", to: "MANUAL_HOLD", role: "operator", needsExpire: true, note: "暂停后续激活。" },
    { transitionId: "hit.cancel", to: "OBSERVING", role: "senior_operator", label: "取消命中并回到观察", note: "无设备命令的命中取消后回到观察,不伪造撤销 ACK。" },
  ],
  ACTIVATED: [
    { transitionId: "activated.revoke", to: "RESET", role: "senior_operator", commandType: "REVOKE", strong: true, highRisk: true, note: "发出撤销命令,设备确认前仍视为实际接管中。" },
    { transitionId: "activated.filter", to: "ENV_FILTERED", role: "admin", commandType: "REVOKE", strong: true, highRisk: true, note: "记录过滤意图并发出撤销命令;等待设备确认。" },
    { transitionId: "activated.block", to: "BLOCKED", role: "admin", commandType: "REVOKE", strong: true, highRisk: true, noBatch: true, note: "记录禁止意图并发出撤销命令;等待设备确认。" },
  ],
  ENV_FILTERED: [
    { transitionId: "filtered.observe", to: "OBSERVING", role: "operator", note: "复核后解除过滤。" },
    { transitionId: "filtered.recommend", to: "RECOMMENDED", role: "senior_operator", note: "只建议,不直接下发。" },
    { transitionId: "filtered.activate", to: "MANUAL_FORCED", role: "admin", commandType: "ACTIVATE", strong: true, needsRemoteUrl: true, highRisk: true, noBatch: true, note: "越过环境过滤仅管理员可强制下发,需单人强确认并记录,不允许批量。" },
    { transitionId: "filtered.block", to: "BLOCKED", role: "senior_operator", strong: true, highRisk: true, noBatch: true, note: "环境风险升级为禁止,需风控主管强确认。" },
  ],
  MANUAL_HOLD: [
    { transitionId: "hold.observe", to: "OBSERVING", role: "operator", note: "释放挂起并重新评估。" },
    { transitionId: "hold.recommend", to: "RECOMMENDED", role: "operator", note: "释放后进入建议。" },
    { transitionId: "hold.activate", to: "MANUAL_FORCED", role: "senior_operator", commandType: "ACTIVATE", strong: true, needsRemoteUrl: true, highRisk: true, note: "强制下发,需单人强确认。" },
  ],
  MANUAL_FORCED: [
    { transitionId: "forced.revoke", to: "RESET", role: "senior_operator", commandType: "REVOKE", strong: true, highRisk: true, note: "发出撤销命令,收到设备 ACK 前保留实际目标。" },
    { transitionId: "forced.block", to: "BLOCKED", role: "senior_operator", strong: true, highRisk: true, noBatch: true, note: "升级为禁止下发,需强确认。" },
  ],
  BLOCKED: [
    { transitionId: "blocked.observe", to: "OBSERVING", role: "admin", note: "解除禁止,需原因。" },
    { transitionId: "blocked.activate", to: "MANUAL_FORCED", role: "admin", commandType: "ACTIVATE", strong: true, needsRemoteUrl: true, highRisk: true, noBatch: true, note: "越过禁止仅管理员可执行,需单人强确认,不允许批量。" },
  ],
  STALE: [
    // STALE→OBSERVING 为系统自动(收到新鲜上报后恢复),不在人工矩阵;人工仅高级运营强制下发。
    { transitionId: "stale.activate", to: "MANUAL_FORCED", role: "senior_operator", commandType: "ACTIVATE", strong: true, needsRemoteUrl: true, highRisk: true, note: "设备未新鲜上报,强制下发需单人强确认。" },
  ],
  RESET: [
    { transitionId: "reset.observe", to: "OBSERVING", role: "operator", note: "回到策略评估。" },
  ],
  ERROR: [],
};

/** 命令执行中的恢复出口;ACTIVATE 待确认/加载时不再暴露重复 ACTIVATE。 */
export function executionTransitions(input: TakeoverExecution | TakeoverExecutionPhase): Transition[] | undefined {
  const phase = typeof input === "string" ? input : input.phase;
  const retryable = typeof input === "string" || input.retryability === "retryable";
  const hasAppliedLease = typeof input !== "string" && input.appliedMode === "REMOTE" && !!input.appliedLease;
  const replacementCommandType: TakeoverCommandType = hasAppliedLease ? "CHANGE_TARGET" : "ACTIVATE";
  if (phase === "REVOKE_PENDING_ACK") return [
    { transitionId: "exec.revoke_retry", to: "RESET", label: "重发撤销命令", commandType: "REVOKE", role: "senior_operator", strong: true, highRisk: true, note: "发出更高版本幂等撤销命令,旧版本回执只留历史。" },
    { transitionId: "exec.revoke_query", to: "RESET", label: "查询设备应用态", role: "senior_operator", note: "只记录状态查询动作,不伪造设备回执。" },
  ];
  if (["COMMAND_PENDING_ACK", "RECEIVED", "WAITING_SESSION_EDGE", "LOADING", "HANDOFF_FETCHING", "HANDOFF_MERGING", "HANDOFF_ACKED"].includes(phase)) {
    return [
      ...(hasAppliedLease ? [{ transitionId: "exec.change_target", to: "MANUAL_FORCED", label: "更换批准目标", commandType: "CHANGE_TARGET", role: "senior_operator", needsRemoteUrl: true, strong: true, highRisk: true, note: "账户已有已应用租约，发出更高版本 CHANGE_TARGET 并精确替换旧 actor。" } satisfies Transition] : []),
      { transitionId: "exec.revoke", to: "RESET", label: "撤销接管", commandType: "REVOKE", role: "senior_operator", strong: true, highRisk: true, note: "发出更高版本撤销命令,优先于旧 ACTIVATE。" },
    ];
  }
  if (phase === "FAILED") {
    const targetDisabled = typeof input !== "string" && input.failureCode === "TARGET_DISABLED";
    return [
      ...(retryable && !targetDisabled ? [
        { transitionId: "exec.retry_activate", to: "ERROR", label: "重试本次接管", commandType: "ACTIVATE", role: "senior_operator", strong: true, highRisk: true, note: "仅可重试失败保留原批准目标并发出新版本 ACTIVATE。" },
      ] satisfies Transition[] : []),
      ...(retryable || targetDisabled ? [
        { transitionId: "exec.retry_change_target", to: "ERROR", label: "更换批准目标", commandType: replacementCommandType, role: "senior_operator", needsRemoteUrl: true, strong: true, highRisk: true, note: hasAppliedLease ? "选择可用批准目标并发出 CHANGE_TARGET，精确替换当前 actor。" : "选择可用批准目标并发出 ACTIVATE；当前没有可被替换的已应用租约。" },
      ] satisfies Transition[] : []),
      { transitionId: "exec.revoke_failed_attempt", to: "RESET", label: "撤销接管", commandType: "REVOKE", role: "senior_operator", strong: true, highRisk: true, note: "撤销远程意图,设备 ACK 前不改写实际态。" },
    ];
  }
  return undefined;
}

/** §9.4 禁止切换(显式高危禁止,展示用;矩阵未列即默认禁止)。 */
export const FORBIDDEN_NOTES: string[] = [
  "禁止下发(BLOCKED)不得被普通自动策略改为已命中。",
  "人工挂起未过期前不得被自动策略改为已激活。",
  "已激活不得直接改为新设备(会丢历史,违反审计)。",
  "环境过滤不得无差别批量直接改为手动下发。",
  "状态异常不得自动改为已激活,须先修复。",
];

/** 当前角色对某状态的可执行流转(按权限过滤)。 */
export function allowedTransitions(from: DeviceStatus, role: Role): Transition[] {
  return TRANSITIONS[from].filter((t) => ROLE_ORDER[role] >= ROLE_ORDER[t.role]);
}

/** 某状态下被权限挡住的流转(展示「需更高权限」用)。 */
export function gatedTransitions(from: DeviceStatus, role: Role): Transition[] {
  return TRANSITIONS[from].filter((t) => ROLE_ORDER[role] < ROLE_ORDER[t.role]);
}
