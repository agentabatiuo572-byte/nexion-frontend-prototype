"use client";

// audit-ok:hydration —— K6 client-only(console-shell mount 门内渲染,无 SSR 水合);janus-c2 persist 走 localStorage 同步水合,无时序错位。

/**
 * K6 策略中心(SPEC 3 · PRD §6 / §14)。策略内容编辑与生命周期动作分离。
 * 列表展示全部策略(状态/版本/优先级/负责人/动作),支持新建 / 编辑 / 复制 / 发布 / 暂停 / 归档 / 删除。
 * viewer 角色只读;删除走二次确认;所有写动作落 A2 审计(store)。规则编辑器 = SPEC 4 高级模式。
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { canHardDeleteStrategy, effectiveDevices, isK6ContractMockEnabled, useJanusC2Store } from "@/lib/store/admin/janus-c2-store";
import { blankStrategy } from "@/lib/mock/admin/janus-c2/strategies";
import {
  ACTION_TYPE_LABEL,
  POLICY_APPLY_STATUS_LABEL,
  POLICY_COMPILE_STATUS_LABEL,
  STRATEGY_STATUS_LABEL,
  STRATEGY_STATUS_TONE,
  channelLabel,
} from "@/lib/mock/admin/janus-c2/labels";
import { ROLE_ORDER } from "@/lib/mock/admin/janus-c2/transitions";
import type { Strategy, StrategyStatus } from "@/lib/mock/admin/janus-c2/types";
import { StrategyEditor } from "./strategy-editor";
import { VersionPanel } from "./version-panel";
import { PublishConfirm } from "./publish-confirm";
import { useK6Operator } from "./use-operator";

function scopeText(s: Strategy): string {
  const ch = s.scope.channels?.length ? `渠道 ${s.scope.channels.map((c) => channelLabel(c)).join("/")}` : "全部渠道";
  const inv = s.scope.inviteCodes?.length ? ` · 邀请码 ${s.scope.inviteCodes.join("/")}` : "";
  return ch + inv;
}
function guardText(s: Strategy): string {
  const g = s.safeguards;
  const parts: string[] = [];
  if (g.maxDailyRecommendations != null) parts.push(`日建议≤${g.maxDailyRecommendations}`);
  if (g.maxDailyHits != null) parts.push(`日命中≤${g.maxDailyHits}`);
  if (g.requireFreshReportMinutes != null) parts.push(`需${g.requireFreshReportMinutes}分内上报`);
  if (g.minDecisionIntervalHours != null) parts.push(`决策间隔≥${g.minDecisionIntervalHours}h`);
  return parts.length ? parts.join(" · ") : "无额外保护";
}

let newSeq = 0;

export function K6StrategyCenter() {
  const strategies = useJanusC2Store((s) => s.strategies);
  const overrides = useJanusC2Store((s) => s.overrides);
  const audit = useJanusC2Store((s) => s.audit);
  const policyBundles = useJanusC2Store((s) => s.policyBundles);
  const sandboxPolicyBundles = useJanusC2Store((s) => s.sandboxPolicyBundles);
  const sandboxPublishedBundleVersion = useJanusC2Store((s) => s.sandboxPublishedBundleVersion);
  const sandboxAppliedBundleVersion = useJanusC2Store((s) => s.sandboxAppliedBundleVersion);
  const decisionSnapshots = useJanusC2Store((s) => s.decisionSnapshots);
  const publishedBundleVersion = useJanusC2Store((s) => s.publishedBundleVersion);
  const appliedBundleVersion = useJanusC2Store((s) => s.appliedBundleVersion);
  const setStatus = useJanusC2Store((s) => s.setStrategyStatus);
  const del = useJanusC2Store((s) => s.deleteStrategy);
  const dup = useJanusC2Store((s) => s.duplicateStrategy);
  const simulatePolicyReceipt = useJanusC2Store((s) => s.simulatePolicyReceipt);
  const operator = useK6Operator();
  const contractMockEnabled = isK6ContractMockEnabled();
  // PRD §15:编辑 / 新建草稿策略需高级运营+;发布策略需管理员。
  const canWrite = ROLE_ORDER[operator.role] >= ROLE_ORDER.senior_operator;
  const canPublish = operator.role === "admin";
  const canPause = ROLE_ORDER[operator.role] >= ROLE_ORDER.senior_operator;
  const [editing, setEditing] = useState<{ strategy: Strategy; isNew: boolean } | null>(null);
  const [versioning, setVersioning] = useState<Strategy | null>(null);
  const [publishing, setPublishing] = useState<Strategy | null>(null);
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<{ strategy: Strategy; status: StrategyStatus } | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleImpact, setLifecycleImpact] = useState("");
  const publishedBundle = policyBundles.find((bundle) => bundle.bundleVersion === publishedBundleVersion);
  const appliedBundle = policyBundles.find((bundle) => bundle.bundleVersion === appliedBundleVersion);
  const sandboxPublishedBundle = sandboxPolicyBundles.find((bundle) => bundle.bundleVersion === sandboxPublishedBundleVersion);
  const devices = effectiveDevices(overrides);

  const newStrategy = () => {
    const at = Date.now();
    setEditing({ strategy: blankStrategy(`strat_${at.toString(36)}_${(newSeq += 1)}`, operator.id, at), isNew: true });
  };

  return (
    <div className="k6-panel">
      <div className="k6-sec-head">
        <div><div className="k6-kicker">策略中心</div><h3>多策略管理</h3><p>新建、编辑策略内容;发布、暂停、归档由独立生命周期动作完成并留痕。</p></div>
        {canWrite
          ? <button className="k6-ovr-confirm" style={{ minHeight: 36 }} onClick={newStrategy}><Plus size={15} aria-hidden style={{ marginRight: 5 }} />新建策略</button>
          : <span className="k6-bdg dim">只读身份</span>}
      </div>
      <div className="k6-body">
        <div className="k6-ovr-brief" style={{ marginBottom: 14 }}>
          <div className="k6-strat-top">
            <b>全局原子 PolicyBundle</b>
            <span className="k6-bdg warning">已发布 v{publishedBundleVersion ?? "—"} · {publishedBundle ? POLICY_COMPILE_STATUS_LABEL[publishedBundle.compileStatus] : "—"} · {publishedBundle ? POLICY_APPLY_STATUS_LABEL[publishedBundle.applyStatus] : "—"}</span>
            <span className="k6-bdg good">设备判定仍读已应用 v{appliedBundleVersion ?? "—"} · {appliedBundle?.entries.length ?? 0} 条策略</span>
          </div>
          <p>策略内容版本与包版本相互独立；新包编译、应用成功前，旧已应用包继续参与判定。回执显式绑定包版本，迟到回执只进历史。</p>
          {canPublish && contractMockEnabled && sandboxPublishedBundle && <div className="k6-strat-actions">
            <span className="k6-bdg dim">DEV 沙盒 · 发布 v{sandboxPublishedBundleVersion ?? "—"} · 应用 v{sandboxAppliedBundleVersion ?? "—"}</span>
            {["PENDING", "FAILED"].includes(sandboxPublishedBundle.compileStatus) && <>
              <button className="k6-pgbtn" onClick={() => simulatePolicyReceipt(sandboxPublishedBundle.bundleVersion, "compile", "succeeded", operator.id, operator.role)}>沙盒回执 · v{sandboxPublishedBundle.bundleVersion} 编译成功</button>
              <button className="k6-pgbtn" onClick={() => simulatePolicyReceipt(sandboxPublishedBundle.bundleVersion, "compile", "failed", operator.id, operator.role, "服务端编译器返回规则校验失败")}>沙盒回执 · 编译失败</button>
            </>}
            {sandboxPublishedBundle.compileStatus === "SUCCEEDED" && ["PENDING", "FAILED"].includes(sandboxPublishedBundle.applyStatus) && <>
              <button className="k6-pgbtn" onClick={() => simulatePolicyReceipt(sandboxPublishedBundle.bundleVersion, "apply", "succeeded", operator.id, operator.role)}>沙盒回执 · v{sandboxPublishedBundle.bundleVersion} 应用成功</button>
              <button className="k6-pgbtn" onClick={() => simulatePolicyReceipt(sandboxPublishedBundle.bundleVersion, "apply", "failed", operator.id, operator.role, "C2 适配器返回应用事务失败")}>沙盒回执 · 应用失败</button>
            </>}
            {sandboxPolicyBundles.length > 1 && <button className="k6-pgbtn" onClick={() => simulatePolicyReceipt(sandboxPolicyBundles[1].bundleVersion, "apply", "succeeded", operator.id, operator.role)}>沙盒迟到旧包 · 只留沙盒历史</button>}
          </div>}
        </div>
        <div className="k6-strat-list">
          {strategies.length === 0 && <div className="k6-empty-row">暂无策略,点「新建策略」从模板或空白创建。</div>}
          {strategies.map((s) => (
            <div key={s.strategyId} className="k6-strat-card">
              <div className="k6-strat-top">
                <div className="k6-strat-name">{s.name || "(未命名)"}<span className="k6-strat-ver">v{s.version}</span></div>
                <span className={`k6-bdg ${STRATEGY_STATUS_TONE[s.status]}`}>{STRATEGY_STATUS_LABEL[s.status]}</span>
                <span className="k6-bdg dim">优先级 {s.priority}</span>
                <span className="k6-bdg cyan">{ACTION_TYPE_LABEL[s.action.type]}</span>
              </div>
              <p className="k6-strat-desc">{s.description || "—"}</p>
              <div className="k6-strat-meta">负责人 {s.owner || "—"} · {scopeText(s)} · {guardText(s)}</div>
              <div className="k6-strat-meta">
                内容版本 v{s.version} · 最近纳入 PolicyBundle v{s.lastPublishedBundleVersion ?? "—"} · 纳入内容 v{s.publishedContentVersion ?? "—"}
              </div>

              {canWrite && (
                pendingDel === s.strategyId ? (
                  <div className="k6-strat-actions">
                    <span className="k6-strat-confirm">确认删除「{s.name}」?不可恢复。</span>
                    <button className="k6-pgbtn" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => { del(s.strategyId, operator.id, operator.role); setPendingDel(null); }}>确认删除</button>
                    <button className="k6-pgbtn" onClick={() => setPendingDel(null)}>取消</button>
                  </div>
                ) : (
                  <div className="k6-strat-actions">
                    <button className="k6-pgbtn" onClick={() => setEditing({ strategy: s, isNew: false })}>编辑</button>
                    <button className="k6-pgbtn" onClick={() => dup(s.strategyId, operator.id, operator.role)}>复制</button>
                    <button className="k6-pgbtn" onClick={() => setVersioning(s)}>版本{s.versions.length ? ` (${s.versions.length})` : ""}</button>
                    {canPublish && (s.status === "draft" || s.status === "paused") && <button className="k6-pgbtn" onClick={() => setPublishing(s)}>发布</button>}
                    {canPause && s.status === "active" && <button className="k6-pgbtn" onClick={() => { setLifecycle({ strategy: s, status: "paused" }); setLifecycleReason(""); setLifecycleImpact(""); }}>暂停</button>}
                    {canPublish && (s.status === "active" || s.status === "paused") && <button className="k6-pgbtn" onClick={() => { setLifecycle({ strategy: s, status: "archived" }); setLifecycleReason(""); setLifecycleImpact(""); }}>归档</button>}
                    {canPublish && canHardDeleteStrategy(s, policyBundles, devices, audit, strategies, decisionSnapshots) && <button className="k6-pgbtn" style={{ color: "var(--danger)" }} onClick={() => setPendingDel(s.strategyId)}>删除</button>}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {editing && <StrategyEditor initial={editing.strategy} isNew={editing.isNew} operatorId={operator.id} operatorRole={operator.role} onClose={() => setEditing(null)} />}
      {versioning && <VersionPanel strategy={versioning} operatorId={operator.id} operatorRole={operator.role} canRollback={canPublish} onClose={() => setVersioning(null)} />}
      {publishing && <PublishConfirm strategy={publishing} operatorId={operator.id} operatorRole={operator.role} onClose={() => setPublishing(null)} />}
      {lifecycle && (
        <div className="k6-modal-overlay" onClick={() => setLifecycle(null)}>
          <div className="k6c2 k6-modal k6-modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${lifecycle.status === "paused" ? "暂停" : "归档"}策略`}>
            <div className="k6-modal-head"><div className="ttl">{lifecycle.status === "paused" ? "暂停" : "归档"}策略 · {lifecycle.strategy.name}</div></div>
            <div className="k6-modal-body">
              <div className="k6-ovr-field"><label htmlFor="life-reason">原因<i>必填</i></label><textarea id="life-reason" className="k6-field" value={lifecycleReason} onChange={(e) => setLifecycleReason(e.target.value)} /></div>
              <div className="k6-ovr-field"><label htmlFor="life-impact">影响说明<i>必填</i></label><textarea id="life-impact" className="k6-field" value={lifecycleImpact} onChange={(e) => setLifecycleImpact(e.target.value)} /></div>
            </div>
            <div className="k6-ovr-foot">
              <button className="k6-ovr-cancel" onClick={() => setLifecycle(null)}>取消</button>
              <button className="k6-ovr-confirm" disabled={lifecycleReason.trim().length < 4 || lifecycleImpact.trim().length < 4} onClick={() => {
                setStatus(lifecycle.strategy.strategyId, lifecycle.status, operator.id, operator.role, lifecycleReason.trim(), lifecycleImpact.trim());
                setLifecycle(null);
              }}>确认{lifecycle.status === "paused" ? "暂停" : "归档"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
