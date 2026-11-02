"use client";

/**
 * G4 Genesis 经济 — 节点总量/单价/排放保底率/二级版税 + 排放开阀/空投占比/曲线/锁仓 + 一二级监控 + 排放派发 + 持有台账。
 * 分红延期改造(FEAT-GEN):收益锚从「平台交易量日分红」换成「NEX 协议排放」,且**上所后(genesisDivOpen M7)才开阀派发**——
 * 上所前(M1-6)只卖预留额度,不派发/不计提。双口径调和:展示口径 ≈$24/slot/日(上所后 NEX 排放等值,非上所前现金)
 * + 保底口径预提(节点价 × 0.1% = $10/节点/日 → 科目#4,计提起点随 M7 开阀)。
 * 市场熔断 = J.killswitch.genesis(J1 同键);geo = GEOBLOCK(J2 权威只读)。
 */
import { useState } from "react";
import Link from "next/link";
import { Drawer, PaginationExemption } from "../design-kit";
import { LEDGER } from "@/lib/mock/admin/ledger";
import { GEOBLOCK, fmtM } from "@/lib/mock/admin/design-data";
import { GENESIS, GENESIS_ELIGIBILITY_PARAMS, GENESIS_POOL_TODAY, GENESIS_PAYOUT_TODAY, GENESIS_NODES, GENESIS_NODE_DETAIL, G_FIN } from "./data";
import type { GenesisEligibilityParam, GenesisTier, GenesisPerk, GenesisOpsListing, GenesisActivityEvent } from "./data";
import type { GCtx } from "./types";

export function G4Genesis({ ctx }: { ctx: GCtx }) {
  const { pget, setParam, toast, openActionConfirm, openConfirm } = ctx;
  const [nodeDrawer, setNodeDrawer] = useState<string | null>(null);
  const cov = LEDGER.coverageRatio.toFixed(1);

  const marketOn = (pget("J.killswitch.genesis") ?? "on") === "on";
  const geoBlocked = GEOBLOCK.filter((g) => g.status === "blocked").map((g) => g.cc);
  const soldPct = (GENESIS.sold / GENESIS.totalSlots) * 100;
  const batchRerun = pget(`G.genesis.rerun.${GENESIS.todayBatch}`) === "done";

  const adjEco = (key: string, label: string, cur: string, note: string) => openActionConfirm({
    action: `Genesis 经济参数 · ${label}`,
    detail: <><b>{label}</b> · 当前 {cur} · {note}。运营执行门槛:财务主管/超管。</>,
    edit: { kind: "text", current: cur },
    run: (reason, v) => { if (v) setParam(`G.genesis.${key}`, v, { action: `Genesis 经济参数 ${label}`, reason }); toast(`${label} 已更新为 ${v}`); },
  });

  // 认购资格门(FEAT-GEN-ADM-G4b):写键 G.genesis.eligibility.<key> 与前端资格镜像单源。
  // 布尔/枚举 toggle/select 勾选不手输,数值 number 带单位+范围;全部走操作确认(理由必填+A2 审计),禁静默切换。
  const eligVal = (p: GenesisEligibilityParam) => pget(`G.genesis.eligibility.${p.key}`) ?? p.def;
  const adjElig = (p: GenesisEligibilityParam) => { const cur = eligVal(p); openActionConfirm({
    action: `认购资格门 · ${p.name}`,
    detail: <><b>{p.name}</b>(<span className="mono">G.genesis.eligibility.{p.key}</span>)· 当前 {cur}{p.kind === "number" && p.unit ? ` ${p.unit}` : ""} · {p.note}。确认后立即生效并同步前端认购资格口径。运营执行门槛:财务主管/超管。</>,
    edit: p.kind === "number"
      ? { kind: "number", current: cur, unit: p.unit, min: p.min, max: p.max, integer: p.integer }
      : { kind: p.kind, current: cur, options: p.options },
    run: (reason, v) => { if (v) setParam(`G.genesis.eligibility.${p.key}`, v, { action: `认购资格门 ${p.name}`, reason }); toast(`${p.name} 已更新为 ${v}${p.kind === "number" && p.unit ? ` ${p.unit}` : ""}`); },
  }); };
  const eligCustomized = GENESIS_ELIGIBILITY_PARAMS.some((p) => pget(`G.genesis.eligibility.${p.key}`) != null);
  const eligGateOn = (pget("G.genesis.eligibility.enabled") ?? (GENESIS.eligibility.enabled ? "开启" : "关闭")) === "开启";

  // ══════════════ FEAT-GEN09/GEN10 · 创世运营七卡 ══════════════
  // JSON-in-param 单源(仿 H3):pget → JSON.parse → 类型守卫 → 回退 seed;setParam 一次写 + 自带 A2 审计。
  const genFmt = (n: number) => n.toLocaleString("en-US");

  // ── 卡1 阶梯档位定价 ──
  const isTier = (x: unknown): x is GenesisTier =>
    !!x && typeof x === "object" &&
    typeof (x as GenesisTier).id === "string" &&
    typeof (x as GenesisTier).from === "number" && typeof (x as GenesisTier).to === "number" &&
    typeof (x as GenesisTier).priceUSDT === "number";
  const effectiveTiers = (): GenesisTier[] => {
    const raw = pget("G.genesis.tiers");
    if (raw) {
      try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length && a.every(isTier)) return a as GenesisTier[]; console.error("[G4] G.genesis.tiers 结构不符,回退 seed"); }
      catch (e) { console.error("[G4] G.genesis.tiers JSON 损坏,回退 seed", e); }
    }
    return GENESIS.tiers.map((t) => ({ ...t }));
  };
  // 档位健全性(与前端 sanitizeTiers 同口径):非空、from 连续、末档 to≥已售、价>0、整数。
  const tiersProblem = (list: GenesisTier[]): string | null => {
    if (!list.length) return "至少保留 1 档";
    let prev = 0;
    for (const t of list) {
      if (![t.from, t.to, t.priceUSDT].every(Number.isInteger)) return "边界与单价须为整数";
      if (t.priceUSDT <= 0) return "单价须大于 0";
      if (t.from !== prev) return "档位区间须连续(本档起始 = 上档截止)";
      if (t.to <= t.from) return "截止须大于起始";
      prev = t.to;
    }
    if (prev < GENESIS.sold) return `末档总量须 ≥ 已售 ${GENESIS.sold}`;
    return null;
  };
  const commitTiers = (next: GenesisTier[], action: string, reason: string): boolean => {
    const p = tiersProblem(next);
    if (p) { toast(`档位配置被拒:${p}`); return false; }
    setParam("G.genesis.tiers", JSON.stringify(next), { action, reason });
    return true;
  };
  const tiersView = effectiveTiers();
  const editTier = (i: number) => { const t = effectiveTiers()[i]; openActionConfirm({
    action: `编辑创世档位 · ${t.id}`,
    detail: <><b>{t.id}</b> 档 · 当前区间 [{genFmt(t.from)}, {genFmt(t.to)}) · 单价 ${genFmt(t.priceUSDT)} · 起始 {genFmt(t.from)} 由上档截止派生(保持连续,不单独编辑)· 改截止会顺移下一档起始。末档总量须 ≥ 已售 {GENESIS.sold};只影响未来供应与新购档价。</>,
    businessForm: { kind: "multi-field", title: `档位 ${t.id}`, hint: "截止 = 本档累计售出上界(下一档起点);单价 = 落在本档区间的每张价格。", fields: [
      { key: "to", label: "截止(累计售出上界)", inputKind: "number", current: String(t.to), integer: true, gt: t.from },
      { key: "priceUSDT", label: "单价(USDT)", inputKind: "number", current: String(t.priceUSDT), integer: true, gt: 0 },
    ] },
    run: (reason, _v, bv) => { if (!bv) return; const to = Number(bv.to), price = Number(bv.priceUSDT);
      const next = effectiveTiers().map((x) => ({ ...x }));
      next[i] = { ...next[i], to, priceUSDT: price };
      if (next[i + 1]) next[i + 1] = { ...next[i + 1], from: to }; // 顺移下一档起始保持连续
      if (commitTiers(next, `编辑创世档位 ${t.id}`, reason)) toast(`· 档位 ${t.id} 已更新为 [${genFmt(next[i].from)}, ${genFmt(to)}) · $${genFmt(price)}`);
    },
  }); };
  const addTier = () => { const list = effectiveTiers(); const last = list[list.length - 1]; openActionConfirm({
    action: "增开创世档位",
    detail: <>在末档 <b>{last.id}</b>(截止 {genFmt(last.to)})之后追加新档,起始 = {genFmt(last.to)},扩大总供应。新档单价通常应 ≥ 末档 ${genFmt(last.priceUSDT)}(跳价方向);只影响未来供应。</>,
    businessForm: { kind: "multi-field", title: "新档位", hint: `起始固定 = ${genFmt(last.to)}(上档截止)。`, fields: [
      { key: "to", label: "截止(累计售出上界)", inputKind: "number", placeholder: String(last.to + 500), integer: true, gt: last.to },
      { key: "priceUSDT", label: "单价(USDT)", inputKind: "number", placeholder: String(last.priceUSDT + 2000), integer: true, gt: 0 },
    ] },
    run: (reason, _v, bv) => { if (!bv) return; const to = Number(bv.to), price = Number(bv.priceUSDT);
      const cur = effectiveTiers(); const tail = cur[cur.length - 1];
      const usedNums = cur.map((x) => parseInt(String(x.id).replace(/^t/, ""), 10)).filter((n) => !Number.isNaN(n));
      const id = `t${(usedNums.length ? Math.max(...usedNums) : 0) + 1}`; // 唯一化:删中间档再增档不撞号
      const next = [...cur.map((x) => ({ ...x })), { id, from: tail.to, to, priceUSDT: price }];
      if (commitTiers(next, "增开创世档位", reason)) toast(`· 已增开档位 ${id} · [${genFmt(tail.to)}, ${genFmt(to)}) · $${genFmt(price)}`);
    },
  }); };
  const deleteTier = (i: number) => { const list = effectiveTiers(); if (list.length <= 1) { toast("至少保留 1 档,不能删除"); return; } const t = list[i]; openActionConfirm({
    action: `删除创世档位 · ${t.id}`,
    detail: <>从阶梯移除 <b>{t.id}</b> 档([{genFmt(t.from)}, {genFmt(t.to)}))· 相邻档自动补齐区间保持连续({i > 0 ? "上一档截止顺延" : "下一档起始归零"})· 在锁购买按开锁档价结算不追溯。</>,
    run: (reason) => {
      const next = effectiveTiers().map((x) => ({ ...x }));
      if (i > 0) next[i - 1] = { ...next[i - 1], to: next[i].to };
      else if (next[i + 1]) next[i + 1] = { ...next[i + 1], from: next[i].from };
      next.splice(i, 1);
      if (commitTiers(next, `删除创世档位 ${t.id}`, reason)) toast(`· 档位 ${t.id} 已删除 · 区间已补齐`);
    },
  }); };

  // ── 卡2/4 预售倒计时 + 商城上架 ──
  const isoLocal = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const saleStartRaw = pget("G.genesis.saleStartAt");
  const saleStartMs = saleStartRaw != null ? (saleStartRaw.trim() === "" ? null : Number(saleStartRaw)) : GENESIS.saleStartAt;
  const saleStartSet = saleStartMs != null && Number.isFinite(saleStartMs);
  const saleStartLabel = saleStartSet ? isoLocal(saleStartMs as number) : "未设定 · 默认立即开售";
  const preSaleLocked = saleStartSet && Date.now() < (saleStartMs as number);
  const showCountdownOn = (pget("G.genesis.showCountdown") ?? (GENESIS.showCountdown ? "开启" : "关闭")) === "开启";
  const showcaseOn = (pget("G.genesis.showcaseEnabled") ?? (GENESIS.showcaseEnabled ? "开启" : "关闭")) === "开启";
  const editSaleStart = () => openActionConfirm({
    action: "设定预售开售时间锚",
    detail: <>开售时间锚(<span className="mono">G.genesis.saleStartAt</span>)· 当前 {saleStartLabel} · <b>独立于 H1 上所开闸</b>(主人拍板,两者语义不混):此锚只控前端「即将开售」锁定,now &lt; 锚 = 未开售。留空 = 立即开售(不锁定)。</>,
    businessForm: { kind: "multi-field", title: "开售时间锚", hint: "格式 YYYY-MM-DD HH:mm(本地时区);留空 = 清除锚点,立即开售。", fields: [
      { key: "when", label: "开售时间", inputKind: "text", current: saleStartSet ? isoLocal(saleStartMs as number) : "", placeholder: "2026-08-01 20:00", allowEmpty: true, maxLength: 32 },
    ] },
    run: (reason, _v, bv) => { if (!bv) return; const s = (bv.when ?? "").trim();
      if (!s) { setParam("G.genesis.saleStartAt", "", { action: "清除预售开售锚(立即开售)", reason }); toast("· 已清除开售锚 · 立即开售"); return; }
      const ms = new Date(s.replace(" ", "T")).getTime();
      if (!Number.isFinite(ms)) { toast("开售时间无法解析(用 YYYY-MM-DD HH:mm)"); return; }
      setParam("G.genesis.saleStartAt", String(ms), { action: "设定预售开售锚", reason });
      toast(`· 开售锚已设为 ${isoLocal(ms)}`);
    },
  });
  const toggleShowCountdown = () => openActionConfirm({
    action: `${showCountdownOn ? "隐藏" : "显示"}预售倒计时`,
    detail: <>控制未开售时前端是否显示倒计时具体时间(<span className="mono">G.genesis.showCountdown</span>)· 当前 {showCountdownOn ? "显示" : "隐藏"} · 隐藏 = 只显「即将开售」不露具体开售点。</>,
    edit: { kind: "toggle", current: showCountdownOn ? "开启" : "关闭", options: ["开启", "关闭"] },
    run: (reason, v) => { if (!v) return; setParam("G.genesis.showCountdown", v, { action: "预售倒计时显隐", reason }); toast(`· 倒计时已${v === "开启" ? "显示" : "隐藏"}`); },
  });
  const toggleShowcase = () => openActionConfirm({
    action: `${showcaseOn ? "隐藏" : "显示"}商城尊享席位区`,
    detail: <>商城「尊享席位」区显隐总开关(<span className="mono">G.genesis.showcaseEnabled</span>)· 当前 {showcaseOn ? "显示" : "隐藏"} · 关闭 = 商城页整区不渲染,不影响预售页与二级市场(停售另走 J1 熔断)。</>,
    edit: { kind: "toggle", current: showcaseOn ? "开启" : "关闭", options: ["开启", "关闭"] },
    run: (reason, v) => { if (!v) return; setParam("G.genesis.showcaseEnabled", v, { action: "商城尊享席位显隐", reason }); toast(`· 商城尊享席位区已${v === "开启" ? "显示" : "隐藏"}`); },
  });

  // ── 卡3 预售页权益(4 项双语,空=回退 i18n)──
  const isPerk = (x: unknown): x is GenesisPerk =>
    !!x && typeof x === "object" &&
    typeof (x as GenesisPerk).nameZh === "string" && typeof (x as GenesisPerk).nameEn === "string" &&
    typeof (x as GenesisPerk).descZh === "string" && typeof (x as GenesisPerk).descEn === "string";
  const effectivePerks = (): GenesisPerk[] => {
    const raw = pget("G.genesis.perks");
    if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length === 4 && a.every(isPerk)) return a as GenesisPerk[]; console.error("[G4] G.genesis.perks 结构不符,回退 seed"); } catch (e) { console.error("[G4] G.genesis.perks JSON 损坏,回退 seed", e); } }
    return GENESIS.perks.map((p) => ({ ...p }));
  };
  const perksView = effectivePerks();
  const editPerk = (i: number) => { const p = effectivePerks()[i]; openActionConfirm({
    action: `编辑预售权益 · 第 ${i + 1} 项`,
    detail: <>预售页第 <b>{i + 1}</b> 项权益双语文案(<span className="mono">G.genesis.perks[{i}]</span>)· 四字段留空 = 前端回退内置 i18n 文案 · 文案运营可读不含工程名词。</>,
    businessForm: { kind: "multi-field", title: `权益 ${i + 1}`, hint: "留空 = 回退 i18n;中英文成对填写。", fields: [
      { key: "nameZh", label: "标题(中)", inputKind: "text", current: p.nameZh, allowEmpty: true, maxLength: 40 },
      { key: "nameEn", label: "标题(英)", inputKind: "text", current: p.nameEn, allowEmpty: true, maxLength: 60 },
      { key: "descZh", label: "描述(中)", inputKind: "text", current: p.descZh, allowEmpty: true, maxLength: 80, wide: true },
      { key: "descEn", label: "描述(英)", inputKind: "text", current: p.descEn, allowEmpty: true, maxLength: 120, wide: true },
    ] },
    run: (reason, _v, bv) => { if (!bv) return; const next = effectivePerks().map((x, j) => j === i ? { nameZh: bv.nameZh ?? "", nameEn: bv.nameEn ?? "", descZh: bv.descZh ?? "", descEn: bv.descEn ?? "" } : x);
      setParam("G.genesis.perks", JSON.stringify(next), { action: `编辑预售权益 第${i + 1}项`, reason });
      toast(`· 第 ${i + 1} 项权益已更新${(bv.nameZh ?? "").trim() ? "" : " · 空=回退 i18n"}`);
    },
  }); };

  // ── 卡5 二级市场运营挂单(JSON 行 CRUD)──
  const isOpsListing = (x: unknown): x is GenesisOpsListing =>
    !!x && typeof x === "object" &&
    typeof (x as GenesisOpsListing).tokenId === "number" && typeof (x as GenesisOpsListing).priceUSDT === "number" &&
    typeof (x as GenesisOpsListing).seller === "string";
  const effectiveListings = (): GenesisOpsListing[] => {
    const raw = pget("G.genesis.opsListings");
    if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.every(isOpsListing)) return a as GenesisOpsListing[]; console.error("[G4] G.genesis.opsListings 结构不符,回退 seed"); } catch (e) { console.error("[G4] G.genesis.opsListings JSON 损坏,回退 seed", e); } }
    return GENESIS.opsListings.map((l) => ({ ...l, traits: { ...l.traits } }));
  };
  const writeListings = (next: GenesisOpsListing[], action: string, reason: string) => setParam("G.genesis.opsListings", JSON.stringify(next), { action, reason });
  const listingsView = effectiveListings();
  const nextTokenId = () => Math.max(899, ...effectiveListings().map((l) => l.tokenId)) + 1; // 高位段 ≥900 避撞用户持仓
  const addListing = () => { const token = nextTokenId(); openActionConfirm({
    action: "新建二级运营挂单",
    detail: <>挂一张运营卖单(用户可真实承接)· token 自动分配 <b className="mono">#{token}</b>(高位段 ≥900 避撞用户持仓)· 承接走既有真实链(资格门 → 扣款 → 持有 → 入账),成交后自动移除。</>,
    businessForm: { kind: "multi-field", title: `挂单 #${token}`, hint: "价格 = 挂单价(USDT);卖家展示名 = 前端可见的脱敏地址/昵称。", fields: [
      { key: "priceUSDT", label: "挂单价(USDT)", inputKind: "number", placeholder: "14000", integer: true, gt: 0 },
      { key: "lastSaleUSDT", label: "上次成交价(USDT · 算涨跌)", inputKind: "number", placeholder: "11999", integer: true, gt: 0 },
      { key: "seller", label: "卖家展示名", inputKind: "text", placeholder: "0x7c1e…3b28", maxLength: 42 },
      { key: "boost", label: "加成标签", inputKind: "select", options: ["1.5×", "2.0×"] },
    ] },
    run: (reason, _v, bv) => { if (!bv) return;
      const listing: GenesisOpsListing = { tokenId: token, priceUSDT: Number(bv.priceUSDT), lastSaleUSDT: Number(bv.lastSaleUSDT), seller: bv.seller, listedAt: Date.now(), traits: { tier: `Founder #${token}`, boost: bv.boost || "1.5×", mintYear: 2026 }, source: "ops" };
      writeListings([...effectiveListings(), listing], `新建运营挂单 #${token}`, reason);
      toast(`· 已挂单 #${token} · $${genFmt(listing.priceUSDT)}`);
    },
  }); };
  const repriceListing = (token: number) => { const l = effectiveListings().find((x) => x.tokenId === token)!; openActionConfirm({
    action: `改价 · 挂单 #${token}`,
    detail: <>运营挂单 <b className="mono">#{token}</b> · 当前 ${genFmt(l.priceUSDT)} · 改挂单价只影响该卖单展示与承接价,不动其它挂单。</>,
    edit: { kind: "number", current: String(l.priceUSDT), unit: "USDT", gt: 0, integer: true },
    run: (reason, v) => { if (!v) return; const next = effectiveListings().map((x) => x.tokenId === token ? { ...x, priceUSDT: Number(v) } : x); writeListings(next, `改价运营挂单 #${token}`, reason); toast(`· #${token} 挂单价已改为 $${genFmt(Number(v))}`); },
  }); };
  const delistListing = (token: number) => openActionConfirm({
    action: `下架 · 挂单 #${token}`,
    detail: <>从二级盘面移除运营挂单 <b className="mono">#{token}</b> · 已承接的不受影响(承接即扣款入账);下架仅停止后续承接。</>,
    run: (reason) => { writeListings(effectiveListings().filter((x) => x.tokenId !== token), `下架运营挂单 #${token}`, reason); toast(`· #${token} 已下架`); },
  });

  // ── 卡6 FOMO 成交引擎 ──
  const fomoOn = (pget("G.genesis.fomoEnabled") ?? (GENESIS.fomoEnabled ? "开启" : "关闭")) === "开启";
  const fomoMin = Number(pget("G.genesis.fomoIntervalMinMs") ?? GENESIS.fomoIntervalMinMs);
  const fomoMax = Number(pget("G.genesis.fomoIntervalMaxMs") ?? GENESIS.fomoIntervalMaxMs);
  const fomoBand = Number(pget("G.genesis.fomoPriceBandPct") ?? GENESIS.fomoPriceBandPct);
  const fomoCap = Number(pget("G.genesis.fomoDailyCap") ?? GENESIS.fomoDailyCap);
  const msToMin = (ms: number) => `${(ms / 60000).toFixed(ms % 60000 ? 1 : 0)} 分钟`;
  const isActivity = (x: unknown): x is GenesisActivityEvent =>
    !!x && typeof x === "object" &&
    typeof (x as GenesisActivityEvent).id === "string" && typeof (x as GenesisActivityEvent).tokenId === "number" &&
    typeof (x as GenesisActivityEvent).from === "string" && typeof (x as GenesisActivityEvent).to === "string" &&
    typeof (x as GenesisActivityEvent).ts === "number";
  const effectiveFomoActivity = (): GenesisActivityEvent[] => {
    const raw = pget("G.genesis.fomoActivity");
    if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.every(isActivity)) return a as GenesisActivityEvent[]; console.error("[G4] G.genesis.fomoActivity 结构不符,回退 seed"); } catch (e) { console.error("[G4] G.genesis.fomoActivity JSON 损坏,回退 seed", e); } }
    return GENESIS.fomoActivity.map((a) => ({ ...a }));
  };
  const fomoActivityView = effectiveFomoActivity();
  const toggleFomo = () => openActionConfirm({
    action: `${fomoOn ? "关闭" : "开启"}虚拟成交引擎`,
    detail: <>虚拟成交自动引擎总开关(<span className="mono">G.genesis.fomoEnabled</span>)· 当前 {fomoOn ? "开启" : "关闭"} · 虚拟成交<b>不入账本、不动持仓、不改售出数</b>(物理解耦),只制造盘面活跃。关闭 = 只显真实成交 + 已注入历史。</>,
    edit: { kind: "toggle", current: fomoOn ? "开启" : "关闭", options: ["开启", "关闭"] },
    run: (reason, v) => { if (!v) return; setParam("G.genesis.fomoEnabled", v, { action: "FOMO 引擎开关", reason }); toast(`· 虚拟成交引擎已${v === "开启" ? "开启" : "关闭"}`); },
  });
  const editFomoParams = () => openActionConfirm({
    action: "编辑 FOMO 引擎参数",
    detail: <>虚拟成交生成参数 · 频率区间(下限 &lt; 上限)· 价格带 ∈ (0,1)= 地板价 ×(1±band)· 日上限防刷 · 当前 {msToMin(fomoMin)}–{msToMin(fomoMax)} · ±{(fomoBand * 100).toFixed(0)}% · 上限 {fomoCap}/日。</>,
    businessForm: { kind: "multi-field", title: "FOMO 引擎参数", hint: "频率单位毫秒(180000 = 3 分钟);价格带 0–1 小数;日上限为整数。", fields: [
      { key: "min", label: "生成间隔下限(ms)", inputKind: "number", current: String(fomoMin), integer: true, gt: 0 },
      { key: "max", label: "生成间隔上限(ms)", inputKind: "number", current: String(fomoMax), integer: true, gt: 0 },
      { key: "band", label: "价格带(0–1)", inputKind: "number", current: String(fomoBand), gt: 0, lt: 1 },
      { key: "cap", label: "单日上限(条)", inputKind: "number", current: String(fomoCap), integer: true, gt: 0 },
    ] },
    run: (reason, _v, bv) => { if (!bv) return; const min = Number(bv.min), max = Number(bv.max);
      if (!(min < max)) { toast("生成间隔下限须小于上限"); return; }
      setParam("G.genesis.fomoIntervalMinMs", String(min), { action: "FOMO 生成间隔下限", reason });
      setParam("G.genesis.fomoIntervalMaxMs", String(max), { action: "FOMO 生成间隔上限", reason });
      setParam("G.genesis.fomoPriceBandPct", String(Number(bv.band)), { action: "FOMO 价格带", reason });
      setParam("G.genesis.fomoDailyCap", String(Number(bv.cap)), { action: "FOMO 日上限", reason });
      toast(`· FOMO 参数已更新 · ${msToMin(min)}–${msToMin(max)} · ±${(Number(bv.band) * 100).toFixed(0)}% · ${bv.cap}/日`);
    },
  });
  const injectFomo = () => openActionConfirm({
    action: "手动注入虚拟成交",
    detail: <>注入一条虚拟成交流水(append <span className="mono">G.genesis.fomoActivity</span>)· <b>不入 bills 账本、不动持仓、不改售出数</b> · 与真实成交混排、用户不可分辨 · 买卖家用脱敏假名。</>,
    businessForm: { kind: "multi-field", title: "虚拟成交", hint: "token / 成交价 / 卖家 → 买家 假名;时间默认此刻。", fields: [
      { key: "tokenId", label: "Token 号", inputKind: "number", placeholder: "912", integer: true, gt: 0 },
      { key: "priceUSDT", label: "成交价(USDT)", inputKind: "number", placeholder: "13800", integer: true, gt: 0 },
      { key: "from", label: "卖家展示名", inputKind: "text", placeholder: "0x…a1", maxLength: 42 },
      { key: "to", label: "买家展示名", inputKind: "text", placeholder: "0x…f9", maxLength: 42 },
    ] },
    run: (reason, _v, bv) => { if (!bv) return;
      const ev: GenesisActivityEvent = { id: `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind: "sale", tokenId: Number(bv.tokenId), priceUSDT: Number(bv.priceUSDT), from: bv.from, to: bv.to, ts: Date.now() };
      setParam("G.genesis.fomoActivity", JSON.stringify([ev, ...effectiveFomoActivity()]), { action: `手动注入虚拟成交 #${ev.tokenId}`, reason });
      toast(`· 已注入虚拟成交 #${ev.tokenId} · $${genFmt(ev.priceUSDT ?? 0)}(不入账本)`);
    },
  });
  const removeFomoInject = (id: string, token: number) => openActionConfirm({
    action: `移除手动注单 · #${token}`,
    detail: <>从虚拟成交池移除该手动注单(#{token})· 仅影响展示,不涉任何账本/持仓。</>,
    run: (reason) => { setParam("G.genesis.fomoActivity", JSON.stringify(effectiveFomoActivity().filter((a) => a.id !== id)), { action: `移除手动虚拟成交 #${token}`, reason }); toast("· 手动注单已移除"); },
  });

  // ── 卡7 盘面统计(G.genesis.stats.*)──
  type StatRow = { key: string; name: string; sub: string; def: number; unit?: string };
  const STAT_ROWS: StatRow[] = [
    { key: "floor", name: "地板价", sub: "二级最低挂单价", def: GENESIS.marketStats.floor, unit: "USDT" },
    { key: "vol24h", name: "24h 成交量", sub: "近 24 小时二级成交额", def: GENESIS.marketStats.vol24h, unit: "USDT" },
    { key: "listed", name: "在挂数", sub: "当前二级在挂节点数", def: GENESIS.marketStats.listed, unit: "个" },
    { key: "owners", name: "持有人数", sub: "创世节点独立持有地址数", def: GENESIS.marketStats.owners, unit: "人" },
    { key: "floorDeltaPct", name: "7 日涨幅", sub: "地板价 7 日涨跌百分比", def: GENESIS.marketStats.floorDeltaPct, unit: "%" },
  ];
  const statVal = (r: StatRow) => pget(`G.genesis.stats.${r.key}`) ?? String(r.def);
  const editStat = (r: StatRow) => openActionConfirm({
    action: `盘面统计 · ${r.name}`,
    detail: <><b>{r.name}</b>(<span className="mono">G.genesis.stats.{r.key}</span>)· 当前 {statVal(r)}{r.unit ? ` ${r.unit}` : ""} · 纯前端展示统计可配,不影响真实成交/持仓。</>,
    edit: { kind: "number", current: statVal(r), unit: r.unit, min: 0 },
    run: (reason, v) => { if (v == null || v === "") return; setParam(`G.genesis.stats.${r.key}`, v, { action: `盘面统计 ${r.name}`, reason }); toast(`· ${r.name} 已更新为 ${v}${r.unit ? ` ${r.unit}` : ""}`); },
  });

  return (
    <>
      <div className="f-stats">
        <div className="f-stat ok"><div className="k">一级售出</div><div className="v">{GENESIS.sold} / {GENESIS.totalSlots.toLocaleString("en-US")}</div><div className="sub">${GENESIS.unitPrice.toLocaleString("en-US")} / 张 · 距售罄 {GENESIS.totalSlots - GENESIS.sold} 张</div></div>
        <div className="f-stat"><div className="k">排放承诺预提</div><div className="v">{fmtM(G_FIN.genesisAccrual)}</div><div className="sub">科目 #4 · 保底口径(节点价 × 0.1%)预提</div></div>
        <div className="f-stat cyan"><div className="k">二级地板价</div><div className="v">${(GENESIS.secondary.floor / 1000).toFixed(1)}K</div><div className="sub">24h 量 ${(GENESIS.secondary.vol24h / 1000).toFixed(0)}K · 在挂 {GENESIS.secondary.listed}</div></div>
        <div className="f-stat warn"><div className="k">市场熔断</div><div className="v">{marketOn ? "未启用" : "已熔断"}</div><div className="sub">证券类风险时一键停 · 联动 J1</div></div>
      </div>

      <div className="two-col r11" style={{ marginBottom: 16 }}>
        <section className="l-card">
          <div className="l-h">
            <span className="ttl">节点经济参数</span>
            <span className="sub">· 排放率改动最敏感</span>
          </div>
          <div className="l-b" style={{ paddingTop: 4 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 2 }}>一级售出进度 {GENESIS.sold} / {GENESIS.totalSlots.toLocaleString("en-US")}</div>
              <div className="sold"><i style={{ width: `${soldPct}%` }} /></div>
            </div>
            <div className="p-row"><div className="txt"><div className="k">节点总量</div><div className="s">不能低于已铸造量</div></div><span className="v">{pget("G.genesis.supply") ?? "1,000"}</span><button className="l-btn sm mc" onClick={() => adjEco("supply", "节点总量", pget("G.genesis.supply") ?? "1,000", `≥ 已售 ${GENESIS.sold} · 只影响未来供应`)}>调整</button></div>
            <div className="p-row"><div className="txt"><div className="k">一级单价</div><div className="s">在途购买锁价</div></div><span className="v">{pget("G.genesis.price") ?? "$9,999"}</span><button className="l-btn sm mc" onClick={() => adjEco("price", "一级单价", pget("G.genesis.price") ?? "$9,999", "只对新购生效")}>调整</button></div>
            <div className="p-row"><div className="txt"><div className="k">排放保底率 <span className="bdg ok" style={{ fontSize: 9 }}>基准 0.1%/日</span></div><div className="s">保底预提 = 节点价 × 持有量 × 0.1%/日(科目 #4);分红延期改造:计提起点随 genesisDivOpen(M7 上所)开阀,前期(M1-6)不计提</div></div><span className="v">{pget("G.genesis.dividend") ?? "0.1% / 日"}</span><button className="l-btn sm mc" onClick={() => openActionConfirm({
              action: "改每日排放率",
              detail: <>当前基准 <b>0.1%/日</b>。升排放率 = 放大 USDT 流出,确认放行时验备付金红线(当前 {cov}%,422);<b>偏离 0.1% 基准的任何调整必须在原因里附 PM 决议引用</b>。财务主管执行门槛:超管。</>,
              amplifies: true,
              edit: { kind: "text", current: pget("G.genesis.dividend") ?? "0.1% / 日" },
              run: (reason, v) => { if (v) setParam("G.genesis.dividend", v, { action: "Genesis 排放率调整", reason }); toast(`排放率已更新为 ${v} · 附 PM 决议引用`); },
            })}>调整</button></div>
            <div className="p-row"><div className="txt"><div className="k">二级版税</div><div className="s">卖家成交扣</div></div><span className="v">{pget("G.genesis.royalty") ?? "2.5%"}</span><button className="l-btn sm mc" onClick={() => adjEco("royalty", "二级版税", pget("G.genesis.royalty") ?? "2.5%", "范围 0–20% · 只对新成交")}>调整</button></div>
            <div className="p-row"><div className="txt"><div className="k">排放开阀 <span className="bdg ok" style={{ fontSize: 9 }}>H1 · genesisDivOpen</span></div><div className="s">分红延期改造:上所前(M1-6)关,M7 上所窗口起开。逐月旋钮权威在 H1 阶段调度器,本域只读</div></div><span className="v">M7 起开放</span></div>
            <div className="p-row"><div className="txt"><div className="k">空投占比 <span className="bdg ok" style={{ fontSize: 9 }}>节点+社区伞下</span></div><div className="s">创世层排放优先占 NEX 协议排放的比例(前期权益承诺入科目 #5)</div></div><span className="v">{pget("G.genesis.airdropPct") ?? "8%"}</span><button className="l-btn sm mc" onClick={() => openActionConfirm({
              action: "改空投占比",
              detail: <>创世层排放优先占比。升占比 = 放大 NEX 排放负债,确认放行时验备付金红线(当前 {cov}%,422);偏离基准需附 PM 决议引用。</>,
              amplifies: true,
              edit: { kind: "text", current: pget("G.genesis.airdropPct") ?? "8%" },
              run: (reason, v) => { if (v) setParam("G.genesis.airdropPct", v, { action: "Genesis 空投占比调整", reason }); toast(`空投占比已更新为 ${v} · 附 PM 决议`); },
            })}>调整</button></div>
            <div className="p-row"><div className="txt"><div className="k">排放曲线 <span className="bdg ok" style={{ fontSize: 9 }}>vesting</span></div><div className="s">上所后释放节奏:TGE 解锁 + 线性 + 减半(改曲线 = 改兑付节奏)</div></div><span className="v">{pget("G.genesis.emissionCurve") ?? "TGE 10% · 每 6 月减半"}</span><button className="l-btn sm mc" onClick={() => openActionConfirm({
              action: "改排放曲线",
              detail: <>上所后 vesting 释放曲线。加速释放 = 提前放大 NEX 负债,确认放行时验备付金红线(当前 {cov}%,422);附 PM 决议引用。</>,
              amplifies: true,
              edit: { kind: "text", current: pget("G.genesis.emissionCurve") ?? "TGE 10% · 每 6 月减半" },
              run: (reason, v) => { if (v) setParam("G.genesis.emissionCurve", v, { action: "Genesis 排放曲线调整", reason }); toast(`排放曲线已更新为 ${v} · 附 PM 决议`); },
            })}>调整</button></div>
            <div className="p-row"><div className="txt"><div className="k">OG 倍率锁仓期</div><div className="s">锁仓提升排放优先级的天数</div></div><span className="v">{pget("G.genesis.airdropLockDays") ?? "180 天"}</span><button className="l-btn sm mc" onClick={() => adjEco("airdropLockDays", "OG 倍率锁仓期", pget("G.genesis.airdropLockDays") ?? "180 天", "锁仓天数 · 影响 OG 排放倍率")}>调整</button></div>
          </div>
        </section>

        <section className="l-card">
          <div className="l-h">
            <span className="ttl">一二级市场</span>
            <span className="sub">· 实时 stats · 排放跟随 NFT</span>
            <div className="r">
              <button className="l-btn mc" onClick={() => openActionConfirm({
                action: marketOn ? "一二级市场熔断" : "恢复一二级市场",
                detail: marketOn
                  ? <>立即停一二级市场交易(证券类风险时用)。在锁排放按处置方案走(保留 / 暂停)。风控/合规执行门槛:超管,同步紧急开关矩阵(J1 genesis 闸)。</>
                  : <>恢复一二级市场 = 恢复高客单产品流转与排放派发,确认放行时核验 B1 覆盖率(当前 {cov}%),同步 J1。</>,
                amplifies: !marketOn,
                run: (reason) => { setParam("J.killswitch.genesis", marketOn ? "off" : "on", { action: marketOn ? "Genesis 市场熔断" : "Genesis 市场恢复", reason }); toast(`Genesis 市场已${marketOn ? "熔断" : "恢复"} · 同步 J1`); },
              })}>{marketOn ? "市场熔断" : "恢复市场"}</button>
              <Link href="/emergency/geo-block" className="l-btn">地域封锁(J2)→</Link>
            </div>
          </div>
          <div className="l-b">
            <div className="mk-tiles">
              <div className="t"><div className="k">地板价</div><div className="v">${(GENESIS.secondary.floor / 1000).toFixed(1)}K</div></div>
              <div className="t"><div className="k">24h 成交量</div><div className="v">${(GENESIS.secondary.vol24h / 1000).toFixed(0)}K</div></div>
              <div className="t"><div className="k">在挂</div><div className="v">{GENESIS.secondary.listed}</div></div>
              <div className="t"><div className="k">持有人</div><div className="v">{GENESIS.secondary.owners}</div></div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, margin: "14px 0 8px" }}>节点状态机</div>
            <div className="sm-strip">
              <span className="st ok">minted 售出/铸造</span><span className="ar">→</span>
              <span className="st ok">held 持有计排放额度</span><span className="ar">挂单 →</span>
              <span className="st">listed 二级挂单</span><span className="ar">成交扣 2.5% →</span>
              <span className="st">sold 排放跟随新持有者</span>
            </div>
            <div className="gtint" style={{ marginTop: 12 }}><b>排放与负债</b> · 分红延期改造:<b>上所后(genesisDivOpen M7 开阀)才计提+派发</b>——上所前(M1-6)只卖预留额度,不增负债不派发。开阀后按保底口径增应付负债(科目 4「Genesis 排放承诺」)、按排放批次记账(D4),带防重号(按日期去重,重跑不重复发)。二级转让时排放权跟着 NFT 走,不跟旧持有者。二级版税收入进网络金库。当前地域封锁:{geoBlocked.join(" / ")}(J2 制裁名单,只读)。</div>
          </div>
        </section>
      </div>

      {/* ══ 卡1 阶梯档位定价 ══ */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">阶梯档位定价</span>
          <span className="sub">· 累计售出落 [起始, 截止) 决定当前档单价 · 售罄硬跳价 <span className="mono">G.genesis.tiers</span></span>
          <div className="r"><button className="l-btn sm mc" onClick={addTier}>+ 增档</button></div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="l-tbl" style={{ minWidth: 720 }}>
            <thead><tr><th>档位</th><th className="num">起始(含)</th><th className="num">截止(不含)</th><th className="num">单价 USDT</th><th style={{ textAlign: "right" }}>动作</th></tr></thead>
            <tbody>{tiersView.map((t, i) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600, color: "var(--ink)" }}>{t.id}{i === tiersView.length - 1 && <span className="bdg ok" style={{ fontSize: 9, marginLeft: 6 }}>末档</span>}</td>
                <td className="num mono">{genFmt(t.from)}</td>
                <td className="num mono">{genFmt(t.to)}</td>
                <td className="num mono" style={{ fontWeight: 700 }}>${genFmt(t.priceUSDT)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="l-btn sm mc" onClick={() => editTier(i)}>编辑</button>{" "}
                  <button className="l-btn sm mc" style={tiersView.length <= 1 ? { opacity: 0.4, cursor: "not-allowed" } : { color: "var(--danger)" }} disabled={tiersView.length <= 1} onClick={() => deleteTier(i)}>删档</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <PaginationExemption label="Genesis 阶梯档位表" maxRows={8} reason="阶梯档位数量少且需一屏纵向比较跳价关系,分页会破坏连续区间审核。" />
        </div>
        <div className="gtint" style={{ margin: "0 12px 12px" }}><b>档价随累计售出派生</b> · 前端 tierForSold 单源零逻辑改;改价/边界/增删只影响未来供应,在锁购买按开锁档价结算。总量须 ≥ 已售 {GENESIS.sold};非连续/总量不足前端 fail-closed 回退默认。</div>
      </section>

      {/* ══ 卡2/4 预售控制:开售时间锚 + 倒计时显隐 + 商城上架 ══ */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">预售控制</span>
          <span className="sub">· 开售时间锚 + 倒计时显隐 + 商城尊享席位上架</span>
          <div className="r">{preSaleLocked ? <span className="bdg warn">预售未开始 · 前端锁定中</span> : <span className="bdg ok">已开售 · 常态</span>}</div>
        </div>
        <div className="l-b" style={{ paddingTop: 4 }}>
          <div className="p-row"><div className="txt"><div className="k">开售时间锚 <span className="mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--ink-4)" }}>saleStartAt</span></div><div className="s">now &lt; 锚 = 未开售(资格门/购买入口在倒计时之下不可达)· 独立于 H1 上所开闸(主人拍板)· 留空 = 立即开售</div></div><span className="v">{saleStartLabel}</span><button className="l-btn sm mc" onClick={editSaleStart}>设定</button></div>
          <div className="p-row"><div className="txt"><div className="k">显示倒计时 <span className="mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--ink-4)" }}>showCountdown</span></div><div className="s">未开售时前端是否露出具体时间;关 = 只显「即将开售」</div></div><span className="v">{showCountdownOn ? "显示" : "隐藏"}</span><button className="l-btn sm mc" onClick={toggleShowCountdown}>调整</button></div>
          <div className="p-row"><div className="txt"><div className="k">商城尊享席位 <span className="mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--ink-4)" }}>showcaseEnabled</span></div><div className="s">商城页「尊享席位」区显隐总开关;关 = 整区不渲染(不影响预售页/二级市场)</div></div><span className="v">{showcaseOn ? "上架中" : "已隐藏"}</span><button className="l-btn sm mc" onClick={toggleShowcase}>调整</button></div>
        </div>
      </section>

      {/* ══ 卡3 预售页权益 ══ */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">预售页权益</span>
          <span className="sub">· 预售页 4 项权益双语文案 <span className="mono">G.genesis.perks</span> · 留空 = 回退内置 i18n</span>
        </div>
        <div className="l-b" style={{ paddingTop: 4 }}>
          {perksView.map((p, i) => {
            const filled = (p.nameZh || p.nameEn || p.descZh || p.descEn).trim().length > 0;
            return (
              <div className="p-row" key={i}>
                <div className="txt">
                  <div className="k">第 {i + 1} 项 {filled ? null : <span className="bdg dim" style={{ fontSize: 9 }}>回退 i18n</span>}</div>
                  <div className="s">{filled ? `${p.nameZh || p.nameEn}${p.descZh || p.descEn ? ` · ${p.descZh || p.descEn}` : ""}` : "未配置 · 前端使用内置文案"}</div>
                </div>
                <span className="v" style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{filled ? (p.nameEn || "—") : "—"}</span>
                <button className="l-btn sm mc" onClick={() => editPerk(i)}>编辑</button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ 卡5 二级市场运营挂单 ══ */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">二级市场运营挂单</span>
          <span className="sub">· 运营卖单(用户可真实承接)· token 高位段 ≥900 <span className="mono">G.genesis.opsListings</span></span>
          <div className="r"><button className="l-btn sm mc" onClick={addListing}>+ 新建挂单</button></div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="l-tbl" style={{ minWidth: 720 }}>
            <thead><tr><th>Token</th><th className="num">挂单价</th><th>卖家展示名</th><th>来源</th><th>状态</th><th style={{ textAlign: "right" }}>动作</th></tr></thead>
            <tbody>{listingsView.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-4)", padding: "18px 0" }}>暂无运营挂单 · 点右上「新建挂单」发布</td></tr>
            ) : listingsView.map((l) => (
              <tr key={l.tokenId}>
                <td className="mono" style={{ color: "var(--ink)" }}>#{l.tokenId}</td>
                <td className="num mono" style={{ fontWeight: 700 }}>${genFmt(l.priceUSDT)}</td>
                <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{l.seller}</td>
                <td><span className="bdg dim" style={{ fontSize: 9 }}>运营</span></td>
                <td><span className="bdg ok">在挂</span></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="l-btn sm mc" onClick={() => repriceListing(l.tokenId)}>改价</button>{" "}
                  <button className="l-btn sm mc" style={{ color: "var(--danger)" }} onClick={() => delistListing(l.tokenId)}>下架</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <PaginationExemption label="Genesis 二级运营挂单表" maxRows={20} reason="运营挂单为少量高客单卖盘,一屏管理便于比对价格,承接后由 server 单源回写移除。" />
        </div>
      </section>

      {/* ══ 卡6 FOMO 成交引擎 ══ */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">FOMO 成交引擎</span>
          <span className="sub">· 虚拟成交自动引擎 + 手动注单 · <b>物理解耦</b>不入账本/不动持仓/不改售出数</span>
          <div className="r">
            <span className={`bdg ${fomoOn ? "ok" : "dim"}`} style={{ marginRight: 8 }}>{fomoOn ? "引擎开启" : "引擎关闭"}</span>
            <button className="l-btn sm mc" onClick={toggleFomo}>{fomoOn ? "关闭引擎" : "开启引擎"}</button>
          </div>
        </div>
        <div className="l-b" style={{ paddingTop: 4 }}>
          <div className="mk-tiles">
            <div className="t"><div className="k">生成间隔</div><div className="v">{msToMin(fomoMin)}–{msToMin(fomoMax)}</div></div>
            <div className="t"><div className="k">价格带</div><div className="v">地板 ±{(fomoBand * 100).toFixed(0)}%</div></div>
            <div className="t"><div className="k">单日上限</div><div className="v">{fomoCap} 条</div></div>
            <div className="t"><div className="k">手动注单</div><div className="v">{fomoActivityView.length} 条</div></div>
          </div>
          <div className="l-h" style={{ marginTop: 12, border: 0, paddingBottom: 0 }}>
            <span className="ttl" style={{ fontSize: 13 }}>引擎参数与手动注单</span>
            <div className="r">
              <button className="l-btn sm mc" onClick={editFomoParams}>编辑参数</button>
              <button className="l-btn sm mc" onClick={injectFomo}>+ 注入成交</button>
            </div>
          </div>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table className="l-tbl" style={{ minWidth: 620 }}>
              <thead><tr><th>Token</th><th className="num">成交价</th><th>卖家 → 买家</th><th>时间</th><th style={{ textAlign: "right" }}>动作</th></tr></thead>
              <tbody>{fomoActivityView.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-4)", padding: "18px 0" }}>暂无手动注单 · 引擎自动成交为运行时生成不持久 · 点「注入成交」手动补一条</td></tr>
              ) : fomoActivityView.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ color: "var(--ink)" }}>#{a.tokenId}</td>
                  <td className="num mono" style={{ fontWeight: 700 }}>{a.priceUSDT != null ? `$${genFmt(a.priceUSDT)}` : "—"}</td>
                  <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{a.from} → {a.to}</td>
                  <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{isoLocal(a.ts)}</td>
                  <td style={{ textAlign: "right" }}><button className="l-btn sm mc" style={{ color: "var(--danger)" }} onClick={() => removeFomoInject(a.id, a.tokenId)}>移除</button></td>
                </tr>
              ))}</tbody>
            </table>
            <PaginationExemption label="Genesis 手动虚拟成交注单表" maxRows={20} reason="手动注单为少量运营补充流水,与真实成交混排展示,一屏核对注入历史。" />
          </div>
        </div>
      </section>

      {/* ══ 卡7 盘面统计 ══ */}
      <section className="l-card">
        <div className="l-h">
          <span className="ttl">盘面统计(前端展示)</span>
          <span className="sub">· 二级市场顶部展示统计 · 纯展示可配 <span className="mono">G.genesis.stats.*</span></span>
        </div>
        <div className="l-b" style={{ paddingTop: 4 }}>
          {STAT_ROWS.map((r) => (
            <div className="p-row" key={r.key}>
              <div className="txt">
                <div className="k">{r.name} <span className="mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--ink-4)" }}>stats.{r.key}</span></div>
                <div className="s">{r.sub}</div>
              </div>
              <span className="v">{r.unit === "USDT" ? "$" : ""}{genFmt(Number(statVal(r)))}{r.unit && r.unit !== "USDT" ? ` ${r.unit}` : ""}</span>
              <button className="l-btn sm mc" onClick={() => editStat(r)}>调整</button>
            </div>
          ))}
        </div>
        <div className="gtint" style={{ margin: "0 12px 12px" }}><b>纯前端展示口径</b> · 替换前端 marketplace 硬编码 floor/vol/listed/owners/涨幅;可配但不影响真实成交/持仓/账本。与上方「一二级市场」卡的实时监控是两回事(那是 admin 侧真实盘口)。</div>
      </section>

      <section className="l-card">
        <div className="l-h">
          <span className="ttl">认购资格门</span>
          <span className="sub">· 创世认购前置资格 · 与前端认购资格口径镜像单源 <span className="mono">G.genesis.eligibility.*</span></span>
          <div className="r">
            {!eligCustomized && <span className="bdg ok">默认配置生效中</span>}
            {!eligGateOn && <span className="bdg warn">资格门已关闭 · 认购对全员开放</span>}
          </div>
        </div>
        <div className="l-b" style={{ paddingTop: 4 }}>
          {GENESIS_ELIGIBILITY_PARAMS.map((p) => (
            <div className="p-row" key={p.key}>
              <div className="txt">
                <div className="k">{p.name} <span className="mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--ink-4)" }}>eligibility.{p.key}</span></div>
                <div className="s">{p.sub}</div>
              </div>
              <span className="v">{eligVal(p)}{p.kind === "number" && p.unit ? ` ${p.unit}` : ""}</span>
              <button className="l-btn sm mc" onClick={() => adjElig(p)}>调整</button>
            </div>
          ))}
        </div>
      </section>

      <section className="l-card">
        <div className="l-h">
          <span className="ttl">排放派发监控</span>
          <span className="sub">· 上所后(genesisDivOpen M7)开阀才派发 · 展示口径 ≈ 交易量基数 × 0.1% ÷ 1,000 slot 的 NEX 等值 · 预提 = 节点价 × 0.1% 保底(科目 #4)</span>
          <div className="r">
            <button className="l-btn mc" onClick={() => openActionConfirm({
              action: "调整排放基数口径",
              detail: <>当前:派发池 = <b>平台日交易量 × 0.1% ÷ 1,000 slot 均分</b>(${GENESIS.perSlotPerDay}/slot/日);负债预提按节点价 × 0.1% 保底。改基数口径(换基数、换均分方式)= 改排放算法,直接影响每日应付——确认放行时验备付金红线(422),必须附 PM 决议引用。财务主管执行门槛:超管。</>,
              amplifies: true,
              edit: { kind: "text", current: "平台日交易量 × 0.1% ÷ 1,000" },
              run: (reason, v) => { if (v) setParam("G.genesis.divBase", v, { action: "Genesis 排放基数口径调整", reason }); toast("基数口径调整已确认生效 · 附 PM 决议"); },
            })}>调整基数口径(操作确认)</button>
            <button className="l-btn" onClick={() => openConfirm({
              action: `重跑今日排放批次 ${GENESIS.todayBatch}`,
              detail: "批次按日期带防重号:已发过的户不会重复发,只补发失败户。重跑结果落审计。",
              chips: [["按日期防重 · 只补失败户", "done"], ["落审计", "ready"]], reason: true, okLabel: "确认重跑",
              run: (reason) => { setParam(`G.genesis.rerun.${GENESIS.todayBatch}`, "done", { action: `重跑排放批次 ${GENESIS.todayBatch}`, reason }); toast(`${GENESIS.todayBatch} 重跑完成 · 补发 0 户(无失败)`); },
            })}>重跑今日批次{batchRerun ? "(已重跑)" : ""}</button>
          </div>
        </div>
        <div className="l-b">
          <div className="mk-tiles">
            <div className="t"><div className="k">平台日交易量基数(今日)</div><div className="v">${(GENESIS.dailyVolumeBase / 1e6).toFixed(1)}M</div></div>
            <div className="t"><div className="k">今日排放池(基数 × 0.1%)</div><div className="v" style={{ color: "var(--success)" }}>${(GENESIS_POOL_TODAY / 1000).toFixed(1)}K</div></div>
            <div className="t"><div className="k">每 slot 均分(÷ 1,000)</div><div className="v">${GENESIS.perSlotPerDay} / 天</div></div>
            <div className="t"><div className="k">今日批次 {GENESIS.todayBatch}</div><div className="v" style={{ color: "var(--success)" }}>已派 {GENESIS.sold} 户 · ${(GENESIS_PAYOUT_TODAY / 1000).toFixed(1)}K</div></div>
          </div>
          <div className="gtint" style={{ marginTop: 12 }}><b>两套口径怎么对上</b> · 分红延期改造:<b>以下均为上所后(genesisDivOpen M7 开阀)口径,上所前(M1-6)不派发/不计提</b>。用户看到的是「NEX 协议排放」按额度优先释放,等值展示 ≈ 交易量基数 × 0.1% ÷ slot(当前 ${GENESIS.perSlotPerDay}/slot/日的 NEX 等值,非现金;未售出 slot 份额留存金库);财务预提负债按「节点价 × 持有量 × 0.1%/日 = ${GENESIS.floorPerNodePerDay}/节点/日」保底挂科目 #4——展示口径高出保底的部分从排放池释放,不占预提。实际派发流量(上所后已计 {GENESIS.sold} 户 × ${GENESIS.perSlotPerDay} 等值 ≈ ${(GENESIS_PAYOUT_TODAY / 1000).toFixed(1)}K/日)进资金池到期预测(D3)。改排放曲线/基数口径 = 改兑付算法,操作确认 + 附 PM 决议引用。</div>
        </div>
      </section>

      <section className="l-card">
        <div className="l-h">
          <span className="ttl">节点持有台账</span>
          <span className="sub">· 只读 · 服务器单源,序号伪造不了 · 二级转让后 lifetime 排放跟随新持有者</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="l-tbl" style={{ minWidth: 760 }}>
            <thead><tr><th>节点</th><th>持有者(脱敏)</th><th>来源</th><th className="num">lifetime 排放</th><th>状态</th></tr></thead>
            <tbody>{GENESIS_NODES.map((n) => (
              <tr key={n[0]} className="click" onClick={() => setNodeDrawer(n[0])}>
                <td className="mono" style={{ color: "var(--ink)" }}>{n[0]} <span className="more">详情›</span></td>
                <td className="mono">{n[1]}</td><td>{n[2]}</td>
                <td className="num mono">{n[3]}</td>
                <td><span className={`bdg ${n[5]}`}>{n[4]}</span></td>
              </tr>
            ))}</tbody>
          </table>
          <PaginationExemption
            label="Genesis 节点持有台账"
            maxRows={5}
            reason="当前为只读监控样例和节点详情入口,全量一屏展示比分页更利于核对排放跟随关系。"
          />
        </div>
      </section>

      <p className="f-foot"><b>持有、排放、二级成交全部服务器为准</b>:节点序号和排放服务端单源,客户端伪造持有/排放无效;空持有就显示真实空状态。<b>每日排放率基准 0.1%/日</b>——保底预提按节点价 × 持有量 × 0.1%/日挂科目 #4,基数口径(日交易量 × 0.1% ÷ 1,000 slot)派发、超出保底部分当期化。升排放率/改基数口径先过备付金红线(422),偏离 0.1% 基准要附 PM 决议引用。市场熔断 + 地域封锁是紧急开关矩阵(J1)的生效面(证券类风险 / 国家级屏蔽)。</p>

      {nodeDrawer && (() => { const n = GENESIS_NODES.find((x) => x[0] === nodeDrawer)!; const d = GENESIS_NODE_DETAIL[nodeDrawer]; return (
        <Drawer title={`Genesis 节点 · ${nodeDrawer}`} sub={`持有者 ${n[1]} · ${n[4]} · 购入:${d.buy}`} onClose={() => setNodeDrawer(null)}
          footer={<button className="l-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => setNodeDrawer(null)}>关闭</button>}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>排放</div>
          {d.div.map(([k, v]) => (
            <div className="kv2" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
          ))}
          <div style={{ fontSize: 13, fontWeight: 600, margin: "14px 0 8px" }}>二级流转记录</div>
          <table className="l-tbl">
            <thead><tr><th>时间</th><th>事件</th><th>版税</th></tr></thead>
            <tbody>{d.xfer.map((x, i) => (
              <tr key={i}><td className="mono">{x[0]}</td><td style={{ fontSize: 12 }}>{x[1]}</td><td style={{ fontSize: 12, color: "var(--ink-3)" }}>{x[2]}</td></tr>
            ))}</tbody>
          </table>
          <div className="gtint" style={{ marginTop: 12 }}><b>只读监控</b> · 排放双口径(基数派发 / 保底预提)见派发监控卡;调排放率/版税去经济参数(操作确认 + 过红线)。市场熔断/地域封锁是 J1 矩阵生效面。</div>
        </Drawer>
      ); })()}
    </>
  );
}
