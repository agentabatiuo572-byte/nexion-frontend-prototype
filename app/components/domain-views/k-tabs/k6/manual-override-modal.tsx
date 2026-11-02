"use client";

// audit-ok:hydration —— K6 client-only(console-shell mount 门内渲染,无 SSR 水合);janus-c2 persist 走 localStorage 同步水合,无时序错位。

/**
 * K6 手动状态修改弹窗(SPEC 2 · PRD §9.2)。
 * 🔴 多字段表单,每值独立字段;枚举值(原因分类/生效时机/过期/远程地址)一律下拉,禁单框多值。
 * 原因必填 ≥8 字;高风险需单人强确认;提交只创建 C2 意图与审计投影,不伪装设备已执行。
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { effectiveRemoteTargets, impactScopeFor, useJanusC2Store, type OverrideForm } from "@/lib/store/admin/janus-c2-store";
import { EFFECTIVE_TIMING_LABEL, REASON_CATEGORIES, STATUS_LABEL, STATUS_TONE } from "@/lib/mock/admin/janus-c2/labels";
import type { Device, EffectiveTiming, Role } from "@/lib/mock/admin/janus-c2/types";
import type { Transition } from "@/lib/mock/admin/janus-c2/transitions";

const EXPIRE_OPTIONS: [number, string][] = [[1, "1 小时"], [2, "2 小时"], [6, "6 小时"], [24, "24 小时"]];

export function ManualOverrideModal({ device, transition: t, operatorId, operatorRole, onClose }: {
  device: Device; transition: Transition; operatorId: string; operatorRole: Role; onClose: () => void;
}) {
  const apply = useJanusC2Store((s) => s.applyOverride);
  const remoteTargetHistory = useJanusC2Store((s) => s.remoteTargets);
  const remoteTargets = useMemo(() => effectiveRemoteTargets(remoteTargetHistory), [remoteTargetHistory]);
  const [reasonCategory, setReasonCategory] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [effectiveTiming, setEffectiveTiming] = useState<EffectiveTiming>("session_edge");
  const [expireHours, setExpireHours] = useState(2);
  const [remoteTargetSelection, setRemoteTargetSelection] = useState("default:7");
  const [strong, setStrong] = useState(false);
  const [reviewedTakeover, setReviewedTakeover] = useState(false);
  const [reviewedActor, setReviewedActor] = useState(false);
  const [reviewedSession, setReviewedSession] = useState(false);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reasonOk = reasonText.trim().length >= 8;
  const selectedTarget = remoteTargets.find((x) => `${x.remoteTargetKey}:${x.remoteTargetVersion}` === remoteTargetSelection && x.status === "active");
  const needsStrong = !!t.strong || (!!t.commandType && effectiveTiming === "immediate");
  const impactOk = !t.commandType || (reviewedTakeover && reviewedActor && reviewedSession);
  const valid = !!reasonCategory && reasonOk && (!t.needsRemoteUrl || selectedTarget?.status === "active") && (!needsStrong || strong) && impactOk;

  const confirm = () => {
    if (!valid) return;
    const acknowledgedAt = Date.now();
    const acknowledgedTargetKey = t.needsRemoteUrl ? selectedTarget?.remoteTargetKey : device.takeover.desiredRemoteTargetKey ?? device.takeover.appliedRemoteTargetKey;
    const acknowledgedTargetVersion = t.needsRemoteUrl ? selectedTarget?.remoteTargetVersion : device.takeover.desiredRemoteTargetVersion ?? device.takeover.appliedRemoteTargetVersion;
    const form: OverrideForm = {
      reasonCategory,
      reasonText: reasonText.trim(),
      effectiveTiming,
      expireAt: t.needsExpire ? Date.now() + expireHours * 3600_000 : undefined,
      remoteTargetKey: t.needsRemoteUrl ? selectedTarget?.remoteTargetKey : undefined,
      remoteTargetVersion: t.needsRemoteUrl ? selectedTarget?.remoteTargetVersion : undefined,
      confirmationMode: needsStrong ? "strong_single" : "standard",
      impactAcknowledgement: t.commandType && impactOk ? {
        acknowledgementId: `IMP-${device.deviceId}-${acknowledgedAt.toString(36).toUpperCase()}`,
        deviceId: device.deviceId,
        sessionId: device.latestSessionId,
        observedDesiredCommandVersion: device.takeover.commandVersion,
        observedAppliedCommandVersion: device.takeover.appliedCommandVersion,
        observedAccountLeaseState: device.takeover.actorState,
        observedActorLeaseId: device.takeover.appliedLease?.actorLeaseId ?? device.takeover.pendingHandoff?.actorLeaseId,
        remoteTargetKey: acknowledgedTargetKey,
        remoteTargetVersion: acknowledgedTargetVersion,
        impactScope: impactScopeFor(t.transitionId, effectiveTiming),
        acknowledgedAt,
        expiresAt: acknowledgedAt + 5 * 60_000,
      } : undefined,
    };
    apply(device, t.transitionId, form, operatorId, operatorRole);
    onClose();
  };

  return (
    <div className="k6-modal-overlay" onClick={onClose}>
      <div className="k6c2 k6-modal k6-ovr" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="手动状态修改">
        <div className="k6-modal-head">
          <div className="ttl">
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>手动状态修改</span>
            <span className={`k6-bdg ${STATUS_TONE[t.to]}`}>{STATUS_LABEL[t.to]}</span>
          </div>
          <button className="k6-modal-close" onClick={onClose} aria-label="关闭"><X size={18} aria-hidden /></button>
        </div>

        <div className="k6-modal-body">
          <div className="k6-ovr-brief">
            <div className="k6-ovr-flow">
              <span className={`k6-bdg ${STATUS_TONE[device.status]}`}>{STATUS_LABEL[device.status]}</span>
              <span className="arr" aria-hidden>→</span>
              <span className={`k6-bdg ${STATUS_TONE[t.to]}`}>{STATUS_LABEL[t.to]}</span>
              <code className="sid">{device.deviceId}</code>
            </div>
            <p>{t.note}</p>
          </div>

          {t.highRisk && (
            <div className="k6-ovr-warn">
              <AlertTriangle size={16} aria-hidden />
              <span>高风险动作 · 单人强确认 · 不可批量 · 完整记录设备、意图、实态与执行阶段。</span>
            </div>
          )}

          <div className="k6-ovr-field">
            <label htmlFor="ovr-cat">原因分类<i>必填</i></label>
            <select id="ovr-cat" className="k6-field" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)}>
              <option value="">请选择原因分类</option>
              {REASON_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="k6-ovr-field">
            <label htmlFor="ovr-reason">详细原因<i className={reasonOk ? "ok" : ""}>{reasonOk ? "已满足" : "必填 · 至少 8 字"}</i></label>
            <textarea id="ovr-reason" className="k6-field k6-ovr-textarea" value={reasonText} onChange={(e) => setReasonText(e.target.value)}
              placeholder="写清场景与依据,如:已知合作设备 / 客诉线索跟进 / 现场演示需要…" />
          </div>

          <div className="k6-ovr-field">
            <label htmlFor="ovr-timing">生效时机</label>
            <select id="ovr-timing" className="k6-field" value={effectiveTiming} onChange={(e) => setEffectiveTiming(e.target.value as EffectiveTiming)}>
              <option value="session_edge">{EFFECTIVE_TIMING_LABEL.session_edge}(体验更平滑)</option>
              <option value="immediate">{EFFECTIVE_TIMING_LABEL.immediate}</option>
            </select>
          </div>

          {t.needsExpire && (
            <div className="k6-ovr-field">
              <label htmlFor="ovr-expire">挂起过期时间</label>
              <select id="ovr-expire" className="k6-field" value={expireHours} onChange={(e) => setExpireHours(Number(e.target.value))}>
                {EXPIRE_OPTIONS.map(([h, l]) => <option key={h} value={h}>{l}后恢复策略评估</option>)}
              </select>
            </div>
          )}

          {t.needsRemoteUrl && (
            <div className="k6-ovr-field">
              <label htmlFor="ovr-url">批准接管目标<i>必填</i></label>
              <select id="ovr-url" className="k6-field" value={remoteTargetSelection} onChange={(e) => setRemoteTargetSelection(e.target.value)}>
                {remoteTargets.map((r) => <option key={`${r.remoteTargetKey}-${r.remoteTargetVersion}`} value={`${r.remoteTargetKey}:${r.remoteTargetVersion}`} disabled={r.status === "disabled"}>{r.label} · v{r.remoteTargetVersion}{r.status === "disabled" ? "(已停用)" : ""}</option>)}
              </select>
            </div>
          )}

          {t.commandType && (
            <fieldset className="k6-ovr-field">
              <legend>命令影响确认<i>三项必选</i></legend>
              <label className="k6-ovr-strong"><input type="checkbox" checked={reviewedTakeover} onChange={(e) => setReviewedTakeover(e.target.checked)} /><span>已核对设备当前接管意图、实际目标与待处理命令。</span></label>
              <label className="k6-ovr-strong"><input type="checkbox" checked={reviewedActor} onChange={(e) => setReviewedActor(e.target.checked)} /><span>已核对白壳与远程账户 actor、租约及交接状态。</span></label>
              <label className="k6-ovr-strong"><input type="checkbox" checked={reviewedSession} onChange={(e) => setReviewedSession(e.target.checked)} /><span>已核对立即或会话边界生效对当前会话的影响。</span></label>
            </fieldset>
          )}

          {needsStrong && (
            <label className="k6-ovr-strong">
              <input type="checkbox" checked={strong} onChange={(e) => setStrong(e.target.checked)} />
              <span>我确认这是高风险单人操作,已核对设备身份与处置依据。</span>
            </label>
          )}
        </div>

        <div className="k6-ovr-foot">
          <button className="k6-ovr-cancel" onClick={onClose}>取消</button>
          <button className="k6-ovr-confirm" disabled={!valid} onClick={confirm}>确认提交意图</button>
        </div>
      </div>
    </div>
  );
}
