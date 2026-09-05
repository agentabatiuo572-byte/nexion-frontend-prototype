#!/usr/bin/env node
// 提现状态回读 **runtime** 门 —— 真页面、真 store、真 action,只桩网络那一层。
//
//   node scripts/withdraw-status-mirror-runtime.mjs          # 自己起一台 remote 档 server
//   BASE_URL=http://127.0.0.1:5263 node scripts/...          # 打已经起好的 remote 档 server
//
// 🔴 为什么必须是 runtime 门(本包立案的直接原因):
//   在此之前,全仓守这条链的**唯一**断言是 remote-authority-simulation.test.mjs 里的
//   `assert.equal(typeof app.refreshRemoteWithdrawals, "function")` —— 它只证「函数存在」。
//   实测(2026-08-11 红测):把 App.vue 里那行调用换成 `void Promise.resolve([])`,
//   contract-suite 仍 40 pass / 0 fail。**调用点被摘掉,门全绿,而在途单永远不终结**:
//   occupiesWithdrawalSlot 恒真 → 换绑入口与下一笔提现被永久拦死,账单行永远停在处理中。
//   「有生产者」≠「跑得到」,静态判据守不了可达性 —— 这一刀只有真跑一遍才守得住。
//
// 🔴 为什么自己起 server:回读只在 **remote 档**存在(mock 档 apiClient 一律 reject,
//   提现单压根建不出来),而 scripts/verify.sh 的 [2.5] 前置断言**要求 server 是 mock 档**
//   —— 本门借不了那台。不自带 server 就只能靠人手动起一台 remote 的,那等于这道门不会跑
//   (孤儿门是本仓记过的坑)。起法照 verify-h5-runtime.mjs:随机空闲端口 + 用完杀进程树。
//
// ⚠️ 本门**不覆盖**「冻结单收到终态结论」那条边(frozen 与四个终态在合并层同档,
//   同档位互转仍走不通)。那是主线既有缺陷,要真时序判据才修得动 ——
//   主人 2026-08-12 拍板拆成独立卡。**别在这里补一格断言当前(错的)行为**:
//   门断言错误行为 = 把缺陷焊成规格。缺陷登记在那张卡里,不在这里假装已守。
//
// 🔴 桩打在 **transport(apiClient.request)** 那一层,不是 withdrawalApi 的方法上:
//   桩方法会把 parseStatusSnapshot 一起桩掉,而那个解析器才是契约的真正守卫
//   (状态闭集、原因码归一、retriable 类型校验)。现在返回**原始报文**,解析器照跑。
//
// ── 2026-08-12 双向分叉合并后的口径变更(改了三处判据,逐条写明放弃了什么)──────────
//
// 🔴 一、不再断言「真落盘」。远端线把本地快照落盘在服务端档整体关掉了:
//   `persistAccountSnapshot()` 首行就是 `if (remoteApiEnabled) return false`
//   —— 状态归服务端,客户端不再自己持久化。原来那三格测的因此是一个**新架构下按设计
//   就不存在**的行为,留着就是拿门去焊一个已经作废的规格。
//   但「落盘」当初要证的东西不能跟着丢:它证的是**结论真的落定了**,不是改完内存又被丢掉。
//   新架构下同一件事的判据换成**收敛**:结论进内存后,拿同一份报文再回查一拍不再产生任何
//   变动,且终态单已经**退出在途集**(occupiesWithdrawalSlot 释放 —— 换绑入口与下一笔提现
//   随之解锁,这正是整条链存在的理由)。它比原判据更贴近用户可见后果,也不依赖任何存储实现。
//   放弃了什么:「刷新后还在」这一半。服务端档下那一半归服务端,客户端无从断言 ——
//   不假装守得住,所以下面另加一格**显式钉住**「服务端档不写本地快照」这条架构决定本身,
//   哪天有人把它悄悄改回去,门会说话。
//
// 🔴 二、渲染场景不再靠「落盘 + 跳页让页面从快照读」。那条路在新架构下盘上永远是空的。
//   改成与 ①-⑥ **同一个回查桩**:先种一张在途单,让服务端结论**穿过真的回查链**把它推到
//   终态,再跳追踪页断言话术。起点也跟着换成「结论确实穿过了链子 + 页面确实定位到这张单」。
//   这样这一格测的是整条「回查 → 消费 → 渲染」,而不是「我手写一行终态单,页面画得出来吗」。
//
// 🔴 三、远端档的「已登录」不再等于把 auth 两个布尔位翻过来(见下面 seedServerSession)。
//
// ⚠️ 2026-08-12 本门当前**红着**,红的是被测代码不是判据 —— 已定位、待主人裁决,别动判据:
//   `persistAccountSnapshot()` 在远端档恒返回 false(「本档按设计不落盘」),而
//   `refreshRemoteWithdrawals()` 把这个 false 读成「落盘失败」→ 走回滚分支 → 把刚镜像
//   回来的结论**整个丢掉**并返回空数组。两条闸各自都对,合到一起就把这条链焊死了:
//   函数体是 `if (!remoteApiEnabled) return []` 开头的,即它**唯一**能跑的档正是它必然
//   失效的档 —— 100% 不可达,不是概率问题。
//   实测(Pinia $subscribe flush:"sync" 逐拍取样):单据先被正确改成 review-rejected /
//   risk-hit,同一次调用里又被改回 processing / null。**镜像链本身是好的,死在回滚那一行。**
//   后果就是本门开篇写的那个洞:在途单永不终结 → occupiesWithdrawalSlot 恒真 →
//   换绑入口与下一笔提现被永久拦死,账单行永远停在处理中。
//   🔴 所以这些红**不许**靠放宽判据、跳过场景、或改回「只断言内存中间态」来消掉:
//   那等于把缺陷焊成规格(与上面 frozen 那条同一条家法)。修被测代码,红自然全绿。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 🔴 控件标签从 i18n 源码**读真值**,不在门里手抄一份(手抄的那份会静默过期:
// 首版抄成 "submit another",真值是 "Withdraw again",于是「找到 0 个控件」——
// 判据没命中任何东西却差点被当成通过)。三语都读,页面用哪个语种都认得出。
const AGAIN_LABELS = ["en", "zh", "vi"].map((locale) => {
  const src = fs.readFileSync(path.join(root, `src/i18n/messages/${locale}.ts`), "utf8");
  const m = /trackSubmitAnother:\s*"([^"]+)"/.exec(src);
  if (!m) throw new Error(`${locale}.ts 读不到 trackSubmitAnother —— 门的判据失效,不许静默跳过`);
  return m[1];
});
// 🔴 每个场景一个**独立单号**。四轮复用一个号会互相打架:上一轮的终态已经落盘,
// 下一轮把内存改回在途再落盘时,account-cloud 的合并让磁盘上那条终态赢回来
// (首跑实测:⑤⑥⑧ 读到的全是 ④ 那轮的值)。真实世界本来也是一单一号,复用本就不真。
const ID = {
  confirm: "WD-MIRROR-CONFIRM",
  orphan: "WD-MIRROR-ORPHAN",
  reject: "WD-MIRROR-REJECT",
  reasonOnly: "WD-MIRROR-REASON",
  render: "WD-MIRROR-RENDER",
  wiring: "WD-MIRROR-WIRING",
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const probe = (url) => new Promise((resolve) => {
  const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode === 200); });
  request.setTimeout(1000, () => request.destroy());
  request.once("error", () => resolve(false));
});

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`dev server exited early (${child.exitCode})\n${output()}`);
    if (await probe(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`dev server did not become ready\n${output()}`);
}

function stopTree(child) {
  if (!child || !child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

// 🔴 门必须**自带**这台桩后端。vite 把 /api 与 /auth 代理到
//   VITE_NEXGRID_API_PREVIEW_TARGET(缺省 127.0.0.1:8110)。那个端口上有没有人、是谁,
//   是**本机当下的偶然**:今天别的门起了一台 dev-stub-backend,本门就跑在「后端半在」的
//   世界里(启动期异常是 ApiError kind:"http");明天没人起,同一份代码跑在「连不上」的
//   世界里(kind:"network")。而下面那格「零未捕获异常」的分类判据正是挂在异常形状上 ——
//   形状取决于隔壁进程,那不是门,是掷骰子(本仓记过「验错对象的假绿」)。
//   自带一台只回「这个端点没实现」的桩,两个世界收敛成一个,且与真实缺后端同形。
let apiStub;
const apiStubPort = await freePort();
if (!process.env.BASE_URL) {
  apiStub = http.createServer((req, res) => {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: 40400, message: "GATE_STUB_ENDPOINT_NOT_IMPLEMENTED", data: null }));
  });
  await new Promise((resolve, reject) => {
    apiStub.once("error", reject);
    apiStub.listen(apiStubPort, "127.0.0.1", resolve);
  });
}

let server;
let baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const npmCli = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].find((candidate) => candidate && fs.existsSync(candidate));
  server = spawn(
    npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm"),
    [...(npmCli ? [npmCli] : []), "run", "dev:h5", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    // 🔴 显式 remote:remote 是默认档,但**默认值不是断言**。别的门用 env 把它按成 mock,
    // 谁在同一个 shell 里导出过就会把本门验到错的对象上(本仓记过「验错对象」的假绿)。
    // PREVIEW_TARGET 同理:显式指向本门自带的桩,不吃 .env 里那个 8110 的缺省。
    {
      cwd: root,
      env: {
        ...process.env,
        VITE_NEXGRID_API_MODE: "remote",
        VITE_NEXGRID_API_PREVIEW_TARGET: `http://127.0.0.1:${apiStubPort}`,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let out = "";
  server.stdout.on("data", (c) => { out = (out + c).slice(-12_000); });
  server.stderr.on("data", (c) => { out = (out + c).slice(-12_000); });
  await waitForServer(`${baseUrl}/?nx_device=off`, server, () => out);
}

// 🔴 浏览器也放进 try 之前会漏进程:server 已起、chromium 启动失败时 finally 还没生效。
// 这里用一个包住两者的 try/finally(见下),两个资源都由同一个 finally 回收。
let browser;
let page;

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // remote 档 + 无后端 = 启动期一堆 API 失败是**预期噪声**,不作判据(会淹掉真信号)。
  //
  // 🔴 但「噪声只落在 console、真信号才是 pageerror」这个旧前提在新架构下不成立了:
  //   远端档若干 fire-and-forget 调用(genesis.state / v-rank.ladder / commission.binary…)
  //   没有 catch,后端不在时变成**未处理的 promise rejection**;而 Playwright 的 pageerror
  //   把 uni 导航那种非 Error 的 reason 报成一个没有 message 的字面 "Object" ——
  //   既淹信号,又无从分类。所以改在页内监听,抓**结构化**的 reason。
  //
  // 🔴 分类不按 message 枚举(枚举必漏、且新码一来就静默失效),按 api 层**自己的**
  //   错误分类学 ApiError.kind 判:
  //     · network / http / business / auth → 后端不在或没答应,噪声;
  //     · protocol → 响应回来了但**读不懂** = 解析器炸了,这正是本门的正题,绝不放行;
  //     · configuration → 门自己把运行环境配错了,必须炸出来,不许当噪声;
  //     · 任何**不是** ApiError 的东西(TypeError、Vue 渲染错…)一律算真崩。
  //   uni 导航被后一次导航取消是本门自己制造的动静(启动期守卫跳转与门的跳转撞车),
  //   按 errMsg 形状单独放行,同样不吞:PASS 那行会把放行条数与样本打出来。
  await page.addInitScript(() => {
    window.__gateUncaught = [];
    const record = (source, reason) => {
      const entry = { source, name: "", kind: "", message: "", errMsg: "" };
      try {
        if (reason instanceof Error) {
          entry.name = String(reason.name || "");
          entry.kind = String(reason.kind || "");
          entry.message = String(reason.message || "");
        } else if (reason && typeof reason === "object") {
          entry.errMsg = String(reason.errMsg || "");
          entry.message = entry.errMsg || JSON.stringify(reason);
        } else {
          entry.message = String(reason);
        }
      } catch { entry.message = "<unserializable>"; }
      window.__gateUncaught.push(entry);
    };
    window.addEventListener("unhandledrejection", (event) => record("rejection", event.reason));
    window.addEventListener("error", (event) => record("error", event.error ?? event.message));
  });
  await page.goto(`${baseUrl}/?nx_device=off#/pages/me/wallet`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window.uni !== "undefined" && document.querySelector("#app")?.children.length,
    null,
    { timeout: 30_000 },
  );

  // 🔴 远端档的「已登录」不再是把 auth 两个布尔位翻过来就算数。守卫(App.vue remote 分支)
  //   要的是**运行时保险库里有一份服务端会话**,而且 auth.accountId 必须指向同一个 userId;
  //   对不上就 reLaunch 回引导页。保险库是**纯内存**的(session-vault:H5 要 HttpOnly
  //   cookie、原生要 Keychain 才配存,localStorage 不是可接受的凭据仓),所以只能在这里现种,
  //   预置 storage 没用。少了这一步,⑨ 的业务循环压根不起、渲染面永远到不了 ——
  //   合并前那版门只翻布尔位,于是这两片一起变成「测了个寂寞」。
  const seedServerSession = () => page.evaluate(async () => {
    const [rt, authMod] = await Promise.all([import("/src/api/runtime.ts"), import("/src/store/auth.ts")]);
    const auth = authMod.useAuth();
    const user = { userId: 900001, countryCode: "84", phone: "900000001", nickname: "Gate" };
    rt.sessionVault.save({
      accessToken: "gate-access", refreshToken: "gate-refresh", tokenType: "Bearer", user,
    });
    auth.isAuthenticated = true;
    auth.onboardingComplete = true;
    auth.accountId = `user:${user.userId}`;
    auth.email = "";
    return { vault: !!rt.sessionVault.read(), accountId: auth.accountId };
  });

  // 🔴 跳转要**核实真的落地了**,不能发完就当到了。启动期未认证,守卫会异步 reLaunch 到
  //   引导页;种完会话立刻跳会被那一拍**后发先至**地盖掉(实测:跳了、等 2.5s 还在引导页,
  //   而 auth 与保险库全是好的 —— 门自己制造的竞态)。重试三次仍没落地才算真失败:
  //   竞态吞掉一次是环境,次次弹回来是守卫真的不放行,两者必须区分得开。
  const gotoProtected = async (url) => {
    const target = `#${url.split("?")[0]}`;
    let last = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      last = await page.evaluate((u) => new Promise((resolve) => uni.redirectTo({
        url: u,
        success: () => resolve("ok"),
        fail: (error) => resolve(`fail:${(error && error.errMsg) || String(error)}`),
      })), url);
      await page.waitForTimeout(1200);
      const hash = await page.evaluate(() => location.hash);
      if (hash.startsWith(target)) return { landed: true, hash, attempt, last };
    }
    return { landed: false, hash: await page.evaluate(() => location.hash), attempt: 3, last };
  };

  const result = await page.evaluate(async ({ ID }) => {
    const [rt, appMod] = await Promise.all([import("/src/api/runtime.ts"), import("/src/store/app.ts")]);
    const app = appMod.useApp();
    // 环境不对就判失败并交底 ——「环境不对 → 跳过」是本仓明令禁止的假绿(跳过 ≠ 放宽)。
    if (!rt.remoteApiEnabled) return { notRemote: true };

    const seen = [];
    const realRequest = rt.apiClient.request;
    // 🔴 桩「拒答」时抛的必须是 **api 层自己的 ApiError(kind:"network")**,不是裸 Error。
    //   桩在模拟的就是「这个请求够不到后端」,而下面「零未捕获异常」那格按 ApiError.kind
    //   分类噪声 —— 裸 Error 会被正确地判成真崩,于是门被自己的桩打红(上一版实测:
    //   crashes 里赫然是 NO_BACKEND_IN_GATE)。桩要与它模拟的世界同形,否则测的是桩。
    const { ApiError } = await import("/src/api/errors.ts");
    const unreachable = (why) => new ApiError({ kind: "network", message: why, retryable: true });
    // 🔴 桩必须**按请求的单号**回话。上一版不看 req.path 一律回同一份报文,而
    // refreshRemoteWithdrawals 会把**所有在途单**逐个问一遍(前几轮的单据经三路合并
    // 还留在列表里)—— 于是这一轮的结论被套到了别人头上,断言时而红时而绿(实测:
    // ⑧ 读到的盘上原因是 ⑩ 那轮的 user-cancelled)。抖动的门比没有门更坏:
    // 它绿的时候你不知道是真绿还是这次刚好没撞上。不是目标单号就抛,让它保持原样。
    const mirrorOnce = async (payload) => {
      rt.apiClient.request = async (req) => {
        seen.push({ method: req.method, path: req.path });
        if (!String(req.path).endsWith(encodeURIComponent(payload.withdrawalNo))) {
          throw unreachable("NOT_THE_TARGET_ORDER");
        }
        return payload;
      };
      try { return await app.refreshRemoteWithdrawals(); }
      finally { rt.apiClient.request = realRequest; }
    };

    // 🔴 **每个场景先证起点,再证结果**(包 z7 结构性反思的落地项:同族「门看起来在测、
    // 实际没测到」在本包内出现过三次 —— 靶没落盘、桩不看单号、标签手抄错)。
    // seed 现在**返回被观测到的起点**:该单确实在内存里、确实被判为在途(回读只查在途单)、
    // 以及它在磁盘上的状态。任何一格的起点不成立,它后面那些绿都不作数。
    const starts = {};
    const seed = (id, over = {}) => {
      app.withdrawals = [{
        id,
        amount: 120,
        network: "USDT-TRC20",
        address: "TRX9Yh7mQ2vK8pLxN4dW6sJ3fBcHgR5tZa",
        fee: { networkConfirmUsd: 1, nexBurned: 0, actualFeeUsd: 1 },
        status: "processing",
        riskRoute: "pass",
        submittedAt: Date.now() - 3600_000,
        estimatedCompletion: Date.now() + 3600_000,
        ...over,
      }];
      starts[id] = {
        inMemory: app.withdrawals.some((w) => w.id === id),
        // 回读只问在途单;靶若不在在途集,这一格根本不会发生任何网络请求(空跑)。
        inFlight: app.inFlightWithdrawals.some((w) => w.id === id),
      };
      return starts[id];
    };
    const live = (id) => app.withdrawals.find((w) => w.id === id);
    // 🔴 「落定」判据(取代原来的「落盘」,见文件头口径变更一)。三件一起看才算数:
    //   结论字段是服务端那份 · 在途与否符合该状态该有的样子 · 再问一遍不再产生变动。
    const settled = (id) => {
      const row = live(id) || {};
      return {
        status: row.status ?? null,
        terminalReason: row.terminalReason ?? null,
        retriable: row.retriable ?? null,
        inFlight: app.inFlightWithdrawals.some((w) => w.id === id),
      };
    };
    // 🔴 服务端档**按设计不写本地快照**。这一格把那条架构决定本身钉住:它是下面三格
    //   「落盘」判据退役的**唯一理由**,哪天有人把本地持久化悄悄放回来,理由就没了,
    //   而那时判据已经换过 —— 门必须先在这里喊一声,而不是让口径无声地对不上被测代码。
    // 🔴 判「磁盘上到底有没有本地快照」,不判 persistAccountSnapshot() 的返回值
    // (2026-08-12:该返回值的语义已改成「内存这一拍可以留下吗」—— 远端档按设计不落盘
    //  时返回 true,因为不落盘是预期结果而非失败。用返回值判架构决定会随语义漂移;
    //  磁盘有没有那份快照,才是这条架构决定的可观测事实)。
    const snapshotKeyBefore = JSON.stringify(uni.getStorageSync("nexgrid-account-cloud-v1") || {});
    app.persistAccountSnapshot();
    const localSnapshotDisabled =
      JSON.stringify(uni.getStorageSync("nexgrid-account-cloud-v1") || {}) === snapshotKeyBefore;

    // ── ①②③ 服务端说 confirmed → 本地跟着变,并且**落定** ────────────────────
    seed(ID.confirm);
    const advancedByLocal = app.advanceWithdrawalArrival();
    const confirmPayload = {
      withdrawalNo: ID.confirm, status: "CONFIRMED", confirmedAt: Date.now(), terminalReason: null, retriable: null,
    };
    const mirroredIds = await mirrorOnce(confirmPayload);
    const afterConfirm = live(ID.confirm)?.status;
    // 🔴 第二拍:同一份报文再问一次。工作正常时它必须**什么都不改**(单据已进终态、
    //   已退出在途集,连请求都不该再发)。这一格取代了原来的「盘上是不是 confirmed」——
    //   它证的是同一件事(结论落定了,不是改完又被丢掉),而且顺带证了 slot 真的释放。
    const confirmSecondPass = await mirrorOnce(confirmPayload);
    const confirmSettled = settled(ID.confirm);

    // ── ④ TX_ORPHANED:后台真会产生的终态,此前会把整张镜像打死 ────────────────
    seed(ID.orphan);
    const orphanIds = await mirrorOnce({
      withdrawalNo: ID.orphan, status: "TX_ORPHANED", confirmedAt: null, terminalReason: "OTHER", retriable: true,
    });
    const afterOrphan = live(ID.orphan)?.status;

    // ── ⑤⑥ 终态原因 + 不可重试 ──────────────────────────────────────────────
    seed(ID.reject);
    const rejectPayload = {
      withdrawalNo: ID.reject, status: "REVIEW_REJECTED", confirmedAt: null,
      terminalReason: "RISK_HIT", retriable: false,
    };
    await mirrorOnce(rejectPayload);
    const rejected = live(ID.reject) || {};
    const rejectSecondPass = await mirrorOnce(rejectPayload);
    const rejectSettled = settled(ID.reject);

    // ── ⑧ 状态没动、但原因/可重试变了,也必须被消费并落定。
    //  🔴 靶必须用**非终态**:回查只查在途单(occupiesWithdrawalSlot),
    //  终态单已经离开在途集、再也不会被查 —— 拿 review-rejected 当靶的话这条断言
    //  在任何实现下都不可能通过,是个假靶(本门首版就写错成那样)。
    //  frozen 不在终态清单里(风控冻结仍算在途),正是「状态不动但结论会被人工改写」的真实场景。
    //
    //  🔴 靶必须**带着一份不一样的旧结论**入场。原来这里是「先落盘」,为的是让三路合并的
    //  同状态冲突分支真的被执行(不落盘 → 走「map 里没有它,直接放进去」那条 → 本格恒绿)。
    //  服务端档下已经没有磁盘那一路了,但那条防线要防的东西还在:**空的不是集合,是冲突**。
    //  所以改用字段级的冲突 —— 旧值 other/true,服务端给 address-risk/false,两个字段都必须
    //  被**改写**才算过。填空(旧值为空)与改写是两条不同的代码路径,只测得到填空等于没测。
    seed(ID.reasonOnly, { status: "frozen", riskRoute: "freeze", terminalReason: "other", retriable: true });
    const reasonOnlyBefore = settled(ID.reasonOnly);
    const reasonOnlyPayload = {
      withdrawalNo: ID.reasonOnly, status: "FROZEN", confirmedAt: null,
      terminalReason: "ADDRESS_RISK", retriable: false,
    };
    const reasonOnlyIds = await mirrorOnce(reasonOnlyPayload);
    const reasonOnlyRow = live(ID.reasonOnly) || {};
    // 非终态靶的第二拍:单据**仍在在途集**(还会被真的问一次),但字段已经一致,
    // 所以必须报「没有变动」。它把「改写生效了」和「每一拍都在反复改写同一件事」分开。
    const reasonOnlySecondPass = await mirrorOnce(reasonOnlyPayload);
    const reasonOnlySettled = settled(ID.reasonOnly);

    // ── ⑦ 解析器的**分档**规矩(R2 审计改过一次判据,这里守的是改后的规矩)────────
    // 抛不抛看「这个字段驱动什么」:
    //   驱动钱与状态机(status / 单号身份)→ 认不出必抛;
    //   只驱动显示(confirmedAt / terminalReason / retriable)→ 坏值降级成「没给」,绝不抛。
    // 为什么显示字段不许抛:抛出去会被调用方吞掉 → 整张单据镜像失败 → 单据永久停在处理中,
    // 而代价只是一句话没显示。两害相权。
    const apiMod = await import("/src/api/withdrawal-api.ts");
    const probeSnapshot = async (over) => {
      rt.apiClient.request = async () => ({
        withdrawalNo: ID.confirm, status: "CONFIRMED", confirmedAt: null,
        terminalReason: null, retriable: null, ...over,
      });
      try { return { ok: true, snap: await apiMod.createWithdrawalApi(rt.apiClient).get(ID.confirm) }; }
      // 两种协议错都算:认不出状态抛 STATUS_INVALID,其余报文违规抛 RESPONSE_INVALID。
      // (只认后者会让「状态闸」这一格永远判不过 —— 门自己的判据也要对得上被测代码。)
      catch (e) { return { ok: false, protocol: /WITHDRAWAL_(RESPONSE|STATUS)_INVALID/.test(String(e && e.message)) }; }
    };

    // (a) 认不出的**状态** = 驱动钱的字段 → 必抛。
    const badStatus = await probeSnapshot({ status: "WAT_IS_THIS" });
    const parserAlive = !badStatus.ok && badStatus.protocol;
    // (b) 单号对不上 → 必抛(服务端串号会把别人的状态和退款打到这张单上)。
    const crossTalk = await probeSnapshot({ withdrawalNo: "WD-SOMEONE-ELSE" });
    const idMismatchThrows = !crossTalk.ok && crossTalk.protocol;
    // (c) 显示字段的坏值一律降级成 null / other,**不抛**。
    //     confirmedAt: 0 是服务端最常见的「未设置」哨兵;retriable 给字符串;原因码给对象/数组。
    const degrade = [];
    for (const [label, over, expect] of [
      ["confirmedAt=0", { confirmedAt: 0 }, (s) => s.confirmedAt === null],
      ["confirmedAt 乱串", { confirmedAt: "not-a-date" }, (s) => s.confirmedAt === null],
      ["retriable 字符串", { retriable: "yes" }, (s) => s.retriable === null],
      ["原因码给对象", { terminalReason: { nope: 1 } }, (s) => s.terminalReason === null],
      ["原因码给数组", { terminalReason: ["RISK_HIT"] }, (s) => s.terminalReason === null],
    ]) {
      const r = await probeSnapshot(over);
      degrade.push({ label, ok: r.ok && expect(r.snap) });
    }
    // (d) 不认识的**字符串**码回落 other 而不抛(后台加新码不该打死老客户端)。
    const future = await probeSnapshot({ terminalReason: "SOME_FUTURE_CODE" });
    const unknownCodeFallsBack = future.ok && future.snap.terminalReason === "other";
    rt.apiClient.request = realRequest;

    // 🔴 渲染面的靶**不在这里种**(见下面 ⑨ 之后那一段):登录会触发
    //    bootstrapAccountSession → app.bindAccount(),按账号重新采纳快照、把内存里的
    //    单据表整个换掉。在这里种就会被那一下抹干净。顺序本身是判据的一部分。

    return {
      starts, localSnapshotDisabled,
      seen, advancedByLocal,
      mirroredIds, afterConfirm, confirmSecondPass, confirmSettled,
      orphanIds, afterOrphan,
      rejectedStatus: rejected.status, rejectedReason: rejected.terminalReason, rejectedRetriable: rejected.retriable,
      rejectSecondPass, rejectSettled,
      reasonOnlyIds, reasonOnlyBefore, reasonOnlySecondPass, reasonOnlySettled,
      reasonOnlyStatus: reasonOnlyRow.status,
      reasonOnlyReason: reasonOnlyRow.terminalReason,
      reasonOnlyRetriable: reasonOnlyRow.retriable,
      parserAlive, idMismatchThrows, degrade, unknownCodeFallsBack,
    };
  }, { ID });

  if (result.notRemote) {
    check("环境是远端档(回读只在远端档存在)", false, "当前是 mock 档 —— 本门在 mock 下测不到任何东西,不能算过");
  } else {
    const R = result;
    console.log("withdraw-status-mirror-runtime — 回查接口真的被调用,且返回值真的被消费\n");
    // 🔴 起点断言先行:靶没进在途集 = 这一格根本不会发生网络请求,后面的绿全是空跑。
    // 本包内同族失误三次(靶没落盘 / 桩不看单号 / 标签手抄错)的构造性修法,
    // 见 docs/changes/2026-08-11-z7-structural-reflection.md。
    // 起点判据现在**一刀切得起**:回读类四格全都从「一张在途单」出发(渲染类同样靠回查链
    // 推进,但它必须最后种,起点在它自己那一格里断言)。数量写死 4 而不是 >=4:
    // 「至少几个」在场景被误删时是恒真的,而恒真的守卫等于没有守卫。
    const startEntries = Object.entries(R.starts || {});
    const badStarts = startEntries
      .filter(([, v]) => !(v.inMemory && v.inFlight))
      .map(([id, v]) => `${id}(内存 ${v.inMemory} / 在途 ${v.inFlight})`);
    check(`⓪ 回读类每个场景的起点都成立(${startEntries.length} 格:靶必在内存且必在在途集 —— 回查只问在途单)`,
      startEntries.length === 4 && badStarts.length === 0,
      badStarts.join(" · ") || `靶数 ${startEntries.length} ≠ 4 —— 判据失效,后面的绿不作数`);
    // 🔴 这一格是上面三格「落盘」判据退役的**前提**,不是装饰:服务端档不写本地快照,
    //   所以「刷新后还在」由服务端负责、客户端无从断言。前提要是变了(有人把本地持久化
    //   放回来),判据就该跟着回去 —— 门必须在这里先喊一声,而不是让口径无声地过期。
    check("⓪ 前提成立:服务端档下本地快照落盘按设计关闭(它是「落盘」判据换成「收敛」的唯一理由)",
      R.localSnapshotDisabled === true,
      "远端档下调用落盘后磁盘快照变了 —— 本地持久化被放回来了,本门的收敛判据要改回落盘判据");
    check("① 回查真的被调用(桩收到对该单号的 GET,路径就是回查那条)",
      R.seen.some((c) => c.method === "GET" && c.path === `/api/withdrawals/${ID.confirm}`),
      `实际请求 ${JSON.stringify(R.seen.slice(0, 4))}`);
    check("① 远端档下本地推进不参与(状态只能来自服务端)",
      Array.isArray(R.advancedByLocal) && R.advancedByLocal.length === 0,
      `本地推进返回 ${JSON.stringify(R.advancedByLocal)}`);
    check("② 返回值被消费:服务端说 confirmed,本地单据跟着变",
      R.afterConfirm === "confirmed" && R.mirroredIds.includes(ID.confirm),
      `状态 ${R.afterConfirm} · 返回 ${JSON.stringify(R.mirroredIds)}`);
    // ③ 原判据「真落盘」在服务端档下测的是一个按设计不存在的行为(见文件头口径变更一)。
    //   换成**落定**:结论进了内存 · 单据退出在途集(slot 释放 —— 换绑入口与下一笔提现
    //   靠的就是这一步)· 拿同一份报文再问一拍不再产生任何变动。
    //   放弃了「刷新后还在」——那一半服务端档归服务端,客户端断言不了,不假装守得住。
    check("③ 结论**落定**:终态单退出在途集(slot 释放),且同一份报文再问一拍不再变动",
      R.confirmSettled.status === "confirmed"
        && R.confirmSettled.inFlight === false
        && Array.isArray(R.confirmSecondPass) && R.confirmSecondPass.length === 0,
      `落定 ${JSON.stringify(R.confirmSettled)} · 第二拍变动 ${JSON.stringify(R.confirmSecondPass)}`);
    check("④ 🔴 TX_ORPHANED 不再打死镜像,落到 tx-failed(此前:抛 protocol → 永久停在处理中)",
      R.afterOrphan === "tx-failed" && R.orphanIds.includes(ID.orphan),
      `状态 ${R.afterOrphan} · 返回 ${JSON.stringify(R.orphanIds)}`);
    check("⑤ terminalReason 归一并落到本地单据(线上 RISK_HIT → 本地 risk-hit)",
      R.rejectedStatus === "review-rejected" && R.rejectedReason === "risk-hit",
      `状态 ${R.rejectedStatus} · 原因 ${R.rejectedReason}`);
    // ⑤ 同 ③:原因不再问磁盘,改问「结论落定之后它还在不在」——客服要查的就是它,
    //   而它最容易死在「后一拍把没带原因的报文覆盖上来」那种回归上。
    check("⑤ 原因随单**落定**(终态已退出在途集,原因仍是服务端那份 —— 客服唯一的线索)",
      R.rejectSettled.terminalReason === "risk-hit"
        && R.rejectSettled.inFlight === false
        && Array.isArray(R.rejectSecondPass) && R.rejectSecondPass.length === 0,
      `落定 ${JSON.stringify(R.rejectSettled)} · 第二拍变动 ${JSON.stringify(R.rejectSecondPass)}`);
    check("⑥ retriable=false 落到本地单据",
      R.rejectedRetriable === false, `实测 ${JSON.stringify(R.rejectedRetriable)}`);
    // ⑧ 前提:原来是「靶先落盘」(为的是让同状态冲突分支真被执行)。服务端档下没有磁盘那一路,
    //   但那条防线要防的东西还在 —— **空的不是集合,是冲突**。改成字段级冲突:靶入场时
    //   必须带着一份**不一样的**旧结论,否则测到的只是「填空」,填空与改写是两条路。
    check("⑧ 靶带着一份不同的旧结论入场(旧值为空 = 只测得到填空、测不到改写 = 本格恒绿)",
      R.reasonOnlyBefore.status === "frozen"
        && R.reasonOnlyBefore.terminalReason === "other"
        && R.reasonOnlyBefore.retriable === true
        && R.reasonOnlyBefore.inFlight === true,
      `入场时 ${JSON.stringify(R.reasonOnlyBefore)} —— 冲突没造出来,下一格测不到任何东西`);
    check("⑧ 状态没变、只有原因/可重试变了,也必须被消费并落定(整拍丢掉 = 人工改写的结论永远到不了用户)",
      R.reasonOnlyIds.includes(ID.reasonOnly)
        && R.reasonOnlySettled.status === "frozen"
        && R.reasonOnlySettled.terminalReason === "address-risk"
        && R.reasonOnlySettled.retriable === false
        // 非终态:仍该留在在途集(冻结单还占着 slot),但字段已一致 → 第二拍必须报「没变动」。
        && R.reasonOnlySettled.inFlight === true
        && Array.isArray(R.reasonOnlySecondPass) && R.reasonOnlySecondPass.length === 0,
      `返回 ${JSON.stringify(R.reasonOnlyIds)} · 落定 ${JSON.stringify(R.reasonOnlySettled)} · 第二拍变动 ${JSON.stringify(R.reasonOnlySecondPass)}`);
    check("⑦ 认不出的**状态**必抛(它驱动钱与状态机,猜一个等于拿钱赌)",
      R.parserAlive === true, "认不出的状态却没抛 —— 驱动钱的字段失守了");
    check("⑦ 🔴 单号对不上必抛(服务端串号会把别人的状态和退款打到这张单上)",
      R.idMismatchThrows === true, "响应里的单号与请求的不一致,却被照单全收");
    check("⑦ 🔴 只驱动显示的字段坏值一律降级成「没给」,**绝不抛**(抛 = 整张单据镜像失败 = 单据永久卡住)",
      Array.isArray(R.degrade) && R.degrade.length === 5 && R.degrade.every((d) => d.ok),
      (R.degrade || []).filter((d) => !d.ok).map((d) => d.label).join(" · "));
    check("⑦ 但不认识的**字符串**码必须回落 other 而**不抛**(否则后台加个新码就打死老客户端)",
      R.unknownCodeFallsBack === true, "未知码没回落到 other");
  }

  // ── ⑨ 🔴 接线断言:**App 自己**去调,本脚本一根手指都不碰那个 action ──────────
  // 上面 ①-⑧ 证的是「这个 action 干得对」,证不了「有人调它」—— 我在测试里手调了它。
  // 摘掉 App.vue 那行调用,①-⑧ 会全绿,而在途单永远不终结:这正是本包立案的那个洞,
  // 门要是复制了这个盲区,就是换个地方重演一遍。所以这一格只做三件事:
  // 装桩 → 让 App 的业务循环跑起来 → 等 → 看单据变没变。中间不调 refreshRemoteWithdrawals。
  // 🔴 前置条件先种、并且**核实真的进了受保护页**。合并后守卫要的是保险库里的服务端会话
  //   (见 seedServerSession),光翻 auth 的布尔位会被弹回引导页 —— 而引导页上业务循环
  //   压根不起:这一格于是变成「被问 0 次」的红,红得对但根因指错地方(像是接线掉了,
  //   其实是门自己没登录成功)。所以把「登录成功 + 站在受保护页上」升级成显式起点断言。
  const session = await seedServerSession();
  const landing = await gotoProtected("/pages/me/wallet");
  check("⑨ ⓪ 起点:服务端会话已种进保险库,且真的站在受保护页上(不成立则业务循环根本不起)",
    session.vault === true && landing.landed === true,
    `保险库 ${session.vault} · 账号 ${session.accountId} · 落地 ${landing.hash}(第 ${landing.attempt} 次尝试:${landing.last})`);

  const wiring = await page.evaluate(async ({ id }) => {
    const [rt, appMod] = await Promise.all([import("/src/api/runtime.ts"), import("/src/store/app.ts")]);
    const app = appMod.useApp();
    const { ApiError } = await import("/src/api/errors.ts");

    // 🔴 **追加**而不是整表替换:渲染面那张靶此刻只活在内存里(服务端档不落盘),
    //   一整表覆盖就把它抹了,后面渲染几格会去追踪页看一个不存在的单号 —— 空态,全红,
    //   而根因藏在这一行。合并前那版能整表覆盖,是因为渲染靶在磁盘上、跳页会重新读回来。
    app.withdrawals = [{
      id,
      amount: 88,
      network: "USDT-TRC20",
      address: "TRX9Yh7mQ2vK8pLxN4dW6sJ3fBcHgR5tZa",
      fee: { networkConfirmUsd: 1, nexBurned: 0, actualFeeUsd: 1 },
      status: "processing",
      riskRoute: "pass",
      submittedAt: Date.now() - 3600_000,
      estimatedCompletion: Date.now() + 3600_000,
    }, ...app.withdrawals.filter((w) => w.id !== id)];

    let asked = 0;
    const realRequest = rt.apiClient.request; // 🔴 用完必还原:不还原会把这个 origin 的
    // apiClient 永久钉在桩上,脚本头部文档化的「BASE_URL 打已有 server」用法会污染真账号。
    rt.apiClient.request = async (req) => {
      if (req.method === "GET" && req.path === `/api/withdrawals/${id}`) {
        asked += 1;
        return { withdrawalNo: id, status: "CONFIRMED", confirmedAt: Date.now(), terminalReason: null, retriable: null };
      }
      // 其余请求照「后端不在」的样子失败 —— 别顺手把整个 app 桩成一个假世界。
      // 抛 ApiError(kind:"network")而不是裸 Error:桩要与它模拟的世界同形,
      // 否则「零未捕获异常」那格会被门自己的桩打红(实测:crashes 里就是 NO_BACKEND_IN_GATE)。
      throw new ApiError({ kind: "network", message: "NO_BACKEND_IN_GATE", retryable: true });
    };

    // 已经站在 /pages/me/wallet 上了(上面 gotoProtected 核实过)。
    // onShow → ensureBusinessLoopsRunning:首次会立刻跑一轮,已在跑则靠 5s 轮询那一拍。
    await new Promise((r) => setTimeout(r, 7000)); // > ARRIVAL_TICK_MS(5s),覆盖两条路径
    const row = app.withdrawals.find((w) => w.id === id);
    rt.apiClient.request = realRequest;
    return { asked, status: row?.status, route: location.hash };
  }, { id: ID.wiring });

  check("⑨ 🔴 App 自己发起了回查(本脚本没调 action —— 摘掉调用点这一格必红)",
    wiring.asked > 0, `被问次数 ${wiring.asked} · 当前路由 ${wiring.route}`);
  check("⑨ 🔴 App 自己消费了返回值(单据被服务端的结论推到终态)",
    wiring.status === "confirmed", `状态 ${wiring.status} · 被问 ${wiring.asked} 次`);

  // ── 渲染面的靶:种在**会话与账号绑定都尘埃落定之后** ─────────────────────────
  // 🔴 顺序是判据的一部分。登录会触发 bootstrapAccountSession → app.bindAccount(),
  //   它按账号重新采纳快照、把内存里的单据表整个换掉。合并前那版渲染靶活在磁盘上,
  //   被换掉也能读回来;现在它只活在内存里(服务端档不落盘),种早一步就被这一下抹干净。
  //   实测:追踪页显示「查无此单」,而根因在几百行之外的 seed 时机上。所以靶最后种。
  //
  // 🔴 同样走**回查桩**把它推到终态,不手写终态行:手写只能证明「页面画得出来」,
  //   证不了页面画的是服务端说的那一份 —— 后者才是本门的正题(文件头口径变更二)。
  const renderStart = await page.evaluate(async ({ id }) => {
    const [rt, appMod] = await Promise.all([import("/src/api/runtime.ts"), import("/src/store/app.ts")]);
    const app = appMod.useApp();
    const { ApiError } = await import("/src/api/errors.ts");
    app.withdrawals = [{
      id,
      amount: 120,
      network: "USDT-TRC20",
      address: "TRX9Yh7mQ2vK8pLxN4dW6sJ3fBcHgR5tZa",
      fee: { networkConfirmUsd: 1, nexBurned: 0, actualFeeUsd: 1 },
      status: "processing",
      riskRoute: "pass",
      submittedAt: Date.now() - 3600_000,
      estimatedCompletion: Date.now() + 3600_000,
    }, ...app.withdrawals.filter((w) => w.id !== id)];
    const seeded = {
      inMemory: app.withdrawals.some((w) => w.id === id),
      inFlight: app.inFlightWithdrawals.some((w) => w.id === id),
    };
    const realRequest = rt.apiClient.request;
    rt.apiClient.request = async (req) => {
      if (!String(req.path).endsWith(encodeURIComponent(id))) {
        throw new ApiError({ kind: "network", message: "NOT_THE_TARGET_ORDER", retryable: true });
      }
      return {
        withdrawalNo: id, status: "REVIEW_REJECTED", confirmedAt: null,
        terminalReason: "RISK_HIT", retriable: false,
      };
    };
    try { await app.refreshRemoteWithdrawals(); }
    finally { rt.apiClient.request = realRequest; }
    const row = app.withdrawals.find((w) => w.id === id) || {};
    return {
      ...seeded,
      // 结论**确实穿过了链子**落进内存(追踪页读的就是 app.withdrawals,深链按单号精确定位)。
      mirrored: row.status === "review-rejected" && row.terminalReason === "risk-hit" && row.retriable === false,
      row: { status: row.status ?? null, terminalReason: row.terminalReason ?? null, retriable: row.retriable ?? null },
    };
  }, { id: ID.render });

  // ── 渲染面:原因翻成话术、码不上页面、按钮真置灰 ────────────────────────────
  // 用 SPA 内跳转而不是整页 reload:留在同一个 JS 上下文里,不重放一轮启动期请求。
  const tracking = await gotoProtected(`/pages/me/wallet-withdraw-tracking?id=${ID.render}`);
  await page.waitForTimeout(1800);
  // 🔴 渲染类场景的起点(三截都要):靶从在途单出发 · 结论**穿过回查链**落进内存 ·
  //   追踪页**真的定位到**这张单。少了最后一截,页面在空态(「查无此单」)时下面几格测的是
  //   空气 ——「页面上不出现原始枚举码」在一张空页面上恒真,正是本仓记过的假绿形态。
  const resolved = await page.evaluate((id) => document.body.innerText.includes(id), ID.render);
  check("⓪ 渲染起点:靶从在途出发、结论穿过回查链进内存、追踪页真的定位到这张单(空态 = 后面几格测空气)",
    renderStart.inMemory === true && renderStart.inFlight === true
      && renderStart.mirrored === true && tracking.landed === true && resolved === true,
    `在途 ${renderStart.inFlight} · 穿链 ${renderStart.mirrored}(实际 ${JSON.stringify(renderStart.row)}) · 落地 ${tracking.landed}(${tracking.hash}) · 页面认得这张单 ${resolved}`);
  const view = await page.evaluate((labels) => ({
    text: document.body.innerText,
    // 🔴 按 aria-label **点名**那个控件,不数「页面上有没有任一 aria-disabled」
    //(独立审计 P2:形状判据今天红得对是巧合 —— 换个控件被置灰它也绿)。
    againDisabled: [...document.querySelectorAll('[role="button"]')]
      .filter((b) => labels.includes((b.getAttribute("aria-label") || "").trim()))
      .map((b) => b.getAttribute("aria-disabled")),
  }), AGAIN_LABELS);
  check("⑤ 追踪页把原因渲染成业务话术(渲染面接得上生产面)",
    /Unusual account activity|账户行为异常|Tài khoản có hoạt động bất thường/.test(view.text),
    view.text.replace(/\s+/g, " ").slice(0, 200));
  check("⑤ 🔴 页面上不出现原始枚举码(工程值禁直出)",
    !/RISK_HIT|risk-hit|TX_ORPHANED/.test(view.text), "页面出现了原始码");
  check("⑥ retriable=false 如实说给用户(这笔不能再发起 + 联系客服)",
    /cannot be resubmitted|不能再次发起|Không thể gửi lại/.test(view.text),
    view.text.replace(/s+/g, " ").slice(0, 220));
  // 🔴 反向断言:单据级的「这笔不能重发」**不许**去禁账号级的「再提一笔」
  //(独立审计 P1:失败单永久留存 + 终态不再回查 → 一张历史废单会把入口永久锁死)。
  check("⑥ 🔴 但它**不**置灰「再提一笔」(单据级结论不许禁账号级动作)",
    view.againDisabled.length > 0 && view.againDisabled.every((v) => v !== "true"),
    `找到 ${view.againDisabled.length} 个该控件,aria-disabled=${JSON.stringify(view.againDisabled)}`);

  // 🔴 分类按 api 层**自己的**错误分类学(ApiError.kind),不按 message 枚举:
  //   枚举必漏,而且后台加个新码就静默失效(本仓记过「补清单只补到我刚加的那几条」)。
  //   noise = 够不到后端 / 后端没答应(network·http·business·auth);
  //   真崩 = protocol(响应回来了却读不懂 —— 解析器炸了,这是本门的正题,绝不放行)
  //          · configuration(门自己把环境配错了,必须炸出来)
  //          · 任何不是 ApiError 的东西(TypeError、Vue 渲染错…)。
  const uncaught = await page.evaluate(() => window.__gateUncaught || []);
  const backendAbsent = (e) => e.name === "ApiError" && ["network", "http", "business", "auth"].includes(e.kind);
  // 门自己的跳转与启动期守卫跳转撞车时,uni 抛的是「本次导航被后一次取消」——
  // 那是本门制造的动静,不是代码坏了。只放行「被取消」这一种,别的导航失败照红。
  const navCancelled = (e) => /:fail /.test(e.errMsg) && /cancelled/i.test(e.errMsg);
  const noise = uncaught.filter((e) => backendAbsent(e) || navCancelled(e));
  const real = uncaught.filter((e) => !(backendAbsent(e) || navCancelled(e)));
  // 🔴 噪声**不静默吞掉**:条数和样本打在标题里。看不见的地毯底下迟早埋一条真信号。
  check(`零未捕获异常(已分类放行 ${noise.length} 条环境噪声:${
    [...new Set(noise.map((e) => e.name === "ApiError" ? `ApiError/${e.kind}` : "uni 导航被取消"))].join(" + ") || "无"
  })`,
    real.length === 0,
    real.slice(0, 3).map((e) => `${e.source}:${e.name || "?"}${e.kind ? `/${e.kind}` : ""}:${e.message}`).join(" | "));
} finally {
  if (browser) await browser.close();
  stopTree(server);
  if (apiStub) await new Promise((resolve) => apiStub.close(resolve));
}

console.log(`\n${pass} pass / ${fail} fail(真页面 + 真 store + 真 action;仅桩 apiClient.request 一层)`);
process.exit(fail ? 1 : 0);
