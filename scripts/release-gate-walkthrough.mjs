// FEAT-DEV02b 上架门×置换融合走查:三态断言。
// Pass A 默认关:P1 账户 retire 列表排除未上架 SKU;深链 pro-v2 被弹回 store。
// Pass B 临时开启(源码 sed enabled:true+leadDays:100,HMR):列表含 pro-v2 带
//        「抢先升级」标;选中→确认→去结算,携置换上下文不被弹回。测后还原。
// Pass C pin P5(全面上架):列表回满、无抢先标。
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const baseUrl = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const PHASE_FILE = "src/store/product-phase.ts";
const results = [];
let failed = 0;
const check = (n, ok, d = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) failed++; };

function setEarlyAccess(enabled, leadDays) {
  let s = readFileSync(PHASE_FILE, "utf8");
  s = s.replace(/enabled: (true|false),/, `enabled: ${enabled},`);
  s = s.replace(/leadDays: \d+,/, `leadDays: ${leadDays},`);
  writeFileSync(PHASE_FILE, s);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(8000);
process.on("uncaughtException", async (e) => {
  results.push(`CRASH  ${e.message?.split("\n")[0]}`);
  setEarlyAccess(false, 30);
  console.log(results.join("\n"));
  await browser.close().catch(() => {});
  process.exit(1);
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
async function resolveUi() {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((x) => x !== page.mainFrame());
    if (f) return f;
    await page.waitForTimeout(150);
  }
  return page.mainFrame();
}
let ui = await resolveUi();

async function inApp(fnText, arg) {
  return ui.evaluate(async ({ fnText, arg }) => {
    const stores = {};
    stores.app = (await import("/src/store/app.ts")).useApp();
    stores.sheet = (await import("/src/store/tradein-sheet.ts")).useTradeinSheet();
    stores.locale = (await import("/src/store/locale.ts")).useLocaleStore();
    stores.override = (await import("/src/store/product-phase.ts")).useProductPhaseOverride();
    stores.orders = (await import("/src/store/orders.ts")).useOrders();
    const dt = await import("/src/store/device-types.ts");
    return eval(`(${fnText})`)(stores, dt, arg);
  }, { fnText: fnText.toString(), arg });
}
async function domClick(pattern, nth = 0) {
  const r = await ui.evaluate(({ src, flags, nth }) => {
    const re = new RegExp(src, flags);
    const nodes = [...document.querySelectorAll("uni-view, uni-text, span")]
      .filter((el) => re.test((el.textContent || "").replace(/\s+/g, " ").trim()));
    const inner = nodes.filter((el) => !nodes.some((o) => o !== el && el.contains(o)));
    const t = inner[nth];
    if (!t) return { ok: false, count: inner.length };
    t.click();
    return { ok: true };
  }, { src: pattern.source, flags: pattern.flags, nth });
  if (!r.ok) throw new Error(`domClick no match: ${pattern}`);
}
const bodyText = async () => (await ui.locator("body").innerText()).replace(/\s+/g, " ");

// fixture:一台 s1(paid 649, cum 100),P1 账户(joinedAt=30 天前的种子)
await inApp((s, dt) => {
  s.locale.setLocale("zh");
  s.override.setPinned(null);
  const d = { ...dt.createDevice("stellarbox-s1", "s1-rg-1"), activatedAt: null, currentTask: null, cumulativeEarningsUsdt: 100, paidPriceUsdt: 649 };
  s.app.devices = [d];
  s.app.persistAccountSnapshot();
});

// ── Pass A:默认关 ──
await page.goto(`${baseUrl}/#/pages/me/devices`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await domClick(/^升级置换$/);
await page.waitForTimeout(400);
let t = await bodyText();
const optA = await ui.getByText(/抵后约 \$/).count();
check("A 默认关: retire 目标只剩已上架 2 台", optA === 2, `got ${optA}`);
check("A 默认关: 不含未上架 Pro v2/Rack P2", !t.includes("Pro v2") && !t.includes("Rack P2"));
check("A 默认关: 无抢先标", !t.includes("抢先升级"));
await domClick(/^取消$/);
await page.waitForTimeout(300);
// 深链未上架 SKU(无置换上下文)→ 弹回 store
await page.goto(`${baseUrl}/#/pages/store/checkout?product=stellarbox-pro-v2`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);
const hashA = await page.evaluate(() => location.hash);
check("A 默认关: 深链未上架 SKU 被弹回 /store", hashA.includes("/pages/store/store"), hashA);

// ── Pass B:临时开启(enabled:true, leadDays:100 → P3 月4−3.33=0.67 ≤ 月1 ✓ pro-v2 入窗;rack-p2 月8−3.33 仍排除) ──
// sed 后必须真实整页 reload 统一模块图(HMR 会造成「已加载页持旧配置模块」的双实例伪影,
// 产品真实场景=配置全量下发无双版本;fixture 已持久化,reload 后仍在)。
setEarlyAccess(true, 100);
await page.waitForTimeout(2000);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);
ui = await resolveUi();
await page.goto(`${baseUrl}/#/pages/me/devices`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
await domClick(/^升级置换$/);
await page.waitForTimeout(400);
t = await bodyText();
const optB = await ui.getByText(/抵后约 \$/).count();
check("B 开启: 窗口内 pro-v2 进入目标(3 台)", optB === 3, `got ${optB}`);
check("B 开启: pro-v2 行带「抢先升级」标", /Pro v2[^|]*抢先升级/.test(t));
check("B 开启: 窗口外 rack-p2 仍排除", !t.includes("Rack P2"));
// 选 pro-v2 → 确认 → 去结算:携上下文 + 窗口 → 不被弹回
await domClick(/NexGridBox Pro v2/);
await page.waitForTimeout(400);
const dbgPre = await ui.evaluate(async () => {
  const pp = await import("/src/store/product-phase.ts");
  const { useTradeinSheet } = await import("/src/store/tradein-sheet.ts");
  const { useApp } = await import("/src/store/app.ts");
  const months = pp.getMonthsSince(useApp().user.joinedAt);
  return { enabled: pp.TRADEIN_EARLY_ACCESS.enabled, lead: pp.TRADEIN_EARLY_ACCESS.leadDays, months: +months.toFixed(3), winOk: pp.tradeInEarlyWindowOk("P3", months), applied: useTradeinSheet().appliedTradein };
});
results.push(`DBG-pre-confirm ${JSON.stringify(dbgPre)}`);
await domClick(/确认置换 · 去结算/);
await page.waitForTimeout(600);
const dbgPost = await ui.evaluate(async () => {
  const { useTradeinSheet } = await import("/src/store/tradein-sheet.ts");
  return { applied: useTradeinSheet().appliedTradein, hash: location.hash };
});
results.push(`DBG-post-confirm ${JSON.stringify(dbgPost)}`);
await page.waitForTimeout(900);
const hashB = await page.evaluate(() => location.hash);
t = await bodyText();
check("B 开启: 置换上下文深达结算不被弹回", hashB.includes("checkout") && hashB.includes("stellarbox-pro-v2"), hashB);
check("B 开启: 结算页带抵扣行", t.includes("抵扣 −$486.75"));

// ── B-F1:移除抵扣 → 尝试支付未上架机 → 支付时复验拒单(对抗审查 F1 修复断言) ──
await domClick(/^移除$/);
await page.waitForTimeout(400);
t = await bodyText();
check("B-F1: 移除后恢复全价", t.includes("$1,319") && !t.includes("−$486.75"));
await domClick(/^继续$/);
await page.waitForTimeout(500);
await domClick(/^立即支付$/);
await page.waitForTimeout(600);
await domClick(/我已完成支付/);
await page.waitForTimeout(4200); // awaiting 2.4s → persist 复验 → 拒单回 select-payment
const f1 = await inApp((s) => ({
  orders: s.orders.orders.filter((o) => o.productId === "stellarbox-pro-v2").length,
  hasOld: s.app.devices.some((d) => d.id === "s1-rg-1"),
}));
t = await bodyText();
check("B-F1: 无抵扣支付未上架机被拒(0 订单)", f1.orders === 0, JSON.stringify(f1));
check("B-F1: 旧机保留 + 弹回支付步", f1.hasOld && t.includes("继续"));

// ── B-F1b:重新携抵扣上下文 → 支付成功(开启态正常链路补覆盖) ──
await inApp((s) => s.sheet.applyTradein("s1-rg-1", "stellarbox-pro-v2"));
await page.waitForTimeout(500);
await domClick(/^继续$/);
await page.waitForTimeout(500);
await domClick(/^立即支付$/);
await page.waitForTimeout(600);
await domClick(/我已完成支付/);
let paid = null;
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(500);
  paid = await inApp((s) => {
    const o = s.orders.orders.find((x) => x.productId === "stellarbox-pro-v2");
    return o ? { credit: o.tradeInCredit, total: o.total, hasOld: s.app.devices.some((d) => d.id === "s1-rg-1") } : null;
  });
  if (paid) break;
}
check("B-F1b: 携上下文支付成功(抵扣 486.75/净 832.25/旧机移除)", !!paid && paid.credit === 486.75 && paid.total === 832.25 && !paid.hasOld, JSON.stringify(paid));

setEarlyAccess(false, 30);
await page.waitForTimeout(2000);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);
ui = await resolveUi();

// ── Pass C:pin P5(全面上架) ──(B-F1b 已把 fixture 真置换掉,重注入)
await inApp((s, dt) => {
  s.sheet.hide();
  s.sheet.clearApplied();
  s.override.setPinned("P5");
  const d = { ...dt.createDevice("stellarbox-s1", "s1-rg-2"), activatedAt: null, currentTask: null, cumulativeEarningsUsdt: 100, paidPriceUsdt: 649 };
  s.app.devices = [d];
  s.app.persistAccountSnapshot();
});
await page.goto(`${baseUrl}/#/pages/me/devices`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
await domClick(/^升级置换$/);
await page.waitForTimeout(400);
t = await bodyText();
const optC = await ui.getByText(/抵后约 \$/).count();
check("C pin P5: 全面上架列表回 4 台", optC === 4, `got ${optC}`);
check("C pin P5: 无抢先标(released 分支)", !t.includes("抢先升级"));
await inApp((s) => s.override.setPinned(null));

check("console/pageerror = 0", errors.length === 0, errors.slice(0, 2).join(" | "));
console.log(results.join("\n"));
console.log(`\n━━ ${results.length - failed}/${results.length} pass ━━`);
await browser.close();
process.exit(failed ? 1 : 0);
