"use client";

// audit-ok:hydration —— K6 client-only(console-shell mount 门内渲染,无 SSR 水合);janus-c2 persist 走 localStorage 同步水合,无时序错位。

/**
 * K6 看板(总览)— Janus C2 控制台 v3 设计稿总览 port + PRD §5.2 / §20.2 漏斗。
 * 全部从 mock 设备 + C2 已应用策略派生(只读);发布待应用不得冒充在线生效。
 */
import { useMemo } from "react";
import { Boxes, Signal, Zap, Target, HeartPulse, ArrowRight, Download } from "lucide-react";
import { effectiveDevices, useJanusC2Store } from "@/lib/store/admin/janus-c2-store";
import { primaryActiveStrategy } from "@/lib/mock/admin/janus-c2/strategies";
import { summarize, timeAgo } from "@/lib/mock/admin/janus-c2/scoring";
import { computeHealth } from "@/lib/mock/admin/janus-c2/health";
import { ACTION_TYPE_LABEL, HEALTH_LEVEL_LABEL, remoteUrlLabel } from "@/lib/mock/admin/janus-c2/labels";
import type { Device, HealthLevel } from "@/lib/mock/admin/janus-c2/types";
import { useK6Operator } from "./use-operator";

const AUDIT_TARGET: Record<string, string> = { device: "设备", strategy: "策略", config: "配置" };

const pct = (n: number, total: number): number => (total ? Math.round((n / total) * 100) : 0);

const LEVEL_COLOR: Record<HealthLevel, string> = { HEALTHY: "var(--success)", WARNING: "var(--warning)", RISK: "var(--warning)", CRITICAL: "var(--danger)" };

function downloadFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

interface Seg {
  key: string;
  label: string;
  count: number;
  color: string;
}

function composition(devices: Device[]): Seg[] {
  const has = (pred: (d: Device) => boolean): number => devices.filter(pred).length;
  return [
    // 执行阶段优先分桶,避免把命中、命令发出与成功合并。
    { key: "success", label: "接管成功", count: has((d) => d.takeover.phase === "SUCCEEDED"), color: "var(--success)" },
    { key: "loading", label: "加载 / 账户交接中", count: has((d) => ["RECEIVED", "LOADING", "HANDOFF_FETCHING", "HANDOFF_MERGING", "HANDOFF_ACKED"].includes(d.takeover.phase)), color: "var(--cyan)" },
    { key: "command", label: "接管命令待确认", count: has((d) => d.takeover.phase === "COMMAND_PENDING_ACK"), color: "var(--warning)" },
    { key: "hit", label: "命中未发命令", count: has((d) => d.takeover.phase === "HIT_NOT_REQUESTED"), color: "var(--brand)" },
    { key: "failed", label: "接管失败", count: has((d) => d.takeover.phase === "FAILED"), color: "var(--danger)" },
    { key: "revoke", label: "撤销待确认", count: has((d) => d.takeover.phase === "REVOKE_PENDING_ACK"), color: "var(--warning)" },
    { key: "revoked", label: "撤销完成", count: has((d) => d.takeover.phase === "REVOKED"), color: "var(--ink-4)" },
    { key: "recommend", label: "建议下发", count: has((d) => d.takeover.phase === "NONE" && d.status === "RECOMMENDED"), color: "var(--warning)" },
    { key: "observe", label: "观察 / 新设备", count: has((d) => d.takeover.phase === "NONE" && (d.status === "OBSERVING" || d.status === "NEW")), color: "var(--cyan)" },
    { key: "filtered", label: "环境过滤", count: has((d) => d.takeover.phase === "NONE" && d.status === "ENV_FILTERED"), color: "var(--danger)" },
    { key: "other", label: "挂起 / 禁止 / 其他", count: has((d) => d.takeover.phase === "NONE" && !["RECOMMENDED", "OBSERVING", "NEW", "ENV_FILTERED"].includes(d.status)), color: "var(--ink-4)" },
  ].filter((s) => s.count > 0);
}

function Pipe({ audience, trigger, timing, target }: { audience: string; trigger: string; timing: string; target: string }) {
  return (
    <div className="k6-pipe" aria-label="当前策略管线">
      <div className="k6-pipe-cell"><span>对象</span><b>{audience}</b></div>
      <ArrowRight className="k6-pipe-arrow" size={16} aria-hidden />
      <div className="k6-pipe-cell"><span>触发</span><b>{trigger}</b></div>
      <ArrowRight className="k6-pipe-arrow" size={16} aria-hidden />
      <div className="k6-pipe-cell"><span>接管</span><b>{timing}</b></div>
      <ArrowRight className="k6-pipe-arrow" size={16} aria-hidden />
      <div className="k6-pipe-cell target"><span>目标</span><b>{target}</b></div>
    </div>
  );
}

export function K6Dashboard() {
  const overrides = useJanusC2Store((s) => s.overrides);
  const strategies = useJanusC2Store((s) => s.strategies);
  const policyBundles = useJanusC2Store((s) => s.policyBundles);
  const appliedBundleVersion = useJanusC2Store((s) => s.appliedBundleVersion);
  const remoteTargets = useJanusC2Store((s) => s.remoteTargets);
  const devices = useMemo(() => effectiveDevices(overrides), [overrides]);
  const sum = useMemo(() => summarize(devices), [devices]);
  const segs = useMemo(() => composition(devices), [devices]);
  const appliedBundle = policyBundles.find((bundle) => bundle.bundleVersion === appliedBundleVersion);
  const strat = primaryActiveStrategy(strategies, appliedBundle);
  const audit = useJanusC2Store((s) => s.audit);
  const recordExport = useJanusC2Store((s) => s.recordExport);
  const operator = useK6Operator();
  const health = useMemo(() => computeHealth(devices, strategies, audit, appliedBundle), [devices, strategies, audit, appliedBundle]);
  const total = devices.length || 1;
  const abnormalCount = health.indicators.filter((i) => i.level !== "HEALTHY").length;
  // 待处理动作队列(PRD §5.2):四类需运营介入的设备计数。
  const hitPending = devices.filter((d) => d.takeover.phase === "HIT_NOT_REQUESTED").length;
  const stalePending = devices.filter((d) => d.status === "STALE").length;

  const nextTitle = sum.failed ? "下一步:处理接管失败" : sum.commandPending || sum.revokePending ? "下一步:核查待确认命令" : sum.recommended ? "下一步:处理建议下发队列" : "下一步:等待设备进入建议队列";
  const nextCopy = sum.failed
    ? `当前有 ${sum.failed} 台设备接管失败。先核对失败原因,不要把失败记录当成已接管。`
    : sum.commandPending || sum.revokePending
      ? `当前有 ${sum.commandPending} 条接管命令、${sum.revokePending} 条撤销命令等待设备确认;确认前实际态保持不变。`
    : sum.recommended
    ? `当前有 ${sum.recommended} 台设备建议下发。优先处理优先级最高的设备,从设备队列进入详情确认接管。`
    : "暂无建议下发设备。保持当前策略,不要强行处理低成熟度会话,继续累计行为信号。";

  // 接管执行阶段快照:这些是互相独立的当前阶段,不是把命中累计成成功。
  const funnel = [
    { label: "总设备", n: sum.totalDevices },
    { label: "在线活跃", n: sum.activeDevices },
    { label: "建议下发", n: sum.recommended },
    { label: "命中未发命令", n: hitPending },
    { label: "命令待确认", n: sum.commandPending },
    { label: "加载中", n: sum.loading },
    { label: "接管成功", n: sum.activated },
    { label: "接管失败", n: sum.failed },
    { label: "撤销待确认", n: sum.revokePending },
    { label: "撤销完成", n: sum.revoked },
  ];
  const funnelMax = Math.max(...funnel.map((f) => f.n), 1);

  // 报表导出(PRD §20):漏斗 + 健康指标 → CSV / JSON。
  const reportCsv = (): string => {
    const rows: string[][] = [["分类", "指标", "数值"]];
    funnel.forEach((f) => rows.push(["命中漏斗", f.label, String(f.n)]));
    health.indicators.forEach((i) => rows.push(["健康度", i.label, i.value]));
    const esc = (c: string): string => `"${c.replace(/"/g, '""')}"`;
    return rows.map((r) => r.map(esc).join(",")).join("\n");
  };
  const reportJson = (): string => JSON.stringify({ devices: sum.totalDevices, summary: sum, funnel, health }, null, 2);

  return (
    <div>
      {/* 下一步动作 */}
      <div className="k6-command">
        <div className="k6-cmd-kicker">下一步 · 决策建议</div>
        <div className="k6-cmd-title">{nextTitle}</div>
        <div className="k6-cmd-copy">{nextCopy}</div>
        <div className="k6-pending" aria-label="待处理动作队列">
          <div className="k6-pending-chip"><b>{sum.recommended}</b><span>建议待确认</span></div>
          <div className="k6-pending-chip"><b>{hitPending}</b><span>命中未发命令</span></div>
          <div className="k6-pending-chip"><b>{sum.commandPending}</b><span>接管命令待确认</span></div>
          <div className="k6-pending-chip"><b>{sum.loading}</b><span>远程页面加载中</span></div>
          <div className="k6-pending-chip"><b>{sum.failed}</b><span>接管失败</span></div>
          <div className="k6-pending-chip"><b>{sum.revokePending}</b><span>撤销待确认</span></div>
          <div className="k6-pending-chip"><b>{sum.envFiltered}</b><span>过滤待核查</span></div>
          <div className="k6-pending-chip"><b>{stalePending}</b><span>过期未上报</span></div>
        </div>
      </div>

      {/* 指标 */}
      <div className="k6-metrics">
        <div className="k6-metric">
          <div className="k6-metric-head"><span className="k6-metric-k">设备总数</span><span className="k6-metric-ico"><Boxes size={18} aria-hidden /></span></div>
          <div><div className="k6-metric-v">{sum.totalDevices}</div><div className="k6-metric-note">当前快照设备</div></div>
        </div>
        <div className="k6-metric">
          <div className="k6-metric-head"><span className="k6-metric-k">在线设备</span><span className="k6-metric-ico"><Signal size={18} aria-hidden /></span></div>
          <div><div className="k6-metric-v">{sum.activeDevices}</div><div className="k6-metric-note">5 分钟内上报</div></div>
        </div>
        <div className="k6-metric accent">
          <div className="k6-metric-head"><span className="k6-metric-k">建议下发</span><span className="k6-metric-ico"><Zap size={18} aria-hidden /></span></div>
          <div><div className="k6-metric-v">{sum.recommended}</div><div className="k6-metric-note">真实且未激活</div></div>
        </div>
        <div className="k6-metric">
          <div className="k6-metric-head"><span className="k6-metric-k">命中未发命令占比</span><span className="k6-metric-ico"><Target size={18} aria-hidden /></span></div>
          <div><div className="k6-metric-v">{sum.hitRate}%</div><div className="k6-metric-note">HIT_NOT_REQUESTED / 设备总数</div></div>
        </div>
      </div>

      {/* 当前策略管线 */}
      {strat && (
        <div className="k6-panel">
          <div className="k6-sec-head">
            <div><div className="k6-kicker">C2 已应用策略</div><h3>{strat.name}</h3><p>{strat.description}</p></div>
            <span className="k6-bdg good">已应用 PolicyBundle v{appliedBundleVersion ?? "—"} · 内容 v{strat.version} · 优先级 {strat.priority}</span>
          </div>
          <div className="k6-body">
            <Pipe
              audience={strat.action.type === "ENV_FILTER" ? "所有会话" : "真实设备"}
              trigger={strat.scope.inviteCodes?.length ? "邀请码命中" : strat.ruleTree.mode === "WEIGHTED_SCORE" ? "加权评分达标" : "成熟度达标"}
              timing={ACTION_TYPE_LABEL[strat.action.type]}
              target={strat.action.remoteTargetKey ? `批准目标 · ${remoteUrlLabel(strat.action.remoteTargetKey, remoteTargets)} v${strat.action.remoteTargetVersion ?? "—"}` : "—"}
            />
          </div>
        </div>
      )}

      {/* 决策构成 */}
      <div className="k6-panel">
        <div className="k6-sec-head"><div><div className="k6-kicker">决策与执行构成</div><h3>设备阶段分布</h3><p>命中、命令待确认、加载、成功、失败与撤销均独立统计。</p></div><span className="k6-bdg dim">{sum.totalDevices} 条</span></div>
        <div className="k6-body">
          <div className="k6-stacked">
            {segs.map((s) => (<span key={s.key} className="k6-seg" style={{ width: `${pct(s.count, total)}%`, background: s.color }} />))}
          </div>
          <div className="k6-legend">
            {segs.map((s) => (
              <div key={s.key} className="k6-bar-row">
                <span className="k6-leg"><i style={{ background: s.color }} />{s.label}</span>
                <span className="k6-bar-ct">{s.count}</span>
                <span className="k6-bar-pct">{pct(s.count, total)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 策略健康度分级(§12)+ 报表导出(§20) */}
      <div className="k6-panel">
        <div className="k6-sec-head">
          <div><div className="k6-kicker">策略健康度</div><h3>多维健康分级</h3><p>覆盖率、命中率、过滤率、人工干预、策略冲突、回滚率等指标综合评级与下钻。</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            {operator.role !== "viewer" && <>
              <button className="k6-pgbtn" onClick={() => { if (recordExport("导出健康报表 CSV", operator.id, operator.role, { 格式: "CSV", 设备: sum.totalDevices, 健康度: HEALTH_LEVEL_LABEL[health.level] })) downloadFile("janus-report.csv", reportCsv(), "text/csv;charset=utf-8"); }}><Download size={14} aria-hidden style={{ marginRight: 4 }} />导出 CSV</button>
              <button className="k6-pgbtn" onClick={() => { if (recordExport("导出健康报表 JSON", operator.id, operator.role, { 格式: "JSON", 设备: sum.totalDevices, 健康度: HEALTH_LEVEL_LABEL[health.level] })) downloadFile("janus-report.json", reportJson(), "application/json"); }}>导出 JSON</button>
            </>}
          </div>
        </div>
        <div className="k6-body">
          <div className="k6-health-head">
            <span className="k6-health-dot" style={{ background: LEVEL_COLOR[health.level] }} />
            <div>
              <div className="k6-health-lv" style={{ color: LEVEL_COLOR[health.level] }}>{HEALTH_LEVEL_LABEL[health.level]}</div>
              <div className="k6-health-sub">{health.indicators.length} 项指标 · {abnormalCount ? `${abnormalCount} 项需关注` : "全部正常"}</div>
            </div>
            <HeartPulse size={18} aria-hidden style={{ color: "var(--ink-4)", marginLeft: "auto" }} />
          </div>
          <div className="k6-health-grid">
            {health.indicators.map((i) => (
              <div key={i.key} className="k6-health-cell">
                <div className="hk"><span className="k6-tone-dot" style={{ background: LEVEL_COLOR[i.level] }} />{i.label}</div>
                <div className="hv">{i.value}</div>
                <div className="hn">{i.note}</div>
              </div>
            ))}
          </div>
          {health.level !== "HEALTHY" && (
            <div className="k6-reasons">
              <h4>异常下钻与建议处理</h4>
              <ul>
                {health.reasons.map((r, idx) => <li key={`r${idx}`}>{r}</li>)}
                {health.suggestions.map((sug, idx) => <li key={`s${idx}`} className="sug">建议:{sug}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 接管执行阶段快照 */}
      <div className="k6-panel">
        <div className="k6-sec-head"><div><div className="k6-kicker">执行阶段</div><h3>接管执行快照</h3><p>当前各阶段独立计数;命中、发命令与成功不能互相替代。</p></div></div>
        <div className="k6-body">
          <div className="k6-funnel">
            {funnel.map((f) => (
              <div key={f.label} className="k6-funnel-row">
                <span className="fl">{f.label}</span>
                <span className="ft" style={{ width: `${Math.max(8, pct(f.n, funnelMax))}%` }}>{f.n}</span>
                <span className="fp">{pct(f.n, sum.totalDevices)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 最近审计(§5.2):看板速览近期关键动作,完整见审计日志页 */}
      {audit.length > 0 && (
        <div className="k6-panel">
          <div className="k6-sec-head"><div><div className="k6-kicker">最近审计</div><h3>近期关键动作</h3><p>最近的策略发布、手动状态下发、回滚与导出动作。完整记录见「审计日志」页。</p></div></div>
          <div className="k6-body">
            <div className="k6-recent-audit">
              {audit.slice(0, 5).map((a) => (
                <div key={a.auditId} className="k6-recent-row">
                  <span className={`k6-bdg ${a.targetType === "strategy" ? "cyan" : a.targetType === "config" ? "dim" : "good"}`}>{AUDIT_TARGET[a.targetType] ?? a.targetType}</span>
                  <span className="k6-recent-action">{a.action}</span>
                  <span className="k6-recent-meta">{a.actorId} · {timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
