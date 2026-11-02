"use client";

import { useEffect, useMemo, useState } from "react";
import { effectiveDevices, effectiveRemoteTargets, useJanusC2Store } from "@/lib/store/admin/janus-c2-store";
import type { RemoteTarget } from "@/lib/mock/admin/janus-c2/types";
import { useK6Operator } from "./use-operator";

type PendingDisable = Pick<RemoteTarget, "remoteTargetKey" | "remoteTargetVersion" | "label">;

export function K6RemoteTargetManager() {
  const operator = useK6Operator();
  const [hasHydrated, setHasHydrated] = useState(false);
  const targetHistory = useJanusC2Store((s) => s.remoteTargets);
  const catalogVersion = useJanusC2Store((s) => s.catalogVersion);
  const strategies = useJanusC2Store((s) => s.strategies);
  const overrides = useJanusC2Store((s) => s.overrides);
  const saveVersion = useJanusC2Store((s) => s.saveRemoteTargetVersion);
  const disable = useJanusC2Store((s) => s.disableRemoteTarget);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("https://");
  const [owner, setOwner] = useState("");
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState("");
  const [pendingDisable, setPendingDisable] = useState<PendingDisable | null>(null);
  const canAdmin = operator.role === "admin";
  const targets = useMemo(() => effectiveRemoteTargets(targetHistory), [targetHistory]);
  const devices = useMemo(() => effectiveDevices(overrides), [overrides]);
  const valid = key.trim().length >= 2 && label.trim().length >= 2 && owner.trim().length >= 2 && url.startsWith("https://") && reason.trim().length >= 4 && impact.trim().length >= 4;

  useEffect(() => {
    setHasHydrated(useJanusC2Store.persist.hasHydrated());
    return useJanusC2Store.persist.onFinishHydration(() => setHasHydrated(true));
  }, []);

  const impacts = useMemo(() => new Map(targets.map((target) => {
    const strategyCount = strategies.filter((s) => s.action.remoteTargetKey === target.remoteTargetKey && s.action.remoteTargetVersion === target.remoteTargetVersion).length;
    const pendingCount = devices.filter((device) => device.takeover.phase === "COMMAND_PENDING_ACK" && device.takeover.currentCommand?.remoteTargetKey === target.remoteTargetKey && device.takeover.currentCommand.remoteTargetVersion === target.remoteTargetVersion).length;
    return [`${target.remoteTargetKey}:${target.remoteTargetVersion}`, { strategyCount, pendingCount }];
  })), [targets, strategies, devices]);

  const startVersion = (target?: RemoteTarget) => {
    setKey(target?.remoteTargetKey ?? ""); setLabel(target?.label ?? ""); setUrl(target?.url ?? "https://"); setOwner(target?.ownerId ?? ""); setReason(""); setImpact("");
  };

  const submit = () => {
    if (!valid) return;
    saveVersion(key.trim(), label.trim(), url.trim(), owner.trim(), reason.trim(), impact.trim(), operator.id, operator.role);
    startVersion();
  };

  if (!hasHydrated) {
    return <div className="k6-panel"><div className="k6-body"><div className="k6-explain">正在读取批准目标目录…</div></div></div>;
  }

  return (
    <div className="k6-panel">
      <div className="k6-sec-head">
        <div><div className="k6-kicker">批准目标目录</div><h3>RemoteTarget 版本管理</h3><p>这是 K6 本地产品契约原型，不会请求 Janus。换 URL 必须新建版本，不能改写历史 URL。</p></div>
        <span className="k6-bdg cyan">目录 v{catalogVersion}</span>
      </div>
      <div className="k6-body">
        {canAdmin ? <div className="k6-ovr-brief" style={{ marginBottom: 14 }}>
          <h4>新增目标 / 新建版本 / 换 URL</h4>
          <div className="k6-form-row">
            <div className="k6-ovr-field"><label htmlFor="rt-key">目标键<i>必填</i></label><input id="rt-key" className="k6-field" value={key} onChange={(e) => setKey(e.target.value)} placeholder="如 finance-main" /></div>
            <div className="k6-ovr-field"><label htmlFor="rt-label">运营名称<i>必填</i></label><input id="rt-label" className="k6-field" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            <div className="k6-ovr-field"><label htmlFor="rt-owner">负责人<i>必填</i></label><input id="rt-owner" className="k6-field" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
          </div>
          <div className="k6-ovr-field"><label htmlFor="rt-url">HTTPS 地址<i>必填</i></label><input id="rt-url" className="k6-field" type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <div className="k6-form-row">
            <div className="k6-ovr-field"><label htmlFor="rt-reason">变更原因<i>至少 4 字</i></label><textarea id="rt-reason" className="k6-field" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="k6-ovr-field"><label htmlFor="rt-impact">影响确认<i>至少 4 字</i></label><textarea id="rt-impact" className="k6-field" value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="说明受影响策略、命令与迁移安排" /></div>
          </div>
          <button className="k6-ovr-confirm" disabled={!valid} onClick={submit}>确认新建不可变版本</button>
        </div> : <div className="k6-explain" style={{ marginBottom: 14 }}>当前身份只读；只有管理员可新增版本、换 URL 或停用目标。</div>}

        <div className="k6-strat-list">
          {[...targets].sort((a, b) => b.catalogVersion - a.catalogVersion || b.remoteTargetVersion - a.remoteTargetVersion).map((target) => {
            const targetImpact = impacts.get(`${target.remoteTargetKey}:${target.remoteTargetVersion}`) ?? { strategyCount: 0, pendingCount: 0 };
            return <div className="k6-strat-card" key={`${target.remoteTargetKey}:${target.remoteTargetVersion}`}>
              <div className="k6-strat-top"><b>{target.label}</b><span className={`k6-bdg ${target.status === "active" ? "good" : "dim"}`}>{target.status === "active" ? "可用" : "已停用"}</span><span className="k6-bdg dim">目标 v{target.remoteTargetVersion} · 目录 v{target.catalogVersion}</span></div>
              <div className="k6-strat-meta">键 {target.remoteTargetKey} · 负责人 {target.ownerId} · 来源 {target.source === "seed" ? "系统种子" : "管理员"} · {target.updatedBy} 更新</div>
              <div className="k6-strat-meta">URL {target.url}</div>
              <div className="k6-strat-meta">影响：{targetImpact.strategyCount} 条策略 · {targetImpact.pendingCount} 条未领取命令</div>
              {canAdmin && <div className="k6-strat-actions">
                <button className="k6-pgbtn" onClick={() => startVersion(target)}>以此新建版本 / 换 URL</button>
                {target.status === "active" && <button className="k6-pgbtn" style={{ color: "var(--danger)" }} onClick={() => { setPendingDisable(target); setReason(""); setImpact(""); }}>停用</button>}
              </div>}
            </div>;
          })}
        </div>
      </div>

      {pendingDisable && <div className="k6-modal-overlay" onClick={() => setPendingDisable(null)}>
        <div className="k6c2 k6-modal k6-modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="停用批准目标">
          <div className="k6-modal-head"><div className="ttl">停用 {pendingDisable.label} · v{pendingDisable.remoteTargetVersion}</div></div>
          <div className="k6-modal-body">
            <div className="k6-ovr-warn">停用会取消引用该版本且尚未领取的命令；已领取或历史命令只保留追溯，不冒充设备已撤销。</div>
            <div className="k6-ovr-field"><label htmlFor="rt-disable-reason">停用原因<i>必填</i></label><textarea id="rt-disable-reason" className="k6-field" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="k6-ovr-field"><label htmlFor="rt-disable-impact">影响确认<i>必填</i></label><textarea id="rt-disable-impact" className="k6-field" value={impact} onChange={(e) => setImpact(e.target.value)} /></div>
          </div>
          <div className="k6-ovr-foot"><button className="k6-ovr-cancel" onClick={() => setPendingDisable(null)}>取消</button><button className="k6-ovr-confirm" disabled={reason.trim().length < 4 || impact.trim().length < 4} onClick={() => { disable(pendingDisable.remoteTargetKey, pendingDisable.remoteTargetVersion, reason, impact, operator.id, operator.role); setPendingDisable(null); }}>确认停用并写入审计</button></div>
        </div>
      </div>}
    </div>
  );
}
