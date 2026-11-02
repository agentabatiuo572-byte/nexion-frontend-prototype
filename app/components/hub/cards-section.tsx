"use client";

/**
 * 360 HUB · 支付方式(FEAT-CARDS01/02)— C1 唯一权威渲染面(M 域工单只放跳转链,不复制列表)。
 * 查询:PSP token 化脱敏卡列表(默认卡置顶 / 试用担保标记→H2 / 含已解绑开关 / >10 分页 / 持卡人名中间截断)。
 * 处置:非担保卡「解绑」· 担保卡「换绑通知」(不提供解绑;强拆走 H2 试用终止)——
 *   OperationConfirmModal(D2 同款:理由 ≥8 字 + 按钮禁用)+ A2 logAudit + user-ops cardOps 覆盖层 + 终态幂等 409。
 * 4 态:默认=行列表;空=未绑卡说明(无 CTA,后台不能代绑);加载=mock 同步返回豁免骨架;
 *   报错/极限=分页 + 名截断 + unbound 灰态删除线理由悬停(接口 inline 报错 + 重试归 PRODUCTION 接真时实现,契约见 cards.ts)。
 * 事件(mock 只记名,A4 注册后消费):card.unbound / card.rebind_notified / card.revoke_failed。
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, Copy, ArrowUpRight, ChevronDown } from "lucide-react";
import type { AdminUser } from "@/lib/mock/admin/users";
import { getUserCards, type AdminCardRecord, type CardBrand, type TrialRefStatus } from "@/lib/mock/admin/cards";
import { useUserOps, useOpsHydrated, type CardOp } from "@/lib/store/admin/user-ops-store";
import { usePlatformConfig } from "@/lib/store/admin/platform-config-store";
import { toast } from "@/lib/store/ui";
import { OperationConfirmModal } from "@/app/components/domain-views/design-kit";
import { AutoGloss } from "@/app/components/kit/gloss";

const BRAND_LABEL: Record<CardBrand, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", unionpay: "银联", unknown: "银行卡" };
const TRIAL_LABEL: Record<TrialRefStatus, string> = { active: "进行中", grace: "宽限期", extended: "延长期", redeemed: "已结清", failed: "已失败", cancelled: "已取消" };
const OCCUPYING: TrialRefStatus[] = ["active", "grace", "extended"]; // 前端 PRD §9.11:占用担保的试用状态
const PAGE_SIZE = 10;

type LiveCard = AdminCardRecord & { rebindNotifiedAt?: number };

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmtTime = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const truncMid = (s: string, max = 20) =>
  s.length <= max ? s : `${s.slice(0, Math.ceil((max - 1) / 2))}…${s.slice(s.length - Math.floor((max - 1) / 2))}`;

/** 非 secure context 的剪贴板兜底(document.execCommand),只在 clipboard API 缺席时走。 */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 种子 + 处置覆盖层 → 生效卡记录(服务端权威的 client 镜像)。 */
function mergeCard(seed: AdminCardRecord, op: CardOp | undefined, defaultOverride: string | null | undefined): LiveCard {
  let c: LiveCard = { ...seed };
  if (op?.unboundAt) {
    c = { ...c, status: "unbound", unboundAt: op.unboundAt, unboundBy: op.unboundBy, unboundReason: op.unboundReason, pspRevokeStatus: op.pspRevokeStatus ?? "revoked" };
  }
  if (op?.guardCleared) c = { ...c, trialGuard: false };
  if (op?.rebindNotifiedAt) c = { ...c, rebindNotifiedAt: op.rebindNotifiedAt };
  // 默认指针:覆盖层优先于种子;unbound 终态永不默认、永不担保(CARDS02 ④ 终态禁设默认/禁作担保)。
  const isDefault = defaultOverride === undefined ? seed.isDefault : defaultOverride === c.tokenId;
  return { ...c, isDefault: c.status === "active" && isDefault, trialGuard: c.status === "active" && c.trialGuard };
}

function StateChip({ label, tint, title }: { label: string; tint: string; title?: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px]" title={title} tabIndex={title ? 0 : undefined}
      style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint, cursor: title ? "help" : undefined }}>
      {label}
    </span>
  );
}

export function CardsSection({ user }: { user: AdminUser }) {
  const seeds = useMemo(() => getUserCards(user.id), [user.id]);
  const hydrated = useOpsHydrated();
  const storeOps = useUserOps((s) => s.users[user.id]?.cardOps);
  const storeDefault = useUserOps((s) => s.users[user.id]?.cardDefaultToken);
  const cardUnbind = useUserOps((s) => s.cardUnbind);
  const cardNotifyRebind = useUserOps((s) => s.cardNotifyRebind);
  const cardClearGuard = useUserOps((s) => s.cardClearGuard);
  const logAudit = usePlatformConfig((s) => s.logAudit);

  const cardOps = hydrated ? (storeOps ?? {}) : {};
  const defaultOverride = hydrated ? storeDefault : undefined;

  const [open, setOpen] = useState(true);
  const [showUnbound, setShowUnbound] = useState(false);
  const [page, setPage] = useState(1);
  const [act, setAct] = useState<{ kind: "unbind" | "rebind"; card: LiveCard } | null>(null);

  const live = useMemo(() => seeds.map((s) => mergeCard(s, cardOps[s.tokenId], defaultOverride)), [seeds, cardOps, defaultOverride]);
  const active = live.filter((c) => c.status === "active");
  const unbound = live.filter((c) => c.status === "unbound");
  // 默认卡置顶 → 其余 active 按绑定时间倒序 → (开关开)unbound 按解绑时间倒序追加。
  const rows = [
    ...[...active].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.boundAt - a.boundAt),
    ...(showUnbound ? [...unbound].sort((a, b) => (b.unboundAt ?? 0) - (a.unboundAt ?? 0)) : []),
  ];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const pageRows = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  async function copyToken(c: LiveCard) {
    try {
      await navigator.clipboard.writeText(c.tokenId);
    } catch {
      // 局域网 http 预览等非 secure context 无 clipboard API → 隐藏 textarea 兜底(凭证仍只进剪贴板,不上屏)。
      const ok = legacyCopy(c.tokenId);
      if (!ok) {
        toast.error("复制失败", "当前浏览器环境不支持剪贴板,请到 A2 审计中心按卡查看");
        return;
      }
    }
    // CARDS01 ② 异常 3:复制完整 token = 读敏感凭证,必落 A2 留痕。target 带 C.card. 域前缀供 A2 归域。
    logAudit({ actor: "总管理员", action: "复制卡 token(读敏感凭证)", target: `C.card.${c.tokenId}`, reason: `C1 支付方式区 · ${user.id}` });
    toast.success("已复制完整 token", "读敏感凭证已落 A2 审计");
  }

  function runAction(reason: string) {
    if (!act) return;
    const c = act.card;
    const label = `${BRAND_LABEL[c.brand]} •••• ${c.last4}`;
    if (act.kind === "unbind") {
      // 终态重复处置(CARDS02 ② 异常 2)— 同 tab 内快照 stale 的重放在此拦截 + store guard 双保险;
      // 跨 tab 双开的 409 归服务端(接真),mock 无跨 tab 同步 = 全站 mock 共有边界(见 change 提案 T3/T8)。
      if (c.status === "unbound" || cardOps[c.tokenId]?.unboundAt) {
        toast.warn("该卡已解绑", "状态已刷新,不重复记账");
        return;
      }
      // 解默认卡:指针切到剩余最早绑定的 active 卡;无剩余置空(服务端语义镜像)。
      let nextDefault: string | null | undefined;
      if (c.isDefault) {
        const rest = active.filter((x) => x.tokenId !== c.tokenId);
        nextDefault = rest.length ? rest.reduce((a, b) => (a.boundAt <= b.boundAt ? a : b)).tokenId : null;
      }
      // 两笔写(user-ops 行态 / platform A2)同 tick 同步执行但分属两个 persist——mock 非原子;
      // 接真后同一 POST actions 端点服务端事务内原子落库(cards.ts 契约)。
      cardUnbind(user.id, c.tokenId, label, reason, nextDefault);
      logAudit({ actor: "总管理员", action: "解绑银行卡", target: `C.card.${c.tokenId}`, before: "active", after: "unbound", reason });
      // PRODUCTION:card.unbound 事件(payload.unboundBy)+ PSP revoke 异步(失败→card.revoke_failed 重试队列)+ 用户端解绑推送。
      setShowUnbound(true); // 规格 CARDS01 ②「行转灰态」:解绑后行保留在列表(灰态),不静默消失
      toast.success(`已解绑 ${label}`, "已落 A2 审计 · 该行「审计」链接可回溯处置链");
    } else {
      // 担保判定漂移(CARDS02 ② 异常 3):服务端按提交时刻重判 —— 试用已入终态 → 409 回填最新状态,行切「解绑」动作。
      const occupying = c.trialRef && OCCUPYING.includes(c.trialRef.trialStatus);
      if (!occupying) {
        cardClearGuard(user.id, c.tokenId);
        toast.warn("该卡已不担保试用,无需换绑", "服务端已按最新状态回填,行内已切换为「解绑」动作");
        return;
      }
      cardNotifyRebind(user.id, c.tokenId, label, reason);
      logAudit({ actor: "总管理员", action: "发送换绑通知", target: `C.card.${c.tokenId}`, reason });
      // PRODUCTION:card.rebind_notified 事件 + 用户端「请更换试用担保卡」推送(深链绑卡页);卡保持 active,试用不受影响。
      toast.success("换绑通知已发送", `${label} · 用户换绑成功后旧卡方可解绑`);
    }
  }

  const actionBtn = (c: LiveCard) => {
    if (c.status === "unbound") {
      return (
        <Link href="/platform/audit" prefetch={false} title="去 A2 审计中心回溯这张卡的处置记录(谁、何时、什么理由)"
          className="inline-flex items-center gap-0.5 rounded-[6px] px-2 py-1 text-[10.5px] transition-colors hover:bg-[var(--v5-surface)]"
          style={{ color: "var(--v5-ink-3)" }}>
          审计<ArrowUpRight size={11} />
        </Link>
      );
    }
    if (c.trialGuard) {
      return (
        <button type="button" onClick={() => setAct({ kind: "rebind", card: c })}
          className="rounded-[6px] px-2 py-1 text-[10.5px] transition-colors hover:bg-[var(--v5-surface)]"
          style={{ border: "1px solid var(--v5-border)", color: "var(--admin-domain-c)" }}>
          换绑通知
        </button>
      );
    }
    return (
      <button type="button" onClick={() => setAct({ kind: "unbind", card: c })}
        className="rounded-[6px] px-2 py-1 text-[10.5px] transition-colors hover:bg-[var(--v5-surface)]"
        style={{ border: "1px solid var(--v5-border)", color: "var(--v5-danger)" }}>
        解绑
      </button>
    );
  };

  const modalCard = act?.card;
  const modalLabel = modalCard ? `${BRAND_LABEL[modalCard.brand]} •••• ${modalCard.last4}` : "";

  return (
    <div className="rounded-[12px] p-4" style={{ background: "var(--v5-surface)", border: "1px solid var(--v5-border)" }}>
      {/* 区头:点击折叠/展开;右侧「含已解绑」开关(规格 ⑥ 点击流) */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? "折叠区块" : "展开区块"}
          className="flex min-w-0 items-center gap-2 text-left">
          <CreditCard size={15} style={{ color: "var(--admin-domain-c)" }} />
          <span className="font-display text-[14px]" style={{ color: "var(--v5-ink)" }}>支付方式</span>
          <span className="font-mono-tabular text-[10px]" style={{ color: "var(--v5-ink-4)" }}><AutoGloss>C1 权威渲染面 · PSP token 化 · 平台不存完整卡号</AutoGloss></span>
          <ChevronDown size={13} style={{ color: "var(--v5-ink-4)", transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
        </button>
        <button type="button" aria-pressed={showUnbound} onClick={() => { setShowUnbound(!showUnbound); setPage(1); }}
          className="ml-auto rounded-full px-2.5 py-1 text-[11px] transition-opacity hover:opacity-85"
          style={{
            background: showUnbound ? "color-mix(in srgb, var(--admin-domain-c) 18%, transparent)" : "var(--v5-surface-2)",
            color: showUnbound ? "var(--admin-domain-c)" : "var(--v5-ink-3)",
          }}>
          含已解绑 · {unbound.length}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 rounded-[8px] py-6" style={{ background: "var(--v5-surface-2)" }}>
              <CreditCard size={18} style={{ color: "var(--v5-ink-4)" }} />
              <p className="text-[12px]" style={{ color: "var(--v5-ink-3)" }}>
                {live.length > 0 && !showUnbound ? "无生效中的银行卡(历史记录见「含已解绑」)" : "该用户未绑定任何银行卡"}
              </p>
              <p className="text-[10.5px]" style={{ color: "var(--v5-ink-4)" }}>绑卡入口在用户端:我的 → 钱包 → 银行卡;后台不能代用户绑卡</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {pageRows.map((c) => {
                const dead = c.status === "unbound";
                return (
                  <li key={c.tokenId} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[8px] px-2.5 py-2"
                    style={{ background: "var(--v5-surface-2)", opacity: dead ? 0.62 : 1 }}>
                    <span className="font-mono-tabular rounded-[5px] px-1.5 py-0.5 text-[9.5px] uppercase"
                      style={{ background: "color-mix(in srgb, var(--admin-domain-c) 14%, transparent)", color: "var(--admin-domain-c)" }}>
                      {BRAND_LABEL[c.brand]}
                    </span>
                    <span className="font-mono-tabular text-[12.5px]" style={{ color: "var(--v5-ink)", textDecoration: dead ? "line-through" : "none" }}>
                      •••• {c.last4}
                    </span>
                    <span className="font-mono-tabular text-[10.5px]" style={{ color: "var(--v5-ink-4)" }}>{c.expiry}</span>
                    <span className="text-[11px]" style={{ color: "var(--v5-ink-3)" }} title={c.holder}>{truncMid(c.holder)}</span>
                    <span className="text-[10.5px]" style={{ color: "var(--v5-ink-4)" }}>绑定 {fmtDate(c.boundAt)}</span>
                    {c.isDefault && <StateChip label="默认" tint="var(--v5-success)" title="用户侧默认扣款卡(服务端权威指针)" />}
                    {c.trialGuard && (
                      <Link href="/growth/trial" prefetch={false}
                        title={`担保免费试用 ${c.trialRef?.trialId ?? ""}(${c.trialRef ? TRIAL_LABEL[c.trialRef.trialStatus] : "进行中"})· 点击去 H2 免费试用引擎`}
                        className="rounded-full px-2 py-0.5 text-[10px] transition-opacity hover:opacity-80"
                        style={{ background: "color-mix(in srgb, var(--v5-warning) 16%, transparent)", color: "var(--v5-warning)" }}>
                        试用担保 ↗
                      </Link>
                    )}
                    {dead && (
                      <StateChip label="已解绑" tint="var(--v5-ink-4)"
                        title={`解绑于 ${c.unboundAt ? fmtTime(c.unboundAt) : "—"} · 操作人 ${c.unboundBy === "user" ? "用户自解绑" : c.unboundBy ?? "—"} · 理由:${c.unboundReason ?? "—"}`} />
                    )}
                    {dead && (c.pspRevokeStatus === "pending" || c.pspRevokeStatus === "retry_queued") && (
                      <StateChip
                        label={c.pspRevokeStatus === "pending" ? "PSP 注销处理中" : "PSP 注销待重试"}
                        tint="var(--v5-warning)"
                        title={c.pspRevokeStatus === "pending"
                          ? "支付通道侧的卡凭证注销还在处理中。业务解绑已生效、自动扣款已拦截;完成后本标记自动消失"
                          : "支付通道侧的卡凭证注销没成功,系统已排队自动重试。业务解绑已生效、自动扣款已拦截;重试成功后本标记自动消失"} />
                    )}
                    {c.rebindNotifiedAt && !dead && (
                      <StateChip label={`已通知 ${fmtTime(c.rebindNotifiedAt)}`} tint="var(--v5-tech-cyan)" title="换绑通知已推送用户(带绑卡页深链)" />
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => copyToken(c)} title="复制完整 token(读敏感凭证,落 A2 审计)"
                        className="font-mono-tabular inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[10px] transition-colors hover:bg-[var(--v5-surface)]"
                        style={{ color: "var(--v5-ink-4)" }}>
                        <Copy size={11} />…{c.tokenId.slice(-8)}
                      </button>
                      {actionBtn(c)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {pages > 1 && (
            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)}
                className="rounded-[6px] px-2 py-1 text-[10.5px] transition-colors hover:bg-[var(--v5-surface-2)] disabled:opacity-40"
                style={{ border: "1px solid var(--v5-border)", color: "var(--v5-ink-2)" }}>
                上一页
              </button>
              <span className="font-mono-tabular text-[10.5px]" style={{ color: "var(--v5-ink-4)" }}>{cur} / {pages} · 共 {rows.length} 条</span>
              <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)}
                className="rounded-[6px] px-2 py-1 text-[10.5px] transition-colors hover:bg-[var(--v5-surface-2)] disabled:opacity-40"
                style={{ border: "1px solid var(--v5-border)", color: "var(--v5-ink-2)" }}>
                下一页
              </button>
            </div>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px]" style={{ color: "var(--v5-ink-4)" }}>
            <Link href="/platform/audit" prefetch={false} className="inline-flex items-center gap-0.5 hover:opacity-80" style={{ color: "var(--admin-domain-a)" }}>
              A2 审计中心<ArrowUpRight size={11} />
            </Link>
            <AutoGloss>解绑为高敏处置:确认 + 理由 ≥8 字 + A2 留痕;担保卡仅可发换绑通知,确需阻断走 H2 试用终止,不开强拆后门。</AutoGloss>
          </p>
        </div>
      )}

      {/* 操作确认(D2 同款,dkpage 薄壳只为复用作用域样式;处置类不传 edit/amplifies — MC 显式契约) */}
      {act && modalCard && (
        <div className="dkpage cdom">
          <OperationConfirmModal
            action={act.kind === "unbind" ? `解绑银行卡 · ${modalLabel}` : `发送换绑通知 · ${modalLabel}`}
            detail={
              act.kind === "unbind" ? (
                <>持卡人 {modalCard.holder} · 绑定 {fmtDate(modalCard.boundAt)}{modalCard.isDefault ? " · 当前默认卡(解绑后默认指针自动切到剩余最早绑定卡)" : ""}。解绑后该卡自动扣款立即失效,PSP token 异步注销,用户端会收到解绑通知;动作不可撤销,恢复只能由用户重新绑卡。</>
              ) : (
                <>该卡担保免费试用 <span className="mono">{modalCard.trialRef?.trialId}</span>({modalCard.trialRef ? TRIAL_LABEL[modalCard.trialRef.trialStatus] : "—"}
                {modalCard.trialRef && OCCUPYING.includes(modalCard.trialRef.trialStatus)
                  ? "),担保中不可解绑。"
                  : " · 列表为缓存值,提交时会按最新试用状态校验)。"}
                确认后向用户推送「请更换试用担保卡」引导(带绑卡页深链);用户换绑成功后旧卡自然失去担保,方可解绑。确需立即阻断:先走 H2 试用终止,不为本功能开强拆后门。</>
              )
            }
            onClose={() => setAct(null)}
            onConfirm={(reason) => { runAction(reason); setAct(null); }}
          />
        </div>
      )}
    </div>
  );
}
