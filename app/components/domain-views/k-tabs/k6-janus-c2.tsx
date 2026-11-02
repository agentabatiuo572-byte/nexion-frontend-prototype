"use client";

/**
 * K6 Janus C2 控制台 — 壳 + 5 个已接入 tab(看板 / 设备队列 / 策略中心 / 批准目标 / 审计日志)。
 * 设计稿(Janus C2 控制台 v3)视觉基础 + PRD v1.0 富模型;mock 驱动,backend-replaceable。
 * SPEC 0/1/3/5 已组合接入；批准目标管理承接版本化 RemoteTarget 原型契约。
 */
import { useState } from "react";
import "./k6-janus-c2.css";
import { K6Dashboard } from "./k6/dashboard";
import { K6Queue } from "./k6/queue";
import { K6StrategyCenter } from "./k6/strategy-center";
import { K6AuditLog } from "./k6/audit-log";
import { K6RemoteTargetManager } from "./k6/remote-target-manager";

type Tab = "dashboard" | "queue" | "strategy" | "targets" | "audit";

const TABS: { id: Tab; name: string; n: string }[] = [
  { id: "dashboard", name: "看板", n: "01" },
  { id: "queue", name: "设备队列", n: "02" },
  { id: "strategy", name: "策略中心", n: "03" },
  { id: "targets", name: "批准目标", n: "04" },
  { id: "audit", name: "审计日志", n: "05" },
];

export function K6JanusC2() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="k6c2">
      <nav className="k6-tabs" aria-label="C2 控制台模块">
        {TABS.map((t) => (
          <button key={t.id} className={`k6-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
            <span className="k6-tab-n">{t.n}</span>
            {t.name}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <K6Dashboard />}
      {tab === "queue" && <K6Queue />}
      {tab === "strategy" && <K6StrategyCenter />}
      {tab === "targets" && <K6RemoteTargetManager />}
      {tab === "audit" && <K6AuditLog />}
    </div>
  );
}
