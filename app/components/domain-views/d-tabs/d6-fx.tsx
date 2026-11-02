/**
 * D6 汇率牌价 — PAY 规格 [FEAT-PAY03] ③ + §6(单源;client 只读派生)。
 *  - 三配置(基准价 / 买入点差 / 锁价窗)= FX_SEED 种子 + pget("D.fx.*") 实时态,
 *    操作确认(显式 edit 契约)+ 理由 + A2 审计;点差越界 0–3 = server 422 失败态(拒绝写入)。
 *    存 raw 数字串、展示才 fmt(防 parseFloat 吃千分位);与 D5 同款 run 内校验 = server 校验镜像。
 *  - 牌价预览:quoteRate 现场派生(26,000 × 1.5% → 26,390 固定靶),禁存第二份;
 *    意向单上的 fxRate 是下单锁价快照,调价不影响在途单([FEAT-PAY02] ④,B2 语义)。
 *  - 生效历史 = A2 审计(target=D.fx.*)实时行(前值→后值自动带)+ FX_HISTORY 种子行。
 */
import { usePlatformConfig } from "@/lib/store/admin/platform-config-store";
import { useOpsHydrated } from "@/lib/store/admin/user-ops-store";
import { computeQuoteRate, FX_HISTORY, FX_PARAMS, FX_SEED, FX_SPREAD_MAX, FX_SPREAD_MIN } from "@/lib/mock/admin/fx";
import type { DCtx } from "./types";

const fxNum = (v: string | undefined, fallback: number) => {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
};

const FX_NAME_BY_KEY: Record<string, string> = Object.fromEntries(FX_PARAMS.map((p) => [`D.${p.key}`, p.name]));
const FX_FMT_BY_KEY: Record<string, (v: string) => string> = Object.fromEntries(FX_PARAMS.map((p) => [`D.${p.key}`, p.fmt]));
// 首次改动的审计 before 为空(此前生效的是种子默认,store 里没有旧值)——前值列回退到种子默认展示。
const FX_SEED_RAW_BY_KEY: Record<string, string> = Object.fromEntries(FX_PARAMS.map((p) => [`D.${p.key}`, p.cur]));

export function D6Fx({ ctx }: { ctx: DCtx }) {
  const { pget, setParam, toast, openActionConfirm } = ctx;
  const hydrated = useOpsHydrated();
  const audit = usePlatformConfig((s) => s.audit);

  const base = fxNum(pget("D.fx.baseRate"), FX_SEED.baseRateVndPerUsdt);
  const spread = fxNum(pget("D.fx.spreadPct"), FX_SEED.buySpreadPct);
  const lockMin = fxNum(pget("D.fx.lockWindowMin"), FX_SEED.lockWindowMin);
  // 牌价 = 现场派生(round 到十位),不落任何存储 —— 全站唯一取数口([FEAT-PAY03] ⑦)。
  const quote = computeQuoteRate(base, spread);
  const fmtV = (n: number) => `${n.toLocaleString("en-US")}₫`;

  // 生效历史:实时改动(A2 审计 target=D.fx.*,before/after 由 setParam 自动带)在上,种子行在下。
  const liveRows = (hydrated ? audit : [])
    .filter((e) => e.target?.startsWith("D.fx."))
    .map((e) => {
      const fmt = FX_FMT_BY_KEY[e.target ?? ""] ?? ((v: string) => v);
      const beforeRaw = e.before != null && e.before !== "" ? e.before : FX_SEED_RAW_BY_KEY[e.target ?? ""];
      return {
        t: new Date(e.ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace("/", "-"),
        name: FX_NAME_BY_KEY[e.target ?? ""] ?? (e.target ?? ""),
        before: beforeRaw != null ? fmt(beforeRaw) : "—",
        after: e.after != null ? fmt(e.after) : "—",
        actor: e.actor,
        reason: e.reason ?? "—",
      };
    });
  const historyRows = [...liveRows, ...FX_HISTORY];

  return (
    <>
      <div className="f-stats">
        <div className="f-stat ok">
          <div className="k">当前牌价(现场派生)</div>
          <div className="v">1 USDT ≈ {fmtV(quote)}</div>
          <div className="sub">= 基准 {fmtV(base)} × (1 + {spread}%) 取整到十位 · 不落库</div>
        </div>
        <div className="f-stat">
          <div className="k">基准价</div>
          <div className="v">{fmtV(base)}</div>
          <div className="sub">手动维护 · 对齐 USD/VND 市场价</div>
        </div>
        <div className="f-stat cyan">
          <div className="k">买入点差</div>
          <div className="v">{spread}%</div>
          <div className="sub">合法范围 {FX_SPREAD_MIN}–{FX_SPREAD_MAX}% · 越界服务器拒绝(422)</div>
        </div>
        <div className="f-stat warn">
          <div className="k">锁价窗</div>
          <div className="v">{lockMin} 分钟</div>
          <div className="sub">付款单下单即按当时牌价锁定 · 仅新单生效</div>
        </div>
      </div>

      <div className="two-col r11">
        {/* 三配置(操作确认 + edit 契约) */}
        <section className="l-card">
          <div className="l-h">
            <span className="ttl">牌价配置(操作确认)</span>
            <span className="sub">· 改动要理由 + 落审计 · 实时生效、只影响新单</span>
            <div className="r"><span className="dcode electric">单源配置 · 用户端只读派生</span></div>
          </div>
          <div className="l-b" style={{ paddingTop: 4 }}>
            {FX_PARAMS.map((p) => {
              const curRaw = pget(`D.${p.key}`) ?? p.cur;
              return (
                <div className="p-row" key={p.key}>
                  <div className="txt">
                    <div className="k">{p.name}</div>
                    <div className="s">{p.note}</div>
                  </div>
                  <span className="v">{p.fmt(curRaw)}</span>
                  <button className="l-btn sm mc" onClick={() => openActionConfirm({
                    action: `汇率牌价调整 · ${p.name}`,
                    detail: <><b>{p.name}</b> · 当前 {p.fmt(curRaw)} · 合法范围 {p.min.toLocaleString("en-US")}–{p.max.toLocaleString("en-US")} {p.unit}。改动实时生效、只对新付款单取价;在途单按下单时锁定的牌价结算,不受影响。产 admin.fx_quote_changed 审计,进本页生效历史。</>,
                    edit: { kind: "number", current: curRaw, unit: p.unit },
                    run: (reason, v) => {
                      const n = parseFloat((v || "").trim());
                      // server 校验镜像:点差越界 = 422 失败态([FEAT-PAY03] ③);其余参数同口径拒绝。
                      if (Number.isNaN(n) || n < p.min || n > p.max || (p.integer && !Number.isInteger(n))) {
                        toast(p.is422
                          ? `保存失败(422):买入点差合法范围 ${FX_SPREAD_MIN}–${FX_SPREAD_MAX}%,服务器已拒绝,未写入`
                          : `拒绝:${p.name} 须在 ${p.min.toLocaleString("en-US")}–${p.max.toLocaleString("en-US")} ${p.unit}${p.integer ? "(整数)" : ""},非法值未写入`);
                        return;
                      }
                      setParam(`D.${p.key}`, String(n), { action: `汇率牌价调整 ${p.name} → ${p.fmt(String(n))}`, reason });
                      toast(`${p.name} 已更新为 ${p.fmt(String(n))} · 新付款单即时取新价`);
                    },
                  })}>调整</button>
                </div>
              );
            })}
            <div className="dtint ok" style={{ marginTop: 12 }}>
              <b>牌价怎么算</b> · 用户看到的牌价 = 基准价 × (1 + 买入点差),取整到十位:当前 {fmtV(base)} × (1 + {spread}%) = <b>{fmtV(quote)}</b>。派生值现场换算、不存第二份——改基准价或点差,全站牌价即刻同变,不存在两处数据打架。
            </div>
            <div className="dtint warn" style={{ marginTop: 10 }}>
              <b>调价不影响在途单</b> · 付款单上的牌价是下单那一刻锁定的快照(锁价 {lockMin} 分钟内有效),本页调价只对之后的新单生效;已在等转账的单子仍按它锁定的价结算,不重算、不追差。
            </div>
          </div>
        </section>

        {/* 生效历史 */}
        <section className="l-card">
          <div className="l-h">
            <span className="ttl">生效历史</span>
            <span className="sub">· 每次改动:前值 → 后值 / 操作者 / 时间 / 理由 · 与审计同链</span>
          </div>
          <div className="l-b" style={{ paddingTop: 4 }}>
            <table className="l-tbl">
              <thead>
                <tr><th>时间</th><th>参数</th><th>前值 → 后值</th><th>操作者</th><th>理由</th></tr>
              </thead>
              <tbody>
                {historyRows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.t}</td>
                    <td>{r.name}</td>
                    <td><span className="mono">{r.before}</span> → <b>{r.after}</b></td>
                    <td>{r.actor}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dtint" style={{ marginTop: 10 }}>
              <b>历史怎么来</b> · 本页每次确认生效的改动都会落审计并同步进这张表(最新在上);表里最早几条是上线以来的存量记录。真后台以审计流水为准,这里不允许手工补录或删改。
            </div>
          </div>
        </section>
      </div>

      <p className="f-foot"><b>「基准价 × 点差 = 牌价,锁价窗管快照」</b>就是这页的全部分工。牌价只在银行转账(VietQR)通道出现,余额、收益、提现等全站其余场景维持 USDT 单币展示;用户端只读取这里的配置现场换算,拉不到配置会置灰通道、不会拿旧价硬开。点差是法币入金的价差收入,越界(&gt;{FX_SPREAD_MAX}%)服务器直接拒绝;改动产 <b>admin.fx_quote_changed</b> 审计,对账口径见充值对账中心(D1)银行轨。</p>
    </>
  );
}
