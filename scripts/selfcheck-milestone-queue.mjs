#!/usr/bin/env node
// 里程碑庆祝队列自检 — node 直跑,不起浏览器:
//   node scripts/selfcheck-milestone-queue.mjs
//
// 背景(2026-08-03 三路独立走查同族缺陷):.ms-overlay z-index 9300 盖住支付确认/
// 宽限提示/提现表单并吞点击;且 active 是单槽,连跨两级门槛时前一级被覆盖永久丢失。
//
// 🔴 守的核心不变量(编号对应 verify 门与红测文档):
//   ① 钱链路(checkout / withdraw / trial)期间庆祝 UI 挂起,但奖励/记账**不受
//     UI 门牵连**(App.vue pollMilestones 组合里 credit/bill 无条件,分离证明)
//   ② 离开钱链路后**逐条**补发 — 连跨两级 = 补两条且先低后高,不是只剩最后一条
//   ③ z 层级:.ms-overlay < .nx-toast-host < .nx-mask(庆祝永远压在业务 UI 之下)
//   ④ 非钱链路页面照常即时弹 + 白名单前缀不过宽(pages/store/store 等不误伤)
//
// 方法:esbuild bundle 真 src/store/milestones.ts(stub pinia/vue/storage),
// 测**正主行为**不测复制品;分离证明用 App.vue 源码结构断言补上跨文件那半。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const STUBS = {
  "pinia-stub": `export const defineStore = (_id, setup) => setup;`,
  "vue-stub": `export const ref = (v) => ({ value: v });`,
  "storage-stub": `const mem = new Map();
export const readAccountRow = (t, k) => mem.get(t + "|" + k) ?? null;
export const writeAccountRow = (t, k, row) => { mem.set(t + "|" + k, row); return true; };`,
  "cloud-stub": `export const normalizeAccountKey = (s) => String(s || "default").trim().toLowerCase();`,
};

const bundle = await build({
  entryPoints: [path.join(root, "src", "store", "milestones.ts")],
  bundle: true,
  write: false,
  format: "esm",
  plugins: [
    {
      name: "selfcheck-stubs",
      setup(b) {
        b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
        b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
        b.onResolve({ filter: /account-scoped-storage$/ }, () => ({ path: "storage-stub", namespace: "stub" }));
        b.onResolve({ filter: /account-cloud$/ }, () => ({ path: "cloud-stub", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    },
  ],
});
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64")
);
const { useMilestones, isMoneyFlowRoute, MONEY_FLOW_ROUTE_PREFIXES, CELEBRATION_GAP_MS } = mod;

// 第二个 bundle:真 popup-arbiter(同一套 pinia/vue stub)。⑦ 用它做**组合行为**测试 —
// 两个 store 各自绿不代表接起来对,现象①正是「零件都在、链没接上」。
const arbBundle = await build({
  entryPoints: [path.join(root, "src", "store", "popup-arbiter.ts")],
  bundle: true,
  write: false,
  format: "esm",
  plugins: [
    {
      name: "selfcheck-stubs-arb",
      setup(b) {
        b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
        b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    },
  ],
});
const arbMod = await import(
  "data:text/javascript;base64," + Buffer.from(arbBundle.outputFiles[0].text, "utf8").toString("base64")
);

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// defineStore stub 返回 setup 本体 → 每次调用 = 全新 store 实例(测试隔离)。
const freshStore = () => useMilestones();
const M100 = { id: "earn-100", threshold: 100, nexReward: 100, label: "earn100" };
const M500 = { id: "earn-500", threshold: 500, nexReward: 250, label: "earn500" };

const MONEY_ROUTES = [
  "pages/store/checkout",
  "pages/me/wallet-withdraw",
  "pages/me/wallet-withdraw-tracking",
  "pages/me/trial",
];
const PLAIN_ROUTES = ["pages/index/index", "pages/store/store", "pages/me/wallet", "pages/earn/earn"];

console.log("selfcheck-milestone-queue — 钱链路挂起 / 逐条补发 / z 层级 / 即时弹");

// ── ① 钱链路挂起(UI 侧):4 条钱链路路由上 show+advance 都不得上屏 ──
{
  let suspended = 0;
  for (const route of MONEY_ROUTES) {
    const s = freshStore();
    s.show(M100);
    const promoted = s.advance(route);
    const okHere = promoted === false && s.active.value === null && s.pendingCelebrations.value.length === 1;
    check(`① [${route}] 庆祝挂起(active=null,队列保 1 条)`, okHere,
      `promoted=${promoted} active=${JSON.stringify(s.active.value)} pending=${s.pendingCelebrations.value.length}`);
    if (okHere) suspended++;
  }
  check(`① 挂起覆盖全部钱链路路由(样本 ${suspended}/${MONEY_ROUTES.length})`, suspended === MONEY_ROUTES.length);

  // 程序化跳转边:弹层正在显示时闯进钱链路 → 收回并排回队首(离场后足秒重放)。
  const s = freshStore();
  s.show(M100);
  s.advance("pages/index/index"); // 上屏
  s.show(M500);
  s.advance("pages/store/checkout"); // 闯入钱链路
  check("① 显示中闯入钱链路:弹层收回且排回队首(order 保持 100→500)",
    s.active.value === null &&
      s.pendingCelebrations.value.length === 2 &&
      s.pendingCelebrations.value[0].id === "earn-100" &&
      s.pendingCelebrations.value[1].id === "earn-500",
    JSON.stringify(s.pendingCelebrations.value.map((x) => x.id)));
  // ① park 是中断不是看完:离场后**立即**重放,不许被连播冷却挡(拍板的另一半;
  //   谁把 coolUntil 误设进 park 分支,这里立刻红 —— F6 封口)。
  check("① park 后离场立即重放(park 不设冷却)",
    s.advance("pages/index/index") === true && s.active.value?.id === "earn-100",
    String(s.active.value?.id));
}

// ── ① 分离证明(奖励侧):App.vue pollMilestones 里 credit/bill 无条件,
//     不许接路由门或 stopMilestonePoll(那会变成「钱链路期间不发奖励」)。──
{
  // 🔴 判代码不判散文:整段行注释先剥掉再 indexOf。不剥的话注释两头都能骗它 ——
  // 写一句「不再单独 creditNex」会被当成真的调了 creditNex 判红(假红),
  // 而写一句「// postMoneyBill」又能让顺序断言凭空变绿(假绿)。与 selfcheck-money-receipt
  // 的 strip 同口径:只剥整行 //(行尾注释里可能藏 https:// 这类内容,不碰)。
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const appSrc = stripComments(readFileSync(path.join(root, "src", "App.vue"), "utf8"));
  const start = appSrc.indexOf("function pollMilestones()");
  const end = appSrc.indexOf("function startMilestonePoll()");
  const bodyFound = start !== -1 && end !== -1 && end > start;
  check("① App.vue 里 pollMilestones 函数体可定位(分离证明的前提)", bodyFound, `start=${start} end=${end}`);
  if (bodyFound) {
    const body = appSrc.slice(start, end);
    // 🔴 2026-08-04 组合更新:「markFired → creditNex → bills.add → show」
    //   → 「postMoneyBill(资金 ⊗ 收据,一次提交)→ markFired → show」。两处都不是风格改动:
    //   ① 资金与账单拆成两步时,bills.add 写不进去**返回 null 且不抛异常**、没人接 ——
    //      于是发了 NEX、弹了庆祝,账单页查无此单(R4「钱动了、账没记上」缺陷族);
    //   ② markFired 原本排在最前面防重入,但这条链自始至终同步、轮询之间插不进第二次,
    //      而「标了 + 没落盘」= 里程碑记成已发、钱和账都没有,用户永久少一级奖励。
    //      改成落盘成功才标记,失败停在未标记态、下一 tick 自愈重试。
    //   本门守的是「奖励侧无条件执行」这条不变量,顺序断言随实现更新,但只许更严不许更松。
    const iPost = body.indexOf("postMoneyBill(");
    const iMark = body.indexOf("markFired");
    const iShow = body.indexOf(".show(");
    const iGuard = body.indexOf('!== "ok"');
    check("① 组合完整且有序:postMoneyBill → markFired → show(3/3 步齐)",
      iPost !== -1 && iMark !== -1 && iShow !== -1 && iPost < iMark && iMark < iShow,
      `idx post=${iPost} mark=${iMark} show=${iShow}`);
    check("① 🔴 资金与收据不许拆开:体内无裸 creditNex / bills.add(拆开就是发了 NEX 却查无此单)",
      body.indexOf("creditNex") === -1 && body.indexOf(".add(") === -1,
      `creditNex=${body.indexOf("creditNex")} add=${body.indexOf(".add(")}`);
    check("① 🔴 收口点返回值被判定(丢弃返回值 = 落盘失败照样标记已发、照样弹庆祝)",
      iGuard !== -1 && iGuard > iPost && iGuard < iMark, `guard=${iGuard}`);
    check("① 奖励侧不接 UI 路由门:pollMilestones 体内无 isMoneyFlowRoute 调用",
      body.indexOf("isMoneyFlowRoute") === -1);
    check("① 奖励侧不接停轮询机制:pollMilestones 体内无 stopMilestonePoll 调用",
      body.indexOf("stopMilestonePoll") === -1);
  }
}

// ── ② 逐条补发:连跨两级(钱链路用 trial,离场用 pages/me/me,与①④取样错开)──
{
  const s = freshStore();
  s.show(M100);
  s.show(M500);
  check("② 🔴 连跨两级队列保两条且先低后高(单槽回归会只剩最后一条)",
    s.pendingCelebrations.value.length === 2 &&
      s.pendingCelebrations.value[0].id === "earn-100" &&
      s.pendingCelebrations.value[1].id === "earn-500",
    JSON.stringify(s.pendingCelebrations.value.map((x) => x.id)));
  s.advance("pages/me/trial");
  s.advance("pages/me/trial");
  check("② 钱链路里反复推进也不上屏、不丢队列", s.active.value === null && s.pendingCelebrations.value.length === 2);
  const replayed = [];
  if (s.advance("pages/me/me")) replayed.push(s.active.value.id);
  check("② 离场第一条补发 = 先到的 $100 级(不是最后一条)", s.active.value?.id === "earn-100",
    String(s.active.value?.id));
  check("② 补发第一条期间第二条仍在队列(逐条,不并发上屏)",
    s.pendingCelebrations.value.length === 1 && s.pendingCelebrations.value[0].id === "earn-500");
  check("② 上一条未 dismiss 时不抢屏", s.advance("pages/me/me") === false && s.active.value?.id === "earn-100");
  s.dismiss();
  // ② 🔴 连播间隙(2026-08-06 主人拍板 P2#1):dismiss 后 GAP 内不许提升下一条 ——
  //    这条断言钉住间隙本身,谁把冷却删了这里立刻红(不是只测「最终补发齐」)。
  check(`② 🔴 连播间隙:dismiss 后立即 advance 不提升(冷却 ${CELEBRATION_GAP_MS}ms,首页内容要有露出时机)`,
    typeof CELEBRATION_GAP_MS === "number" && CELEBRATION_GAP_MS >= 1000 &&
      s.advance("pages/me/me") === false && s.active.value === null &&
      s.pendingCelebrations.value.length === 1,
    `gap=${CELEBRATION_GAP_MS} active=${JSON.stringify(s.active.value ?? null)}`);
  await new Promise((resolve) => setTimeout(resolve, CELEBRATION_GAP_MS + 100));
  if (s.advance("pages/me/me")) replayed.push(s.active.value.id);
  check("② 第二条补发 = $500 级,队列清空(足秒后)", s.active.value?.id === "earn-500" && s.pendingCelebrations.value.length === 0);
  s.dismiss();
  check(`② 补发总量与顺序:${JSON.stringify(replayed)}(样本 2 条,0 丢失)`,
    replayed.length === 2 && replayed[0] === "earn-100" && replayed[1] === "earn-500");
}

// ── ③ z 层级:.ms-overlay < .nx-toast-host < .nx-mask(解析失败=红,不许假绿)──
{
  const msSrc = readFileSync(path.join(root, "src", "components", "milestone-celebration.vue"), "utf8");
  const guiSrc = readFileSync(path.join(root, "src", "components", "global-ui.vue"), "utf8");
  const zOf = (src, selector) => {
    const m = src.match(new RegExp(selector.replace(".", "\\.") + "\\s*\\{[^}]*?z-index:\\s*(\\d+)", "s"));
    return m ? parseInt(m[1], 10) : null;
  };
  const zOverlay = zOf(msSrc, ".ms-overlay");
  const zToast = zOf(guiSrc, ".nx-toast-host");
  const zMask = zOf(guiSrc, ".nx-mask");
  check(`③ 三个层级值都解析得到(样本 3 selector:overlay=${zOverlay} toast=${zToast} mask=${zMask})`,
    zOverlay !== null && zToast !== null && zMask !== null);
  check("③ 🔴 .ms-overlay < .nx-mask(庆祝不得盖确认弹窗)", zOverlay !== null && zMask !== null && zOverlay < zMask);
  check("③ .ms-overlay < .nx-toast-host(庆祝不得盖 toast/宽限提示)", zOverlay !== null && zToast !== null && zOverlay < zToast);

  // ③ 🔴 2026-08-16 补业务半屏这一面 —— 本门此前只比了庆祝对 toast / 对 .nx-mask,
  //    而实测缺陷恰恰发生在**领取弹层**上(庆祝 8900 盖住代金券弹层 790/800 并模糊背景)。
  //    「契约原文写着必须在业务 UI 之下」与「门是绿的」曾长期同时成立,就是因为缺这一面。
  const SHEETS = [
    ["src/components/voucher-claim-sheet.vue", ".vcs-root", ".vcs-panel"],
    ["src/components/trial-claim-sheet.vue", ".tcs-root", ".tcs-panel"],
  ];
  const sheetZ = [];
  for (const [rel, mask, panel] of SHEETS) {
    const src = readFileSync(path.join(root, rel), "utf8");
    for (const sel of [mask, panel]) {
      const z = zOf(src, sel);
      check(`③ 业务半屏层级可解析:${rel.split("/").pop()} ${sel}=${z}(解析不到=红,不许静默跳过)`, z !== null);
      if (z !== null) sheetZ.push({ rel, sel, z });
    }
  }
  check(`③ 扫描面非空(样本 ${sheetZ.length}/${SHEETS.length * 2} 个业务半屏层级)—— 期望是空集的断言天然假绿`,
    sheetZ.length === SHEETS.length * 2);
  const lowestSheet = sheetZ.length ? sheetZ.reduce((a, b) => (a.z <= b.z ? a : b)) : null;
  check(`③ 🔴 .ms-overlay(${zOverlay}) < 全部业务半屏(最低 ${lowestSheet?.sel}=${lowestSheet?.z})—— 庆祝不得盖领取弹层`,
    zOverlay !== null && lowestSheet !== null && zOverlay < lowestSheet.z,
    `overlay=${zOverlay} lowestSheet=${JSON.stringify(lowestSheet)}`);
}

// ── ⑤ 有人占屏时庆祝挂起(2026-08-16 主人拍板 C1;编排层见 src/store/popup-arbiter.ts)──
//    实测缺陷:庆祝浮层此前**只按路由挂起**,对「屏上有没有别的自动弹层」完全无感,
//    于是它在首页叠在代金券领取弹层正上方并模糊背景数十秒。
{
  const s = freshStore();
  s.show(M100);
  const promoted = s.advance("pages/index/index", true);
  check("⑤ 🔴 有别的弹层占屏时不上屏(promoted=false,队列原样保留)",
    promoted === false && s.active.value === null && s.pendingCelebrations.value.length === 1,
    `promoted=${promoted} active=${JSON.stringify(s.active.value)} pending=${s.pendingCelebrations.value.length}`);

  // 占屏解除后照常补发 —— 挂起是「等一下」,不是「丢掉」。
  check("⑤ 占屏解除后立刻补发(挂起不吞事件)",
    s.advance("pages/index/index", false) === true && s.active.value?.id === "earn-100",
    String(s.active.value?.id));

  // 🔴 C1 永不顶替:已经在放的庆祝,不因为「别人想占屏」被收回 ——
  //    收回是钱链路 park 的语义(会排回队首重放),不是本轴的语义。
  s.show(M500);
  const stillActive = s.advance("pages/index/index", true);
  check("⑤ 🔴 已上屏的不被顶掉(C1 先到先得:screenBusy 只拦新上屏,不收回在放的)",
    stillActive === false && s.active.value?.id === "earn-100" && s.pendingCelebrations.value.length === 1,
    `active=${JSON.stringify(s.active.value)} pending=${s.pendingCelebrations.value.length}`);

  // 默认参数回归:不传第二参 = 不挂起(老调用点行为不变,否则全站庆祝会静默失灵)
  const s2 = freshStore();
  s2.show(M100);
  check("⑤ 默认参数不挂起(不传 screenBusy 的老调用点行为不变)",
    s2.advance("pages/index/index") === true && s2.active.value?.id === "earn-100");
}

// ── ⑦ 组合行为:两个 store **一起**跑(单测各自绿 ≠ 合起来对)────────────────
//    ⑤ 只证明「传 true 就挂起」,没证明「弹层占屏时传进去的真的是 true」。
//    这里把真 popup-arbiter 与真 milestones 接成宿主那条链,测的是链不是零件。
{
  const arb = arbMod.usePopupArbiter();
  const s = freshStore();
  const busy = () => arb.busyForOthers("milestone");

  check("⑦ 空屏时 busyForOthers=false(基线:没人占屏则庆祝照常上屏)", busy() === false);

  // 领取弹层占屏 → 庆祝必须挂起(现象①的完整复现路径)
  check("⑦ 代金券拿到令牌", arb.acquire("voucher-claim") === true);
  s.show(M100);
  const blocked = s.advance("pages/index/index", busy());
  check("⑦ 🔴 代金券占屏时庆祝不上屏(链路级复现:此前它 z 8900 直接盖上去)",
    blocked === false && s.active.value === null && s.pendingCelebrations.value.length === 1,
    `promoted=${blocked} active=${JSON.stringify(s.active.value)}`);

  // 关闭领取弹层 → 归还令牌 → 庆祝补发(挂起是等一下,不是丢掉)
  arb.release("voucher-claim");
  check("⑦ 代金券关闭后令牌归还(current=null)", arb.current.value === null);
  const promoted = s.advance("pages/index/index", busy());
  check("⑦ 归还后庆祝立刻补发(0 丢失)", promoted === true && s.active.value?.id === "earn-100");

  // C1 反向:庆祝占屏时,领取弹层申请令牌必须失败(不许顶掉在放的庆祝)
  check("⑦ 庆祝上屏后取得令牌", arb.acquire("milestone") === true);
  check("⑦ 🔴 庆祝占屏时代金券申请令牌失败(C1 永不顶替 · 反向)",
    arb.acquire("voucher-claim") === false && arb.current.value === "milestone",
    String(arb.current.value));
  check("⑦ 非持有者归还无效(代金券还不掉庆祝的令牌)",
    (arb.release("voucher-claim"), arb.current.value === "milestone"));
  check("⑦ 持有者归还有效", (arb.release("milestone"), arb.current.value === null));
}

// ── ⑧ 评选逻辑本体(runPriorityRound)——三条都是 2026-08-16 独立审计实测出的真缺陷 ──
//    此前这段逻辑埋在 app-chassis.vue 里,门只能用正则猜写法,对改名/挪位/装饰性保留
//    一概判绿(审计实测:两条旧定时器改个变量名搬回来,门 57/57 全绿)。现在测正主。
{
  const { runPriorityRound } = arbMod;
  const mk = (over = {}) => {
    const arb = arbMod.usePopupArbiter();
    const opened = [];
    const cand = (id, { eligible = true, ready = true, push = true } = {}) => ({
      id, eligible: () => eligible, ready: () => ready,
      push: () => { if (push) opened.push(id); return push; },
    });
    return { arb, opened, cand, ...over };
  };

  // 轴 A:手动打开的弹层已持有令牌 → 整轮不评,绝不把它的令牌抹掉。
  //   旧写法把「有人占屏」判在循环里,而 acquire 对同 id 幂等 → 手动开的那个会被
  //   "acquire 成功"、push 因冷却失败后被 release 抹掉,下一个候选随即叠上去。
  {
    const { arb, opened, cand } = mk();
    arb.acquire("voucher-claim"); // 模拟用户从 banner 手动打开
    const stop = runPriorityRound({
      currentHolder: () => arb.current.value,
      acquire: (id) => arb.acquire(id), release: (id) => arb.release(id),
      candidates: [cand("voucher-claim", { push: false }), cand("trial-claim")],
      waitForReady: false,
    });
    check("⑧ 🔴 已有人占屏时整轮不评,令牌不被抹掉(手动开的代金券不会被试用顶掉)",
      stop === false && arb.current.value === "voucher-claim" && opened.length === 0,
      `stop=${stop} holder=${arb.current.value} opened=${JSON.stringify(opened)}`);
  }

  // 轴 B:高优先级「数据没到货」时整轮让位,不许低优先级抢跑(缺陷④ 的真修法)。
  {
    const { arb, opened, cand } = mk();
    const stop = runPriorityRound({
      currentHolder: () => arb.current.value,
      acquire: (id) => arb.acquire(id), release: (id) => arb.release(id),
      candidates: [cand("voucher-claim", { eligible: false, ready: false }), cand("trial-claim")],
      waitForReady: true,
    });
    check("⑧ 🔴 代金券目录未到货时试用不许抢跑(等待窗口内整轮让位)",
      stop === false && opened.length === 0 && arb.current.value === null,
      `stop=${stop} opened=${JSON.stringify(opened)} holder=${arb.current.value}`);
  }

  // 轴 B':等待窗口到点后,低优先级才轮到 —— 让位必须有上限,不能无限期卡住。
  {
    const { arb, opened, cand } = mk();
    runPriorityRound({
      currentHolder: () => arb.current.value,
      acquire: (id) => arb.acquire(id), release: (id) => arb.release(id),
      candidates: [cand("voucher-claim", { eligible: false, ready: false }), cand("trial-claim")],
      waitForReady: false, // 窗口已到点
    });
    check("⑧ 等待窗口到点后试用才轮到(让位有上限,不无限期卡住)",
      opened.length === 1 && opened[0] === "trial-claim", JSON.stringify(opened));
  }

  // 轴 C:「确定没有可领券」(已就绪但不够格)应立刻让位,不该白等满窗口。
  {
    const { arb, opened, cand } = mk();
    runPriorityRound({
      currentHolder: () => arb.current.value,
      acquire: (id) => arb.acquire(id), release: (id) => arb.release(id),
      candidates: [cand("voucher-claim", { eligible: false, ready: true }), cand("trial-claim")],
      waitForReady: true,
    });
    check("⑧ 已就绪但确实没有可领券 → 立刻让位给试用(ready 与 eligible 是两件事)",
      opened.length === 1 && opened[0] === "trial-claim", JSON.stringify(opened));
  }

  // 轴 D:冷却没过 → 还回本轮刚拿的令牌,让下一个候选上(不是整轮作废)。
  {
    const { arb, opened, cand } = mk();
    runPriorityRound({
      currentHolder: () => arb.current.value,
      acquire: (id) => arb.acquire(id), release: (id) => arb.release(id),
      candidates: [cand("voucher-claim", { push: false }), cand("trial-claim")],
      waitForReady: false,
    });
    check("⑧ 代金券冷却没过 → 让位给试用,且令牌归属正确",
      opened.length === 1 && opened[0] === "trial-claim" && arb.current.value === "trial-claim",
      `opened=${JSON.stringify(opened)} holder=${arb.current.value}`);
  }

  // 轴 E:B1 名额 —— acquire 成功即占掉本次进首页的名额;beginHomeVisit 复位。
  {
    const arb = arbMod.usePopupArbiter();
    check("⑧ 🔴 B1 名额:acquire 成功即标记本次进首页已用掉(庆祝据此不再接着连播)",
      arb.visitClaimed.value === false && arb.acquire("voucher-claim") === true && arb.visitClaimed.value === true);
    arb.release("voucher-claim");
    check("⑧ B1 名额:归还令牌不复位名额(关掉≠没弹过,否则庆祝立刻接上就是连播)",
      arb.visitClaimed.value === true);
    arb.beginHomeVisit();
    check("⑧ B1 名额:重新进首页才复位", arb.visitClaimed.value === false);
  }
}

// ── ⑥ 编排层本身:优先级是数据 + 底盘接线(结构断言,headless 跑不了组件)────
{
  const arbSrc = readFileSync(path.join(root, "src", "store", "popup-arbiter.ts"), "utf8");
  // 优先级必须是一张有序表,而不是散落在各处的延迟数字之差(旧写法 1300 vs 1500)。
  const m = arbSrc.match(/POPUP_PRIORITY\s*=\s*\[([^\]]+)\]/s);
  check("⑥ 优先级表存在且是有序数组(不再靠延迟数字之差隐式表达顺序)", m !== null);
  if (m) {
    const ids = m[1].match(/"([a-z-]+)"/g)?.map((x) => x.replace(/"/g, "")) ?? [];
    check(`⑥ 🔴 顺序 = 主人 2026-08-16 拍板 A1「代金券 → 试用 → 庆祝」(实际 ${JSON.stringify(ids)})`,
      ids[0] === "voucher-claim" && ids[1] === "trial-claim" && ids[2] === "milestone",
      JSON.stringify(ids));
  }
  // C1:acquire 里必须有「已被别人占着就失败」这条,否则就是可顶替语义。
  check("⑥ 🔴 acquire 对已被他人持有的令牌返回 false(C1 永不顶替;删掉这条即变成抢屏)",
    /current\.value\s*!==\s*null\s*&&\s*current\.value\s*!==\s*id\)\s*return false/.test(arbSrc));
  // release 必须校验持有者,否则 A 关闭会把 B 刚拿到的令牌抹掉。
  check("⑥ release 只允许持有者归还(防 A 关闭时抹掉 B 的令牌)",
    /function release\(id: PopupId\)\s*\{\s*if \(current\.value === id\) current\.value = null;/.test(arbSrc));

  // 底盘:资格必须在触发时复算。旧写法把资格锁死在挂载那一刻,remote 档下代金券
  // 目录还没到货 → 定时器根本没排上,试用无人竞争地弹出(静默优先级反转)。
  const chassisSrc = readFileSync(path.join(root, "src", "components", "app-chassis.vue"), "utf8");
  check("⑥ 🔴 底盘不再有「代金券/试用」各自独立的挂载期定时器(两两互斥不封闭,加面必漏)",
    chassisSrc.indexOf("voucherPushTimer") === -1 && chassisSrc.indexOf("autoPushTimer") === -1,
    `voucherPushTimer=${chassisSrc.indexOf("voucherPushTimer")} autoPushTimer=${chassisSrc.indexOf("autoPushTimer")}`);
  // 🔴 判代码不判散文:整段行注释先剥掉。独立审计实测过 —— 不剥的话,把编排整段删掉、
  //    只把这几个字面量留在注释里,门照样 57/57 全绿。
  const stripLineComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const chassisCode = stripLineComments(chassisSrc);
  check("⑥ 🔴 底盘把评选委托给 store 层的 runPriorityRound(逻辑不许回到组件里,否则门只能用正则猜)",
    /runPriorityRound\(\{/.test(chassisCode) && /from "@\/store\/popup-arbiter"/.test(chassisCode),
    `has=${/runPriorityRound\(\{/.test(chassisCode)}`);
  check("⑥ 🔴 进首页复位 B1 名额(少了它,第二次进首页永远弹不出东西)",
    /popupArbiter\.beginHomeVisit\(\)/.test(chassisCode));
  check("⑥ 资格与就绪分别声明,且在触发时复算(两者都是函数,不是挂载期算好的布尔)",
    /eligible:\s*\(\)\s*=>/.test(chassisCode) && /ready:\s*\(\)\s*=>/.test(chassisCode));
  check("⑥ 🔴 庆祝宿主把「弹层是否真的开着」并入挂起判据(只问令牌会与屏幕脱节)",
    (() => {
      const celCode = stripLineComments(readFileSync(path.join(root, "src", "components", "milestone-celebration.vue"), "utf8"));
      return /voucherClaimSheet\.open\s*\|\|\s*trialClaimSheet\.open/.test(celCode)
        && /\{\s*immediate:\s*true\s*\}/.test(celCode);
    })());
}

// ── ④ 非钱链路即时弹 + 白名单不过宽 ──
{
  const s = freshStore();
  s.show(M100);
  const promoted = s.advance("pages/index/index");
  check("④ 普通页照常即时弹(advance 即上屏,队列清空)",
    promoted === true && s.active.value?.id === "earn-100" && s.pendingCelebrations.value.length === 0);

  const wrongPositive = PLAIN_ROUTES.filter((r) => isMoneyFlowRoute(r));
  check(`④ 白名单不误伤普通路由(样本 ${PLAIN_ROUTES.length}:store 首页/钱包首页等前缀近亲)`,
    wrongPositive.length === 0, wrongPositive.join(","));
  const missed = MONEY_ROUTES.filter((r) => !isMoneyFlowRoute(r));
  check(`④ 钱链路路由全命中(样本 ${MONEY_ROUTES.length},含 withdraw-tracking 前缀盖延)`,
    missed.length === 0, missed.join(","));
  check("④ 白名单前缀形态合法(都以 pages/ 开头且非裸前缀,防「pages/」一刀全挂起)",
    MONEY_FLOW_ROUTE_PREFIXES.length > 0 &&
      MONEY_FLOW_ROUTE_PREFIXES.every((p) => p.startsWith("pages/") && p.length > "pages/".length));
  check("④ 空路由(boot 期)不算钱链路", isMoneyFlowRoute("") === false);

  // 账号切换 / reset 不把 A 的庆祝漏给 B
  const s2 = freshStore();
  s2.show(M100);
  s2.show(M500);
  s2.bindAccount("user-b@example.com");
  check("④ bindAccount 清空 active+队列(A 的庆祝不弹给 B)",
    s2.active.value === null && s2.pendingCelebrations.value.length === 0);
  const s3 = freshStore();
  s3.show(M100);
  s3.reset();
  check("④ reset 清空 active+队列", s3.active.value === null && s3.pendingCelebrations.value.length === 0);
}

console.log(
  `selfcheck-milestone-queue: ${pass} pass / ${fail} fail(样本:${MONEY_ROUTES.length} 钱链路路由挂起、2 条逐条补发、3 个 z 层级、${PLAIN_ROUTES.length} 个近亲路由反例)`,
);
process.exit(fail > 0 ? 1 : 0);
