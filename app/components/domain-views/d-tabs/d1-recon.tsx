"use client";

/**
 * D1 充值对账中心 — 渠道费率/启停(操作确认)+ 主备 PSP(Checkout.com/Stripe,操作确认)+ 卡风控三参数(操作确认)
 * + 支付商对账(差异核销 操作确认)+ 银行轨对账五视图(在途/已匹配/孤儿/差额/过期后到账,三处置全操作确认,
 *   挂账合计 = LEDGER 科目 #9 单源派生)+ 银行轨参数(容差/宽限/单笔上限/确认数)+ 收款账户池(轮换/日上限/熔断)
 * + 充值流水三态 + BIN 攻击监控(锁/解锁仍需操作确认 带原因)+ 拒付处置(操作确认 · 三连原子)。
 * 入账唯一真相 = server 处理 PSP 回调/链上确认;本页只观测与处置,不另立储备账(入账事件喂 D3)。
 */
import { useState } from "react";
import { fmtUsd } from "@/lib/mock/admin/design-data";
import { CHANNELS, channelName, CARD_PARAMS, RECON, RECON_LEDGER_TOTAL, RECON_LEDGER_CNT, BINS, CBS, TOPUP_TABS, topupsByTab, BANK_SUSPENSE_USD } from "./data";
import { cardFeePct, cardFeeRate } from "@/lib/mock/admin/channels";

/** 今日国际卡入账基数(mock 种子);备付金流水由它 × 卡费率派生,两个数不再各写各的。 */
const CARD_INTAKE_TODAY_USD = 92_140;
import {
  BANK_INTENTS, BANK_SUSPENSE_ROWS, BANK_VIEW_TABS, BANK_ST, BANK_PARAMS,
  BANK_ACCOUNTS, VN_BANKS, BANK_ROTATION_OPTIONS, fmtVnd, fmtUsdt2, type BankIntentRow, type BankIntentView, type BankAccountRow,
} from "./data";
import { D_FUND } from "@/lib/mock/admin/design-data";
import { PaginationExemption } from "../design-kit";
import type { DCtx } from "./types";

/** 列表侧户名脱敏(「CTY *** VIETNAM」式):首尾词保留、中间打码;详情/付款单侧才给完整。 */
const maskHolder = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length >= 2 ? `${parts[0]} *** ${parts[parts.length - 1]}` : full;
};

export function D1Recon({ ctx }: { ctx: DCtx }) {
  const { pget, setParam, toast, openActionConfirm, openConfirm } = ctx;
  const [flowTab, setFlowTab] = useState<"pending" | "confirmed" | "abnormal">("confirmed");
  const [bankView, setBankView] = useState<BankIntentView>("inflight");

  const chOn = (id: string, seed: boolean) => { const v = pget(`D.channel.${id}`); return v === undefined ? seed : v === "enable"; };
  const chFee = (id: string, seed: string) => pget(`D.fee.${id}`) ?? seed;
  const pspPrimary = pget("D.psp.primary") ?? "Checkout.com";
  const binLocked = (i: number, seed: boolean) => { const v = pget(`D.bin.${i}`); return v === undefined ? seed : v === "locked"; };
  const reconciled = (ch: string) => pget(`D.reconcile.${ch}`) === "reconciled";
  const cbDone = (id: string, seed: boolean) => seed || pget(`D.chargeback.${id}`) === "refunded";

  const diffRows = RECON.filter((r) => r.diff && !reconciled(r.ch));
  const diffUsd = diffRows.reduce((s, r) => s + (r.pspAmt - r.ledAmt), 0);
  // 手动锁段(D.bin.manual.<段>)真写后即时进热力列表与计数(写读同链,防半截闭环)
  const manualBins = Object.keys(ctx.params).filter((k) => k.startsWith("D.bin.manual.") && ctx.params[k] === "locked").map((k) => k.slice("D.bin.manual.".length));
  const binLockedCnt = D_FUND.binLockedBase + BINS.filter((b, i) => binLocked(i, b.locked)).length + manualBins.length;

  /* ── 银行轨对账(VietQR):处置实时态 = pget(`D.bank.intent.<id>`)(credited=已补入账 / returned=已登记退回)── */
  const bankSt = (id: string) => pget(`D.bank.intent.${id}`);
  const bankDisposed = (id: string) => bankSt(id) !== undefined;
  // 🔴 账实单源:挂账中 = 种子挂账行剔除已处置行;seed 合计 $3,847.52 = LEDGER 负债科目 #9(同一份数据派生)。
  const suspenseLive = BANK_SUSPENSE_ROWS.filter((r) => !bankDisposed(r.id));
  const suspenseLiveUsd = suspenseLive.reduce((s, r) => s + r.usdt, 0);
  const bankRows = BANK_INTENTS.filter((r) => r.view === bankView);
  const bankViewCnt = (v: BankIntentView) => BANK_INTENTS.filter((r) => r.view === v).length;
  const bankTol = pget("D.bankTolVnd") ?? "1000";
  // 失败态统一口径:终态再处置 = server 409 幂等拒绝(重复回单 no-op),前端不写、只提示。
  const bankTerminalRefused = (id: string) => toast(`拒绝:${id} 已是终态,重复处置被服务器拒绝(防重号幂等)· 未做任何改动`);

  const bankMatch = (r: BankIntentRow) => {
    if (bankDisposed(r.id)) { bankTerminalRefused(r.id); return; }
    if (r.view === "orphan") {
      const candidates = BANK_INTENTS.filter((x) => x.view === "inflight" && !bankDisposed(x.id)).map((x) => `${x.id} · ${x.user} · 应付 ${fmtVnd(x.payableVnd!)}`);
      if (!candidates.length) { toast("无法匹配:当前没有在途意向单可选(server 409)· 可等用户提交凭证,或登记退回"); return; }
      openActionConfirm({
        action: `手动匹配入账 · ${r.id}`,
        detail: <>孤儿回单实收 <b>{fmtVnd(r.receivedVnd!)}</b>(折算 {fmtUsdt2(r.usdt)})· {r.note}。选择要匹配的在途意向单,确认后按该单锁定牌价补入账:挂账科目 #9 冲减、用户可提负债同额增加(0 手续费)。带防重号,同一回单重复匹配会被服务器拒绝。</>,
        edit: { kind: "select", current: candidates[0], options: candidates },
        run: (reason, v) => { setParam(`D.bank.intent.${r.id}`, "credited", { action: `银行轨手动匹配入账 ${r.id} → ${v?.split(" · ")[0] ?? ""}`, reason }); toast(`${r.id} 已匹配补入账 · 挂账科目 #9 冲减 · 理由留痕`); },
      });
    } else {
      openActionConfirm({
        action: `迟到转账补入账 · ${r.id}`,
        detail: <><b>{r.user} · 实收 {fmtVnd(r.receivedVnd!)}</b> · {r.timing}(超回单宽限)。确认后仍按该单锁定牌价 {r.fxRate.toLocaleString("en-US")} 补入账 {fmtUsdt2(r.usdt)},不重新计价;挂账科目 #9 冲减、用户可提负债同额增加。带防重号。</>,
        run: (reason) => { setParam(`D.bank.intent.${r.id}`, "credited", { action: `银行轨迟到转账补入账 ${r.id}`, reason }); toast(`${r.id} 已按锁定牌价补入账 · 理由留痕`); },
      });
    }
  };
  const bankWriteOff = (r: BankIntentRow) => {
    if (bankDisposed(r.id)) { bankTerminalRefused(r.id); return; }
    const diff = r.receivedVnd! - r.payableVnd!;
    openActionConfirm({
      action: `按实收核销 · ${r.id}`,
      detail: <><b>{r.user}</b> · 应付 {fmtVnd(r.payableVnd!)} / 实收 {fmtVnd(r.receivedVnd!)}(差 {diff > 0 ? "+" : "−"}{fmtVnd(Math.abs(diff))},超容差 ±{Number(bankTol).toLocaleString("en-US")}₫,永不自动入账)。确认后按<b>实收</b>折算 {fmtUsdt2(r.usdt)} 入账并关单,差额不再追补;挂账科目 #9 冲减、用户可提负债同额增加。带防重号。</>,
      run: (reason) => { setParam(`D.bank.intent.${r.id}`, "credited", { action: `银行轨按实收核销 ${r.id}`, reason }); toast(`${r.id} 已按实收核销入账 · 理由留痕`); },
    });
  };
  const bankReturn = (r: BankIntentRow) => {
    if (bankDisposed(r.id)) { bankTerminalRefused(r.id); return; }
    openActionConfirm({
      action: `登记退回 · ${r.id}`,
      detail: <>实收 <b>{fmtVnd(r.receivedVnd!)}</b>(折算 {fmtUsdt2(r.usdt)})按原路退回付款银行账户。登记后进入退回处理中,完成时挂账科目 #9 冲减、储备同额扣减(资金退出);退回终态不可再处置。带防重号。</>,
      run: (reason) => { setParam(`D.bank.intent.${r.id}`, "returned", { action: `银行轨登记退回 ${r.id}`, reason }); toast(`${r.id} 已登记退回 · 处理完成后储备同额扣减 · 理由留痕`); },
    });
  };

  /* ── 收款账户池:启停 = pget(`D.bank.acct.<id>`),日收上限 = pget(`D.bank.cap.<id>`),熔断恢复 = pget(`D.bank.fuse.<id>`)── */
  const acctOn = (id: string, seed: boolean) => { const v = pget(`D.bank.acct.${id}`); return v === undefined ? seed : v === "enable"; };
  const acctCap = (id: string, seed: number) => { const v = Number(pget(`D.bank.cap.${id}`)); return Number.isFinite(v) && v > 0 ? v : seed; };
  const acctFusedLive = (a: BankAccountRow) => a.fused && pget(`D.bank.fuse.${a.id}`) !== "recovered";
  // 手动新增账户(D.bank.acct.add.<尾四位> = JSON)真写后即时进列表(写读同链,防半截闭环)。
  const addedAccts: BankAccountRow[] = Object.keys(ctx.params)
    .filter((k) => k.startsWith("D.bank.acct.add."))
    .map((k) => { try { return JSON.parse(String(ctx.params[k])) as { bank: string; holder: string; tail: string; cap: number }; } catch { return null; } })
    .filter((x): x is { bank: string; holder: string; tail: string; cap: number } => x != null)
    .map((x) => ({ id: `add-${x.tail}`, bank: x.bank, holder: maskHolder(x.holder), tail: x.tail, dailyCapVnd: x.cap, todayVnd: 0, on: true, fused: false, note: "新增 · 待小额试收验证" }));
  const poolRows = [...BANK_ACCOUNTS, ...addedAccts];
  const rotation = pget("D.bank.pool.rotation") ?? BANK_ROTATION_OPTIONS[0];
  const poolAvailable = poolRows.filter((a) => acctOn(a.id, a.on) && !acctFusedLive(a)).length;

  const acctToggle = (a: BankAccountRow) => {
    const on = acctOn(a.id, a.on);
    openActionConfirm({
      action: `${on ? "停用" : "启用"}收款账户 · ${a.bank} 尾号 ${a.tail}`,
      detail: <>{on ? "停用后立即移出轮换,新意向单不再派发该账户;已派发的在途单照常等回单。" : "启用后进入轮换末位,恢复接收新意向单派发。"}收款账户启停直接影响银行轨资金流入通道,操作确认。{on && poolAvailable <= 1 ? <b> 注意:这是最后一个可用账户,停用后银行转账通道将整体不可用(用户端入口自动置灰)。</b> : null}</>,
      run: (reason) => { setParam(`D.bank.acct.${a.id}`, on ? "disable" : "enable", { action: `收款账户${on ? "停用" : "启用"} ${a.bank} 尾号 ${a.tail}`, reason }); toast(`${a.bank} 尾号 ${a.tail} 已${on ? "停用" : "启用"} · 理由留痕`); },
    });
  };
  const acctCapEdit = (a: BankAccountRow) => {
    const cur = acctCap(a.id, a.dailyCapVnd);
    openActionConfirm({
      action: `日收上限调整 · ${a.bank} 尾号 ${a.tail}`,
      detail: <>当前 {fmtVnd(cur)} / 日。当日已收达到上限后自动移出轮换,次日归零恢复;调低到已收之下会立即停止派发。</>,
      edit: { kind: "number", current: String(cur), unit: "₫/日", gt: 0, integer: true },
      run: (reason, v) => { if (!v) return; setParam(`D.bank.cap.${a.id}`, v, { action: `收款账户日收上限调整 ${a.bank} 尾号 ${a.tail}`, reason }); toast(`${a.bank} 尾号 ${a.tail} 日收上限已更新为 ${fmtVnd(Number(v))} · 理由留痕`); },
    });
  };
  const acctFuseRecover = (a: BankAccountRow) => openConfirm({
    action: `熔断恢复 · ${a.bank} 尾号 ${a.tail}`,
    detail: `该账户因「${a.note.split(" · ")[0]}」被自动熔断移出轮换。恢复前先确认银行侧异常已排除;恢复后回到轮换末位。必须写原因。`,
    chips: [["必须写原因", "ready"], ["落审计 · 回轮换末位", "done"]], reason: true, okLabel: "确认恢复",
    run: (reason) => { setParam(`D.bank.fuse.${a.id}`, "recovered", { action: `收款账户熔断恢复 ${a.bank} 尾号 ${a.tail}`, reason }); toast(`${a.bank} 尾号 ${a.tail} 已恢复轮换 · 原因留痕`); },
  });
  const acctAdd = () => openActionConfirm({
    action: "新增收款账户",
    detail: <>新账户进入轮换末位,派发前先小额试收验证到账链路。账号完整录入,列表侧自动脱敏(户名打码 + 只显尾四位)。新增直接影响资金流入通道,操作确认。</>,
    businessForm: {
      kind: "multi-field",
      title: "收款账户信息",
      fields: [
        { key: "bank", label: "银行", inputKind: "select", options: VN_BANKS },
        { key: "holder", label: "户名(完整)", placeholder: "如 CTY TNHH NEXGRID VIETNAM", wide: true },
        { key: "acct", label: "银行账号(完整)", inputKind: "number", placeholder: "列表侧自动只显尾四位", integer: true, gt: 0 },
        { key: "cap", label: "日收上限(₫)", inputKind: "number", current: "300000000", integer: true, gt: 0 },
      ],
    },
    run: (reason, _v, bv) => {
      const acctNo = (bv?.acct ?? "").trim();
      const tail = acctNo.slice(-4);
      if (acctNo.length < 6) { toast("新增被拒绝:银行账号至少 6 位(server 422)· 未做任何改动"); return; }
      if (poolRows.some((p) => p.tail === tail)) { toast(`新增被拒绝:尾号 ${tail} 与现有账户重复(server 409)· 未做任何改动`); return; }
      setParam(`D.bank.acct.add.${tail}`, JSON.stringify({ bank: bv?.bank ?? VN_BANKS[0], holder: bv?.holder ?? "", tail, cap: Number(bv?.cap) || 300_000_000 }), { action: `新增收款账户 ${bv?.bank ?? ""} 尾号 ${tail}`, reason });
      toast(`已新增 ${bv?.bank ?? ""} 尾号 ${tail} · 进入轮换末位 · 理由留痕`);
    },
  });
  const rotationEdit = () => openActionConfirm({
    action: "轮换策略调整",
    detail: <>当前「{rotation}」。策略决定新意向单派发给哪个可用账户;只影响之后的新单,在途单不受影响。</>,
    edit: { kind: "select", current: rotation, options: BANK_ROTATION_OPTIONS },
    run: (reason, v) => { if (!v) return; setParam("D.bank.pool.rotation", v, { action: `收款账户池轮换策略调整 → ${v}`, reason }); toast(`轮换策略已更新为「${v}」· 仅新单生效`); },
  });

  return (
    <>
      <div className="f-stats">
        <div className="f-stat ok"><div className="k">今日已确认入账</div><div className="v">${(RECON_LEDGER_TOTAL / 1000).toFixed(1)}K</div><div className="sub">{RECON_LEDGER_CNT} 笔 · 五渠道合计(平台入账侧)</div></div>
        <div className="f-stat warn"><div className="k">对账差异(未核销)</div><div className="v">{diffRows.length} 笔 · ${diffUsd.toLocaleString("en-US")}</div><div className="sub">单边挂账 {diffRows.filter((r) => r.diff?.includes("单边")).length} · 金额差 {diffRows.filter((r) => r.diff?.includes("金额差")).length}</div></div>
        <div className="f-stat cyan"><div className="k">风控备付金 fee_buffer</div><div className="v">${D_FUND.feeBufferUsd.toLocaleString("en-US")}</div><div className="sub">卡渠道 {cardFeePct()} 手续费累计 · 非利润</div></div>
        <div className="f-stat danger"><div className="k">BIN 锁卡中</div><div className="v">{binLockedCnt}</div><div className="sub">同卡 24h ≥ 5 次失败自动锁</div></div>
      </div>

      {/* 渠道参数 + 启停 */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">充值渠道与费率</span>
          <span className="sub">· 改费率只影响之后的新充值单,在途单按锁定费率走 · 启停和费率调整都要操作确认</span>
          <div className="r">
            <span className="dcode">主 PSP:{pspPrimary} · 备:{pspPrimary === "Checkout.com" ? "Stripe" : "Checkout.com"}</span>
            <button className="l-btn mc" onClick={() => openActionConfirm({
              action: "主备支付商切换",
              detail: <>当前主 <b>{pspPrimary}</b> / 备 {pspPrimary === "Checkout.com" ? "Stripe" : "Checkout.com"},按地区卡段自动路由。切换后<b>全部新刷卡交易</b>走新主路;在途授权单(已授权即费率/路由锁定)不受影响。影响全部刷卡入账路由,操作确认。</>,
              run: (reason) => { const next = pspPrimary === "Checkout.com" ? "Stripe" : "Checkout.com"; setParam("D.psp.primary", next, { action: `主备 PSP 切换 → ${next} 主`, reason }); toast(`主备已切换:${next} 为主 · 新交易生效 · 理由留痕`); },
            })}>主备切换(操作确认)</button>
          </div>
        </div>
        <div className="l-b" style={{ paddingTop: 6 }}>
          {CHANNELS.map((c) => { const on = chOn(c.id, c.on); const fee = chFee(c.id, c.fee); const min = pget(`D.min.${c.id}`) ?? c.min; return (
            <div className="ch-row" key={c.id}>
              <span className="nm">{c.name}{on ? <span className="bdg ok">营业中</span> : <span className="bdg bad">已停用</span>}<small className="mono" style={{ display: "block", fontWeight: 400, color: "var(--ink-4)" }}>{c.id}</small></span>
              <span className="meta">最低充值 {min}(per-channel){c.cap ? ` · 单笔上限 ${c.cap}` : ""}<button className="l-btn sm mc" style={{ marginLeft: 8 }} onClick={() => openActionConfirm({
                action: `最低充值额调整 · ${c.name}`,
                detail: <><b>{c.name}</b> · 当前 {min} · 最低充值额按渠道分别配置,不可设单一全局值;仅对之后的新充值单生效。</>,
                edit: { kind: "text", current: min },
                run: (reason, v) => { if (v) setParam(`D.min.${c.id}`, v, { action: `最低充值额调整 ${c.name}`, reason }); toast(`${c.name} 最低充值额已更新为 ${v} · 仅新单生效`); },
              })}>调下限</button></span>
              <span className="v">{fee}</span>
              <button className="l-btn sm mc" onClick={() => openActionConfirm({
                action: `充值费率调整 · ${c.name}`,
                detail: <><b>{c.name}</b> · 当前 {fee} · 只影响之后的新充值单——链上单以「交易已广播」、刷卡单以「银行已授权」为界,之前的按老费率走。</>,
                edit: { kind: "text", current: fee },
                run: (reason, v) => { if (v) setParam(`D.fee.${c.id}`, v, { action: `充值费率调整 ${c.name}`, reason }); toast(`${c.name} 费率已更新为 ${v} · 仅新单生效`); },
              })}>调费率</button>
              <button className={`l-btn sm${on ? " mc" : ""}`} onClick={() => openActionConfirm({
                action: `${on ? "停用" : "启用"}充值渠道 · ${c.name}`,
                detail: <>{on ? "停用后用户端该渠道立即下架,新充值进不来;在途单照常确认。" : "重新开放该渠道入口。"}渠道启停直接影响资金流入通道,操作确认。</>,
                run: (reason) => { setParam(`D.channel.${c.id}`, on ? "disable" : "enable", { action: `充值渠道${on ? "停用" : "启用"} ${c.name}`, reason }); toast(`${c.name} 已${on ? "停用" : "启用"} · 理由留痕`); },
              })}>{on ? "停用" : "启用"}</button>
            </div>
          ); })}
          <div className="card-params">
            {CARD_PARAMS.map((p) => { const cur = pget(`D.${p.key}`) ?? p.cur; return (
              <div className="dtint row-tint" key={p.key}>
                <span style={{ flex: 1 }}><b>{p.name}</b> · {p.note.split(" · ")[0]}</span>
                <button className="l-btn sm mc" onClick={() => openActionConfirm({
                  action: `刷卡风控参数 · ${p.name}`,
                  detail: <><b>{p.name}</b> · 当前 {cur} · {p.note}。</>,
                  edit: { kind: "text", current: cur },
                  run: (reason, v) => { if (v) setParam(`D.${p.key}`, v, { action: `刷卡风控参数 ${p.name}`, reason }); toast(`${p.name} 已更新为 ${v} · 实时生效`); },
                })}>调整</button>
              </div>
            ); })}
          </div>
        </div>
      </section>

      {/* 对账面 */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">支付商报表 vs 平台入账</span>
          <span className="sub">· 左边是支付商/链上看到的,右边是平台记的账,对不上的标红等人工核销</span>
          <div className="r"><span className="dcode electric">差异核销操作确认</span></div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="l-tbl" style={{ minWidth: 920 }}>
            <thead><tr><th>渠道</th><th className="num">支付商侧 笔数</th><th className="num">支付商侧 金额</th><th className="num">平台入账 笔数</th><th className="num">平台入账 金额</th><th className="num">差异</th><th style={{ textAlign: "right" }}>动作</th></tr></thead>
            <tbody>
              {RECON.map((r) => { const done = reconciled(r.ch); const bad = !!r.diff && !done; return (
                <tr key={r.ch} style={bad ? { background: "var(--danger-soft)" } : undefined}>
                  <td style={{ fontWeight: 600, color: "var(--ink)" }}>{channelName(r.ch)}<small className="mono" style={{ display: "block", fontWeight: 400, color: "var(--ink-4)" }}>{r.ch}</small></td>
                  <td className="num mono">{r.pspCnt}</td><td className="num mono">{fmtUsd(r.pspAmt)}</td>
                  <td className="num mono">{r.ledCnt}</td><td className="num mono">{fmtUsd(r.ledAmt)}</td>
                  <td className="num mono" style={{ fontWeight: 700, color: bad ? "var(--danger)" : "var(--success)", fontSize: 12 }}>{bad ? r.diff!.split(" · ")[0] : done && r.diff ? "已核销" : "对平"}</td>
                  <td style={{ textAlign: "right" }}>{bad ? (
                    <button className="l-btn sm mc" onClick={() => openActionConfirm({
                      action: `对账差异核销 · ${channelName(r.ch)}`,
                      detail: <><b>{r.diff}</b>。核销 = 账本调整级动作:确认差异原因并冲销单边挂账,操作确认 + 防重号(24h 去重),核销记录喂财务报表(L3)和监管报告(L5)。</>,
                      run: (reason) => { setParam(`D.reconcile.${r.ch}`, "reconciled", { action: `对账差异核销 ${channelName(r.ch)}`, reason }); toast(`${channelName(r.ch)} 差异已核销 · 理由留痕`); },
                    })}>核销</button>
                  ) : <span className="bdg ok">✓</span>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        <PaginationExemption
          label="支付商对账差异表"
          maxRows={5}
          reason="固定五渠道对账样本,逐渠道全量展示比翻页更利于核销"
        />
      </section>

      {/* 银行轨对账(VietQR) — PAY [FEAT-PAY02] 五视图 + 三处置 + 参数(2026-07 签字) */}
      <section className="l-card" data-proof="d1-bank-rail-recon">
        <div className="l-h">
          <span className="ttl">银行轨对账(VietQR)</span>
          <span className="sub">· 回单 vs 意向单 vs 分录三方核对 · 回调匹配自动入账,这里只处置对不上的</span>
          <div className="r">
            <span className="dcode electric">挂账中 {suspenseLive.length} 笔 · {fmtUsdt2(suspenseLiveUsd)} · 科目 #9 日终基线 {fmtUsdt2(BANK_SUSPENSE_USD)}</span>
            <div className="chips">
              {BANK_VIEW_TABS.map((t) => (
                <button key={t.key} className={`chip${bankView === t.key ? " sel" : ""}`} onClick={() => setBankView(t.key)}>{t.label} {bankViewCnt(t.key)}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="l-tbl" style={{ minWidth: 1080 }}>
            <thead><tr><th>单号</th><th>账户</th><th>附言码</th><th className="num">应付(₫)</th><th className="num">实收(₫)</th><th className="num">锁定牌价</th><th className="num">折算 USDT</th><th>倒计时 / 时间</th><th>状态</th><th style={{ textAlign: "right" }}>动作</th></tr></thead>
            <tbody>
              {bankRows.map((r) => {
                const st = bankSt(r.id);
                const meta = BANK_ST[r.view];
                const inSuspense = r.view === "orphan" || r.view === "mismatch" || r.view === "late";
                return (
                  <tr key={r.id} style={inSuspense && !st ? { background: "var(--danger-soft)" } : undefined}>
                    <td className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{r.id}</td>
                    <td className="mono">{r.user}</td>
                    <td className="mono" style={{ color: r.memo === "未填" ? "var(--danger)" : undefined }}>{r.memo}</td>
                    <td className="num mono">{r.payableVnd == null ? "—" : fmtVnd(r.payableVnd)}</td>
                    <td className="num mono" style={{ fontWeight: 600 }}>{r.receivedVnd == null ? "—" : fmtVnd(r.receivedVnd)}</td>
                    <td className="num mono" style={{ color: "var(--ink-3)" }}>{r.fxRate.toLocaleString("en-US")}</td>
                    <td className="num mono" style={{ fontWeight: 700 }}>{fmtUsdt2(r.usdt)}</td>
                    <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{r.timing}</td>
                    <td>
                      {st === "credited" ? <span className="bdg ok">已补入账</span>
                        : st === "returned" ? <span className="bdg dim">退回处理中</span>
                        : <span className={`bdg ${meta.tone}`}>{meta.label}</span>}
                      <small className="mono" style={{ display: "block", fontWeight: 400, color: "var(--ink-4)", marginTop: 2 }}>{st === "credited" ? "credited" : st === "returned" ? "return_pending" : meta.code}</small>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {st ? <span className="bdg ok">✓ 已处置</span> : inSuspense ? (
                        <>
                          {(r.view === "orphan" || r.view === "late") && <button className="l-btn sm mc" onClick={() => bankMatch(r)}>{r.view === "orphan" ? "手动匹配入账" : "补入账(锁定牌价)"}</button>}
                          {r.view === "mismatch" && <button className="l-btn sm mc" onClick={() => bankWriteOff(r)}>按实收核销</button>}
                          {" "}<button className="l-btn sm mc" onClick={() => bankReturn(r)}>登记退回</button>
                        </>
                      ) : <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{r.view === "inflight" ? "服务器自动匹配" : "—"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationExemption
          label="银行轨对账五视图"
          maxRows={5}
          reason="按视图切分后单屏最多五条,固定处置样本比翻页更利于逐笔核对"
        />
        <div className="l-b" style={{ paddingTop: 0 }}>
          <div className="dtint warn" style={{ marginBottom: 10 }}><b>挂账怎么算账</b> · 回单一到就「借储备 +实收折算 · 贷科目 #9 +同额」先挂着;人工匹配 / 按实收核销 = 挂账转用户可提负债(钱不动);登记退回 = 挂账冲减 + 储备同额扣减(钱退出)。本页队列随处置实时更新;账本科目 #9(D3 / 总览)按日终对账批次回写,处置后两处短时差属正常,日终自动归平、差异超容限走 D1 核销。</div>
          <div className="card-params">
            {BANK_PARAMS.map((p) => { const cur = pget(`D.${p.key}`) ?? p.cur; return (
              <div className="dtint row-tint" key={p.key}>
                <span style={{ flex: 1 }}><b>{p.name}</b> · 当前 <span className="mono">{p.fmt(cur)}</span></span>
                <button className="l-btn sm mc" onClick={() => openActionConfirm({
                  action: `银行轨参数 · ${p.name}`,
                  detail: <><b>{p.name}</b> · 当前 {p.fmt(cur)} · {p.note}。</>,
                  edit: { kind: "number", current: cur, unit: p.unit, min: p.min, max: p.max, integer: p.integer },
                  run: (reason, v) => { if (!v) return; setParam(`D.${p.key}`, v, { action: `银行轨参数 ${p.name}`, reason }); toast(`${p.name} 已更新为 ${p.fmt(v)} · 理由留痕`); },
                })}>调整</button>
              </div>
            ); })}
          </div>
        </div>
      </section>

      {/* 收款账户池 — PAY §6:轮换派发 + 日收上限 + 异常熔断 */}
      <section className="l-card" data-proof="d1-bank-account-pool">
        <div className="l-h">
          <span className="ttl">收款账户池</span>
          <span className="sub">· 意向单按轮换策略派发收款账户 · 无可用账户时用户端银行转账入口自动置灰</span>
          <div className="r">
            <span className="dcode">可用 {poolAvailable}/{poolRows.length} · 策略:{rotation.split("(")[0]}</span>
            <button className="l-btn" onClick={rotationEdit}>轮换策略</button>
            <button className="l-btn mc" onClick={acctAdd}>新增收款账户(操作确认)</button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="l-tbl" style={{ minWidth: 980 }}>
            <thead><tr><th>银行</th><th>户名(脱敏)</th><th>账号</th><th className="num">日收上限</th><th style={{ minWidth: 180 }}>当日已收水位</th><th>状态</th><th style={{ textAlign: "right" }}>动作</th></tr></thead>
            <tbody>
              {poolRows.map((a) => {
                const on = acctOn(a.id, a.on);
                const fused = acctFusedLive(a);
                const cap = acctCap(a.id, a.dailyCapVnd);
                const pct = Math.min(100, Math.round((a.todayVnd / cap) * 100));
                const barColor = pct >= 90 ? "var(--danger)" : pct >= 70 ? "var(--warning)" : "var(--success)";
                return (
                  <tr key={a.id} style={fused ? { background: "var(--danger-soft)" } : undefined}>
                    <td style={{ fontWeight: 600, color: "var(--ink)" }}>{a.bank}<small className="mono" style={{ display: "block", fontWeight: 400, color: "var(--ink-4)" }}>{a.id}</small></td>
                    <td className="mono">{a.holder}</td>
                    <td className="mono">···· {a.tail}</td>
                    <td className="num mono">{fmtVnd(cap)}</td>
                    <td>
                      <span style={{ height: 7, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden", display: "block" }}><i style={{ display: "block", height: "100%", width: `${pct}%`, background: on ? barColor : "var(--surface-3)", borderRadius: 999 }} /></span>
                      <small className="mono" style={{ color: "var(--ink-4)" }}>{fmtVnd(a.todayVnd)} · {pct}%</small>
                    </td>
                    <td>
                      {fused ? <span className="bdg bad">已熔断</span> : on ? <span className="bdg ok">轮换中</span> : <span className="bdg dim">已停用</span>}
                      {a.note && <small style={{ display: "block", color: "var(--ink-4)", marginTop: 2 }}>{a.note}</small>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {fused && <><button className="l-btn sm" onClick={() => acctFuseRecover(a)}>熔断恢复</button>{" "}</>}
                      <button className="l-btn sm mc" onClick={() => acctCapEdit(a)}>调上限</button>
                      {" "}<button className={`l-btn sm${on ? " mc" : ""}`} onClick={() => acctToggle(a)}>{on ? "停用" : "启用"}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationExemption
          label="收款账户池"
          maxRows={6}
          reason="账户池是个位数固定资产清单,全量展示比翻页更利于水位巡检"
        />
        <div className="l-b" style={{ paddingTop: 0 }}>
          <div className="dtint"><b>熔断怎么触发</b> · 服务器按账户维度监测:回单延迟超阈值、银行侧退单、当日已收触顶,任一命中即自动熔断移出轮换(不需要人工);恢复必须人工确认银行侧异常已排除并写原因。用户付款单上给完整户名账号(转账需要),后台列表只显脱敏户名 + 尾四位。</div>
        </div>
      </section>

      {/* 充值流水 */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">充值流水</span>
          <span className="sub">· 已确认 = 已写账单(D4)+ 已累计终身入金(E 域换新资格源)</span>
          <div className="r"><div className="chips">
            {TOPUP_TABS.map((t) => (
              <button key={t.key} className={`chip${flowTab === t.key ? " sel" : ""}`} onClick={() => setFlowTab(t.key)}>{t.label}</button>
            ))}
          </div></div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="l-tbl" style={{ minWidth: 980 }}>
            <thead><tr><th>充值单</th><th>账户</th><th>渠道</th><th className="num">到账额</th><th className="num">渠道实收</th><th>凭证</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              {topupsByTab(flowTab).map((f) => { const tone = f.stLabel.startsWith("已入账") ? "ok" : f.stLabel.includes("拒") || f.stLabel.includes("超时") ? "bad" : "warn"; return (
                <tr key={f.id}>
                  <td className="mono" style={{ color: "var(--ink)" }}>{f.id}</td>
                  <td className="mono">{f.user}</td>
                  <td><span className="bdg dim">{channelName(f.channel)}</span></td>
                  <td className="num mono" style={{ fontWeight: 700 }}>{fmtUsd(f.amount)}</td>
                  <td className="num mono" style={{ color: "var(--ink-3)" }}>{f.recvLabel}</td>
                  <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{f.proof}</td>
                  <td><span className={`bdg ${tone}`}>{f.stLabel}</span></td>
                  <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{f.t}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        <PaginationExemption
          label="充值流水分状态样本"
          maxRows={5}
          reason="按状态 tab 后单屏最多五条,用于核对样本而非无限流水查询"
        />
      </section>

      <div className="two-col r12">
        {/* BIN attack */}
        <section className="l-card">
          <div className="l-h">
            <span className="ttl">刷卡攻击监控</span>
            <span className="sub">· 按卡段 / IP / 设备聚合的 24h 失败热力 · 超线自动锁卡,人工也能锁</span>
            <div className="r"><button className="l-btn" onClick={() => openConfirm({
              action: "手动锁卡段",
              detail: "立即拦下指定卡段/指纹的后续刷卡尝试(默认 24h)。锁卡是即时止血,单人可操作,落审计;失败热力同步给反多账户引擎(K1)支付工具维度。",
              chips: [["即时止血 · 单人可锁", "ready"], ["落审计 · 喂 K1", "done"]],
              reason: true, input: { label: "卡段 / 指纹", placeholder: "如 BIN 4716 02·· 或 fp_22ab…" }, okLabel: "确认锁卡",
              run: (reason, v) => { if (v) setParam(`D.bin.manual.${v}`, "locked", { action: `手动锁卡段 ${v}`, reason }); toast(`${v ?? ""} 已锁 24h · 落审计`); },
            })}>手动锁卡段</button></div>
          </div>
          <div className="l-b">
            <div className="heat">
              {manualBins.map((seg) => (
                <div className="h-row hot" key={`manual-${seg}`}>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{seg}<small style={{ display: "block", fontWeight: 400, color: "var(--ink-4)" }}>手动锁段</small></span>
                  <span className="bar"><i style={{ width: "100%", background: "var(--danger)" }} /></span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>手动锁 24h</span>
                  <button className="l-btn sm" onClick={() => openConfirm({
                    action: `解锁卡段 · ${seg}`,
                    detail: "解锁后该卡段恢复刷卡。解锁必须写原因。",
                    chips: [["必须写原因", "ready"], ["落审计", "done"]], reason: true, okLabel: "确认解锁",
                    run: (reason) => { setParam(`D.bin.manual.${seg}`, "unlocked", { action: `解锁卡段 ${seg}`, reason }); toast(`${seg} 已解锁 · 原因留痕`); },
                  })}>解锁</button>
                </div>
              ))}
              {BINS.map((b, i) => { const locked = binLocked(i, b.locked); return (
                <div className={`h-row${locked ? " hot" : ""}`} key={b.name}>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{b.name}<small style={{ display: "block", fontWeight: 400, color: "var(--ink-4)" }}>{b.meta}</small></span>
                  <span className="bar"><i style={{ width: `${(b.fails / 10) * 100}%`, background: b.fails >= 5 ? "var(--danger)" : "var(--warning)" }} /></span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: b.fails >= 5 ? "var(--danger)" : "var(--warning)" }}>{b.fails} 次/24h</span>
                  {locked ? (
                    <button className="l-btn sm" onClick={() => openConfirm({
                      action: `解锁卡段 · ${b.name}`,
                      detail: "解锁后该卡段恢复刷卡。解锁必须写原因(比如确认为正常商户批量代付)。",
                      chips: [["必须写原因", "ready"], ["落审计", "done"]], reason: true, okLabel: "确认解锁",
                      run: (reason) => { setParam(`D.bin.${i}`, "unlocked", { action: `解锁卡段 ${b.name}`, reason }); toast(`${b.name} 已解锁 · 原因留痕`); },
                    })}>解锁</button>
                  ) : (
                    <button className="l-btn sm" onClick={() => openConfirm({
                      action: `手动锁卡 · ${b.name}`,
                      detail: "立即拦下该卡段/指纹的后续刷卡尝试(默认 24h)。锁卡是即时止血,单人可操作,落审计;失败热力同步给 K1 支付工具维度。",
                      chips: [["即时止血 · 单人可锁", "ready"], ["落审计 · 喂 K1", "done"]], reason: true, okLabel: "确认锁卡",
                      run: (reason) => { setParam(`D.bin.${i}`, "locked", { action: `手动锁卡 ${b.name}`, reason }); toast(`${b.name} 已锁 24h · 落审计`); },
                    })}>锁卡</button>
                  )}
                </div>
              ); })}
            </div>
            <div className="dtint" style={{ marginTop: 12 }}><b>说明</b> · 锁卡由服务器执行,页面只是观测和手动补锁;锁卡热力同步给反多账户引擎(K1)的支付工具维度。后台对账只看得到卡段和末四位,完整卡号从不经过平台(直送收单行)。</div>
          </div>
        </section>

        {/* chargeback */}
        <section className="l-card">
          <div className="l-h">
            <span className="ttl">拒付处置</span>
            <span className="sub">· 已发生拒付的刷卡充值单 · 退款 = 追回已入账 + 从备付金扣回</span>
          </div>
          <div className="l-b">
            <div className="dtint" style={{ marginBottom: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
              <span><b>fee_buffer 今日流水</b></span>
              <span className="mono" style={{ color: "var(--success)" }}>+${Math.round(CARD_INTAKE_TODAY_USD * cardFeeRate()).toLocaleString("en-US")}(今日国际卡入账 ${CARD_INTAKE_TODAY_USD.toLocaleString("en-US")} × {cardFeePct()})</span>
              <span className="mono" style={{ color: "var(--negative)" }}>−$29(TP-76870 拒付:费冲回 $4.2 + 拒付手续费 $25)</span>
              <span className="mono" style={{ color: "var(--ink-3)" }}>余额 ${D_FUND.feeBufferUsd.toLocaleString("en-US")}</span>
            </div>
            {CBS.map((c) => { const done = cbDone(c.id, c.st === "已退款追回"); return (
              <div className="cb-row" key={c.id}>
                <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{c.id}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.user}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{c.amt}</span>
                <span style={{ fontSize: 12, color: "var(--ink-4)", flex: 1 }}>{c.code}</span>
                {done ? <span className="bdg ok">已退款追回</span> : (
                  <>
                    <span className="bdg warn">待处置</span>
                    <button className="l-btn sm mc" onClick={() => openActionConfirm({
                      action: `拒付退款追回 · ${c.id}`,
                      detail: <><b>{c.user} · {c.amt}</b>(原因码 {c.code.split(" · ")[0]})。同一笔服务器事务原子完成三件事:追回已入账余额、从风控备付金扣回、核减该用户终身入金(防止拒付后还留着换新资格)。带防重号,操作确认。</>,
                      run: (reason) => { setParam(`D.chargeback.${c.id}`, "refunded", { action: `拒付退款追回 ${c.id}`, reason }); toast(`${c.id} 退款追回完成 · 终身入金已核减`); },
                    })}>退款追回</button>
                  </>
                )}
              </div>
            ); })}
            <div className="dtint warn" style={{ marginTop: 12 }}><b>退款的连带动作</b> · 追回入账、备付金扣回、该用户终身入金核减,三件事在同一笔服务器事务里原子完成(带防重号),不会出现「钱退了但换新资格还在」的半截账。</div>
          </div>
        </section>
      </div>

      <p className="f-foot"><b>入账的唯一真相源是服务器处理支付商回调 / 链上确认</b>——客户端的余额显示只是渲染,客户端推的账单一律视为伪造。每笔确认入账写一条账单(D4)并累计该用户终身入金(以旧换新门槛的依据);确认入账同时是资金池储备(D3)的流入来源,本页不另立储备账,只产生入账事件供 D3 聚合。<b>高敏动作全走操作确认</b>:渠道启停、主备支付商切换、拒付退款、对账差异核销,加上银行轨三处置(手动匹配入账 / 按实收核销 / 登记退回)和收款账户池的新增 / 启停 / 调上限——都要理由留痕落审计,终态重复处置会被服务器按防重号拒绝;BIN 锁卡与熔断恢复是即时止血,单人可办但必须写原因。银行轨挂账(孤儿 + 差额 + 过期后到账)与资金池水位(D3)负债科目 #9 同一份数据派生,账实永远对得上。</p>
    </>
  );
}
