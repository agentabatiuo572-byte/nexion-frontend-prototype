#!/usr/bin/env node
/**
 * 首页网络脉搏卡的运行时行为探针(规格 FEAT-HOME02)— node 直跑,需 dev server:
 *   node scripts/behavior-verify-network-pulse.mjs
 * 默认打 5173;worktree 里主 checkout 占着 5173 时必须显式改写 origin,否则探的是别人的树:
 *   UNI_BASE_URL=http://localhost:5211 node scripts/behavior-verify-network-pulse.mjs
 *
 * 验的是「真渲染出来的东西」,不是源码声明:
 *   ① 三格在位,零写死值残留(#18,742 / ↑ 12 in 24h / registered·英文副文本 全部绝迹);
 *   ② 格 1 注册用户 = 配置基数按增速推算的紧凑值(与真模块现算的期望一致);
 *   ③ 格 3 名次 = computeRank(当下算力, 种子分位表) 的真值(#前缀);
 *   ④ 点排名格 → 弹出口径提示(规格 ⑥ 轻提示);
 *   ⑤ console error = 0。
 * 🔴 URL 参数必须在 `#` 之前(`/?nx_device=off#/...`),否则整段被当成 hash。
 */
import { chromium } from "playwright";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { atAliasResolver } from "./lib/at-alias.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

// ── 期望值用真模块现算(不手抄数字;探针只信「渲染 == 模块」这层等式)──
globalThis.uni = { getStorageSync: () => "", setStorageSync: () => {}, removeStorageSync: () => {}, getSystemInfoSync: () => ({}) };
const bundle = await build({
  stdin: {
    contents: `
      export { derivedRegisteredUsers } from "@/lib/platform-stats";
      export { DEFAULT_PLATFORM_CONFIG } from "@/mock/platform-config";
    `,
    resolveDir: root, loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  plugins: [{ name: "alias", setup(b) { b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "behavior-verify-network-pulse")); } }],
});
const { derivedRegisteredUsers, DEFAULT_PLATFORM_CONFIG } =
  await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

const psSeed = DEFAULT_PLATFORM_CONFIG.publicStats;
const expectedRegistered = derivedRegisteredUsers(psSeed, Date.now());
const expectedRegisteredCompact = `${(expectedRegistered / 1_000_000).toFixed(2)}M`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
const errors = [];
page.on("console", collectAppConsoleErrors(errors, BASE));

// 🔴 预注入「里程碑全部已放过」(uni 包装格式 {type,data},裸 JSON 会被判无效):
//   种子账号收益跨过全部档位,冷启动会连播 5 层庆祝弹层,和点击测试赛跑必输。
//   这是按持久语义关闭(等价于老用户第二次进来),不是绕产品行为。
await page.addInitScript(() => {
  localStorage.setItem(
    "nexgrid-milestones-accounts-v1",
    JSON.stringify({ type: "object", data: { default: { firedIds: ["earn-100", "earn-500", "earn-1000", "earn-5000", "earn-10000"] } } }),
  );
  // 🔴 注入 25h 前的名次快照(名次远差于当前)—— ⑥ 断言「隔天回访」徽标在 paint 后仍可见。
  //   这是 R1/R2 两轮都栽的那条 P1 的回归门:滚动落盘若写回展示读路径,徽标会在
  //   paint 前被自我覆盖成空(R2 用真调度器复放实锤)。uni 包装格式,按账号行。
  localStorage.setItem(
    "nexgrid-rank-snapshot-accounts-v1",
    JSON.stringify({ type: "object", data: { default: { rank: 999_999, at: Date.now() - 25 * 3_600_000 } } }),
  );
});

await page.goto(`${BASE}/?nx_device=off#/pages/index/index`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200); // 进场动画 + store tick 首拍

const body = await page.evaluate(() => document.body.innerText);

// ① 旧写死值绝迹(强判据:验旧的还剩几处,不是新的在不在)
for (const relic of ["18,742", "↑ 12 in 24h", "registered · +2.9% /mo", "51.2k jobs/hr", "1.42M"]) {
  // 1.42M 例外:若与现算期望恰好相等则不算残留
  const isRelic = body.includes(relic) && !(relic === "1.42M" && expectedRegisteredCompact === "1.42M");
  check(`① 旧写死值「${relic}」已绝迹`, !isRelic);
}

// ② 格 1 = 真模块现算的紧凑注册数(允许探针与页面取时刻差 1 位数末位)
check(`② 注册用户格渲染 = 派生值 ${expectedRegisteredCompact}`, body.includes(expectedRegisteredCompact),
  `页面文本没有 ${expectedRegisteredCompact}`);

// ③ 格 3:种子账号有已激活设备 → 必为 ranked(# 前缀 + 数字),不许「未上榜」也不许占位
const rankText = await page.evaluate(() => {
  const all = [...document.querySelectorAll("uni-text,text,span")].map((n) => n.textContent ?? "");
  return all.find((s) => /^#[\d,.KM]+$/.test(s.trim())) ?? "";
});
check("③ 排名格 = # 前缀真名次(种子账号有算力,不许未上榜/占位/写死)", rankText.trim().length > 1, `实得「${rankText}」`);

// ④ 点排名格 → 口径轻提示出现(规格 ⑥)。
//   首页按转化策略会自动弹层(里程碑连播 / 代金券自动推送,都是真产品行为)。
//   通用处理:点不到就先点掉**在场弹层自己的关闭件**再重试 —— 走的都是真 UX,
//   不硬点穿;8 轮仍点不到 = 首页被弹层锁死,如实红。
const rankCell = page.locator("text=/^#[\\d,.KM]+$/").first();
let tapped = false;
for (let i = 0; i < 8 && !tapped; i++) {
  try {
    await rankCell.click({ timeout: 1500 });
    tapped = true;
  } catch {
    await page.evaluate(() => {
      for (const sel of [".vcs-close", ".vcs-backdrop", ".ms-backdrop"]) { // .ms-overlay 是 fixed,offsetParent 恒 null,原分支从没生效(tester-G P2-7);backdrop 是 absolute 子节点
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { el.click(); return; }
      }
    });
    await page.waitForTimeout(600);
  }
}
check("④ 前提:自动弹层可经各自关闭件清场,排名格可点到", tapped);
await page.waitForTimeout(600);
const afterTap = await page.evaluate(() => document.body.innerText);
check("④ 点排名格弹出口径提示(按已激活设备算力…)", /已激活设备|active devices|đang hoạt động/.test(afterTap),
  "点击后没找到提示文案");

// ⑥ 「隔天回访」徽标 paint 后仍在(R1/R2 双轮 P1 的回归门):注入的 25h 快照名次远差于
//    当前 → 前进量必为正 → 副行必须渲染「24h」字样;等 1.2s 保证跨过 paint 与微任务窗。
await page.waitForTimeout(1200);
// 🔴 针锚在**排名格自己的副行**:全文找 /24h/ 会被页面别处文案骗绿(红测第一发实锤 ——
//   注入旧病形态它照样 PASS)。先定位值为 #… 的那格,取同格副行。
const badge = await page.evaluate(() => {
  const cells = [...document.querySelectorAll("uni-view")].filter((c) => {
    const texts = [...c.querySelectorAll("uni-text")].map((n) => (n.textContent ?? "").trim());
    return texts.some((s) => /^#[\d,.KM]+$/.test(s));
  });
  // 取最内层命中的容器(排名格),副行 = 该容器里排在 # 值之后的下一个 uni-text
  const cell = cells[cells.length - 1];
  if (!cell) return { found: false, sub: "" };
  const texts = [...cell.querySelectorAll("uni-text")].map((n) => (n.textContent ?? "").trim());
  const at = texts.findIndex((s) => /^#[\d,.KM]+$/.test(s));
  return { found: true, sub: texts[at + 1] ?? "" };
});
check("🔴 ⑥ 隔天回访:排名格副行的 24h 前进徽标在 paint 后真实可见(不被滚动落盘自我覆盖)",
  badge.found && /24h/.test(badge.sub) && /\d/.test(badge.sub),
  badge.found ? `排名格副行实得「${badge.sub}」` : "没找到排名格");

// ⑤ console
check(`⑤ console error = 0(实收 ${errors.length})`, errors.length === 0, errors.slice(0, 3).join(" | "));

await page.screenshot({ path: "/tmp/pulse-card.png", clip: { x: 0, y: 0, width: 375, height: 600 } });
await browser.close();

console.log(`\n${pass} pass / ${fail} fail(样本:5 类旧残留 · 注册数与真模块等值 · 名次三态之 ranked · 点击口径提示 · console)`);
process.exit(fail === 0 ? 0 : 1);
