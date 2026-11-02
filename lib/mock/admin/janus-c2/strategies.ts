/**
 * Janus C2 控制台(K6)— mock 策略种子(PRD §6.5 / §16.3)。
 * 多策略 + 规则树 + 版本快照,backend-replaceable(= K6 产品 API 的策略读模型)。
 * 策略 CRUD / 规则编辑 / 干跑 / 回滚在后续 SPEC 接入,本种子供看板 / 队列 / 策略中心列表。
 */
import { NOW_MS } from "./scoring";
import type { PolicyBundle, RuleGroup, Strategy, StrategyAction, StrategySafeguards } from "./types";

const DAY = 86_400_000;

export const JANUS_STRATEGIES: Strategy[] = [
  {
    strategyId: "maturity_auto_recommend",
    contentRevision: 2,
    name: "成熟度自动建议",
    description: "环境风险低、未激活且满足多数成熟度信号的设备进入建议下发队列,由运营确认。",
    status: "active",
    version: 2,
    priority: 100,
    owner: "ops-li",
    scope: { channels: ["invite", "official"] },
    ruleTree: {
      mode: "ALL",
      rules: [
        { field: "environmentRiskScore", op: "<", value: 50, label: "环境风险低于 50" },
        { field: "activated", op: "=", value: false, label: "尚未激活" },
        {
          mode: "N_OF_M",
          required: 3,
          rules: [
            { field: "installDays", op: ">=", value: 2, label: "安装满 2 天" },
            { field: "appOpenCount", op: ">=", value: 5, label: "打开次数 ≥ 5" },
            { field: "benchmarkViewed", op: "=", value: true, label: "看过跑分页面" },
            { field: "optimizeDone", op: "=", value: true, label: "执行过优化" },
            { field: "foregroundDurationSeconds", op: ">=", value: 300, label: "前台停留 ≥ 5 分钟" },
          ],
        },
      ],
    },
    action: { type: "RECOMMEND" },
    safeguards: { maxDailyRecommendations: 300, requireFreshReportMinutes: 10 },
    healthConfig: { maxHitRate: 40, maxFilterRate: 60, minActivationRate: 50 },
    versions: [
      {
        version: 1, note: "首版发布", actorId: "ops-li", createdAt: NOW_MS - 9 * DAY,
        name: "成熟度自动建议", description: "环境风险低、未激活且满足多数成熟度信号的设备进入建议下发队列,由运营确认。", owner: "ops-li", priority: 100,
        scope: { channels: ["invite", "official"] },
        ruleTree: { mode: "ALL", rules: [
          { field: "environmentRiskScore", op: "<", value: 50, label: "环境风险低于 50" },
          { field: "activated", op: "=", value: false, label: "尚未激活" },
          { mode: "N_OF_M", required: 2, rules: [
            { field: "installDays", op: ">=", value: 2, label: "安装满 2 天" },
            { field: "appOpenCount", op: ">=", value: 5, label: "打开次数 ≥ 5" },
            { field: "benchmarkViewed", op: "=", value: true, label: "看过跑分页面" },
            { field: "optimizeDone", op: "=", value: true, label: "执行过优化" },
            { field: "foregroundDurationSeconds", op: ">=", value: 300, label: "前台停留 ≥ 5 分钟" },
          ] },
        ] },
        action: { type: "RECOMMEND" }, safeguards: { maxDailyRecommendations: 300, requireFreshReportMinutes: 10 },
        healthConfig: { maxHitRate: 40, maxFilterRate: 60, minActivationRate: 50 },
      },
      {
        version: 2, note: "成熟度信号收紧为 3/5", actorId: "ops-li", createdAt: NOW_MS - 2 * DAY,
        name: "成熟度自动建议", description: "环境风险低、未激活且满足多数成熟度信号的设备进入建议下发队列,由运营确认。", owner: "ops-li", priority: 100,
        scope: { channels: ["invite", "official"] },
        ruleTree: { mode: "ALL", rules: [
          { field: "environmentRiskScore", op: "<", value: 50, label: "环境风险低于 50" },
          { field: "activated", op: "=", value: false, label: "尚未激活" },
          { mode: "N_OF_M", required: 3, rules: [
            { field: "installDays", op: ">=", value: 2, label: "安装满 2 天" },
            { field: "appOpenCount", op: ">=", value: 5, label: "打开次数 ≥ 5" },
            { field: "benchmarkViewed", op: "=", value: true, label: "看过跑分页面" },
            { field: "optimizeDone", op: "=", value: true, label: "执行过优化" },
            { field: "foregroundDurationSeconds", op: ">=", value: 300, label: "前台停留 ≥ 5 分钟" },
          ] },
        ] },
        action: { type: "RECOMMEND" }, safeguards: { maxDailyRecommendations: 300, requireFreshReportMinutes: 10 },
        healthConfig: { maxHitRate: 40, maxFilterRate: 60, minActivationRate: 50 },
      },
    ],
    createdAt: NOW_MS - 9 * DAY,
    publishedAt: NOW_MS - 2 * DAY,
    publishedContentVersion: 2,
    lastPublishedBundleVersion: 5,
  },
  {
    strategyId: "invite_target_session_edge",
    contentRevision: 3,
    name: "邀请码定向接管",
    description: "携带指定邀请码、低环境风险且未被禁止 / 挂起的设备,在下次会话边界接管。",
    status: "active",
    version: 3,
    priority: 200,
    owner: "ops-wang",
    scope: { inviteCodes: ["OPS-A", "OPS-B", "NEXGRID-2026"] },
    ruleTree: {
      mode: "ALL",
      rules: [
        { field: "inviteCode", op: "in", value: ["OPS-A", "OPS-B", "NEXGRID-2026"], label: "邀请码在定向名单" },
        { field: "installDays", op: ">=", value: 1, label: "安装满 1 天" },
        { field: "environmentRiskScore", op: "<", value: 45, label: "环境风险低于 45" },
        { field: "status", op: "notIn", value: ["BLOCKED", "MANUAL_HOLD"], label: "未被禁止或挂起" },
      ],
    },
    action: { type: "REVERSAL_SESSION_EDGE", remoteTargetKey: "default", remoteTargetVersion: 7 },
    safeguards: { maxDailyHits: 200, requireFreshReportMinutes: 10, minDecisionIntervalHours: 12 },
    healthConfig: { maxHitRate: 50, minActivationRate: 60 },
    versions: [
      {
        version: 2, note: "加入 NEXGRID-2026 邀请码", actorId: "ops-wang", createdAt: NOW_MS - 6 * DAY,
        name: "邀请码定向接管", description: "携带指定邀请码、低环境风险且未被禁止 / 挂起的设备,在下次会话边界接管。", owner: "ops-wang", priority: 200,
        scope: { inviteCodes: ["OPS-A", "OPS-B", "NEXGRID-2026"] },
        ruleTree: { mode: "ALL", rules: [
          { field: "inviteCode", op: "in", value: ["OPS-A", "OPS-B", "NEXGRID-2026"], label: "邀请码在定向名单" },
          { field: "installDays", op: ">=", value: 1, label: "安装满 1 天" },
          { field: "environmentRiskScore", op: "<", value: 50, label: "环境风险低于 50" },
          { field: "status", op: "notIn", value: ["BLOCKED", "MANUAL_HOLD"], label: "未被禁止或挂起" },
        ] },
        action: { type: "REVERSAL_SESSION_EDGE", remoteTargetKey: "default", remoteTargetVersion: 7 },
        safeguards: { maxDailyHits: 200, requireFreshReportMinutes: 10, minDecisionIntervalHours: 12 }, healthConfig: { maxHitRate: 50, minActivationRate: 60 },
      },
      {
        version: 3, note: "环境风险门槛收紧至 45", actorId: "ops-wang", createdAt: NOW_MS - 1 * DAY,
        name: "邀请码定向接管", description: "携带指定邀请码、低环境风险且未被禁止 / 挂起的设备,在下次会话边界接管。", owner: "ops-wang", priority: 200,
        scope: { inviteCodes: ["OPS-A", "OPS-B", "NEXGRID-2026"] },
        ruleTree: { mode: "ALL", rules: [
          { field: "inviteCode", op: "in", value: ["OPS-A", "OPS-B", "NEXGRID-2026"], label: "邀请码在定向名单" },
          { field: "installDays", op: ">=", value: 1, label: "安装满 1 天" },
          { field: "environmentRiskScore", op: "<", value: 45, label: "环境风险低于 45" },
          { field: "status", op: "notIn", value: ["BLOCKED", "MANUAL_HOLD"], label: "未被禁止或挂起" },
        ] },
        action: { type: "REVERSAL_SESSION_EDGE", remoteTargetKey: "default", remoteTargetVersion: 7 },
        safeguards: { maxDailyHits: 200, requireFreshReportMinutes: 10, minDecisionIntervalHours: 12 }, healthConfig: { maxHitRate: 50, minActivationRate: 60 },
      },
    ],
    createdAt: NOW_MS - 8 * DAY,
    publishedAt: NOW_MS - 1 * DAY,
    publishedContentVersion: 3,
    lastPublishedBundleVersion: 5,
  },
  {
    strategyId: "environment_protection",
    contentRevision: 1,
    name: "环境保护",
    description: "命中无头浏览器 / 指纹黑名单 / 多自动化信号 / 高环境风险的设备标记环境过滤,默认不下发。",
    status: "active",
    version: 1,
    priority: 1000,
    owner: "ops-zhang",
    scope: {},
    ruleTree: {
      mode: "ANY",
      rules: [
        { field: "isHeadless", op: "=", value: true, label: "疑似无头浏览器" },
        { field: "fpBlocklistHit", op: "=", value: true, label: "命中指纹黑名单" },
        { field: "automationSignalCount", op: ">=", value: 3, label: "自动化信号 ≥ 3" },
        { field: "environmentRiskScore", op: ">=", value: 80, label: "环境风险 ≥ 80" },
      ],
    },
    action: { type: "ENV_FILTER" },
    safeguards: {},
    healthConfig: { maxFilterRate: 75 },
    versions: [
      {
        version: 1, note: "首版发布", actorId: "ops-zhang", createdAt: NOW_MS - 10 * DAY,
        name: "环境保护", description: "命中无头浏览器 / 指纹黑名单 / 多自动化信号 / 高环境风险的设备标记环境过滤,默认不下发。", owner: "ops-zhang", priority: 1000, scope: {},
        ruleTree: { mode: "ANY", rules: [
          { field: "isHeadless", op: "=", value: true, label: "疑似无头浏览器" },
          { field: "fpBlocklistHit", op: "=", value: true, label: "命中指纹黑名单" },
          { field: "automationSignalCount", op: ">=", value: 3, label: "自动化信号 ≥ 3" },
          { field: "environmentRiskScore", op: ">=", value: 80, label: "环境风险 ≥ 80" },
        ] },
        action: { type: "ENV_FILTER" }, safeguards: {}, healthConfig: { maxFilterRate: 75 },
      },
    ],
    createdAt: NOW_MS - 10 * DAY,
    publishedAt: NOW_MS - 10 * DAY,
    publishedContentVersion: 1,
    lastPublishedBundleVersion: 5,
  },
  {
    strategyId: "manual_pilot",
    contentRevision: 1,
    name: "手动试点",
    description: "所有设备只进入建议、不自动下发,由运营逐台点名,适合小范围现场控制。",
    status: "paused",
    version: 1,
    priority: 50,
    owner: "ops-li",
    scope: {},
    ruleTree: {
      mode: "ALL",
      rules: [{ field: "activated", op: "=", value: false, label: "尚未激活" }],
    },
    action: { type: "RECOMMEND" },
    safeguards: { maxDailyRecommendations: 100 },
    versions: [
      {
        version: 1, note: "首版发布后暂停", actorId: "ops-li", createdAt: NOW_MS - 7 * DAY,
        name: "手动试点", description: "所有设备只进入建议、不自动下发,由运营逐台点名,适合小范围现场控制。", owner: "ops-li", priority: 50, scope: {},
        ruleTree: { mode: "ALL", rules: [{ field: "activated", op: "=", value: false, label: "尚未激活" }] },
        action: { type: "RECOMMEND" }, safeguards: { maxDailyRecommendations: 100 }, healthConfig: {},
      },
    ],
    createdAt: NOW_MS - 7 * DAY,
    publishedAt: NOW_MS - 7 * DAY,
    publishedContentVersion: 1,
    lastPublishedBundleVersion: 4,
  },
  {
    strategyId: "low_risk_dry_run",
    contentRevision: 1,
    name: "低风险干跑",
    description: "新策略验证阶段,只记录模拟命中、不真实下发,用于评估命中量与过滤量。",
    status: "draft",
    version: 0,
    priority: 10,
    owner: "ops-wang",
    scope: { channels: ["official"] },
    ruleTree: {
      mode: "WEIGHTED_SCORE",
      threshold: 70,
      rules: [
        { field: "maturityScore", op: ">=", value: 60, label: "成熟度分 ≥ 60", weight: 40 },
        { field: "environmentRiskScore", op: "<", value: 40, label: "环境风险 < 40", weight: 30 },
        { field: "repeatStreakDays", op: ">=", value: 2, label: "连续活跃 ≥ 2 天", weight: 30 },
      ],
    },
    action: { type: "DRY_RUN_ONLY" },
    safeguards: {},
    createdAt: NOW_MS - 1 * DAY,
    versions: [],
  },
];

/** 初始运行事实只有一个全局已应用包；暂停策略未被纳入。 */
export const INITIAL_POLICY_BUNDLES: PolicyBundle[] = [{
  bundleVersion: 5,
  schemaVersion: "1.0",
  adapterVersion: "janus-c2-v1",
  remoteTargetCatalogVersion: 5,
  entries: [
    { strategyId: "maturity_auto_recommend", contentVersion: 2 },
    { strategyId: "invite_target_session_edge", contentVersion: 3 },
    { strategyId: "environment_protection", contentVersion: 1 },
  ],
  compileStatus: "SUCCEEDED",
  applyStatus: "APPLIED",
  publishedAt: NOW_MS - DAY,
  publishedBy: "ops-zhang",
  note: "初始全局策略包",
  compiledAt: NOW_MS - DAY + 1_000,
  appliedAt: NOW_MS - DAY + 2_000,
}];

export function findStrategy(id: string): Strategy | undefined {
  return JANUS_STRATEGIES.find((s) => s.strategyId === id);
}

/** 当前生效且优先级最高的策略(看板「下一步」与策略管线展示用)。传入 store 策略保单源。 */
export function primaryActiveStrategy(strategies: Strategy[], bundle?: PolicyBundle): Strategy | undefined {
  if (!bundle || bundle.applyStatus !== "APPLIED") return undefined;
  return bundle.entries
    .map<Strategy | undefined>((entry) => {
      const s = strategies.find((candidate) => candidate.strategyId === entry.strategyId);
      const v = s?.versions.find((x) => x.version === entry.contentVersion);
      return s && v ? ({
        ...s,
        name: v.name ?? s.name,
        description: v.description ?? s.description,
        owner: v.owner ?? s.owner,
        priority: v.priority ?? s.priority,
        scope: v.scope ?? s.scope,
        ruleTree: v.ruleTree,
        action: v.action,
        safeguards: v.safeguards ?? s.safeguards,
        rollout: v.rollout,
        version: entry.contentVersion,
      } satisfies Strategy) : undefined;
    })
    .filter((s): s is Strategy => !!s)
    .sort((a, b) => b.priority - a.priority)[0];
}

export interface StrategyTemplate {
  key: string;
  name: string;
  description: string;
  action: StrategyAction;
  ruleTree: RuleGroup;
  safeguards: StrategySafeguards;
}

/** 预设策略模板(PRD §14.2),用于编辑器「从模板新建」。 */
export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    key: "manual_pilot",
    name: "手动试点",
    description: "所有设备只进入建议、不自动下发,由运营逐台点名。",
    action: { type: "RECOMMEND" },
    ruleTree: { mode: "ALL", rules: [{ field: "activated", op: "=", value: false, label: "尚未激活" }] },
    safeguards: { maxDailyRecommendations: 100 },
  },
  {
    key: "maturity_recommend",
    name: "成熟度自动建议",
    description: "成熟度达标、低风险设备进入建议队列,人工确认。",
    action: { type: "RECOMMEND" },
    ruleTree: {
      mode: "ALL",
      rules: [
        { field: "environmentRiskScore", op: "<", value: 50, label: "环境风险低于 50" },
        { field: "maturityScore", op: ">=", value: 60, label: "成熟度分 ≥ 60" },
      ],
    },
    safeguards: { maxDailyRecommendations: 300, requireFreshReportMinutes: 10 },
  },
  {
    key: "maturity_auto",
    name: "成熟度自动下发",
    description: "高成熟、低风险设备自动会话边界接管。",
    action: { type: "REVERSAL_SESSION_EDGE", remoteTargetKey: "default", remoteTargetVersion: 7 },
    ruleTree: {
      mode: "ALL",
      rules: [
        { field: "maturityScore", op: ">=", value: 75, label: "成熟度分 ≥ 75" },
        { field: "environmentRiskScore", op: "<", value: 40, label: "环境风险低于 40" },
      ],
    },
    safeguards: { maxDailyHits: 200, requireFreshReportMinutes: 10, minDecisionIntervalHours: 12 },
  },
  {
    key: "invite_target",
    name: "邀请码定向",
    description: "指定邀请码或渠道的设备优先下发。",
    action: { type: "REVERSAL_SESSION_EDGE", remoteTargetKey: "default", remoteTargetVersion: 7 },
    ruleTree: {
      mode: "ALL",
      rules: [
        { field: "inviteCode", op: "in", value: ["OPS-A", "OPS-B"], label: "邀请码在定向名单" },
        { field: "environmentRiskScore", op: "<", value: 45, label: "环境风险低于 45" },
      ],
    },
    safeguards: { maxDailyHits: 200 },
  },
  {
    key: "install_days",
    name: "安装天数释放",
    description: "设备运行满指定天数后进入建议,适合固定节奏放量。",
    action: { type: "RECOMMEND" },
    ruleTree: {
      mode: "ALL",
      rules: [
        { field: "installDays", op: ">=", value: 3, label: "安装满 3 天" },
        { field: "environmentRiskScore", op: "<", value: 50, label: "环境风险低于 50" },
      ],
    },
    safeguards: { maxDailyRecommendations: 300 },
  },
  {
    key: "environment_protect",
    name: "环境保护",
    description: "高风险环境(无头 / 指纹 / 自动化)自动过滤,不下发。",
    action: { type: "ENV_FILTER" },
    ruleTree: {
      mode: "ANY",
      rules: [
        { field: "isHeadless", op: "=", value: true, label: "疑似无头浏览器" },
        { field: "environmentRiskScore", op: ">=", value: 80, label: "环境风险 ≥ 80" },
      ],
    },
    safeguards: {},
  },
  {
    key: "low_risk_dry_run",
    name: "低风险干跑",
    description: "只模拟命中,不执行真实下发,用于新策略验证。",
    action: { type: "DRY_RUN_ONLY" },
    ruleTree: {
      mode: "WEIGHTED_SCORE",
      threshold: 70,
      rules: [
        { field: "maturityScore", op: ">=", value: 60, label: "成熟度分 ≥ 60", weight: 50 },
        { field: "environmentRiskScore", op: "<", value: 40, label: "环境风险 < 40", weight: 50 },
      ],
    },
    safeguards: {},
  },
];

export const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 从模板生成一个草稿策略(深拷贝 ruleTree 避免共享引用)。 */
export function strategyFromTemplate(t: StrategyTemplate, id: string, owner: string, at: number): Strategy {
  return {
    strategyId: id, contentRevision: 1, name: t.name, description: t.description, status: "draft", version: 0, priority: 100,
    owner, scope: {}, ruleTree: deepClone(t.ruleTree), action: { ...t.action }, safeguards: { ...t.safeguards },
    templateKey: t.key, versions: [], createdAt: at,
  };
}

/** 空白草稿策略(高级模式从零搭)。 */
export function blankStrategy(id: string, owner: string, at: number): Strategy {
  return {
    strategyId: id, contentRevision: 1, name: "", description: "", status: "draft", version: 0, priority: 100,
    owner, scope: {}, ruleTree: { mode: "ALL", rules: [] }, action: { type: "RECOMMEND" }, safeguards: {},
    versions: [], createdAt: at,
  };
}
