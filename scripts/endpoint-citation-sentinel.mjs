#!/usr/bin/env node
/**
 * endpoint-citation-sentinel — 注释里的 PROD 接口地址必须在台账里有据。
 *
 * 缺陷族(2026-08-04 R4):注释写 `POST /api/stakes/:id/claim` 而 PRD 是
 * `/api/staking/:id/claim`;注释写 `POST /api/genesis/purchase` / `POST /api/swap`
 * 而 PRD 根本没这个接口。tsc / verify 全绿也抓不到 —— 注释不参与编译。
 *
 * 判据:扫全部**注释行**里的 `/api/...` 引用,逐条对下面的 LEDGER 比对。
 *   - 代码里出现、台账里没有  → RED(新接口没登记,或是笔误 / 虚构)
 *   - 台账里有、代码里没出现  → RED(台账过期,防止台账变成只增不减的垃圾场)
 *   - 一条都没扫到            → RED(判据本身失效,空集全过是哨兵最常见的假绿)
 *
 * LEDGER 每条必须注明出处:`PRD §X.Y`(前端 PRD 有定义)或 `TBD: <原因>`
 * (PRD 未定义 —— 注释侧必须同时写明 TBD / 候选,不许当既定契约引用)。
 * 台账**写在本文件里**,不写在被查文件里 —— 否则改注释的同时改台账,门等于没有。
 *
 * 用法:node scripts/endpoint-citation-sentinel.mjs [--dump]
 *   --dump  只打印扫到的实际引用(加新接口时用来对齐台账),不做判定
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src"];
const EXT = new Set([".ts", ".tsx", ".vue", ".js", ".mjs"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".trash", "dist", "unpackage", ".playwright-mcp"]);

/**
 * 台账:normalized citation → 出处。
 * 前端 PRD = D:\WORKS\PLAN\PRD\NexGrid_产品功能架构设计文档_v3.7.md
 */
const LEDGER = {
  // ── auth / session ────────────────────────────────────────────────────
  "GET /api/auth/session": "PRD §4.9 / §9.11a",
  "POST /api/auth/login": "PRD §9.11e",
  "POST /api/auth/logout": "PRD §4.7",
  "POST /api/auth/otp/send": "PRD §4.6.2",
  "POST /api/auth/otp/verify": "PRD §4.6.2 / §9.11e",
  "POST /api/auth/password/reset": "PRD §9.11e",
  "POST /api/auth/register": "PRD §4.9(`POST /api/auth/{register,login}`)",
  "POST /api/auth/{register,login}": "PRD §4.9",
  "POST /api/auth/signin": "PRD §4.7(多载体 session registry)",
  "GET /api/account/sessions": "PRD §4.7",
  "POST /api/account/sessions/:id/revoke": "PRD §4.7",
  "POST /api/me/password": "TBD-NAME: PRD §4.6.5 用 POST /api/auth/password/change;本处为旧候选名,接后台时以 auth 为准",
  "/api/me/*": "PRD §12.2(自身档案读写族,非单一 endpoint)",

  // ── config(server-canonical 业务参数)──────────────────────────────
  "GET /api/config/platform": "PRD §9.11c.1",
  "GET /api/config/commission/rates": "PRD §9.11c.1",
  "GET /api/config/leadership-pool": "PRD §9.11c.1",
  "GET /api/config/milestones": "PRD §9.11c.1",
  "GET /api/config/phone-tiers": "PRD §9.11c.1",
  "/api/config/phone-tiers": "PRD §9.11c.1 + §6.10(手机算力显示规则与校准;PRD 原文**点名**了 `GET /api/config/phone-tiers`,不是未定义)",
  "GET /api/config/staking/pools": "PRD §9.11c.1",
  "GET /api/config/task-capacity": "PRD §6.8 / §9.11c.1(PRD 原文标 TBD)",
  "GET /api/config/tradein": "PRD §7.5.1 / §9.11c.1",
  "GET /api/config/v-ranks": "PRD §9.11c.1",
  "GET /api/config/bank-accounts": "PRD §9.2.8",
  "GET /api/config/deposit-channels": "PRD §9.2.8",
  "/api/config/deposit-channels": "PRD §9.2.8",
  "/api/config/leadership-pool": "PRD §9.11c.1",
  "/api/config/tradein": "PRD §7.5.1 / §9.11c.1",
  "GET /api/config/fx": "PRD §9.11c.1",
  "GET /api/config/genesis": "PRD §9.11c.1",
  "GET /api/config/gpu-tiers": "PRD §9.11c.1",
  "GET /api/config/release-gates": "PRD §9.11c.1",

  // ── genesis ───────────────────────────────────────────────────────────
  "POST /api/genesis/secondary/fulfill": "PRD §10.2.4",
  "GET /api/genesis/eligibility": "PRD §10.1.1",

  // ── staking ───────────────────────────────────────────────────────────
  // 注:`POST /api/staking/open` 曾在 stake-sheet.vue 被引用,2026-08-04 并发的
  // staking-CAS 改造把那条注释改写掉了 —— 台账随之删除(引用回归时哨兵会报
  // 「未登记」,按流程重新登记 PRD §9.11e 即可)。
  "POST /api/staking/:id/claim": "PRD §9.11e",
  "POST /api/staking/:id/{claim|early-withdraw}": "PRD §9.11e",

  // ── trial ─────────────────────────────────────────────────────────────
  "GET /api/trial/eligibility": "PRD §9.11a.2",
  "GET /api/trial/state": "HOLD: backend 当前仅公开 /api/trial/eligibility;保留为前端候选读取,未接线前不得当作服务端事实",
  "/api/trial/state": "HOLD: 同上;注释未带 method 的候选引用",
  "POST /api/trial/start": "PRD §9.11a.2",
  "POST /api/trial/convert": "PRD §9.11a.2 / §9.11e",
  "POST /api/trial/cancel": "PRD §9.11a.2",

  // ── orders / store ────────────────────────────────────────────────────
  "POST /api/orders": "PRD §7.5 / §9.10 / §9.11e",
  "POST /api/orders/bundle": "TBD: 2026-08-13 服务端权威组合定价与原子建单契约;PRD §7.5 / §9.10 待同步 bundle 资源",
  "/api/orders/:param/pay": "BACKEND: AppOrderCommandController 已实现;订单支付/捕获命令,前端 PRD 待同步",
  "GET /api/orders": "TBD-NAME: PRD §7.4 只定义了按 id 读单;列表读回路已由 order-api.ts 的 list() 实现(store/order-canonical.ts 在用),PRD 同步时补条目",
  "GET /api/orders/:id": "PRD §7.4(SSE)",
  "POST /api/orders/:param/pay": "TBD-NAME: 订单支付确认(commerce-payment-api.confirm,幂等键随请求);PRD §7.5 / §9.10 是下单与支付域但没定义该路径 —— 与已登记的同族命令 /api/orders/:param/cancel 同口径,接线以后端为准",
  "POST /api/orders/{orderNo}/pay": "TBD-NAME: 与上一条同一端点、花括号参数写法(后端 commerce sandbox 验收记录 2026-08-16 用 {orderNo});store/pending-checkout.ts 文件头引用为发票的服务端完成腿",
  "GET /api/store/catalog": "PRD §7.1",
  "/api/store/purchase-eligibility": "当前文档: PC 管理端开发落地规格 §3 API E1/E3; PRD v2 §E1/E3（Gen-2 E1 purchaseGate COMPLETE）",

  // ── wallet / withdrawals / deposits ───────────────────────────────────
  "GET /api/withdrawals": "PRD §9.4",
  "POST /api/withdrawals": "PRD §9.4 / §9.11e",
  "GET /api/withdrawals/:id": "PRD §9.11f(`GET /api/{module}/:id` 通式)",
  "POST /api/withdrawals/eligibility": "PRD §9.3.1-3",
  "/api/withdrawals/policy": "TBD-NAME: PRD §9.4 未定义策略下发接口 —— D5 提现策略权威化(c37e642)新契约,withdrawal-api.ts 已按 GET /api/withdrawals/policy 实现,PRD 同步时定名",
  // 同一个接口的带方法写法。2026-08-11 起日限的唯一权威来源就是它(z1 审计 P0-1:
  // 客户端曾按本地 config 写死的 1 笔拦人,而文案报的是这里下发的数)。
  "GET /api/withdrawals/policy": "TBD-NAME: 同上一条(带 method 的引用形式);dailyLimitCount 是每日提现笔数上限的唯一权威源",
  "GET /api/payout-addresses": "包 E 提现地址直管新接口,服务端已按 payout-addresses 资源实现",
  "PUT /api/payout-addresses/{network}": "TBD-NAME: 同上 —— 原子更换(在途单拦截 / 频控 / 冻结由服务端裁决)",
  "GET /api/deposits": "PRD §9.2.8",
  "GET /api/deposits/address": "PRD §9.2.8",
  "POST /api/deposits/bank-intents": "PRD §9.2.8",
  "POST /api/deposits/card": "PRD §9.2.8",
  "POST /api/admin/deposits/:id/resolve": "NOT-PRD: 入金后台处置 endpoint,PAY 规格未定义 API 层(见 deposits.ts 顶部声明)",
  "POST /api/admin/deposits/bank-intents/:id/resolve": "NOT-PRD: 同上,候选命名",
  "GET /api/bills": "PRD §9.3",
  "GET /api/me/bills": "PRD §11.5a",
  "GET /api/me/vouchers": "PRD §9.11c.2",
  "PATCH /api/me/rewards/seen": "PRD §11.5a",
  "GET /api/earnings/release-status": "TBD-NAME: PRD 未定名 —— 收益放行桶(可提现 / 待审 / 赠金锁定)的读取端点,概念见 PRD §9.3「提现只认可提现桶」;实现在 src/api/earnings-release-api.ts。🔴 它**只回锁定桶,不回总余额**:全仓没有任何余额端点,所以「提现后回拉服务端余额」这条路不成立(见 app.ts applyWithdrawalDebit 头注)。PRD 同步时定名",
  "GET /api/me/earnings": "PRD §9.11c.1",
  // (这里原有 `/api/devices/earnings` 与 `/api/app/wallet/sandbox` 两条 `TBD:`,与下方
  //  146 / 148 行**同键重复**、且被后者静默覆盖 —— 已删重复项,保留下方带分类前缀的那两条
  //  (生效值不变)。防复发的判据见下方「台账键自检」。)
  "/api/me/earnings/stream": "PRD §9.11c.1(SSE)",

  // ── vouchers ──────────────────────────────────────────────────────────
  "GET /api/vouchers": "PRD §9.11c.2",
  "POST /api/vouchers/:id/claim": "PRD §11.5a",
  "GET /api/vouchers/:id": "PRD §9.11f(`GET /api/{module}/:id` 通式)",
  "GET /api/users/:id/vouchers": "TBD-NAME: PRD 未定义运营读他人券包 endpoint(admin 侧,候选名)",

  // ── quests / faucet / milestones ──────────────────────────────────────
  "GET /api/quest": "PRD §9.11c.2",
  "POST /api/quest/complete": "PRD §9.11c.2",
  // 2026-08-15 包 zk:`GET /api/quests/weekly` 从台账删除 —— 最后一处文本引用在死文件
  // mock/weekly-quests.ts(0 运行时引用,已 Move .trash),实现自 U-16 起走 /api/quests/state。
  // 🔴 2026-08-13:周任务的**真实**端点是 `GET /api/quests/state`,不是 PRD 写的
  //   `/api/quests/weekly` —— 后者全仓已无任何实现(只剩 mock 文件里一处注释)。
  //   四条 `POST /api/quests/weekly/{...}` 已随领奖服务端化退役,本轮从台账删除。
  //   领奖现在走 `questApi.claim(questCode, key)` + 回读确认,路径见下。
  //   ⚠️ 已请后端在交接书 U-16 里确认以哪个为准;在那之前按代码实际路径登记,不按 PRD 登记 ——
  //   台账要反映**代码真实引用**,PRD 与实现不一致时那本身就是要暴露的事。
  "GET /api/quests/state": "PRD §9.11c.2(⚠️ PRD 写的是 /api/quests/weekly,实现用 state,已交底 U-16)",
  "POST /api/quests/{questCode}/claim": "TBD-NAME: 周任务按 questCode 原子领取的服务端权威命令;后端已实现,PRD §9.11c.2 待同步资源形状",
  // 2026-08-13 对齐轮补登(逐个回源核实过:5 个在 src/api 下都有真实现,不是笔误也不是虚构)
  "/api/app/wallet/sandbox": "NOT-PRD: 沙箱资金档的钱包面,PRD 未定义;仅在 fundsSandboxEnabled 档可达",
  "/api/orders": "PRD §9.11d(单品下单;组合购尚无整单定价契约,见 bundle.vue 注释)",
  "/api/devices/earnings": "TBD-NAME: 设备收益投影,PRD 未单列章节",
  "/api/product/phase": "BACKEND: AppCanonicalBoundaryController#getProductPhase 已实现;前端 PRD 待同步",
  "GET /api/product/phase": "BACKEND: AppCanonicalBoundaryController#getProductPhase 已实现;前端 PRD 待同步",
  "/api/app/network/rank": "BACKEND: AppNetworkRankController 已实现;当前账号排名投影,前端 PRD 待同步",
  "/api/app/security/account-deletion/cancel": "BACKEND: AppUserSecurityController 已实现;账号注销取消命令,前端 PRD 待同步",
  "/api/app/trade-in/eligibility": "BACKEND: AppTradeinController 已实现;置换资格权威检查,前端 PRD 待同步",
  "/api/device/:param/deactivate-after-task": "BACKEND: AppCanonicalBoundaryController 已实现;设备任务后停用命令,前端 PRD 待同步",
  "/api/events/:param/spin/state": "BACKEND: AppGrowthEngagementController 已实现;活动转盘状态读取,前端 PRD 待同步",
  "/api/genesis/points": "BACKEND: AppGenesisPointsController 已实现;创世积分投影,前端 PRD 待同步",
  "/api/orders/:param/cancel": "BACKEND: AppOrderCommandController 已实现;订单取消命令,前端 PRD 待同步",
  "/api/app/deposits/vietqr/receipts": "BACKEND: AppVietQrIntentController 已实现;VietQR 回执读取,前端 PRD 待同步",
  "/api/public/referrals/:param/preview": "BACKEND: PublicSponsorPreviewController 已实现;公开推荐预览,前端 PRD 待同步",
  "/api/storefront/activity": "BACKEND: AppStorefrontActivityController 已实现;商城活动流,前端 PRD 待同步",
  "/api/storefront/products/:param/social-proof": "BACKEND: AppStorefrontActivityController 已实现;商品社会证明快照,前端 PRD 待同步",
  // (这里原有第二条 `/api/config/phone-tiers`: "TBD-NAME: …PRD 未单列章节" —— 它既是重复键,
  //  又**与事实相反**:PRD §6.10 与 §13.3 参数表都点名了这个 endpoint。因为排在后面,它
  //  **静默覆盖**了上方那条正确的 PRD 引用,于是台账对外报的是错的出处。已删。)
  "POST /api/faucet/sign-in": "PRD §11.12",
  "POST /api/nex/sign-in": "TBD-NAME: PRD 用 POST /api/faucet/sign-in;本处为旧候选名,接后台时以 faucet 为准",
  "POST /api/me/milestones/:id/claim": "PRD §11.3a",

  // ── events / lucky spin ───────────────────────────────────────────────
  "GET /api/events": "PRD §9.11c.2",
  "POST /api/events/:id/spin": "PRD §11.10.9",
  "POST /api/events/:id/join": "PRD §11.10.7",
  "POST /api/events/:id/claim": "PRD §11.10.7",

  // ── devices / heartbeat / onboarding ──────────────────────────────────
  "POST /api/device/:id/heartbeat": "PRD §6.11 / §12.2(PRD 原文标『endpoint TBD,候选名』)",
  "GET /api/devices/eligibility": "PRD §7.5.1",
  "POST /api/devices/deactivate": "PRD §9.11c.1(composer endpoints,PRD 原文标 TBD; candidates)",
  "/api/gate/logout": "NOT-PRD: 退役 prototype 的 Next middleware reviewer-cookie 路由,uni 端已弃用(非 PROD 契约)",
  "GET /api/onboarding/calibrate/result": "PRD §12.2",
  "GET /api/users/me": "PRD §12.2",

  // ── social / network / misc ───────────────────────────────────────────
  "POST /api/share/event": "PRD §11.9",
  "POST /api/sponsorship/bind": "PRD §9.11e",
  "GET /api/platform/stats": "PRD §5.5",
  // FEAT-HOME02:排名派生目前是 client 纯函数(lib/network-rank.ts),真后台接管后
  // 由本端点返回同一套结果。前端 PRD 尚无该条目 —— 实现批次收口时随 nexion-prd-sync 补。
  "GET /api/platform/rank": "TBD-NAME: FEAT-HOME02 排名派生;规格已签字,PRD 条目待收口时补",
  "GET /api/leaderboard": "PRD §8.11.3",
  "GET /api/config/exchange/caps": "PRD §9.11c.1",
  "POST /api/exchange/swap": "PRD §9.4.3",
  "POST /api/admin/exchange/pause": "PRD §9.11d",
  "GET /api/network/members": "PRD §8.7",
  "GET /api/network/regions": "PRD §11.6",
  "GET /api/pool/state": "PRD §8.5.2",
  "GET /api/server-time": "PRD §9.11a.4",
  "GET /api/market": "TBD-NAME: 与 §10.3 `/api/market/nex` 是同一个平台牌价,重复候选名;注释应改指 /api/market/nex",
  // 🗑 2026-08-13 删除 `/api/market/nex`(原出处 PRD §10.3 WebSocket 推送):
  //   代码注释里已无该引用 —— 回源确认是 c37e642 / 82d4f51 两笔服务端权威化改造里去掉的,
  //   不是笔误也不是被误删。台账只反映**代码真实引用**,留着过期条目会让本门变成只增不减的垃圾场。
  "GET /api/market/tokens": "PRD §11.9.3",
  "GET /api/admin/platform/phase-config": "PRD §9.11d",
  "PUT /api/admin/tradein/config": "NOT-PRD: PRD 未定义置换配置写接口(admin 侧,候选名)",

  // ══ 代码面收编(2026-08-13,卡 2)══════════════════════════════════════
  // 本门原来只扫注释,于是 src/api/*.ts 里**真发出去的 77 个地址**一条都没进过台账。
  // 下面按「逐条回根 PRD 搜、搜得到才写 §、搜不到一律 TBD 并写明为什么」补齐。
  // 🔴 只有 7 条在前端 PRD 里找得到 —— 这不是登记工作没做完,这是**实情**:
  //    绝大多数是后端对接批次引入的契约,前端 PRD 至今没同步。TBD 就是要让这件事一直可见。
  // ⚠️ 路径参数段一律写 `:param`(与代码里的 `${…}` 判等,见 canonicalPath)。

  // ── /api/app/* 契约族 ────────────────────────────────────────────────
  // 后端对接批次引入的 app 作用域前缀,前端 PRD 成文早于它,整族都没有条目。
  // 这一族**不要**逐条去 PRD 找 —— 找不到不是漏搜,是 PRD 还没写。
  "/api/app/home/overview": "TBD-NAME: BACKEND AppHomeOverviewController 已实现;/api/app/* 族首页权威投影(app-home-api.fetch;app store refreshRemoteFleet 每次刷完舰队取一次,喂首页收益区间与 on-grid 面);前端 PRD 待同步",
  "/api/app/proof": "TBD-NAME: BACKEND AppProofController 已实现;/api/app/* 族战绩/收益证明权威投影(proof-api.snapshot:活跃天数 / 在线设备 / 百分位 / 累计收益 / 邀请与团队计数);前端 PRD 待同步",
  "/api/app/security": "TBD-NAME: /api/app/* 后端契约族(账号安全读),前端 PRD 未定义",
  "/api/app/security/password": "TBD-NAME: 同上(改密)",
  "/api/app/security/two-factor": "TBD-NAME: 同上(两步验证开关)",
  "/api/app/security/sessions/:param/revoke": "TBD-NAME: 同上(踢单个会话);另见 PRD §4.7 的 /api/account/sessions/:id/revoke —— 两个候选名并存,接线时以后端为准",
  "/api/app/security/sessions/revoke-others": "TBD-NAME: 同上(踢其余会话)",
  "/api/app/analytics/events": "NOT-PRD: /api/app/* 族,行为埋点上报;PRD 未定义埋点接口",
  "/api/app/trade-in/config": "TBD-NAME: /api/app/* 族;概念见 PRD §7.5.1(置换),但该路径 PRD 未定义",
  "/api/app/trade-in/quote": "TBD-NAME: 同上(报价)",
  "/api/app/trade-in/capacity-quote": "TBD-NAME: 同上(容量位报价)",
  "/api/app/trade-in/capacity-replace": "TBD-NAME: 同上(容量位置换)",
  "/api/app/trade-in/submit": "TBD-NAME: 同上(提交置换单)",
  "/api/app/team/ambassador-applications": "TBD-NAME: /api/app/* 族,推广大使申请的用户自助资源;前端 PRD 待同步",
  "/api/app/team/insights": "TBD-NAME: /api/app/* 族,当前账号团队榜单/佣金/领导池权威投影;前端 PRD 待同步",
  "/api/app/team/network": "TBD-NAME: /api/app/* 族,当前账号团队网络权威投影;前端 PRD 待同步",
  "/api/app/team/quota": "TBD-NAME: BACKEND AppTeamQuotaController 已实现;/api/app/* 族硬件配额解锁的服务端快照(team-quota-api.snapshot:达标事实 + 逐档 productId);概念见 PRD §8.9(那里定义的是页面路由 /team/quota),该 API 路径待同步",
  "/api/app/network/regions": "TBD-NAME: /api/app/* 族,当前账号网络地域权威投影;前端 PRD 待同步",
  "/api/app/compute-share/enrollments": "TBD-NAME: /api/app/* 族,算力共享接入申请与列表资源;前端 PRD 待同步",
  "/api/app/compute-share/enrollments/:param": "TBD-NAME: 同上(单条接入申请读回)",
  "/api/app/developer/access-requests": "TBD-NAME: /api/app/* 族,开发者访问申请资源;前端 PRD 待同步",
  "/api/app/developer/access-requests/latest": "TBD-NAME: 同上(当前账号最近申请读回)",
  "/api/app/wallet/bills": "TBD-NAME: /api/app/* 族,生产钱包账单权威投影;概念见 PRD §9.3,该路径待同步",
  "/api/app/wallet/sandbox/topups": "NOT-PRD: /api/app/* 族,沙箱资金档专用;仅 fundsSandboxEnabled 档可达",
  "/api/app/wallet/sandbox/withdrawals": "NOT-PRD: 同上",
  "/api/app/wallet/sandbox/orders/:param/callbacks": "NOT-PRD: 同上(沙箱回调注入)",
  "/api/app/janus/reports": "NOT-PRD: /api/app/* 族,Janus 双面 demo 专用,前端 PRD 不覆盖该工程",
  "/api/app/janus/commands/pending": "NOT-PRD: 同上",
  "/api/app/janus/commands/ack": "NOT-PRD: 同上",
  "/api/app/janus/takeover/progress": "NOT-PRD: 同上",
  "/api/app/payments/config": "TBD-NAME: /api/app/* 族,支付通道配置;PAY 规格未定义 API 层",
  "/api/app/payments/fx-quote": "TBD-NAME: 同上(汇率报价)",
  "/api/app/deposits/vietqr/intents": "TBD-NAME: /api/app/* 族,越南 VietQR 入金;概念见 PRD §9.2.8,该路径未定义",
  "/api/app/deposits/vietqr/intents/:param": "TBD-NAME: 同上(单据回查)",
  "/api/app/deposits/vietqr/intents/:param/cancel": "TBD-NAME: 同上(取消)",
  "/api/app/support/acceptance/projection": "TBD-NAME: /api/app/* 族,客服受理投影",
  "/api/app/support/acceptance": "TBD-NAME: 同上(受理)",
  "/api/device/:param/deactivate": "TBD-NAME: 设备实例停用命令;后端 E3 用户设备契约已实现,前端 PRD 待同步",
  "/api/app/support": "TBD-NAME: 同上(工单读写)",
  "/api/app/support/faqs": "TBD-NAME: 同上(FAQ)",
  "/api/app/referral-rewards": "TBD-NAME: /api/app/* 族,推荐奖励发放面;另有 /api/config/referral-rewards 读配置",

  // ── PRD 里找得到的(7 条,逐条核过原文不是正则假命中)──────────────
  "/api/devices/activate": "PRD §9.11d.2(server enforce 活跃槽位上限,client 限制纯 UI)",
  "/api/config/task-pricing": "PRD §9.11c.1(Task pricing 表 server 下发)",
  "/api/genesis/state": "PRD §9.11c.1(供应 / 单价 / 排放比例)",
  "/api/notifications": "PRD §11.2.4(分页拉取,支持按优先级过滤)",
  "/api/notifications/:param/read": "PRD §11.2.4(原文写作 /api/notifications/:id/read)",
  "/api/legal/risk-disclosure/current": "PRD §9.11d.1(按 jurisdiction 返 {version, body})",
  "/api/points/sign-in": "APP规格 §4.6 积分域(每日签到,server roll lucky multiplier)",

  // ── 其余:PRD 搜不到,逐条写明为什么 ─────────────────────────────────
  "/api/team/binary": "TBD-NAME: 双轨团队读;PRD §8 有业务规则但未定义该端点",
// ── 2026-08-14 并入远端主线(9db1d5d)带来的新端点 ────────────────────
  // 同事那批(Nova AI 客服 / 用户自助资料 / 注销账号 / 里程碑评估)。逐条回根 PRD 核过。
  "/api/app/profile": "PRD §11.0B(个人资料:整页无自由文本输入,昵称走预置候选)",
  "/api/app/profile/nickname-candidates": "PRD §11.0B(昵称预置词库构造器,唯一改名路径 = 候选挑选)",
  "/api/app/profile/avatar": "PRD §11.0B(头像)",
  "/api/app/security/account-deletion": "PRD §4.5a(账号注销:余额与锁仓本金均不退、在途提现禁止提交、数据留存 1 个月;主人 2026-08-14 拍板)",
  "/api/app/support/ai/status": "TBD-NAME: Nova AI 顾问可用性探测(实现在 nova-ai-api.ts)。功能见 PRD §11.0A Nova AI 顾问系统 + §11.8.4 统一会话中心,仅端点未点名",
  "/api/app/support/ai/chat": "TBD-NAME: 同上(会话);⚠️ 早先误记为「§11.8 客服域无 AI 章节」——归错域了,它属 Nova 不属人工客服",
  "/api/earnings/milestones/evaluate": "TBD-NAME: 里程碑达成评估;PRD §11.3a 定义了里程碑庆祝但未定义该评估端点",
  "/api/team/rank": "TBD-NAME: 团队等级读;同上",
  "/api/tasks/route": "TBD-NAME: 按显存派发任务路由;PRD §6.8 有容量概念,未定义该端点",
  "/api/tasks/assignments": "TBD-NAME: 任务派单读;PRD 未定义",
  "/api/tasks/assignments/claim": "TBD-NAME: 同上(领取)",
  "/api/tasks/assignments/:param/complete": "TBD-NAME: 同上(完成)",
  // 🔴 裸 /api/exchange ≠ PRD 的 /api/exchange/swap(§9.4.3)。回源核过:PRD 只定义了
  //    带 /swap 的那条,裸路径全 PRD 零命中。**别把它当成 §9.4.3 登记** —— 那是假引用。
  "/api/exchange": "TBD-NAME: 兑换单读/建;PRD §9.4.3 只定义了 POST /api/exchange/swap,裸路径未定义",
  "/api/exchange/:param/cancel": "NOT-PRD: 🔴 死路径 —— wallet-exchange.vue 定义了 cancelRemoteOrder() 并在里面调本端点,但**没有任何东西调 cancelRemoteOrder**(模板无绑定、全文件仅定义处一处命中),用户点不到。与本轮开头删掉的卡时代早购镜像同型,只深一层。⚠️ 服务端仍可能把单据置为 CANCELLED(到期等),页面的 CANCELLED 展示是合法的——死的只是「客户端发起撤销」这条路。立卡见 docs/changes/2026-08-14-card-dead-exchange-cancel.md",
  "/api/genesis/account": "TBD-NAME: 创世账户读;PRD 未定义",
  "/api/genesis/purchase": "TBD-NAME: 创世购买;PRD 未定义该路径(§10.1 有业务规则)",
  "/api/genesis/holdings/:param/listing": "TBD-NAME: 创世持仓挂单/撤单;概念见 PRD §10.2.4,路径未定义",
  "/api/genesis/listings/:param/buy": "TBD-NAME: 创世二级买入;同上",
  "/api/content/i18n": "TBD-NAME: 三语文案下发;PRD 未定义",
  "/api/content/learning/courses": "PRD §11.11.1(教程中心课程列表 + 进度汇总)",
  "/api/content/learning/courses/:param": "PRD §11.11.2(课程详情与测验)",
  "/api/content/learning/courses/:param/start": "PRD §11.11.2(打开课程即绑定该版本)",
  "/api/content/learning/courses/:param/quiz": "PRD §11.11.2(提交测验,携版本号 + 幂等键)",
  "/api/content/learning/courses/:param/quiz/receipts/:param": "PRD §11.11.2(提交结果未知时的回执回查)",
  "/api/content/learning/courses/:param/complete": "PRD §11.11.2(无题课程的完成动作)",
  "/api/content/trust/sections/current": "TBD-NAME: 信任板块内容下发;PRD 未定义",
  "/api/content/trust/sections/:param/view": "TBD-NAME: 同上(曝光回报)",
  "/api/config/market/nex": "TBD-NAME: NEX 牌价配置;与 §11.9.3 的 /api/market/tokens 是不同端点",
  "/api/config/referral-rewards": "TBD-NAME: 推荐奖励配置读;PRD §9.11c.1 未列该条",
  "/api/config/repurchase": "TBD-NAME: 复购配置读;PRD §9.11c.1 未列该条",
  "/api/notifications/read-all": "TBD-NAME: 全部已读;PRD §11.2.4 只定义了单条已读",
  "/api/notifications/read": "TBD-NAME: 批量已读;同上",
  "/api/notifications/:param/actions": "TBD-NAME: 通知内联动作;PRD 未定义",
  "/api/payment-methods": "TBD-NAME: 支付方式列表;PRD §9.10 是绑卡域,该路径未定义",
  "/api/payment-methods/bind": "TBD-NAME: 同上(绑定)",
  "/api/payment-methods/:param/unbind": "TBD-NAME: BACKEND AppPaymentMethodController 已实现;支付方式解绑命令带幂等键 + expectedVersion 乐观并发,回执 CARD_UNBOUND;PRD §9.10 为绑卡域但未定义该路径,待同步",
  "/api/payment-methods/:param/default": "TBD-NAME: BACKEND AppPaymentMethodController 已实现;默认支付方式命令带幂等键 + expectedVersion 乐观并发,回执 CARD_DEFAULT_SET;PRD §9.10 为绑卡域但未定义该路径,待同步",
  "/api/payout-addresses/otp/send": "TBD-NAME: 换绑收款地址的验证码;与已登记的 /api/payout-addresses 同族",
  "/api/points/state": "TBD-NAME: 积分状态读;APP规格只列了 sign-in",
  "/api/points/milestones/:param/claim": "TBD-NAME: 积分里程碑领奖;PRD §11.3a 是 /api/me/milestones/:id/claim,两个候选名并存",
  "/api/points/streak-saver/use": "TBD-NAME: 连签补签卡;PRD 未定义",
  "/api/points/power-ups/:param/activate": "TBD-NAME: 积分道具激活;PRD 未定义",
  "/api/quests/:param/claim": "TBD-NAME: 周任务领奖(questApi.claim);与已登记的 /api/quests/state 同族,见交接书 U-16",
  "/api/repurchase/orders": "TBD-NAME: 复购单读/建;PRD 未定义",
  "/api/repurchase/orders/:param/claim": "TBD-NAME: 同上(领取)",
  "/api/repurchase/orders/:param/early-withdraw": "TBD-NAME: 同上(提前赎回)",
  "/api/legal/risk-disclosure/acknowledgment": "TBD-NAME: 风险披露确认回写;PRD §9.11d.1 只定义了读端点",
  "/api/legal/risk-disclosure/gates/:param/check": "TBD-NAME: BACKEND AppRiskDisclosureController 已实现;高敏动作前的披露闸校验(risk-disclosure-api.checkGate;提现与质押在用户确认之后、建单之前各调一次,幂等键复用为 operationId);PRD §9.11d.1 定义了读端点、§11.4a 定义了披露页与服务端权威确认态,该闸路径待同步",
  "/api/withdrawals/attempts/:param/abandon": "当前文档: PC 管理端开发落地规格 §3 API D2; PRD v2 当前状态合同（提现未知结果核验与放弃 COMPLETE）",
  // 🔴 /api/stakes/* 与已登记的 /api/staking/* 是**同一批业务的两个路径名**,谁是真的没定论。
  //    交接书 U-2 已就此问后端。在他们回话之前,两边都按代码真实引用登记 —— 台账反映实情,
  //    不反映我们希望的样子。
  "/api/stakes": "TBD-NAME: 与 PRD 的 /api/staking 路径名冲突,见交接书 U-2(客户端 4 处用 stakes)",
  "/api/stakes/:param/claim": "TBD-NAME: 同上;PRD 写的是 POST /api/staking/:id/claim",
  "/api/stakes/:param/early-withdraw": "TBD-NAME: 同上",
};

// ── 扫描 ────────────────────────────────────────────────────────────────
const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (EXT.has(extname(e.name))) files.push(p);
  }
})(join(ROOT, SCAN_DIRS[0]));

/**
 * 标出每一行是不是注释。**必须带块状态**:Vue SFC 顶部的 `<!-- … -->` 和 JSDoc
 * `/* … *\/` 的**续行**没有任何前缀,只按行首前缀匹配会整片漏掉(2026-08-04 实测
 * rewards.vue 的 `GET /api/me/bills` 就是这么漏的)。
 */
function markCommentLines(lines) {
  const out = new Array(lines.length).fill(false);
  let inBlock = false; // /* */
  let inHtml = false; // <!-- -->
  lines.forEach((line, i) => {
    if (inBlock || inHtml) {
      out[i] = true;
      if (inBlock && line.includes("*/")) inBlock = false;
      if (inHtml && line.includes("-->")) inHtml = false;
      return;
    }
    if (/^\s*\/\//.test(line) || /\S\s+\/\/\s/.test(line)) out[i] = true;
    if (line.includes("/*")) {
      out[i] = true;
      if (!line.includes("*/")) inBlock = true;
    }
    if (line.includes("<!--")) {
      out[i] = true;
      if (!line.includes("-->")) inHtml = true;
    }
  });
  return out;
}
/** `.` 不进路径 —— 注释里常跟字段访问(`…/tradein.promo.routes`);`,` 进,因为
 *  PRD 自己用 `{register,login}` 这种花括号并列写法 */
const CITE = /(?:\b(GET|POST|PUT|PATCH|DELETE)\s+)?(\/api\/[A-Za-z0-9_:{},*|/?=&…-]*)/g;

/**
 * 归一:去 query string(台账登记的是 endpoint,不是每种调用变体)、去句读尾巴、
 * 去尾斜杠;必须还剩至少一个 segment —— 挡掉注释换行截断出来的裸 `/api/`。
 */
function normalizePath(raw) {
  const p = raw
    .replace(/\?.*$/, "")
    .replace(/[,.;:)]+$/, "")
    .replace(/\/+$/, "");
  return /^\/api\/[A-Za-z{]/.test(p) ? p : null;
}

/**
 * 🔴 2026-08-13 起本门有**两个**扫描面。
 *
 * 只扫注释是原设计的盲区,而且是个大洞:`src/api/*.ts` 里真正发出去的地址全是
 * **代码字符串**(`path: "/api/x"` / `` `/api/x/${id}` ``),一条都不在注释里。
 * 实测该盲区下有 80 个端点从没进过台账 —— 其中一个是已被 PRD 改名的卡时代旧端点,
 * 它零调用地躺在接口层近两周,本门一次都没响(见 docs/changes/
 * 2026-08-13-trial-early-buy-adjudication.md 卡 2)。
 *
 * 注释面(`found`)判「写对没写对」;代码面(`wired`)判「真发出去的地址有没有据」。
 * 两面**共用同一本台账** —— 分两本必然各自漂。
 */
const found = new Map(); // 注释面:token(含 method)→ [{file, line}]
const wired = new Map(); // 代码面:canonical path → [{file, line}]

/** 代码字符串里的地址:单/双引号 + 模板串(模板串必须扫,插值形态占了一大半)。 */
const WIRE = /(["'`])(\/api\/(?:\\.|(?!\1)[^\\])*)\1/g;

/**
 * 归一到「路径骨架」:去 query、去尾斜杠,**任何参数段一律折成 `:param`** ——
 * 代码侧写 `${encodeURIComponent(id)}`、台账侧写 `:id` / `:userId`,指的是同一个位置。
 * 不折的话两边永远对不上,台账就得为每种写法各存一条,那是在给自己造漂移源。
 */
function canonicalPath(raw) {
  const bare = raw.replace(/\?.*$/, "").replace(/\/+$/, "");
  return bare
    .split("/")
    .map((seg) => (seg.includes("${") || seg.startsWith(":") ? ":param" : seg))
    .join("/");
}

/**
 * 代码面**跳过测试文件**:契约测试里会把路径参数写成固定夹具值
 * (`…/courses/h3-live-20260722/quiz`),那是同一个端点的一个样本,不是新契约。
 * 登记它们等于把夹具 id 焊进台账,夹具一改台账就过期。
 * ⚠️ 注释面不跳过 —— 测试里的注释同样可能写错接口地址。
 * ⚠️ 跳过数会打进 PASS 行,**不许静默增长**。
 */
const isTestFile = (rel) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
let wireSkippedFiles = 0;

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  const skipWire = isTestFile(rel);
  if (skipWire) wireSkippedFiles++;
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  const isComment = markCommentLines(lines);
  lines.forEach((line, i) => {
    if (skipWire && !isComment[i]) return;
    if (isComment[i]) {
      for (const m of line.matchAll(CITE)) {
        const p = normalizePath(m[2]);
        if (!p) continue;
        const token = (m[1] ? `${m[1]} ` : "") + p;
        if (!found.has(token)) found.set(token, []);
        found.get(token).push({ file: rel, line: i + 1 });
      }
      return;
    }
    for (const m of line.matchAll(WIRE)) {
      const p = canonicalPath(m[2]);
      if (!/^\/api\/[A-Za-z:]/.test(p)) continue;
      if (!wired.has(p)) wired.set(p, []);
      wired.get(p).push({ file: rel, line: i + 1 });
    }
  });
}

/** 台账 key(可能带 method)→ 路径骨架,供代码面比对。 */
const ledgerSkeletons = new Set(
  Object.keys(LEDGER).map((k) => canonicalPath(k.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, ""))),
);

if (process.argv.includes("--dump")) {
  console.log("── 注释面 ──");
  for (const [t, locs] of [...found.entries()].sort()) {
    console.log(`${String(locs.length).padStart(3)}  ${t}${LEDGER[t] ? "" : "   <<< NOT IN LEDGER"}`);
    if (!LEDGER[t]) locs.forEach((l) => console.log(`       ${l.file}:${l.line}`));
  }
  console.log("── 代码面(真发出去的地址)──");
  for (const [p, locs] of [...wired.entries()].sort()) {
    console.log(`${String(locs.length).padStart(3)}  ${p}${ledgerSkeletons.has(p) ? "" : "   <<< NOT IN LEDGER"}`);
    if (!ledgerSkeletons.has(p)) locs.forEach((l) => console.log(`       ${l.file}:${l.line}`));
  }
  process.exit(0);
}

const totalCitations = [...found.values()].reduce((s, v) => s + v.length, 0);
const totalWired = [...wired.values()].reduce((s, v) => s + v.length, 0);
const unregistered = [...found.entries()].filter(([t]) => !LEDGER[t]);
const unregisteredWired = [...wired.entries()].filter(([p]) => !ledgerSkeletons.has(p));
// 台账条目「还活着」= 注释面按 token 命中,**或**代码面按路径骨架命中。
// 只看注释面会把「只在代码里发、没写注释」的条目误判成过期条目。
const orphanLedger = Object.keys(LEDGER).filter(
  (t) => !found.has(t) && !wired.has(canonicalPath(t.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, ""))),
);

const fail = [];
// ③ 判据失效兜底:一条都没扫到 = 正则 / 路径写错了,空集全过是假绿。
//    两个扫描面**各判各的** —— 合起来判的话,注释面还有命中就能把代码面整个瞎掉盖住。
if (totalCitations === 0) {
  fail.push(
    `注释面扫描 0 命中 —— 判据失效(扫了 ${files.length} 个文件却一条 /api/ 注释引用都没找到)。` +
      `先修扫描逻辑,别把空集当通过。`,
  );
}
if (totalWired === 0) {
  fail.push(
    `代码面扫描 0 命中 —— 判据失效(扫了 ${files.length} 个文件却一个 "/api/..." 字符串都没找到,` +
      `而 src/api/ 下每个客户端都在发请求)。先修 WIRE 正则,别把空集当通过。`,
  );
}
// ① 注释里有、台账里没有
for (const [t, locs] of unregistered) {
  fail.push(
    `未登记的接口引用 \`${t}\`(注释面 ${locs.length} 处):\n` +
      locs.map((l) => `      ${l.file}:${l.line}`).join("\n") +
      `\n      → 与前端 PRD 核对后加进 scripts/endpoint-citation-sentinel.mjs 的 LEDGER,` +
      `并注明 "PRD §X.Y" 或 "TBD: <原因>";PRD 没有的接口注释侧必须写明 TBD / 候选,不许当既定契约。`,
  );
}
// ①' 代码里真在发、台账里没有
for (const [p, locs] of unregisteredWired) {
  fail.push(
    `未登记的接口调用 \`${p}\`(代码面 ${locs.length} 处):\n` +
      locs.map((l) => `      ${l.file}:${l.line}`).join("\n") +
      `\n      → 这是**真发出去的地址**,必须在 LEDGER 有据。与前端 PRD 核对后登记,` +
      `注明 "PRD §X.Y" 或 "TBD: <原因>"。路径参数段在台账里写 \`:name\`(与代码里的 \`\${…}\` 判等)。`,
  );
}
// ② 台账里有、两个面都没有
for (const t of orphanLedger) {
  fail.push(
    `台账条目 \`${t}\` 在注释与代码里都已不存在 —— 台账过期,请从 LEDGER 删除` +
      `(出处记录:${LEDGER[t]})。`,
  );
}

if (fail.length) {
  console.error("✗ endpoint-citation-sentinel FAIL");
  fail.forEach((m, i) => console.error(`  ${i + 1}. ${m}`));
  process.exit(1);
}

// 🔴 欠账要分类计数,不能只报一个「TBD N 条」。
//   2026-08-14 逐条核过 86 条 TBD 后发现它们根本不是一回事:
//     TBD-GAP  = 功能本身 PRD 没写(真产品缺口,要补 PRD 章节)
//     TBD-NAME = 功能 PRD 写了,只是没点名这个端点(台账的活,不是 PRD 的活)
//     NOT-PRD  = 基建 / 非本工程 / 沙箱 / 后台域 / 已退役(不该进前端产品 PRD)
//   混成一个数会得出「PRD 欠 86 条」这种错误结论,而真缺口只有个位数。
// 🔴 台账键自检:对象字面量的重复键**静默后者覆盖前者** —— tsc 不报、eslint 默认也不一定报,
// 于是同一个地址可以并存两条**自相矛盾**的出处,而对外生效的是排在后面的那条。
// 实测(2026-08-16)3 组重复,其中 `/api/config/phone-tiers` 生效的恰恰是错的那条
// (它写「PRD 未单列章节」,而 PRD §6.10 与 §13.3 参数表都点名了这个 endpoint)——
// 台账的**全部价值**就是「出处可信」,这种静默覆盖直接把它废掉,而且任何门都看不见。
// 判据:自读源码数**字面量**键,与运行时对象比对。
{
  const selfSrc = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const at = selfSrc.indexOf("const LEDGER = {");
  const end = at < 0 ? -1 : selfSrc.indexOf("\n};", at);
  // fail-closed:抠不出台账块 = 判据失效,判红(空集让全称判据恒真是本仓惯犯)
  const block = at >= 0 && end > at ? selfSrc.slice(at, end) : "";
  const literalKeys = [...block.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]);
  const dupes = [...new Set(literalKeys.filter((k, i) => literalKeys.indexOf(k) !== i))];
  const runtimeCount = Object.keys(LEDGER).length;
  if (!block || dupes.length || literalKeys.length < runtimeCount) {
    console.error("✗ endpoint-citation-sentinel FAIL — 台账键自检");
    if (!block) console.error("  抠不出 LEDGER 块 —— 判据失效,不静默放行");
    if (dupes.length) {
      console.error(`  重复键 ${dupes.length} 个(后者静默覆盖前者,可并存自相矛盾的出处):`);
      for (const k of dupes) console.error(`    ${k}`);
    }
    if (block && literalKeys.length < runtimeCount) {
      console.error(`  字面量键 ${literalKeys.length} < 运行时 ${runtimeCount} —— 抓键正则漏了,判据失真`);
    }
    process.exit(1);
  }
}

const kinds = { "TBD-GAP": 0, "TBD-NAME": 0, "NOT-PRD": 0 };
for (const v of Object.values(LEDGER)) {
  for (const k of Object.keys(kinds)) if (v.startsWith(`${k}:`)) kinds[k]++;
}
console.log(
  `✓ endpoint-citation-sentinel PASS — 注释面 ${totalCitations} 处 / ${found.size} 个去重地址,` +
    `代码面 ${totalWired} 处 / ${wired.size} 个去重地址(另跳过 ${wireSkippedFiles} 个测试文件的代码面),` +
    `全部在台账有据(扫描 ${files.length} 个源文件;台账 ${Object.keys(LEDGER).length} 条)。` +
    `\n  欠账分类:🔴 真产品缺口 ${kinds["TBD-GAP"]} 条(要补 PRD)· ` +
    `仅端点未点名 ${kinds["TBD-NAME"]} 条(台账的活)· ` +
    `不该进产品 PRD ${kinds["NOT-PRD"]} 条(基建/沙箱/后台域/已退役)`,
);
