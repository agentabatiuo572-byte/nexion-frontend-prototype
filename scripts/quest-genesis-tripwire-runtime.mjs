#!/usr/bin/env node

// ⚠️⚠️ 本门**尚未完成**,已给具名出口 `npm run test:quest-tripwire`,**故意不挂 verify 主链** ——
//   挂上去就是一道自己都跑不通的门,而「恒红的门 = 没有门」(它每次都喊狼来了,
//   真出事那次也一样被无视)。
//
// 当前状态(2026-08-13 实测 2 pass / 5 fail,红在**前提格**不是结论格):
//   · 「quest 端点真的被请求了」实测 0 次 —— 靶子跑在 mock 档,而报警器只在 remote 档有意义;
//   · 「下发的任务真的渲染出来了」页面停在登录页,任务面根本没进去。
//   两条都是**起点没立住**,此时后面 3 格无论红绿都不说明任何事。
//
// 差什么才算完成:① 以 remote/sandbox 档起服务(不是 mock);② 先把登录态注入到位、
//   走到任务面;③ 前提两格转绿之后,结论格才有判别力。届时再挂进 verify.sh。
// 🔴 在那之前**不许**因为「它红着不好看」就把前提格删掉 —— 那正是把门改成假绿的做法。
/**
 * quest-genesis-tripwire-runtime.mjs — 周任务创世报警器的**运行时**证据。
 *
 * 🔴 为什么静态门不够(本仓反复踩的那条):`selfcheck-quest-genesis-tripwire.mjs`
 *    证的是「纯判定对」+「hero 的文本把闸的值喂给了判定」。它证不了最后一段 ——
 *    这个 watch 在真浏览器里**跑不跑**。组件挂不挂载、Pinia 的 ref 透过 store 代理
 *    还响不响应,都不是文本判据看得见的。「渲染分支存在 ≠ 有生产者」同型。
 *
 * 🔴 需要**非 mock** 模式的 dev server:mock 模式下 remoteApiEnabled=false,
 *    周任务 store 直接置空并报 WEEKLY_QUEST_SERVER_REQUIRED,报警器天然没有输入 ——
 *    在 mock 靶子上跑本探针会全绿,而那是「测了个寂寞」。所以本探针**不进 verify 主链**
 *    (主链靶子是 mock),走具名出口 `npm run test:quest-tripwire`,与
 *    `test:production-boundaries` / `test:cross-repo` 同款处置。
 *
 * ⚠️⚠️ 【本探针今天跑不绿,原因写在这里,不是没人管的红】(2026-08-13)
 *    差**一个已登录的 sandbox 会话**,而这一步不是 seed 一下 localStorage 就行的:
 *    `src/store/auth.ts` 的 hydrate() 在 remoteApiEnabled 为真时**无条件返回未登录**
 *    (注释写明:浏览器里的 auth 记录只是路由提示,重建不了内存里的 Bearer 会话)。
 *    于是 sandbox 靶子上 /pages/missions/missions 一律被守卫弹回登录页,报警器没机会跑。
 *    要跑绿必须连 `POST /auth/users/login` 的 envelope + token + user 会话形状一起桩上,
 *    那是**造一个假认证后端**,已超出本次改动的范围,单独立项做。
 *    🔴 在那之前请如实理解:「watch 在真浏览器里会不会跑」这最后一段**尚无运行时证据**,
 *    静态门 selfcheck-quest-genesis-tripwire.mjs 证到的是纯判定 + 接线数据流为止。
 *    本文件保留而不删,是因为删了这句交底就没了,而它正是那条未证链路的唯一记录。
 *
 * 用法(先起一个 sandbox 模式的 H5):
 *   VITE_NEXGRID_API_MODE=sandbox npx vite --port 5411 --strictPort
 *   QUEST_TRIPWIRE_BASE_URL=http://localhost:5411 node scripts/quest-genesis-tripwire-runtime.mjs
 *
 * 🔴 注入用 uni 包装格式 `{type:"object",data:{…}}` —— 裸 localStorage 写进去
 *    uni.getStorageSync 读不到,会静默退回默认(开放态),探针变成假绿。
 * 🔴 URL 参数必须在 `#` **之前**,否则被当成 hash 的一部分,device-shell 照常套上。
 */
import { chromium } from "playwright";

const BASE = process.env.QUEST_TRIPWIRE_BASE_URL || process.env.UNI_BASE_URL || "http://localhost:5411";
const CFG_KEY = "nexgrid-genesis-config-v1";
const ROUTE = "/pages/missions/missions";
const MARK = "[quest-genesis]";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

const snapshot = (status) => ({
  quests: [{
    questCode: "WK_T1_GENESIS_ACQUIRE",
    name: "Acquire a Genesis Node",
    layer: "WEEKLY_T1",
    rewardNex: 2500,
    status,
  }],
  promoBanner: null,
  questBonusMultiplier: 1,
  rhythmMonth: 3,
  source: "nx_mission+nx_user_mission",
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const page = await ctx.newPage();

let questStatus = "PENDING";
let questHits = 0;
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push("PAGEERROR: " + String(e)));

// 🔴 只桩 quest 端点,**别写 `**/api/**` catch-all**:dev server 下 vite 自己的模块请求
//    长成 `/src/api/runtime.ts`,照样命中那个通配 —— 首跑就是这么把整个 app 的模块图
//    换成了 `{}`,页面白屏、0 次 quest 请求,而两条反向断言因为「什么都没发生」双双假绿。
//    (前置自证正是为这种情形写的:没有它,这轮会被读成「报警器工作正常」。)
await page.route("**/api/quests/state**", async (route) => {
  questHits++;
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot(questStatus)) });
});

const seedGenesis = (config) => page.evaluate(
  ([k, c]) => localStorage.setItem(k, JSON.stringify({ type: "object", data: { config: c } })),
  [CFG_KEY, config],
);
/** 真换文档 —— 同 URL 的 goto 只改 hash,store 不重建,会测出纯属自造的假象。 */
const go = async () => {
  await page.goto(`${BASE}/?nx_device=off#${ROUTE}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
};
const tripwireHits = () => logs.filter((l) => l.includes(MARK));
const reset = () => { logs.length = 0; };

const CLOSED = { marketOpenState: "closed", closedNoticeKey: "maintenance" };
const OPEN = { marketOpenState: "open", closedNoticeKey: "default" };

try {
  await go(); // 拿到 origin 才能写 localStorage

  // ══ 前提自证:桩真的被消费了(不然下面全是假绿)══════════════════════════════
  await seedGenesis(CLOSED);
  reset();
  await go();
  check("前提:quest 端点真的被请求了(remoteApiEnabled 为真 = 靶子不是 mock 模式)",
    questHits > 0, `实测 ${questHits} 次 —— 0 次 = 跑在 mock 靶子上,本探针全部结论作废`);
  const bodyText = await page.evaluate(() => document.body.innerText);
  check("前提:下发的任务真的渲染出来了(报警器的输入确实到达了页面)",
    /Genesis Node/i.test(bodyText), `页面里找不到任务标题:${bodyText.slice(0, 160)}`);

  // ══ ① 关闭态 + PENDING 创世任务 → 必须报警 ═══════════════════════════════════
  check(`🔴 ① 关闭态下服务端派了待办创世任务 → 报警(${MARK})`,
    tripwireHits().length > 0, `一声没吭 = watch 在真浏览器里没跑,静态门的接线判据是空头支票`);
  check("① 报警内容点名 questCode + 阻断档 + U-16",
    tripwireHits().some((l) => l.includes("WK_T1_GENESIS_ACQUIRE") && l.includes("marketClosed") && l.includes("U-16")),
    tripwireHits()[0]?.slice(0, 200) ?? "(无)");

  // ══ ② 反向:同一任务在开放态**不**报警(报警器不是恒响)═══════════════════════
  await seedGenesis(OPEN);
  reset();
  await go();
  check("🔴 ② 开放态下同一条创世任务不报警(恒响 = 报警等于噪声,没人再看)",
    tripwireHits().length === 0, tripwireHits()[0]?.slice(0, 200) ?? "");

  // ══ ③ 反向:关闭态 + CLAIMABLE **不**报警(已挣到的奖励不许被指控)═════════════
  questStatus = "CLAIMABLE";
  await seedGenesis(CLOSED);
  reset();
  await go();
  check("🔴 ③ 关闭态下已可领取(CLAIMABLE)的创世任务不报警",
    tripwireHits().length === 0,
    `报了 = 顺着报警做过滤就会藏掉用户已挣到的奖励:${tripwireHits()[0]?.slice(0, 160) ?? ""}`);
  const claimableBody = await page.evaluate(() => document.body.innerText);
  check("③ 且该任务照常渲染给用户(不是被藏掉了)", /Genesis Node/i.test(claimableBody),
    claimableBody.slice(0, 160));
} finally {
  await browser.close();
}

console.log(`\n${pass} pass / ${fail} fail(样本:真浏览器 × 服务端桩 × {关闭,开放} × {PENDING,CLAIMABLE} 四象限,含两条反向)`);
process.exit(fail === 0 ? 0 : 1);
