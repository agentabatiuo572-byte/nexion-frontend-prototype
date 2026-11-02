"use client";

/**
 * H8 新人礼 & 邀请奖励 — 拉新两笔钱的金额与发放模式配置(2026-07-09 自 K2 迁入,K2 只留检测与拦截)。
 * 真渲染面(H ∈ PORTED_DOMAINS · registry content 死代码)。
 *
 * 单源:lib/mock/admin/compute-config.ts REWARD_RISK_PARAMS / INVITER_REWARD_PARAMS。
 * 持久键沿用 K.rewards.welcomeGift.* / K.rewards.inviterReward.*(服务器配置路径不随控制台 IA 挪动;
 * K1 簇详情、K2 拦截统计同键只读派生,改这里它们同步变)。
 * 与 uniapp rewards.welcomeGift / rewards.inviterReward 同构;落地页/me 页展示与实际入账从当前值派生,禁写死金额。
 * 升金额 = 放大获客成本流出 → amplifies 挂 B1 预检;发放模式 select 弹窗,金额 number 弹窗(显式 edit 契约)。
 */
import Link from "next/link";
import { Gift, UserPlus, Waypoints } from "lucide-react";
import {
  REWARD_RISK_PARAMS,
  rewardRiskParamKey,
  type RewardRiskParamDef,
  INVITER_REWARD_PARAMS,
  inviterRewardParamKey,
  type InviterRewardParamDef,
} from "@/lib/mock/admin/compute-config";
import type { HCtx } from "./types";

const GIFT_MODE_LABELS: Record<string, string> = { risk_bucket: "按风险桶发放", direct: "直入可提余额" };

export default function H8ReferralRewards({ ctx }: { ctx: HCtx }) {
  const giftParamValue = (key: RewardRiskParamDef["key"]) =>
    ctx.pget(rewardRiskParamKey(key)) ?? String(REWARD_RISK_PARAMS.find((p) => p.key === key)!.defaultVal);
  const inviterParamValue = (key: InviterRewardParamDef["key"]) =>
    ctx.pget(inviterRewardParamKey(key)) ?? String(INVITER_REWARD_PARAMS.find((p) => p.key === key)!.defaultVal);

  const giftUsd = giftParamValue("usdtAmount");
  const giftNex = Number(giftParamValue("nexAmount")) || 0;
  const inviterNex = Number(inviterParamValue("nexAmount")) || 0;
  const modeLabel = GIFT_MODE_LABELS[giftParamValue("lockMode")] ?? giftParamValue("lockMode");

  const adjGiftParam = (p: RewardRiskParamDef) => {
    if (p.key === "lockMode") {
      const backMap: Record<string, string> = { 按风险桶发放: "risk_bucket", 直入可提余额: "direct" };
      ctx.openActionConfirm({
        action: `新人礼发放配置 · ${p.label}`,
        detail: `${p.label} · 当前 ${modeLabel}。${p.desc}${p.frontendEffect} 切到「直入可提余额」= 放行方向,先核 B1 覆盖率 · 写入审计`,
        amplifies: true,
        edit: { kind: "select", current: modeLabel, options: Object.values(GIFT_MODE_LABELS) },
        run: (reason, newVal) => {
          const next = newVal ? backMap[newVal] : undefined;
          if (!next) return;
          ctx.setParam(rewardRiskParamKey(p.key), next, { action: `调整新人礼发放模式 → ${newVal}`, reason });
          ctx.toast("新人礼发放模式已更新 · 后续注册按新模式入账");
        },
      });
      return;
    }
    ctx.openActionConfirm({
      action: `新人礼发放配置 · ${p.label}`,
      detail: `${p.label} · 当前 ${giftParamValue(p.key)} ${p.unit}。${p.desc}${p.frontendEffect} 只影响后续发放,已发放的不回写 · 写入审计`,
      amplifies: true,
      edit: { kind: "number", current: giftParamValue(p.key), unit: p.unit, min: 0 },
      run: (reason, newVal) => {
        if (!newVal) return;
        ctx.setParam(rewardRiskParamKey(p.key), newVal, { action: `调整${p.label} → ${newVal} ${p.unit}`, reason });
        ctx.toast(`${p.label} 已更新 · 落地页展示与入账同步生效`);
      },
    });
  };

  const adjInviterParam = (p: InviterRewardParamDef) =>
    ctx.openActionConfirm({
      action: `邀请人奖励配置 · ${p.label}`,
      detail: `${p.label} · 当前 ${inviterParamValue(p.key)} ${p.unit}。${p.desc}${p.frontendEffect} 只影响后续邀请发放,已发放的不回写 · 写入审计`,
      amplifies: true,
      edit: { kind: "number", current: inviterParamValue(p.key), unit: p.unit, min: 0 },
      run: (reason, newVal) => {
        if (!newVal) return;
        ctx.setParam(inviterRewardParamKey(p.key), newVal, { action: `调整${p.label} → ${newVal} ${p.unit}`, reason });
        ctx.toast(`${p.label} 已更新 · 落地页展示与入账同步生效`);
      },
    });

  return (
    <div>
      {/* 当前口径一览 — 全部从参数派生,禁写死金额 */}
      <div className="f-stats">
        <div className="f-stat"><div className="k">新人礼(给被邀请人)</div><div className="v">${giftUsd} + {giftNex} NEX</div><div className="sub">注册礼包 · 每账号仅一次</div></div>
        <div className="f-stat"><div className="k">邀请人奖励(给邀请人)</div><div className="v">{inviterNex} NEX</div><div className="sub">每成功邀请一名新用户</div></div>
        <div className="f-stat cyan"><div className="k">发放模式</div><div className="v">{modeLabel}</div><div className="sub">新人礼入账口径</div></div>
        <div className="f-stat warn"><div className="k">单客拉新总支出</div><div className="v">${giftUsd} + {giftNex + inviterNex} NEX</div><div className="sub">两笔合计 · 升额过 B1 覆盖率</div></div>
      </div>

      {/* 新人礼发放配置(SPEC-7 · uniapp rewards.welcomeGift 同构) */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--admin-domain-h)" }}><Gift size={15} strokeWidth={2} aria-hidden />新人礼发放配置</span>
          <span className="sub">· 注册礼包发多少、怎么入账 —— 落地页展示、实际入账、K2 拦截统计都从这里取值</span>
          <div className="r"><span className="kcode electric" title="与前端 rewards.welcomeGift 配置同构,K2 发放拦截统计与此同口径">金额与模式单源</span></div>
        </div>
        <div className="l-b">
          <div className="param-grid" data-proof="h8-welcome-gift-params">
            {REWARD_RISK_PARAMS.map((p) => {
              const curV = ctx.pget(rewardRiskParamKey(p.key));
              const shown = p.key === "lockMode" ? modeLabel : giftParamValue(p.key);
              return (
                <div className="p" key={p.key}>
                  <div className="k">{p.label}</div>
                  <div className="v">
                    {shown}
                    {p.kind === "number" ? <span className="vu">{p.unit}</span> : null}
                    {curV ? <span className="vu">· 原 {p.key === "lockMode" ? GIFT_MODE_LABELS[String(p.defaultVal)] : p.defaultVal}</span> : null}
                    <button className="l-btn sm mc" onClick={() => adjGiftParam(p)} title={`PRD H8 welcomeGift.${p.key}`}>调整</button>
                  </div>
                  <div className="s">{p.desc}</div>
                </div>
              );
            })}
          </div>
          <div className="ktint" style={{ marginTop: 12, fontSize: 12 }}>
            <b>发放模式</b> · 按风险桶发放 = 新人礼跟随账户当前风险桶,同簇多号进「审核中 / 锁定奖励」;直入可提余额 = 演示 / 活动期开闸,谨慎使用。金额调整只影响后续发放,已发放的不回写。
          </div>
        </div>
      </section>

      {/* 邀请人奖励配置(uniapp rewards.inviterReward 同构) */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success)" }}><UserPlus size={15} strokeWidth={2} aria-hidden />邀请人奖励配置</span>
          <span className="sub">· 邀请人每拉一名新用户自身得的 NEX —— 与新人礼(给被邀请人)是两笔独立的钱,me 页邀请入口与落地页展示都从这里取值</span>
          <div className="r"><span className="kcode electric" title="与前端 rewards.inviterReward 配置同构,me 页邀请入口 meta 从此派生">金额单源</span></div>
        </div>
        <div className="l-b">
          <div className="param-grid" data-proof="h8-inviter-reward-params">
            {INVITER_REWARD_PARAMS.map((p) => {
              const curV = ctx.pget(inviterRewardParamKey(p.key));
              return (
                <div className="p" key={p.key}>
                  <div className="k">{p.label}</div>
                  <div className="v">
                    {inviterParamValue(p.key)}
                    <span className="vu">{p.unit}</span>
                    {curV ? <span className="vu">· 原 {p.defaultVal}</span> : null}
                    <button className="l-btn sm mc" onClick={() => adjInviterParam(p)} title={`PRD H8 inviterReward.${p.key}`}>调整</button>
                  </div>
                  <div className="s">{p.desc}</div>
                </div>
              );
            })}
          </div>
          <div className="ktint" style={{ marginTop: 12, fontSize: 12 }}>
            <b>邀请人奖励</b> · 邀请人每成功邀请一名新用户自身获得的 NEX 激励,与新人礼(给被邀请人)相互独立。调整只影响后续邀请发放,已发放的不回写。
          </div>
        </div>
      </section>

      {/* 分工与联动 */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)" }}><Waypoints size={15} strokeWidth={2} aria-hidden />谁在消费这两笔配置</span>
          <span className="sub">· 改参前先知道会动到哪些面</span>
          <div className="r">
            <Link className="kcode lock" href="/risk/abuse" title="刷新人礼 / 刷邀请的检测、分级判定与拦截都在 K2(点击跳转)">🔒 防刷与拦截归 K2</Link>
          </div>
        </div>
        <div className="l-b">
          <div className="lvl-grid">
            <div className="lv"><div className="t"><span className="bdg dim">前端</span>展示与入账</div><div className="d">邀请落地页、注册页、me 页邀请入口的金额展示与实际入账全部从当前值派生 —— 改参即时对前端生效,不存在两套口径。</div></div>
            <div className="lv"><div className="t"><span className="bdg dim">风控</span>K2 检测与拦截</div><div className="d">刷新人礼的闭环检测、分级判定、停发拦截在 K2;拦截统计的金额口径读这里的当前值。追回已发放的走用户域余额调整(C3)。</div></div>
            <div className="lv"><div className="t"><span className="bdg dim">红线</span>B1 兑付覆盖率</div><div className="d">升金额 / 切「直入可提余额」= 放大流出方向,提交时先过 B1 覆盖率预检,低于红线直接拒绝。</div></div>
          </div>
        </div>
      </section>

      <p className="f-foot">
        <b>两笔钱要分清</b>:新人礼发给<b>被邀请人</b>(注册礼包,每账号仅一次,服务器按注册事实幂等入账);邀请人奖励发给<b>邀请人</b>(按成功邀请计)。金额与模式在本页单源配置,发放的风控闸门(风险桶、同簇判定、停发拦截)不在本页 —— 归 K2 套利 & 刷量检测。
      </p>
    </div>
  );
}
