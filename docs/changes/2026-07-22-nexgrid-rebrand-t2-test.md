# NexGrid 品牌改名 T2 独立验收报告 — R2(store/mock 用户可见字符串)+ R4(运行时标识)

- 验收人:独立黑盒 tester agent(实现方 ≠ 验收方)
- 日期:2026-07-22
- 对象:`D:\WORKS\PLAN\Nexion-uniapp` 工作树(HEAD `2950d78`;改名为**未提交的工作树改动**,`git show HEAD:src/styles/tokens.css` 仍为旧名可证)
- 环境:dev server `http://localhost:5173` 探活 200(未重启);playwright = 工程 node_modules,chromium headless,跑完已随 `browser.close()` 回收(复核无 ms-playwright 残留进程)
- 前提口径:主人拍板持久存储键全改 `nexgrid-*`、无迁移垫片(旧演示数据作废是预期,不是 bug)

## 结论一览

| AC | 结论 | 一句话证据 |
|---|---|---|
| AC-R2-1 源码 | ✅ PASS | 设备显示名全 NexGridBox/NexGridRack;内部 id `stellarbox-*`/`stellarrack-*` 未动;mock/orders 用户可见字符串 0 Nexion |
| AC-R2-2 运行时 | ✅ PASS | 商店页实渲染 NexGridBox S1/Pro/Pro v2 + NexGridRack P1/P2,可见文本 0 Nexion,console error 0 |
| AC-R4-1 源码 | ✅ PASS(附 1 裁决点) | 指定四目录 grep 53 hits 全为溯源注释;应用持久键全 `nexgrid-*`(例外 `nx_otp_*` 见裁决点 1);dev 钩子 `__nexgridAuthDev`;`--nexgrid-header-h` 旧名 0 残留 |
| AC-R4-2 运行时全链 | ✅ PASS | 净上下文注册全链跑通;9 个 `nexgrid-*` 键有值(≥5)、0 个 `nexion-*` 键、账号 `+16507288211@demo.nexgrid.ai` |
| AC-R4-3 横切 | ✅ PASS | 邀请码样例/正则全 `NEXGRID-`,全 src 0 处 `NEXION-` |

---

## AC-R2-1(源码)— PASS

**设备显示名 vs 内部 id**(`src/store/device-types.ts` L24-28):

| 内部 id(对象键,须未动) | 显示名(须新品牌) |
|---|---|
| `stellarbox-s1` | NexGridBox S1 |
| `stellarbox-pro` | NexGridBox Pro |
| `stellarbox-pro-v2` | NexGridBox Pro v2 |
| `stellarrack-p1` | NexGridRack P1 |
| `stellarrack-p2` | NexGridRack P2 |

`DEVICE_PRICE_USDT`(L33-42)、`UPGRADE_LADDER`(L192)、`PURCHASED_HARDWARE_KINDS`(L194-200)键名均仍为 `stellarbox-*`/`stellarrack-*` — 内部 id 未被误改。✅

**mock + orders 用户可见字符串**:`grep -rniE nexion src/`(全量)在 `src/mock/*.ts` 与 `src/store/orders.ts` 的命中**只有文件头溯源注释**(`Ported from Nexion-prototype/...` / `Nexion-admin-prototype`),0 处用户可见字符串。正向抽证:`src/mock/products.ts` L71/104/139/173/208 = NexGridBox/NexGridRack 系列名 + L87 "Fully managed by NexGrid";`src/store/orders.ts` L96/223 = "Device live · joined NexGrid network"。✅

## AC-R2-2(运行时)— PASS

- 访问 `http://localhost:5173/?nx_device=off#/pages/store/store`(路由与 `src/pages.json` L56 一致;`nx_device=off` 直渲 app 本体,排除 iframe 壳假阴)。
- 页面可见文本捕获到商品显示名:**NexGridBox S1 / NexGridBox Pro / NexGridBox Pro v2 / NexGridRack P1 / NexGridRack P2**,另有 "Your NexGridBox Pro is worth $899.25 in credit"(trade-in 文案)。
- 可见文本 `Nexion` 计数 = **0**;console/page error = **0**;header 品牌区渲染 "NexGrid" logo+字标(截图可见)。
- 截图:`C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN\27efd79e-c876-472f-bf4f-81f4726b6b26\scratchpad\r2-store-page.png`

## AC-R4-1(源码)— PASS(附 1 裁决点)

**① 指定目录 grep**:`grep -rniE "nexion" src/store/ src/auth/ src/lib/ src/composables/` → **53 hits,经白名单反滤(`grep -viE "Nexion-(prototype|uniapp|admin)"`)后 0 hits** — 全部为溯源注释,无功能性残留。`src/auth/`(complete-registration / complete-sign-in / password-rules)0 命中。✅

**② uni storage 持久键**:全量枚举 src 内键常量与直传字面量(`*_KEY =` 与 `StorageSync("...")` 双 grep),应用侧持久键 40+ 个**全部 `nexgrid-*` 前缀**(auth/auth-accounts/account-cloud/session×3/bills/cards/orders/receipts/profile/security/goals/quest/weekly-quest/event-quest/staking/exchange×3/v-rank/nex-faucet/commission/achievements/milestones/lucky-spin/daily-powerup/free-trial/trial-config/trial-claim-sheet/voucher/voucher-claim-sheet/cart/genesis×3/sponsorship/risk-registry/ip-bucket/cluster-override/product-phase-override/earning-ledger/locale/theme/preferences/risk-disclosure/rewards-seen/tickets/wallet-pairing/device-id/device-baseline/share-events)。`nexion-*` 键 0 处。**唯一例外:`nx_otp_*` 3 键 → 裁决点 1**。✅*

**③ dev 钩子**:`src/store/auth-otp.ts` L457-460 `mountAuthOtpDevBridge()` 挂 `window.__nexgridAuthDev`(`import.meta.env.DEV` 守卫,PROD 不挂载);另 `src/lib/spec7-dev-bridge.ts` L17 `__nexgridSpec7Dev` 同步新名。`__nexionAuthDev` 全 src 0 处(被 ① 的 -i grep 覆盖证明)。✅

**④ `--nexgrid-header-h`**:`src/styles/tokens.css` L25 已改新名;全工程(含 index.html/vue/ts/css,排 node_modules/dist)grep:新名 1 处(即定义)、旧名 `--nexion-header-h` **0 残留**;消费点 0 个 = 无不一致消费者。回归排除:HEAD(2950d78)与 36681d7 时代该变量同样**只有定义、0 消费**,改名未丢任何消费点(见观察项 3)。✅

## AC-R4-2(运行时全链)— PASS

净上下文(全新 browser context,无任何旧 storage)→ `?nx_device=off#/pages/register/register` → 手机号 `6507288211` → `.rg-cta` 发码 → OTP 6 位 `111111` 直接通过(未触发滑块,未动用 dev 钩子)→ 设密码 `StrongPass123!`×2 → 落 `#/pages/register/success`("You're in / Welcome to NexGrid",截图:`...scratchpad\r4-register-success.png`)。console/page error = 0。

**localStorage 全量键 dump(注册成功后,12 键)**:

| 键 | 有值 | 归类 |
|---|---|---|
| `nexgrid-account-cloud-v1` | ✓ | 应用 ✅ |
| `nexgrid-account-sessions-v1` | ✓ | 应用 ✅ |
| `nexgrid-auth-accounts-v1` | ✓ | 应用 ✅ |
| `nexgrid-auth-v1` | ✓ | 应用 ✅ |
| `nexgrid-cart-accounts-v1` | ✓ | 应用 ✅ |
| `nexgrid-device-id-v1` | ✓ | 应用 ✅ |
| `nexgrid-ip-bucket-v1` | ✓ | 应用 ✅ |
| `nexgrid-risk-registry-v1` | ✓ | 应用 ✅ |
| `nexgrid-voucher-accounts-v1` | ✓ | 应用 ✅ |
| `nx_otp_active_v1` / `nx_otp_send_log_v1` | ✓ | mock server 侧 OTP 状态(裁决点 1) |
| `__DC_STAT_UUID` | ✓ | uni-app 框架内部键,非应用键 |

- 断言 ① `nexgrid-*` 有值键 = **9 ≥ 5** ✅
- 断言 ② `nexion-*` 键 = **0** ✅
- 断言 ③ 账号身份:`useAuth().accountId` = `+16507288211@demo.nexgrid.ai`,且持久化 `nexgrid-auth-v1` 原文 `{"isAuthenticated":true,"email":"+16507288211@demo.nexgrid.ai","accountId":"+16507288211@demo.nexgrid.ai",...}` — **@demo.nexgrid.ai 域** ✅
- 佐证:注册前 boot 预种键(account-cloud/sessions/device-id/cart/voucher/ip-bucket)亦全为 `nexgrid-*`。

## AC-R4-3(横切)— PASS

`grep -rn "NEXION-|NEXGRID-" src/` → `NEXION-` **0 处**;`NEXGRID-` 6 处全为新前缀:

- `i18n/messages/{en,zh,vi}.ts` invitePlaceholder = `NEXGRID-OG-XXXX`(三语)
- `store/app.ts` L124 referralCode = `NEXGRID-8K9X`
- `store/genesis.ts` L96 `GENESIS_INVITE_PATTERN = /^NEXGRID-OG-[A-Z0-9]{4}$/`
- `store/sponsorship.ts` L13 `REF_CODE_RE = /^NEXGRID-[A-Z0-9]{4}$/`

## 观察项(不判 fail,供 main 裁决/知悉)

1. **`nx_otp_*` 3 键未纳入 `nexgrid-*` 前缀**(`src/store/auth-otp.ts` L62-64:`nx_otp_send_log_v1`/`nx_otp_active_v1`/`nx_otp_captcha_v1`,经 `uni.setStorageSync` 持久)。严格按 AC 字面「所有 uni storage 持久键均为 nexgrid-*」不满足;但 `git log -S` 证明该 3 键由 FEAT-AUTH01(a2e3340,改名前)以品牌中性 `nx_` 前缀引入,**从未叫过 `nexion-*`**,注释明示「mock server 侧状态;独立 key,不进 account-cloud」——不构成品牌残留,0 处旧品牌。是否补改为 `nexgrid-otp-*` 请 main 裁决(改则需同步 `scripts/auth-register-existing-runtime.mjs` 等 harness)。
2. **静态资产文件名保留旧品牌**:`src/static/img/products/nexionbox-*.png`/`nexionrack-*.png`,`product-card.vue` L139-143 与 `product-render.vue` L84-86 引用与文件名一致,HTTP 200 实测可服务(商品图不破)。属 CLAUDE.md 白名单「内部存量标识沿用 Nexion 前缀」;文件名对用户不可见。非 R2/R4 范围。
3. **`--nexgrid-header-h` 是死变量**:定义于 tokens.css L25,全工程 0 消费、0 运行时写入;行内注释 "overwritten at runtime by Header via ResizeObserver" 为原型时代陈旧描述(HEAD 前同样 0 消费,非本次改名回归)。可另行清理。

## 环境假阴排除记录

- server 探活 200 后才跑,全程未重启;`?nx_device=off` 绕过 device-shell iframe(主帧直渲,另带 iframe 兜底解析)。
- 净上下文 = playwright 全新 context(非清 key),从根上排除旧 storage 污染;uni 包装格式(`{type:"object",data:X}`)在 dump 原文中可见,读取按原文呈现、未做注入。
- 测试脚本与截图存 tester 会话 scratchpad;chromium 已回收,`.agent-browser`(18:04/18:29 启)与 playwright-MCP(活父进程 node `@playwright/mcp`)属其他会话/agent 的活跃实例,未误杀。
