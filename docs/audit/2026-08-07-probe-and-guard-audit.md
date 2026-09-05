# 2026-08-07 探针与权限守卫 独立审计发现

来源:20 个 agent 的独立审计(4 维度并行审查 + 每条发现派独立对抗验证员**亲自跑复现**证伪)。
**确认 14 条 / 被证伪 2 条**。下表只列通过对抗验证的。

> 起因:一轮「让探针别打错 dev server」的工具修复,修好后探针开始能看见页面,
> 于是照出了这一批本来就在、只是没人看得见的问题。

## 状态（2026-08-07 审计快照，已桥接至 2026-08-09 当前工作树）

主线在本审计出结果的同时,已由 `pkg/x2-route-reader` 线做掉了族 A 的结构性修复
(路由读取口收成单源 + **守卫轮询无条件启动**)。复核结论:

| 条目 | 状态 | 依据 |
|---|---|---|
| P0 · App.vue:622 白名单页→站内跳转越权 | ✅ **已修** | 实测:登出态从引导页/登录页纯改 hash 进提现页/收益页,8 秒内均被踢回引导页 |
| P0 · App.vue:614 静态审阅页进入 → 守卫整局不启动 | ✅ **已修**(`pkg/y1-guard-liveness`) | 实测:登出态评审页冷启动 → 应用内进提现页 → 落 `pages/onboarding/intro`;守卫 1s 定时器数由 0→1;评审页落地的标签补认领 sessionId,跨标签登出踢得掉。已由独立审计复跑确认 |
| P1 · App.vue:335 业务轮询主路径回归 | ✅ **已修** | 实测:已登录从登录页冷启动→站内跳收益页,quest 键已写=轮询在跑 |
| P1 · App.vue:522 / :622 守卫自毁与启动点 | ✅ **已修**(同上) | 与 P0:614 同一根因,已一并根治并单独红测:撤回修复即判红 |
| 🆕 P1 · **同根因第三条腿:业务循环永久死亡** | ✅ **H5/local-mock 已修** | 集中启停与隔离 H5 行为门通过；门禁同时要求 `syncFailed=false`、原始设备/聚合收益和结算锚点实际推进，不再只看 timer；真实后端、原生真机与 Janus C2 端到端仍 HOLD |
| 族 B · 5 个探针缺 `?nx_device=off` | ✅ **已修并加固** | 5 个探针统一走 `directAppUrl()`，要求业务语义标记、模块绑定的 UniApp runtime identity，并对 `console.error` / `pageerror` 失败关闭；空壳、无关 200 HTML、浅层伪造 DOM 与通用 `#app/body` 选择器不能报绿 |
| 族 C · 3 个探针探不到也报绿 | ✅ **已修** | 截图/比对、DOM sweep、鉴权结果均接入 fail-closed 覆盖断言；零覆盖、缺图、崩溃与路由不符必红 |
| 族 D · 归一化不折叠 `..` | ✅ **已修并覆盖已登录态** | 解码后折叠 `.`/`..`；同文档 hash 优先于陈旧页面栈，规范化导航失败会按 750ms 自愈重试；17 层编码、越根与畸形路径统一失败关闭到引导页，不再留下 Vue Router 白屏 |

**本审计确认的 14 条现已全部闭环；当前净剩 0 条。** 这里的“闭环”只覆盖本审计定义的前端探针、路由守卫与 H5/local-mock 生命周期范围，不扩大为真实后端资金结果、原生真机或 Janus C2 生产链路签发。

## 2026-08-08 跟进：第三条腿的 H5/local-mock 生命周期缺陷已收口

本节是对上方 2026-08-07 历史快照的状态桥接，不改写当日复现事实。当前工作树已把业务循环统一收进 `ensureBusinessLoopsRunning()` / `stopBusinessLoops()`，常驻守卫离开静态评审页后会重新校验认证与会话，并在授权成立时幂等恢复循环。

- 结构证据：`scripts/selfcheck-business-loop-liveness.mjs` 通过，含删除路由自愈、删除幂等短路、漏接到账循环、停止函数失效、注入未登记 interval/timeout、漏停已登记 timeout、业务依赖模块内递归 timeout、入金 mock 引擎漏停/漏检查，以及退化为 timer-only witness / 反转 local-mock 配置分支共 13 组变异红测；
- H5 行为证据：`scripts/business-loop-liveness-runtime.mjs` 的“业务页 → 评审页 → 业务页”与未登录 fail-closed 对照 2/2 通过，1/4/5/6 秒周期均按预期停机/恢复；已登录正向改用默认低速账号并观察 30 秒，逐值要求 `configSyncFailed=false`、原始设备收益、聚合收益、`lastSettledAt` 和格式化到分的可见金额都在返回业务页后推进；
- 对抗复审发现过“六个 timer 均 running、但 local-mock 错把 Vite 的 200 HTML 当远程配置响应，`syncFailed=true` 令结算早退”的假绿。`useConfig().load()` 现按 `remoteApiEnabled` 分流：mock 只启用内存种子，不请求 `/api/config/platform`；remote 仍保持请求失败即暂停结算的 fail-closed 语义；
- 第二轮对抗复审又发现默认低速账号虽然设备收益推进，但聚合值每 tick `toFixed(2)` 会反复吞掉 0.001 的分币以下增量。`earnings-accrual.ts` 现保留毫级累计，并只把新跨过的完整分路由进余额桶；纯函数合同 3/3 锁住 30 次 0.001 最终累计为 0.030、入桶 0.03 的不变量；
- 对抗复审发现并修掉 Janus 在途竞态：`stopJanusC2Sync()` 现会 abort 当前请求并淘汰旧代次；延迟 report / runtime apply 红测证明停机后不会继续落运行态或发 ACK；
- 行为门已纳入可自动起隔离 H5 server 的 `npm run verify`，dev server 未预启不再被当作可跳过条件；
- 原守卫门未回归：结构门 19/19、H5 行为门 3/3 通过；
- 状态：这 1 条在 H5/local-mock 范围转为 ✅，但真实后端资金结果、原生真机与 Janus C2 端到端仍为 HOLD；当前剩余量以顶部状态表为准。

## 2026-08-09 复验：族 B / C / D 的假绿与已登录白屏已闭环

- 族 B：`spec6-entry-surface-runtime.mjs`、`trial-check.mjs`、`sticky-check.mjs`、`backnav-check.mjs`、`page-check.mjs` 统一使用 `scripts/lib/direct-app-url.mjs` 生成 `?nx_device=off` 直渲地址；五个脚本全部拒绝运行时错误、逐值绑定预期地址栏 hash，入口页和通用页面探针还必须命中业务语义标记。`src/main.ts` 另提供只读 runtime marker 与 `import.meta.url`，探针会回取同源已加载模块并核对 marker、Vue 挂载、Uni API 与非空页面栈，浅层伪造 `html/body/#app/*`、业务 class 或 `uni` 方法，以及保留陈旧页面栈却清空 hash 的 witness 均不能充当候选身份。五探针已全部接入隔离 H5 总门；
- 族 C：`chrome-baseline.mjs` 要求五张完整 PNG 与无错误报告，diff 两侧缺任一目标图即红；`dom-qa.mjs` 要求完整路由覆盖且任何 probe crash 禁止写入 ledger；`auth-guard-verify.mjs` 对已登录、登出重定向、引导页不循环及路径穿越四个结果逐值断言；
- 族 D：`normalizeRoute()` 先有限次解码，再统一斜杠并折叠 dot segments；`routeFromH5Location()` 在同文档未知路由时以地址栏 hash 覆盖陈旧 UniApp 页面栈。H5 raw hash 经 `canonicalH5RouteUrl()` 归一化后 `reLaunch`，若首枪被路由器吞掉则 750ms 后重试；17 层编码、畸形编码与越根路径没有 canonical identity 时统一失败关闭到 onboarding。默认已登录与登出、首次直达与同文档切换均不再白屏；旧 KYC 深链落到安全页后同时提供即时 toast 与持久退役说明，冷启较快时也不依赖瞬时提示；
- 防复发：`npm run test:probe-safety` 19/19，`npm run verify` 已串入结构门、H5 构建、20 个隔离浏览器场景及 5 个直接 DOM 探针；鉴权门 15/15 覆盖默认/登出、同文档 KYC 与 dot-segment、静态评审页连续三轮、16/17 层编码及 above-root，同时要求非空 App DOM、精确路由、可见退役说明及零 `pageerror`/同源 console error。2026-08-09 的 5173 local-mock 运行态同样全部通过；

### 🔴 第三条腿:路过静态评审页 → 全部业务循环永久死亡(含钱的路径)

**2026-08-07 由 `pkg/y1-guard-liveness` 的独立审计发现;不是 y1 引入的,也不在 y1 范围内,未修。**

`startTick / startArrivalPoll / startTrialPoll / startOrderPoll / startMilestonePoll`
**全站唯一起点**就在 `onShow` 里(已 grep 确认无第二处),而 `stopBusinessLoops()` 有 8 个调用点。
H5 的 App 级 `onShow` 不随应用内跳转触发 —— 于是任何一次「本页不该跑业务」的停止,
在本次页面加载内**都是永久的**。结构上就是「谁都能停,只有一处能起」的不对称。

实测(已登录,存活定时器周期计数):

| 步骤 | 路由 | 1s | 4s | 5s | 6s |
|---|---|---|---|---|---|
| ① 正常落地首页 | `pages/index/index` | 6 | 2 | 1 | 1 |
| ② 应用内进评审页 | `pages/entry-surfaces/index` | 1 | 0 | 0 | 0 |
| ③ 立刻回首页 | `pages/index/index` | 5 | **0** | **0** | **0** |
| ④ 8 秒后 | `pages/index/index` | 5 | **0** | **0** | **0** |

**后果落在钱上**:到账推进与账单结算挂在 5s 轮询上 —— 不跑就意味着本次加载内
提现单永远停在「处理中」、账单行不结算、失败提现不退款、NEX 抵扣费的反向分录不补;
里程碑奖励(4s)不发;试用状态机与订单都不推进。只有切后台再回前台才自愈。

**注意别误读 y1**:y1 的实测结论「中途路过评审页 → 跨标签登出踢得掉」对**守卫**成立,
对**业务循环**不成立。守卫和业务循环是两件事,y1 只收口了守卫那件。

**建议改法**(留给排期的人,y1 未做):别再「只留停点不留起点」。
要么让守卫每拍在条件允许且循环未起时补起(与守卫自愈同一套思路),
要么把业务循环的起停统一收进一个由守卫驱动的 `ensureBusinessLoopsRunning()`。

## 分族(禁止逐条打补丁,每族一条根治)

| 族 | 条数 | 共同根因 | 根治方向 |
|---|---|---|---|
| A · 守卫存活性 | 4 | 唯一的周期性权限守卫被焊在业务轮询的门控里、且只判一次;启动钩子在 H5 下不随站内跳转触发 | 守卫拆成**不受业务门控、每拍重判**的常驻件;业务轮询改为可自愈 |
| B · 探针读的是空外壳 | 5 | `page.goto` 缺 `?nx_device=off`,localhost 下读到的是外壳空文档 | 补参数 + 加一道 grep 哨兵焊死(机器可测) |
| C · 探针探不到也报绿 | 3 | 覆盖面只打印、不参与判定 | 照抄 `tap-feedback-probe` 已验证的写法:扫到 0 个目标必红 |
| D · 路由归一化 | 1 | 归一化不折叠 `..` | 归一化里折叠路径段 |

## 发现明细

### [P0] src/App.vue:622

**族**:A · 守卫存活性

**缺陷**:登出态访问者只要先落在任一白名单页(intro/login/register/session-kicked/entry-surfaces),再做一次站内跳转(改 hash,不刷新),就能进入并**长期停留**在任意业务页,含提现页,且可操作。根因:onShow 里 `if (!ensureBusinessLoopsAllowed()) return;`(622 行)在未认证时为 false 直接 return,导致 632 行的 `startQuestWatch()` 永不执行;而 `checkQuestRoute` 的 1s 轮询是**唯一**的周期性权限守卫(全站无任何页面级守卫,grep isAuthenticated 只命中 App.vue + 登录/注册页)。冷启动那一次守卫命中后,这个 tab 余生再没有第二次检查。本轮改动修好了「第一次 URL 检查会不会触发」,没修「周期性守卫还在不在」。

**复现**:

```
1) 浏览器开 http://localhost:5211/?nx_device=off#/pages/onboarding/intro
2) console 执行:localStorage.setItem("nexgrid-auth-v1", JSON.stringify({type:"object",data:{isAuthenticated:false,email:"",onboardingComplete:false}}))
3) 刷新页面 —— 仍停在 intro(冷启动守卫正确生效)
4) 只改地址栏 hash 为 #/pages/me/wallet-withdraw,回车(**不刷新**)
5) 观察:停留 25s 无重定向,页面显示 Withdrawable: $24856.56,点 Use max 金额被填入。再刷新才会被踢回 intro。
脚本版(已跑通,含 18 种路由形态基线):BASE_URL=http://localhost:5211 node "C:/Users/jason/AppData/Local/Temp/claude/D--WORKS-PLAN-Nexion-uniapp--claude-worktrees-fervent-booth-7829b8/3d189f49-176c-4e0d-8f9c-7bec2f8db466/scratchpad/attack2.mjs" 和 attack3.mjs
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
复现命令(探针为我自建,已跑完 Move 进 .trash;内容见 reasoning 描述的逻辑):
  cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8
  BASE_URL=http://localhost:5211 node tmp-xverify4.mjs

=== 最终干净一轮(前后源码指纹一致,未被并发 agent 污染)===
$ md5sum src/App.vue
12d6cacdfb32f0818d648432724b1d41 *src/App.vue

SOURCE-FINGERPRINT {"tag":"BEFORE","gitClean":true,"head":"fdbf87d","guard_readsHashFallback":true,"whitelist_normalizes":true,"onShow_returnsBeforeQuestWatch":false,"noExperimentMarkers":true}
SOURCE-FINGERPRINT {"tag":"AFTER","gitClean":true,"head":"fdbf87d","guard_readsHashFallback":true,"whitelist_normalizes":true,"onShow_returnsBeforeQuestWatch":false,"noExperimentMarkers":true}
{
  "step3_cold_start_intro": "/pages/onboarding/intro",
  "step5_25s_samples": {
    "unique": [
      "/pages/me/wallet-withdraw"
    ],
    "count": 25
  },
  "step5_navigations": 1,
  "step5_withdrawable": "Withdrawable: $24856.56",
  "step5_questWatcherKey": null,
  "step5b_amountInputAfterUseMax": "24856.56",
  "step6_after_reload": "/pages/onboarding/intro",
  "SOURCE_STABLE": true
}
$ md5sum src/App.vue   (POST)
12d6cacdfb32f0818d648432724b1d41 *src/App.vue

注:onShow_returnsBeforeQuestWatch 报 false 是我的正则没吃下 vite 转译后的注释/空白,不是代码不符;已回源核对 App.vue:622 `if (!ensureBusinessLoopsAllowed()) return;` 与 :632 `startQuestWatch();` 的先后关系确凿。

=== 机制对照 + 纯手势 + 时长(第 2 轮,md5 前后同为 12d6cacd)===
{
  "A_authed_earn_watcherWrites": {
    "route": "/pages/earn/earn",
    "questKeyWritten": true,
    "questKeySnippet": "{\"type\":\"object\",\"data\":{\"default\":{\"completed\":[\"visit_earn\"]}}}"
  },
  "B_backButton": {
    "afterGuard": "/pages/onboarding/intro",
    "afterBack": "/pages/index/index",
    "uniqueSamples": ["/pages/index/index"],
    "heldSec": 15,
    "navigations": 1
  },
  "C_interaction": {
    "landed": "/pages/onboarding/intro",
    "route": "/pages/me/wallet-withdraw",
    "amountBefore": "",
    "useMax": "clicked",
    "amountAfter": "24856.56",
    "moneyCtas": ["Withdraw","Withdrawal address","Set your withdrawal address","Add withdrawal address"]
  },
  "D_60s_from_login": {
    "landedOn": "/pages/login/login",
    "uniqueSamples": ["/pages/me/wallet-withdraw"],
    "heldSec": 60
  }
}


…(截断)
```

</details>

---

### [P0] src/App.vue:614

**族**:A · 守卫存活性

**缺陷**:从 `pages/entry-surfaces/*` 冷启动的 tab,权限与会话守卫**整个生命周期都不启动**;之后即使用户纯站内点击走到业务页,在**另一个 tab 里正常登出**也踢不掉它 —— 它继续停在业务页。根因:onLaunch 614-617 行对 static-review 路由 `stopBusinessLoops(); return;`(同时 486-491 行 scheduleAccountSessionBootstrap 也早退,本 tab 从未 claim session),onShow 622 行再次早退,startQuestWatch/checkSession 都不再跑。这条路径**不需要任何 URL 构造**,全程只用页面自带链接和 uni 官方导航 API。

**复现**:

```
BASE_URL=http://localhost:5211 node "C:/Users/jason/AppData/Local/Temp/claude/D--WORKS-PLAN-Nexion-uniapp--claude-worktrees-fervent-booth-7829b8/3d189f49-176c-4e0d-8f9c-7bec2f8db466/scratchpad/attack5.mjs"
看输出里 control_A_after_signout(应为 pages/session/kicked)对比 variant_A_after_signout(实测 pages/earn/earn)。
手工版:tab A 开 http://localhost:5211/?nx_device=off#/pages/entry-surfaces/index → 点第一条链接 → console 执行 uni.reLaunch({url:"/pages/earn/earn"});tab B 开 .../?nx_device=off#/pages/me/me 点 Sign out 确认;回 tab A 等 10s,仍在 earn 页。
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
### 环境确认(判红绿的前提)
$ curl -s http://localhost:5211/src/App.vue | grep -n "const r = normalizeRoute\|readCurrentRouteOrHash"
247:      const r = normalizeRoute(route);
251:      const route = readCurrentRouteOrHash();     ← checkAuthGuard,112b9d0 的修复在线上
md5 = c8b737f2  (全程未变;5173 是主 checkout,不是本树)

### 运行 1 —— 纯点击对照实验 xverify2.mjs(全程 reloaded:false,App.vue 指纹恒定)
$ BASE_URL=http://localhost:5211 node .../scratchpad/xverify2.mjs
{
 "startAppVue": "c8b737f2",
 "C1_landing":  { "route": "pages/index/index",           "sessions": ["26b6bd"], "reloaded": false },
 "C3_tabB": "pages/login/login",
 "C4_after_signout": { "route": "pages/session/kicked",   "sessions": ["26b6bd:ENDED"], "reloaded": false },   ← 控制组被踢 ✅

 "V1_landing":   { "route": "pages/entry-surfaces/index",  "sessions": null, "reloaded": false },
 "V2_after_row": { "route": "pages/entry-surfaces/signed", "sessions": null, "reloaded": false },   ← 页面自带链接
 "V3_after_cta": { "route": "pages/index/index",           "sessions": null, "reloaded": false },   ← 页面自带 CTA 进业务页,零 URL 构造
 "V5_tabB": "pages/login/login",
 "V6_after_signout": { "route": "pages/index/index",       "sessions": ["31a1ec:ENDED"], "reloaded": false }, ← 变量组没被踢 ❌
 "endAppVue": "c8b737f2"
}
注:sessions 全程 null = 本 tab 从未 claim session;31a1ec 是 B tab 写的,已 ENDED,A 仍不受影响。

### 运行 2 —— 15s 心跳 + 登出后能力 xverify3.mjs
$ BASE_URL=http://localhost:5211 node .../scratchpad/xverify3.mjs
{
 "servedAppVue": "HEAD (112b9d0 fix present)",
 "control": {
  "t0": { "earnings": "295.51", "route": "pages/index/index", "reloaded": false },
  "t1": { "earnings": "295.52", "route": "pages/index/index", "reloaded": false },
  "afterSignOut":    { "earnings": null,     "route": "pages/session/kicked" },
  "afterProfileTap": { "route": "pages/session/kicked",
                       "text": "登录已结束 你已退出登录,本设备的挖矿已暂停。..." }
 },
 "variant": {
  "t0": { "earnings": "295.51", "route": "pages/index/index", "reloaded": false },
  "t1": { "earnings": "295.52", "route": "pages/index/index", "reloaded": false },
  "afterSignOut":    { "earnings": "295.53", "route": "pages/index/index", "reloaded": false },
  "afterProfileTap": { "route": "pages/index/index",
                       "t
…(截断)
```

</details>

---

### [P0] scripts/chrome-baseline.mjs:144

**族**:C · 探针探不到也报绿

**缺陷**:diff 把「一张图都没有」当成「零像素差异」→ 打印 BASELINE-DIFF: PASS 并 exit 0;上游 capture 在 5 页全部导航失败时也 exit 0,只把 error 写进 report.json。两者串起来:origin 错/dev server 没起时,这道视觉回归门从头到尾报绿。

**复现**:

```
cd <worktree>
BASE_URL=http://localhost:59999 node scripts/chrome-baseline.mjs capture deadtest   # 实测 RC=0,report.json 全是 ERR_CONNECTION_REFUSED
BASE_URL=http://localhost:59999 node scripts/chrome-baseline.mjs capture deadtest2  # RC=0
node scripts/chrome-baseline.mjs diff deadtest deadtest2                            # 输出「BASELINE-DIFF: PASS」,RC=0
ls scripts/.baseline/deadtest/   # 只有 report.json,0 个 png
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
$ cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8

### 前置：确认 5211 活着（对照组用）
$ curl -s -o /dev/null -w "5211 HTTP=%{http_code}\n" "http://localhost:5211/?nx_device=off"
5211 HTTP=200

### 步骤 1 —— 死 origin capture
$ BASE_URL=http://localhost:59999 node scripts/chrome-baseline.mjs capture deadtest; echo "=== RC=$? ==="
captured deadtest → D:\WORKS\PLAN\Nexion-uniapp\.claude\worktrees\fervent-booth-7829b8\scripts\.baseline\deadtest
{
  "home": {
    "error": "Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:59999/?nx_device=off#/pages/index/index\nCall log:\n  - navigating to \"http://localhost:59999/?nx_device=off#/pages/index/index\", waiting until \"networkidle\"\n",
    "consoleErrors": []
  },
  "earn": {
    "error": "Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:59999/?nx_device=off#/pages/earn/earn\n...",
    "consoleErrors": []
  },
  "store": { "error": "Error: page.goto: net::ERR_CONNECTION_REFUSED ...", "consoleErrors": [] },
  "team":  { "error": "Error: page.goto: net::ERR_CONNECTION_REFUSED ...", "consoleErrors": [] },
  "me":    { "error": "Error: page.goto: net::ERR_CONNECTION_REFUSED ...", "consoleErrors": [] }
}
=== RC=0 ===          <-- 5 页全挂，退出码仍是 0

### 步骤 2 —— 第二次死 origin capture
$ BASE_URL=http://localhost:59999 node scripts/chrome-baseline.mjs capture deadtest2 >/dev/null 2>&1; echo "=== capture deadtest2 RC=$? ==="
=== capture deadtest2 RC=0 ===

$ ls -1 scripts/.baseline/deadtest/
report.json           <-- 0 个 png
$ ls -1 scripts/.baseline/deadtest2/
report.json           <-- 0 个 png

### 步骤 3 —— diff 两个空目录
$ node scripts/chrome-baseline.mjs diff deadtest deadtest2; echo "=== diff RC=$? ==="
BASELINE-DIFF: PASS
=== diff RC=0 ===     <-- 零张图被比对，报绿

### 正向对照 —— 活 origin 确实产图
$ BASE_URL=http://localhost:5211 node scripts/chrome-baseline.mjs capture livetest >/dev/null 2>&1; echo "RC=$?"
RC=0
$ ls -1 scripts/.baseline/livetest/
earn.png
earn__nxheader.png
earn__nxtabbarpill.png
home.png
home__nxheader.png
home__nxtabbarpill.png
me.png
me__nxheader.png
me__nxtabbarpill.png
report.json
store.png
store__nxheader.png
store__nxtabbarpill.png
team.png
team__nxheader.png
team__nxtabbarpill.png
…(截断)
```

</details>

---

### [P1] src/App.vue:522

**族**:A · 守卫存活性

**缺陷**:守卫**中途自毁**:checkQuestRoute 在当前路由是 static-review 路由时调用 `stopBusinessLoops()`(522 行),而 stopBusinessLoops 包含 stopQuestWatch() —— 唯一的 1s 周期守卫把自己关掉了,且全代码没有任何重启路径(只有 onShow 会 startQuestWatch,H5 下站内跳转不再触发 onShow)。于是一个**本来守卫正常的已认证用户**,只要中途经过一次 entry-surfaces 再回到业务页,守卫就永久死掉,之后在别的 tab 登出同样踢不掉他。

**复现**:

```
BASE_URL=http://localhost:5211 node "C:/Users/jason/AppData/Local/Temp/claude/D--WORKS-PLAN-Nexion-uniapp--claude-worktrees-fervent-booth-7829b8/3d189f49-176c-4e0d-8f9c-7bec2f8db466/scratchpad/attack3.mjs" → 看 T3_authed_on_earn.quest="written" 对比 T3_after_entrysurface_roundtrip.quest="null"。
跨 tab 后果版:attack4.mjs 的 b1/b4 两项。
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
### 1) 对方给的复现步骤,原样跑(BASE_URL=http://localhost:5211 node .../attack3.mjs)
跑前跑后 md5 src/App.vue = 12d6cacdfb32f0818d648432724b1d41(= 干净 HEAD)

 "T3_authed_on_earn":              { "hash": "#/pages/earn/earn",   "stackRoute": "pages/earn/earn",   "quest": "written" }
 "T3_after_entrysurface_roundtrip":{ "hash": "#/pages/store/store", "stackRoute": "pages/store/store", "quest": "null"    }
→ 与对方描述一致:stackRoute 正确却 quest=null。

### 2) 我自己的机制探针(直接插桩 setInterval/clearInterval,数 App.vue 名下定时器)
node .../xv-timers.mjs  (md5 前后均为 12d6cac)

 A1 落在 earn(已认证冷启动):
   appVueTimerCount: 6
   appVueTimers: ["w/1000ms fired=4","w/5000ms fired=0","w/4000ms fired=1",
                  "w/6000ms fired=0","w/4000ms fired=1","w/1000ms fired=4"]
   quest: "written"
 A2 跳到 #/pages/entry-surfaces/index:
   stackRoute: "pages/entry-surfaces/index"   appVueTimerCount: 0     ← 6 个一次性全清
 A3 再回 #/pages/store/store 等 7s:
   stackRoute: "pages/store/store"            appVueTimerCount: 0     quest: "null"   ← 没有任何重建
 B1 冷启动直接落在 entry-surfaces:
   appVueTimerCount: 0
 B2 用**真实应用内导航** uni.reLaunch("/pages/earn/earn") 进业务页,等 8s:
   hash: "#/pages/earn/earn"  stackRoute: "pages/earn/earn"  appVueTimerCount: 0  quest: "null"
   ← 不用改 hash,走 navTo/tabbar 的同一条调用,一样是死的

### 3) 跨 tab 后果:去掉「页面栈失同步」这个混淆因子后的对照实验
node .../xv-crosstab.mjs  (md5 前后均为 12d6cac;第一次跑撞上他人未提交改动 md5=7fd39ec,已作废重跑)

 CTRL(tabA 全程不碰 entry-surfaces):
   ctrl1_tabA_before:          stackRoute "pages/earn/earn"     appVueTimers 6
   ctrl2_tabB:                 stackRoute "pages/login/login"   ← 另一 tab 真的通过 UI 退出登录了
   ctrl3_tabA_after_signout:   stackRoute "pages/session/kicked"  body "Session ended You've been signed out..."  ✅ 被踢
 CASE(tabA 经 entry-surfaces,用真实应用内导航回 earn):
   case1_tabA_before:          stackRoute "pages/earn/earn"     appVueTimers 0   ← 栈是**对的**,不是失同步
   case2_tabB:                 stackRoute "pages/login/login"   ← 同样真的退出登录
   case3_tabA_after_signout:   stackRoute "pages/earn/earn"     appVueTimers 0   storageEvents 32   ❌ 没被踢
                               body "3 FREE TRIAL NexGridBox S1 Try free for 3 days, cancel anyti"

### 4) 恢复路径测试
node .../xv-recover.mjs  (md5 前后均为 12d6cac)
 r1 earn 上:            appVueTimers
…(截断)
```

</details>

---

### [P1] src/App.vue:335

**族**:A · 守卫存活性

**缺陷**:isAuthWhitelisted() 新加的 normalizeRoute 让 canRunBusinessLoops()(App.vue:576-577,它喂进去的是 hash 形态 `#/pages/x`)在白名单页冷启动时首次判成 false —— 已登录用户从邀请链接 / 交易深链 / 登录页 / kicked 页冷启动后进 App,整套业务轮询(挖矿 tick、到账推进、试用状态机、订单推进、里程碑弹层、任务奖励)一次都不会启动,并且整个前台会话内不再自愈。改动前这条路径是活的。

**复现**:

```
前提:本 worktree 的 dev server 跑在 http://localhost:5211。

A. 手工复现(约 1 分钟)
1) 用全新浏览器 profile(localStorage 为空 = demo 默认「已登录 + 已 onboard」)打开:
   http://localhost:5211/?nx_device=off#/pages/ref/code?c=NX1
2) 点页面底部主按钮「Enter NexGrid」(ref/code.vue:75 → enterApp,reLaunch 到首页)。
3) 在首页 devtools console 里反复执行:
   document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.app.global.activeJobs
   → 数字一直不变(挖矿 tick 死)。切到「赚取」页停 5 秒,再看 localStorage['nexgrid-quest-accounts-v1'] → 仍是 null。
4) 对照:新 profile 直接打开 http://localhost:5211/?nx_device=off#/pages/index/index,同一条表达式每秒都在变。
5) 证明是回归:
   cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8
   git show 9441d68:src/App.vue > src/App.vue   # 换回改动前
   重跑 1)-3) → 数字每秒在变。
   git checkout -- src/App.vue                   # 还原

B. 脚本复现(与我跑的同一份)
   探针在 C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN-Nexion-uniapp--claude-worktrees-fervent-booth-7829b8\3d189f49-176c-4e0d-8f9c-7bec2f8db466\scratchpad\ 下:
   BASE_URL=http://localhost:5211 node <scratchpad>/reg6.mjs   # 5 个冷启动入口 × activeJobs 序列,输出 tickAlive
   BASE_URL=http://localhost:5211 node <scratchpad>/reg9.mjs   # 真点击「Enter NexGrid」的版本
   BASE_URL=http://localhost:5211 node <scratchpad>/reg2.mjs   # quest 键侧证据
   期望(HEAD):control 直接进首页 tickAlive=true,其余 4 条 tickAlive=false。
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
环境:worktree D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8,dev server http://localhost:5211(已确认 5211 服务的就是本 worktree:临时建 src/ab-marker-probe.ts 后 curl 到 200,sourcemap 里 sources = "D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8/src/ab-marker-probe.ts")。

=== 1. HEAD 上 5 条冷启动入口 → reLaunch 首页,采样 app.global.activeJobs 6 次(每次带回浏览器内 __APP_VARIANT 标记,证明跑的确实是当前源码)===
    "name": "control-direct-home",  "variantInBrowser": "HEAD_MARK", "landedRoute": "pages/index/index",   "finalRoute": "pages/index/index", "tickAlive": true
    "name": "ref-code-then-home",   "variantInBrowser": "HEAD_MARK", "landedRoute": "pages/ref/code",      "finalRoute": "pages/index/index", "tickAlive": false
    "name": "login-then-home",      "variantInBrowser": "HEAD_MARK", "landedRoute": "pages/login/login",   "finalRoute": "pages/index/index", "tickAlive": false
    "name": "kicked-then-home",     "variantInBrowser": "HEAD_MARK", "landedRoute": "pages/session/kicked","finalRoute": "pages/index/index", "tickAlive": false
    "name": "tx-hash-then-home",    "variantInBrowser": "HEAD_MARK", "landedRoute": "pages/tx/hash",       "finalRoute": "pages/index/index", "tickAlive": false

=== 2. 机制实证:在 App.vue 的 onShow 首行插 console.log,打印页面栈/hash/白名单判定/canRunBusinessLoops ===
HEAD:
  /pages/index/index    => [ONSHOW] {"stack":"","orHash":"#/pages/index/index","wl":false,"can":true}
  /pages/ref/code?c=NX1 => [ONSHOW] {"stack":"","orHash":"#/pages/ref/code?c=NX1","wl":true,"can":false}
  /pages/login/login    => [ONSHOW] {"stack":"","orHash":"#/pages/login/login","wl":true,"can":false}
PRE(git show 9441d68:src/App.vue):
  /pages/index/index    => [ONSHOW-PRE] {"stack":"","orHash":"#/pages/index/index","wl":false,"auth":true,"onb":true,"sess":"active","can":true}
  /pages/ref/code?c=NX1 => [ONSHOW-PRE] {"stack":"","orHash":"#/pages/ref/code?c=NX1","wl":false,"auth":true,"onb":true,"sess":"active","can":true}
  /pages/login/login    => [ONSHOW-PRE] {"stack":"","orHash":"#/pages/login/login","wl":false,"auth":true,"onb":true,"sess":"active","can":true}
→ 冷启动 onShow 时页面栈确实为空、确实吃 hash 形态;HEAD 判中白名单 can=false,PRE can=true。claim 描述的机制成立。

=== 3. 证伪 claim 的 A/B:完整换回 9441d6
…(截断)
```

</details>

---

### [P1] src/App.vue:622

**族**:A · 守卫存活性

**缺陷**:onShow 的提前 return 是六个业务轮询的唯一启动点,而 H5 的 App 级 onShow 只在「整页加载」和「标签页重新可见」时触发,不随应用内路由跳转触发。于是任何「冷启动落在白名单/静态评审页 → 应用内导航进业务页」的路径,tick(1s)/ arrival(5s)/ trial(4s)/ order(6s)/ milestone(4s)/ quest(1s) 六个 start* 整局都不启动,useApp().settle() 与 advanceArrivalAndSettleBill() 也各少跑一次。这和 112b9d0 修的是同一条因果链(注释里写的「startQuestWatch() 永不执行 → 1s 轮询守卫不启动 → 之后再没有第二次检查」),只是触发条件从「登出态冷启动深链」换成了「从白名单页进来」;守卫的一次性检查修好了,守卫赖以持续生效的那条轮询仍然可以整局不启动。

**复现**:

```
# dev server 已在 5211。最短手动复现(免登录):
# 1) 浏览器打开 http://localhost:5211/?nx_device=off#/pages/entry-surfaces/h5
# 2) 不刷新,直接把地址栏 hash 改成 #/pages/index/index,再改成 #/pages/earn/earn,等 5 秒
# 3) DevTools 控制台:localStorage.getItem("nexgrid-quest-accounts-v1")  → null(day-one 任务「逛 Earn」的 30 NEX 没发)
# 4) F5 整页刷新后重复 2)~3) → 立刻变成 {"type":"object","data":{"default":{"completed":["visit_earn"]}}}

# 脚本化证明(在仓库根目录跑,node_modules 里已有 playwright):
cat > /tmp/p9.mjs <<'EOF'
import { chromium } from "playwright";
const BASE = process.env.UNI_BASE_URL || "http://localhost:5211";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const INIT = `window.__ivs=[];const _si=window.setInterval;window.setInterval=function(f,d){window.__ivs.push(d);return _si.apply(window,arguments);};`;
const ivs = (p) => p.evaluate(() => ({ hash: location.hash, orderPoll6000: window.__ivs.filter(d=>d===6000).length, arrivalPoll5000: window.__ivs.filter(d=>d===5000).length }));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const p = await ctx.newPage();
await p.goto(`${BASE}/?nx_device=off#/x`, { waitUntil: "domcontentloaded" });
await p.evaluate(() => localStorage.clear());
await p.addInitScript(INIT);
await p.goto(`${BASE}/?nx_device=off&cb=${Date.now()}#/pages/entry-surfaces/h5`, { waitUntil: "load" });
await wait(2500); console.log("cold on entry-surface:", JSON.stringify(await ivs(p)));
await p.evaluate(() => { location.hash = "#/pages/index/index"; }); await wait(4000);
console.log("after in-app nav to home:", JSON.stringify(await ivs(p)));
await p.evaluate(() => { location.hash = "#/pages/earn/earn"; }); await wait(5000);
console.log("after nav to earn:", JSON.stringify(await ivs(p)));
console.log("quest storage:", await p.evaluate(() => localStorage.getItem("nexgrid-quest-accounts-v1")));
await p.goto(`${BASE}/?nx_device=off&cb=${Date.now()}#/pages/index/index`, { waitUntil: "load" }); await wait(3000);
console.log("CONTROL full reload on home:", JSON.stringify(await ivs(p)));
await b.close();
EOF
cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8 && UNI_BASE_URL=http://localhost:5211 node /tmp/p9.mjs

# 我实测的输出:
# cold on entry-surface:   {"hash":"#/pages/entry-surfaces/h5","orderPoll6000":0,"arrivalPoll5000":0}
# after in-app nav to home:{"hash":"#/pages/index/index","orderPoll6000":0,"arrivalPoll5000":0}
# after nav to earn:       {"hash":"#/pages/earn/earn","orderPoll6000":0,"arrivalPoll5000":0}
# quest storage: null
# CONTROL full reload on home: {"hash":"#/pages/index/index","orderPoll6000":1,"arrivalPoll5000":1}
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
## 探针 1 —— 逐字照跑 claim 给的脚本(唯一改动:加打印完整 __ivs)
命令:cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8 && UNI_BASE_URL=http://localhost:5211 node tmp-adv-p9.mjs

cold on entry-surface: {"hash":"#/pages/entry-surfaces/h5","orderPoll6000":0,"arrivalPoll5000":0,"all":[30000,30000,250]}
after in-app nav to home: {"hash":"#/pages/index/index","orderPoll6000":0,"arrivalPoll5000":0,"all":[30000,30000,250,30000,1100,1000,1000,1000,3200,6500,1000,1600,90000,240000,360000,300,250,300]}
after nav to earn: {"hash":"#/pages/earn/earn","orderPoll6000":0,"arrivalPoll5000":0,"all":[...,30000,1000,1000,1000,1000,1000,1000,60000,90000,240000,360000,300,250]}
quest storage: null
CONTROL full reload on home: {"hash":"#/pages/index/index","orderPoll6000":1,"arrivalPoll5000":1,"all":[30000,1000,5000,4000,6000,4000,1000,30000,1100,...]}
CONTROL quest storage: null

→ 与 claim 贴的输出逐条一致(o6/a5:0/0 vs 1/1)。CONTROL 的 all 里 `1000,5000,4000,6000,4000,1000` 连成一串 = 六个业务轮询的完整指纹,缺陷组整段缺失。
→ 注:最后一行 CONTROL quest 是 null,claim 说对照组会写 visit_earn —— 他这句口径错了(落首页不等于逛 Earn),下面探针 2 给出正确对照。

## 探针 2 —— 隔离对照(证明变量是「冷启动落地页」,不是「导航方式」)
命令:UNI_BASE_URL=http://localhost:5211 node tmp-adv-p10.mjs

CASE1 cold-start ON earn        : {"hash":"#/pages/earn/earn","o6":1,"a5":1,"quest":"{\"type\":\"object\",\"data\":{\"default\":{\"completed\":[\"visit_earn\"]}}}"}
CASE2 cold on home (before nav) : {"hash":"#/pages/index/index","o6":1,"a5":1,"quest":null}
CASE2 after hash-nav to earn    : {"hash":"#/pages/earn/earn","o6":1,"a5":1,"quest":"{\"type\":\"object\",\"data\":{\"default\":{\"completed\":[\"visit_earn\"]}}}"}
CASE3 cold on entry-surface     : {"hash":"#/pages/entry-surfaces/h5","o6":0,"a5":0,"quest":null}
CASE3 after nav to home         : {"hash":"#/pages/index/index","o6":0,"a5":0,"quest":null}
CASE3 after nav to earn         : {"hash":"#/pages/earn/earn","o6":0,"a5":0,"quest":null}
CASE4 uni.switchTab home  -> fail:{"errMsg":"switchTab:fail can not switch to no-tabBar page"} {...o6:0,a5:0}

→ CASE2 vs CASE3:同样是裸改 hash 跳 earn,冷启动落首页给奖励、落评审页整局不给。变量隔离成功。
→ CASE4 说明 switchTab 不适用(本项目 tab 是自绘 pill),所以探针 3 换成项目真正在用的 uni.reLaunch。

## 探针 3 —— 用项目自己的导航原语 + 现实入口
命令:UNI_BASE_URL=http://localhost:5211 node 
…(截断)
```

</details>

---

### [P1] scripts/spec6-entry-surface-runtime.mjs:58

**族**:B · 探针读的是空外壳

**缺陷**:这道 verify.sh 门(verify.sh:948)的「文案泄漏」半边是死的:55 行 goto 没带 ?nx_device=off,localhost 下 app 跑在设备外壳 iframe 里,58 行 page.locator('body').innerText() 读的是主文档 = 空串,于是 59 行 forbiddenText.filter 恒返回空数组,永远抓不到 Milestone / Lifetime earnings 之类的浮层泄漏。(localStorage 那半边同源,仍有效,所以门是半盲不是全盲。)

**复现**:

```
cd <worktree>
BASE_URL=http://localhost:5211 node scripts/spec6-entry-surface-runtime.mjs   # 打印 SPEC-6 ... PASS,RC=0
# 正控(证明 58 行读到的是空串):把同一段取法跑两遍对比
node -e 'import("playwright").then(async({chromium})=>{const b=await chromium.launch();for(const off of[false,true]){const p=await b.newPage({viewport:{width:390,height:844},isMobile:true});await p.goto(off?"http://localhost:5211/?nx_device=off#/pages/entry-surfaces/index":"http://localhost:5211/#/pages/entry-surfaces/index",{waitUntil:"domcontentloaded"});await p.waitForTimeout(4700);console.log(off?"WITH ":"WITHOUT",(await p.locator("body").innerText()).trim().length)}await b.close()})'
# 实测输出:WITHOUT 0 / WITH 392
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
### 1) 门原样跑,恒 PASS
$ cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8
$ BASE_URL=http://localhost:5211 node scripts/spec6-entry-surface-runtime.mjs; echo "RC=$?"
SPEC-6 entry surfaces runtime PASS
RC=0

### 2) 正控:同 4 条路由,两种取法对比 body 文本长度
(脚本 scratchpad/poscontrol.mjs,用 spec6 原样的 viewport 390x844 isMobile + 同样的 waitFor + 4700ms)
WITHOUT len=0      /#/pages/entry-surfaces/index
WITH    len=392    /#/pages/entry-surfaces/index
        text="Entry surfaces Full links Three entry surfaces Full clickable links Signed app, H5 web and white-app takeover homes each open separately; the default home stays"
WITHOUT len=0      /#/pages/entry-surfaces/signed
WITH    len=492    /#/pages/entry-surfaces/signed
        text="Signed app home Online boost Signed app Always-on earning cockpit Full device network, wallet, store, team and live boost stay available from the installed app."
WITHOUT len=0      /#/pages/entry-surfaces/h5
WITH    len=532    /#/pages/entry-surfaces/h5
        text="H5 web home Base hosted H5 web Base-hosted mobile earning Mobile browser keeps account devices and wallet available without background lock-in. PC sharing appea"
WITHOUT len=0      /#/pages/entry-surfaces/white?entry=white-app
WITH    len=571    /#/pages/entry-surfaces/white?entry=white-app
        text="White-app takeover home Scan merged White-app takeover Health scan into NexGrid home Hardware score, account balance and fleet status stay on one takeover scree"
(4/4 路由 WITHOUT 全为 0,与对方报的 index 0/392、h5 0/532 完全一致)

### 3) 机制核实:frame 树 + 主文档实际内容
frame count = 2
  frame url: http://localhost:5211/#/pages/entry-surfaces/index
  frame url: http://localhost:5211/?nx_device_inner=1#/pages/entry-surfaces/index
main doc body.innerHTML len = 4654
main doc body.innerHTML head: "\n    <script>\n      ;(function () {\n        var params = new URLSearchParams(window.location.search)\n        var host = window.location.hostname\n        var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'\n        var shellOff = params.get('nx_device') ==="
main doc innerText JSON: ""

### 4) 决定性变异测试:塞一条真泄漏进去,看门报不报红
(往真正渲染 app 的那个 frame 里 append 一个 fixed 满屏浮层,
…(截断)
```

</details>

---

### [P1] scripts/dom-qa.mjs:211

**族**:C · 探针探不到也报绿

**缺陷**:--update-ledger 路径没有覆盖面 witness:对着坏 origin 跑一次收编,会把 5 条 probe-crash 指纹永久写进 docs/DOM-QA-LEDGER.json;之后每次连不上 dev server,崩溃指纹都算「存量已知」→ 打印 DOM-QA PASS、exit 0,这道 verify.sh 门从此对「探不到」全盲。同轮兄弟探针 tap-feedback-probe.mjs:345 恰好补了这个 witness(failedRoutes.length || total===0 → exit 1),dom-qa 没有。

**复现**:

```
cd <worktree>
cp docs/DOM-QA-LEDGER.json /tmp/bak                                                   # 现况 entries=0
BASE_URL=http://localhost:59999 node scripts/dom-qa.mjs --sweep core --update-ledger  # 实测「LEDGER UPDATED:5 条存量」RC=0
BASE_URL=http://localhost:59999 node scripts/dom-qa.mjs --sweep core                  # 实测「DOM-QA PASS:5 路由,新违例 0」RC=0 ← 假绿
cp /tmp/bak docs/DOM-QA-LEDGER.json                                                   # 我已还原,git status 干净
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
$ cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8
$ cp docs/DOM-QA-LEDGER.json <scratchpad>/DOM-QA-LEDGER.json.bak   # 现况 entries=0
$ echo "UNI_BASE_URL=[$UNI_BASE_URL] BASE_URL=[$BASE_URL]"
UNI_BASE_URL=[] BASE_URL=[]                                        # 确认无环境残留干扰

=== STEP1: 死端口 + --update-ledger ===
$ BASE_URL=http://localhost:59999 node scripts/dom-qa.mjs --sweep core --update-ledger
LEDGER UPDATED:5 条存量(其中本轮新收 5);small-text 普查 0 条
RC=0

=== 污染后的 ledger(节选)===
$ cat docs/DOM-QA-LEDGER.json
{
  "generatedAt": "2026-08-07T06:22:10.677Z",
  "smallTextCensus": 0,
  "entries": [
    { "fp": "pages/index/index|probe-crash|page", "route": "pages/index/index",
      "check": "probe-crash", "sig": "page",
      "detail": "Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:59999/?nx_device=off#/pages/index/index\nCall log:\n...",
      "since": "2026-08-07" },
    ... 同形 4 条:pages/earn/earn / pages/store/store / pages/team/team / pages/me/me
  ]
}

=== STEP2: 死端口,不带 --update-ledger(= verify.sh 真正调用的那条)===
$ BASE_URL=http://localhost:59999 node scripts/dom-qa.mjs --sweep core
DOM-QA PASS:5 路由,gate 5 条全在 ledger(存量),新违例 0;small-text 普查 0 条
RC=0                                                               <-- 假绿,claim 成立

──────────── 以下是我自己加的 4 组对照实验 ────────────

=== 对照 A:清白 ledger + 死端口,不带 update(门本身有效吗?)===
$ git checkout -- docs/DOM-QA-LEDGER.json
$ BASE_URL=http://localhost:59999 node scripts/dom-qa.mjs --sweep core
DOM-QA FAIL:5 条新违例(不在 ledger):
  [probe-crash] pages/index/index :: page — Error: page.goto: net::ERR_CONNECTION_REFUSED ...
  [probe-crash] pages/earn/earn :: page — ...
  [probe-crash] pages/store/store :: page — ...
  [probe-crash] pages/team/team :: page — ...
  [probe-crash] pages/me/me :: page — ...
(确认为合法例外 → --update-ledger 收编并在 entry 写 qaOk 理由;否则修复)
RC=1                                                               <-- 门本身没坏,洞专属 update 路径

=== 对照 B:活端口 5211 + 清白 ledger(证明正常时有真覆盖面)===
$ DOM_QA_DEBUG=1 BASE_URL=http://localhost:5211 node scripts/dom-qa.mjs --sweep core
  pages/index/index → landed=pages/index/index nodes=814 gate=0 info=0
  pages/earn/earn   → landed=pages/earn/earn   nodes=603 gate=0 info
…(截断)
```

</details>

---

### [P1] scripts/auth-guard-verify.mjs:28

**族**:C · 探针探不到也报绿

**缺陷**:本轮权限守卫改动(112b9d0)的唯一运行时探针零断言、恒 exit 0:只把三个 route 拼成 JSON 打印,没有任何比较,也没接进 verify.sh。把守卫改回缺陷版本、越权重现,它照样 RC=0 —— 任何 `if node scripts/auth-guard-verify.mjs; then ok`(verify.sh 里所有其它探针的统一写法)都会报绿。

**复现**:

```
cd <worktree>
# 1) 注入本轮修掉的那个缺陷(只改 App.vue:347 一行,注意 CRLF)
node -e 'const fs=require("fs");const L=fs.readFileSync("src/App.vue","utf8").split(/(?<=\n)/);L[346]=L[346].replace("readCurrentRouteOrHash()","readCurrentRoute()");fs.writeFileSync("src/App.vue",L.join(""))'
# 2) 跑探针
BASE_URL=http://localhost:5211 node scripts/auth-guard-verify.mjs; echo RC=$?
# 实测输出 signedOut_redirectedFromEarn: "/pages/earn/earn"(= 登出态没被踢走,正是本轮修的越权),RC=0
# 3) 还原:git checkout -- src/App.vue(注意本树有并发 agent 在改这个文件,先看 git status)
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
$ cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8

# ---------- 步骤 0:基线(守卫是修好的状态) ----------
$ BASE_URL=http://localhost:5211 node scripts/auth-guard-verify.mjs; echo "RC=$?"
{
  "defaultAuthed_staysOnEarn": "/pages/earn/earn",
  "signedOut_redirectedFromEarn": "/pages/onboarding/intro",
  "unauthOnOnboarding_noLoop": "/pages/onboarding/intro"
}
RC=0

# ---------- 步骤 1:注入本轮修掉的缺陷(App.vue:347) ----------
$ node -e 'const fs=require("fs");const L=fs.readFileSync("src/App.vue","utf8").split(/(?<=\n)/);console.log("BEFORE L347:",JSON.stringify(L[346]));L[346]=L[346].replace("readCurrentRouteOrHash()","readCurrentRoute()");console.log("AFTER  L347:",JSON.stringify(L[346]));fs.writeFileSync("src/App.vue",L.join(""))'
BEFORE L347: "  const route = readCurrentRouteOrHash();\r\n"
AFTER  L347: "  const route = readCurrentRoute();\r\n"

$ git diff --stat src/App.vue
 src/App.vue | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

# ---------- 步骤 2:跑探针 —— 越权重现,RC 仍然 0 ----------
$ BASE_URL=http://localhost:5211 node scripts/auth-guard-verify.mjs; echo "RC=$?"
{
  "defaultAuthed_staysOnEarn": "/pages/earn/earn",
  "signedOut_redirectedFromEarn": "/pages/earn/earn",     <-- 登出态没被踢走 = 本轮修的越权
  "unauthOnOnboarding_noLoop": "/pages/onboarding/intro"
}
RC=0                                                       <-- 照样绿

# ---------- 步骤 3:verify.sh 的统一写法实测报绿 ----------
$ if BASE_URL=http://localhost:5211 node scripts/auth-guard-verify.mjs >/tmp/agv.log 2>&1; then echo "  ok  权限守卫运行时门"; else echo "  bad 权限守卫运行时门"; fi
  ok  权限守卫运行时门

$ grep -nE "process\.exit|assert|expect|fail|throw" scripts/auth-guard-verify.mjs || echo "  (no matches)"
  (no matches — zero assertions confirmed)

# ---------- 步骤 4:证伪尝试 A —— 别的 gated 探针能抓到吗?抓不到 ----------
$ BASE_URL=http://localhost:5211 node scripts/spec4-runtime-session-guard.mjs >/tmp/s4.log 2>&1; echo "RC=$?"; tail -1 /tmp/s4.log
RC=0
SPEC-4 runtime session guard PASS

# ---------- 步骤 5:证伪尝试 B —— 全仓还有别的登出态探针吗?没有 ----------
$ grep -rln "isAuthenticated: *false" scripts/
scripts/auth-guard-verify.mjs

$ for f in $(grep -rln "isAuthenticated" scripts/ | xargs -n1 basename); do printf "%-40s " "$f"; if grep -q "$f" scripts/ve
…(截断)
```

</details>

---

### [P2] scripts/trial-check.mjs:19

**族**:B · 探针读的是空外壳

**缺陷**:goto 没带 ?nx_device=off,所有量测走主文档 page.evaluate → 恒读空 DOM,sheetOpen / autoPushOK 恒 false、errors 恒 []。chrome-baseline.mjs:68-72 的注释白纸黑字写着「试用弹层自动推送由 trial-check 验证」,而这个指定验证者当前什么都测不到。

**复现**:

```
cd <worktree>
BASE_URL=http://localhost:5211 node scripts/trial-check.mjs; echo RC=$?
# 实测 autoPushOK:false、errors:[] 且 RC=0(dev server 是好的,页面也真渲染着)
# 对照:同 origin 加 ?nx_device=off 后主文档才有内容
node -e 'import("playwright").then(async({chromium})=>{const b=await chromium.launch();const p=await b.newPage();for(const u of["http://localhost:5211/#/pages/index/index","http://localhost:5211/?nx_device=off#/pages/index/index"]){await p.goto(u,{waitUntil:"networkidle"});await p.waitForTimeout(3000);console.log(u,await p.evaluate(()=>document.body.innerText.trim().length))}await b.close()})'
# 实测:0 / 1792
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
### 1) 照对方步骤原样跑(worktree 根目录)
$ BASE_URL=http://localhost:5211 node scripts/trial-check.mjs; echo RC=$?
{
  "home": { "route": "/#/pages/index/index", "sheetOpen": false, "errors": [] },
  "me":   { "route": "/#/pages/me/me",       "sheetOpen": false, "errors": [] },
  "autoPushOK": false
}
RC=0

### 2) 主文档空 DOM 对照(对方给的一行命令,我加了 #app 子节点/iframe/选择器计数)
http://localhost:5211/#/pages/index/index               {"len":0,   "appKids":0,"iframes":1,"tcs":0}
http://localhost:5211/?nx_device=off#/pages/index/index {"len":1741,"appKids":1,"iframes":0,"tcs":0}

### 3) 帧级证据:内容全在内层 iframe 里(探针自己的 414x896 视口)
homeRaw(不带参数)frames:
  http://localhost:5211/#/pages/index/index                 hit=false len=0
  http://localhost:5211/?nx_device_inner=1#/pages/index/index hit=false len=1805
homeOff(带 ?nx_device=off)frames:
  http://localhost:5211/?nx_device=off#/pages/index/index    hit=false len=1794
→ 主文档 len=0 / appKids=0,trial-check 的 page.evaluate 打的就是这个空壳。

### 4) 证伪「errors 恒 []」:内层 iframe 的报错会冒泡到页面级收集器
{
  "innerFrameFound": true,
  "errorsAfterInjection": [
    "console:IFRAME_CONSOLE_ERR_TEST",
    "pageerror:Error: IFRAME_PAGEERROR_TEST"
  ]
}
→ console/pageerror 采集是好的,不瞎。

### 5) 正确写法下 sheetOpen 能测出 true(证明是假阴性,不是行为坏了)
带 ?nx_device=off,按 0.5s 采样 4s:
  plain(不动 voucher):            0.5s tcs=0 vcs=1 … 4s tcs=0 vcs=1   ← voucher 弹层按 app-chassis.vue:363 优先,trial 主动让位
  预置 voucher 冷却(9999999999999):0.5s tcs=1 vcs=0 … 4s tcs=1 vcs=0   ← .tcs-root 真开了

### 6) 影响面
$ grep -c trial-check scripts/verify.sh   → 0        (不是机器门,不会造成 verify 假绿)
$ grep -rn trial-check scripts/ docs/     → chrome-baseline.mjs:70(「auto-push 由 trial-check 验证」)
                                            ALIGNMENT-LEDGER.md:181,239 / pkg-f.plan.md:88,197(回归清单指名「仍绿」)
$ git log --date=short -- scripts/trial-check.mjs → 最后一次 2026-08-02(9eb0483)
$ git log -S nx_device --date=short -- index.html → 外壳 2026-07-06(9d579af)引入

### 7) 环境自证(排除「服务器坏了」这种平凡解释)
同一台 5211 上,带 ?nx_device=off 时首页正文 1794 字符、me 页 1026 字符、console error 0,页面渲染完全正常。
```

</details>

---

### [P2] scripts/sticky-check.mjs:26

**族**:B · 探针读的是空外壳

**缺陷**:同一形态:goto 缺 ?nx_device=off,28-41 行的 .spv / .nx-content / .spv-title 全在主文档查 → 恒 null,pinnedOK 恒 false、consoleErrors 恒 [];截图拍的是设备外壳而不是被测页面。

**复现**:

```
cd <worktree>
BASE_URL=http://localhost:5211 node scripts/sticky-check.mjs; echo RC=$?
# 实测 spvExists:false / pinnedOK:false / consoleErrors:[],RC=0
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
$ cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8
$ BASE_URL=http://localhost:5211 node scripts/sticky-check.mjs; echo "RC=$?"
{
  "route": "/#/pages/team/rank",
  "title": null,
  "spvExists": false,
  "topBeforeScroll": null,
  "topAfterScroll": null,
  "pinnedOK": false,
  "consoleErrors": [],
  "frostShot": "scripts/.baseline/_check/sticky-frost.png"
}
RC=0
  → 与对方报告逐字一致,复现成功。

--- 对照组:唯一变量 = route 前加 ?nx_device=off ---
$ BASE_URL=http://localhost:5211 node scripts/sticky-check.mjs '/?nx_device=off#/pages/team/rank' sticky-ctrl; echo "RC=$?"
{
  "route": "/?nx_device=off#/pages/team/rank",
  "title": "V Rank",
  "spvExists": true,
  "topBeforeScroll": 0,
  "topAfterScroll": 0,
  "pinnedOK": true,
  "consoleErrors": [],
  "frostShot": "scripts/.baseline/_check/sticky-ctrl-frost.png"
}
RC=0
  → 同一路由、同一脚本,补上 nx_device=off 后 spvExists/title/pinnedOK 全部翻转。
    证明 null 与 pinnedOK:false 的成因就是设备外壳 iframe,不是页面缺 .spv。
    也证明 sticky 行为本身是好的 —— 脚本原样跑出的是「假红」。

--- frame 结构实证(自写探针,证明真页面在子 frame) ---
$ BASE_URL=http://localhost:5211 node <scratchpad>/iframe-console-probe.mjs
{
  "frameCount": 2,
  "frames": [
    "http://localhost:5211/#/pages/team/rank",
    "http://localhost:5211/?nx_device_inner=1#/pages/team/rank"
  ],
  "injected": "ok",
  "captured": [
    "console:PROBE_IFRAME_CONSOLE_ERROR",
    "pageerror:Error: PROBE_IFRAME_THROW"
  ],
  "sawIframeConsole": true,
  "sawIframeThrow": true
}
  → 主文档只是外壳;sticky-check.mjs 28/33/37/41 行的 document.querySelector 打在主文档 → 恒 null。
  → 同时这里证伪了对方「consoleErrors 恒 []」的说法:往子 frame 注入的 console.error 与
    throw 都被主 page 监听器抓到了,控制台通道并没坏,[] 只是该页真的没报错。

--- 截图肉眼比对 ---
sticky-frost.png(默认跑):手机边框 + 刘海 + 状态栏可见,页面停在顶部未滚动,
  sticky 头未被 invert → 44 行的 backdrop-filter:invert(1) 注进了没有 .spv 的主文档,
  frosting proof 完全没生效。确认「截图拍的是设备外壳而不是被测页面」。
sticky-ctrl-frost.png(对照):满幅页面、已滚 400px、顶部 sticky 头色带明显反色,
  才是该脚本设计要产出的 frosting 证据。

--- 影响面 / 是否卡门 ---
$ grep -rn "sticky-check" --include=*.sh --include=*.mjs --include=*.json --include=*.js --include=*.md . --exclude-dir=node_modules --exclude-dir=.git
./scripts/sticky-check.mjs:3: * sticky-check.mjs — verify the sticky SubPageHeader pins on scroll + frosts.
./scripts/sticky-c
…(截断)
```

</details>

---

### [P2] scripts/backnav-check.mjs:21

**族**:B · 探针读的是空外壳

**缺陷**:同缺 ?nx_device=off,且症状更差:对着好好的 dev server 直接卡死不返回(120s / 75s 两次都被 timeout 杀掉,stdout+stderr 全空)。手工把 nx_device=off 塞进 routeA 参数后才走到第 24 行,再在那里因主文档没有 uni 而崩 —— 无论哪条路,这个探针都产出不了可用结论。

**复现**:

```
cd <worktree>
BASE_URL=http://localhost:5211 timeout 75 node scripts/backnav-check.mjs > /tmp/bn.out 2>/tmp/bn.err; echo RC=$?   # 实测 124,两个文件都空
BASE_URL=http://localhost:5211 timeout 90 node scripts/backnav-check.mjs "/?nx_device=off#/pages/team/rank" "/pages/team/rank-how"; echo RC=$?   # 实测 1,栈指向 :24
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
========== 步骤 1:默认调用(对方的第一条复现命令),Git Bash ==========
$ cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8
$ BASE_URL=http://localhost:5211 timeout 75 node scripts/backnav-check.mjs > $SCR/bn.out 2> $SCR/bn.err; echo "RC=$?"
RC=124
--- out bytes:
0
--- err bytes:
0
--- out ---
--- err ---
（复现成功:RC=124,stdout/stderr 均 0 字节,与对方描述一致）

========== 步骤 1 复核:换 PowerShell 跑,排除 shell 因素 ==========
PS> $env:BASE_URL='http://localhost:5211'
PS> $p = Start-Process node -ArgumentList 'scripts/backnav-check.mjs' -NoNewWindow -PassThru -RedirectStandardOutput bn_ps.out -RedirectStandardError bn_ps.err
PS> $p.WaitForExit(75000)
KILLED after 75s (still running)
stdout bytes = 0   stderr bytes = 0
--- stdout ---
--- stderr ---
（PowerShell 下同样永久挂起、零输出 → 卡死是脚本自身缺陷,不是 shell 环境）

========== 卡死点定位:插桩克隆(逐步打点)==========
$ BASE_URL=http://localhost:5211 timeout 120 node scripts/_tmp-bn-instr.mjs
[+0.1s] goto http://localhost:5211/#/pages/team/rank
[+3.0s] goto ok, url=http://localhost:5211/#/pages/team/rank  frames=2
[+4.2s] titleA="ERR:Error: page.$eval: Failed to find element matching selector \".nx-nav-title\""
[+4.2s] main-doc probe: {"hasUni":"object","navigateToType":"function","bodyLen":4643,
                         "iframes":["http://localhost:5211/?nx_device_inner=1#/pages/team/rank"],"navTitles":0}
[+4.2s] about to page.evaluate(uni.navigateTo) — line 24 equivalent
[+44.2s] evaluate -> STILL-PENDING-AFTER-40s      <<<< 卡在这里
（结论:goto 3s 就 resolve,line 21 的 timeout:30000 没用;主文档 uni 存在;
  卡的是 line 24 的 page.evaluate 在 await 一个永不 settle 的 promise,而 evaluate 无超时）

========== 外壳内 / 外 uni.navigateTo 返回值对照 ==========
[+4.4s] --- routeA=/?nx_device=off#/pages/team/rank  (shell=false)
[+4.4s]    uni.navigateTo({url}) returns -> {"kind":"thenable","outcome":"FULFILLED",
             "value":"{\"eventChannel\":{\"id\":2,\"listener\":{},\"emitCache\":[]},\"errMsg\":\"navigateTo:ok\"}"}
[+8.8s] --- routeA=/#/pages/team/rank  (shell=true)
[+16.8s]   uni.navigateTo({url}) returns -> {"kind":"thenable","outcome":"NEVER_SETTLED_8s"}
（不带 nx_device=off → 永不 settle;带了 → 正常 fulfilled,navigateTo:ok）

========== 步骤 2:对方的第二条复现命令,Git Bash ==========
$ BASE_URL=http://localhost:5211 tim
…(截断)
```

</details>

---

### [P2] scripts/page-check.mjs:52

**族**:B · 探针读的是空外壳

**缺陷**:通用单路由检查器同样缺 ?nx_device=off:57-63 行的选择器存在性判定跑在空的主文档上 → 传什么选择器都返回 {exists:false},截图也只拍到设备外壳。它是「快速看一眼某页渲染对不对」的常用手工工具,给出的每个 exists:false 都不可信。

**复现**:

```
cd <worktree>
BASE_URL=http://localhost:5211 node scripts/page-check.mjs "/#/pages/index/index" chk ".nx-header,.nx-tabbar-pill"
# 实测两个选择器都 {"exists":false},consoleErrors:[],RC=0;而这两个类在 ?nx_device=off 下是存在的(chrome-baseline.mjs:38-40 的 P-058 注释就是同一坑)
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
=== 1) 原始复现命令（Git Bash，失败——Windows 路径转换，非 claim 问题）===
$ cd D:/WORKS/PLAN/Nexion-uniapp/.claude/worktrees/fervent-booth-7829b8
$ BASE_URL=http://localhost:5211 node scripts/page-check.mjs "/#/pages/index/index" chk ".nx-header,.nx-tabbar-pill"
page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "http://localhost:5211C:/Program Files/Git/#/pages/index/index", waiting until "networkidle"
    at scripts\page-check.mjs:52:12
RC=1

=== 2) 同一命令改用 PowerShell（复现成功，与 claim 完全一致）===
PS> $env:BASE_URL="http://localhost:5211"; node scripts/page-check.mjs "/#/pages/index/index" chk ".nx-header,.nx-tabbar-pill"; "RC=$LASTEXITCODE"
{
  "route": "/#/pages/index/index",
  "consoleErrors": [],
  "selectors": {
    ".nx-header": {
      "exists": false
    },
    ".nx-tabbar-pill": {
      "exists": false
    }
  }
}
RC=0

=== 3) 反证：同 origin、同路由，只加 ?nx_device=off ===
PS> $env:BASE_URL="http://localhost:5211"; node scripts/page-check.mjs "/?nx_device=off#/pages/index/index" chk2 ".nx-header,.nx-tabbar-pill"; "RC=$LASTEXITCODE"
{
  "route": "/?nx_device=off#/pages/index/index",
  "consoleErrors": [],
  "selectors": {
    ".nx-header": {
      "exists": true,
      "text": "1"
    },
    ".nx-tabbar-pill": {
      "exists": true,
      "text": "首页赚取商城团队我的"
    }
  }
}
RC=0

=== 4) 主文档 DOM 直探（自写 playwright 探针，证明机制）===
{
  "no_param": {
    "url": "http://localhost:5211/#/pages/index/index",
    "appChildren": 0,
    "uniViewCount": 0,
    "iframeCount": 1,
    "bodyTextLen": 0,
    "hasNxHeader": false,
    "topTags": ["SCRIPT", "DIV.nx-device-stage", "DIV#app", "SCRIPT"]
  },
  "with_param": {
    "url": "http://localhost:5211/?nx_device=off#/pages/index/index",
    "appChildren": 1,
    "uniViewCount": 236,
    "iframeCount": 0,
    "bodyTextLen": 1742,
    "hasNxHeader": true,
    "topTags": ["SCRIPT", "DIV#app", "SCRIPT", "DIV"]
  }
}

=== 5) 截图肉眼核对（推翻 claim 的"截图只拍到设备外壳"）===
chk.png（不带参数）：手机外壳框内 app 内容完整渲染 —— 首页顶栏、代金券弹层「限时福利/领取你的专属代金券/立减 $50/8% 折扣/暂不领取」全部可见，只是缩在机身框里。
chk2.png（带参数）：同样内容铺满 414×896 视口，无外壳。
→ 截图并非"只拍到设备外壳"，该分句为假；缺陷只成立在选择器判定这一半。

=== 6) 引用面 / 时间线核对 ===
$ grep -rn "page-check" --include=*.sh --include=*.json --include=*.
…(截断)
```

</details>

---

### [P2] src/lib/static-review-routes.ts:15

**族**:D · 路由归一化

**缺陷**:normalizeRoute 只剥前缀 `^\/?#?\/?` 和 query,不折叠 `..`,所以带路径穿越的字符串会**命中白名单前缀**:`#/pages/onboarding/../earn/earn` 归一成 `pages/onboarding/../earn/earn`,isAuthWhitelisted 返回 true。当前 H5 端 vue-router 匹配不到该路径,渲染的是**空白页**(body 无任何内容、getCurrentPages() 为空、无报错、无返回出口),所以今天没形成直接越权;但白名单判据对一个内含业务路由的字符串答「是」,属于判据本身的漏洞(换 router 版本 / App 端解析行为不同就会变成直通)。同时空白死页本身是个无出口的坏状态。

**复现**:

```
node -e 'const n=r=>(r??"").replace(/^\/?#?\/?/,"").split("?")[0];console.log(n("#/pages/onboarding/../earn/earn"),n("#/pages/onboarding/../earn/earn").startsWith("pages/onboarding/"))'
运行时空白页:浏览器开 http://localhost:5211/?nx_device=off#/pages/onboarding/../earn/earn —— 全白,无内容无出口。
全 18 种形态基线:BASE_URL=http://localhost:5211 node "C:/Users/jason/AppData/Local/Temp/claude/D--WORKS-PLAN-Nexion-uniapp--claude-worktrees-fervent-booth-7829b8/3d189f49-176c-4e0d-8f9c-7bec2f8db466/scratchpad/attack.mjs"
```

<details><summary>对抗验证员亲自跑出的实际输出</summary>

```
═══ 步骤 1：纯函数复现（对方给的命令，我原样跑）═══
$ node -e 'const n=r=>(r??"").replace(/^\/?#?\/?/,"").split("?")[0]; ...'

"#/pages/onboarding/../earn/earn"     -> "pages/onboarding/../earn/earn"     | startsWith pages/onboarding/: true
"#/pages/login/../../pages/earn/earn" -> "pages/login/../../pages/earn/earn" | startsWith pages/login/: true
"#/pages/onboarding/..%2Fearn%2Fearn" -> "pages/onboarding/..%2Fearn%2Fearn" | startsWith pages/onboarding/: true

═══ 步骤 2：确认跑的是 HEAD 代码（工作树曾被污染）═══
$ git status --porcelain -- src/
 M src/App.vue          ← 开跑时：另一 agent 的 ISOLATION-EXPERIMENT
$ git diff -- src/App.vue
-  const r = normalizeRoute(route);
-  return isStaticReviewRoute(route) || AUTH_WHITELIST_PREFIXES.some((p) => r.startsWith(p));
+  const r = normalizeRoute(route); void r; // ISOLATION-EXPERIMENT
+  return isStaticReviewRoute(route) || AUTH_WHITELIST_PREFIXES.some((p) => route.startsWith(p));

（等其回滚后，跑测试前 + 跑完各查一次）
$ git status --porcelain -- src/     → 空
$ sed -n '335,336p' src/App.vue
  const r = normalizeRoute(route);
  return isStaticReviewRoute(route) || AUTH_WHITELIST_PREFIXES.some((p) => r.startsWith(p));   ← 等于 HEAD

═══ 步骤 3：我自己写的 runtime 探针（含 4 组对照）═══
$ curl -s -o /dev/null -w "HTTP %{http_code}" "http://localhost:5211/?nx_device=off"   → HTTP 200
$ BASE_URL=http://localhost:5211 node <scratchpad>/counter-probe.mjs

CONTROL: signed out, real business route
  target=/pages/earn/earn authed=false
  -> hash="/pages/onboarding/intro" stack=["pages/onboarding/intro"] textLen=173 clickable=2 pageErrors=0
  text="NexGrid. Compute flows. Connecting the world's compute to power AI. 28,432 devices online"
  → 守卫正常工作

ATTACK: traversal under whitelist prefix
  target=/pages/onboarding/../earn/earn authed=false
  -> hash="/pages/onboarding/../earn/earn" stack=[] textLen=0 clickable=0 pageErrors=0
  text=""
  → 未被踢回，hash 原样保留，空白页 ★ claim 复现

ATTACK: traversal via login prefix
  target=/pages/login/../../pages/earn/earn authed=false
  -> hash="/pages/login/../../pages/earn/earn" stack=[] textLen=0 clickable=0 pageErrors=0
  → ★ 复现

ATTACK: encoded traversal
  target=/pages/onboarding/..%2Fearn%2Fearn authed=false
  -> hash="/pages/onboarding/..%2Fearn%2Fearn" stack=[] textLe
…(截断)
```

</details>

---

## 被证伪的(对抗验证员判定不成立,存档备查)

- **static-review-routes.ts** — normalizeRoute 只剥 `/#/` 前缀和 query,不折叠 `.` / `..` 路径段,而 App.vue:336 的 AUTH_WHITELIST_PREFIXES 是纯 startsWith。于是 `#/pages/login/../earn/earn` 被判成白名单页 → 登出态守卫不再兜底 → 页面永久白屏(vue-router 匹
  - 证伪理由:现象 100% 复现,但「缺陷」的因果归属是误读代码,且不是本轮改动引入的回归。三条独立证伪: 【证伪 1 · 不是回归,改动前同样白屏,「本来能兜住」是假的】 runtime 实测:落在 `#/pages/login/../earn/earn` 时 `getCurrentPages()` 返回 **(empty)** —— 页面栈是空的(vue-router 打 "No match found",没有任何页挂载)。 改动前(9441d68)的 `checkAuthGuard()` 用的是 `readCurrentRoute()`(只读 getCurrentPages),在这条 URL 上必然
- **compare-detail.mjs** — catch 把导航失败降级成一行 console.log('uni','ERR',...) 就继续,脚本 exit 0。origin 指死端口时它是全场 29 个 playwright 探针里唯一一个既没崩也没非零退出的。
  - 证伪理由:复现结果与对方描述完全一致(RC=0 + 「uni ERR ... ERR_CONNECTION_REFUSED」),但四条独立证据表明它不构成本轮改动的缺陷,判 real=false。 **1. 这行 catch 不是本轮引入的,本轮 diff 根本没碰它。** `git diff 9441d68...HEAD -- scripts/compare-detail.mjs` 只有两处改动:新增第 8 行 `const BASE = process.env.UNI_BASE_URL || ...`,以及第 10 行 url 用上 BASE + `?nx_device=off`。catch 那行在

## 覆盖面自陈(各维度审计员声明自己查了什么/没查什么)

**bypass**:审查面:登出态(未认证)访问者能否停留在业务页。全部结论来自 http://localhost:5211 实测,4 个自写 Playwright 探针(scratchpad/attack.mjs、attack2.mjs、attack3.mjs、attack4.mjs、attack5.mjs),未复用仓库自带的 auth-guard-verify.mjs 结论。 查了什么: 1) 路由形态归一化绕过 —— 18 种:裸 root 无 hash、基线深链、带 query、双斜杠 #//、`..` 穿越(经 onboarding/login 两个白名单前缀)、%2F 编码穿越、全大写、尾斜杠、# 后无斜杠、白名单页后接二级 hash、业务页后接子 hash、%70 编码首字母、query 里塞白名单 decoy、`/./` 前缀,以及 home/team/genesis/wallet-withdraw 四类业务深链。除 `..` 穿越类落空白页外,其余全部被正确踢回 intro。 2) 白名单前缀与 89 条注册路由逐条比对:无业务页落在 pages/{onboarding,login,register,ref,tx,session,entry-surfaces}/ 之下,前缀本身没有覆盖过宽。 3) 先进白名单页再站内跳转(改 hash / 页面自带 navTo 链接 / uni.reLaunch 三种真实导航方式各测)。 4) 已认证未 onboarding 态(isAuthenticated=true, onboardingComplete=false):冷启动正确踢到 estimator,一次 hash 跳转即停在 earn —— 与 P0-1 同根因,已并入该条,未单列。 5) 停留期间被登出:同 tab 站内登出(me.vue 自己 reLaunch 到 login,不依赖守卫,正常)+ 跨 tab 登出(做了控制组/变量组对照,见 P0-2)。 6) 回源读了 App.vue 全文、static-review-routes.ts、store/auth.ts、pages.json,并 grep 确认全站无页面级 auth 守卫 —— 权限完全押在 App.vue 一处。 没查到 / 没覆盖: · 只测了 H5(dev server 5211)。App 端(iOS/Android webview)与微信小程序的 getCurrentPages 时序和 hash 语义不同,P0-1/P0-2 在这两端是否同样成立没验。 · 没测真实 OTP 登录链路里的中间态(auth-otp / complete-sign-in 的 pending 账号)。 · session 被 ops revoke(killedAt)这条通道没单独构造,只测了跨 tab 自主登出。 · 没做修复,也没跑 type-check / verify.sh —— 本次只做审计。

**regression**:主人,我把这轮改动当回归面从头跑了一遍,以下是实际查了什么、什么没查到。 **跑过并判绿的（都是运行时,不是看代码）** - 路由稳定性矩阵(自写探针 reg1):3 种 auth 态(默认已登录 / 登出 / onboarding 未完成)× 17 条路由 = 51 组,每组冷启动后隔 0.9 秒采 6 次 hash。全部稳定,无一例反复重定向;console error 全 0。登出态进 8 条业务页 → 稳定落 onboarding/intro(brief 里说的原缺陷已修好);onboarding 未完成 → 稳定落 onboarding/estimator;白名单页(onboarding ×2 / login / register / session/kicked / ref/code?c= / tx/hash?h=)在三种态下都停在原地不自踢。 - 全路由冒烟(reg7):从 pages.json 解析出的 89 条路由逐条打开,已登录默认态。3 条报异常,逐条追查后都不是缺陷:store/detail 与 support/chat 只是首屏渲染慢(等到 4 秒后内容 1125 / 150 字符),compute-share/download 是页面自身的守卫跳 me/devices。 - entry-surfaces 静态审阅面(reg10):4 个面 × 登录/登出两态,渲染正常、不被踢、业务轮询照旧全停 —— 与改动前一致。 - normalizeRoute 共用后对 isStaticReviewRoute 的影响:19 组用例把「原内联正则」和「新 normalizeRoute」并排跑,判定 0 差异。多出来的 split("?") 之所以不改变结果,是因为前缀 `pages/entry-surfaces/` 长 21 字符,一旦匹配上,前 21 个字符里就不可能出现 "?",截断只能发生在前缀之后。 - 机器门:npm run type-check 0 错;bash scripts/verify.sh(BASE_URL/UNI_BASE_URL 都指 5211)413 pass / 0 fail —— memory 里记的 3 条 worktree 假红这次没出现(verify.sh 这轮改的 ADMIN_ROOT 路径解析把它们修掉了)。 - 本轮改过的探针逐个实跑:auth-guard-verify / quest-probe / milestone-verify / behavior-verify 全部正常出结果,milestone-verify 的新存储键(nexgrid-milestones-accounts-v1 / nexgrid-quest-accounts-v1)与 store 里的常量一致,behavior-verify 的 .ms-overlay 选择器确实存在且轮询采样能抓到弹层。 - verify.sh 里那条从 grep 改写成 node 的 @tap 哨兵,我做了 3 组红测(模板里裸绑定 / 同行 HTML 注释 + 真绑定 / .ts 模板字符串里的绑定)—— 三组全部照样判红,注释豁免没把真绑定一起放过;src 下只有 .vue/.ts 两种可能承载绑定的扩展名,改写后的文件类型过滤没缩小覆盖面。 **没查 / 查不动的** - 只在 H5 端跑的。小程序 / App 端的 readCurrentRouteOrHash 走 #ifdef 剥掉的分支,我没有对应运行环境验证,只做了代码判读(剥掉后与改动前等价)。 - 手机外壳 iframe 模式(不带 ?nx_device=off)没单独跑。看了 index.html 的外壳代码:iframe 的 src 是外层 URL 原样加一个参数,hash 完全继承,所以 location.hash 判据在壳内外一致 —— 属推断,非实测。 - 主干合并进来的 13 个界面的「地区受限文案」本身没做功能验收(那是另一条线的活),我只覆盖了它们的渲染 + console 无错。 - 有一条**不是本轮引入**、所以没写进 findings 的观察:业务轮询只在 App 的 onShow 里被拉起,页内任何 reLaunch / 切路由都不会重新拉。所以登出用户走 onboarding→登录→首页这条链,轮询同样是死的 —— 但这条在改动前的代码里逐字相同(卡在 App.vue:578 的 !auth.isAuthenticated,该行本轮未动),我没有端到端跑完真实登录流程去实证,只做了代码判读。我报的那条 P1 是它的另一半:已登录用户走深链进来,改动前是活的、改动后死了。 - 工作树里有两个不属于我、也不属于本轮 diff 的临时文件(scripts/_tmp-bn-copy.mjs、scripts/_tmp-bn-instr.mjs,以及会话开始时就在的 tmp-audit-probe*.mjs 等),是并发 agent 留下的。我全程没往仓库里写过东西,做 A/B 时临时替换的 src/App.vue 已 git checkout 还原,收尾 git diff HEAD 为空。

**completeness**:跑的都是 http://localhost:5211 上的真实浏览器探针(playwright,URL 一律带 ?nx_device=off 放在 # 之前),每条结论都有「坏例 + 对照组」两侧,没有只读代码就下断言的条目。 【查了什么 · 判为无缺陷的(逐条给依据)】 1) readCurrentRoute / readCurrentRouteOrHash / normalizeRoute / isStaticReviewRoute 的全部调用点(grep 全仓,共 12 处): - App.vue:347 checkAuthGuard(OrHash)→ isAuthWhitelisted 内部归一化,形态匹配。实测回归:登出态冷启动 #/pages/earn/earn → 被踢到 #/pages/onboarding/intro;authed+未 onboarding 冷启动 → 踢到 #/pages/onboarding/estimator。修复有效。 - App.vue:371 checkSession 用的是 **readCurrentRoute()(没有 hash 兜底)**,与刚改过的兄弟函数不同形 —— 这是我最重点怀疑的一条,但没能复现出用户可见的洞:(a) 运营吊销 + 冷启动深链 → onLaunch 的 scheduleAccountSessionBootstrap → resumeOrClaim 已经把它踢到 #/pages/session/kicked(实测);(b) 换设备需重新校准 + 冷启动深链 → 1 秒后由 quest watcher 里的 checkSession 自愈,实测落 #/pages/onboarding/connect?mode=recalibrate 且轮询正常起来。判为「形态不一致但当前被两条旁路兜住」,按「只报自己复现过的」原则没有计入 findings,但结构上它是同型,建议顺手统一。 - App.vue:487 / 614(OrHash → isStaticReviewRoute,内部归一化)实测:#/pages/entry-surfaces/h5 登出态与已登录态都正常渲染、不被守卫踢。 - App.vue:519 checkQuestRoute / 556 startQuestWatch:都用 readCurrentRoute(),下游是 `route === \"pages/earn/earn\"` 这类页面栈同形的精确比较,匹配。 - App.vue:576 canRunBusinessLoops(OrHash → isAuthWhitelisted)形态匹配。 - App.vue:610 退役 kyc 深链的正则 /\\/pages\\/me\\/kyc([?#/]|$)/ **要求前导斜杠**,而 readCurrentRouteOrHash 可能返回无前导斜杠的页面栈形态 —— 形态上是同型隐患,但 pages/me/kyc 已从 pages.json 注销,页面栈永远不可能出现它,只可能走 hash 分支。实测 #/pages/me/kyc 与 #/pages/me/kyc?x=1 都正确落 #/pages/me/security?from=retired-flow。判为当前无缺陷。 2) 其它拿路由做前缀/正则匹配的地方: - lib/route.ts 的 toUniRoute/navTo/navBack:输入是逻辑 href,不消费「读到的路由」,不存在跨形态判据。 - store/milestones.ts 的 isMoneyFlowRoute(startsWith,页面栈形态)配 milestone-celebration.vue 的 readRoute(剥 #/ 但不剥 query)—— startsWith 对尾部 query 不敏感,形态自洽。 - global-ui.vue:81 / app-chassis.vue:405 的 isStaticReviewRoute(route.value):readRoute 的 hash 兜底不剥 query,但 isStaticReviewRoute 内部会剥,自洽。 - lib/header-title.ts + sub-page-header.vue:精确 map 查表,读的是页面栈形态且只在页面挂载后调用,栈必非空。 - services/behavior-analytics.ts:356 的 readCurrentRoute 返回的是**第三种形态** `/pages/x/y`(带前导斜杠),但它只喂给同文件 line 35 的白名单正则 /^\\/pages\\/[a-z0-9-]+\\/[a-z0-9-]+$/ 和分析上报标签,不做权限判断。我把 pages.json 里全部 89 条路由跑了一遍这个正则,0 条不匹配,不存在静默丢事件。 - components/tradein-sheets.vue:425、components/store/card-payment.vue:131:都在页面挂载后读页面栈,形态一致。 - routing/safe-return-to.ts:只在 completeSignIn 成功之后消费,不是鉴权判据。 3) App.vue onShow 提前 return 会跳过的启动步骤:已逐条列全(attachSessionWatch 在 return 之前,安全;settle / advanceArrivalAndSettleBill / startTick / startArrivalPoll / startTrialPoll / startOrderPoll / startMilestonePoll / startQuestWatch 八项全跳),并做了运行时证明 → 即 finding 1。 【没查到 / 没覆盖的】 - 只在 H5(chromium)验证,没有 App(iOS/Android webview)与小程序端;那两端 onShow 语义不同,finding 1 的结论不能直接外推。 - 「登出 → 走 login 页密码登录 → 落首页」这条最常见路径没能实测(mock 登录要求手机号在认证目录里 active,得先跑完整注册+OTP),我用的是同一 onShow 门的另外两条路径(注册后 onboarding、静态评审页进业务页)。 - 没有在 base commit 9441d68 上另起 dev server 做 A/B,所以「finding 1 不是本轮引入」是读代码推断,不是实测。 - 一个我看到但没能复现、故未计入的可疑点:app-chassis.vue:253 pageScrollKey() 优先取 $page.fullPath(`/pages/x/y?q=1`),取不到才退回 route(`pages/x/y`)——同一个 map 的 key 混了两种形态,理论上会让「记录滚动位置」和「恢复滚动位置」用不同 key,但我构造不出稳定的 $page 缺失场景,不作为 finding 报。 - 探针脚本本身(scripts/*.mjs)只做了静态审阅(键名对照源码 ACCOUNTS_KEY 正确、origin 兜底写法正确),没有逐个跑 verify.sh 全量。

**probes**:跑过的:scripts/ 下 74 个 .mjs 全部过了一遍;其中 29 个真起 chromium 的探针逐个用死端口(localhost:59999,BASE_URL 与 UNI_BASE_URL 同时指过去)实跑,退出码取的是 node 自己的 $?(单独重定向 stdout/stderr,不经管道),不是管道末端的。结果:26 个明着失败(RC=1/2/3),compare-detail RC=0(已报),chrome-baseline capture RC=0(已报),release-gate-walkthrough RC=1 且 src/store/product-phase.ts 未被其 crash handler 改脏(已核 git status)。 存储键:写脚本把 scripts/*.mjs 里非注释行的 24 个 "nexgrid-*" 字面量,对 src/ 下**剥掉注释行后**的实际键做交叉比对 —— 24/24 全部命中活键,无一条只存在于源码注释里。milestone-verify / quest-probe 本轮换的 nexgrid-{milestones,quest}-accounts-v1 与 src/store/milestones.ts:69、quest.ts:72 一致(旧单键在这两处确实只剩注释);spec6 的 8 键、staking 的 nexgrid-v3-staking-accounts-v1 等也都对得上。这一轴我没找到问题。milestone-verify 实跑 5211 能拿到 overlay 且 firedIds 落盘;quest-probe 读到 null 是对的(quest 只在 markComplete 时 persist,首页 0/6 本就没落盘),不算缺陷。 ?nx_device=off:按「有 goto 但没带该参数」筛出 10 个,逐个看是否自己解析 iframe。release-gate-walkthrough(resolveUi)、spec4-account-cloud-app-sync、auth-register-existing-runtime、r7-device-detail-runtime 四个自带取帧逻辑,不受影响;spec4-runtime-session-guard 只读 localStorage 和 location.hash(外壳每 500ms 从 iframe 回写宿主 hash,见 index.html:181-189),也成立。剩下 5 个已逐条上报。 「扫了 0 个目标却报无违例」:endpoint-citation-sentinel(:257)、card-data-boundary(:170)、invisible-fill-scan(:214)、zero-border-gate(:296)、tap-feedback-probe(:345,本轮新加)都已有覆盖面 witness,验过它们的判据在场。**没复现出来但形状可疑、留给主人判断**:scripts/theme-constant-gate.mjs 的 sweep() 只要 PROBE 返回空数组就会打印「无新增」并 exit 0,全文没有采样量 witness,也没把 gone.length（基线整片消失）当红 —— 我造不出一个「页面能加载、__vue_app__ 能取到、但探针返回 0 元素」的真实场景,所以没按发现上报,只作提示。 没做的:selfcheck-*.mjs 这类纯逻辑门(不依赖 origin)只做了静态阅读,没逐个变异测试;behavior-verify.mjs / quest-probe.mjs / milestone-verify.mjs 本身没有断言、只打印观测值,属设计如此,未按缺陷计。 ⚠️ 环境事实:审查期间本 worktree 有**另一个 agent 并发在改** —— 根目录先后出现 tmp-audit-probe1..8.mjs、tmp-xverify*.mjs,且 src/App.vue 在 15:18 被整片回退成本轮修复前的版本(我的备份与 git HEAD 逐字节一致,15:15 已还原过一次,15:18 那次不是我)。我没有再去动它,以免冲掉对方在跑的实验。我自己的产物(scripts/.baseline/deadtest、deadtest2、_check/sticky-frost.png、scripts/_audit-tmp-shellcheck.mjs)已 Move 到 .trash/20260807-152029-toolchain-audit/;docs/DOM-QA-LEDGER.json 与 src/store/product-phase.ts 已核对为未改动。

