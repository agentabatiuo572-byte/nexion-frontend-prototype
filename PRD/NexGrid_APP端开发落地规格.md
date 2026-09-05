# NexGrid 移动端 App — 开发落地规格(Dev-Ready Spec)

> **本文件是什么**:从 `NexGrid_产品功能架构设计文档_v3.7.md`(18 章 5053 行)提炼的**前端 app 开发落地契约速查**。源 PRD 回答「产品做什么、为什么」;本文件回答「建哪些页、定什么类型/store、调什么 API、算什么公式、状态怎么流转」——前端按本文件即可落地,产品背景再查源 PRD 对应 §锚点。
>
> **怎么用(按阶段)**:
> - 开工前必读 → **第 0 章 全局铁律**(贯穿全站的硬约束)+ **第 7 章 已知冲突 & 开发缺口**(源 PRD 内部矛盾 + TBD,落地前须收口单源)。
> - 建页 / 路由 → **第 1 章 页面路由总表**(功能视角)+ **第 6 章 §6.6 路由→文件映射**(脚手架视角)。
> - 定类型 / 状态管理 → **第 2 章 数据模型 / Store**。
> - 算收益/佣金/衰减/Trial → **第 3 章 业务规则 & 计算公式**(最关键,公式 1:1)。
> - 对接后端 → **第 4 章 API 契约总表**。
> - 状态流转 → **第 5 章 状态机集**。
> - 技术栈/i18n/非功能/KPI → **第 6 章**。
>
> **权威性**:本文件为提炼视图,每行带「§锚点」可回溯源 PRD;与源 PRD 冲突时以源 PRD 正文为准。源 PRD **内部数值自相矛盾**处(衰减率/Staking APY 等)已在第 7 章列出**单一真相源裁决**,开发以裁决为准、勿照抄多套。
>
> **语言**:中性语言;源 PRD 内部运营注释(漏斗/话术等)不进本规格。
>
> ---

## 第 0 章 全局铁律(前端实现前必读)

> 这 12 条贯穿全站。源 PRD §9.11d/e/f(防篡改/原子性/状态机权威)是其总纲。

### 0.1 server-canonical(client 仅 UI cache,绝不本地推进)
所有核心状态机(Trial/Order/Withdrawal/Staking/Device 激活/Commission/Genesis/Phase)、资金值、风控值 **server 唯一权威**;client 通过 `GET /api/{module}/:id` 或 SSE 订阅获取,**绝不本地推进**(§9.11f / §9.11d.2)。仅 Day-One Quest(引导)、Notification(UI 态)、Device 衰减展示数字可前端推进。

### 0.2 Idempotency-Key(所有 mutation 必带)
全部资金/状态 mutation 携 `Idempotency-Key` header(client mint UUIDv4,server dedup 24h):sign-in(login/otp-verify/password-reset)、trial start/redeem-early、staking open/claim/early-withdraw、wallet reinvest、withdrawals。**源 PRD 强调当前 client mutation 均无幂等,网络抖动 retry 会重复扣款/开仓**(§9.11e)。

### 0.3 ID 全 server mint
`Order / Withdrawal / Bill / Card tokenId / Genesis tokenId` 全部 server 生成,响应携带,client 不可本地 mint/枚举/撞 ID(§9.11d.2)。

### 0.4 资金不入余额铁律
**salvage credit(trade-in 残值)、trial shadow(购买前的试用收益)永不 `creditBalance`、不可提现**;salvage 仅作置换扣减项(`debitBalance(price − salvage)`),trial shadow 仅 UI display 不写 earnings/wallet/commission/lifetime/network/V级条件(§7.5.1 / §9.11.4)。

### 0.5 cumulativeDepositUsdt 单写源
**仅 `recordDeposit`(真实充值确认链路)写入**;earnings / salvage refund / KYC bonus / quest 奖励 / 复投均不得触达。它是 trade-in 资格硬门(Pro 需 ≥$1000 / Rack P1 需 ≥$5000)(§7.5 / §12.1)。

### 0.6 RNG server-canonical
Lucky Spin 转盘、签到 Lucky multiplier、NEX 价格曲线 全部 **server 裁决 + NODE_ENV guard**(生产剥离 client `Math.random`);client 不可知概率、不本地 roll(§9.11d.3 / §11.10.9)。`chargeFailRate` server-only,前端永不可知。

### 0.7 PAN/CVV 永不落地
完整卡号 / CVV 永不入 store / 永不入 localStorage;只存 PSP `tokenId / brand / last4 / expiry / holder`(§9.10)。

### 0.8 store 之间不互相 import
跨 store 派奖 / mutation 由 UI handler compose(如 trial redeem = `useApp.addDevice + activateDevice + creditBalance`),store 不跨 import 防循环依赖(§12.2)。

### 0.9 localStorage 仅 UI cache 不持权威
身份 / 余额 / 风控 / 资格判定字段真后台对接时一律改「读 server 单源 + 失效自动重 fetch」;当前 client 常量仅未接入前 fallback(§16.2.4 / §9.11d.2)。

### 0.10 mounted-skeleton pattern(防 hydration)
persist-heavy 页(Exchange/Wallet/Bills/Staking/Commissions/Genesis 等)SSR 输出 skeleton,client mount 后渲染真内容;skeleton 用 `app/components/ui/skeleton.tsx`,且须含 verify.sh 期望的关键文案(token 符号/页面 title)(§17.5)。

### 0.11 跨 store mutation 原子 + 防双击
trade-in/replace composer 等跨 store 操作:任一步失败全 rollback(设备数组+余额+bill 回调用前)+ `confirmingRef` 防双击;主动购买/取消激活(有任务)/提现前 risk gate 必经二次确认(§7.5.3 / §9.11e)。

### 0.12 PRD-no-UI + 数值冲突收口
本规格**不含视觉数值**(px/字号/颜色,归设计 SKILL)。源 PRD **内部数值自相矛盾**处开发**勿照抄多套**,以第 7 章裁决为单一真相源:
- **设备月 9-12 衰减率 = −23.7%/月**(唯一能落到 22% floor;前端代码 device-lifecycle.ts 实际值)。源 PRD 旧 −10% 已**全源订正**(2026-06-05:v3.7 §11.4a/§9.11c + 12 月节奏表 §3.2/§6.1 + 后台 PRD v2 §E4)。
- **Staking APY 收敛到 `GET /api/config/staking/pools` 单源**(USDT 锁仓 12/35/80/180% 为准;withdraw 劝阻卡的第三套 5/12/20% 是 mismatch)。

## 第 1 章 页面路由总表(功能视角)

> 列:路由 / 页面 / 职责 / 数据依赖(store · API)/ 关键交互·状态 / §锚点。视觉数值按 PRD-no-UI 略去;文件路径见第 6 章 §6.6。候选 endpoint 标 TBD。

### 1.1 导航框架(§3)

| 路由 | 页面/组件 | 职责 | 数据依赖 | 关键交互·状态 | §锚点 |
|---|---|---|---|---|---|
| (全局壳) | IOSFrame chassis | 所有路由统一套 iOS 外壳(StatusBar/Header/Scroll/TabBar/HomeIndicator) | `useTheme`(persist `nexgrid-theme-v1`) | 默认 dark + SSR 直出防闪;tab vs sub-route 顶部留白不同 | §3.1 |
| (全局) | TabBar 5-tab | 底部主导航 Home/Earn/Store/Team/Me | 路由 active 态 | 仅 tab 路由显示 Header+TabBar | §3.2 |

### 1.2 账户与身份(§4)

| 路由 | 页面 | 职责 | 数据依赖 | 关键交互·状态 | §锚点 |
|---|---|---|---|---|---|
| `/register` | 注册 | 3 步验证码注册 | `POST /api/auth/otp/{send,verify}`;`sponsorship.bind`、`claimGift()` | OTP 满 6 位自动确认;成功 `addDevice("phone")`+跳 `/onboarding/estimator`;gift 仅一次 | §4.1 |
| `/login` | 登录(双模式) | password/OTP 登录 + reset 入口 | `POST /api/auth/login`、`/otp/*` | 双模式切换;`?ref` 静默绑定不发 gift;成功跳 `/` | §4.2 |
| `/login`(reset) | 忘记密码 | 3 步重置(手机→OTP→新密码) | `POST /api/auth/password/reset` | 逐步退栈;成功自动登录 | §4.2.3 |
| `/login/2fa` | 2FA challenge | 一因子后输 TOTP/recovery | `POST /api/auth/2fa/verify` | challenge 5min 过期;输错并入锁定计数 | §4.5.1 |
| `/ref/[code]` | 公开邀请落地页 | 展示 sponsor+gift+社会证明引导注册 | code hash→固定 sponsor | 主 CTA→`/register?ref`;次→`/login?ref` | §4.3.1 |
| `/me/security` | 安全设置 | 密码/2FA/sessions/删号/KYC 入口 | `/api/auth/password/change`、`/2fa/*`、`/sessions/*`、`DELETE /api/account` | 2FA step-up;recovery codes 生成下载;逐个/批量 revoke;删号二次确认 | §4.5 |
| `/me/security/kyc-express` | KYC-Express 说明 | 零基础说明降抗拒 | i18n `kycExpress.*` | CTA→`/me/wallet/topup?kyc=1` | §4.4.4 |
| `/onboarding/intro` | Onboarding 1 | Hero 价值主张(无 Skip) | `navigator.language` auto-detect | 主 CTA 进下一步;禁跳过 | §4.7.1 |
| `/onboarding/estimator` | Onboarding 2 | 手机 NPU 档→日收益基线+对比 | 设备 NPU 规格(详 §11) | 进 connect;L0→L1 | §4.7.2 |
| `/onboarding/connect` | Onboarding 3 | 12s 校准 3 阶段状态机+接单规则 | `POST /api/onboarding/calibrate/start`、`GET /result`(mock setTimeout 12s) | intro→calibrating→result;CTA→`/`;进 L1 | §4.7.3 |

### 1.3 Home Dashboard(`/`,§5;单页多卡,path 同 `/`)

| 组件(卡) | 职责 | 数据依赖 | §锚点 |
|---|---|---|---|
| GreetingHeader | 时间感知问候+手机今日收益 | `earnings` | §5.1 |
| EarningsHero(双引擎) | 今日总入账(设备 mining+团队佣金) | `earnings.today`+`useCommission.todayUSDT()`;`GET /api/me/earnings?range=today`(TBD) | §5.2 |
| BoostUpsell | Fleet-aware 4 slot 8s 轮换升级提示 | 用户 fleet | §5.3 |
| DeviceFleet | fleet 行+Add CTA | 用户 fleet | §5.4 |
| LiveNetworkJobs | 3 个正跑 AI 任务(5s 刷新) | mock 任务流 | §5.5 |
| RankProgressCard | V 级进度+实物奖钩 | V 级数据 | §5.6 |
| NexTokenCard | NEX 价+24h sparkline | `useMarket.klineHourly` | §5.7 |
| LeadershipPoolSnapshot | 本周池+预估分红(V3+) | 领导池数据 | §5.8 |
| QuickActions | Stake/Genesis/Daily 3 chip | staking/genesis/daily | §5.9 |
| LiveFeedCard | tab 切换两类社会证明 feed | mock 事件池 | §5.10 |
| EarningsLedger | 5 条最新收益 5.8s 推 | mock 收益流 | §5.11 |
| NetworkPulse | 2×2 metrics+sparkline | 网络 metrics | §5.12 |
| MathCard | phone vs S1 收益对比 | 常量 | §5.13 |
| TrustChipWall | 信任 chip 墙 | — | §5.14 |
| DayOneQuestCard | 3 phase 状态机新用户任务 | `useQuest`(persist v2)、`lib/mock/quest.ts`、`useAchievements`、`useStella` | active/grace/expired;6 任务路由型自动 markComplete;allDone claim 发 NEX+badge | §5.15 |

### 1.4 Earn(`/earn`,§6;单页多组件)

| 组件 | 职责 | 数据依赖 | 关键状态 | §锚点 |
|---|---|---|---|---|
| MyDevices | 已激活 fleet 详细卡(`activatedAt!==null`) | 设备 store、`lib/mock/tasks.ts` lockedTeaser | Pause/Resume/detail/取消激活;手机 mini「Unlock N more」→`/store` | §6.1 |
| TaskCenter | 当前+最近任务+升级解锁 teaser | `LockedTeaser.dailyPotentialUSD` | Upgrade 行展示 daily potential | §6.3 |
| EarningsOverview | 算力收益 range 统计(4-pill) | `GET /api/me/earnings?range=` | 4 range streaming;仅 compute | §6.4 |
| MarketOverview | AI Workload Price Index 6 模型 | market(1.6s tick) | — | §6.5 |
| MissedIncomeBanner | 手机 vs S1 上限差额 | 常量+`user.joinedAt`;SSR 守卫 | 整卡→`/store`;60s 上涨 | §6.6 |
| TaskLockCumulativeBanner | 高价任务 tier 月度累计锁定 | `lib/store/task-lock.ts`、`getLockedTeasers` | 整卡→`/store`或`/me/devices`;不暴露 phase 术语 | §6.7 |
| DeviceLifecycleBanner | 已购硬件衰减+月损失(degradable) | `lib/store/device-lifecycle.ts` | 整卡→`/me/devices`;60s 重算 | §6.8 |
| EmptySlotsHint | `/earn`→`/store` 核心转化(hero) | `selectActiveCount`、`derivePromoUpgrade`、MAX_DEVICES=6 | Active/Capped 两态(满槽不可点);CTA→`/store` | §6.2/§6.9 |

### 1.5 Store(§7)

| 路由 | 页面 | 职责 | 数据依赖 | 关键交互·状态 | §锚点 |
|---|---|---|---|---|---|
| `/store` | 商品列表 | 6 产品卡(双代际)+转化 hero | 产品目录(status/unlocksAtPhase/TRADEIN_UPGRADE_MAP)、`useProductPhase` | 已发布渲染卡/未发布聚合锁定卡;Buy→checkout | §7.1 |
| `/store/[productId]` | 商品详情 | 单品 ROI+信任+计算器+购买 | `useProductPhase()`;product.dailyEarn/sold/stock | phase 未达 post-mount 换 LockedCard;ROI Calculator 1-10 实时重算 | §7.2 |
| `/store/checkout` | 结账+Trade-in/Replace intercept | 7 步结账状态机+mount 拦截 | `useApp.orders/createOrder`、`useCards`、`useDeviceEligibility`、`useTradeinSheet` | 状态机 select-payment→…→live;Card 走 saved-cards;PAN/CVV 不持久;首单庆祝;成功→`/store/orders/[id]` | §7.3/§7.5.2 |
| `/store/orders` | 我的订单 | 4 阶段直通车列表 | `useApp.orders` | 结账即结算(初始 `paid`) | §7.4 |
| `/store/orders/[id]` | 订单详情 | 部署时间线+DC 信息 | `cancelOrder(id)`(仅 placed 有效);`GET /api/orders/:id` | 仅 placed 可取消;activated 自动 addDevice | §7.4 |
| `/store/bundle` | 套餐结算 | 多商品+阶梯折扣 | `useCart` persist | 折扣 2件5%/3件8%/4+件12% | §11.12.1 |
| `/tradein`·`/store/tradein` | (301 重定向→`/me/devices`) | 独立页已下线 | — | — | §7.5 |

**Trade-in 组件(无独立路由,挂载页面)**:TradeInOrFullChoiceSheet(checkout Path A)/ TradeInSheet(salvage 抵扣,原子,salvage 不入余额)/ ReplaceLowestSheet(Path B 槽满)/ PendingTaskBlockSheet(任务进行中)/ TradeInPromoBanner(`/me/devices` 顶部,server-canonical 配置)/ TradeinWindowBanner(`/store`,phase×legacy 双门控)。§7.5.1-§7.6

### 1.6 Team 团队中心(§8)

| 路由 | 页面 | 职责 | 数据依赖 | §锚点 |
|---|---|---|---|---|
| `/team` | 团队主页 | 汇总枢纽(ReferralHero/TeamLedger/5-track/Leaderboard preview) | `useCommission`、`useNetwork`、`useApp.wallet`、`useVRank`、`useProductPhase` | §8.1 |
| `/team/rank` | V 级头衔体系 | 13 阶 V 级阶梯+进度+实物奖领取 | `useVRank`、`nextRankProgress()`、`useAchievements` | §8.2 |
| `/team/unilevel` | 影响力网络版税 | Direct Royalty(固定 10%)+Network Yield Bonus | `UNILEVEL_USDT[1..7]`、`InfluenceScore`、Partner Status | §8.3 |
| `/team/binary` | 双轨平衡匹配 | Balance Match=`min(A,B)×10%` 日上限 $5K | `useNetwork.left/rightVolumeMonth()` | §8.4 |
| `/team/leadership-pool` | 全球领导奖池 | 周 5% 平台交易额按 V 票数分配(V3+) | V_VOTES、GLOBAL_V_DISTRIBUTION、周交易额 | §8.5 |
| `/team/commissions` | 6 类佣金流水 | 区分每笔到账渠道 | `useCommission.events`、`e.layer` | §8.6 |
| `/team/network` | 影响力网络 | 2 圈轨道可视化 | `useNetwork`(members+layer) | §8.7 |
| `/team/tree` | 族谱树 | Direct/Extended 二分类列表 | `useNetwork`、`UNILEVEL_USDT[layer]` | §8.8 |
| `/team/quota` | 硬件配额解锁 | 邀请数/团队业绩解锁高阶设备 | 邀请数、团队月业绩、月库存 | §8.9 |
| `/team/agent` | 区域大使 | V5+ 申请 4 项区域预算 | V 级、4 预算规则 | §8.10 |
| `/team/leaderboard` | 邀请排行榜 | Top 100 邀请人(4 周期奖池) | `PERIOD_PRIZE`、`PODIUM_PRIZE`、server snapshot(5min) | §8.11 |
| `/team/*/how-it-works` | 各玩法说明页 | rank/unilevel/binary/pool/commissions 零基础说明 | 静态 i18n | §8.x.3 |

### 1.7 Wallet 钱包系统(§9)

| 路由 | 页面 | 职责 | 数据依赖 | 关键交互·状态 | §锚点 |
|---|---|---|---|---|---|
| `/me/wallet` | 钱包总览 | iOS Settings 风资金导航 | `useApp.wallet`、`usePoints` | 3 action Top-up/Withdraw/Exchange | §9.1 |
| `/me/wallet/topup` | 充值 | 5 渠道(4 链上+1 法币) | 5 channel、PSP Checkout.com | **分流** CARD→CardPayForm/链上→DepositCard;`?kyc=1` | §9.2 |
| `/me/wallet/withdraw` | 提现 | 链上提现+积分门槛+风险 gate | `useApp.submitWithdrawal`、`usePoints`、`useRiskDisclosure`、`useProductPhase` | ≥$20;每$100 耗 10 积分;首次需 KYC;risk gate 前置;P5+ compliance banner | §9.3 |
| `/me/wallet/withdraw/tracking` | 提现追踪 | 5 状态进度 | submitted→…→confirmed | 每态时间戳+进度条 | §9.3.6 |
| `/me/wallet/exchange` | NEX↔USDT 兑换 | 双向兑换+三层风控 | `useExchange`、`useMarket`、三阈值 | 3 gate(kyc/user-cap/platform-cap);`?kyc=1` | §9.4 |
| `/me/wallet/repurchase` | 复投激励 | 引导重投得积分+锁仓 | `debitBalance`+`points.earn`+`stake(amount,90)` | 90 天锁仓;每$2=+1 积分 | §9.5 |
| `/me/wallet/premium` | Premium 订阅(P4+) | 月订阅权益 | `useProductPhase().premiumSubscriptionAvailable` | phase gate;P4+ 50% off 首月 | §9.5a |
| `/me/wallet/nex-v2-lock` | NEX v2 Vault(P6) | 24 月 NEX 锁仓(250% APY) | `useProductPhase().nexV2LockAvailable` | `matureValue=amount×6`;phase gate | §9.5b |
| `/staking` | Staking 4 档 | 30/90/180/365d 锁仓 | `useStaking`、`useApp.balance`、`useRiskDisclosure` | 利息 4s tick;Claim/Early withdraw;risk gate | §9.6 |
| `/me/wallet/bills` | 账单 | 按日期 group 流水 | `useApp` bills | 7 type(swap/topup/withdraw/earning/commission/refund/bonus) | §9.7 |
| `/daily` | 每日签到 | 签到积分+30 天里程碑+streak | `usePoints`、`useDailyPowerUp` persist | +1/日(连7+5);Lucky 15%×1.5/5%×2;里程碑 Claim;Saver 复活 | §9.8 |
| `/me/wallet/nex` | NEX 资产详情 | 持仓/估值/盈亏/用途 | `useApp`、`useMarket.tickPrice`、`useCommission` | PnL `costBasis=0.085`;入口→exchange/staking/repurchase/genesis | §9.9 |
| `/me/wallet/cards` | 我的银行卡 | 绑卡复用管理 | `useCards` persist、`useFreeTrial` | 解绑 confirm;试用卡解绑→挽留 sheet | §9.10 |
| `/me/wallet/cards/new` | 绑卡 | 绑新卡表单 | `detectBrand`(Luhn)、`useCards.bind` | `returnTo` 自动回跳;`?trial=1` 披露扣款 | §9.10 |
| `/me/trial` | 免费试用详情 | 绑卡式试用 S1 | `useFreeTrial`(7 态)、`useTrialConfig` | 状态机;早购必二次 confirm;取消入口移 `/me/devices` | §9.11 |

### 1.8 Genesis 创世节点(§10)

| 路由 | 页面 | 职责 | 数据依赖 | 关键交互·状态 | §锚点 |
|---|---|---|---|---|---|
| `/genesis` | 一级预售 | 限量 1000 张($9,999) | `useGenesis`(TOTAL_SLOTS/unitPrice/dividendShare)、`useApp.debitBalance` | Confirm sheet 数量±+费用拆解 | §10.1 |
| `/genesis/marketplace` | 二级市场 | 挂单/购买/二级交易 | `useGenesis.ownedTokenIds/purchase`、marketplace stats | Mine tab List=挂单入口;挂单+取消各二次 confirm;OpenSea modal | §10.2 |
| `/genesis/holder` | 持有人 Dashboard | 排放/权益/持仓/流动性(上所前额度+积分 / 上所后 NEX 排放) | `useGenesis.myOwned`、`dividendsOpen`、排放快照 | myOwned>0 完整态/===0 空态(不伪造) | §10.3 |
| `/genesis/how-it-works` | 玩法说明 | founder 股权+协议排放权益类比 | 静态 i18n | — | §10.1.3 |

### 1.9 扩展功能(§11)

| 路由 | 页面 | 职责 | 数据依赖 | §锚点 |
|---|---|---|---|---|
| `/me` | Me 主页 | 导航/摘要中心 | `useApp`、`useVRank`、`useAchievements` | §11.0 |
| (chassis 跨页) | Nova AI 顾问(代码名 stella) | 浮动 bubble+Drawer 聊天+auto-push+live-agent | `useStella`、`stella-cadence.ts` | §11.0A |
| `/me/devices` | 我的设备 | 全 inventory 管理(6 槽位) | `useApp.devices`、`activate/deactivateDevice`、`useDeactivateSheet`、`useFreeTrial` | §11.1 |
| `/me/notifications` | 通知中心 | 事件历史(6 filter) | `useNotifications`(priority 队列,200 cap) | §11.2 |
| `/trust`·`/trust/nex` | 信任中心+NEX 说明 | 14 section 合规+信任标识 | `useMarket.volume24h/circulating` | §11.3 |
| (chassis) | MilestoneWatcher | 收益里程碑被动庆祝 overlay | `useApp.earnings`、`useMilestones` persist | §11.3a |
| `/me/risk-disclosure` | 风险提示书 | 强制阅读+双 gate 确认 | `useRiskDisclosure` persist | §11.4a |
| `/me/achievements` | 成就系统 | 24 成就分类+领奖 | `useAchievements` | §11.4 |
| `/me/receipts` | 推理收据 | 每笔 AI 任务收据(PDF/explorer) | 任务完成数据 | §11.5.1 |
| `/me/proof` | Proof of Contribution | 社交分享卡(驱动 referral) | `useApp`、`useProfile`、`useVRank`、`usePoints`、`useNetwork` | §11.5.2 |
| `/globe` | 全球节点地图 | 28K 节点可视化 | 节点数据 | §11.6 |
| `/developer` | Developer API | 展示性 API 文档 | 静态 | §11.7 |
| `/me/help`·`/me/support`·`/me/support/tickets` | 帮助/客服/工单 | FAQ+渠道+1:1 工单 | `lib/mock/tickets.ts`(TicketStatus 5 态) | §11.8 |
| `/market` | NEX 行情详情 | NEX vs 同类 token 对标 | `useMarket`、`lib/mock/tokens.ts`(15) | §11.9 |
| `/events` | 活动中心 | 限时/邀请/抽奖活动(8 EventKind) | `lib/mock/events.ts`、`useEventQuest` | §11.10 |
| (`/events` sheet) | Lucky Spin 转盘 | wheel 玩法(8 档奖池) | `useLuckySpin`、`POST /api/events/:id/spin`(server RNG) | §11.10.9 |
| `/learn` | 教程中心 | Learn-to-Earn(15 课) | `lib/mock/learn.ts` | §11.11 |
| `/tx/[hash]` | 交易详情 | 伪 Etherscan(seeded PRNG) | `seeded(hashSeed)` | §11.12.2 |
| `/me/goals` | 收益目标 | 目标→推荐设备 tier | `useGoals` persist | §11.12.3 |
| `/me/wrapped` | 年度 Wrapped | 全屏 6 卡片 | `useApp`、`useCommission`、`useNetwork`、`useVRank` | §11.12.4 |
| `/me/preferences` | 偏好设置 | 音效/触感/通知 6 类 | `usePreferences` persist | §11.12.5 |
| `/search` | 全局搜索 | 全站搜索(实时过滤) | 静态路由+products+devices+members+FAQ | §11.12.6 |
| `/missions` | Mission Center | 聚合 5 处任务统一入口 | `useWeeklyQuest`、`useEventQuest`、`useMonthlyChallenge` | §11.13 |
| `not-found` | 404 | Nova 风 mascot | `app/not-found.tsx` | §11.12.9 |

> **代码标识符约定**:Nova 在 UI/文案称 "Nova",代码层全部保留 `stella`(`app/components/stella/*`、`useStella`、`mode==="stella"`、`/admin/stella/*`)。`/learn/[slug]` 课程详情本期未实装(href=`#`)。

## 第 2 章 数据模型 / Store(定义类型 + 状态管理)

> 全 store 为 zustand。权威源:server-canonical(SC,server 唯一真相)/ client-cache(最终须对账)/ 派生(不存储)。**PRD 未给具体字段形态的类型标「未定义形态」**(开发须补)。系统 store 在 `lib/store/`,业务 store 在 `lib/v3/`。

### 2.1 `useApp`(中心 store · `lib/store/index.ts`)— User/账户/Wallet/devices/orders
关键字段:`email` · `tier:enum{L0..L5}` · `joinedAt:ms-epoch`(驱动 phase 月段) · `referralCode` · `usdtBalance:number`(SC,仅 credit/debitBalance) · `nexBalance:number`(SC + 每 tick `+= incNEX` 滴灌,须对账) · `pendingEarnings` · **`cumulativeDepositUsdt`(SC,仅 recordDeposit 写;trade-in 资格门)** · `earnings:{today,thisWeek,thisMonth,total}`(server-computed,client 只渲染) · 平台 marketing stats(SSE 广播,不持权威)。
内嵌集合:`orders[]`(Order)、`bills[]`(client 只拉不写,§9.11d)、`withdrawals[]`(server mint id)、`devices[]`(见 2.2)。
actions:`creditNex/creditBalance/debitBalance/recordDeposit/creditDevice/submitWithdrawal/addBill/addDevice/activateDevice/deactivateDevice/scheduleDeactivation/replaceDevice/moveToInventory/recycleDevice/tick()`。**store 不跨 import,派奖由 UI compose**。§12.1-12.3

### 2.2 `Device`(`useApp.devices[]` · fleet+库存合一)— §12.2
`id`(server) · `kind:enum{phone,stellarbox-s1,stellarbox-pro,stellarrack-p1,cloud-share}` · `gpu` · `vramTotal/basePower` · `baseRate`/`baseRateNEX`(daily 基准) · `purchasedAt:ms-epoch`(驱动衰减) · **`activatedAt:number|null`(null=库存,number=在槽;解耦购买与激活)** · `pendingDeactivate?` · `generation:number`(1 原型/2 trade-in 升级) · `status:enum{online,offline}`(无 paused) · 运行态(gpuUsage/Temp/Power/vramUsed,tick 派生) · `currentTask`/`recentTasks`(形态未定义) · `todayEarnings/NEX` · phone 专属(heartbeat,client 只读)`batteryLevel/isCharging/isWifiConnected/thermalState/pausedReason/interruptedAt`。
selectors:`selectActiveDevices/InactiveDevices/ActiveCount/ActivePhone`、`derivePromoUpgrade(devices)`。不变量:`activateDevice` 守卫 `(active + trialReservesSlot?1:0) ≥ MAX_DEVICES(6)` 返 false;`activatedAt=null` 不计 earnings/task。

### 2.3 资金/收益域(业务 store · `lib/v3/`)
- **`useStaking`(USDT 锁仓)**:`positions[]{id,amountUSDT,termDays:enum{30,90,180,365},apy,startTs,unlockTs,status:enum{active,matured,early-withdrawn,claimed}}`;APY 权威 `GET /api/config/staking/pools`(30d12%/90d35%/180d80%/365d180%,penalty 5/15/30/50%);**⚠️ withdraw 页第三套 APY 是 mismatch,收敛单源**。另 NEX 池 APY 5/12/20/35% minStake 1k/5k/10k/20k。§12.6/§13.3.1
- **`useCommission`**:`events[]{id,kind:enum{unilevel,binary,peer,cultivation,leadership,genesis},sourceUserId,layer?(仅unilevel),amountUSDT,amountNEX,ts,unlockAt(=ts+30d),status:enum{cooling,unlocked,withdrawn}}`。§12.5
- **`useExchangeV3`**:`todayUserUsedUSD`(≤50)、`todayPlatformUsedUSD`(≤20,000)、`dayKey`、`lifetimeExchangedUSD`(≥100 触发 KYC)、`kycVerified`、`queue`(QueuedExchange 未定义形态)。SC。§12.10

### 2.4 设备/试用域
- **`useFreeTrial`**(persist `nexgrid-trial-v1`):`status:enum{idle,active,grace,extended,redeemed,failed,cancelled}` · `cardTokenId` · `startedAt/activeEndsAt/graceEndsAt/extendedEndsAt/scheduledChargeAt/finishedAt:ms-epoch|null` · `failReason` · `extensionGranted` · `shadowFrozenAtUSD/NEX`(grace 冻结,**永不入资金/统计**)。派生(不存):`liveShadowUSD/NEX(now)`、`remainingMs`、`isHighQualityEligible`、`computeDiscountedPrice`。§12.18
- **`useCards`**(persist `nexgrid-cards-v1`):`cards[]{tokenId(PSP,非 PAN),brand:enum{visa,mastercard,amex,unionpay,unknown},last4,expiry,holder,boundAt}` · `defaultTokenId`。🔴 PAN/CVV 永不入 store/localStorage。§12.17

### 2.5 团队/社交域
- **`useNetwork`**:`members[]{id,name,avatar,city,vRank(0-12),layer(1-7),binary:enum{left,right},isSpillover,joinedAt,monthVolumeUSD,totalVolumeUSD,status,sponsorId?}`。V-Rank 升级判定派生(`lib/v3/v-rank.ts`),**server 可在 client 显示 100% 时 reject**。§12.4
- **`useSponsorship`**:`sponsorCode`(URL `?ref`+server,first-wins **不可补绑**) · `sponsor{name,vRank,title,city,downlines}` · `giftClaimed` · `boundAt`。§12.8

### 2.6 资产/二级市场域
- **`useGenesis`**(persist `nexgrid-genesis` v2):`totalSlots(1000)` · `soldSlots` · `myOwned`(migrate:`myOwned>ownedTokenIds.length` 按 soldSlots 倒推回填) · `ownedTokenIds:number[]` · `myListings[]{tokenId,askPriceUSDT,listedAt}` · `unitPriceUSDT(9999)`。actions:`purchase/listNode/cancelListing/fulfillSale`。persist version:2+migrate。§12.7

### 2.7 通知域
- **`useNotifications`**:`items[]{id,kind:enum{commission,team,staking,market,genesis,system},title,body?,ctaLabel?,ctaHref?,ts,readAt:number|null}`,cap 200。§12.9

### 2.8 任务/激励/签到域(均独立 persist)
| Store | 关键字段 | persist key | 不变量 | § |
|---|---|---|---|---|
| `useQuest` | `completed:QuestTaskId[]`·`claimedFinal`·`startedAt` | `nexgrid-quest-v1` | 24h 窗(86,400,000);claimFinal +500 NEX+badge | §12.11 |
| `usePoints` | `points(def8)`·`history[](50 ring)`·`lastSignedInAt`·`signInStreak`·`longestStreak`·`streakSavers(def1)`·`claimedMilestones[]` | `nexgrid-points` | `pointsRequiredFor=ceil(usdt/10)`;断签 48h;Saver 恢复 ≤min(longest,30) | §12.12 |
| `useWeeklyQuest` | `weekKey`·`tier1Completed/Claimed`·`tier2Completed/Claimed[]`·`bonusClaimed` | `nexgrid-weekly-quest-v1` | `rollWeekIfStale` 跨周清 | §12.13 |
| `useMonthlyChallenge` | `monthKey`·`claimedIds:ChallengeId[]` | `nexgrid-monthly-challenge-v1` | `rollMonthIfStale` 跨月清(基于 joinedAt 月数分段) | §12.14 |
| `useEventQuest` | `joined[]`·`claimed[]`·`joinedAt:Record` | `nexgrid-event-quest-v1` | 仅 trackable 持久化;claim→creditNex+achievements | §12.15 |
| `useDailyPowerUp` | `claimed:StreakPowerUpId[]`·`claimedAt:Record` | `nexgrid-daily-powerup-v1` | unlock 派生自 signInStreak 不持久化 | §12.16 |
| `useLuckySpin` | `bonusTickets`·`lastFreeSpinDate(UTC)`·`history[](20)`·`realPrizeSoldOut/coverageDegraded`(镜像) | `nexgrid-lucky-spin-v1` | 会话态不持久;真实奖须 server RNG+三护栏;按 UTC 日桶 | §12.19 |
| `useMilestones` | `firedIds`(部分未定义) | `nexgrid-milestones-v1` | 刷新不重触发;一次 fire 一档 | §11.3a |
| `useAchievements` | 未定义形态(`unlock(badgeId)`+实物奖 queue) | 未定义 key | 实物奖 V≥1 首达发 1 次 | §12.16 |

### 2.9 偏好/购物/目标/合规域
`useCart`(`items:string[]`,`nexgrid-cart-v1`)/ `useGoals`(`Goal[]` 形态未详,`nexgrid-goals-v1`)/ `usePreferences`(sound·haptics·6×NotifKind mute,`nexgrid-preferences-v1`)/ `useRiskDisclosure`(`accepted`·`acceptedAt`,`nexgrid-risk-disclosure-v1`,首次提现/staking/NEXv2 前 gate)/ `useProductPhaseOverride`(`pinned`,`nexgrid-product-phase-override-v1`,**6 phase×8 dial,server 权威 `GET /api/admin/platform/phase-config`,UI 永不暴露 phase id**)。

### 2.10 开发须补类型(PRD 未定义形态)
`CurrentTask`、`CompletedTask`(§12.2)、`QueuedExchange`(§12.10)、`Bill`(仅 `addBill` action)、`Withdrawal`(仅 `submitWithdrawal`)、`Achievement`(§12.16)、`Goal`(§11.12.3)。**多数业务 store 的 persist key PRD 未明示**(仅 §12.7+ 激励类给出)。

## 第 3 章 业务规则 & 计算公式(供精确实现;公式 1:1 取自源 PRD)

> ⚠️ 标注处为源 PRD 内部数值冲突,以第 7 章裁决为单一真相源。

### 3.A 设备收益(Earnings Tick)— §13.1
- **USDT/tick**:`incUSDT = baseRate × lifeEff × marketMult × variation × tickMs / ONE_DAY_MS`(累加 `todayEarnings`);`ONE_DAY_MS=86,400,000`,tick 间隔 1.8s。
- **NEX/tick**:`incNEX = baseRateNEX × lifeEff × marketMult × variation × tickMs / ONE_DAY_MS`,且 `user.nexBalance += incNEX`(自动滴灌)。
- **marketMult** = `0.95 + random()×0.1`(0.95–1.05);**variation** = `0.85 + random()×0.3`(0.85–1.15);每 tick 重 roll。
- **lifeEff** = `isDegradable(kind) ? getEfficiency(getMonthsOwned(purchasedAt)) : 1`(phone/cloud-share 恒 1)。
- **annualRoiPct** = `round(dailyEarn × 365 / price × 100)`(单一派生,统一调用)。
- baseRateNEX 中点:phone 10/S1 65/Pro 215/Rack 950/Cloud 30。

### 3.B 设备衰减(Degradation)— §6.8/§13.3
- **getEfficiency(monthsOwned)** = `∏(1+rate)` 跨 stage 积分,floor 截断;`MIN_EFFICIENCY=0.22`。
- **月度衰减率**:月1-3 −4%/月 · 月4-8 −6%/月 · **月9-12+ −23.7%/月**(`{early:-0.04,middle:-0.06,late:-0.237}`);累计 100%→88.5%→65.1%→~22%。**⚠️ 第7章#1:−23.7% 为准,−10% 是 stale**。
- **isDegradable** = `kind ∉ {phone,cloud-share}`;**getMonthsOwned** = `(now−purchasedAt)/ONE_MONTH_MS`(`ONE_MONTH_MS=30×ONE_DAY_MS`)。
- **月损失** = `(dailyRateAtFull − dailyRateNow) × 30`。

### 3.C 团队佣金(6 类)— §8.3/§8.4/§8.5/§8.6
- **Direct Royalty** = `Σ(L1 直推月订单额) × 10%`(固定 10%=`UNILEVEL_USDT[1]`,不随 Partner Status 变);实时,30d 冷却。
- **Network Yield Bonus** = `Σ(扩展各层订单额 × UNILEVEL_USDT[layer]) × InfluenceScore`(取 L2-L7);`UNILEVEL_USDT[1..7]=[10%,5%,3%,2%,1%,0.5%,0.5%]`。
- **InfluenceScore** = `clamp(1 + log10(monthlyNetworkVolume/100), 1.0, 5.0)`。
- **NEX 双币版税**:每笔订单按 `UNILEVEL_NEX[1..7]=[50,20,10,5,2.5,1,1]` NEX/$ 派。
- **Balance Match(双轨)** = `min(A,B) × 10%`,日上限 `binaryDailyCapUSD`(默认 $5,000,phase 派发);**门槛**:Track A≥$1,000 且 B≥$1,000 才领否则当月归零;`A/B=left/rightVolumeMonth()` 遍历 members 累加 `monthVolumeUSD`。
- **Peer 平级奖** = 同 V 级团员业绩 × 5%(仅 V≥3);月结。
- **Cultivation 培育奖**(下属升 V 一次性 NEX):V1 500/V2 2,000/V3 10,000/V4 50,000/V5 200,000 NEX。
- **Leadership Pool**:周池 = 平台周交易额 × 5%;`用户分红 = 周池 × (用户票数/全网总票数)`;V3+ 解锁;周一 00:00 UTC 开池/周日 23:59 快照。
- **票数权重**:V3=1,V4=2,V5=4,…V12=512(每升一级翻倍)。
- **佣金冷却**:unilevel+binary 提现冷却 30 天(P5/P6 拉长至 45d)。

### 3.D V 级升等(V-Rank)— §8.2/§13.2
- **升级进度** = `avg(每条件 min(1, have/required))`(client preview,server 二次判定权威)。
- **13 阶条件**:V1 自买≥$299+直推3 · V2 团队$5K · V3 $20K+2×V1 · V4 $50K+3×V2 · V5 $150K+4×V3 · V6 $500K+5×V4 · V7 $1M+6×V5 · V8 $3M+7×V6 · V9 $10M · V10 $30M · V11 $100M · V12 $500M。
- **扩展版税覆盖度**:V0 仅直推 … V9 直推+9度 · V10 无限 0.5% · V11 无限 1% · V12 无限 1.5%。
- **primaryGap**:取 `progress=have/required` 比例最远 blocker(非 raw remaining)。
- **条件计入**:selfBuyUSD 仅本人下单(复投/兑换/赠送不计,退款扣);directRefs 注册+KYC 去重;teamVolumeUSD L1-L7 累加;vDownlines ≥Vn 直推数。

### 3.E 免费试用(Trial — Model A 抵扣)— §9.11a.2/§9.11b
- **试用收益抵扣** = `computeTrialOffset = min(shadow, trialOffsetCapUSD)`;`trialOffsetCapUSD=50`(购前只抵扣,超出购后入余额)。
- **auto-charge 实付** = `trialPriceUSD − min(shadow, trialOffsetCapUSD)`(**全价,无早购促销**);`remainderUSD` 购后入余额;`trialPriceUSD=1299`,`chargeFailRate=0.01`(server-only),grace/extended 到期 server-cron 触发。
- **早购实付** = `trialPriceUSD − 早购促销 − min(shadow,cap)`;早购促销 = `min(trialPriceUSD × discountRate, discountCapUSD)`;`discountRate=0.15`,`discountCapUSD=20`;**必二次确认弹窗**。
- **shadow 累积**:`shadow += shadowDailyUSD/NEX`(active 累加,grace 冻结 snapshot);`shadowDailyUSD=38.52`,`shadowDailyNEX=65`;仅 UI display 不入账。
- **高质量延长触发**:`shadowFrozenAtUSD ≥ highQualityThresholdUSD(100)`。
- **周期**:`trialDays=3`→`graceDays=7`→`extensionDays=3`(start 时 snapshot)。
- **终态**:failed/cancelled → shadow 归零不入账;终态后 `cooldownDays=30` cooldown(`canStart()=false`)。

### 3.F 平台运营阶段(Phase Dial — 后台引擎,UI 不暴露)— §13.4
- **当前 phase** = `useProductPhaseOverride.pinned ?? getPhaseForMonth(getMonthsSince(joinedAt))`。
- **月段**:P1 0-2月/P2 2-4/P3 4-6/P4 6-8/P5 8-10/P6 10+。
- **7 时变 dial**:`inviteBonusMultiplier`(P1=2.0/P2=1.5/P3+=1.0)· `withdrawalPointsPer100`(P1-4=10/P5-6=20)· `withdrawalCooldownDays`(P1-4=30d/P5-6=45d)· `binaryDailyCapUSD`(P1-3=$5000/P4-6=$2000)· `premiumSubscriptionAvailable`(P4+)· `nexV2LockAvailable`(P6)· `complianceHoldEnabled`(P5+)。
- **约束**:server 权威(pages 不 hardcode 门槛);phase id/name 永不在用户 UI 出现。

### 3.G NEX↔USDT 兑换 — §9.4.2
- **汇率**:`1 NEX = $0.171`(实时,可 refresh)。
- **用户日 cap** ≤ `USER_DAILY_CAP_USD=50`(00:00 UTC 重置,超进次日队列)。
- **平台日 cap** ≤ `PLATFORM_DAILY_CAP_USD=20,000`(满即排队)。
- **KYC 触发**:累计兑换 ≥ `KYC_LIFETIME_THRESHOLD_USD=100` lifetime 且未 KYC → 阻断引导 KYC。

### 3.H 积分/签到/里程碑 — §9.8/§13.3
- **提现积分门槛** = `pointsRequiredFor(usd) = ceil(usd/10)`(每 $100 耗 10 积分,P5/P6=20)。
- **积分来源**:签到 +1/连7天 +5;复投 +50/$100;邀请激活 +20;新手任务 +5。
- **Lucky multiplier**:签到时 15% 概率 ×1.5,5% 概率 ×2(server roll,不在 render)。
- **Streak 中断**:`now − lastSignedInAt > 48h` 重置 0;**Saver 恢复** 消耗 1 张 → `signInStreak = min(longestStreak, 30)`。
- **签到里程碑梯度**:Day 3 +5积分/7 +15积分/14 +1 USDT/21 +100 NEX/30 Lucky Spin×1/60 +10 USDT/100 NFT badge。
- **收益里程碑(被动)**:lifetime 跨阈自动 fire+入账 NEX:$100→+100/$500→+250/$1,000→+500/$5,000→+1,500/$10,000→+3,000;4s tick watcher,一次一档 cascade。

### 3.I Staking/锁仓/复投 — §9.6/§13.3.1
- **到期值(simple interest)** = `amount × (1 + APY × days/365)`。
- **USDT 锁仓 APY/penalty**:30d 12%/5% · 90d 35%/15% · 180d 80%/30% · 365d 180%/50%。
- **NEX 池 APY/minStake**:30d 5%/1,000 · 90d 12%/5,000 · 180d 20%/10,000 · 365d 35%/20,000 NEX。
- **提前赎回**:forfeit 全部累计利息 + 扣本金罚款(上表 penalty)。
- **复投**:本金+利息(staking APY)+积分(+50/$100)+培育奖 ×1.5+Genesis 抽奖券;早赎罚本金 15%+利息/积分/券全 forfeit;presets $100/200/500/1000,锁 90 天。
- **NEX v2 Founders**:`matureValue = amount × (1 + 2.50 × 24/12) = amount × 6`;`LOCK_MONTHS=24`、`APY=2.5`、`MIN=1000`;早赎 forfeit 100% premium;P6 解锁。
- **Premium**:月费 $99(50% off 首月);P4+ 解锁。
- **⚠️ 第7章#2:Staking APY 三套并存,收敛 `GET /api/config/staking/pools`**。

### 3.J Genesis 节点(排放/一级/二级)— §10.1.1/§10.3.3
- **单节点排放参考等值** = `platformDailyVolumeUSD × 0.1% / 1000`(0.1% 池÷1,000 张);基数 ~$24M → ~$24/node/日等值(上所后 NEX 排放,参考非保证;上所前不派发,由 `dividendsOpen`/H1 `genesisDivOpen` 门控)。保底口径(节点价 × 0.1% ≈ $10/node/日)挂后台负债科目#4。
- **一级预售**:限量 1,000 张,单价 $9,999;回本 `$9,999 / dailyDividend ≈ 14 个月`。
- **二级版税**:卖家成交扣 2.5%(进网络金库);二级地板 $25,000(mock)。
- holder lifetime(mock)= `todayShare × 142`;pending payout = `todayShare × 0.8`。

### 3.K NEX 代币市场(P&L)— §9 NEX 页
- **持仓 P&L** = `nexBalance × nexPrice − nexBalance × costBasis`;`costBasis=0.085`(day-0),current `$0.171`。
- **NEX 价格曲线**:每 tick `isPump` 概率触发,幅度 ±3%;`isPump=0.08`;**server canonical,client 不本地 roll**。

### 3.L 商城/结账/Trade-in — §7
- **ROI 组(详情页)**:daily=`dailyEarn×qty`;monthly=`daily×30`;annual=`daily×365`;paybackDays=`round(totalPrice/daily)`;year1Net=`annual−totalPrice`;cumulative[i]=`daily×30×(i+1)`(i∈0-11);breakEvenMonth=`ceil(paybackDays/30)`。
- **卡支付总额** = `price × 1.035`(卡费 3.5%);链上 = `price`。
- **Trade-in 残值** = `price × rate(ageMonths)`;`rate(t) = max(floor, baseline − monthlyDecay × t)`;`baseline=0.30`、`monthlyDecay=0.025`、`floor=0`;**`minHoldingMonths=1`(ageMonths<1 返 0 防套利)**;**salvage 不入余额**。
- **Trade-in 抵扣定额**(`TRADEIN_UPGRADE_MAP`):S1/Pro→Pro v2 抵 $300;Rack P1→Rack P2 抵 $800。
- **Trade-in 资格**:Pro 需 `cumulativeDepositUsdt≥$1000`/Rack P1 需 ≥$5000(仅 recordDeposit 写)。
- **derivePromoUpgrade**:base=激活真实设备最高日产;target=`UPGRADE_LADDER`(phone→S1→Pro→Rack P1)下一档;`multiplier=round(targetDaily/baseDaily)`。
- **空槽潜在日产** = `empty × promo.targetDaily`;`fleetCurrentDaily = Σ activeDevices.baseRate`。
- **LiveSocialProof**:Viewing=`24 + FNV-1a(productId)%92`;Sold24h=`max(8, sold×0.024)`;Sold30m=`max(1, sold24h×0.022)`。

### 3.M 任务/Quest/激活 — §6/§5.15/§13.3
- **锁定任务日潜在** = `(86400/avgSec) × QUEUE_SATURATION × avgReward`;`QUEUE_SATURATION=0.35`。
- **月度任务锁定** = `MONTHLY_LOCKED_TASK_USD[phase] × monthProgress` + 历史累加;`MONTHLY_LOCKED_TASK_USD`:P1-2 $40/P3-4 $140/P5-6 $450。
- **首日任务最终奖**:全 6 任务 → +500 NEX(`QUEST_FINAL_BONUS_NEX`)+`day_one_hero` badge;`QUEST_WINDOW_MS=86,400,000`(24h)/grace 至 72h。
- **首日 6 任务单项**:bind_bank_card +50/visit_earn +30/visit_store +50/...(§5.15.4)。
- **Quest 层最大奖**:L1 Daily 100 NEX(streak +500)/L2 Weekly 3,000/L3 Monthly 10,000+勋章。
- **Lucky Spin**:每日免费 1 次(UTC 日桶,`eventId×userId×spinDate` 计次)+Day-30 里程碑券;8 档 server RNG,概率和 100%;真实奖三护栏+兑付红线自动降级。
- **设备激活槽位守卫**:`activateDevice()` 守卫 `激活数 < MAX_DEVICES=6`(试用预留计入)。
- **任务中断宽限**:`INTERRUPT_GRACE_MS=30,000`(30s)、`INTERRUPT_MAX_RETRIES=5`(每 6s);窗口内续跑原任务,超时取消派新。

### 3.N 礼包/常量 — §13.3/§8.1.1
- **注册礼包**:邀请人 +$200+200 NEX;被邀人 200 NEX welcome(首次设备配对触发);单次真实结算 `WELCOME_GIFT_USDT=5`、`WELCOME_GIFT_NEX=200`、`REWARD_USDT=1`。
- **Partner Status**:Standard $0+/Verified $5K+/Premium $50K+/Diamond $500K+(仅权益不改费率)。
- **KYC 提现 cap**:未 KYC $100 → KYC 后 $50K;+10 积分。
- **提现限制**:日 1 笔,余额 80% max,首次 48h hold(KYC 后当日)。
- **通知容量** 200 条;**Mock 启动余额** $24,856.56;**Nova ambient** 30-60min cooldown/channel。

## 第 4 章 API 契约总表(前后端对接)

> 源 PRD 反复声明 endpoint 为「真后台对接候选命名」(TBD)。**横切**(§9.11d/e/f):server 是状态机唯一权威,client 仅 UI cache;所有 mutation 携 `Idempotency-Key`(UUIDv4,dedup 24h);ID server mint;client 仅订阅不本地推进。下表「IK」=须携 Idempotency-Key。

### 4.1 认证/身份(§4)
| Endpoint | Method | 用途 | 权威/IK | §锚点 |
|---|---|---|---|---|
| `/api/auth/login` | POST | 密码登录(原子 create session+bind sponsor) | IK | §4.2.5 |
| `/api/auth/otp/{send,verify}` | POST | 发码/验码登录注册 | server TTL+试次;client 仅正则 | §4.2.5 |
| `/api/auth/password/reset` | POST | 忘记密码完成 | IK;成功失效其他 session | §4.6.5 |
| `/api/auth/password/change` | POST | 修改密码 | 失效其他 session | §4.6.5 |
| `/api/auth/refresh` | POST | access token 静默刷新+rotate refresh | 失败→强制登出 | §4.5.2 |
| `/api/auth/logout` · `/sessions/:id/revoke` · `/sessions/revoke-others` | POST | 登出/撤销 session | revocation list | §4.5.2 |
| `/api/auth/2fa/{enroll,confirm,verify,disable,regenerate-codes}` | POST | 2FA 全流程 | 真实 2FA 态在 session claim(防伪造) | §4.5.1 |
| `DELETE /api/account` | DELETE | 注销账户 | server 清记录 | §4.5 |
| `/api/sponsorship/bind` | POST | 绑 sponsor(反多账户三层检测,first-wins) | gift 按 userId.created 幂等 | §9.11e.1 |
| `/api/kyc/status` | GET | KYC 状态单源(提现 endpoint 二次 enforce) | SC | §9.11d.2 |
| `/api/onboarding/calibrate/{start,result}` | POST/GET | 算力校准(benchmark+ping,长轮询/SSE) | SC;mock setTimeout 12s | §4.7.3 |

### 4.2 设备(§12.2)
| Endpoint | Method | 用途 | 权威/IK | §锚点 |
|---|---|---|---|---|
| `/api/device/:id/heartbeat` | POST | 上报 `{isCharging,isWifiConnected,batteryLevel,thermalState}`→`pausedReason` | server ping 校验+决 eligibility;client 仅 mirror | §12.2 |
| `/api/devices/activate` | POST | 激活占槽 | server enforce slot cap | §9.11d.2 |
| `/api/devices/{recycle,replace,deactivate}` | POST | Trade-in 回收/替换/移库存(原子) | TBD;替代 client composer | §9.11c.1 |

### 4.3 钱包/账单/提现(§9)
| Endpoint | Method | 用途 | 权威/IK | §锚点 |
|---|---|---|---|---|
| `/api/bills?cursor=` | GET | 拉账单(唯一账本,client 不写) | SC;Bill ID server | §9.11d.2 |
| `/api/wallet/topup` | POST | 充值写入(PSP webhook→写 bill+更 cumulativeDepositUsdt) | TBD | §9.11c.1 |
| `/api/wallet/reinvest` | POST | 复投(原子 debit/points/stake/bill) | IK | §9.11e |
| `/api/withdrawals` | POST | 提交提现(原子 spend points/debit/queue) | IK;返 withdrawalId;失败态全 server | §9.11e/f |
| `/api/users/me` · `/me.cumulativeDepositUsdt` | GET | 用户档案/累计充值(trade-in 资格源) | SC(仅 recordDeposit 写) | §9.11c.1 |

### 4.4 Staking(§9.6)
| Endpoint | Method | 用途 | 权威/IK | §锚点 |
|---|---|---|---|---|
| `/api/staking/open` | POST | 开仓(原子 debit/create/bill) | IK;status union 全 server | §9.11e/f |
| `/api/staking/:id/claim` · `/early-withdraw` | POST | 领取/提前赎回(原子) | IK | §9.11e |

> **⚠️ 开发缺口**:NEX↔USDT swap 执行 endpoint 源 PRD 未命名(§9.4 有 UI+风控但无 `/api/...` swap 提交路径)→ 须补。

### 4.5 免费试用(§9.11a.2)
| Endpoint | Method | 用途 | 权威/IK | §锚点 |
|---|---|---|---|---|
| `/api/trial/eligibility` | GET | 能否开新试用(单源,防重置无限领) | SC | §9.11d.2 |
| `/api/trial/state` | GET | 试用完整 state(polling/SSE) | SC,client 仅 cache | §9.11a.3 |
| `/api/trial/start` | POST | 开通(原子含 PSP auth,server 生成时间戳) | IK | §9.11a.2 |
| `/api/trial/redeem-early` | POST | 主动早购(返价格拆解供二次确认) | IK | §9.11a.2 |
| `/api/trial/charge` | POST | 到期 auto-charge(**server-internal cron**) | `chargeFailRate` server-only;client 经 SSE 观察 | §9.11d.3 |
| `/api/trial/cancel` | POST | 取消(`{reason:unbind\|explicit}`,30d cooldown) | unbind 触发 card revocation | §9.11a.2 |
| `/api/trial/extension` | POST | 接受/拒绝高质量延长 | decline 置 extensionGranted 防循环 | §9.11a.2 |

### 4.6 银行卡(§9.10)/ 积分(§9.8)/ 收益(§5.2/§6.4)
| Endpoint | Method | 用途 | 权威/IK | §锚点 |
|---|---|---|---|---|
| `/api/cards` | GET | 列已绑卡(只 cache 显示字段) | — | §9.10 |
| `/api/cards/tokens` | POST | PSP tokenization(`{pan,expiry,cvv,holder}`→`{tokenId,brand,last4}`) | **client 永不见 PAN/CVV** | §9.10 |
| `/api/cards/:tokenId` · `/:tokenId/default` | DELETE/PUT | 解绑(trial 卡须先 cancel)/设默认 | SC | §9.10 |
| `/api/points/sign-in` | POST | 每日签到(返 lucky multiplier) | server roll | §9.11d.3 |
| `/api/me/earnings?range={today\|week\|month\|all}` | GET | 多 range 收益聚合(today=设备+今日佣金) | SC,4 range 独立算 | §5.2 |

### 4.7 配置参数(运营常调,client GET 读 seed;全 server-canonical,client 常量仅 fallback)— §9.11c.1
`/api/config/commission/rates`(L1-L7 费率)· `/commission/cooling-days`(30d)· `/v-ranks`(13 级阶梯)· `/leadership-pool`(周金额+vote weight)· **`/staking/pools`(APY/penalty/min,收敛三套打架单源)** · `/exchange/caps`(三阈值)· `/task-pricing`(6 类+QUEUE_SATURATION)· `/products/specs`(baseRate/baseRateNEX/price 全表)· `/lifecycle`(衰减曲线+MIN_EFFICIENCY)· `/sponsorship`(welcome gift)· `/milestones`(5 档)· `/premium` · `/nex-v2-lock` · `/tradein`(salvage/minHoldingMonths/eligibility/promo,TBD)· `/wallet/withdraw-limits` · `/cart/bundle-discount` · `/quest/day-one` · `/genesis/state`(TOTAL_SLOTS/unitPrice/dailyDividendShare)· `/users/me/promo-dismissals`(TBD)。

### 4.8 实时流(SSE/WS,client 仅订阅)
`/api/genesis/marketplace/stats`(SSE,floor/vol/listed/owners)· `/api/market/nex`(WS,price+曲线,**server canonical 不本地 roll**)· `/api/platform/stats`(SSE,marketing hero)· `/api/me/earnings/stream`(SSE,today 增量,TBD)· `/api/notifications/stream`(SSE,priority 升级,client 不 PATCH)· `/api/stella/config-invalidate`(SSE,Nova cadence 变更,TBD)。

### 4.9 通知/活动/任务(内容池,client GET)— §11
`/api/notifications?cursor=&priority=`(LIFO cap 仅 UI 窗口非权威)· `/api/notifications/:id/read` · `/api/events?status=&region=`(8 类)· **`/api/events/:id/spin`(POST,Lucky Spin server RNG+三护栏+兑付红线降级)** · `/api/quests/weekly?weekKey=` · `/api/quests/monthly`。

### 4.10 Admin endpoint(app 不直接调,但控制 app 行为/同源,对接须一并实现)
- **Trial 管理**:`/api/admin/trial/{config,sessions,sessions/:userId,sessions/:userId/cancel,sessions/:userId/charge,kpi,open|close}`。
- **Kill-switch**(§9.11d.1):`/api/admin/staking/pool/:id/disable` · `/genesis/pause`(+geo_block)· `/exchange/pause` · `/nex-v2-lock/disable` · `/premium/disable` · `/trial/{open|close}`。
- **Phase 引擎**:`/api/admin/platform/phase-config`(8 dials×6 phases+user bucket override)。
- **Nova cadence/内容**:`/api/admin/stella/cadence-config`(10 channel,TBD)· `/admin/stella/{channels,templates,social-event-pool}` · `/admin/home/conversion-banner.copy` · `/admin/trial/copy` · `/admin/legal/risk-disclosure`(per-jurisdiction,re-ack 双维)· `/admin/onboarding/quest-tasks` · `/i18n/{namespace}`。
> `?dev=1` URL override 与 `useProductPhaseOverride` 生产环境须 server-side role check + build strip(§16.2.3)。

### 4.11 横切约定(对接必读)
1. **携 IK**(§9.11e):login/otp-verify/password-reset、trial start/redeem-early、staking open/claim/early-withdraw、wallet reinvest、withdrawals。源 PRD 强调当前 client mutation 全无幂等,retry 会重复扣款/开仓。
2. **client 仅订阅不本地推进**(§9.11f/d.2):全 SSE/WS;`/api/trial/state`、`/api/bills`、所有状态机 `GET /:id`;通知升级 server 推 client 不 PATCH。
3. **server 单源 ID**:Order/Withdrawal/Bill/Card tokenId 全 server mint。
4. **状态机缺失态须 server 扩展**(§9.11f):Order +`payment_failed/expired/refunded/chargeback/provisioning_failed`;Withdrawal +`review-rejected/address-invalid/tx-failed/tx-orphaned/refunded/frozen`;Staking 改 status union。
5. **全 endpoint 定性「留接口待真实后台对接」**(§9.11a),命名候选;详见第 7 章开发缺口。

## 第 5 章 状态机集(合法转移 + 守卫)

> 总纲(§9.11f):server 唯一权威,client 经 `GET /:id` 或 SSE 订阅,**绝不本地推进**(除标注 client 可推进者)。

### 5.1 FreeTrial 免费试用(§9.11.1,7 态)
状态:`idle/active/grace/extended/redeemed(终)/failed(终)/cancelled(终)`。
转移:`idle→active`(`startWithCard`,守卫 `canStart()`:非 cooldown+phaseOpen+有卡)/ `active→grace`(activeEndsAt 到期)/ `grace→extended`(`shadowFrozenAtUSD≥$100` 弹 sheet)/ `{grace,extended}→redeemed`(attemptCharge 成功 或 redeemEarly)/ `→failed`(扣款失败)/ `{active,grace,extended}→cancelled`/ 终态经 `cooldownDays=30`→可再申请。
约束:server 权威(时间/资格/推进/snapshot/PSP);redeemed 时 shadow 经 `computeTrialOffset` 拆 offsetUSD 抵购机款+remainderUSD 入余额+NEX 全额(snapshot 在 status 改前);failed/cancelled shadow 归零不入账;主动购买必二次确认。

### 5.2 Checkout 结账(§7.3,7 步页面态)
`select-payment→confirm→pay-instructions→awaiting→confirmed→activating→live`;链上 12s auto-detect/Card 提交 CVV;首单 confirmed 触发庆祝(`wasEmptyBeforeRef` 快照判定);**confirm→pay-instructions 不弹双确认**;PAN/CVV 永不持久;成功→`/store/orders/[id]`。

### 5.3 Order 订单(§7.4/§12.3)
已实现:`placed/paid(初始驻留)/provisioning/activated/cancelled`。**缺失态须 server 扩展**:`payment_failed/expired/refunded/chargeback/provisioning_failed`。
转移:`placed→paid→provisioning→activated`(机房托管无物流);`placed→cancelled`(**仅 placed 可自助 cancelOrder**,非 placed no-op);`activated` 自动 `addDevice+回填 deviceId`。约束:server mint id;`/refund` MC+IK 单事务联动 D1 退款+D4 冲正+cumulativeDepositUsdt 核减;GMV 以 paid 去重,payment_failed 不计。

### 5.4 Trade-in/Replace Sheet(§7.5,discriminated union 防双开)
`{kind: none|choice|tradein|replace|block}`。checkout mount 触发:canTradeIn→`choice`;否则 activeCount≥MAX→`replace`;否则 `none`。composer 原子链(失败 rollback)。4 不变量:M1 原子 · M2 salvage 不入余额(`debitBalance(price−salvage)` 唯一接触余额)· M3 `confirmingRef` 防双击 · M4 generation lineage(`(old.generation??1)+1`);残值守卫 `ageMonths<minHoldingMonths(1)→0`。

### 5.5 Withdrawal 提现(§9.3.6)
已实现:`submitted→review-passed→processing→sent→confirmed`(线性)。**缺失态须扩展**:`review-rejected/address-invalid/tx-failed/tx-orphaned/refunded/frozen`。
提交前守卫:金额≥$20;地址>10 字符;积分门槛 `ceil(usd/10)`;首次需 KYC+地址一致;risk disclosure gate;P5+ compliance hold(>$1,000 进 45d 增强审查)。全 server canonical;劝阻卡不阻止提现。

### 5.6 Staking position(§9.6/§12.6)
已实现:`active/matured/early-withdrawn(终)/claimed(终)`。**目标扩展**:`pending_lock/active/mature_unclaimed/early_withdrawn/claimed/slashed/refunded`。
转移:`active→matured`(unlockTs 到期,4s tick 累息)/ `matured→claimed`/ `active→early-withdrawn`(罚款 5/15/30/50% 本金+forfeit 利息)。资金锁定整期,无手动暂停;APY 浮动但已质押按原利率。

### 5.7 Device 激活/库存(§11.1/§12.2)
`activatedAt: null`(库存)↔`number`(在槽);辅 `pendingDeactivate`。actions:`addDevice`(入库无上限)/`activateDevice`(守卫 `(active+trialReserves?1:0)<MAX_DEVICES=6` 返 bool)/`deactivateDevice`(清遥测+currentTask)/`scheduleDeactivation`(有任务则置 pendingDeactivate,等完成 tick 自动出槽)。取消激活 UI 分支:无任务→confirm;有任务→3 选 sheet(等完成/强制/返回)。

### 5.8 Device 衰减曲线(§6.8,平滑非离散)
按 `getMonthsOwned` 浮点月:月1-3 −4%/月4-8 −6%/月9-12+ **−23.7%**→22% floor(`MIN_EFFICIENCY=0.22`);豁免 phone/cloud-share;client 60s 重算(展示用非权威)。

### 5.9 Phone 任务中断(§12.2)
`status: online|offline`(无 paused)。接单门槛 `pausedReason`(每 tick 算):`no-charger`(!isCharging)/`no-network`(!isWifiConnected,fail-closed)/`null`(正常)。中断宽限子机:进入记 `interruptedAt`,窗口 `INTERRUPT_GRACE_MS=30s`(`INTERRUPT_MAX_RETRIES=5` 每 6s);窗口内恢复→续跑原任务(startedAt 顺延);超时→取消任务派新。server 权威,client 仅 mirror pausedReason 不参与 gating。

### 5.10 Phase 12 月节奏(§13.4,6 phase)
`getPhaseForMonth(getMonthsSince(joinedAt))` 单调推进 P1→P6(`pinned` 可锁);每 phase 派 7 dial(见 §3.F)。server 权威,phase id/name 永不在用户 UI 出现。

### 5.11 Day-One Quest(§5.15,3 phase · **client 可推进**)
`active(0-24h·500NEX)→grace(24-72h·200NEX)→expired(72h+·0,不渲染)`;`{active,grace}→claimed`(全 6 任务,creditNex+badge)。纯函数+zustand persist(引导任务非资金权威);expired 整卡 return null。

### 5.12 其他状态机(精简)
- **Commission**(§12.5):`cooling(30d)→unlocked→withdrawn`。
- **Genesis Holder**(§10.3):按 myOwned 分支(>0 完整态/===0 空态 $0.00 不伪造)。**Genesis Listing**:节点 unlisted↔listed(`listNode/cancelListing`)。
- **Notification**(§11.2,client UI 态):`unread→read`(tap markRead);200 cap LRU。
- **Event**(§11.10):`upcoming→ongoing→ended`;trackable 子机 `(未join)→joined→done→claimed`。
- **KYC-Express**(§4.4):未验证→已验证(付 $1→记地址→walletPaired=true);提现地址须与 KYC 地址一致。
- **校准**(§4.7.3,client):`intro→calibrating(12s)→result`→进 L1。

### 5.13 横切守卫清单
1. server canonical:Trial/Order/Withdrawal/Staking/Device 激活/Commission/Genesis/Phase 一律服务端权威;client 可推进仅 Day-One Quest/Notification UI/Device 衰减展示。
2. 失败/退款态欠缺:Order/Withdrawal/Staking 真后台必须扩展(见各节);仅 FreeTrial 7 态完整。
3. 跨 store mutation 必 rollback+confirmingRef;资金不入余额(salvage/trial shadow);二次确认(trial 购买/取消激活有任务/提现 risk gate)。

## 第 6 章 全局架构 / 技术栈 / i18n / 非功能 / KPI

### 6.1 产品定位 + 用户分级(§1/§2)
分布式 AI 推理算力共享平台(全球非中国市场);核心叙事 "Your phone is the AI cluster. Earn while you sleep."。两套并行分级:
- **用户生命周期 L0-L5**(`profile.tierLabels`,**UI 永不暴露 L\d 编号**):L0 访客/L1 新手/L2 活跃/L3 升级候选/L4 持有者/L5 推广大使。
- **V0-V12 头衔体系**(团队业绩驱动,§8.2),与 L 级并存。

### 6.2 技术栈(§16/§17.1)
| 项 | 选型 |
|---|---|
| 框架 | Next.js 16(App Router,async params) |
| UI | React 19 |
| CSS | Tailwind CSS v4 |
| 状态 | Zustand + persist |
| 动画 | framer-motion(spring)+ CSS keyframes |
| 图标 | lucide-react |
| 类型 | TypeScript strict |

**路由组织**(§17.2):`app/(main)/` = tab 路由+子页统一套 IOSFrame chassis;`/login`、`/register`、`/ref/[code]` 在 `(main)` 外;root `app/layout.tsx`(IOSFrame+4 字体)、`app/globals.css`(design tokens)、`app/components/`(shared)。
**Store**(§17.3):系统 store `lib/store/`(13 个:index/auth/profile/security/wallet-pairing/bills/orders/staking/...)+ 业务 store `lib/v3/`(12 个:v-rank/network/commission/points/staking/genesis/leadership-pool/market/sponsorship/notifications/exchange)+ utility(device-lifecycle、`lib/hooks/`)。
**持久化**(§17.4):用户/sponsor/积分/commission/staking/genesis/通知/locale 经 `zustand/persist`→localStorage。
**渲染**(§17.5):mounted-skeleton(persist-heavy 页 SSR skeleton+client mount 真内容,skeleton 须含 verify.sh 关键文案)。
**应用框架**(§3.1):iOS 414×874 chassis,默认 dark(SSR `<html data-theme="dark">`);5-Tab Home/Earn/Store/Team/Me。

### 6.3 i18n(§14)
语言:`en`/`zh` 完整;`es/fr/de/ja/ko/ar` 占位(fallback en)。实现:`lib/i18n/use-t.ts`(`useT()`)+`format.ts`(`fmt(s,params)`)+`messages/{en,zh}.ts`(各 ~770 keys,30+ namespace)。
namespace 含:tabs/headerTitles(60+ 路由)/headerSubtitles(23)/home/earn/store/team/wallet/onboarding/me/profile/security/staking/trust/genesis/rank/unilevel/binary/pool/commissions/network/daily/marketplace/leaderboard/market/events/learn/kycExpress/tickets/tradein/milestones/productPhase/premium/nexV2Lock/riskDisclosure/missions/weeklyQuest/...。
纪律:en/zh 双语镜像加 key;关键页 i18n 全覆盖无 hardcode;品牌名/token 符号(NEXGRID/USDT/NEX)保留英文;**文案禁 `模拟/mock/demo/演示/simulated/自动扣款`**,试用称"试用收益"(§16.2.5)。

### 6.4 非功能(§15/§16)
- **性能**:LCP<2.5s · 路由 TTI<500ms · 60fps · localStorage<50ms。
- **安全(业务)**:密码 server argon2id+salt(client 永不存);KYC 地址记录后提现须匹配;CAPTCHA 阈值=同号 24h 3+ 次验证码。
- **安全(Web)**:Open-redirect 防御 `lib/routing/safe-return-to.ts`(`safeReturnTo(raw,fallback)` 仅接受 `/...`,所有 returnTo/return/next query 页必用);CSP/X-Frame-Options DENY/nosniff/Referrer-Policy/Permissions-Policy/HSTS 配 `next.config.ts headers()`。
- **安全(Admin/调试)**:`/me/replay-tour` 等生产须 server JWT role check;`useProductPhaseOverride.setPinned()`+dev action(`_devSeedLegacyDevice`/`_devFastForwardAll`)生产 build strip。
- **§9.11 防篡改**:13 条 localStorage 篡改路径统一 server canonical+client UI cache(trial 重置/walletPaired/risk accepted/MAX_DEVICES/OTP/Bills push/ID mint 全 server enforce);Kill-switch 8 项;A/B 值 server-driven(chargeFailRate/unilevel mult/lucky mult/PHASES/NEX 曲线);跨 store mutation 原子+IK;组合攻击路径(养号闭环)须整体防御。

### 6.5 验收 & KPI(§17)
- **功能验收**:`bash scripts/verify.sh all` → 全过;`npx tsc --noEmit` → 0 errors。每路由:HTTP 200+关键文案+主交互可点。
- **KPI**:Day0 自动接入 >95%(注册→90s 首 receipt)· Day7 留存 >60% · L2→L3(进 store)>30% · L3→L4(下单)5-10% · L4→L5(推广)>40% · Nova push CTR >25% · 团队佣金触发率 >80% · Genesis 售罄 <14 天。

### 6.6 路由 → 文件映射(脚手架;路由全集源 §3.3,文件按 §17.2 规则推导 + §19.2 校准;组件未点名处「未定义」=以 `page.tsx` 默认导出为入口)

| 路由 | 文件 / 组件 |
|---|---|
| `/` | `app/(main)/page.tsx` — Home `app/components/home/mission-control.tsx` |
| `/market` | `app/(main)/market/page.tsx`(`lib/mock/tokens.ts`) |
| `/events` | `app/(main)/events/page.tsx`(`lib/mock/events.ts`) |
| `/learn` | `app/(main)/learn/page.tsx`(`lib/mock/learn.ts`) |
| `/earn` | `app/(main)/earn/page.tsx` |
| `/store` · `/store/[productId]` · `/store/checkout` · `/store/bundle` · `/store/orders` · `/store/orders/[id]` | `app/(main)/store/{,[productId]/,checkout/,bundle/,orders/,orders/[id]/}page.tsx` |
| `/tradein` · `/store/tradein` | 路由级 301 → `/me/devices` |
| `/team` · `/team/rank` · `/team/unilevel` · `/team/binary` · `/team/leadership-pool` · `/team/commissions` · `/team/network` · `/team/tree` · `/team/quota` · `/team/agent` · `/team/leaderboard` | `app/(main)/team/{,rank/,unilevel/,binary/,leadership-pool/,commissions/,network/,tree/,quota/,agent/,leaderboard/}page.tsx`(leaderboard:`lib/mock/leaderboard.ts`;rank:`v3/v-badge.tsx`) |
| `/team/{rank,unilevel,binary,leadership-pool,commissions}/how-it-works` | 各 `how-it-works/page.tsx` |
| `/me` · `/me/profile` · `/me/devices` · `/me/security` · `/me/security/kyc-express` | `app/(main)/me/{,profile/,devices/,security/,security/kyc-express/}page.tsx` |
| `/me/wallet` · `/topup` · `/withdraw` · `/withdraw/tracking` · `/exchange` · `/repurchase` · `/bills` · `/cards` · `/cards/new` · `/premium` · `/nex-v2-lock` · `/nex` | `app/(main)/me/wallet/{,topup/,withdraw/,withdraw/tracking/,exchange/,repurchase/,bills/,cards/,cards/new/,premium/,nex-v2-lock/,nex/}page.tsx`(cards/new+risk 用 `safeReturnTo`) |
| `/me/trial` | `app/(main)/me/trial/page.tsx` |
| `/me/receipts` · `/me/proof` · `/me/risk-disclosure` · `/me/achievements` · `/me/goals` · `/me/wrapped` · `/me/preferences` · `/me/notifications` · `/me/language` · `/me/replay-tour` | `app/(main)/me/{receipts,proof,risk-disclosure,achievements,goals,wrapped,preferences,notifications,language,replay-tour}/page.tsx`(replay-tour 需 prod 保护) |
| `/me/help` · `/me/support` · `/me/support/tickets` | `app/(main)/me/{help,support,support/tickets}/page.tsx`(tickets:`lib/mock/tickets.ts`) |
| `/staking` · `/staking/how-it-works` | `app/(main)/staking/{,how-it-works/}page.tsx` |
| `/genesis` · `/genesis/how-it-works` · `/genesis/marketplace` · `/genesis/holder` | `app/(main)/genesis/{,how-it-works/,marketplace/,holder/}page.tsx` |
| `/trust` · `/trust/nex` | `app/(main)/trust/{,nex/}page.tsx` |
| `/daily` · `/globe` · `/developer` · `/missions` · `/search` | `app/(main)/{daily,globe,developer,missions,search}/page.tsx` |
| `/tx/[hash]` | `app/(main)/tx/[hash]/page.tsx`(seeded PRNG) |
| `/ref/[code]` · `/login` · `/register` | `app/{ref/[code],login,register}/page.tsx`(`(main)` 外) |
| `/onboarding/intro` · `/estimator` · `/connect` | `app/(main)/onboarding/{intro,estimator,connect}/page.tsx` |

**全局共享组件/基础设施**(§19.2,非路由):IOSFrame `app/components/ios-frame.tsx` · Header/TabBar `header.tsx`/`tab-bar.tsx` · Nova(代码 stella)`app/components/stella/{drawer,bubble,triggers}.tsx` · V Badge `v3/v-badge.tsx` · Toast/Confirm/NetError `ui/{toast-host,confirm-dialog,net-error-overlay}.tsx` · Skeleton `ui/skeleton.tsx` · Mobile-native `components/mobile/index.ts` · i18n `lib/i18n/messages/{en,zh}.ts`+`{use-t,format}.ts` · Open-redirect `lib/routing/safe-return-to.ts` · 安全头 `next.config.ts headers()` · `scripts/verify.sh` · `scripts/gen-image.ts`。

> 路由数 ~58(§19.1),含 2 条 301 桩;`(main)` 外仅 `/login`、`/register`、`/ref/[code]`。

## 第 7 章 已知冲突 & 开发缺口(落地前必读避坑清单)

> 7 个提炼维度交叉抓出的源 PRD 内部矛盾 + TBD + 未定义,统一收口于此。**开发勿照抄多套数值**,以下列裁决为单一真相源。

### 7.1 源 PRD 内部数值冲突(裁决单源)
| # | 冲突点 | 多套数值 | 裁决(单一真相源) | 出处§ |
|---|---|---|---|---|
| 1 | 设备月 9-12 衰减率 | 正文/floor/前端代码 **−23.7%/月** vs(原)风险披露/12月节奏/后台PRD **−10%/月** | **−23.7%**(唯一落到 22% floor;**✅ 2026-06-05 全源订正** v3.7+12月节奏§3.2/§6.1+后台v2§E4) | §13.3·§6.8 |
| 2 | Staking APY | USDT 锁仓 12/35/80/180% · NEX 池 5/12/20/35% · withdraw 劝阻卡 5/12/20% | **收敛 `GET /api/config/staking/pools`**;USDT 锁仓 4 档为准,劝阻卡第三套 mismatch | §13.3.1 |
| 3 | 签到「+5 积分」 | Day-3 里程碑 +5 vs 连续 7 天 streak bonus +5 | **非冲突,两独立规则**,勿合并 | §9.8.2 vs §13.3 |
| 4 | `chargeFailRate=0.01` | — | mock RNG,生产须 server-side PSP,前端永不可知 | §9.11.4 |

### 7.2 开发缺口(源 PRD TBD / 未给路径,对接前须补)
1. **NEX↔USDT swap 执行 endpoint 缺失**:§9.4 有 swap UI+风控(`/api/config/exchange/caps`+`/api/admin/exchange/pause`)但无用户侧 swap 提交路径 → 须补。
2. **welcome gift 发放 / KYC $1 支付 执行 endpoint 未命名**:以 client store action(`claimGift`/`useWalletPairing`)描述,sponsor 走 `/api/sponsorship/bind`、KYC 状态走 `/api/kyc/status`,但发奖/扣款执行 endpoint 须补。
3. **`(TBD; candidate)` 命名待确认**:`/api/config/tradein`、`/api/devices/{recycle,replace,deactivate}`、`/api/wallet/topup`、`/api/me/earnings(/stream)`、`/api/users/me.cumulativeDepositUsdt`、`/api/users/me/promo-dismissals`、`/api/admin/stella/cadence-config`、`/api/stella/config-invalidate`。
4. **全 endpoint 整体定性「留接口待真实后台对接」**(§9.11a),命名均候选。

### 7.3 未定义类型(开发须补类型)
`CurrentTask`、`CompletedTask`(§12.2)、`QueuedExchange`(§12.10)、`Bill`(仅 `addBill`)、`Withdrawal`(仅 `submitWithdrawal`)、`Achievement`(§12.16)、`Goal`(§11.12.3);**多数业务 store 的 persist key 未明示**(仅 §12.7+ 激励类给出)。

### 7.4 未完整定义规则(对接前须确认)
- **订单过期时窗**(placed→expired):未定义,建议 15-30min(V2 PM 确认)。
- **任务 `avgSec`/`avgReward` 逐类型明细**:仅给公式,数值在 `lib/mock/tasks.ts`,PRD 正文未列表。
- **NEX 价格游走完整模型**(baseline drift/回撤):仅给 `isPump=0.08`/±3%,完整曲线在 `lib/v3/market.ts`。
- **Leadership Pool mid-week 达 V3 按比例计入**:仅文字描述,未给系数。
- **校准跑分→tier→yield baseline 映射**:mock 为 setTimeout(12s),真实算法 TBD(§4.7.3)。

### 7.5 状态机缺失态(真后台必须扩展,§9.11f)
- **Order** +`payment_failed/expired/refunded/chargeback/provisioning_failed`(当前 `cancelled` collapses 所有失败)。
- **Withdrawal** +`review-rejected/address-invalid/tx-failed/tx-orphaned/refunded/frozen`。
- **Staking** 改 status union(+`pending_lock/mature_unclaimed/slashed/refunded`)。
- 仅 **FreeTrial 7 态已完整**。

### 7.6 `cumulativeDepositUsdt` 单写源(防套利铁律,§7.5)
仅 `recordDeposit`(真实充值确认)写;earnings/salvage refund/KYC bonus/quest 奖励均不得触达(trade-in 资格门:Pro ≥$1000 / Rack P1 ≥$5000)。

---

## 附:与源 PRD 的关系 + 维护约定
- **本文件 vs 源 PRD**:本文件是**前端 app 开发落地契约速查**(页面/数据/API/公式/状态机),从 `NexGrid_产品功能架构设计文档_v3.7.md`(18 章 5053 行)提炼;源 PRD 保留为产品背景档案(为什么做、交互细节、视觉)。
- **冲突裁决**:本文件与源 PRD 正文冲突 → 以源 PRD 为准;源 PRD **内部数值自相矛盾**处以第 7 章裁决为单一真相源。
- **维护**:源 PRD 改动 → 同步本文件对应章;新增页/接口/参数 → 对应章追加 + 更新第 1 章 & §6.6。
- **PRD-no-UI**:视觉规格(px/字号/颜色/磨砂配方)归设计 SKILL,不进本文件;源 PRD 中混入的 51 处视觉数值是历史实现细节,前端实现时以设计稿/SKILL 为视觉权威。

