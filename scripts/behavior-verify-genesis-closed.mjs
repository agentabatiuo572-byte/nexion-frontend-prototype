#!/usr/bin/env node
/**
 * behavior-verify-genesis-closed.mjs — 创世「市场暂未开放」态的**运行时**证据。
 *
 * 🔴 缘起(2026-08-05 完整性 critic):关闭态页面长什么样,此前 100% 是**读码结论** ——
 *    GEN10 的机器门(selfcheck-genesis-gate)全是纯函数断言 + 源码文本断言,
 *    而唯一的运行时探针 behavior-verify.mjs 只在默认开放态访问创世页、不注入任何存储。
 *    「verify 绿 ≠ 渲染 OK」在这个功能上尤其成立,因为门根本没测渲染。
 *
 * 🔴 注入必须用 **uni 包装格式** `{type:"object",data:{…}}` —— 裸 localStorage 写进去
 *    uni.getStorageSync 读不到,会静默退回默认值(=开放态),探针就变成「测了个寂寞」
 *    且看起来是通过的。本文件的 assert 之一就是守这个前提。
 *
 * 🔴 URL 参数必须在 `#` **之前**(`/?nx_device=off#/pages/...`),否则被当成 hash 的一部分,
 *    device-shell 照常套上,页面在无壳环境下白屏。
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";

const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const CFG_KEY = "nexgrid-genesis-config-v1";
const ACC_KEY = "nexgrid-genesis-accounts-v1";
const VP = { width: 390, height: 844 };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP, colorScheme: "dark" });
const page = await ctx.newPage();
const errs = [];
page.on("console", collectAppConsoleErrors(errs, BASE));
page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 用 uni 包装格式写存储(裸写 uni 读不到 → 探针假绿)。 */
async function seed(cfg, owned) {
  await page.evaluate(([k, a, c, o]) => {
    localStorage.setItem(k, JSON.stringify({ type: "object", data: { config: c } }));
    if (o) localStorage.setItem(a, JSON.stringify({ type: "object", data: { default: o } }));
  }, [CFG_KEY, ACC_KEY, cfg, owned]);
}
/**
 * 🔴 导航必须是**真的换文档或换路由**。同 URL 的 `page.goto` 只改 hash → 同文档导航,
 *    Pinia store 不重建、uni 的 onShow 也不再触发 —— 探针会测出「关闭态没生效」这个
 *    **纯属自己造的**假象(2026-08-05 首跑就栽了一次)。用 reload 拿干净会话。
 */
const go = async (route) => {
  await page.goto(`${BASE}/?nx_device=off#${route}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.reload({ waitUntil: "networkidle", timeout: 30000 });
  await wait(1800);
};
/** SPA 内导航(不重建 store)—— 复刻 P0 的原攻击路径:去一趟别处再回来。 */
const hashGo = async (route) => {
  await page.evaluate((r) => { location.hash = r; }, route);
  await wait(1500);
};
const text = () => page.evaluate(() => document.body.innerText);

try {
  // 起一个会话拿到 origin,才能写 localStorage
  await go("/pages/genesis/genesis");

  // ══ 前提自证:注入真的被 uni 读到(否则后面全是假绿)══
  await seed({ marketOpenState: "closed", closedNoticeKey: "maintenance" }, { myOwned: 2, ownedTokenIds: [301, 302], myListings: [] });
  await go("/pages/genesis/genesis");
  const t1 = await text();
  check("前提:uni 包装格式注入被读到(关闭态已生效)", /暂停认购|市场暂未开放|maintenance|not yet open/i.test(t1),
    "注入没生效 = 后面所有断言都是假绿");

  // ══ ① 变体键真的换了文案(不是恒显 default)══
  check("① closedNoticeKey=maintenance 渲染的是维护变体,不是默认变体",
    /系统维护中|Under maintenance/i.test(t1) && !/当前市场暂未开放|not yet open/i.test(t1),
    `实测尾部:${t1.split("\n").filter(Boolean).slice(-3).join(" | ")}`);

  // ══ ② 关闭态不得制造紧迫感(规格 ④)══
  check("② 关闭态无名额紧迫文案", !/仅剩\s*\d+\s*席|席位不多了|\d+\s*seats? left|running low/i.test(t1));
  check("② 关闭态无倒计时", !/开售倒计时|Countdown/i.test(t1));

  // ══ ③ 二级市场:买卡与卖卡都受闸 ══
  await go("/pages/genesis/marketplace");
  const t2 = await text();
  check("③ 二级市场页正常渲染(非白屏)", t2.length > 300, `实测 ${t2.length} 字`);
  check("③ 二级市场显示阻断说明", /系统维护中|Under maintenance/i.test(t2));

  // 切「我的」页签 → 挂单按钮应是阻断态,点击不产生挂单
  const switched = await page.evaluate(() => {
    const n = [...document.querySelectorAll("uni-view, uni-text")]
      .filter((e) => /^我的\s*\(\d+\)$|^Mine\s*\(\d+\)$/.test((e.innerText || "").trim())).pop();
    if (n) n.click();
    return !!n;
  });
  await wait(1000);
  check("③ 找到并切到「我的」页签", switched);

  const tapped = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("uni-view")]
      .find((e) => /系统维护中|Under maintenance/i.test((e.innerText || "").trim())
        && e.querySelectorAll("uni-view").length === 0);
    if (btn) btn.click();
    return !!btn;
  });
  await wait(1200);
  const listingsAfter = await page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k) || "{}")?.data?.default?.myListings ?? null; }
    catch { return "parse-error"; }
  }, ACC_KEY);
  check("④ 挂单按钮处于阻断态且可点(有反馈,非死控件)", tapped);
  check("🔴 ④ 关闭态点挂单**不产生挂单**(P0 的运行时证据)",
    Array.isArray(listingsAfter) && listingsAfter.length === 0,
    `实测 myListings = ${JSON.stringify(listingsAfter)}`);

  // ══ ⑤ 恢复开放后,挂单入口回到可用态(闸不是单向焊死)══
  await seed({ marketOpenState: "open", closedNoticeKey: "default" }, { myOwned: 2, ownedTokenIds: [301, 302], myListings: [] });
  await go("/pages/genesis/marketplace");
  await page.evaluate(() => {
    const n = [...document.querySelectorAll("uni-view, uni-text")]
      .filter((e) => /^我的\s*\(\d+\)$|^Mine\s*\(\d+\)$/.test((e.innerText || "").trim())).pop();
    if (n) n.click();
  });
  await wait(1200);
  const t3 = await text();
  check("⑤ 恢复开放后挂单入口回到可用态", /挂单|List/.test(t3) && !/系统维护中|Under maintenance/i.test(t3),
    `实测:${t3.split("\n").filter(Boolean).slice(-3).join(" | ")}`);

  // ══ ⑦ 配置刷新的三条路径 —— 分开断言,别混成一条 ══
  // 复刻独立验收 P0 的原攻击路径:会话以 open 启动 → 外部(运营)改盘 → 用户不刷新。
  await seed({ marketOpenState: "open", closedNoticeKey: "default" }, { myOwned: 2, ownedTokenIds: [301, 302], myListings: [] });
  await go("/pages/genesis/genesis");
  const startedOpen = !/系统维护中|暂未开放|maintenance|not yet open/i.test(await text());
  check("⑦ 前提:会话以开放态启动", startedOpen);

  await page.evaluate(([k, c]) => localStorage.setItem(k, JSON.stringify({ type: "object", data: { config: c } })),
    [CFG_KEY, { marketOpenState: "closed", closedNoticeKey: "maintenance" }]);
  // 共享时钟每 15 tick(≈15s)重读一次配置 —— 等够一个周期再判,别在窗口内抢答。
  await wait(18000);
  const caughtInPlace = /系统维护中|Under maintenance/i.test(await text());

  await hashGo("/pages/genesis/marketplace");
  await hashGo("/pages/genesis/genesis");
  const caughtAfterNav = /系统维护中|Under maintenance/i.test(await text());

  check("🔴 ⑦b 页内导航往返后跟上新状态(P0 原攻击路径,已修)", caughtAfterNav,
    "不跟上 = hydrate-once 修复没生效");
  check("🔴 ⑦a 停在页面上不动也跟上(规格 ⑤「就地转为锁定态」)", caughtInPlace,
    "已知缺口:共享时钟每秒 tick 但不重读配置源 —— 待修(钱路径安全:动钱前 refresh 会拒)");

  check("⑥ 全程 console error = 0", errs.length === 0, errs.slice(0, 3).join(" ; "));
} finally {
  await browser.close();
}

console.log(`\n${pass} pass / ${fail} fail(样本:关闭态 2 页 × 渲染/文案变体/紧迫感抑制 · 挂单点击行为固定靶 · 开放态回归 · console)`);
process.exit(fail === 0 ? 0 : 1);
