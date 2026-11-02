"use client";

// audit-ok:hydration —— K6 client-only(console-shell mount 门内渲染,无 SSR 水合);janus-c2 persist 走 localStorage 同步水合,无时序错位。

/**
 * K6 设备详情 modal(SPEC 1 · PRD §13)。
 * 基础 / 会话 / 成熟度 / 环境 / 判定轨迹(逐规则)/ 操作区。
 * 操作区:SPEC 1 仅读(复制 + 建议);处置动作(下发/挂起/过滤/禁止/重置)在 SPEC 2 手动修改闭环接入。
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { effectiveDevices, isK6ContractMockEnabled, useJanusC2Store } from "@/lib/store/admin/janus-c2-store";
import { decisionTrace } from "@/lib/mock/admin/janus-c2/evaluate";
import { ingestDeviceReport, projectSessionPage } from "@/lib/mock/admin/janus-c2/contract-reducers";
import { isFresh, timeAgo } from "@/lib/mock/admin/janus-c2/scoring";
import {
  ACTION_TYPE_LABEL,
  FAILURE_CLASS_LABEL,
  FAILURE_REASON_LABEL,
  REPORT_EVENT_LABEL,
  REPORT_IGNORE_LABEL,
  ROLE_LABEL,
  STATUS_EXPLAIN,
  STATUS_LABEL,
  STATUS_SOURCE_LABEL,
  STATUS_TONE,
  SUGGESTED_ACTION,
  TAKEOVER_MODE_LABEL,
  TAKEOVER_PHASE_EXPLAIN,
  TAKEOVER_PHASE_LABEL,
  TAKEOVER_PHASE_TONE,
  channelLabel,
  remoteUrlLabel,
} from "@/lib/mock/admin/janus-c2/labels";
import { executionTransitions, ROLE_ORDER, TRANSITIONS, type Transition } from "@/lib/mock/admin/janus-c2/transitions";
import type { Device, ReportProjection } from "@/lib/mock/admin/janus-c2/types";
import { ManualOverrideModal } from "./manual-override-modal";
import { useK6Operator } from "./use-operator";

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="k6-kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span className="k">{k}</span>
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  );
}

const yn = (b: boolean): string => (b ? "是" : "否");

export function K6DeviceDetail({ device: d, onClose }: { device: Device; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const operator = useK6Operator();
  const contractMockEnabled = isK6ContractMockEnabled();
  const [pending, setPending] = useState<Transition | null>(null);
  const [sessionCursor, setSessionCursor] = useState<string>();
  const [sessionCursorHistory, setSessionCursorHistory] = useState<Array<string | undefined>>([]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") { if (pending) setPending(null); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  const strategies = useJanusC2Store((s) => s.strategies);
  const policyBundles = useJanusC2Store((s) => s.policyBundles);
  const appliedBundleVersion = useJanusC2Store((s) => s.appliedBundleVersion);
  const remoteTargets = useJanusC2Store((s) => s.remoteTargets);
  const accountAuthority = useJanusC2Store((s) => s.accountAuthorities?.[d.accountSubjectRef]);
  const sandboxOverrides = useJanusC2Store((s) => s.sandboxOverrides);
  const sandboxAuthority = useJanusC2Store((s) => s.sandboxAccountAuthorities?.[d.accountSubjectRef]);
  const simulateReceipt = useJanusC2Store((s) => s.simulateCommandReceipt);
  const sandboxDevice = useMemo(() => sandboxOverrides[d.deviceId]
    ? effectiveDevices(sandboxOverrides).find((device) => device.deviceId === d.deviceId) ?? d
    : d, [d, sandboxOverrides]);
  const sandboxTakeover = sandboxDevice.takeover;
  const appliedBundle = policyBundles.find((bundle) => bundle.bundleVersion === appliedBundleVersion);
  const trace = decisionTrace(d, strategies, appliedBundle);
  const execution = executionTransitions(d.takeover);
  const candidates = execution ?? TRANSITIONS[d.status];
  const allowed = candidates.filter((t) => ROLE_ORDER[operator.role] >= ROLE_ORDER[t.role]);
  const gated = candidates.filter((t) => ROLE_ORDER[operator.role] < ROLE_ORDER[t.role]);
  const commandPending = ["COMMAND_PENDING_ACK", "WAITING_SESSION_EDGE", "REVOKE_PENDING_ACK"].includes(d.takeover.phase);
  const m = d.maturity;
  const e = d.environment;
  const reportProjection = useMemo(() => d.reports
    .reduce<ReportProjection>((projection, report, index) => ingestDeviceReport(projection, report, report.observedAt + index).projection, {
      deviceId: d.deviceId,
      sessions: [],
      acceptedReports: [],
      ignoredReports: [],
    } satisfies ReportProjection), [d.deviceId, d.reports]);
  const sessionsPage = projectSessionPage(reportProjection, sessionCursor, 1);
  const latestBoundaryReport = [...d.reports]
    .filter((report) => report.eventType === "session_boundary" && report.boundaryId)
    .sort((a, b) => b.observedAt - a.observedAt)[0];
  const commandCause = d.takeover.currentCommand?.cause;

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(d.deviceId).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
    <div className="k6-modal-overlay" onClick={onClose}>
      <div className="k6c2 k6-modal" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true" aria-label={`设备详情 ${d.deviceId}`}>
        <div className="k6-modal-head">
          <div className="ttl">
            <code className="sid">{d.deviceId}</code>
            <span className={`k6-bdg ${STATUS_TONE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
            <span className="k6-srctag">来源 · {STATUS_SOURCE_LABEL[d.statusSource]}</span>
          </div>
          <button className="k6-modal-close" onClick={onClose} aria-label="关闭"><X size={18} aria-hidden /></button>
        </div>

        <div className="k6-modal-body">
          <div className="k6-explain" style={{ marginBottom: 18 }}>{STATUS_EXPLAIN[d.status]}</div>

          <div className="k6-dsec">
            <h4>基础信息</h4>
            <KV rows={[
              ["设备 ID", <span className="mono" key="d">{d.deviceId}</span>],
              ["账户主体引用", <span className="mono" key="account">{d.accountSubjectRef}</span>],
              ["账户共享写权", accountAuthority
                ? `${accountAuthority.leaseState} · epoch ${accountAuthority.handoffEpoch} · actor ${accountAuthority.activeActor?.deviceId ?? "白壳"} · 候选 ${accountAuthority.pendingCandidates.length}`
                : "等待账户服务投影"],
              ["首次上报", timeAgo(d.firstSeenAt)],
              ["最近上报", timeAgo(d.lastSeenAt)],
              ["安装天数", `${d.installDays} 天`],
              ["邀请码", d.inviteCode ?? "—"],
              ["渠道", channelLabel(d.channel)],
              ["期望接管目标", `${remoteUrlLabel(d.takeover.desiredRemoteTargetKey, remoteTargets)}${d.takeover.desiredRemoteTargetVersion ? ` · v${d.takeover.desiredRemoteTargetVersion}` : ""}`],
              ["实际接管目标", `${remoteUrlLabel(d.takeover.appliedRemoteTargetKey, remoteTargets)}${d.takeover.appliedRemoteTargetVersion ? ` · v${d.takeover.appliedRemoteTargetVersion}` : ""}`],
              ["最近操作人", d.lastOperatorId ? `${d.lastOperatorId} · ${d.lastOperationReason ?? ""}` : "—"],
            ]} />
          </div>

          <div className="k6-dsec">
            <h4>接管执行</h4>
            <div className="k6-chips" style={{ marginBottom: 10 }}>
              <span className={`k6-bdg ${TAKEOVER_PHASE_TONE[d.takeover.phase]}`}>{TAKEOVER_PHASE_LABEL[d.takeover.phase]}</span>
              <span className="k6-srctag">意图 · {TAKEOVER_MODE_LABEL[d.takeover.desiredMode]}</span>
              <span className="k6-srctag">实态 · {TAKEOVER_MODE_LABEL[d.takeover.appliedMode]}</span>
            </div>
            <div className="k6-explain" style={{ marginBottom: 10 }}>{TAKEOVER_PHASE_EXPLAIN[d.takeover.phase]}</div>
            <KV rows={[
              ["命令 ID", <span className="mono" key="cmd">{d.takeover.commandId ?? "—"}</span>],
              ["命令版本", `${d.takeover.commandVersion} · 设备已应用 ${d.takeover.appliedCommandVersion}`],
              ["包 / 目录版本", d.takeover.currentCommand ? `PolicyBundle v${d.takeover.currentCommand.policyBundleVersion} · 目标目录 v${d.takeover.currentCommand.catalogVersion}` : "—"],
              ["命令因果来源", commandCause?.kind === "manual" ? `人工请求 ${commandCause.requestId} · 审计 ${commandCause.auditId}` : commandCause?.kind === "decision" ? `自动判定 ${commandCause.decisionId}` : "—"],
              ["账户主动作方", d.takeover.actorState === "WHITE_ACTIVE" ? "白壳" : d.takeover.actorState === "TRANSFERRING" ? "交接中" : "远程业务"],
              ["已应用交接 / lease", d.takeover.appliedLease ? `${d.takeover.appliedLease.handoffId} · epoch ${d.takeover.appliedLease.handoffEpoch} · ${d.takeover.appliedLease.actorLeaseId}` : "—"],
              ["候选交接", d.takeover.pendingHandoff ? `${d.takeover.pendingHandoff.handoffId} · epoch ${d.takeover.pendingHandoff.handoffEpoch} · 等待账户服务 ACK` : "—"],
              ["执行尝试 ID", <span className="mono" key="att">{d.takeover.attemptId ?? "—"}</span>],
              ["期望目标", `${remoteUrlLabel(d.takeover.desiredRemoteTargetKey, remoteTargets)}${d.takeover.desiredRemoteTargetVersion ? ` · v${d.takeover.desiredRemoteTargetVersion}` : ""}`],
              ["实际目标", `${remoteUrlLabel(d.takeover.appliedRemoteTargetKey, remoteTargets)}${d.takeover.appliedRemoteTargetVersion ? ` · v${d.takeover.appliedRemoteTargetVersion}` : ""}`],
              ["请求时间", d.takeover.requestedAt ? timeAgo(d.takeover.requestedAt) : "—"],
              ["确认时间", d.takeover.acknowledgedAt ? timeAgo(d.takeover.acknowledgedAt) : "—"],
              ["失败原因", d.takeover.failureReason ?? "—"],
              ["失败分类", d.takeover.failureClass ? FAILURE_CLASS_LABEL[d.takeover.failureClass] : "—"],
              ["失败代码", d.takeover.failureCode ? FAILURE_REASON_LABEL[d.takeover.failureCode] : "—"],
              ["重试 / 阶段", d.takeover.retryability ? `${d.takeover.retryability === "retryable" ? "可重试" : "终止"} · ${d.takeover.failureStage ?? "—"}` : "—"],
            ]} />
            {operator.role === "admin" && contractMockEnabled && sandboxTakeover.currentCommand && !["SUCCEEDED", "REVOKED", "FAILED", "CANCELLED"].includes(sandboxTakeover.phase) && (
              <div className="k6-chips" style={{ marginTop: 10 }}>
                <span className="k6-bdg dim">DEV 沙盒 · {TAKEOVER_PHASE_LABEL[sandboxTakeover.phase]} · {sandboxAuthority?.leaseState ?? "等待权威"}</span>
                {sandboxTakeover.currentCommand.type === "REVOKE"
                  ? <button className="k6-pgbtn" onClick={() => simulateReceipt(d.deviceId, "revoke_succeeded", operator.id, operator.role)}>原型回执样例 · 撤销成功</button>
                  : <>
                    {sandboxTakeover.phase === "COMMAND_PENDING_ACK" && sandboxTakeover.currentCommand.effectiveTiming === "session_edge" && <button className="k6-pgbtn" onClick={() => simulateReceipt(d.deviceId, "session_edge_wait", operator.id, operator.role)}>原型回执样例 · 已收命令并等待新会话</button>}
                    <button className="k6-pgbtn" onClick={() => simulateReceipt(d.deviceId, "success", operator.id, operator.role)}>原型回执样例 · 新会话+交接成功</button>
                    <button className="k6-pgbtn" onClick={() => simulateReceipt(d.deviceId, "handoff_failed", operator.id, operator.role)}>原型回执样例 · 交接失败</button>
                  </>}
                <button className="k6-pgbtn" onClick={() => simulateReceipt(d.deviceId, "old_version_ignored", operator.id, operator.role)}>原型回执样例 · 旧版本忽略</button>
                <button className="k6-pgbtn" onClick={() => simulateReceipt(d.deviceId, "duplicate_ignored", operator.id, operator.role)}>原型回执样例 · 重复事件忽略</button>
              </div>
            )}
            <div className="k6-hint">原型回执仅在 DEV + contractMock 隔离沙盒开放，不代表 K6 已真实控制 Janus。</div>
          </div>

          <div className="k6-dsec">
            <h4>会话信息</h4>
            <KV rows={[
              ["会话 ID", <span className="ua" key="s">{d.latestSession?.sessionId ?? "—"}</span>],
              ["设备会话数", `${d.sessions.length} 个 · latestSessionId ${d.latestSessionId}`],
              ["会话开始", d.latestSession ? timeAgo(d.latestSession.startedAt) : "—"],
              ["会话更新", d.latestSession ? timeAgo(d.latestSession.lastSeenAt) : "—"],
              ["当前实际页面", d.takeover.appliedMode === "REMOTE" ? "远程业务" : "审核态(白壳)"],
              ["模拟业务日", d.latestSession?.simDay != null ? `第 ${d.latestSession.simDay} 天` : "—"],
              ["前后台", isFresh(d.lastSeenAt) ? "前台活跃" : "后台 / 已离开"],
              ["设备型号", `${d.platform} · ${d.model}`],
              ["系统", d.osName],
              ["浏览器", d.browser],
              ["环境风险摘要", `${e.environmentRiskScore} 分${e.riskReasons.length ? ` · ${e.riskReasons.join(" / ")}` : ""}`],
              ["UA", <span className="ua" key="ua">{d.ua ?? "—"}</span>],
              ["最新上报", `${d.latestReport.reportId} · ${REPORT_EVENT_LABEL[d.latestReport.eventType]} · boot ${d.latestReport.bootId} · seq ${d.latestReport.sequence} · schema ${d.latestReport.schemaVersion}`],
              ["最近会话边界", latestBoundaryReport ? `${latestBoundaryReport.boundaryId} · ${latestBoundaryReport.sessionId} · ${timeAgo(latestBoundaryReport.observedAt)}` : "—"],
              ["上报信号", `累计打开 ${d.latestReport.cumulativeSignals.appOpenCount} 次 / 会话 ${d.latestReport.cumulativeSignals.sessionCount} 次 · 瞬时阶段 ${d.latestReport.instantaneousSignals.appPhase}`],
              ["上报历史", `${d.reports.length} 条 · 会话按服务端建立顺序游标分页`],
              ["忽略旧上报", d.ignoredReports.length ? d.ignoredReports.map((r) => `${r.reportId}:${r.ignoredReason ? REPORT_IGNORE_LABEL[r.ignoredReason] : "未分类"}`).join(" / ") : "—"],
            ]} />
            <div className="k6-ovr-brief" style={{ marginTop: 10 }}>
              {sessionsPage.items.map((session) => <div key={session.sessionId} className="k6-strat-meta"><span className="mono">{session.sessionId}</span> · 最近 seq {session.latestSequence} · {session.reportIds.length} 条上报 · {timeAgo(session.lastSeenAt)}</div>)}
              <div className="k6-strat-actions"><button className="k6-pgbtn" disabled={!sessionCursorHistory.length} onClick={() => { const history = [...sessionCursorHistory]; setSessionCursor(history.pop()); setSessionCursorHistory(history); }}>上一会话</button><span className="k6-bdg dim">第 {sessionCursorHistory.length + 1} 页 · 共 {sessionsPage.total} 会话</span><button className="k6-pgbtn" disabled={!sessionsPage.nextCursor} onClick={() => { setSessionCursorHistory((history) => [...history, sessionCursor]); setSessionCursor(sessionsPage.nextCursor); }}>下一会话</button></div>
            </div>
          </div>

          <div className="k6-dsec">
            <h4>成熟度信息</h4>
            <KV rows={[
              ["成熟度分", `${d.maturityScore} / 100`],
              ["建议分", `${d.recommendationScore} / 100`],
              ["打开次数", `${m.appOpenCount} 次`],
              ["会话次数", `${m.sessionCount} 次`],
              ["连续活跃", `${m.repeatStreakDays} 天`],
              ["前台停留", `${Math.round(m.foregroundDurationSeconds / 60)} 分钟`],
              ["关键页面", [m.benchmarkViewed && "跑分", m.marketViewed && "市场", m.walletViewed && "资产"].filter(Boolean).join(" / ") || "未访问"],
              ["关键动作", m.optimizeDone ? "执行过优化" : "未执行"],
            ]} />
          </div>

          <div className="k6-dsec">
            <h4>环境信息</h4>
            <KV rows={[
              ["环境风险分", `${e.environmentRiskScore} / 100`],
              ["疑似无头浏览器", yn(e.isHeadless)],
              ["自动化信号", `${e.automationSignalCount} 个`],
              ["指纹黑名单", yn(e.fpBlocklistHit)],
              ["屏幕异常", yn(e.screenAnomaly)],
              ["时区 / 语言异常", `${yn(e.timezoneMismatch)} / ${yn(e.languageMismatch)}`],
            ]} />
            {e.riskReasons.length > 0 && (
              <div className="k6-chips" style={{ marginTop: 10 }}>
                {e.riskReasons.map((r) => <span key={r} className="k6-bdg warning">{r}</span>)}
              </div>
            )}
          </div>

          <div className="k6-dsec">
            <h4>判定轨迹</h4>
            {trace ? (
              <>
                <div className="k6-chips" style={{ marginBottom: 10 }}>
                  <span className="k6-bdg dim">策略 · {trace.strategyName} v{trace.strategyVersion}</span>
                  <span className="k6-bdg good">动作 · {ACTION_TYPE_LABEL[trace.action]}</span>
                  <span className="k6-bdg dim">判定 · {timeAgo(trace.decidedAt)}</span>
                  {trace.conflicts?.map((c) => <span key={c} className="k6-bdg warning">冲突 · {c}</span>)}
                </div>
                <table className="k6-trace">
                  <thead><tr><th>规则</th><th style={{ width: 70 }}>结果</th><th style={{ width: 120 }}>说明</th></tr></thead>
                  <tbody>
                    {trace.ruleResults.map((r, i) => (
                      <tr key={i}>
                        <td>{r.label}</td>
                        <td><span className={r.passed ? "pass" : "fail"}>{r.passed ? "通过" : "未通过"}</span></td>
                        <td className="dt">{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="k6-explain">当前无生效策略可评估,设备保持白壳继续观察。</div>
            )}
          </div>

          <div className="k6-dsec" style={{ marginBottom: 0 }}>
            <h4>操作区</h4>
            <div className="k6-chips" style={{ marginBottom: 12 }}>
              <span className="k6-bdg good">建议 · {SUGGESTED_ACTION[d.status]}</span>
              <span className={`k6-bdg ${TAKEOVER_PHASE_TONE[d.takeover.phase]}`}>执行 · {TAKEOVER_PHASE_LABEL[d.takeover.phase]}</span>
              <span className="k6-srctag">当前身份 · {ROLE_LABEL[operator.role]}</span>
            </div>
            {commandPending && <div className="k6-explain" style={{ marginBottom: 10 }}>{d.takeover.phase === "REVOKE_PENDING_ACK" ? "撤销仍待设备确认；可重发更高版本撤销，或只查询应用态，不能假定已回到白壳。" : "接管命令不可重复提交；仍可由风控主管更换批准目标或撤销。"}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {allowed.map((t) => (
                <button key={`${t.to}-${t.commandType ?? "status"}`} className="k6-pgbtn" onClick={() => setPending(t)} title={t.note}
                  style={t.highRisk ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}>
                  {t.label ?? `改为 ${STATUS_LABEL[t.to]}`}{t.highRisk ? " · 强确认" : ""}
                </button>
              ))}
              {allowed.length === 0 && <span className="k6-explain" style={{ flex: 1 }}>当前状态在此身份权限下无可执行的状态修改。</span>}
            </div>
            {gated.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {gated.map((t) => (
                  <button key={`${t.to}-${t.commandType ?? "status"}`} className="k6-pgbtn" disabled title={`需 ${ROLE_LABEL[t.role]} 权限`}>
                    {t.label ?? STATUS_LABEL[t.to]} · 需{ROLE_LABEL[t.role]}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="k6-pgbtn" onClick={copy}>{copied ? "已复制" : "复制设备 ID"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    {pending && <ManualOverrideModal device={d} transition={pending} operatorId={operator.id} operatorRole={operator.role} onClose={() => setPending(null)} />}
    </>
  );
}
